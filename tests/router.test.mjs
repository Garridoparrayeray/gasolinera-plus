import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const graphDir = process.env.GRAPH_DIR || join(root, 'data', 'road-graph');
if (!existsSync(join(graphDir, 'manifest.json')) || !JSON.parse(readFileSync(join(graphDir, 'manifest.json'), 'utf8')).parts) {
    console.log('router: SKIP (no hay grafo en ' + graphDir + ')');
    process.exit(0);
}

const GPRouter = new Function(readFileSync(join(root, 'js', 'router-core.js'), 'utf8') + '\nreturn GPRouter;')();
const toArrayBuffer = (gzipped) => {
    const buffer = gunzipSync(gzipped);
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};
const manifest = JSON.parse(readFileSync(join(graphDir, 'manifest.json'), 'utf8'));
const routers = new Map();
let loadMs = 0;
function routerFor(points) {
    const countries = GPRouter.countriesFor(manifest, points);
    const key = countries.join(',');
    if (!routers.has(key)) {
        const loadStart = Date.now();
        const parts = countries.map((country) => toArrayBuffer(readFileSync(join(graphDir, `main-${country}.bin.gz`))));
        routers.set(key, new GPRouter.Router(manifest, parts, async (tile) => toArrayBuffer(readFileSync(join(graphDir, 'tiles', `${tile}.bin.gz`)))));
        loadMs = Math.max(loadMs, Date.now() - loadStart);
    }
    return routers.get(key);
}

assert.deepEqual(GPRouter.countriesFor(manifest, [[43.2630, -2.9350], [40.4168, -3.7038]]), ['es'], 'Bilbao → Madrid solo necesita España');
assert.deepEqual(GPRouter.countriesFor(manifest, [[43.2630, -2.9350], [41.3874, 2.1686]]), ['es'], 'Bilbao → Barcelona solo necesita España');
console.log('OK  una ruta dentro de España no descarga otros países');

const cases = [
    { name: 'Bilbao → Madrid', from: [43.2630, -2.9350], to: [40.4168, -3.7038], km: [380, 440], hours: [3.4, 5.0] },
    { name: 'Bilbao → Donostia', from: [43.2630, -2.9350], to: [43.3183, -1.9812], km: [95, 125], hours: [0.9, 1.6] },
    { name: 'Moyua → Casco Viejo (Bilbao)', from: [43.2630, -2.9350], to: [43.2575, -2.9236], km: [0.9, 3.5], hours: [0.02, 0.25] },
    { name: 'Santa Cruz → La Laguna (Tenerife)', from: [28.4636, -16.2518], to: [28.4874, -16.3159], km: [7, 14], hours: [0.1, 0.4] },
    { name: 'Barcelona → Sevilla', from: [41.3874, 2.1686], to: [37.3891, -5.9845], km: [950, 1100], hours: [9, 12.5] },
    { name: 'Bilbao → Madrid parando en Burgos', from: [43.2630, -2.9350], via: [42.3439, -3.6969], to: [40.4168, -3.7038], km: [390, 460], hours: [3.6, 5.3] },
    { name: 'Lisboa → Oporto', from: [38.7223, -9.1393], to: [41.1579, -8.6291], km: [290, 350], hours: [2.6, 4.2] },
    { name: 'Bilbao → Lisboa', from: [43.2630, -2.9350], to: [38.7223, -9.1393], km: [850, 1000], hours: [8, 11.5] },
    { name: 'Bilbao → Burdeos', from: [43.2630, -2.9350], to: [44.8378, -0.5792], km: [300, 380], hours: [3, 4.8] },
    { name: 'París → Versalles', from: [48.8566, 2.3522], to: [48.8049, 2.1204], km: [15, 30], hours: [0.3, 1.0] },
];

let failures = 0;
for (const c of cases) {
    const points = [c.from];
    if (c.via) {
        points.push(c.via);
    }
    points.push(c.to);
    const started = Date.now();
    const result = await routerFor(points).route(points);
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

const island = await routerFor([[40.4168, -3.7038], [39.5696, 2.6502]]).route([[40.4168, -3.7038], [39.5696, 2.6502]]);
assert.equal(island.error, 'no-connection', 'Madrid → Palma no tiene conexión por carretera');
console.log('OK  Madrid → Palma responde sin conexión por carretera');

const sea = await routerFor([[43.6, -3.2], [43.2630, -2.9350]]).route([[43.6, -3.2], [43.2630, -2.9350]]);
assert.equal(sea.error, 'no-road', 'un punto en el mar no tiene carretera');
console.log('OK  un punto en el mar no se ajusta a ninguna carretera');

console.log(`carga del grafo (la más lenta): ${loadMs} ms, combinaciones de países: ${[...routers.keys()].join(' | ')}`);
if (failures) {
    console.log(`router: ${failures} fallos`);
    process.exit(1);
}
console.log('router: OK');
