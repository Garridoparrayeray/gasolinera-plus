import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repo = process.env.GITHUB_REPOSITORY || 'Garridoparrayeray/gasolinera-plus';
const url = `https://github.com/${repo}/releases/download/road-graph/road-graph.tar.gz`;
const target = join(root, 'data', 'road-graph');

const response = await fetch(url);
if (!response.ok) {
    console.error(`No hay grafo publicado (${response.status}) en ${url}`);
    process.exit(1);
}
const archive = join(tmpdir(), `road-graph-${Date.now()}.tar.gz`);
writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
execFileSync('tar', ['-xzf', archive, '-C', target], { stdio: 'inherit' });
rmSync(archive, { force: true });
console.log(`Grafo de carreteras descargado en ${target}`);
