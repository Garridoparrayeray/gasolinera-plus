import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const GPFuel = new Function(readFileSync(join(root, 'js', 'fuel-math.js'), 'utf8') + '\nreturn GPFuel;')();

const car = { id: 'c1', fuel: 'gasoleo_a', tankCapacity: 50, homologated: 5.0, odometer: 10000 };

function refuel(date, odometer, liters, price, extra = {}) {
    return { id: date + odometer, vehicleId: 'c1', date, odometer, liters, pricePerUnit: price, total: +(liters * price).toFixed(2), full: true, missedBefore: false, ...extra };
}

const approx = (actual, expected, digits = 2) => assert.equal(+actual.toFixed(digits), +expected.toFixed(digits));

{
    const list = [
        refuel('2026-09-01T10:00:00Z', 10000, 40, 1.5),
        refuel('2026-09-10T10:00:00Z', 10800, 44, 1.6),
        refuel('2026-09-20T10:00:00Z', 11500, 38.5, 1.55),
    ];
    const intervals = GPFuel.intervals(list);
    assert.equal(intervals.length, 2, 'dos tramos lleno a lleno');
    approx(intervals[0].lPer100, 5.5);
    approx(intervals[1].lPer100, 5.5);
    const s = GPFuel.summary(car, list);
    approx(s.avgConsumption, 5.5);
    approx(s.costPerKm, (44 * 1.6 + 38.5 * 1.55) / 1500, 4);
    assert.equal(s.consumptionSource, 'real');
}

{
    const list = [
        refuel('2026-09-01T10:00:00Z', 10000, 40, 1.5),
        refuel('2026-09-05T10:00:00Z', 10300, 10, 1.5, { full: false }),
        refuel('2026-09-10T10:00:00Z', 10800, 34, 1.5),
    ];
    const intervals = GPFuel.intervals(list);
    assert.equal(intervals.length, 1, 'los parciales se suman al tramo');
    approx(intervals[0].liters, 44);
    approx(intervals[0].lPer100, 5.5);
}

{
    const list = [
        refuel('2026-09-01T10:00:00Z', 10000, 40, 1.5),
        refuel('2026-09-10T10:00:00Z', 10800, 44, 1.5, { missedBefore: true }),
        refuel('2026-09-20T10:00:00Z', 11500, 38.5, 1.5),
    ];
    const intervals = GPFuel.intervals(list);
    assert.equal(intervals.length, 1, 'un repostaje olvidado rompe la cadena');
    approx(intervals[0].km, 700);
}

{
    const list = [
        refuel('2026-09-01T10:00:00Z', 10000, 40, 1.5),
        refuel('2026-09-02T10:00:00Z', 10010, 40, 1.5),
    ];
    const intervals = GPFuel.intervals(list);
    assert.equal(intervals[0].suspicious, true, 'un consumo imposible queda marcado');
    const s = GPFuel.summary(car, list);
    assert.equal(s.consumptionSource, 'homologated', 'sin tramos fiables se usa el homologado');
    approx(s.avgConsumption, 5.0);
}

{
    const list = [
        refuel('2026-09-01T10:00:00Z', 10000, 40, 1.5),
        refuel('2026-09-10T10:00:00Z', 10800, 44, 1.6),
    ];
    const s = GPFuel.summary({ ...car, odometer: 11000 }, list);
    approx(s.tankLiters, 50 - 200 * 0.055);
    approx(s.tankPercent, (50 - 11) / 50 * 100, 1);
    approx(s.autonomyKm, (50 - 11) / 5.5 * 100, 0);
}

{
    const list = [
        refuel('2026-09-01T10:00:00Z', 10000, 20, 1.5, { full: false }),
    ];
    const s = GPFuel.summary(car, list);
    assert.equal(s.tankLiters, null, 'sin ningún lleno no se puede estimar el depósito');
}

{
    const list = [
        refuel('2026-08-31T22:30:00Z', 10000, 40, 1.5),
        refuel('2026-09-15T10:00:00Z', 10800, 44, 1.6),
    ];
    const months = GPFuel.monthlySpend(list);
    assert.deepEqual(Object.keys(months), ['2026-09'], 'el mes se cuenta en hora de Madrid');
    approx(months['2026-09'], 60 + 70.4);
}

{
    const list = [
        refuel('2026-09-10T10:00:00Z', 10000, 40, 1.5),
        refuel('2026-09-11T10:00:00Z', 10500, 30, 1.7),
    ];
    const saving = GPFuel.savings(list, { '2026-09-10': 1.6, '2026-09-11': 1.6 });
    approx(saving.amount, 40 * 0.1 - 30 * 0.1);
    assert.equal(saving.refuels, 2);
}

assert.equal(GPFuel.madridDate('2026-09-30T23:30:00Z'), '2026-10-01');
assert.equal(GPFuel.madridMonth('2026-12-31T23:30:00Z'), '2027-01');

console.log('fuel-math: OK');
