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
        note: $('trip-note'),
        autoWrap: $('trip-auto-wrap'),
        auto: $('trip-auto'),
        permissions: $('trip-permissions'),
        permissionsText: $('trip-permissions-text'),
        permissionsFix: $('trip-permissions-fix'),
        battery: $('trip-battery'),
        list: $('trip-list'),
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
    };

    const WEB_TRIP_KEY = 'webTripInProgress';
    const state = {
        live: null,
        timer: null,
        web: null,
        importing: false,
        map: null,
        mapLayer: null,
        charts: {},
        openTrip: null,
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

    function renderLive() {
        const live = state.live;
        const recording = Boolean(live && live.recording);
        el.live.hidden = !recording;
        el.start.hidden = recording;
        el.stop.hidden = !recording;
        clearInterval(state.timer);
        state.timer = null;
        if (!recording) {
            return;
        }
        const paint = () => {
            el.liveDistance.textContent = `${number(live.distanceM / 1000, 1)} km`;
            el.liveSpeed.textContent = `${number(live.speedMs * 3.6, 0)} km/h`;
            el.liveMax.textContent = `${number(live.maxSpeedMs * 3.6, 0)} km/h`;
            el.liveTime.textContent = clock((Date.now() - live.startedAt) / 1000);
        };
        paint();
        state.timer = setInterval(paint, 1000);
    }

    function vehicleOptions() {
        const summary = GPGarage.summary();
        const options = {};
        if (summary) {
            options.consumption = summary.avgConsumption;
            if (summary.lastRefuel) {
                options.pricePerUnit = summary.lastRefuel.pricePerUnit;
            }
        }
        return options;
    }

    async function saveTrip(points, info) {
        const metrics = GPTripMetrics.compute(points, vehicleOptions());
        if (info.auto && metrics.distanceKm < 0.5) {
            return null;
        }
        let vehicleId = info.vehicleId || null;
        const active = GPGarage.activeVehicle();
        if (!vehicleId && active) {
            vehicleId = active.id;
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
            track: GPTripMetrics.thin(points),
            createdAt: now,
        };
        await GarageStore.trips.save(trip);
        if (vehicleId && metrics.distanceKm > 0) {
            const vehicle = await GarageStore.vehicles.get(vehicleId);
            if (vehicle) {
                await GarageStore.vehicles.save({ ...vehicle, odometer: Math.round(vehicle.odometer + metrics.distanceKm), odometerAt: now });
            }
        }
        return trip;
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
        try {
            const { trips } = await plugin.listTrips();
            for (const meta of trips) {
                const data = await plugin.readTrip({ id: meta.id });
                const saved = await saveTrip(pointsFromNative(data.points), { id: meta.id, auto: meta.auto, vehicleId: meta.vehicleId });
                await plugin.deleteTrip({ id: meta.id });
                if (saved) {
                    imported++;
                }
            }
        } finally {
            state.importing = false;
        }
        if (imported) {
            await GPGarage.refresh();
            GP.showToast(`${imported} viaje(s) guardado(s)`);
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
        if ((status.autoDetect || status.recording) && !perms.unrestrictedBattery) {
            problems.push('Algunos móviles cortan el GPS en segundo plano para ahorrar batería: quita el ahorro de batería para Gasolinera+.');
        }
        el.permissions.hidden = problems.length === 0;
        el.permissionsText.textContent = problems.join(' ');
        el.battery.hidden = perms.unrestrictedBattery;
    }

    async function start() {
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
            state.live = { recording: true, startedAt: Date.now(), distanceM: 0, speedMs: 0, maxSpeedMs: 0 };
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
        if (!web) {
            return;
        }
        const c = position.coords;
        let speed = null;
        if (typeof c.speed === 'number' && c.speed >= 0) {
            speed = c.speed;
        }
        const point = { t: position.timestamp, lat: c.latitude, lon: c.longitude, acc: c.accuracy, speed };
        const last = web.points[web.points.length - 1];
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
            GarageStore.saveSetting(WEB_TRIP_KEY, { id: web.id, points: web.points }).catch(() => {});
        }
    }

    async function startWeb() {
        if (!('geolocation' in navigator)) {
            note('Este navegador no puede usar el GPS.');
            return;
        }
        state.web = { id: GarageStore.newId(), points: [], watchId: null, wakeLock: null };
        state.live = { recording: true, startedAt: Date.now(), distanceM: 0, speedMs: 0, maxSpeedMs: 0 };
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
        state.web = null;
        state.live = null;
        renderLive();
        await GarageStore.saveSetting(WEB_TRIP_KEY, null);
        if (web.points.length >= 2) {
            await saveTrip(web.points, { id: web.id, auto: false });
            await GPGarage.refresh();
            note('Viaje guardado.');
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
        await saveTrip(pending.points, { id: pending.id, auto: false });
        GP.showToast('Se ha guardado un viaje que quedó sin terminar');
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
            const ok = window.confirm('Para detectar tus viajes con la app cerrada, Android te pedirá permitir la ubicación "Todo el tiempo". Gasolinera+ solo la usa mientras vas en coche y los recorridos se quedan en tu móvil. ¿Continuar?');
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
            note('Cuando Android detecte que vas en coche, Gasolinera+ empezará a grabar el viaje y parará al bajarte.');
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

    async function renderList() {
        const trips = (await GarageStore.trips.all()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
        const vehicles = await GarageStore.vehicles.list();
        const names = new Map(vehicles.map((v) => [v.id, v.name]));
        el.empty.hidden = trips.length > 0;
        el.list.innerHTML = '';
        for (const trip of trips) {
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
            el.list.appendChild(li);
        }
    }

    function tile(label, value) {
        return `<div><small>${label}</small><strong>${value}</strong></div>`;
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
            tile('Velocidad media', `${number(m.avgSpeedKmh, 0)} km/h`),
            tile('Velocidad máxima', `${number(m.maxSpeedKmh, 0)} km/h`),
            tile('Por encima de 120', `${number(m.percentAbove120, 0)} %`),
            tile('Acelerones / frenazos', `${m.harshAccelerations} / ${m.harshBrakes}`),
        ];
        if (m.ecoScore !== null) {
            tiles.push(tile('Conducción eficiente', `${m.ecoScore} / 100`));
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
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
                maxZoom: 19,
            }).addTo(state.map);
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
        if (trip.vehicleId && trip.metrics.distanceKm > 0) {
            const vehicle = await GarageStore.vehicles.get(trip.vehicleId);
            if (vehicle) {
                await GarageStore.vehicles.save({ ...vehicle, odometer: Math.max(0, Math.round(vehicle.odometer - trip.metrics.distanceKm)) });
            }
        }
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
    el.auto.addEventListener('change', () => setAuto(el.auto.checked).catch((error) => note(error.message)));
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
        note('En el navegador los viajes solo se graban con la app abierta. En la app de Android se graban aunque bloquees el móvil.');
    }

    document.addEventListener('gp:view', (event) => {
        if (event.detail === 'garage') {
            renderList();
            if (plugin) {
                sync();
            }
        }
    });

    recoverWebTrip().then(() => sync()).catch(() => {});

    return { importPending, saveTrip, state };
})();
