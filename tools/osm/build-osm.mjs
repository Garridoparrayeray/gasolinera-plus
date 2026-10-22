import { readFileSync, writeFileSync } from 'node:fs';
import { osmToRaw } from './osm-hours.mjs';

const [osmPath, stationsPath, outPath] = process.argv.slice(2);
if (!osmPath || !stationsPath || !outPath) {
    console.error('uso: node build-osm.mjs <overpass.json> <stations-lite-pais.json> <osm-pais.json>');
    process.exit(1);
}

const MAX_METERS = 150;
const CELL = 0.01;
const GENERIC = /^(station[- ]service|station|carburants?|stations?|posto|posto de abastecimento|bomba de gasolina)$/i;

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

function addToGrid(grid, lat, lon, value) {
    const key = `${Math.floor(lat / CELL)}_${Math.floor(lon / CELL)}`;
    if (!grid.has(key)) {
        grid.set(key, []);
    }
    grid.get(key).push({ lat, lon, value });
}

function nearest(grid, station) {
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
    return best;
}

const brandGrid = new Map();
const hoursGrid = new Map();
for (const element of JSON.parse(readFileSync(osmPath, 'utf8')).elements) {
    let lat = element.lat;
    let lon = element.lon;
    if (element.center) {
        lat = element.center.lat;
        lon = element.center.lon;
    }
    if (typeof lat !== 'number') {
        continue;
    }
    const tags = element.tags || {};
    const label = labelOf(tags);
    if (label) {
        addToGrid(brandGrid, lat, lon, label);
    }
    const hours = osmToRaw(tags.opening_hours);
    if (hours) {
        addToGrid(hoursGrid, lat, lon, hours);
    }
}

const brands = {};
const hours = {};
const stations = JSON.parse(readFileSync(stationsPath, 'utf8')).stations;
for (const station of stations) {
    const brand = nearest(brandGrid, station);
    if (brand) {
        brands[station.ideess] = brand.value;
    }
    const schedule = nearest(hoursGrid, station);
    if (schedule) {
        hours[station.ideess] = schedule.value;
    }
}

writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), source: 'OpenStreetMap contributors (ODbL)', brands, hours }));
const total = stations.length;
console.log(`${Object.keys(brands).length} de ${total} con marca (${Math.round((Object.keys(brands).length / total) * 100)} %), ${Object.keys(hours).length} con horario (${Math.round((Object.keys(hours).length / total) * 100)} %)`);
if (Object.keys(brands).length + Object.keys(hours).length < total * 0.1) {
    console.error('Casi nada coincide: algo ha ido mal con los datos de OSM');
    process.exit(1);
}
