import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const graphDir = process.env.GRAPH_DIR || join(root, 'data', 'road-graph');
if (!existsSync(join(graphDir, 'main.bin.gz'))) {
    console.log('router: SKIP (no hay grafo en ' + graphDir + ')');
    process.exit(0);
}

const GPRouter = new Function(readFileSync(join(root, 'js', 'router-core.js'), 'utf8') + '\nreturn GPRouter;')();
const toArrayBuffer = (gzipped) => {
    const buffer = gunzipSync(gzipped);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};
const manifest = JSON.parse(readFileSync(join(graphDir, 'manifest.json'), 'utf8'));
const loadStart = Date.now();
const router = new GPRouter.Router(manifest, toArrayBuffer(readFileSync(join(graphDir, 'main.bin.gz'))), async (key) => toArrayBuffer(readFileSync(join(graphDir, 'tiles', `${key}.bin.gz`))));
const loadMs = Date.now() - loadStart;

const cases = [
    { name: 'Bilbao → Madrid', from: [43.2630, -2.9350], to: [40.4168, -3.7038], km: [380, 440], hours: [3.4, 5.0] },
    { name: 'Bilbao → Donostia', from: [43.2630, -2.9350], to: [43.3183, -1.9812], km: [95, 125], hours: [0.9, 1.6] },
    { name: 'Moyua → Casco Viejo (Bilbao)', from: [43.2630, -2.9350], to: [43.2575, -2.9236], km: [0.9, 3.5], hours: [0.02, 0.25] },
    { name: 'Santa Cruz → La Laguna (Tenerife)', from: [28.4636, -16.2518], to: [28.4874, -16.3159], km: [7, 14], hours: [0.1, 0.4] },
    { name: 'Barcelona → Sevilla', from: [41.3874, 2.1686], to: [37.3891, -5.9845], km: [950, 1100], hours: [9, 12.5] },
    { name: 'Bilbao → Madrid parando en Burgos', from: [43.2630, -2.9350], via: [42.3439, -3.6969], to: [40.4168, -3.7038], km: [390, 460], hours: [3.6, 5.3] },
];

let failures = 0;
for (const c of cases) {
    const points = [c.from];
    if (c.via) {
        points.push(c.via);
    }
    points.push(c.to);
    const started = Date.now();
    const result = await router.route(points);
    const ms = Date.now() - started;
    if (result.error) {
        failures++;
        console.log(`MAL ${c.name}: ${result.error}`);
        continue;
    }
    const km = result.meters / 1000;
    const hours = result.seconds / 3600;
    let ok = km >= c.km[0] && km <= c.km[1] && hours >= c.hours[0] && hours <= c.hours[1] && ms < 6000;
    const first = result.coords[0];
    const last = result.coords[result.coords.length - 1];
    if (GPRouter.metersBetween(first[0], first[1], c.from[0], c.from[1]) > 600 || GPRouter.metersBetween(last[0], last[1], c.to[0], c.to[1]) > 600) {
        ok = false;
    }
    if (!ok) {
        failures++;
    }
    let label = 'MAL';
    if (ok) {
        label = 'OK ';
    }
    console.log(`${label} ${c.name}: ${km.toFixed(1)} km, ${Math.floor(hours)} h ${Math.round((hours % 1) * 60)} min, ${result.coords.length} puntos, ${result.visited} nodos visitados, ${ms} ms`);
}

const island = await router.route([[40.4168, -3.7038], [39.5696, 2.6502]]);
assert.equal(island.error, 'no-connection', 'Madrid → Palma no tiene conexión por carretera');
console.log('OK  Madrid → Palma responde sin conexión por carretera');

const sea = await router.route([[43.6, -3.2], [43.2630, -2.9350]]);
assert.equal(sea.error, 'no-road', 'un punto en el mar no tiene carretera');
console.log('OK  un punto en el mar no se ajusta a ninguna carretera');

console.log(`carga del grafo: ${loadMs} ms`);
if (failures) {
    console.log(`router: ${failures} fallos`);
    process.exit(1);
}
console.log('router: OK');
