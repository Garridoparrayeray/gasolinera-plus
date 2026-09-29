import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repo = process.env.GITHUB_REPOSITORY || 'Garridoparrayeray/gasolinera-plus';
const base = `https://github.com/${repo}/releases/download/price-index/`;
const target = join(root, 'data', 'price-index-seed');

async function download(name) {
    const response = await fetch(base + name);
    if (!response.ok) {
        throw new Error(`No se puede descargar ${name} (${response.status})`);
    }
    return Buffer.from(await response.arrayBuffer());
}

const manifestBuffer = await download('index.json');
const manifest = JSON.parse(manifestBuffer.toString('utf8'));
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
writeFileSync(join(target, 'index.json'), manifestBuffer);
for (const entry of manifest.months) {
    writeFileSync(join(target, entry.file), await download(entry.file));
}
console.log(`Índice de precios incluido en la app: ${manifest.months.length} meses`);
