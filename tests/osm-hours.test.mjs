import assert from 'node:assert/strict';
import { osmToRaw } from '../tools/osm/osm-hours.mjs';

const cases = [
    ['24/7', 'L-D: 24H'],
    ['Mo-Su 00:00-24:00', 'L-D: 24H'],
    ['Mo-Su 06:00-22:00', 'L-D: 06:00-22:00'],
    ['Mo-Fr 07:00-20:00; Sa 08:00-13:00; Su off', 'L-V: 07:00-20:00; S: 08:00-13:00'],
    ['Mo-Sa 08:00-12:00,14:00-19:00', 'L-S: 08:00-12:00 Y 14:00-19:00'],
    ['Mo-Fr 06:00-22:00; Sa,Su 07:00-21:00; PH off', 'L-V: 06:00-22:00; S-D: 07:00-21:00'],
    ['Mo,We,Fr 08:00-18:00', 'L: 08:00-18:00; X: 08:00-18:00; V: 08:00-18:00'],
    ['08:00-20:00', 'L-D: 08:00-20:00'],
    ['Mo-Su 22:00-06:00', 'L-D: 22:00-06:00'],
    ['Mo-Su 7:00-9:30', 'L-D: 07:00-09:30'],
    ['Mo-Su sunrise-sunset', ''],
    ['Mo-Fr 08:00-18:00 open "con cita"', ''],
    ['Jan-Mar Mo-Su 08:00-20:00', ''],
    ['Mo[1] 08:00-12:00', ''],
    ['', ''],
    ['por la mañana', ''],
    ['Mo-Su 08:00-08:00', ''],
    ['PH,Mo-Su 00:00-24:00', 'L-D: 24H'],
    ['Mo-Su,PH 06:00-20:00', 'L-D: 06:00-20:00'],
    ['Mo-Fr 08:00-12:00, 14:00-18:00; Sa 08:00-12:00; Su,PH off', 'L-V: 08:00-12:00 Y 14:00-18:00; S: 08:00-12:00'],
    ['Mo-Su 08:00-20:00 || open "payez"', ''],
    ['off', ''],
    ['Mo-Su 00:00+', ''],
];

let failures = 0;
for (const [input, expected] of cases) {
    const actual = osmToRaw(input);
    if (actual !== expected) {
        failures++;
        console.log(`MAL "${input}": esperaba "${expected}" y salió "${actual}"`);
    }
}
assert.equal(failures, 0, `${failures} casos fallan`);
console.log(`osm-hours: OK (${cases.length} casos)`);
