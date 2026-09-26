import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GPTripMetrics = new Function(readFileSync(join(root, 'js', 'trip-metrics.js'), 'utf8') + '\nreturn GPTripMetrics;')();

const START = Date.parse('2026-09-25T08:00:00Z');
const METERS_PER_DEG_LAT = 111320;

function track(profile, options = {}) {
    const points = [];
    let lat = 43.0;
    const lon = -3.0;
    let t = START;
    for (const speed of profile) {
        let doppler = speed;
        if (options.noDoppler) {
            doppler = null;
        }
        points.push({ t, lat, lon, acc: options.acc || 5, speed: doppler });
        lat += speed / METERS_PER_DEG_LAT;
        t += 1000;
    }
    return points;
}

const approx = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} frente a ${expected}`);

{
    const profile = new Array(600).fill(100 / 3.6);
    const m = GPTripMetrics.compute(track(profile));
    approx(m.distanceKm, 16.64, 0.1, '10 min a 100 km/h');
    approx(m.maxSpeedKmh, 100, 1.5, 'velocidad máxima');
    approx(m.avgSpeedKmh, 100, 1.5, 'velocidad media en movimiento');
    approx(m.movingSeconds, 599, 3, 'tiempo en movimiento');
    assert.equal(m.harshBrakes, 0);
    assert.equal(m.harshAccelerations, 0);
}

{
    const moving = new Array(120).fill(15);
    const points = track([...moving, ...new Array(120).fill(0), ...moving]);
    for (let i = 120; i < 240; i++) {
        points[i].lat = points[119].lat + ((i % 3) - 1) * 0.00003;
        points[i].lon = points[119].lon + (((i + 1) % 3) - 1) * 0.00003;
        points[i].speed = 0.3;
    }
    for (let i = 240; i < points.length; i++) {
        points[i].lat = points[119].lat + (i - 239) * 15 / METERS_PER_DEG_LAT;
    }
    const m = GPTripMetrics.compute(points);
    approx(m.stoppedSeconds, 120, 8, 'tiempo parado');
    approx(m.distanceKm, 3.6, 0.1, 'el temblor parado no suma kilómetros');
}

{
    const profile = [...new Array(60).fill(30), 24, 18, 12, 6, 0, ...new Array(30).fill(0)];
    const m = GPTripMetrics.compute(track(profile));
    assert.equal(m.harshBrakes, 1, 'un frenazo de 30 m/s a 0 en 5 s');
    assert.equal(m.harshAccelerations, 0);
}

{
    const profile = [...new Array(30).fill(0), ...Array.from({ length: 8 }, (_, i) => (i + 1) * 3.5), ...new Array(60).fill(28)];
    const m = GPTripMetrics.compute(track(profile));
    assert.equal(m.harshAccelerations, 1, 'una aceleración brusca de 0 a 100 en 8 s');
}

{
    const points = track(new Array(300).fill(20));
    points[150] = { ...points[150], lat: points[150].lat + 0.03, speed: 20 };
    const m = GPTripMetrics.compute(points);
    approx(m.distanceKm, 6.0, 0.1, 'un salto de 3 km en un segundo se descarta');
    approx(m.maxSpeedKmh, 72, 2, 'el salto no dispara la máxima');
}

{
    const m = GPTripMetrics.compute(track(new Array(300).fill(25), { noDoppler: true }));
    approx(m.maxSpeedKmh, 90, 2, 'sin velocidad Doppler se deriva de las posiciones');
    approx(m.distanceKm, 7.48, 0.1, 'distancia sin Doppler');
}

{
    const m = GPTripMetrics.compute(track(new Array(300).fill(20), { acc: 80 }));
    assert.equal(m.distanceKm, 0, 'fixes de 80 m de error no cuentan');
    assert.equal(m.lowQuality, true);
}

{
    const profile = [...new Array(120).fill(130 / 3.6), ...new Array(120).fill(90 / 3.6)];
    const m = GPTripMetrics.compute(track(profile));
    approx(m.percentAbove120, 50, 2, 'mitad del tiempo por encima de 120');
    const bands = m.speedBands.map((b) => b.seconds);
    assert.ok(bands[3] > 100 && bands[5] > 100, 'perfil de velocidades por tramos');
}

{
    const m = GPTripMetrics.compute(track(new Array(600).fill(100 / 3.6)), { consumption: 6, pricePerUnit: 1.5 });
    approx(m.fuelUsed, 16.64 * 0.06, 0.02, 'litros estimados');
    approx(m.cost, 16.64 * 0.06 * 1.5, 0.05, 'coste estimado');
}

{
    const points = track(new Array(1200).fill(20));
    const thin = GPTripMetrics.thin(points);
    assert.ok(thin.length < 300 && thin.length > 150, `aligerado a ${thin.length} puntos`);
    const round = (p) => [p.t, +p.lat.toFixed(6), +p.lon.toFixed(6)];
    assert.deepEqual(thin[0].slice(0, 3), round(points[0]), 'conserva el primer punto');
    assert.deepEqual(thin[thin.length - 1].slice(0, 3), round(points[1199]), 'conserva el último punto');
}

console.log('trip-metrics: OK');
