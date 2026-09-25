importScripts('/js/router-core.js');

const BASE = '/data/road-graph/';
let routerPromise = null;

async function readBuffer(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`No se pudo descargar ${url} (${response.status})`);
    }
    const total = Number(response.headers.get('Content-Length')) || 0;
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        chunks.push(value);
        received += value.length;
        if (onProgress) {
            onProgress(received, total);
        }
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
    }
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).arrayBuffer();
    }
    return bytes.buffer;
}

function load(id) {
    if (!routerPromise) {
        routerPromise = (async () => {
            const manifest = await (await fetch(BASE + 'manifest.json')).json();
            const main = await readBuffer(BASE + 'main.bin.gz', (received, total) => {
                postMessage({ id, progress: { received, total: total || manifest.mainBytes } });
            });
            return new GPRouter.Router(manifest, main, (key) => readBuffer(`${BASE}tiles/${key}.bin.gz`));
        })();
        routerPromise.catch(() => {
            routerPromise = null;
        });
    }
    return routerPromise;
}

onmessage = async (event) => {
    const { id, type, points } = event.data;
    try {
        const router = await load(id);
        if (type === 'route') {
            const started = Date.now();
            const result = await router.route(points);
            result.ms = Date.now() - started;
            postMessage({ id, result });
            return;
        }
        postMessage({ id, result: { ready: true } });
    } catch (error) {
        postMessage({ id, error: error.message });
    }
};
