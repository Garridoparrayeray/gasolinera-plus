import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.BASE_URL || 'http://localhost:8021').replace(/\/$/, '');

const GPNative = { cachedOfflineStations: async () => null };
const createEngine = new Function('GPNative', 'fetch', readFileSync(join(root, 'js', 'api.js'), 'utf8') + '\nreturn OfflineEngine;');
const engine = createEngine(GPNative, (url) => fetch(new URL(url, BASE)));
const runParity = new Function(readFileSync(join(root, 'tests', 'parity-lib.js'), 'utf8') + '\nreturn globalThis.runParity;')();

async function getJson(path) {
    const response = await fetch(BASE + path);
    if (!response.ok) {
        throw new Error(`${path} respondio ${response.status}`);
    }
    return response.json();
}

const result = await runParity(engine, getJson);
console.log(`paridad JS y PHP: ${result.comparisons} comparaciones`);
if (result.failures.length) {
    for (const failure of result.failures) {
        console.log('DIFERENCIA', failure);
    }
    console.log('RESULTADO paridad: FALLA');
    process.exit(1);
}
console.log('RESULTADO paridad: OK');
