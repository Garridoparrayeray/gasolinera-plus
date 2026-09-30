import Foundation
import UIKit
import CoreLocation
import CoreMotion
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
private let manualStopIdleS: TimeInterval = 60 * 60
private let minAutoDistanceM: Double = 500
private let keyCurrent = "trips.current"
private let keyAutoDetect = "trips.autoDetect"

final class TripEngine: NSObject, CLLocationManagerDelegate {
    static let shared = TripEngine()

    private let manager = CLLocationManager()
    private let motion = CMMotionActivityManager()
    private let defaults = UserDefaults.standard
    private var timer: Timer?
    private var authCallbacks: [() -> Void] = []
    private var activityUpdatesRunning = false

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

    override init() {
        super.init()
        manager.delegate = self
        manager.activityType = .automotiveNavigation
        manager.desiredAccuracy = kCLLocationAccuracyBest
        manager.distanceFilter = 5
        manager.pausesLocationUpdatesAutomatically = false
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
            "auto": isAuto
        ]
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
        let idle = now.timeIntervalSince(lastMovingAt)
        if isAuto {
            if idle > autoStopIdleS {
                stop()
                return
            }
            if let exit = vehicleExitAt, now.timeIntervalSince(max(exit, lastMovingAt)) > afterExitIdleS {
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
            return
        }
        guard let id = tripId else {
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
        manager.stopMonitoringSignificantLocationChanges()
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
        if recording && isAuto && activity.confidence != .low && (activity.walking || activity.running || activity.cycling) {
            if vehicleExitAt == nil {
                vehicleExitAt = Date()
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
        }
        if autoDetectEnabled {
            startMonitoring()
        }
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
        CAPPluginMethod(name: "listTrips", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteTrip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAutoDetect", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestForeground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestActivity", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestBackground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openBatterySettings", returnType: CAPPluginReturnPromise)
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
}
