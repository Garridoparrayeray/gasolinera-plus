const GPTrips = (() => {
    const $ = (id) => document.getElementById(id);
    const el = {
        card: $('garage-trips-card'),
        live: $('trip-live'),
        liveDistance: $('trip-live-distance'),
        liveSpeed: $('trip-live-speed'),
        liveTime: $('trip-live-time'),
        liveMax: $('trip-live-max'),
        start: $('trip-start'),
        stop: $('trip-stop'),
        pause: $('trip-pause'),
        note: $('trip-note'),
        autoWrap: $('trip-auto-wrap'),
        auto: $('trip-auto'),
        btWrap: $('trip-bt-wrap'),
        bt: $('trip-bt'),
        btPicker: $('trip-bt-picker'),
        btDevice: $('trip-bt-device'),
        btAdd: $('trip-bt-add'),
        btCars: $('trip-bt-cars'),
        btHelp: $('trip-bt-help'),
        permissions: $('trip-permissions'),
        permissionsText: $('trip-permissions-text'),
        permissionsFix: $('trip-permissions-fix'),
        battery: $('trip-battery'),
        list: $('trip-list'),
        historyOpen: $('trip-history-open'),
        empty: $('trip-empty'),
        dialog: $('trip-dialog'),
        dialogClose: $('trip-dialog-close'),
        dialogTitle: $('trip-dialog-title'),
        dialogSubtitle: $('trip-dialog-subtitle'),
        map: $('trip-map'),
        metrics: $('trip-metrics'),
        speedChart: $('trip-speed-chart'),
        bandsChart: $('trip-bands-chart'),
        quality: $('trip-quality'),
        remove: $('trip-delete'),
        drive: $('trip-drive'),
        driveSpeed: $('trip-drive-speed'),
        driveBarFill: $('trip-drive-bar-fill'),
        driveDistance: $('trip-drive-distance'),
        driveTime: $('trip-drive-time'),
        driveMax: $('trip-drive-max'),
        driveHint: $('trip-drive-hint'),
        driveStop: $('trip-drive-stop'),
        drivePause: $('trip-drive-pause'),
        driveLabel: $('trip-drive-label'),
        driveMin: $('trip-drive-min'),
        chip: $('trip-rec-chip'),
        chipText: $('trip-rec-chip-text'),
        summary: $('trip-summary'),
        summaryTitle: $('trip-summary-title'),
        summaryTiles: $('trip-summary-tiles'),
        summaryCarsWrap: $('trip-summary-cars-wrap'),
        summaryCars: $('trip-summary-cars'),
        summaryClose: $('trip-summary-close'),
    };

    const SPEED_WARN_KMH = 100;
    const SPEED_OVER_KMH = 120;
    const SPEED_BAR_MAX_KMH = 160;
    const MIN_REFERENCE_TRIPS = 3;
    const MIN_REFERENCE_KM = 30;

    const WEB_TRIP_KEY = 'webTripInProgress';
    const BT_HELP = {
        android: 'Empareja antes el móvil con el coche en los ajustes de Bluetooth. Necesita la ubicación "Permitir todo el tiempo" y quitar el ahorro de batería para Gasolinera+. Puedes añadir más de un coche y quitarlos cuando quieras. Un minuto después de desconectarte, si ya no te mueves, el viaje termina solo. Si lo habías pausado, se reanuda al volver a conectarte.',
        ios: 'Conéctate al Bluetooth del coche o a CarPlay y añádelo aquí; puedes tener varios y quitarlos cuando quieras. En iPhone se nota al abrir la app o cuando la detección automática la despierta, así que conviene tenerla activada. Necesita la ubicación "Siempre". El viaje termina un minuto después de desconectarte.',
    };
    const BATTERY_HINT = 'Para que los viajes se graben con la app cerrada, desactiva el ahorro de batería para Gasolinera+ en los ajustes del móvil.';
    const BT_NO_PERMISSION = 'Falta el permiso «Dispositivos cercanos» para ver los Bluetooth. Actívalo en Ajustes del móvil → Aplicaciones → Gasolinera+ → Permisos y vuelve aquí.';
    const BT_EMPTY = {
        android: 'No hay dispositivos Bluetooth emparejados. Empareja tu coche en los ajustes de Bluetooth del móvil y vuelve aquí.',
        ios: 'No hay ningún coche conectado. Conéctate al Bluetooth del coche o a CarPlay y vuelve a abrir esta opción.',
    };
    const state = {
        live: null,
        timer: null,
        web: null,
        importing: false,
        map: null,
        mapLayer: null,
        charts: {},
        openTrip: null,
        driveMinimized: false,
    };

    function recorder() {
        return GPNative.plugin('TripRecorder');
    }

    function number(value, digits) {
        return value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function clock(seconds) {
        const total = Math.max(0, Math.round(seconds));
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = (v) => String(v).padStart(2, '0');
        if (h > 0) {
            return `${h}:${pad(m)}:${pad(s)}`;
        }
        return `${m}:${pad(s)}`;
    }

    function minutesText(seconds) {
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) {
            return `${minutes} min`;
        }
        return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    }

    function note(text) {
        el.note.textContent = text;
    }

    function speedLevel(kmh) {
        if (kmh >= SPEED_OVER_KMH) {
            return 'over';
        }
        if (kmh >= SPEED_WARN_KMH) {
            return 'warn';
        }
        return 'ok';
    }

    function driveHintText() {
        if (recorder()) {
            return 'Puedes bloquear el móvil: el viaje sigue grabándose.';
        }
        return 'Deja la pantalla encendida: si la bloqueas se pausa la grabación.';
    }

    function elapsedSeconds(live) {
        const now = Date.now();
        let paused = live.pausedMs || 0;
        if (live.paused && live.pausedAt) {
            paused += now - live.pausedAt;
        }
        return Math.max(0, (now - live.startedAt - paused) / 1000);
    }

    function averageKmh(live) {
        const seconds = elapsedSeconds(live);
        if (seconds <= 0) {
            return 0;
        }
        return (live.distanceM / seconds) * 3.6;
    }

    function paintPause(live) {
        const paused = Boolean(live.paused);
        el.drive.dataset.paused = String(paused);
        el.driveLabel.textContent = 'GRABANDO';
        el.chipText.textContent = 'EN CURSO';
        el.drivePause.textContent = 'Pausar';
        el.pause.textContent = 'Pausar';
        if (paused) {
            el.driveLabel.textContent = 'EN PAUSA';
            el.chipText.textContent = 'EN PAUSA';
            el.drivePause.textContent = 'Reanudar';
            el.pause.textContent = 'Reanudar';
        }
        el.pause.setAttribute('aria-pressed', String(paused));
        el.drivePause.setAttribute('aria-pressed', String(paused));
    }

    function paintDrive(live) {
        let kmh = live.speedMs * 3.6;
        if (live.paused) {
            kmh = 0;
        }
        el.drive.dataset.level = speedLevel(kmh);
        el.driveSpeed.textContent = number(kmh, 0);
        el.driveBarFill.style.width = `${Math.min(100, (kmh / SPEED_BAR_MAX_KMH) * 100)}%`;
        el.driveDistance.textContent = number(live.distanceM / 1000, 1);
        el.driveMax.textContent = number(averageKmh(live), 0);
        el.driveTime.textContent = clock(elapsedSeconds(live));
    }

    function paintLiveCard(live) {
        el.liveDistance.textContent = `${number(live.distanceM / 1000, 1)} km`;
        let kmh = live.speedMs * 3.6;
        if (live.paused) {
            kmh = 0;
        }
        el.liveSpeed.textContent = `${number(kmh, 0)} km/h`;
        el.liveMax.textContent = `${number(averageKmh(live), 0)} km/h`;
        el.liveTime.textContent = clock(elapsedSeconds(live));
    }

    function showDrive(recording) {
        const visible = recording && !state.driveMinimized;
        el.drive.hidden = !visible;
        el.chip.hidden = !(recording && state.driveMinimized);
        document.documentElement.classList.toggle('is-driving', visible);
    }

    function renderLive() {
        const live = state.live;
        const recording = Boolean(live && live.recording);
        el.live.hidden = !recording;
        el.start.hidden = recording;
        el.stop.hidden = !recording;
        el.pause.hidden = !recording;
        showDrive(recording);
        clearInterval(state.timer);
        state.timer = null;
        if (!recording) {
            return;
        }
        el.driveHint.textContent = driveHintText();
        const paint = () => {
            paintLiveCard(live);
            paintDrive(live);
            paintPause(live);
        };
        paint();
        state.timer = setInterval(paint, 1000);
    }

    function minimizeDrive(minimized) {
        state.driveMinimized = minimized;
        renderLive();
    }

    async function referenceFactorFor(vehicleId) {
        if (!vehicleId) {
            return null;
        }
        let km = 0;
        let weighted = 0;
        let count = 0;
        for (const trip of await GarageStore.trips.forVehicle(vehicleId)) {
            const m = trip.metrics;
            if (m && m.speedFactor > 0 && m.distanceKm > 0) {
                km += m.distanceKm;
                weighted += m.speedFactor * m.distanceKm;
                count++;
            }
        }
        if (count < MIN_REFERENCE_TRIPS || km < MIN_REFERENCE_KM) {
            return null;
        }
        return weighted / km;
    }

    function vehicleOptions(referenceFactor) {
        const summary = GPGarage.summary();
        const options = {};
        if (referenceFactor > 0) {
            options.referenceFactor = referenceFactor;
        }
        if (summary) {
            options.consumption = summary.avgConsumption;
            if (summary.lastRefuel) {
                options.pricePerUnit = summary.lastRefuel.pricePerUnit;
            }
        }
        return options;
    }

    async function saveTrip(points, info) {
        let vehicleId = info.vehicleId || null;
        const active = GPGarage.activeVehicle();
        if (!vehicleId && active) {
            vehicleId = active.id;
        }
        const pauses = cleanPauses(info.pauses);
        const metrics = GPTripMetrics.compute(points, { ...vehicleOptions(await referenceFactorFor(vehicleId)), pauses });
        if (info.auto && metrics.distanceKm < 0.5) {
            return null;
        }
        const now = new Date().toISOString();
        let startedAt = now;
        let endedAt = now;
        if (metrics.startedAt) {
            startedAt = new Date(metrics.startedAt).toISOString();
            endedAt = new Date(metrics.endedAt).toISOString();
        }
        const trip = {
            id: info.id,
            vehicleId,
            auto: Boolean(info.auto),
            startedAt,
            endedAt,
            metrics,
            track: GPTripMetrics.thin(points, pauses),
            createdAt: now,
        };
        if (pauses.length) {
            trip.pauses = pauses;
        }
        await GarageStore.trips.save(trip);
        await shiftOdometer(vehicleId, metrics.distanceKm);
        return trip;
    }

    function cleanPauses(raw) {
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw
            .filter((p) => Array.isArray(p) && p.length === 2 && Number(p[1]) > Number(p[0]))
            .map((p) => [Number(p[0]), Number(p[1])]);
    }

    function pointsFromNative(rows) {
        return rows.map((row) => {
            let speed = null;
            if (row[4] >= 0) {
                speed = row[4];
            }
            return { t: row[0], lat: row[1], lon: row[2], acc: row[3], speed };
        });
    }

    async function importPending() {
        const plugin = recorder();
        if (!plugin || state.importing) {
            return 0;
        }
        state.importing = true;
        let imported = 0;
        let lastSaved = null;
        try {
            const { trips } = await plugin.listTrips();
            for (const meta of trips) {
                const data = await plugin.readTrip({ id: meta.id });
                const saved = await saveTrip(pointsFromNative(data.points), { id: meta.id, auto: meta.auto, vehicleId: meta.vehicleId, pauses: meta.pauses });
                await plugin.deleteTrip({ id: meta.id });
                if (saved) {
                    imported++;
                    lastSaved = saved;
                }
            }
        } finally {
            state.importing = false;
        }
        if (imported) {
            await GPGarage.refresh();
            GP.showToast(`${imported} viaje(s) guardado(s)`);
            await openSummary(lastSaved);
        }
        await renderList();
        return imported;
    }

    async function refreshStatus() {
        const plugin = recorder();
        if (!plugin) {
            return;
        }
        const status = await plugin.status();
        state.live = status.trip;
        state.live.recording = status.recording;
        el.auto.checked = status.autoDetect;
        renderLive();
        renderPermissions(status);
        await renderBluetooth(status);
    }

    function renderPermissions(status) {
        el.autoWrap.hidden = false;
        const perms = status.permissions;
        const problems = [];
        if (status.autoDetect && (!perms.background || !perms.activity)) {
            problems.push('La detección automática necesita la ubicación "Permitir todo el tiempo" y el permiso de actividad física.');
        }
        if (!perms.notifications) {
            problems.push('Sin permiso de notificaciones no verás el aviso mientras se graba.');
        }
        // Android solo informa del ajuste estándar y muchos móviles tienen el suyo: no se afirma nada del estado.
        const bluetooth = status.bluetooth || {};
        const needsBattery = status.autoDetect || status.recording || (bluetooth.devices || []).length > 0;
        if (needsBattery) {
            problems.push(BATTERY_HINT);
        }
        el.permissions.hidden = problems.length === 0;
        el.permissionsText.textContent = problems.join(' ');
        el.battery.hidden = !needsBattery;
    }

    async function start() {
        state.driveMinimized = false;
        const plugin = recorder();
        if (plugin) {
            let perms = (await plugin.status()).permissions;
            if (!perms.location || !perms.notifications) {
                perms = await plugin.requestForeground();
            }
            if (!perms.location) {
                note('Sin permiso de ubicación no se puede grabar el viaje.');
                return;
            }
            const vehicle = GPGarage.activeVehicle();
            let vehicleId = null;
            if (vehicle) {
                vehicleId = vehicle.id;
            }
            await plugin.start({ vehicleId });
            state.live = { recording: true, startedAt: Date.now(), distanceM: 0, speedMs: 0, maxSpeedMs: 0, paused: false, pausedMs: 0, pausedAt: 0 };
            note('Grabando. Puedes bloquear el móvil: el viaje sigue grabándose.');
            renderLive();
            return;
        }
        await startWeb();
    }

    async function stop() {
        const plugin = recorder();
        if (plugin) {
            await plugin.stop();
            state.live = null;
            renderLive();
            note('Guardando el viaje…');
            setTimeout(async () => {
                await importPending();
                note('');
            }, 1200);
            return;
        }
        await stopWeb();
    }

    async function togglePause() {
        const live = state.live;
        if (!live || !live.recording) {
            return;
        }
        const plugin = recorder();
        const now = Date.now();
        if (live.paused) {
            if (plugin) {
                await plugin.resume();
            } else if (state.web) {
                state.web.pauses.push([live.pausedAt, now]);
                state.web.skipNext = true;
                saveWebProgress();
            }
            live.pausedMs = (live.pausedMs || 0) + (now - live.pausedAt);
            live.paused = false;
            live.pausedAt = 0;
            note('Viaje reanudado.');
        } else {
            if (plugin) {
                await plugin.pause();
            }
            live.paused = true;
            live.pausedAt = now;
            live.speedMs = 0;
            if (state.web) {
                saveWebProgress();
            }
            note('Viaje en pausa: el tiempo y los kilómetros no cuentan hasta que lo reanudes.');
        }
        renderLive();
    }

    function saveWebProgress() {
        const web = state.web;
        if (!web) {
            return;
        }
        const pauses = [...web.pauses];
        if (state.live && state.live.paused) {
            pauses.push([state.live.pausedAt, Date.now()]);
        }
        GarageStore.saveSetting(WEB_TRIP_KEY, { id: web.id, points: web.points, pauses }).catch(() => {});
    }

    async function requestWakeLock() {
        if (!state.web || !('wakeLock' in navigator)) {
            return;
        }
        try {
            state.web.wakeLock = await navigator.wakeLock.request('screen');
        } catch (e) {
            state.web.wakeLock = null;
        }
    }

    function onVisibility() {
        if (state.web && document.visibilityState === 'visible') {
            requestWakeLock();
        }
    }

    function onWebPosition(position) {
        const web = state.web;
        if (!web || (state.live && state.live.paused)) {
            return;
        }
        const c = position.coords;
        let speed = null;
        if (typeof c.speed === 'number' && c.speed >= 0) {
            speed = c.speed;
        }
        const point = { t: position.timestamp, lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed };
        let last = web.points[web.points.length - 1];
        if (web.skipNext) {
            last = null;
            web.skipNext = false;
        }
        web.points.push(point);
        if (last && point.acc <= 25 && last.acc <= 25 && point.t > last.t) {
            const step = GPTripMetrics.distance(last, point);
            let current = speed;
            if (current === null) {
                current = step / ((point.t - last.t) / 1000);
            }
            state.live.speedMs = current;
            if (current >= 2 && step / ((point.t - last.t) / 1000) < 70) {
                state.live.distanceM += step;
                state.live.maxSpeedMs = Math.max(state.live.maxSpeedMs, current);
            }
        }
        if (web.points.length % 10 === 0) {
            saveWebProgress();
        }
    }

    async function startWeb() {
        if (!('geolocation' in navigator)) {
            note('Este navegador no puede usar el GPS.');
            return;
        }
        state.web = { id: GarageStore.newId(), points: [], pauses: [], skipNext: false, watchId: null, wakeLock: null };
        state.live = { recording: true, startedAt: Date.now(), distanceM: 0, speedMs: 0, maxSpeedMs: 0, paused: false, pausedMs: 0, pausedAt: 0 };
        state.web.watchId = navigator.geolocation.watchPosition(onWebPosition, () => {
            note('El GPS no responde. Comprueba que la ubicación está activada.');
        }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
        await requestWakeLock();
        document.addEventListener('visibilitychange', onVisibility);
        note('Grabando. En el navegador mantén la app abierta y la pantalla encendida: si la bloqueas, el GPS se pausa.');
        renderLive();
    }

    async function stopWeb() {
        const web = state.web;
        if (!web) {
            return;
        }
        navigator.geolocation.clearWatch(web.watchId);
        if (web.wakeLock) {
            web.wakeLock.release().catch(() => {});
        }
        document.removeEventListener('visibilitychange', onVisibility);
        const pauses = [...web.pauses];
        if (state.live && state.live.paused) {
            pauses.push([state.live.pausedAt, Date.now()]);
        }
        state.web = null;
        state.live = null;
        renderLive();
        await GarageStore.saveSetting(WEB_TRIP_KEY, null);
        if (web.points.length >= 2) {
            const saved = await saveTrip(web.points, { id: web.id, auto: false, pauses });
            await GPGarage.refresh();
            note('Viaje guardado.');
            await openSummary(saved);
        } else {
            note('No llegó ninguna posición del GPS: el viaje no se ha guardado.');
        }
        await renderList();
    }

    async function recoverWebTrip() {
        if (recorder()) {
            return;
        }
        const pending = await GarageStore.setting(WEB_TRIP_KEY, null);
        if (!pending || !pending.points || pending.points.length < 2) {
            return;
        }
        await GarageStore.saveSetting(WEB_TRIP_KEY, null);
        await saveTrip(pending.points, { id: pending.id, auto: false, pauses: pending.pauses });
        GP.showToast('Se ha guardado un viaje que quedó sin terminar');
    }

    async function renderBluetooth(status) {
        const platform = GPNative.platform();
        el.btWrap.hidden = platform !== 'android' && platform !== 'ios';
        if (el.btWrap.hidden) {
            return;
        }
        el.btHelp.textContent = BT_HELP[platform];
        const bluetooth = status.bluetooth || {};
        const cars = bluetooth.devices || [];
        el.bt.checked = cars.length > 0 || el.btPicker.dataset.open === '1';
        el.btPicker.hidden = !el.bt.checked;
        if (!el.bt.checked) {
            return;
        }
        renderBluetoothCars(cars);
        await fillBluetoothDevices(cars);
    }

    // Los coches elegidos, cada uno con su botón para quitarlo.
    function renderBluetoothCars(cars) {
        el.btCars.innerHTML = '';
        for (const car of cars) {
            const li = document.createElement('li');
            const name = document.createElement('span');
            name.textContent = car.name || car.address;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'pill';
            remove.textContent = 'Quitar';
            remove.setAttribute('aria-label', 'Quitar ' + name.textContent);
            remove.addEventListener('click', () => removeBluetoothCar(car).catch((error) => note(error.message)));
            li.append(name, remove);
            el.btCars.appendChild(li);
        }
        el.btCars.hidden = cars.length === 0;
    }

    // Si falta el permiso de dispositivos cercanos, se pide y se reintenta; si sigue sin lista, se explica por qué.
    async function readBluetoothDevices(plugin) {
        let result = null;
        let problem = '';
        try {
            result = await plugin.bluetoothDevices();
        } catch (error) {
            if (error && error.code === 'permissions') {
                const perms = await plugin.requestBluetooth();
                if (perms.bluetooth) {
                    try {
                        result = await plugin.bluetoothDevices();
                    } catch (retryError) {
                        result = null;
                    }
                }
                if (!result) {
                    problem = BT_NO_PERMISSION;
                }
            }
        }
        if (!result) {
            return { devices: [], problem };
        }
        if (result.available === false) {
            problem = 'Este móvil no tiene Bluetooth.';
        } else if (result.enabled === false) {
            problem = 'El Bluetooth del móvil está apagado. Enciéndelo, conéctate al coche y vuelve a abrir esta opción.';
        }
        return { devices: result.devices || [], problem };
    }

    // Los dispositivos que aún no son tu coche: primero los conectados ahora y los que se anuncian como coche.
    async function fillBluetoothDevices(cars) {
        const result = await readBluetoothDevices(recorder());
        const chosen = new Set(cars.map((car) => car.address));
        const devices = result.devices.filter((device) => !chosen.has(device.address));
        const rank = (device) => Number(Boolean(device.connected)) * 2 + Number(Boolean(device.car));
        devices.sort((a, b) => rank(b) - rank(a));
        el.btDevice.innerHTML = '';
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'Elige un dispositivo';
        el.btDevice.appendChild(empty);
        for (const device of devices) {
            const option = document.createElement('option');
            option.value = device.address;
            let label = device.name || device.address;
            if (device.car) {
                label += ' (coche)';
            }
            if (device.connected) {
                label += ' · conectado';
            }
            option.textContent = label;
            el.btDevice.appendChild(option);
        }
        el.btAdd.disabled = devices.length === 0;
        if (result.problem) {
            note(result.problem);
        } else if (devices.length === 0 && cars.length === 0) {
            note(BT_EMPTY[GPNative.platform()]);
        }
    }

    async function setBluetooth(enabled) {
        const plugin = recorder();
        if (!plugin || typeof plugin.bluetoothDevices !== 'function') {
            el.bt.checked = false;
            note('Esta versión de la app no admite el Bluetooth del coche. Actualiza la app.');
            return;
        }
        if (!enabled) {
            const cars = (await plugin.status()).bluetooth.devices || [];
            if (cars.length > 0 && !window.confirm('¿Dejar de empezar los viajes con el Bluetooth y quitar tus coches de la lista?')) {
                el.bt.checked = true;
                return;
            }
            el.btPicker.dataset.open = '0';
            for (const car of cars) {
                await plugin.removeBluetoothDevice({ address: car.address });
            }
            await refreshStatus();
            return;
        }
        let perms = await plugin.requestForeground();
        if (perms.location) {
            perms = await plugin.requestBluetooth();
        }
        if (perms.location && perms.bluetooth && !perms.background) {
            const ok = window.confirm('Para empezar el viaje al conectarte al coche con la app cerrada, el móvil te pedirá permitir la ubicación "Siempre" o "Todo el tiempo". Gasolinera+ solo la usa mientras vas en coche y los recorridos se quedan en tu móvil. ¿Continuar?');
            if (ok) {
                perms = await plugin.requestBackground();
            }
        }
        if (!perms.location || !perms.bluetooth || !perms.background) {
            el.bt.checked = false;
            note('No se ha activado: faltan permisos. Puedes darlos desde los ajustes de la app.');
            await refreshStatus();
            return;
        }
        el.btPicker.dataset.open = '1';
        await refreshStatus();
        if (el.btDevice.options.length > 1) {
            note('Elige tu coche y pulsa Añadir. Para que arranque con la app cerrada, desactiva también el ahorro de batería para Gasolinera+ en los ajustes del móvil.');
        }
    }

    async function addBluetoothCar() {
        const address = el.btDevice.value;
        if (address === '') {
            note('Elige primero un dispositivo de la lista.');
            return;
        }
        const name = el.btDevice.options[el.btDevice.selectedIndex].text.replace(/ \(coche\)| · conectado/g, '');
        await recorder().addBluetoothDevice({ address, name });
        GP.showToast('Los viajes empezarán al conectarte a ' + name);
        await refreshStatus();
    }

    async function removeBluetoothCar(car) {
        await recorder().removeBluetoothDevice({ address: car.address });
        GP.showToast('Has quitado ' + (car.name || car.address));
        await refreshStatus();
    }

    async function setAuto(enabled) {
        const plugin = recorder();
        if (!plugin) {
            return;
        }
        if (!enabled) {
            await plugin.setAutoDetect({ enabled: false });
            await refreshStatus();
            return;
        }
        let perms = await plugin.requestForeground();
        if (perms.location) {
            perms = await plugin.requestActivity();
        }
        if (perms.location && perms.activity && !perms.background) {
            let always = '"Todo el tiempo"';
            let system = 'Android';
            if (GPNative.platform() === 'ios') {
                always = '"Siempre"';
                system = 'iOS';
            }
            const ok = window.confirm('Para detectar tus viajes con la app cerrada, ' + system + ' te pedirá permitir la ubicación ' + always + '. Gasolinera+ solo la usa mientras vas en coche y los recorridos se quedan en tu móvil. ¿Continuar?');
            if (ok) {
                perms = await plugin.requestBackground();
            }
        }
        if (!perms.location || !perms.activity || !perms.background) {
            el.auto.checked = false;
            note('No se ha activado: faltan permisos. Puedes darlos desde los ajustes de la app.');
            await refreshStatus();
            return;
        }
        try {
            await plugin.setAutoDetect({ enabled: true });
            GP.showToast('Detección automática activada');
            let detector = 'Android';
            if (GPNative.platform() === 'ios') {
                detector = 'el iPhone';
            }
            note('Cuando ' + detector + ' detecte que vas en coche, Gasolinera+ empezará a grabar el viaje y parará al bajarte.');
        } catch (error) {
            el.auto.checked = false;
            note(error.message);
        }
        await refreshStatus();
    }

    function speedColor(kmh) {
        const clamped = Math.max(0, Math.min(130, kmh));
        return `hsl(${Math.round(220 - (clamped / 130) * 220)}, 75%, 45%)`;
    }

    const RECENT_LIMIT = 10;
    const FIRST_ISO = '0000';
    const LAST_ISO = '9999';

    async function vehicleNames() {
        const vehicles = await GarageStore.vehicles.list();
        return new Map(vehicles.map((v) => [v.id, v.name]));
    }

    function tripItem(trip, names) {
        const m = trip.metrics;
        const li = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'garage-refuel-item';
        button.innerHTML = '<strong></strong><small></small>';
        const date = new Date(trip.startedAt);
        let title = `${date.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} · ${number(m.distanceKm, 1)} km`;
        if (trip.auto) {
            title += ' · automático';
        }
        button.querySelector('strong').textContent = title;
        const parts = [minutesText(m.durationSeconds), `media ${number(m.avgSpeedKmh, 0)} km/h`, `máx. ${number(m.maxSpeedKmh, 0)} km/h`];
        if (m.cost !== null) {
            parts.push(`${number(m.cost, 2)} €`);
        }
        if (names.get(trip.vehicleId)) {
            parts.push(names.get(trip.vehicleId));
        }
        button.querySelector('small').textContent = parts.join(' · ');
        button.addEventListener('click', () => openTrip(trip));
        li.appendChild(button);
        return li;
    }

    async function renderList() {
        const [trips, total, names] = await Promise.all([
            GarageStore.trips.between(FIRST_ISO, LAST_ISO, 0, RECENT_LIMIT),
            GarageStore.trips.countBetween(FIRST_ISO, LAST_ISO),
            vehicleNames(),
        ]);
        el.empty.hidden = trips.length > 0;
        el.list.innerHTML = '';
        for (const trip of trips) {
            el.list.appendChild(tripItem(trip, names));
        }
        el.historyOpen.hidden = total <= RECENT_LIMIT;
        el.historyOpen.textContent = `Ver todo el historial (${total.toLocaleString('es-ES')} viajes)`;
        document.dispatchEvent(new CustomEvent('gp:history-refresh'));
    }

    function escapeText(value) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(value).replace(/[&<>"']/g, (char) => map[char]);
    }

    function tile(label, value) {
        return `<div><small>${escapeText(label)}</small><strong>${escapeText(value)}</strong></div>`;
    }

    async function shiftOdometer(vehicleId, km) {
        if (!vehicleId || km === 0) {
            return;
        }
        const vehicle = await GarageStore.vehicles.get(vehicleId);
        if (!vehicle) {
            return;
        }
        const odometer = Math.max(0, Math.round(vehicle.odometer + km));
        await GarageStore.vehicles.save({ ...vehicle, odometer, odometerAt: new Date().toISOString() });
    }

    function summaryTiles(metrics) {
        const tiles = [
            tile('Distancia', `${number(metrics.distanceKm, 1)} km`),
            tile('Tiempo', clock(metrics.durationSeconds)),
            tile('Vel. media', `${number(metrics.avgSpeedKmh, 0)} km/h`),
        ];
        if (metrics.fuelUsed !== null) {
            tiles.push(tile('Consumo estimado', `${number(metrics.fuelUsed, 2)} L`));
        }
        if (metrics.cost !== null) {
            tiles.push(tile('Coste estimado', `${number(metrics.cost, 2)} €`));
        }
        return tiles.join('');
    }

    async function reassignTrip(trip, vehicle) {
        if (trip.vehicleId === vehicle.id) {
            return;
        }
        await shiftOdometer(trip.vehicleId, -trip.metrics.distanceKm);
        await shiftOdometer(vehicle.id, trip.metrics.distanceKm);
        trip.vehicleId = vehicle.id;
        await GarageStore.trips.save(trip);
        await GPGarage.refresh();
        await renderList();
        await renderSummaryCars(trip);
    }

    async function renderSummaryCars(trip) {
        const vehicles = await GarageStore.vehicles.list();
        el.summaryCarsWrap.hidden = vehicles.length < 2;
        el.summaryCars.innerHTML = '';
        for (const vehicle of vehicles) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'pill';
            button.textContent = vehicle.name;
            button.setAttribute('aria-pressed', String(vehicle.id === trip.vehicleId));
            button.addEventListener('click', () => reassignTrip(trip, vehicle).catch((error) => note(error.message)));
            el.summaryCars.appendChild(button);
        }
    }

    async function openSummary(trip) {
        if (!trip || el.summary.open) {
            return;
        }
        el.summaryTitle.textContent = 'Viaje guardado';
        el.summaryTiles.innerHTML = summaryTiles(trip.metrics);
        await renderSummaryCars(trip);
        el.summary.showModal();
    }

    function replaceChart(key, canvas, config) {
        if (state.charts[key]) {
            state.charts[key].destroy();
        }
        state.charts[key] = new Chart(canvas, config);
    }

    function openTrip(trip) {
        state.openTrip = trip;
        const m = trip.metrics;
        const date = new Date(trip.startedAt);
        el.dialogTitle.textContent = `Viaje del ${date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`;
        el.dialogSubtitle.textContent = `${date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} – ${new Date(trip.endedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
        const tiles = [
            tile('Distancia', `${number(m.distanceKm, 1)} km`),
            tile('Duración', minutesText(m.durationSeconds)),
            tile('En marcha', minutesText(m.movingSeconds)),
            tile('Parado', minutesText(m.stoppedSeconds)),
        ];
        if (m.pausedSeconds > 0) {
            tiles.push(tile('En pausa', minutesText(m.pausedSeconds)));
        }
        tiles.push(
            tile('Velocidad media', `${number(m.avgSpeedKmh, 0)} km/h`),
            tile('Velocidad máxima', `${number(m.maxSpeedKmh, 0)} km/h`),
            tile('Por encima de 120', `${number(m.percentAbove120, 0)} %`),
        );
        if (m.gapSeconds > 0) {
            tiles.push(tile('Sin señal GPS (túneles)', minutesText(m.gapSeconds)));
        }
        if (m.fuelUsed !== null) {
            tiles.push(tile('Consumo estimado', `${number(m.fuelUsed, 2)} L`));
        }
        if (m.cost !== null) {
            tiles.push(tile('Coste estimado', `${number(m.cost, 2)} €`));
        }
        el.metrics.innerHTML = tiles.join('');
        let quality = 'Cifras estimadas con el GPS del móvil, no con los sensores del coche.';
        if (m.lowQuality) {
            quality = 'La señal GPS fue pobre en buena parte del viaje: las cifras son aproximadas. ' + quality;
        }
        el.quality.textContent = quality;
        el.dialog.showModal();

        if (!state.map) {
            state.map = L.map(el.map, { zoomControl: false });
            GPMaps.addBaseLayers(state.map);
            state.mapLayer = L.layerGroup().addTo(state.map);
        }
        state.map.invalidateSize();
        state.mapLayer.clearLayers();
        const track = trip.track;
        if (track.length >= 2) {
            let run = [[track[0][1], track[0][2]]];
            let runColor = speedColor(track[0][3]);
            for (let i = 1; i < track.length; i++) {
                const color = speedColor(track[i][3]);
                run.push([track[i][1], track[i][2]]);
                if (color !== runColor || i === track.length - 1) {
                    L.polyline(run, { color: runColor, weight: 5, opacity: 0.9 }).addTo(state.mapLayer);
                    run = [[track[i][1], track[i][2]]];
                    runColor = color;
                }
            }
            state.map.fitBounds(track.map((p) => [p[1], p[2]]), { padding: [20, 20] });
        }

        let origin = Date.parse(trip.startedAt);
        if (track.length) {
            origin = track[0][0];
        }
        replaceChart('speed', el.speedChart, {
            type: 'line',
            data: {
                labels: track.map((p) => clock((p[0] - origin) / 1000)),
                datasets: [{ label: 'km/h', data: track.map((p) => p[3]), borderColor: '#1D4E89', pointRadius: 0, tension: 0.2, fill: false }],
            },
            options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { ticks: { maxTicksLimit: 6 } } } },
        });
        replaceChart('bands', el.bandsChart, {
            type: 'bar',
            data: {
                labels: m.speedBands.map((b) => {
                    if (b.to === null) {
                        return `+${b.from}`;
                    }
                    return `${b.from}-${b.to}`;
                }),
                datasets: [{ label: 'minutos', data: m.speedBands.map((b) => +(b.seconds / 60).toFixed(1)), backgroundColor: m.speedBands.map((b) => speedColor(b.from + 10)) }],
            },
            options: { responsive: true, plugins: { legend: { display: false } } },
        });
    }

    async function deleteOpenTrip() {
        const trip = state.openTrip;
        if (!trip || !window.confirm('¿Borrar este viaje?')) {
            return;
        }
        await GarageStore.trips.remove(trip.id);
        await shiftOdometer(trip.vehicleId, -trip.metrics.distanceKm);
        el.dialog.close();
        await GPGarage.refresh();
        await renderList();
    }

    async function sync() {
        try {
            await importPending();
            await refreshStatus();
        } catch (error) {
            note('No se pudieron leer los viajes grabados: ' + error.message);
        }
    }

    el.start.addEventListener('click', () => start().catch((error) => note(error.message)));
    el.stop.addEventListener('click', () => stop().catch((error) => note(error.message)));
    el.driveStop.addEventListener('click', () => stop().catch((error) => note(error.message)));
    el.pause.addEventListener('click', () => togglePause().catch((error) => note(error.message)));
    el.drivePause.addEventListener('click', () => togglePause().catch((error) => note(error.message)));
    el.summaryClose.addEventListener('click', () => el.summary.close());
    el.driveMin.addEventListener('click', () => minimizeDrive(true));
    el.chip.addEventListener('click', () => minimizeDrive(false));
    el.auto.addEventListener('change', () => setAuto(el.auto.checked).catch((error) => note(error.message)));
    el.bt.addEventListener('change', () => setBluetooth(el.bt.checked).catch((error) => note(error.message)));
    el.btAdd.addEventListener('click', () => addBluetoothCar().catch((error) => note(error.message)));
    el.permissionsFix.addEventListener('click', () => {
        const plugin = recorder();
        if (plugin) {
            plugin.openAppSettings();
        }
    });
    el.battery.addEventListener('click', () => {
        const plugin = recorder();
        if (plugin) {
            plugin.openBatterySettings();
        }
    });
    el.dialogClose.addEventListener('click', () => el.dialog.close());
    el.remove.addEventListener('click', deleteOpenTrip);

    const plugin = recorder();
    if (plugin) {
        plugin.addListener('tripUpdate', (snapshot) => {
            state.live = snapshot;
            renderLive();
            if (!snapshot.recording) {
                setTimeout(importPending, 800);
            }
        });
        const App = GPNative.plugin('App');
        if (App) {
            App.addListener('appStateChange', ({ isActive }) => {
                if (isActive) {
                    sync();
                }
            });
        }
    } else {
        el.autoWrap.hidden = true;
        note('En el navegador los viajes solo se graban con la app abierta. En la app de Android y de iPhone se graban aunque bloquees el móvil.');
    }

    // Si la app se abre ya en Coche (enlace o notificación), el aviso de vista llega antes que este script.
    renderList();
    document.addEventListener('gp:view', (event) => {
        if (event.detail === 'garage') {
            renderList();
            if (plugin) {
                sync();
            }
        }
    });

    async function openTripScreen() {
        window.GP_PENDING_TRIP = false;
        await refreshStatus();
        if (state.live && state.live.recording) {
            minimizeDrive(false);
        }
    }

    document.addEventListener('gp:show-trip', () => {
        openTripScreen().catch(() => {});
    });

    recoverWebTrip().then(() => sync()).then(() => {
        if (window.GP_PENDING_TRIP) {
            return openTripScreen();
        }
        return null;
    }).catch(() => {});

    el.historyOpen.addEventListener('click', () => GPHistory.open('trips'));

    return { importPending, saveTrip, state, tripItem, vehicleNames, renderList };
})();
