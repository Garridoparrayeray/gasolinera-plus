import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

function findPhp() {
    if (process.env.PHP_PATH) {
        return process.env.PHP_PATH;
    }
    for (const candidate of ['php', 'C:/xampp/php/php.exe']) {
        try {
            execFileSync(candidate, ['-v'], { stdio: 'ignore' });
            return candidate;
        } catch (e) {
            continue;
        }
    }
    throw new Error('No encuentro PHP: define PHP_PATH');
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const html = execFileSync(findPhp(), [join(root, 'api', 'shell.php')], {
    env: { ...process.env, GP_NATIVE: '1', REQUEST_URI: '/' },
    maxBuffer: 16 * 1024 * 1024,
});
let page = html.toString('utf8');
if (process.env.GP_API_BASE) {
    const injected = `<script>window.GP_API_BASE = ${JSON.stringify(process.env.GP_API_BASE)};</script>
    <script defer src="/js/native.js"></script>`;
    page = page.replace('<script defer src="/js/native.js"></script>', injected);
    console.log('API apuntando a ' + process.env.GP_API_BASE + ' (solo para pruebas)');
}
writeFileSync(join(out, 'index.html'), page);

const copies = [
    'js',
    'vendor',
    'icons',
    'runners',
    'style.css',
    'manifest.json',
    'privacidad.html',
    'data/stations-lite.json',
    'data/price-index-seed',
];

let bytes = html.length;
for (const entry of copies) {
    const source = join(root, entry);
    if (!existsSync(source)) {
        continue;
    }
    const target = join(out, entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
    const stat = statSync(source);
    if (stat.isFile()) {
        bytes += stat.size;
    }
}

const graphSource = join(root, 'data', 'road-graph');
if (existsSync(join(graphSource, 'manifest.json'))) {
    const manifest = JSON.parse(readFileSync(join(graphSource, 'manifest.json'), 'utf8'));
    if (!manifest.parts) {
        throw new Error('data/road-graph tiene el formato antiguo (un solo main.bin). Descarga uno con paquetes por país.');
    }
    const home = manifest.countries[0];
    manifest.bundled = [home];
    const graphTarget = join(out, 'data', 'road-graph');
    mkdirSync(join(graphTarget, 'tiles'), { recursive: true });
    writeFileSync(join(graphTarget, 'manifest.json'), JSON.stringify(manifest));
    for (const name of [`main-${home}.bin.gz`, 'places.json']) {
        cpSync(join(graphSource, name), join(graphTarget, name));
        bytes += statSync(join(graphSource, name)).size;
    }
    for (const key of Object.keys(manifest.tiles)) {
        if (manifest.cells[key] === home) {
            cpSync(join(graphSource, 'tiles', `${key}.bin.gz`), join(graphTarget, 'tiles', `${key}.bin.gz`));
        }
    }
}

console.log(`www/ generado (${(bytes / 1024 / 1024).toFixed(1)} MB en ficheros sueltos, sin contar carpetas)`);
