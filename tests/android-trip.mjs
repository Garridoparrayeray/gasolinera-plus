import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { attach, sleep } from './cdp.mjs';
import { adb, PKG, connectToApp, foregroundActivity, freshInstallState, geoFix } from './android-helpers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const graphDir = process.env.GRAPH_DIR || join(root, 'data', 'road-graph');
const GPRouter = new Function(readFileSync(join(root, 'js', 'router-core.js'), 'utf8') + '\nreturn GPRouter;')();
const unzip = (file) => {
    const buffer = gunzipSync(readFileSync(file));
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};
const router = new GPRouter.Router(JSON.parse(readFileSync(join(graphDir, 'manifest.json'), 'utf8')), unzip(join(graphDir, 'main.bin.gz')), async (key) => unzip(join(graphDir, 'tiles', `${key}.bin.gz`)));
const route = await router.route([[43.2610, -2.9480], [43.2960, -2.9960]]);
if (route.error) {
    console.log('MAL no se pudo calcular la ruta de prueba: ' + route.error);
    process.exit(1);
}
const coords = route.coords;
const cumulative = [0];
for (let i = 1; i < coords.length; i++) {
    cumulative.push(cumulative[i - 1] + GPRouter.metersBetween(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
}
const length = cumulative[cumulative.length - 1];

function positionAt(meters) {
    let i = 1;
    while (i < cumulative.length - 1 && cumulative[i] < meters) {
        i++;
    }
    const span = cumulative[i] - cumulative[i - 1];
    let t = 0;
    if (span > 0) {
        t = Math.max(0, Math.min(1, (meters - cumulative[i - 1]) / span));
    }
    return [coords[i - 1][0] + t * (coords[i][0] - coords[i - 1][0]), coords[i - 1][1] + t * (coords[i][1] - coords[i - 1][1])];
}

function profile() {
    const samples = [];
    let s = 0;
    let v = 0;
    const push = () => samples.push({ s: Math.min(s, length), v });
    const step = (accel, until) => {
        while (until(v, s)) {
            v = Math.max(0, v + accel);
            s += v;
            push();
        }
    };
    for (let i = 0; i < 5; i++) {
        push();
    }
    step(2, (speed) => speed < 14);
    let cruiseStart = s;
    step(0, (speed, dist) => dist - cruiseStart < 700);
    step(-4, (speed) => speed > 3);
    step(1.8, (speed) => speed < 28);
    step(0, (speed, dist) => dist < length - 300);
    step(-1.5, (speed, dist) => speed > 0 && dist < length);
    v = 0;
    s = length;
    for (let i = 0; i < 15; i++) {
        push();
    }
    return samples;
}

const samples = profile();
const maxKmh = Math.max(...samples.map((x) => x.v)) * 3.6;
console.log(`ruta de prueba: ${(length / 1000).toFixed(2)} km, ${samples.length} s de recorrido, máxima ${maxKmh.toFixed(0)} km/h`);

freshInstallState(['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS', 'ACCESS_BACKGROUND_LOCATION', 'ACTIVITY_RECOGNITION']);
geoFix(coords[0][0], coords[0][1], 0);
adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
const s = await attach(await connectToApp(), () => {}, 'https://localhost');
const { ev, check, waitFor } = s;
s.ignoreHttp = /api\.github\.com\/repos\/.*\/releases\/latest/;
s.ignoreConsole = /OS-PLUG-GLOC-0010/;

s.where = 'preparar';
await waitFor("typeof GPTrips !== 'undefined' && typeof GarageStore !== 'undefined'", 15000);
await ev(`(async () => {
    const now = new Date().toISOString();
    await GarageStore.vehicles.save({ id: 'coche-prueba', name: 'Prueba', fuel: 'gasoleo_a', tankCapacity: 50, homologated: 5.5, odometer: 30000, odometerAt: now, createdAt: now, updatedAt: now });
    await GarageStore.saveSetting('activeVehicleId', 'coche-prueba');
    await GarageStore.refuels.save({ id: 'r1', vehicleId: 'coche-prueba', date: '2026-09-01T10:00:00Z', odometer: 29000, liters: 40, pricePerUnit: 1.6, total: 64, full: true, missedBefore: false });
    await GarageStore.refuels.save({ id: 'r2', vehicleId: 'coche-prueba', date: '2026-09-10T10:00:00Z', odometer: 29800, liters: 48, pricePerUnit: 1.6, total: 76.8, full: true, missedBefore: false });
    await GPGarage.reload();
})()`);
await ev("document.getElementById('view-garage-btn').click()");
await sleep(1500);
check('el garaje muestra el grabador de viajes', (await ev("!document.getElementById('trip-start').hidden")) === true);
check('en Android ofrece la deteccion automatica', (await ev("!document.getElementById('trip-auto-wrap').hidden")) === true);

s.where = 'viaje';
await ev("document.getElementById('trip-start').click()");
check('empieza a grabar', await waitFor("!document.getElementById('trip-stop').hidden", 8000));
const notifications = adb('shell', 'dumpsys', 'notification', '--noredact');
check('notificacion de viaje en curso', notifications.includes('Grabando viaje'));

let backgrounded = false;
let resumed = false;
let liveChecked = false;
for (let i = 0; i < samples.length; i++) {
    const [lat, lon] = positionAt(samples[i].s);
    geoFix(lat, lon, samples[i].v);
    if (i === 90) {
        adb('shell', 'input', 'keyevent', '3');
        backgrounded = true;
    }
    if (i === 150) {
        adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
        resumed = true;
    }
    if (i === 60 && !liveChecked) {
        liveChecked = true;
        const live = await ev("document.getElementById('trip-live-distance').textContent");
        check('muestra la distancia en vivo', parseFloat(live.replace(',', '.')) > 0.2, live);
    }
    await sleep(1000);
}
check('la app paso por segundo plano y volvio', backgrounded && resumed && foregroundActivity().includes(PKG));

await ev("document.getElementById('trip-stop').click()");
check('guarda el viaje al terminar', await waitFor("document.querySelectorAll('#trip-list li').length === 1", 15000));
const trip = await ev("GarageStore.trips.all().then(t => t[0])");
const m = trip.metrics;
console.log(`medido: ${m.distanceKm.toFixed(2)} km, máx ${m.maxSpeedKmh.toFixed(0)} km/h, media ${m.avgSpeedKmh.toFixed(0)} km/h, frenazos ${m.harshBrakes}, acelerones ${m.harshAccelerations}, ${m.goodPoints}/${m.points} puntos, en marcha ${Math.round(m.movingSeconds)} s`);
check('distancia grabada coincide con la ruta', Math.abs(m.distanceKm * 1000 - length) / length < 0.04, `${m.distanceKm.toFixed(2)} km frente a ${(length / 1000).toFixed(2)} km`);
check('velocidad maxima con el Doppler del GPS', Math.abs(m.maxSpeedKmh - maxKmh) < 6, `${m.maxSpeedKmh.toFixed(1)} frente a ${maxKmh.toFixed(1)}`);
check('siguio grabando en segundo plano', m.points >= samples.length * 0.9, `${m.points} de ${samples.length}`);
check('detecta el frenazo fuerte', m.harshBrakes >= 1);
check('sin acelerones falsos', m.harshAccelerations === 0);
check('coste estimado con tu consumo y tu precio', m.cost > 0 && m.fuelUsed > 0, `${m.fuelUsed.toFixed(2)} L, ${m.cost.toFixed(2)} €`);
const odometer = await ev("GarageStore.vehicles.get('coche-prueba').then(v => v.odometer)");
check('suma los km al cuentakilometros estimado', odometer === Math.round(30000 + m.distanceKm), String(odometer));
check('el fichero nativo se borra tras importarlo', (await ev("Capacitor.Plugins.TripRecorder.listTrips().then(r => r.trips.length)")) === 0);

await ev("document.querySelector('#trip-list button').click()");
check('abre el detalle del viaje', await waitFor("document.getElementById('trip-dialog').open && document.querySelectorAll('#trip-map path.leaflet-interactive').length > 1", 6000));
check('grafica de velocidad', (await ev("!!Chart.getChart(document.getElementById('trip-speed-chart'))")) === true);
await ev("document.getElementById('trip-dialog-close').click()");

s.where = 'automatico';
await ev("(async () => { await Capacitor.Plugins.TripRecorder.setAutoDetect({ enabled: true }); })()");
check('activa la deteccion automatica', (await ev("Capacitor.Plugins.TripRecorder.status().then(r => r.autoDetect)")) === true);
adb('shell', 'am', 'broadcast', '-a', 'app.vercel.gasolineraplus.DEBUG_VEHICLE', '--es', 'state', 'enter', '-p', PKG);
check('al subir al coche empieza a grabar solo', await waitFor("Capacitor.Plugins.TripRecorder.status().then(r => r.recording && r.trip.auto)", 10000));
const [baseLat, baseLon] = coords[0];
for (let i = 0; i < 75; i++) {
    geoFix(baseLat + (i * 15) / 111320, baseLon, 15);
    await sleep(1000);
}
adb('shell', 'am', 'broadcast', '-a', 'app.vercel.gasolineraplus.DEBUG_VEHICLE', '--es', 'state', 'exit', '-p', PKG);
await sleep(1000);
await ev('Capacitor.Plugins.TripRecorder.stop()');
check('guarda el viaje automatico', await waitFor("GarageStore.trips.all().then(t => t.some(x => x.auto && x.metrics.distanceKm > 0.9))", 15000));
await ev("Capacitor.Plugins.TripRecorder.setAutoDetect({ enabled: false })");

s.finish('VIAJES ANDROID');
