import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const FORMAT_VERSION = 1;

class Writer {
    constructor() {
        this.parts = [];
        this.length = 0;
    }

    u32(values) {
        this.push(Uint32Array.from(values));
    }

    push(typed) {
        const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
        const copy = new Uint8Array(bytes.length + ((4 - (bytes.length % 4)) % 4));
        copy.set(bytes);
        this.parts.push(copy);
        this.length += copy.length;
    }

    bytes() {
        const out = new Uint8Array(this.length);
        let offset = 0;
        for (const part of this.parts) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }
}

function magic(text) {
    return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

function speedMs(graph, way) {
    return graph.waySpeed[way] / 3.6;
}

export function writeGraph(graph, outDir) {
    const { segCount, segFrom, segTo, segLength, segWay, segGeomStart, segGeomCount, geomLat, geomLon } = graph;
    const { wayClass, wayOneway, wayToll, keepNode, nodeLat, nodeLon, junctionId, MAIN_CLASS_COUNT, TILE_DEG } = graph;

    const junctionLat = new Float64Array(graph.junctionCount);
    const junctionLon = new Float64Array(graph.junctionCount);
    for (let i = 0; i < junctionId.length; i++) {
        const j = junctionId[i];
        if (j !== -1) {
            junctionLat[j] = nodeLat[i];
            junctionLon[j] = nodeLon[i];
        }
    }

    const usable = new Uint8Array(segCount);
    const isMainSeg = new Uint8Array(segCount);
    const inMain = new Uint8Array(graph.junctionCount);
    for (let s = 0; s < segCount; s++) {
        if (!keepNode[segFrom[s]] || !keepNode[segTo[s]]) {
            continue;
        }
        usable[s] = 1;
        if (wayClass[segWay[s]] < MAIN_CLASS_COUNT) {
            isMainSeg[s] = 1;
            inMain[segFrom[s]] = 1;
            inMain[segTo[s]] = 1;
        }
    }

    const globalIndex = new Int32Array(graph.junctionCount).fill(-1);
    let mainCount = 0;
    for (let j = 0; j < graph.junctionCount; j++) {
        if (inMain[j]) {
            globalIndex[j] = mainCount++;
        }
    }
    let totalCount = mainCount;
    for (let s = 0; s < segCount; s++) {
        if (!usable[s]) {
            continue;
        }
        for (const j of [segFrom[s], segTo[s]]) {
            if (globalIndex[j] === -1) {
                globalIndex[j] = totalCount++;
            }
        }
    }

    function directions(s) {
        const oneway = wayOneway[segWay[s]];
        if (oneway === 1) {
            return [[segFrom[s], segTo[s], 0]];
        }
        if (oneway === -1) {
            return [[segTo[s], segFrom[s], 1]];
        }
        return [[segFrom[s], segTo[s], 0], [segTo[s], segFrom[s], 1]];
    }

    function timeDs(s) {
        return Math.max(1, Math.round((segLength[s] / speedMs(graph, segWay[s])) * 10));
    }

    const mainSegIds = [];
    for (let s = 0; s < segCount; s++) {
        if (usable[s] && isMainSeg[s]) {
            mainSegIds.push(s);
        }
    }
    const mainSegIndex = new Int32Array(segCount).fill(-1);
    mainSegIds.forEach((s, i) => { mainSegIndex[s] = i; });

    const outDegree = new Uint32Array(mainCount + 1);
    const edgesList = [];
    for (const s of mainSegIds) {
        for (const [from, to, reversed] of directions(s)) {
            outDegree[globalIndex[from]]++;
            edgesList.push([globalIndex[from], globalIndex[to], timeDs(s), mainSegIndex[s] * 2 + reversed]);
        }
    }
    const firstEdge = new Uint32Array(mainCount + 1);
    for (let i = 0; i < mainCount; i++) {
        firstEdge[i + 1] = firstEdge[i] + outDegree[i];
    }
    const fill = firstEdge.slice(0, mainCount);
    const edgeCount = edgesList.length;
    const edgeTarget = new Uint32Array(edgeCount);
    const edgeTime = new Uint32Array(edgeCount);
    const edgeSeg = new Uint32Array(edgeCount);
    for (const [from, to, time, seg] of edgesList) {
        const slot = fill[from]++;
        edgeTarget[slot] = to;
        edgeTime[slot] = time;
        edgeSeg[slot] = seg;
    }

    const mainLat = new Int32Array(mainCount);
    const mainLon = new Int32Array(mainCount);
    for (let j = 0; j < graph.junctionCount; j++) {
        const g = globalIndex[j];
        if (g !== -1 && g < mainCount) {
            mainLat[g] = Math.round(junctionLat[j] * 1e6);
            mainLon[g] = Math.round(junctionLon[j] * 1e6);
        }
    }

    const mainGeomStart = new Uint32Array(mainSegIds.length + 1);
    let geomTotal = 0;
    mainSegIds.forEach((s, i) => {
        mainGeomStart[i] = geomTotal;
        geomTotal += segGeomCount[s];
    });
    mainGeomStart[mainSegIds.length] = geomTotal;
    const mainGeomLat = new Int32Array(geomTotal);
    const mainGeomLon = new Int32Array(geomTotal);
    const mainSegLength = new Float32Array(mainSegIds.length);
    const mainSegClass = new Uint8Array(mainSegIds.length);
    const mainSegFlags = new Uint8Array(mainSegIds.length);
    const mainSegFrom = new Uint32Array(mainSegIds.length);
    const mainSegTo = new Uint32Array(mainSegIds.length);
    mainSegIds.forEach((s, i) => {
        mainGeomLat.set(geomLat.subarray(segGeomStart[s], segGeomStart[s] + segGeomCount[s]), mainGeomStart[i]);
        mainGeomLon.set(geomLon.subarray(segGeomStart[s], segGeomStart[s] + segGeomCount[s]), mainGeomStart[i]);
        mainSegLength[i] = segLength[s];
        mainSegClass[i] = wayClass[segWay[s]];
        mainSegFlags[i] = wayToll[segWay[s]];
        mainSegFrom[i] = globalIndex[segFrom[s]];
        mainSegTo[i] = globalIndex[segTo[s]];
    });

    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(join(outDir, 'tiles'), { recursive: true });

    const main = new Writer();
    main.push(magic('GPRG'));
    main.u32([FORMAT_VERSION, mainCount, totalCount, edgeCount, mainSegIds.length, geomTotal]);
    main.push(mainLat);
    main.push(mainLon);
    main.push(firstEdge);
    main.push(edgeTarget);
    main.push(edgeTime);
    main.push(edgeSeg);
    main.push(mainSegFrom);
    main.push(mainSegTo);
    main.push(mainSegLength);
    main.push(mainSegClass);
    main.push(mainSegFlags);
    main.push(mainGeomStart);
    main.push(mainGeomLat);
    main.push(mainGeomLon);
    const mainBytes = main.bytes();
    writeFileSync(join(outDir, 'main.bin'), mainBytes);

    const tiles = new Map();
    for (let s = 0; s < segCount; s++) {
        if (!usable[s] || isMainSeg[s]) {
            continue;
        }
        const midLat = (junctionLat[segFrom[s]] + junctionLat[segTo[s]]) / 2;
        const midLon = (junctionLon[segFrom[s]] + junctionLon[segTo[s]]) / 2;
        const key = `${Math.floor(midLat / TILE_DEG)}_${Math.floor(midLon / TILE_DEG)}`;
        if (!tiles.has(key)) {
            tiles.set(key, []);
        }
        tiles.get(key).push(s);
    }

    const tileIndex = {};
    let tileBytesTotal = 0;
    let tileGzipTotal = 0;
    for (const [key, segs] of tiles) {
        const localNodes = new Map();
        for (const s of segs) {
            for (const j of [segFrom[s], segTo[s]]) {
                const g = globalIndex[j];
                if (g >= mainCount && !localNodes.has(g)) {
                    localNodes.set(g, j);
                }
            }
        }
        const nodeGlobal = new Uint32Array(localNodes.size);
        const nodeLatArr = new Int32Array(localNodes.size);
        const nodeLonArr = new Int32Array(localNodes.size);
        let n = 0;
        for (const [g, j] of localNodes) {
            nodeGlobal[n] = g;
            nodeLatArr[n] = Math.round(junctionLat[j] * 1e6);
            nodeLonArr[n] = Math.round(junctionLon[j] * 1e6);
            n++;
        }
        const count = segs.length;
        const tFrom = new Uint32Array(count);
        const tTo = new Uint32Array(count);
        const tTime = new Uint32Array(count);
        const tLength = new Float32Array(count);
        const tClass = new Uint8Array(count);
        const tOneway = new Int8Array(count);
        const tGeomStart = new Uint32Array(count + 1);
        let g = 0;
        segs.forEach((s, i) => {
            tFrom[i] = globalIndex[segFrom[s]];
            tTo[i] = globalIndex[segTo[s]];
            tTime[i] = timeDs(s);
            tLength[i] = segLength[s];
            tClass[i] = wayClass[segWay[s]];
            tOneway[i] = wayOneway[segWay[s]];
            tGeomStart[i] = g;
            g += segGeomCount[s];
        });
        tGeomStart[count] = g;
        const tLat = new Int32Array(g);
        const tLon = new Int32Array(g);
        segs.forEach((s, i) => {
            tLat.set(geomLat.subarray(segGeomStart[s], segGeomStart[s] + segGeomCount[s]), tGeomStart[i]);
            tLon.set(geomLon.subarray(segGeomStart[s], segGeomStart[s] + segGeomCount[s]), tGeomStart[i]);
        });
        const w = new Writer();
        w.push(magic('GPRT'));
        w.u32([FORMAT_VERSION, localNodes.size, count, g]);
        w.push(nodeGlobal);
        w.push(nodeLatArr);
        w.push(nodeLonArr);
        w.push(tFrom);
        w.push(tTo);
        w.push(tTime);
        w.push(tLength);
        w.push(tClass);
        w.push(tOneway);
        w.push(tGeomStart);
        w.push(tLat);
        w.push(tLon);
        const bytes = w.bytes();
        writeFileSync(join(outDir, 'tiles', `${key}.bin`), bytes);
        const gz = gzipSync(bytes).length;
        tileIndex[key] = bytes.length;
        tileBytesTotal += bytes.length;
        tileGzipTotal += gz;
    }

    const mainGzip = gzipSync(mainBytes).length;
    const manifest = {
        version: FORMAT_VERSION,
        builtAt: new Date().toISOString(),
        tileDeg: TILE_DEG,
        classes: graph.CLASSES,
        mainClassCount: MAIN_CLASS_COUNT,
        mainNodes: mainCount,
        totalNodes: totalCount,
        mainEdges: edgeCount,
        mainSegments: mainSegIds.length,
        mainBytes: mainBytes.length,
        tiles: tileIndex,
    };
    writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest));

    return {
        mainNodes: mainCount,
        totalNodes: totalCount,
        mainEdges: edgeCount,
        mainMB: +(mainBytes.length / 1e6).toFixed(1),
        mainGzipMB: +(mainGzip / 1e6).toFixed(1),
        tiles: tiles.size,
        tilesMB: +(tileBytesTotal / 1e6).toFixed(1),
        tilesGzipMB: +(tileGzipTotal / 1e6).toFixed(1),
    };
}
