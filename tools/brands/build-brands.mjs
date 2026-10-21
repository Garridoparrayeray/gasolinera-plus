import { readFileSync, writeFileSync } from 'node:fs';

const [osmPath, stationsPath, outPath] = process.argv.slice(2);
if (!osmPath || !stationsPath || !outPath) {
    console.error('uso: node build-brands.mjs <overpass.json> <stations-lite-fr.json> <brands-fr.json>');
    process.exit(1);
}

const MAX_METERS = 150;
const CELL = 0.01;
const GENERIC = /^(station[- ]service|station|carburants?|stations?)$/i;

function meters(lat1, lon1, lat2, lon2) {
    const rad = Math.PI / 180;
    const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
    const y = (lat2 - lat1) * rad;
    return Math.sqrt(x * x + y * y) * 6371000;
}

function labelOf(tags) {
    for (const key of ['brand', 'operator', 'name']) {
        const value = (tags[key] || '').trim();
        if (value && !GENERIC.test(value)) {
            return value;
        }
    }
    return '';
}

const grid = new Map();
for (const element of JSON.parse(readFileSync(osmPath, 'utf8')).elements) {
    let lat = element.lat;
    let lon = element.lon;
    if (element.center) {
        lat = element.center.lat;
        lon = element.center.lon;
    }
    const label = labelOf(element.tags || {});
    if (typeof lat !== 'number' || !label) {
        continue;
    }
    const key = `${Math.floor(lat / CELL)}_${Math.floor(lon / CELL)}`;
    if (!grid.has(key)) {
        grid.set(key, []);
    }
    grid.get(key).push({ lat, lon, label });
}

const brands = {};
let matched = 0;
const stations = JSON.parse(readFileSync(stationsPath, 'utf8')).stations;
for (const station of stations) {
    const cy = Math.floor(station.lat / CELL);
    const cx = Math.floor(station.lon / CELL);
    let best = null;
    let bestDistance = MAX_METERS;
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            for (const candidate of grid.get(`${cy + dy}_${cx + dx}`) || []) {
                const distance = meters(station.lat, station.lon, candidate.lat, candidate.lon);
                if (distance < bestDistance) {
                    bestDistance = distance;
                    best = candidate;
                }
            }
        }
    }
    if (best) {
        brands[station.ideess] = best.label;
        matched++;
    }
}

writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: 'OpenStreetMap contributors (ODbL)', brands }));
console.log(`${matched} de ${stations.length} gasolineras con marca (${Math.round((matched / stations.length) * 100)} %)`);
if (matched < stations.length * 0.5) {
    console.error('Menos de la mitad con marca: algo ha ido mal con los datos de OSM');
    process.exit(1);
}
