import { launch, sleep } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9378));
const { ev, go, check, waitFor } = s;

await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
        const watchers = new Map();
        let next = 0;
        const fake = {
            watchPosition(ok) { next++; watchers.set(next, ok); return next; },
            clearWatch(id) { watchers.delete(id); },
            getCurrentPosition(ok, fail) { if (fail) { fail({ code: 2, message: 'sin GPS en la prueba' }); } },
        };
        Object.defineProperty(navigator, 'geolocation', { value: fake, configurable: true });
        window.__emitPosition = (t, lat, lon, speed, accuracy) => {
            const position = { timestamp: t, coords: { latitude: lat, longitude: lon, accuracy, speed, heading: null, altitude: null } };
            watchers.forEach((callback) => callback(position));
        };
    })();
` });
await go('/', 800);
await ev("localStorage.clear(); localStorage.setItem('gasolinera_location_pref','off'); indexedDB.deleteDatabase('gasolinera-garage')");
await go('/?view=garage', 2500);
await ev(`(async () => {
    const now = new Date().toISOString();
    await GarageStore.vehicles.save({ id: 'web-car', name: 'Web', fuel: 'gasolina_95_e5', tankCapacity: 45, homologated: 6, odometer: 1000, odometerAt: now, createdAt: now, updatedAt: now });
    await GarageStore.saveSetting('activeVehicleId', 'web-car');
    await GPGarage.refresh();
})()`);

s.where = 'web';
check('en el navegador no ofrece deteccion automatica', (await ev("document.getElementById('trip-auto-wrap').hidden")) === true);
check('explica la limitacion del navegador', (await ev("document.getElementById('trip-note').textContent")).includes('app abierta'));
await ev("document.getElementById('trip-start').click()");
check('empieza a grabar en el navegador', await waitFor("!document.getElementById('trip-stop').hidden", 4000));

const speed = 20;
const t0 = Date.now();
for (let i = 0; i < 90; i++) {
    await ev(`__emitPosition(${t0 + i * 1000}, ${43.2630 + (i * speed) / 111320}, -2.9350, ${speed}, 5)`);
}
await sleep(1200);
check('distancia en vivo', parseFloat((await ev("document.getElementById('trip-live-distance').textContent")).replace(',', '.')) > 1.5);
await ev("document.getElementById('trip-stop').click()");
check('guarda el viaje del navegador', await waitFor("document.querySelectorAll('#trip-list li').length === 1", 6000));
const trip = await ev("GarageStore.trips.all().then(t => t[0])");
const m = trip.metrics;
check('distancia del viaje web', Math.abs(m.distanceKm - 1.78) < 0.12, `${m.distanceKm.toFixed(2)} km`);
check('velocidad maxima del viaje web', Math.abs(m.maxSpeedKmh - 72) < 4, `${m.maxSpeedKmh.toFixed(1)} km/h`);
check('se asigna al coche activo', trip.vehicleId === 'web-car');
check('suma km al coche', (await ev("GarageStore.vehicles.get('web-car').then(v => v.odometer)")) === Math.round(1000 + m.distanceKm));

await ev("document.querySelector('#trip-list button').click()");
check('abre el detalle', await waitFor("document.getElementById('trip-dialog').open", 3000));
check('dibuja el trazado', await waitFor("document.querySelectorAll('#trip-map path.leaflet-interactive').length > 0", 4000));
await ev("window.confirm = () => true");
await ev("document.getElementById('trip-delete').click()");
check('borra el viaje y descuenta los km', await waitFor("GarageStore.trips.all().then(t => t.length === 0)", 4000) && (await ev("GarageStore.vehicles.get('web-car').then(v => v.odometer)")) === 1000);

s.where = 'pausa';
await ev("document.getElementById('trip-start').click()");
await waitFor("!document.getElementById('trip-stop').hidden", 4000);
check('muestra el boton de pausa', (await ev("!document.getElementById('trip-pause').hidden")) === true);
const before = Date.now() - 200000;
for (let i = 0; i < 60; i++) {
    await ev(`__emitPosition(${before + i * 1000}, ${43.2630 + (i * speed) / 111320}, -2.9350, ${speed}, 5)`);
}
await ev("document.getElementById('trip-pause').click()");
check('pausa el viaje', (await ev("document.getElementById('trip-pause').textContent")) === 'Reanudar' && (await ev("document.getElementById('trip-drive-label').textContent")) === 'EN PAUSA');
const pausedDistance = await ev("document.getElementById('trip-live-distance').textContent");
for (let i = 0; i < 30; i++) {
    await ev(`__emitPosition(${Date.now()}, ${43.30 + (i * speed) / 111320}, -2.9350, ${speed}, 5)`);
}
await sleep(1500);
check('en pausa no suma distancia', (await ev("document.getElementById('trip-live-distance').textContent")) === pausedDistance);
await ev("document.getElementById('trip-pause').click()");
check('reanuda el viaje', (await ev("document.getElementById('trip-pause').textContent")) === 'Pausar');
const after = Date.now() + 1000;
for (let i = 0; i < 60; i++) {
    await ev(`__emitPosition(${after + i * 1000}, ${43.40 + (i * speed) / 111320}, -2.9350, ${speed}, 5)`);
}
await sleep(1200);
await ev("document.getElementById('trip-stop').click()");
await waitFor("GarageStore.trips.all().then(t => t.length === 1)", 6000);
const paused = await ev("GarageStore.trips.all().then(t => t[0])");
check('el viaje con pausa no cuenta el salto', Math.abs(paused.metrics.distanceKm - 2.36) < 0.15, `${paused.metrics.distanceKm.toFixed(2)} km`);
check('guarda el tiempo en pausa', paused.metrics.pausedSeconds > 1 && Array.isArray(paused.pauses) && paused.pauses.length === 1, `${paused.metrics.pausedSeconds} s`);
await ev("document.getElementById('trip-summary').open && document.getElementById('trip-summary-close').click()");

s.where = 'historial';
await ev(`(async () => {
    const trips = await GarageStore.trips.all();
    for (const trip of trips) {
        await GarageStore.trips.remove(trip.id);
    }
    const metrics = { distanceKm: 10, durationSeconds: 600, movingSeconds: 600, stoppedSeconds: 0, avgSpeedKmh: 60, maxSpeedKmh: 90, cost: null, speedBands: [] };
    for (let i = 0; i < 25; i++) {
        const day = new Date(Date.now() - i * 86400000).toISOString();
        await GarageStore.trips.save({ id: 'hist-' + i, vehicleId: 'web-car', auto: false, startedAt: day, endedAt: day, metrics, track: [], createdAt: day });
    }
    const old = new Date(Date.now() - 200 * 86400000).toISOString();
    await GarageStore.trips.save({ id: 'hist-old', vehicleId: 'web-car', auto: false, startedAt: old, endedAt: old, metrics, track: [], createdAt: old });
    await GPTrips.renderList();
})()`);
check('Coche muestra solo los 10 ultimos viajes', await waitFor("document.querySelectorAll('#trip-list li').length === 10", 4000), String(await ev("document.querySelectorAll('#trip-list li').length")));
check('ofrece ver todo el historial', (await ev("!document.getElementById('trip-history-open').hidden && document.getElementById('trip-history-open').textContent.includes('26')")) === true);
await ev("document.getElementById('trip-history-open').click()");
check('el historial carga la primera pagina', await waitFor("document.getElementById('history-dialog').open && document.querySelectorAll('#history-list li').length === 20", 4000), String(await ev("document.querySelectorAll('#history-list li').length")));
check('el historial filtra los ultimos 30 dias', (await ev("document.getElementById('history-summary').textContent")).startsWith('25 viajes'));
await ev("document.getElementById('history-more').click()");
check('carga mas al pulsar', await waitFor("document.querySelectorAll('#history-list li').length === 25 && document.getElementById('history-more').hidden", 4000));
await ev("document.querySelector('[data-history-days=\"0\"]').click()");
check('todo el periodo incluye los antiguos', await waitFor("document.getElementById('history-summary').textContent.startsWith('26 viajes')", 4000));
await ev("document.getElementById('history-close').click()");

s.finish('VIAJES WEB');
