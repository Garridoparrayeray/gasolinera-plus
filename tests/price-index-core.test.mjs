import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const Core = new Function(readFileSync(join(root, 'js', 'price-index-core.js'), 'utf8') + '\nreturn GPPriceIndexCore;')();

const approx = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} frente a ${expected}`);

assert.equal(Core.cellKey(43.263, -2.935), '432_-30', 'la clave de cuadricula coincide con la del generador PHP');
assert.equal(Core.cellKey(40.4168, -3.7038), '404_-38', 'cuadricula de Madrid');

{
    const keys = Core.cellsAround(43.263, -2.935, 10);
    assert.ok(keys.includes('432_-30'), 'incluye la cuadricula propia');
    assert.ok(keys.length >= 2 && keys.length <= 12, `numero razonable de cuadriculas: ${keys.length}`);
    assert.ok(Core.cellsAround(43.263, -2.935, 30).length > keys.length, 'un radio mayor cubre mas cuadriculas');
}

assert.deepEqual(Core.datesBetween('2026-09-28', '2026-10-01'), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
assert.equal(Core.addDays('2026-03-01', -1), '2026-02-28');

{
    const week = Core.periodOf('2026-09-29', 'week');
    assert.equal(week.from, '2026-09-28', 'la semana empieza en lunes');
    assert.equal(week.to, '2026-10-04');
    assert.ok(week.label.startsWith('Semana 40'), week.label);
    const month = Core.periodOf('2026-09-29', 'month');
    assert.equal(month.from, '2026-09-01');
    assert.equal(month.to, '2026-09-30');
    assert.equal(month.label, 'septiembre 2026');
    assert.equal(Core.periodOf('2026-02-10', 'month').to, '2026-02-28');
}

const months = {
    '2026-09': {
        fuels: ['gasoleo_a', 'gasolina_95_e5'],
        days: {
            '2026-09-10': { n: [3000, 2, 0, 0], p: { 48: [1000, 1, 0, 0], 28: [2000, 1, 0, 0] }, c: { '432_-30': [1000, 1, 0, 0] } },
            '2026-09-11': { n: [4000, 2, 3800, 2], p: { 48: [2000, 1, 0, 0] }, c: { '432_-30': [2200, 1, 0, 0], '999_1': [500, 1, 0, 0] } },
        },
    },
};

{
    const one = Core.average(months, 'gasoleo_a', ['2026-09-10'], { type: 'national' });
    approx(one.avg, 1.5, 1e-9, 'media nacional de un dia');
    assert.equal(one.samples, 2);
    const two = Core.average(months, 'gasoleo_a', ['2026-09-10', '2026-09-11', '2026-09-12'], { type: 'national' });
    approx(two.avg, 7000 / 4 / 1000, 1e-9, 'la media de un periodo pondera por numero de precios');
    assert.equal(two.days, 2, 'los dias sin dato no cuentan');
    const province = Core.average(months, 'gasoleo_a', ['2026-09-10', '2026-09-11'], { type: 'province', id: '48' });
    approx(province.avg, 1.5, 1e-9, 'media provincial');
    const zone = Core.average(months, 'gasoleo_a', ['2026-09-10', '2026-09-11'], { type: 'zone', keys: ['432_-30', '000_0'] });
    approx(zone.avg, 3200 / 2 / 1000, 1e-9, 'media de una zona con una cuadricula sin datos');
    assert.equal(Core.average(months, 'gasolina_95_e5', ['2026-09-10'], { type: 'national' }), null, 'sin precios no hay media');
    assert.equal(Core.average(months, 'glp', ['2026-09-10'], { type: 'national' }), null, 'combustible fuera del indice');
}

assert.equal(Core.nearestDay(months, '2026-09-13', 3), '2026-09-11');
assert.equal(Core.nearestDay(months, '2026-09-20', 3), null);

console.log('price-index-core: OK');
