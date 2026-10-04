import Foundation
import UIKit
import CoreLocation
import CoreMotion
import AVFoundation
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(TripRecorderPlugin())
    }
}

private let maxAccuracyM: Double = 25
private let movingMs: Double = 2
private let autoStopIdleS: TimeInterval = 20 * 60
private let afterExitIdleS: TimeInterval = 2 * 60
private let carExitIdleS: TimeInterval = 60
private let manualStopIdleS: TimeInterval = 60 * 60
private let pauseLimitS: TimeInterval = 60 * 60
private let minAutoDistanceM: Double = 500
private let keyCurrent = "trips.current"
private let keyAutoDetect = "trips.autoDetect"
private let keyCarAudioList = "trips.carAudio.list"
private let keyCarAudioId = "trips.carAudio.id"
private let keyCarAudioName = "trips.carAudio.name"
private let carPortTypes: [AVAudioSession.Port] = [.bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .carAudio]

final class TripEngine: NSObject, CLLocationManagerDelegate {
    static let shared = TripEngine()

    private let manager = CLLocationManager()
    private let motion = CMMotionActivityManager()
    private let defaults = UserDefaults.standard
    private var timer: Timer?
    private var authCallbacks: [() -> Void] = []
    private var activityUpdatesRunning = false
    private var carWasConnected = false

    var onUpdate: (([String: Any]) -> Void)?

    private(set) var recording = false
    private var tripId: String?
    private var startedAt: Int64 = 0
    private var distanceM: Double = 0
    private var speedMs: Double = 0
    private var maxSpeedMs: Double = 0
    private var pointCount = 0
    private var isAuto = false
    private var lastLocation: CLLocation?
    private var lastMovingAt = Date()
    private var vehicleExitAt: Date?
    private var exitGraceS: TimeInterval = afterExitIdleS
    private(set) var paused = false
    private var pausedAt: Int64 = 0
    private var pausedMs: Int64 = 0
    private var pauses: [[Int64]] = []

    override init() {
        super.init()
        manager.delegate = self
        manager.activityType = .automotiveNavigation
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5
        manager.pausesLocationUpdatesAutomatically = false
        NotificationCenter.default.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.checkCarAudio()
        }
    }

    private var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let dir = base.appendingPathComponent("trips", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    private func metaURL(_ id: String) -> URL {
        return directory.appendingPathComponent(id + ".json")
    }

    private func pointsURL(_ id: String) -> URL {
        return directory.appendingPathComponent(id + ".csv")
    }

    private func writeMeta(_ id: String, _ meta: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: meta) {
            try? data.write(to: metaURL(id), options: .atomic)
        }
    }

    func readMeta(_ id: String) -> [String: Any]? {
        guard let data = try? Data(contentsOf: metaURL(id)) else {
            return nil
        }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    func readPoints(_ id: String) -> [[Double]] {
        guard let text = try? String(contentsOf: pointsURL(id), encoding: .utf8) else {
            return []
        }
        var points: [[Double]] = []
        for line in text.split(separator: "\n") {
            let parts = line.split(separator: ",").compactMap { Double($0) }
            if parts.count == 8 {
                points.append(parts)
            }
        }
        return points
    }

    func listFinished() -> [[String: Any]] {
        let files = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? []
        var trips: [[String: Any]] = []
        for file in files where file.pathExtension == "json" {
            let id = file.deletingPathExtension().lastPathComponent
            if let meta = readMeta(id), (meta["finished"] as? Bool) == true {
                trips.append(meta)
            }
        }
        trips.sort { (($0["startedAt"] as? Double) ?? 0) < (($1["startedAt"] as? Double) ?? 0) }
        return trips
    }

    func deleteTrip(_ id: String) {
        if id == defaults.string(forKey: keyCurrent) {
            return
        }
        try? FileManager.default.removeItem(at: metaURL(id))
        try? FileManager.default.removeItem(at: pointsURL(id))
    }

    var autoDetectEnabled: Bool {
        return defaults.bool(forKey: keyAutoDetect)
    }

    private var authorization: CLAuthorizationStatus {
        return manager.authorizationStatus
    }

    func permissions() -> [String: Any] {
        let status = authorization
        let location = status == .authorizedWhenInUse || status == .authorizedAlways
        return [
            "location": location,
            "background": status == .authorizedAlways,
            "activity": CMMotionActivityManager.isActivityAvailable() && CMMotionActivityManager.authorizationStatus() == .authorized,
            "notifications": true,
            "bluetooth": true,
            "unrestrictedBattery": true
        ]
    }

    func requestForeground(_ done: @escaping () -> Void) {
        if authorization == .notDetermined {
            authCallbacks.append(done)
            manager.requestWhenInUseAuthorization()
        } else {
            done()
        }
    }

    func requestBackground(_ done: @escaping () -> Void) {
        let status = authorization
        if status == .authorizedWhenInUse || status == .notDetermined {
            authCallbacks.append(done)
            manager.requestAlwaysAuthorization()
            DispatchQueue.main.asyncAfter(deadline: .now() + 20) { [weak self] in
                self?.flushAuthCallbacks()
            }
        } else {
            done()
        }
    }

    func requestActivity(_ done: @escaping () -> Void) {
        guard CMMotionActivityManager.isActivityAvailable() else {
            done()
            return
        }
        if CMMotionActivityManager.authorizationStatus() != .notDetermined {
            done()
            return
        }
        motion.queryActivityStarting(from: Date().addingTimeInterval(-60), to: Date(), to: .main) { _, _ in
            done()
        }
    }

    private func flushAuthCallbacks() {
        let callbacks = authCallbacks
        authCallbacks = []
        for callback in callbacks {
            callback()
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        flushAuthCallbacks()
    }

    func snapshot() -> [String: Any] {
        if !recording {
            return ["recording": false]
        }
        return [
            "recording": true,
            "tripId": tripId ?? "",
            "startedAt": startedAt,
            "distanceM": distanceM,
            "speedMs": speedMs,
            "maxSpeedMs": maxSpeedMs,
            "points": pointCount,
            "auto": isAuto,
            "paused": paused,
            "pausedAt": pausedAt,
            "pausedMs": pausedMs
        ]
    }

    private func nowMs() -> Int64 {
        return Int64(Date().timeIntervalSince1970 * 1000)
    }

    private func savePauseState() {
        guard let id = tripId, var meta = readMeta(id) else {
            return
        }
        meta["pauses"] = pauses
        meta["pausedAt"] = paused ? pausedAt : 0
        writeMeta(id, meta)
    }

    func pause() {
        guard recording, !paused else {
            return
        }
        paused = true
        pausedAt = nowMs()
        speedMs = 0
        vehicleExitAt = nil
        savePauseState()
        publish()
    }

    func resume() {
        guard recording, paused else {
            return
        }
        closePause(nowMs())
        lastLocation = nil
        lastMovingAt = Date()
        vehicleExitAt = nil
        savePauseState()
        publish()
    }

    private func closePause(_ now: Int64) {
        guard paused else {
            return
        }
        pauses.append([pausedAt, now])
        pausedMs += now - pausedAt
        paused = false
        pausedAt = 0
    }

    private func publish() {
        onUpdate?(snapshot())
    }

    func start(auto: Bool, vehicleId: String?) -> Bool {
        if recording {
            return true
        }
        let status = authorization
        if status != .authorizedWhenInUse && status != .authorizedAlways {
            return false
        }
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let id = String(now) + "-" + String(UUID().uuidString.prefix(8)).lowercased()
        var meta: [String: Any] = ["id": id, "startedAt": now, "auto": auto, "finished": false]
        if let vehicleId = vehicleId {
            meta["vehicleId"] = vehicleId
        }
        writeMeta(id, meta)
        FileManager.default.createFile(atPath: pointsURL(id).path, contents: nil)
        defaults.set(id, forKey: keyCurrent)
        begin(id: id, startedAt: now, auto: auto, distance: 0, points: 0)
        return true
    }

    private func begin(id: String, startedAt: Int64, auto: Bool, distance: Double, points: Int) {
        tripId = id
        self.startedAt = startedAt
        isAuto = auto
        distanceM = distance
        pointCount = points
        speedMs = 0
        maxSpeedMs = 0
        lastLocation = nil
        lastMovingAt = Date()
        vehicleExitAt = nil
        paused = false
        pausedAt = 0
        pausedMs = 0
        pauses = []
        recording = true
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = true
        manager.startUpdatingLocation()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { [weak self] _ in
            self?.checkIdle()
        }
        publish()
    }

    func stop(discard: Bool = false) {
        guard recording, let id = tripId else {
            return
        }
        closePause(nowMs())
        recording = false
        timer?.invalidate()
        timer = nil
        manager.stopUpdatingLocation()
        manager.allowsBackgroundLocationUpdates = false
        manager.showsBackgroundLocationIndicator = false
        defaults.removeObject(forKey: keyCurrent)
        let tooShort = isAuto && distanceM < minAutoDistanceM
        if discard || tooShort {
            try? FileManager.default.removeItem(at: metaURL(id))
            try? FileManager.default.removeItem(at: pointsURL(id))
        } else if var meta = readMeta(id) {
            meta["endedAt"] = Int64(Date().timeIntervalSince1970 * 1000)
            meta["finished"] = true
            meta["distanceM"] = distanceM
            meta["pauses"] = pauses
            meta["pausedAt"] = 0
            writeMeta(id, meta)
        }
        tripId = nil
        publish()
    }

    private func checkIdle() {
        guard recording else {
            return
        }
        let now = Date()
        if paused {
            if Double(nowMs() - pausedAt) / 1000 > pauseLimitS {
                stop()
            }
            return
        }
        let idle = now.timeIntervalSince(lastMovingAt)
        if isAuto {
            if idle > autoStopIdleS {
                stop()
                return
            }
            if let exit = vehicleExitAt, now.timeIntervalSince(max(exit, lastMovingAt)) > exitGraceS {
                stop()
            }
            return
        }
        if idle > manualStopIdleS {
            stop()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        if !recording {
            if autoDetectEnabled {
                considerAutoStart()
            }
            checkCarAudio()
            return
        }
        guard let id = tripId, !paused else {
            return
        }
        var lines = ""
        for location in locations {
            if location.horizontalAccuracy < 0 || location.horizontalAccuracy > maxAccuracyM {
                continue
            }
            if let last = lastLocation {
                let delta = location.distance(from: last)
                if delta >= 3 {
                    distanceM += delta
                }
            }
            lastLocation = location
            var speed = -1.0
            if location.speed >= 0 {
                speed = location.speed
                speedMs = speed
                maxSpeedMs = max(maxSpeedMs, speed)
                if speed >= movingMs {
                    lastMovingAt = Date()
                    vehicleExitAt = nil
                }
            }
            var bearing = -1.0
            if location.course >= 0 {
                bearing = location.course
            }
            var speedAccuracy = -1.0
            if location.speedAccuracy >= 0 {
                speedAccuracy = location.speedAccuracy
            }
            lines += String(format: "%lld,%.7f,%.7f,%.1f,%.2f,%.2f,%.1f,%.1f\n",
                            Int64(location.timestamp.timeIntervalSince1970 * 1000),
                            location.coordinate.latitude, location.coordinate.longitude,
                            location.horizontalAccuracy, speed, speedAccuracy, bearing, location.altitude)
            pointCount += 1
        }
        if !lines.isEmpty, let data = lines.data(using: .utf8), let handle = try? FileHandle(forWritingTo: pointsURL(id)) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        }
        publish()
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
    }

    func setAutoDetect(_ enabled: Bool) {
        defaults.set(enabled, forKey: keyAutoDetect)
        if enabled {
            startMonitoring()
            considerAutoStart()
        } else {
            stopMonitoring()
        }
    }

    func autoDetectPermissionsOk() -> Bool {
        return authorization == .authorizedAlways && CMMotionActivityManager.isActivityAvailable() && CMMotionActivityManager.authorizationStatus() == .authorized
    }

    private func startMonitoring() {
        manager.startMonitoringSignificantLocationChanges()
        guard CMMotionActivityManager.isActivityAvailable(), !activityUpdatesRunning else {
            return
        }
        activityUpdatesRunning = true
        motion.startActivityUpdates(to: .main) { [weak self] activity in
            if let activity = activity {
                self?.handle(activity: activity)
            }
        }
    }

    private func stopMonitoring() {
        if carAudioList.isEmpty {
            manager.stopMonitoringSignificantLocationChanges()
        }
        if activityUpdatesRunning {
            motion.stopActivityUpdates()
            activityUpdatesRunning = false
        }
    }

    private func handle(activity: CMMotionActivity) {
        if activity.automotive && activity.confidence != .low {
            vehicleExitAt = nil
            if !recording && autoDetectEnabled {
                _ = start(auto: true, vehicleId: nil)
            }
            return
        }
        if recording && isAuto && !paused && activity.confidence != .low && (activity.walking || activity.running || activity.cycling) {
            if vehicleExitAt == nil {
                vehicleExitAt = Date()
                exitGraceS = afterExitIdleS
            }
        }
    }

    private func considerAutoStart() {
        guard CMMotionActivityManager.isActivityAvailable(), authorization == .authorizedAlways else {
            return
        }
        motion.queryActivityStarting(from: Date().addingTimeInterval(-180), to: Date(), to: .main) { [weak self] activities, _ in
            guard let self = self, !self.recording, self.autoDetectEnabled else {
                return
            }
            let driving = (activities ?? []).contains { $0.automotive && $0.confidence != .low }
            if driving {
                _ = self.start(auto: true, vehicleId: nil)
            }
        }
    }

    func resumeAtLaunch() {
        if let id = defaults.string(forKey: keyCurrent), let meta = readMeta(id) {
            let points = readPoints(id)
            var distance = 0.0
            var previous: CLLocation?
            for row in points {
                let current = CLLocation(latitude: row[1], longitude: row[2])
                if let previous = previous {
                    let delta = current.distance(from: previous)
                    if delta >= 3 {
                        distance += delta
                    }
                }
                previous = current
            }
            let started = (meta["startedAt"] as? Int64) ?? Int64((meta["startedAt"] as? Double) ?? 0)
            begin(id: id, startedAt: started, auto: (meta["auto"] as? Bool) ?? false, distance: distance, points: points.count)
            if let saved = meta["pauses"] as? [[NSNumber]] {
                pauses = saved.compactMap { pair in pair.count == 2 ? [pair[0].int64Value, pair[1].int64Value] : nil }
                pausedMs = pauses.reduce(0) { $0 + ($1[1] - $1[0]) }
            }
            if let at = (meta["pausedAt"] as? NSNumber)?.int64Value, at > 0 {
                paused = true
                pausedAt = at
            }
        }
        if autoDetectEnabled {
            startMonitoring()
        }
        if !carAudioList.isEmpty {
            manager.startMonitoringSignificantLocationChanges()
            checkCarAudio()
        }
    }

    // iOS no avisa a apps de terceros de las conexiones Bluetooth con la app cerrada.
    // Se mira la salida de audio (Bluetooth del coche o CarPlay) cada vez que la app
    // está despierta: abierta, al cambiar la salida o al despertar por ubicación.
    // Coches elegidos por el usuario: [["address": uid, "name": nombre]].
    var carAudioList: [[String: String]] {
        if let list = defaults.array(forKey: keyCarAudioList) as? [[String: String]] {
            return list
        }
        // Viene de la versión con un solo coche.
        let id = defaults.string(forKey: keyCarAudioId) ?? ""
        if id.isEmpty {
            return []
        }
        return [["address": id, "name": defaults.string(forKey: keyCarAudioName) ?? ""]]
    }

    func carOutputs() -> [[String: Any]] {
        return AVAudioSession.sharedInstance().currentRoute.outputs
            .filter { carPortTypes.contains($0.portType) }
            .map { ["address": $0.uid, "name": $0.portName, "car": $0.portType == .carAudio] }
    }

    func addCarAudio(id: String, name: String) {
        var list = carAudioList
        if id.isEmpty || list.contains(where: { $0["address"] == id }) {
            return
        }
        list.append(["address": id, "name": name])
        saveCarAudio(list)
    }

    func removeCarAudio(id: String) {
        saveCarAudio(carAudioList.filter { $0["address"] != id })
    }

    private func saveCarAudio(_ list: [[String: String]]) {
        defaults.set(list, forKey: keyCarAudioList)
        defaults.removeObject(forKey: keyCarAudioId)
        defaults.removeObject(forKey: keyCarAudioName)
        carWasConnected = false
        if list.isEmpty {
            if !autoDetectEnabled {
                manager.stopMonitoringSignificantLocationChanges()
            }
            return
        }
        if authorization == .authorizedAlways {
            manager.startMonitoringSignificantLocationChanges()
        }
        checkCarAudio()
    }

    private func checkCarAudio() {
        let ids = carAudioList.compactMap { $0["address"] }
        if ids.isEmpty {
            return
        }
        let connected = carOutputs().contains { ids.contains(($0["address"] as? String) ?? "") }
        if connected {
            let justConnected = !carWasConnected
            carWasConnected = true
            if !justConnected {
                return
            }
            if recording {
                resume()
                vehicleExitAt = nil
            } else {
                _ = start(auto: true, vehicleId: nil)
            }
            return
        }
        if carWasConnected && recording && !paused && vehicleExitAt == nil {
            vehicleExitAt = Date()
            exitGraceS = carExitIdleS
        }
        carWasConnected = false
    }
}

@objc(TripRecorderPlugin)
public class TripRecorderPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TripRecorderPlugin"
    public let jsName = "TripRecorder"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "resume", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listTrips", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAutoDetect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestForeground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBackground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBatterySettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBluetooth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "bluetoothDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "addBluetoothDevice", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeBluetoothDevice", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        TripEngine.shared.onUpdate = { [weak self] snapshot in
            self?.notifyListeners("tripUpdate", data: snapshot)
        }
    }

    deinit {
        TripEngine.shared.onUpdate = nil
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let engine = TripEngine.shared
            call.resolve([
                "trip": engine.snapshot(),
                "recording": engine.recording,
                "autoDetect": engine.autoDetectEnabled,
                "permissions": engine.permissions(),
                "bluetooth": ["devices": engine.carAudioList],
                "sdk": 0
            ])
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        let vehicleId = call.getString("vehicleId")
        DispatchQueue.main.async {
            if TripEngine.shared.start(auto: false, vehicleId: vehicleId) {
                call.resolve()
            } else {
                call.reject("Falta el permiso de ubicación", "permissions")
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripEngine.shared.stop()
            call.resolve()
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripEngine.shared.pause()
            call.resolve()
        }
    }

    @objc func resume(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripEngine.shared.resume()
            call.resolve()
        }
    }

    @objc func listTrips(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["trips": TripEngine.shared.listFinished()])
        }
    }

    @objc func readTrip(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("Falta el id del viaje")
            return
        }
        DispatchQueue.main.async {
            guard let meta = TripEngine.shared.readMeta(id) else {
                call.reject("No se pudo leer el viaje")
                return
            }
            call.resolve(["meta": meta, "points": TripEngine.shared.readPoints(id)])
        }
    }

    @objc func deleteTrip(_ call: CAPPluginCall) {
        let id = call.getString("id")
        DispatchQueue.main.async {
            if let id = id {
                TripEngine.shared.deleteTrip(id)
            }
            call.resolve()
        }
    }

    @objc func setAutoDetect(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled", false)
        DispatchQueue.main.async {
            let engine = TripEngine.shared
            if enabled && !engine.autoDetectPermissionsOk() {
                call.reject("Faltan permisos: ubicación siempre y movimiento y fitness", "permissions")
                return
            }
            engine.setAutoDetect(enabled)
            call.resolve()
        }
    }

    @objc func requestForeground(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripEngine.shared.requestForeground {
                call.resolve(TripEngine.shared.permissions())
            }
        }
    }

    @objc func requestActivity(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripEngine.shared.requestActivity {
                call.resolve(TripEngine.shared.permissions())
            }
        }
    }

    @objc func requestBackground(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            TripEngine.shared.requestBackground {
                call.resolve(TripEngine.shared.permissions())
            }
        }
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if let url = URL(string: UIApplication.openSettingsURLString) {
                UIApplication.shared.open(url)
            }
            call.resolve()
        }
    }

    @objc func openBatterySettings(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func requestBluetooth(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(TripEngine.shared.permissions())
        }
    }

    @objc func bluetoothDevices(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(["devices": TripEngine.shared.carOutputs()])
        }
    }

    @objc func addBluetoothDevice(_ call: CAPPluginCall) {
        let id = call.getString("address") ?? ""
        let name = call.getString("name") ?? ""
        DispatchQueue.main.async {
            TripEngine.shared.addCarAudio(id: id, name: name)
            call.resolve()
        }
    }

    @objc func removeBluetoothDevice(_ call: CAPPluginCall) {
        let id = call.getString("address") ?? ""
        DispatchQueue.main.async {
            TripEngine.shared.removeCarAudio(id: id)
            call.resolve()
        }
    }
}
