importScripts('/js/router-core.js');

const BASE = '/data/road-graph/';
let routerPromise = null;

async function readBuffer(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`No se pudo descargar ${url} (${response.status})`);
    }
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('text/html')) {
        throw new Error(`No existe ${url}`);
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

async function readGraphFile(path, onProgress) {
    try {
        return await readBuffer(BASE + path + '.gz', onProgress);
    } catch (error) {
        return readBuffer(BASE + path, onProgress);
    }
}

function load(id) {
    if (!routerPromise) {
        routerPromise = (async () => {
            const manifestResponse = await fetch(BASE + 'manifest.json');
            if (!manifestResponse.ok) {
                throw new Error(`El mapa de carreteras no está disponible en el servidor (${manifestResponse.status})`);
            }
            const manifest = await manifestResponse.json();
            const main = await readGraphFile('main.bin', (received, total) => {
                postMessage({ id, progress: { received, total: total || manifest.mainBytes } });
            });
            postMessage({ id, progress: { done: true } });
            return new GPRouter.Router(manifest, main, (key) => readGraphFile(`tiles/${key}.bin`));
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
