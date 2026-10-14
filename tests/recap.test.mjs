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
    const refuels = [refuel(previous + '-15T10:00:00Z', 10000), refuel(thisMonth + '-01T10:00:00Z', 10500), refuel(thisMonth + '-02T10:00:00Z', 10900)];
    const stats = GPRecap.compute({ ...car, odometer: 11300 }, refuels, 'month', []);
    assert.equal(stats.km, 1300, 'los km del mes cuentan desde el último repostaje anterior hasta el cuentakilómetros actual');
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

console.log('recap: OK');
