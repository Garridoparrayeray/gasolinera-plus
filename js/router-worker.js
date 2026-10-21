importScripts('/js/router-core.js');

const LOCAL = '/data/road-graph/';
let remote = '';
let localManifest = null;
let remoteManifest = null;
let source = null;
let router = null;
let routerCountries = [];

async function fetchBytes(url, onProgress, cache) {
    if (cache) {
        const hit = await cache.match(url);
        if (hit) {
            return new Uint8Array(await hit.arrayBuffer());
        }
    }
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
    if (cache) {
        await cache.put(url, new Response(bytes));
    }
    return bytes;
}

async function decode(bytes) {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).arrayBuffer();
    }
    return bytes.buffer;
}

async function readFile(path, onProgress) {
    let lastError = null;
    for (const base of source.bases) {
        for (const name of [path + '.gz', path]) {
            try {
                return await decode(await fetchBytes(base.url + name, onProgress, base.cache));
            } catch (error) {
                lastError = error;
            }
        }
    }
    throw lastError;
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
        throw new Error(`El mapa de carreteras no está disponible (${response.status})`);
    }
    return response.json();
}

async function remoteSource() {
    if (!remoteManifest) {
        remoteManifest = await fetchJson(remote + LOCAL + 'manifest.json');
    }
    const name = 'road-graph-' + remoteManifest.builtAt;
    let cache = null;
    if (self.caches) {
        for (const key of await caches.keys()) {
            if (key.startsWith('road-graph-') && key !== name) {
                await caches.delete(key);
            }
        }
        cache = await caches.open(name);
    }
    const bases = [];
    if (remoteManifest.builtAt === localManifest.builtAt) {
        bases.push({ url: LOCAL, cache: null });
    }
    bases.push({ url: remote + LOCAL, cache });
    return { manifest: remoteManifest, bases, remote: true };
}

async function sourceFor(points) {
    if (!localManifest) {
        localManifest = await fetchJson(LOCAL + 'manifest.json');
    }
    if (!localManifest.bundled) {
        return { manifest: localManifest, bases: [{ url: LOCAL, cache: null }], remote: false };
    }
    if (source && source.remote) {
        return source;
    }
    const needed = GPRouter.countriesFor(localManifest, points);
    if (needed.every((country) => localManifest.bundled.includes(country))) {
        return { manifest: localManifest, bases: [{ url: LOCAL, cache: null }], remote: false, bundledOnly: true };
    }
    return remoteSource();
}

async function routerFor(id, points) {
    const next = await sourceFor(points);
    if (!source || next.manifest !== source.manifest) {
        router = null;
        routerCountries = [];
    }
    source = next;
    const manifest = source.manifest;
    const needed = GPRouter.countriesFor(manifest, points);
    if (router && needed.every((country) => routerCountries.includes(country))) {
        return router;
    }
    const countries = manifest.countries.filter((country) => needed.includes(country) || routerCountries.includes(country));
    const buffers = [];
    for (const country of countries) {
        buffers.push(await readFile(`main-${country}.bin`, (received, total) => {
            postMessage({ id, progress: { received, total: total || manifest.parts[country].bytes, country } });
        }));
    }
    postMessage({ id, progress: { done: true } });
    const loadTile = async (key) => {
        if (source.bundledOnly && !manifest.bundled.includes(manifest.cells[key])) {
            return null;
        }
        return readFile(`tiles/${key}.bin`);
    };
    router = new GPRouter.Router(manifest, buffers, loadTile);
    routerCountries = countries;
    return router;
}

let queue = Promise.resolve();

onmessage = (event) => {
    const { id, type, points, avoidTolls } = event.data;
    if (event.data.remote) {
        remote = event.data.remote;
    }
    queue = queue.then(async () => {
        try {
            if (type === 'route') {
                const current = await routerFor(id, points);
                const started = Date.now();
                const result = await current.route(points, { avoidTolls: Boolean(avoidTolls) });
                result.ms = Date.now() - started;
                result.countries = routerCountries;
                postMessage({ id, result });
                return;
            }
            postMessage({ id, result: { ready: true } });
        } catch (error) {
            postMessage({ id, error: error.message });
        }
    });
};
