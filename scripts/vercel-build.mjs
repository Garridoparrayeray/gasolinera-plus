import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public');

try {
    execFileSync(process.execPath, [join(root, 'tools', 'graph', 'fetch-graph.mjs')], { stdio: 'inherit' });
} catch (error) {
    console.log('Sin grafo de carreteras publicado: la ruta no funcionará en este despliegue');
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const copies = [
    'js',
    'vendor',
    'icons',
    'style.css',
    'sw.js',
    'manifest.json',
    'privacidad.html',
    'data/stations-lite.json',
    'data/road-graph',
    'docs/guia-usuario.pdf',
];

for (const entry of copies) {
    const source = join(root, entry);
    if (!existsSync(source)) {
        continue;
    }
    const target = join(out, entry);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
}

console.log('public/ generado');
