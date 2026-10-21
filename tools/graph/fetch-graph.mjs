import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const repo = process.env.GITHUB_REPOSITORY || 'Garridoparrayeray/gasolinera-plus';
let tag = 'road-graph';
if (process.env.ROAD_GRAPH_TAG) {
    tag = process.env.ROAD_GRAPH_TAG;
}
const url = `https://github.com/${repo}/releases/download/${tag}/road-graph.tar.gz`;
const target = join(root, 'data', 'road-graph');

const response = await fetch(url);
if (!response.ok) {
    console.error(`No hay grafo publicado (${response.status}) en ${url}`);
    process.exit(1);
}
rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
const archive = join(target, 'road-graph.tar.gz');
writeFileSync(archive, Buffer.from(await response.arrayBuffer()));
execFileSync('tar', ['-xzf', 'road-graph.tar.gz'], { cwd: target, stdio: 'inherit' });
rmSync(archive, { force: true });
console.log(`Grafo de carreteras descargado en ${target}`);
