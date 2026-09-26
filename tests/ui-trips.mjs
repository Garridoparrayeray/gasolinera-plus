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

s.finish('VIAJES WEB');
