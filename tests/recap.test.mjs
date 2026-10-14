import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GPFuel = new Function(readFileSync(join(root, 'js', 'fuel-math.js'), 'utf8') + '\nreturn GPFuel;')();
const AlertsStore = { unitFor: () => 'L' };
const GPRecap = new Function('GPFuel', 'AlertsStore', readFileSync(join(root, 'js', 'recap.js'), 'utf8') + '\nreturn GPRecap;')(GPFuel, AlertsStore);

const now = new Date();
const thisMonth = now.toISOString().slice(0, 7);
const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15)).toISOString().slice(0, 7);
const car = { id: 'c1', name: 'Coche', fuel: 'gasoleo_a', tankCapacity: 50, homologated: 5, odometer: 12000 };

function refuel(date, odometer) {
    return { id: date, vehicleId: 'c1', date, odometer, liters: 40, pricePerUnit: 1.5, total: 60, full: true, missedBefore: false };
}

{
    const refuels = [refuel(previous + '-15T10:00:00Z', 10000), refuel(thisMonth + '-10T10:00:00Z', 10500), refuel(thisMonth + '-12T10:00:00Z', 10900)];
    const startMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const prevMs = Date.parse(previous + '-15T10:00:00Z');
    const firstMs = Date.parse(thisMonth + '-10T10:00:00Z');
    const atStart = 10000 + 500 * ((startMs - prevMs) / (firstMs - prevMs));
    const stats = GPRecap.compute({ ...car, odometer: 11300 }, refuels, 'month', []);
    assert.ok(Math.abs(stats.km - (11300 - atStart)) < 0.5, 'los km del mes salen del cuentakilómetros actual menos el que había al empezar el mes (repartido entre el repostaje anterior y el primero)');
    assert.ok(stats.km > 800 && stats.km < 1300, 'incluye lo conducido antes del primer repostaje del mes');
}

{
    const refuels = [refuel(previous + '-20T10:00:00Z', 10000), refuel(thisMonth + '-01T09:00:00Z', 10500)];
    const stats = GPRecap.compute({ ...car, odometer: 10500 }, refuels, 'month', []);
    assert.ok(stats.km > 0 && stats.km < 100, 'con un repostaje a primeros de mes solo cuenta lo hecho ese mes');
    assert.ok(Math.abs(stats.consumption - 8) < 0.001, 'el consumo usa el depósito anterior aunque se llenara el mes pasado: 40 L en 500 km');
}

{
    const refuels = [refuel(thisMonth + '-01T10:00:00Z', 10500), refuel(thisMonth + '-02T10:00:00Z', 10900)];
    const stats = GPRecap.compute({ ...car, odometer: 11300 }, refuels, 'month', []);
    assert.equal(stats.km, 800, 'sin repostaje anterior cuenta desde el primero del mes');
}

{
    const refuels = [refuel(thisMonth + '-01T10:00:00Z', 10500)];
    const stats = GPRecap.compute({ ...car, odometer: 10800 }, refuels, 'month', []);
    assert.equal(stats.km, 300, 'con un solo repostaje también salen los km recorridos desde él');
}

{
    const refuels = [refuel(thisMonth + '-03T10:00:00Z', 10500), refuel(thisMonth + '-12T10:00:00Z', 10934)];
    const startedAt = thisMonth + '-05T10:00:00Z';
    const trips = [{ vehicleId: 'c1', startedAt, metrics: { distanceKm: 500, maxSpeedKmh: 120 } }, { vehicleId: 'c1', startedAt, metrics: { distanceKm: 282, maxSpeedKmh: 90 } }];
    const stats = GPRecap.compute({ ...car, odometer: 10934 }, refuels, 'month', trips);
    assert.equal(stats.tripKm, 782);
    assert.equal(stats.km, 782, 'si los viajes grabados suman más que los repostajes, los km del resumen coinciden con los viajes');
    const small = GPRecap.compute({ ...car, odometer: 10934 }, refuels, 'month', [{ vehicleId: 'c1', startedAt, metrics: { distanceKm: 100, maxSpeedKmh: 90 } }]);
    assert.equal(small.km, 434, 'si los viajes suman menos, se mantienen los km del cuentakilómetros');
}

console.log('recap: OK');
