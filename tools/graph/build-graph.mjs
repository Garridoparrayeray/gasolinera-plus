import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeBlob, parsePrimitiveBlock, readBlobs } from './pbf.mjs';
import { writeGraph } from './write-graph.mjs';

const input = process.argv[2];
const outDir = process.argv[3];
if (!input || !outDir) {
    console.error('uso: node build-graph.mjs <espana.osm.pbf> <carpeta-salida>');
    process.exit(1);
}

const MAIN_CLASSES = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link'];
const DETAIL_CLASSES = ['unclassified', 'residential', 'living_street', 'road'];
const CLASSES = [...MAIN_CLASSES, ...DETAIL_CLASSES];
const MAIN_CLASS_COUNT = MAIN_CLASSES.length;
const DEFAULT_SPEED = {
    motorway: 110, motorway_link: 55, trunk: 90, trunk_link: 45, primary: 70, primary_link: 40,
    secondary: 60, secondary_link: 35, tertiary: 50, tertiary_link: 30,
    unclassified: 40, residential: 25, living_street: 10, road: 30,
};
const MAX_SPEED = { motorway: 120, trunk: 110, primary: 100, secondary: 90, tertiary: 90 };
const BLOCKED_ACCESS = new Set(['no', 'private', 'agricultural', 'forestry', 'delivery', 'customers', 'emergency']);
const ALLOWED_OVERRIDE = new Set(['yes', 'permissive', 'destination', 'designated']);
const TILE_DEG = 0.25;
const MIN_COMPONENT = 300;
const SIMPLIFY_METERS = 8;

function log(message) {
    console.log(`[${new Date().toISOString().slice(11, 19)}] ${message}`);
}

class GrowArray {
    constructor(Type, initial = 1 << 20) {
        this.Type = Type;
        this.data = new Type(initial);
        this.length = 0;
    }

    push(value) {
        if (this.length === this.data.length) {
            const next = new this.Type(this.data.length * 2);
            next.set(this.data);
            this.data = next;
        }
        this.data[this.length++] = value;
    }

    view() {
        return this.data.subarray(0, this.length);
    }
}

function parseMaxspeed(value) {
    if (!value) {
        return 0;
    }
    if (value === 'ES:urban') {
        return 50;
    }
    if (value === 'ES:rural') {
        return 90;
    }
    if (value === 'ES:motorway') {
        return 120;
    }
    if (value === 'ES:trunk') {
        return 100;
    }
    if (value === 'ES:living_street') {
        return 20;
    }
    const match = /^(\d+)/.exec(value);
    if (!match) {
        return 0;
    }
    let speed = Number(match[1]);
    if (value.includes('mph')) {
        speed = Math.round(speed * 1.609);
    }
    return speed;
}

function isDrivable(tags) {
    if (tags.area === 'yes') {
        return false;
    }
    const vehicleRule = tags.motorcar || tags.motor_vehicle || tags.vehicle;
    if (vehicleRule === 'no' || vehicleRule === 'private') {
        return false;
    }
    if (tags.access && BLOCKED_ACCESS.has(tags.access) && !ALLOWED_OVERRIDE.has(vehicleRule)) {
        return false;
    }
    return true;
}

function onewayOf(tags) {
    const value = tags.oneway;
    if (value === 'yes' || value === '1' || value === 'true') {
        return 1;
    }
    if (value === '-1' || value === 'reverse') {
        return -1;
    }
    if (value === 'no' || value === 'false' || value === '0' || value === 'reversible' || value === 'alternating') {
        return 0;
    }
    if (tags.highway === 'motorway' || tags.junction === 'roundabout' || tags.junction === 'circular') {
        return 1;
    }
    return 0;
}

function speedOf(tags) {
    const base = tags.highway.replace('_link', '');
    const declared = parseMaxspeed(tags['maxspeed:forward'] || tags.maxspeed);
    let speed = DEFAULT_SPEED[tags.highway];
    if (declared > 0) {
        speed = Math.round(declared * 0.85);
        if (tags.highway.endsWith('_link')) {
            speed = Math.min(speed, DEFAULT_SPEED[tags.highway] + 15);
        }
    }
    if (MAX_SPEED[base]) {
        speed = Math.min(speed, MAX_SPEED[base]);
    }
    return Math.max(5, speed);
}

function haversine(lat1, lon1, lat2, lon2) {
    const p = Math.PI / 180;
    const a = 0.5 - Math.cos((lat2 - lat1) * p) / 2 + Math.cos(lat1 * p) * Math.cos(lat2 * p) * (1 - Math.cos((lon2 - lon1) * p)) / 2;
    return 12742000 * Math.asin(Math.sqrt(a));
}

const t0 = Date.now();
log('pasada 1: vías transitables');
const wayClass = new GrowArray(Uint8Array);
const wayOneway = new GrowArray(Int8Array);
const waySpeed = new GrowArray(Uint8Array);
const wayToll = new GrowArray(Uint8Array);
const wayRefStart = new GrowArray(Uint32Array);
const wayRefCount = new GrowArray(Uint32Array);
const refIds = new GrowArray(Float64Array, 1 << 24);
const nodeBlocks = [];

for (const { type, blob, offset, size } of readBlobs(input)) {
    if (type !== 'OSMData') {
        continue;
    }
    const data = decodeBlob(blob);
    const kinds = parsePrimitiveBlock(data, {
        wayKey: 'highway',
        way: (way) => {
            const classIndex = CLASSES.indexOf(way.tags.highway);
            if (classIndex === -1 || way.refs.length < 2 || !isDrivable(way.tags)) {
                return;
            }
            wayClass.push(classIndex);
            wayOneway.push(onewayOf(way.tags));
            waySpeed.push(speedOf(way.tags));
            let toll = 0;
            if (way.tags.toll === 'yes') {
                toll = 1;
            }
            wayToll.push(toll);
            wayRefStart.push(refIds.length);
            wayRefCount.push(way.refs.length);
            for (const ref of way.refs) {
                refIds.push(ref);
            }
        },
    });
    if (kinds.dense) {
        nodeBlocks.push({ offset, size });
    }
}
const wayCount = wayClass.length;
log(`${wayCount} vías, ${refIds.length} referencias a nodos, ${nodeBlocks.length} bloques de nodos`);

log('nodos únicos y cruces');
const sortedRefs = Float64Array.from(refIds.view()).sort();
const uniqueIds = new GrowArray(Float64Array, 1 << 24);
const useCount = new GrowArray(Uint8Array, 1 << 24);
for (let i = 0; i < sortedRefs.length; i++) {
    if (i > 0 && sortedRefs[i] === sortedRefs[i - 1]) {
        const last = uniqueIds.length - 1;
        if (useCount.data[last] < 255) {
            useCount.data[last]++;
        }
        continue;
    }
    uniqueIds.push(sortedRefs[i]);
    useCount.push(1);
}
const ids = uniqueIds.view();
const uses = useCount.view();
const nodeCount = ids.length;

function indexOfId(id) {
    let lo = 0;
    let hi = nodeCount - 1;
    while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const value = ids[mid];
        if (value < id) {
            lo = mid + 1;
        } else if (value > id) {
            hi = mid - 1;
        } else {
            return mid;
        }
    }
    return -1;
}

const refIndex = new Uint32Array(refIds.length);
const refData = refIds.view();
for (let i = 0; i < refData.length; i++) {
    refIndex[i] = indexOfId(refData[i]);
}
const isJunction = new Uint8Array(nodeCount);
for (let i = 0; i < nodeCount; i++) {
    if (uses[i] > 1) {
        isJunction[i] = 1;
    }
}
for (let w = 0; w < wayCount; w++) {
    const start = wayRefStart.data[w];
    const count = wayRefCount.data[w];
    isJunction[refIndex[start]] = 1;
    isJunction[refIndex[start + count - 1]] = 1;
}
log(`${nodeCount} nodos usados`);

log('pasada 2: coordenadas');
const nodeLat = new Float64Array(nodeCount);
const nodeLon = new Float64Array(nodeCount);
const found = new Uint8Array(nodeCount);
let cursor = 0;
for (const { blob } of readBlobs(input, nodeBlocks)) {
    parsePrimitiveBlock(decodeBlob(blob), {
        dense: (dense) => {
            const blockIds = dense.ids;
            if (blockIds.length && cursor < nodeCount && ids[cursor] > blockIds[0]) {
                cursor = Math.max(0, indexOfId(blockIds[0]));
            }
            for (let i = 0; i < blockIds.length; i++) {
                const id = blockIds[i];
                while (cursor < nodeCount && ids[cursor] < id) {
                    cursor++;
                }
                if (cursor < nodeCount && ids[cursor] === id) {
                    nodeLat[cursor] = dense.lat[i];
                    nodeLon[cursor] = dense.lon[i];
                    found[cursor] = 1;
                }
            }
        },
    });
}
let missing = 0;
for (let i = 0; i < nodeCount; i++) {
    if (!found[i]) {
        missing++;
    }
}
log(`coordenadas asignadas, ${missing} nodos sin posición`);

log('troceo en tramos entre cruces');
const junctionId = new Int32Array(nodeCount).fill(-1);
let junctionCount = 0;
for (let i = 0; i < nodeCount; i++) {
    if (isJunction[i] && found[i]) {
        junctionId[i] = junctionCount++;
    }
}
const segFrom = new GrowArray(Uint32Array);
const segTo = new GrowArray(Uint32Array);
const segLength = new GrowArray(Float32Array);
const segWay = new GrowArray(Uint32Array);
const segGeomStart = new GrowArray(Uint32Array);
const segGeomCount = new GrowArray(Uint16Array);
const geomLat = new GrowArray(Int32Array, 1 << 24);
const geomLon = new GrowArray(Int32Array, 1 << 24);

function perpendicularMeters(lat, lon, aLat, aLon, bLat, bLon) {
    const k = Math.cos(aLat * Math.PI / 180) * 111320;
    const ax = aLon * k;
    const ay = aLat * 110540;
    const bx = bLon * k - ax;
    const by = bLat * 110540 - ay;
    const px = lon * k - ax;
    const py = lat * 110540 - ay;
    const len2 = bx * bx + by * by;
    if (len2 === 0) {
        return Math.hypot(px, py);
    }
    let t = (px * bx + py * by) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - t * bx, py - t * by);
}

function simplify(points) {
    if (points.length <= 2) {
        return points;
    }
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        let worst = -1;
        let worstDistance = 0;
        for (let i = a + 1; i < b; i++) {
            const d = perpendicularMeters(points[i][0], points[i][1], points[a][0], points[a][1], points[b][0], points[b][1]);
            if (d > worstDistance) {
                worstDistance = d;
                worst = i;
            }
        }
        if (worst !== -1 && worstDistance > SIMPLIFY_METERS) {
            keep[worst] = 1;
            stack.push([a, worst], [worst, b]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

for (let w = 0; w < wayCount; w++) {
    const start = wayRefStart.data[w];
    const count = wayRefCount.data[w];
    let segmentStart = -1;
    let points = [];
    let length = 0;
    let prev = -1;
    for (let k = 0; k < count; k++) {
        const node = refIndex[start + k];
        if (!found[node]) {
            segmentStart = -1;
            points = [];
            length = 0;
            prev = -1;
            continue;
        }
        if (prev !== -1) {
            length += haversine(nodeLat[prev], nodeLon[prev], nodeLat[node], nodeLon[node]);
        }
        points.push([nodeLat[node], nodeLon[node]]);
        prev = node;
        if (junctionId[node] === -1) {
            continue;
        }
        if (segmentStart !== -1 && segmentStart !== node && length > 0) {
            const inner = simplify(points).slice(1, -1);
            segFrom.push(junctionId[segmentStart]);
            segTo.push(junctionId[node]);
            segLength.push(length);
            segWay.push(w);
            segGeomStart.push(geomLat.length);
            segGeomCount.push(Math.min(inner.length, 65535));
            for (let g = 0; g < inner.length && g < 65535; g++) {
                geomLat.push(Math.round(inner[g][0] * 1e6));
                geomLon.push(Math.round(inner[g][1] * 1e6));
            }
        }
        segmentStart = node;
        points = [[nodeLat[node], nodeLon[node]]];
        length = 0;
    }
}
const segCount = segFrom.length;
log(`${junctionCount} cruces, ${segCount} tramos, ${geomLat.length} puntos de geometría`);

log('componentes conexas');
const parent = new Int32Array(junctionCount);
for (let i = 0; i < junctionCount; i++) {
    parent[i] = i;
}
function find(x) {
    while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
    }
    return x;
}
for (let s = 0; s < segCount; s++) {
    const a = find(segFrom.data[s]);
    const b = find(segTo.data[s]);
    if (a !== b) {
        parent[a] = b;
    }
}
const componentSize = new Uint32Array(junctionCount);
for (let i = 0; i < junctionCount; i++) {
    componentSize[find(i)]++;
}
const keepNode = new Uint8Array(junctionCount);
let kept = 0;
const bigComponents = [];
for (let i = 0; i < junctionCount; i++) {
    if (componentSize[find(i)] >= MIN_COMPONENT) {
        keepNode[i] = 1;
        kept++;
    }
    if (componentSize[i] >= MIN_COMPONENT) {
        bigComponents.push(componentSize[i]);
    }
}
bigComponents.sort((a, b) => b - a);
log(`${kept} cruces en ${bigComponents.length} componentes grandes (mayores: ${bigComponents.slice(0, 8).join(', ')})`);

const stats = {
    ways: wayCount,
    refs: refIds.length,
    nodes: nodeCount,
    junctions: junctionCount,
    keptJunctions: kept,
    segments: segCount,
    geometryPoints: geomLat.length,
    mainSegments: 0,
    detailSegments: 0,
    seconds: 0,
};
for (let s = 0; s < segCount; s++) {
    if (wayClass.data[segWay.data[s]] < MAIN_CLASS_COUNT) {
        stats.mainSegments++;
    } else {
        stats.detailSegments++;
    }
}

mkdirSync(outDir, { recursive: true });
const graph = {
    CLASSES, MAIN_CLASS_COUNT, TILE_DEG,
    junctionCount, keepNode, parent: null,
    nodeIndexOfJunction: null,
    segCount,
    segFrom: segFrom.view(), segTo: segTo.view(), segLength: segLength.view(), segWay: segWay.view(),
    segGeomStart: segGeomStart.view(), segGeomCount: segGeomCount.view(),
    geomLat: geomLat.view(), geomLon: geomLon.view(),
    wayClass: wayClass.view(), wayOneway: wayOneway.view(), waySpeed: waySpeed.view(), wayToll: wayToll.view(),
    nodeLat, nodeLon, junctionId,
};
const written = writeGraph(graph, outDir);
stats.files = written;
stats.seconds = (Date.now() - t0) / 1000;
writeFileSync(join(outDir, 'build-stats.json'), JSON.stringify(stats, null, 2));
log('estadísticas: ' + JSON.stringify(stats));
