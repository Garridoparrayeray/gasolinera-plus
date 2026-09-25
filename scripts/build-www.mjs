import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
    <script src="/js/native.js"></script>`;
    page = page.replace('<script src="/js/native.js"></script>', injected);
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
    'data/places.json',
    'data/road-graph',
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

console.log(`www/ generado (${(bytes / 1024 / 1024).toFixed(1)} MB en ficheros sueltos, sin contar carpetas)`);
