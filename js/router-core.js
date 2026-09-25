const GPRouter = (() => {
    const MAX_SPEED_MS = 120 / 3.6;
    const SNAP_RADIUS_M = 2500;
    const FAST_ROAD_SNAP_PENALTY_M = 40;
    const DETAIL_RADIUS_DEG = 0.12;
    const EARTH = 6371000;
    const RAD = Math.PI / 180;

    function metersBetween(lat1, lon1, lat2, lon2) {
        const x = (lon2 - lon1) * RAD * Math.cos(((lat1 + lat2) / 2) * RAD);
        const y = (lat2 - lat1) * RAD;
        return Math.sqrt(x * x + y * y) * EARTH;
    }

    class Heap {
        constructor(capacity) {
            this.keys = new Float64Array(capacity);
            this.values = new Int32Array(capacity);
            this.size = 0;
        }

        clear() {
            this.size = 0;
        }

        push(key, value) {
            if (this.size === this.keys.length) {
                const keys = new Float64Array(this.keys.length * 2);
                keys.set(this.keys);
                const values = new Int32Array(this.values.length * 2);
                values.set(this.values);
                this.keys = keys;
                this.values = values;
            }
            let i = this.size++;
            const keys = this.keys;
            const values = this.values;
            while (i > 0) {
                const parent = (i - 1) >> 1;
                if (keys[parent] <= key) {
                    break;
                }
                keys[i] = keys[parent];
                values[i] = values[parent];
                i = parent;
            }
            keys[i] = key;
            values[i] = value;
        }

        pop() {
            const keys = this.keys;
            const values = this.values;
            const top = values[0];
            this.topKey = keys[0];
            const lastKey = keys[--this.size];
            const lastValue = values[this.size];
            let i = 0;
            const half = this.size >> 1;
            while (i < half) {
                let child = 2 * i + 1;
                if (child + 1 < this.size && keys[child + 1] < keys[child]) {
                    child++;
                }
                if (keys[child] >= lastKey) {
                    break;
                }
                keys[i] = keys[child];
                values[i] = values[child];
                i = child;
            }
            keys[i] = lastKey;
            values[i] = lastValue;
            return top;
        }
    }

    function parseMain(buffer) {
        const header = new Uint32Array(buffer, 4, 6);
        const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
        if (magic !== 'GPRG') {
            throw new Error('main.bin no es un grafo de Gasolinera+');
        }
        const [version, M, N, E, S, G] = header;
        let offset = 28;
        function take(Type, count) {
            const array = new Type(buffer, offset, count);
            offset += Math.ceil((count * Type.BYTES_PER_ELEMENT) / 4) * 4;
            return array;
        }
        return {
            version,
            mainNodes: M,
            totalNodes: N,
            lat: take(Int32Array, M),
            lon: take(Int32Array, M),
            firstEdge: take(Uint32Array, M + 1),
            edgeTarget: take(Uint32Array, E),
            edgeTime: take(Uint32Array, E),
            edgeSeg: take(Uint32Array, E),
            segFrom: take(Uint32Array, S),
            segTo: take(Uint32Array, S),
            segLength: take(Float32Array, S),
            segClass: take(Uint8Array, S),
            segFlags: take(Uint8Array, S),
            geomStart: take(Uint32Array, S + 1),
            geomLat: take(Int32Array, G),
            geomLon: take(Int32Array, G),
        };
    }

    function parseTile(buffer) {
        const magic = String.fromCharCode(...new Uint8Array(buffer, 0, 4));
        if (magic !== 'GPRT') {
            throw new Error('tesela de carreteras no válida');
        }
        const [, K, S, G] = new Uint32Array(buffer, 4, 4);
        let offset = 20;
        function take(Type, count) {
            const array = new Type(buffer, offset, count);
            offset += Math.ceil((count * Type.BYTES_PER_ELEMENT) / 4) * 4;
            return array;
        }
        return {
            nodeGlobal: take(Uint32Array, K),
            nodeLat: take(Int32Array, K),
            nodeLon: take(Int32Array, K),
            segFrom: take(Uint32Array, S),
            segTo: take(Uint32Array, S),
            segTime: take(Uint32Array, S),
            segLength: take(Float32Array, S),
            segClass: take(Uint8Array, S),
            segOneway: take(Int8Array, S),
            geomStart: take(Uint32Array, S + 1),
            geomLat: take(Int32Array, G),
            geomLon: take(Int32Array, G),
        };
    }

    class Router {
        constructor(manifest, mainBuffer, loadTile) {
            this.manifest = manifest;
            this.main = parseMain(mainBuffer);
            this.loadTileBuffer = loadTile;
            const N = this.main.totalNodes;
            this.nodeLat = new Int32Array(N);
            this.nodeLon = new Int32Array(N);
            this.nodeLat.set(this.main.lat);
            this.nodeLon.set(this.main.lon);
            this.tiles = new Map();
            this.detailEdges = new Map();
            this.gScore = new Float64Array(N);
            this.stamp = new Uint32Array(N);
            this.closed = new Uint32Array(N);
            this.prevNode = new Int32Array(N);
            this.prevEdge = new Float64Array(N);
            this.generation = 0;
            this.heap = new Heap(1 << 16);
        }

        tileKeysAround(lat, lon) {
            const size = this.manifest.tileDeg;
            const keys = [];
            const y0 = Math.floor((lat - DETAIL_RADIUS_DEG) / size);
            const y1 = Math.floor((lat + DETAIL_RADIUS_DEG) / size);
            const x0 = Math.floor((lon - DETAIL_RADIUS_DEG * 1.4) / size);
            const x1 = Math.floor((lon + DETAIL_RADIUS_DEG * 1.4) / size);
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const key = `${y}_${x}`;
                    if (this.manifest.tiles[key]) {
                        keys.push(key);
                    }
                }
            }
            return keys;
        }

        async ensureTiles(points) {
            const keys = new Set();
            for (const [lat, lon] of points) {
                for (const key of this.tileKeysAround(lat, lon)) {
                    keys.add(key);
                }
            }
            const missing = [...keys].filter((key) => !this.tiles.has(key));
            const buffers = await Promise.all(missing.map((key) => this.loadTileBuffer(key)));
            missing.forEach((key, i) => this.addTile(key, parseTile(buffers[i])));
        }

        addTile(key, tile) {
            this.tiles.set(key, tile);
            for (let i = 0; i < tile.nodeGlobal.length; i++) {
                this.nodeLat[tile.nodeGlobal[i]] = tile.nodeLat[i];
                this.nodeLon[tile.nodeGlobal[i]] = tile.nodeLon[i];
            }
            for (let s = 0; s < tile.segFrom.length; s++) {
                const ref = { tile, s };
                const oneway = tile.segOneway[s];
                if (oneway !== -1) {
                    this.addDetailEdge(tile.segFrom[s], tile.segTo[s], tile.segTime[s], ref, false);
                }
                if (oneway !== 1) {
                    this.addDetailEdge(tile.segTo[s], tile.segFrom[s], tile.segTime[s], ref, true);
                }
            }
        }

        addDetailEdge(from, to, time, ref, reversed) {
            let list = this.detailEdges.get(from);
            if (!list) {
                list = [];
                this.detailEdges.set(from, list);
            }
            list.push({ to, time, ref, reversed });
        }

        segmentPoints(ref) {
            const points = [];
            if (ref.tile) {
                const t = ref.tile;
                const s = ref.s;
                points.push([this.nodeLat[t.segFrom[s]] / 1e6, this.nodeLon[t.segFrom[s]] / 1e6]);
                for (let g = t.geomStart[s]; g < t.geomStart[s + 1]; g++) {
                    points.push([t.geomLat[g] / 1e6, t.geomLon[g] / 1e6]);
                }
                points.push([this.nodeLat[t.segTo[s]] / 1e6, this.nodeLon[t.segTo[s]] / 1e6]);
                return points;
            }
            const m = this.main;
            const s = ref.s;
            points.push([m.lat[m.segFrom[s]] / 1e6, m.lon[m.segFrom[s]] / 1e6]);
            for (let g = m.geomStart[s]; g < m.geomStart[s + 1]; g++) {
                points.push([m.geomLat[g] / 1e6, m.geomLon[g] / 1e6]);
            }
            points.push([m.lat[m.segTo[s]] / 1e6, m.lon[m.segTo[s]] / 1e6]);
            return points;
        }

        segmentInfo(ref) {
            if (ref.tile) {
                const t = ref.tile;
                const s = ref.s;
                return {
                    from: t.segFrom[s],
                    to: t.segTo[s],
                    length: t.segLength[s],
                    time: t.segTime[s] / 10,
                    oneway: t.segOneway[s],
                    toll: false,
                };
            }
            const m = this.main;
            const s = ref.s;
            const forward = this.findMainEdge(m.segFrom[s], s, 0);
            const backward = this.findMainEdge(m.segTo[s], s, 1);
            let oneway = 0;
            if (forward !== -1 && backward === -1) {
                oneway = 1;
            } else if (forward === -1 && backward !== -1) {
                oneway = -1;
            }
            let time = 0;
            if (forward !== -1) {
                time = m.edgeTime[forward] / 10;
            } else if (backward !== -1) {
                time = m.edgeTime[backward] / 10;
            }
            return { from: m.segFrom[s], to: m.segTo[s], length: m.segLength[s], time, oneway, toll: m.segFlags[s] === 1 };
        }

        findMainEdge(node, s, reversed) {
            const m = this.main;
            if (node >= m.mainNodes) {
                return -1;
            }
            const code = s * 2 + reversed;
            for (let e = m.firstEdge[node]; e < m.firstEdge[node + 1]; e++) {
                if (m.edgeSeg[e] === code) {
                    return e;
                }
            }
            return -1;
        }

        projectOnSegment(ref, lat, lon) {
            const points = this.segmentPoints(ref);
            let best = null;
            let along = 0;
            for (let i = 0; i < points.length - 1; i++) {
                const [aLat, aLon] = points[i];
                const [bLat, bLon] = points[i + 1];
                const k = Math.cos(aLat * RAD);
                const bx = (bLon - aLon) * k;
                const by = bLat - aLat;
                const px = (lon - aLon) * k;
                const py = lat - aLat;
                const len2 = bx * bx + by * by;
                let t = 0;
                if (len2 > 0) {
                    t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
                }
                const qLat = aLat + t * (bLat - aLat);
                const qLon = aLon + t * (bLon - aLon);
                const distance = metersBetween(lat, lon, qLat, qLon);
                const pieceLength = metersBetween(aLat, aLon, bLat, bLon);
                if (!best || distance < best.distance) {
                    best = { distance, lat: qLat, lon: qLon, alongMeters: along + t * pieceLength, pieceIndex: i, t };
                }
                along += pieceLength;
            }
            best.totalMeters = along;
            best.points = points;
            return best;
        }

        snap(lat, lon) {
            let best = null;
            const consider = (ref, fromLat, fromLon, toLat, toLon, length, penalty = 0) => {
                const nearEnd = Math.min(metersBetween(lat, lon, fromLat, fromLon), metersBetween(lat, lon, toLat, toLon));
                if (nearEnd - length > SNAP_RADIUS_M) {
                    return;
                }
                if (best && nearEnd - length + penalty > best.score) {
                    return;
                }
                const projection = this.projectOnSegment(ref, lat, lon);
                const score = projection.distance + penalty;
                if (projection.distance <= SNAP_RADIUS_M && (!best || score < best.score)) {
                    best = { ref, score, ...projection };
                }
            };
            for (const tile of this.tiles.values()) {
                for (let s = 0; s < tile.segFrom.length; s++) {
                    const a = tile.segFrom[s];
                    const b = tile.segTo[s];
                    consider({ tile, s }, this.nodeLat[a] / 1e6, this.nodeLon[a] / 1e6, this.nodeLat[b] / 1e6, this.nodeLon[b] / 1e6, tile.segLength[s]);
                }
            }
            const m = this.main;
            const latE6 = lat * 1e6;
            const lonE6 = lon * 1e6;
            for (let s = 0; s < m.segFrom.length; s++) {
                const a = m.segFrom[s];
                const b = m.segTo[s];
                const reach = (m.segLength[s] + SNAP_RADIUS_M) * 12;
                if (Math.abs(m.lat[a] - latE6) > reach || Math.abs(m.lat[b] - latE6) > reach) {
                    continue;
                }
                if (Math.abs(m.lon[a] - lonE6) > reach * 1.5 || Math.abs(m.lon[b] - lonE6) > reach * 1.5) {
                    continue;
                }
                let penalty = 0;
                if (m.segClass[s] < 4) {
                    penalty = FAST_ROAD_SNAP_PENALTY_M;
                }
                consider({ s }, m.lat[a] / 1e6, m.lon[a] / 1e6, m.lat[b] / 1e6, m.lon[b] / 1e6, m.segLength[s], penalty);
            }
            if (!best) {
                return null;
            }
            best.info = this.segmentInfo(best.ref);
            return best;
        }

        endpointCosts(snapped, leaving) {
            const info = snapped.info;
            const fraction = snapped.alongMeters / Math.max(1, snapped.totalMeters);
            const toTo = info.time * (1 - fraction);
            const toFrom = info.time * fraction;
            const out = [];
            if (leaving) {
                if (info.oneway !== -1) {
                    out.push([info.to, toTo]);
                }
                if (info.oneway !== 1) {
                    out.push([info.from, toFrom]);
                }
            } else {
                if (info.oneway !== -1) {
                    out.push([info.from, toFrom]);
                }
                if (info.oneway !== 1) {
                    out.push([info.to, toTo]);
                }
            }
            return out;
        }

        heuristic(node, targetLat, targetLon) {
            return metersBetween(this.nodeLat[node] / 1e6, this.nodeLon[node] / 1e6, targetLat, targetLon) * 0.995 / MAX_SPEED_MS;
        }

        search(origin, destination) {
            this.generation++;
            const gen = this.generation;
            const heap = this.heap;
            heap.clear();
            const m = this.main;
            const targetLat = destination.lat;
            const targetLon = destination.lon;
            const finish = new Map();
            for (const [node, cost] of this.endpointCosts(destination, false)) {
                finish.set(node, cost);
            }
            for (const [node, cost] of this.endpointCosts(origin, true)) {
                if (this.stamp[node] !== gen || cost < this.gScore[node]) {
                    this.stamp[node] = gen;
                    this.gScore[node] = cost;
                    this.prevNode[node] = -1;
                    this.prevEdge[node] = -1;
                    heap.push(cost + this.heuristic(node, targetLat, targetLon), node);
                }
            }

            let bestTotal = Infinity;
            let bestNode = -1;
            let visited = 0;
            const relax = (from, to, time, edgeCode) => {
                const tentative = this.gScore[from] + time;
                if (this.stamp[to] !== gen || tentative < this.gScore[to]) {
                    this.stamp[to] = gen;
                    this.gScore[to] = tentative;
                    this.prevNode[to] = from;
                    this.prevEdge[to] = edgeCode;
                    heap.push(tentative + this.heuristic(to, targetLat, targetLon), to);
                }
            };

            while (heap.size) {
                const node = heap.pop();
                if (heap.topKey >= bestTotal) {
                    break;
                }
                if (this.closed[node] === gen) {
                    continue;
                }
                this.closed[node] = gen;
                visited++;
                const finishCost = finish.get(node);
                if (finishCost !== undefined && this.gScore[node] + finishCost < bestTotal) {
                    bestTotal = this.gScore[node] + finishCost;
                    bestNode = node;
                }
                if (node < m.mainNodes) {
                    for (let e = m.firstEdge[node]; e < m.firstEdge[node + 1]; e++) {
                        relax(node, m.edgeTarget[e], m.edgeTime[e] / 10, e);
                    }
                }
                const detail = this.detailEdges.get(node);
                if (detail) {
                    for (let i = 0; i < detail.length; i++) {
                        relax(node, detail[i].to, detail[i].time / 10, -2 - this.detailEdgeId(detail[i]));
                    }
                }
            }
            return { bestNode, bestTotal, visited };
        }

        detailEdgeId(edge) {
            if (edge.id === undefined) {
                if (!this.detailIndex) {
                    this.detailIndex = [];
                }
                edge.id = this.detailIndex.length;
                this.detailIndex.push(edge);
            }
            return edge.id;
        }

        orientedPoints(ref, reversed) {
            const points = this.segmentPoints(ref);
            if (reversed) {
                points.reverse();
            }
            return points;
        }

        partial(snapped, fromStart, reversedDirection) {
            const points = snapped.points;
            const cut = snapped.pieceIndex;
            const here = [snapped.lat, snapped.lon];
            if (fromStart) {
                return [...points.slice(0, cut + 1), here];
            }
            return [here, ...points.slice(cut + 1)];
        }

        leg(origin, destination) {
            const { bestNode, bestTotal, visited } = this.search(origin, destination);
            const sameSegment = origin.ref.s === destination.ref.s && origin.ref.tile === destination.ref.tile;
            if (sameSegment) {
                const direct = this.directOnSegment(origin, destination);
                if (direct && direct.time <= bestTotal) {
                    return direct;
                }
            }
            if (bestNode === -1) {
                return null;
            }
            const edges = [];
            let node = bestNode;
            while (this.prevNode[node] !== -1) {
                edges.push(this.prevEdge[node]);
                node = this.prevNode[node];
            }
            const firstNode = node;
            edges.reverse();

            const coords = [];
            let meters = 0;
            let toll = false;
            const push = (points) => {
                for (const point of points) {
                    const last = coords[coords.length - 1];
                    if (!last || last[0] !== point[0] || last[1] !== point[1]) {
                        coords.push(point);
                    }
                }
            };

            const startInfo = origin.info;
            if (firstNode === startInfo.to) {
                push(this.orientedPoints(origin.ref, false).slice(origin.pieceIndex + 1));
                coords.unshift([origin.lat, origin.lon]);
                meters += origin.totalMeters - origin.alongMeters;
            } else {
                push([[origin.lat, origin.lon], ...this.segmentPoints(origin.ref).slice(0, origin.pieceIndex + 1).reverse()]);
                meters += origin.alongMeters;
            }
            if (startInfo.toll) {
                toll = true;
            }

            for (const code of edges) {
                if (code >= 0) {
                    const seg = Math.floor(this.main.edgeSeg[code] / 2);
                    const reversed = this.main.edgeSeg[code] % 2 === 1;
                    push(this.orientedPoints({ s: seg }, reversed));
                    meters += this.main.segLength[seg];
                    if (this.main.segFlags[seg] === 1) {
                        toll = true;
                    }
                } else {
                    const edge = this.detailIndex[-2 - code];
                    push(this.orientedPoints(edge.ref, edge.reversed));
                    meters += edge.ref.tile.segLength[edge.ref.s];
                }
            }

            const endInfo = destination.info;
            if (bestNode === endInfo.from) {
                push([...this.segmentPoints(destination.ref).slice(1, destination.pieceIndex + 1), [destination.lat, destination.lon]]);
                meters += destination.alongMeters;
            } else {
                push([...this.segmentPoints(destination.ref).slice(destination.pieceIndex + 1).reverse(), [destination.lat, destination.lon]]);
                meters += destination.totalMeters - destination.alongMeters;
            }
            if (endInfo.toll) {
                toll = true;
            }
            return { coords, meters, seconds: bestTotal, toll, visited };
        }

        directOnSegment(origin, destination) {
            const info = origin.info;
            const forward = destination.alongMeters >= origin.alongMeters;
            if (forward && info.oneway === -1) {
                return null;
            }
            if (!forward && info.oneway === 1) {
                return null;
            }
            const meters = Math.abs(destination.alongMeters - origin.alongMeters);
            const seconds = (meters / Math.max(1, origin.totalMeters)) * info.time;
            const points = origin.points;
            const coords = [[origin.lat, origin.lon]];
            if (forward) {
                for (let i = origin.pieceIndex + 1; i <= destination.pieceIndex; i++) {
                    coords.push(points[i]);
                }
            } else {
                for (let i = origin.pieceIndex; i > destination.pieceIndex; i--) {
                    coords.push(points[i]);
                }
            }
            coords.push([destination.lat, destination.lon]);
            return { coords, meters, seconds, toll: info.toll, visited: 0, time: seconds };
        }

        async route(points) {
            await this.ensureTiles(points);
            const snaps = points.map(([lat, lon]) => this.snap(lat, lon));
            const failed = snaps.findIndex((snapped) => !snapped);
            if (failed !== -1) {
                return { error: 'no-road', index: failed };
            }
            const legs = [];
            for (let i = 0; i < snaps.length - 1; i++) {
                const result = this.leg(snaps[i], snaps[i + 1]);
                if (!result) {
                    return { error: 'no-connection', index: i };
                }
                legs.push(result);
            }
            const coords = [];
            let meters = 0;
            let seconds = 0;
            let toll = false;
            let visited = 0;
            for (const leg of legs) {
                for (const point of leg.coords) {
                    coords.push(point);
                }
                meters += leg.meters;
                seconds += leg.seconds;
                visited += leg.visited;
                if (leg.toll) {
                    toll = true;
                }
            }
            return {
                coords,
                meters,
                seconds,
                toll,
                visited,
                legs: legs.map((leg) => ({ meters: leg.meters, seconds: leg.seconds })),
                snapped: snaps.map((snapped) => ({ lat: snapped.lat, lon: snapped.lon, distance: snapped.distance })),
            };
        }
    }

    return { Router, parseMain, parseTile, metersBetween };
})();
