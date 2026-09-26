import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILDS_URL = 'https://build-metadata.protomaps.dev/builds.json';
const BUILD_BASE = 'https://build.protomaps.com/';
const ATTRIBUTION = '© OpenStreetMap contributors · Protomaps';
const here = dirname(fileURLToPath(import.meta.url));

const options = { pmtiles: 'pmtiles', out: null, build: '', only: [], threads: '8' };
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    const name = args[i];
    const value = args[i + 1];
    if (name === '--pmtiles') {
        options.pmtiles = value;
        i++;
    } else if (name === '--out') {
        options.out = value;
        i++;
    } else if (name === '--build') {
        options.build = value || '';
        i++;
    } else if (name === '--only') {
        options.only = String(value || '').split(',').filter(Boolean);
        i++;
    } else if (name === '--threads') {
        options.threads = value;
        i++;
    }
}
if (!options.out) {
    console.error('uso: node tools/maps/build-maps.mjs --out <carpeta> [--pmtiles <binario>] [--build AAAAMMDD] [--only id,id]');
    process.exit(1);
}

function log(message) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

function isoDate(build) {
    return `${build.slice(0, 4)}-${build.slice(4, 6)}-${build.slice(6, 8)}`;
}

async function reachable(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function pickBuild(wanted) {
    const response = await fetch(BUILDS_URL);
    if (!response.ok) {
        throw new Error(`No se pudo leer ${BUILDS_URL} (${response.status})`);
    }
    const builds = (await response.json()).filter((entry) => /^\d{8}\.pmtiles$/.test(entry.key));
    builds.sort((a, b) => b.key.localeCompare(a.key));
    for (const entry of builds) {
        const build = entry.key.slice(0, 8);
        if (wanted && build !== wanted) {
            continue;
        }
        if (await reachable(BUILD_BASE + entry.key)) {
            return { build, url: BUILD_BASE + entry.key, version: entry.version || '', size: entry.size || 0 };
        }
        log(`la build ${build} está en la lista pero no se puede descargar`);
    }
    if (wanted) {
        throw new Error(`La build ${wanted} de Protomaps no está disponible`);
    }
    throw new Error('No hay ninguna build de Protomaps disponible');
}

function run(argsList) {
    execFileSync(options.pmtiles, argsList, { stdio: 'inherit' });
}

function extract(url, target, bbox, maxzoom) {
    for (let attempt = 1; attempt <= 3; attempt++) {
        rmSync(target, { force: true });
        try {
            const started = Date.now();
            run(['extract', url, target, `--bbox=${bbox.join(',')}`, `--maxzoom=${maxzoom}`, `--download-threads=${options.threads}`, '--quiet']);
            run(['verify', target]);
            log(`extraído en ${((Date.now() - started) / 1000).toFixed(0)} s`);
            return statSync(target).size;
        } catch (error) {
            log(`fallo al extraer (intento ${attempt}): ${error.message}`);
            if (attempt === 3) {
                throw error;
            }
        }
    }
    return 0;
}

const config = JSON.parse(readFileSync(join(here, 'regions.json'), 'utf8'));
let regions = config.regions;
if (options.only.length) {
    regions = regions.filter((region) => options.only.includes(region.id));
}
if (!regions.length) {
    throw new Error('No hay regiones que generar');
}

const source = await pickBuild(options.build);
const buildDate = isoDate(source.build);
log(`build ${source.build} (basemap ${source.version}) · ${regions.length} regiones`);
mkdirSync(options.out, { recursive: true });

const entries = [];
for (const region of regions) {
    const file = `${region.id}-${source.build}.pmtiles`;
    const target = join(options.out, file);
    let maxzoom = config.maxzoom;
    let bytes = 0;
    while (true) {
        log(`${region.name}: extrayendo hasta z${maxzoom}`);
        bytes = extract(source.url, target, region.bbox, maxzoom);
        if (bytes <= config.maxBytes) {
            break;
        }
        if (maxzoom <= config.minzoom) {
            throw new Error(`${region.name} ocupa ${bytes} bytes incluso a z${maxzoom}`);
        }
        log(`${region.name}: ${(bytes / 1048576).toFixed(0)} MB supera el límite, bajo un nivel de zoom`);
        maxzoom--;
    }
    log(`${region.name}: ${(bytes / 1048576).toFixed(1)} MB a z${maxzoom}`);
    entries.push({ id: region.id, name: region.name, bbox: region.bbox, file, bytes, maxzoom, buildDate });
}

const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    build: source.build,
    buildDate,
    basemap: source.version,
    attribution: ATTRIBUTION,
    regions: entries,
};
writeFileSync(join(options.out, 'index.json'), JSON.stringify(index, null, 1));
const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
log(`index.json con ${entries.length} regiones, ${(total / 1073741824).toFixed(2)} GB en total`);
