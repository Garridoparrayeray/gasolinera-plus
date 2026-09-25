import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const decoder = new TextDecoder();

class Proto {
    constructor(data, start = 0, end = data.length) {
        this.data = data;
        this.pos = start;
        this.end = end;
    }

    varint() {
        const data = this.data;
        let byte = data[this.pos++];
        if (byte < 0x80) {
            return byte;
        }
        let result = byte & 0x7f;
        let multiplier = 128;
        do {
            byte = data[this.pos++];
            result += (byte & 0x7f) * multiplier;
            multiplier *= 128;
        } while (byte >= 0x80);
        return result;
    }

    svarint() {
        const value = this.varint();
        if (value % 2 === 0) {
            return value / 2;
        }
        return -(value + 1) / 2;
    }

    key() {
        const key = this.varint();
        return { field: Math.floor(key / 8), wire: key % 8 };
    }

    bytesRange() {
        const length = this.varint();
        const start = this.pos;
        this.pos += length;
        return [start, this.pos];
    }

    skip(wire) {
        if (wire === 0) {
            this.varint();
        } else if (wire === 1) {
            this.pos += 8;
        } else if (wire === 2) {
            const length = this.varint();
            this.pos += length;
        } else if (wire === 5) {
            this.pos += 4;
        } else {
            throw new Error('tipo de campo protobuf no soportado: ' + wire);
        }
    }

    packedVarints(start, end, out) {
        const saved = this.pos;
        this.pos = start;
        while (this.pos < end) {
            out.push(this.varint());
        }
        this.pos = saved;
        return out;
    }

    packedDelta(start, end) {
        const saved = this.pos;
        this.pos = start;
        const out = [];
        let value = 0;
        while (this.pos < end) {
            value += this.svarint();
            out.push(value);
        }
        this.pos = saved;
        return out;
    }
}

function parseBlobHeader(buffer) {
    const p = new Proto(buffer);
    let type = '';
    let dataSize = 0;
    while (p.pos < p.end) {
        const { field, wire } = p.key();
        if (field === 1 && wire === 2) {
            const [s, e] = p.bytesRange();
            type = decoder.decode(buffer.subarray(s, e));
        } else if (field === 3 && wire === 0) {
            dataSize = p.varint();
        } else {
            p.skip(wire);
        }
    }
    return { type, dataSize };
}

export function decodeBlob(buffer) {
    const p = new Proto(buffer);
    while (p.pos < p.end) {
        const { field, wire } = p.key();
        if (field === 1 && wire === 2) {
            const [s, e] = p.bytesRange();
            return buffer.subarray(s, e);
        }
        if (field === 3 && wire === 2) {
            const [s, e] = p.bytesRange();
            return inflateSync(buffer.subarray(s, e));
        }
        p.skip(wire);
    }
    throw new Error('bloque PBF sin datos raw ni zlib');
}

export function* readBlobs(path, onlyOffsets = null) {
    const fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const lengthBuffer = Buffer.alloc(4);
    try {
        if (onlyOffsets) {
            for (const entry of onlyOffsets) {
                const blob = Buffer.alloc(entry.size);
                readSync(fd, blob, 0, entry.size, entry.offset);
                yield { type: 'OSMData', blob, offset: entry.offset, size: entry.size };
            }
            return;
        }
        let offset = 0;
        while (offset < size) {
            readSync(fd, lengthBuffer, 0, 4, offset);
            const headerLength = lengthBuffer.readUInt32BE(0);
            offset += 4;
            const header = Buffer.alloc(headerLength);
            readSync(fd, header, 0, headerLength, offset);
            offset += headerLength;
            const { type, dataSize } = parseBlobHeader(header);
            const blob = Buffer.alloc(dataSize);
            readSync(fd, blob, 0, dataSize, offset);
            yield { type, blob, offset, size: dataSize };
            offset += dataSize;
        }
    } finally {
        closeSync(fd);
    }
}

export function parseHeaderBlock(data) {
    const p = new Proto(data);
    const features = [];
    while (p.pos < p.end) {
        const { field, wire } = p.key();
        if ((field === 4 || field === 5) && wire === 2) {
            const [s, e] = p.bytesRange();
            features.push(decoder.decode(data.subarray(s, e)));
        } else {
            p.skip(wire);
        }
    }
    return { features };
}

export function parsePrimitiveBlock(data, handlers) {
    const p = new Proto(data);
    const strings = [];
    const groups = [];
    let granularity = 100;
    let latOffset = 0;
    let lonOffset = 0;

    while (p.pos < p.end) {
        const { field, wire } = p.key();
        if (field === 1 && wire === 2) {
            const [s, e] = p.bytesRange();
            const st = new Proto(data, s, e);
            while (st.pos < st.end) {
                const inner = st.key();
                if (inner.field === 1 && inner.wire === 2) {
                    const [a, b] = st.bytesRange();
                    strings.push(decoder.decode(data.subarray(a, b)));
                } else {
                    st.skip(inner.wire);
                }
            }
        } else if (field === 2 && wire === 2) {
            groups.push(p.bytesRange());
        } else if (field === 17 && wire === 0) {
            granularity = p.varint();
        } else if (field === 19 && wire === 0) {
            latOffset = p.svarint();
        } else if (field === 20 && wire === 0) {
            lonOffset = p.svarint();
        } else {
            p.skip(wire);
        }
    }

    const kinds = { dense: false, ways: false, nodes: false, relations: false };
    let wayKeyIndex = -1;
    if (handlers.wayKey) {
        wayKeyIndex = strings.indexOf(handlers.wayKey);
    }
    for (const [gs, ge] of groups) {
        const g = new Proto(data, gs, ge);
        while (g.pos < g.end) {
            const { field, wire } = g.key();
            if (field === 2 && wire === 2) {
                kinds.dense = true;
                const [ds, de] = g.bytesRange();
                if (handlers.dense) {
                    handlers.dense(decodeDense(data, ds, de, granularity, latOffset, lonOffset));
                }
            } else if (field === 3 && wire === 2) {
                kinds.ways = true;
                const [ws, we] = g.bytesRange();
                if (handlers.way && (!handlers.wayKey || wayKeyIndex !== -1)) {
                    const way = decodeWay(data, ws, we, strings, wayKeyIndex);
                    if (way) {
                        handlers.way(way);
                    }
                }
            } else if (field === 1 && wire === 2) {
                kinds.nodes = true;
                g.skip(wire);
            } else if (field === 4 && wire === 2) {
                kinds.relations = true;
                g.skip(wire);
            } else {
                g.skip(wire);
            }
        }
    }
    return kinds;
}

function decodeDense(data, start, end, granularity, latOffset, lonOffset) {
    const p = new Proto(data, start, end);
    let ids = null;
    let lats = null;
    let lons = null;
    while (p.pos < p.end) {
        const { field, wire } = p.key();
        if (field === 1 && wire === 2) {
            const [s, e] = p.bytesRange();
            ids = p.packedDelta(s, e);
        } else if (field === 8 && wire === 2) {
            const [s, e] = p.bytesRange();
            lats = p.packedDelta(s, e);
        } else if (field === 9 && wire === 2) {
            const [s, e] = p.bytesRange();
            lons = p.packedDelta(s, e);
        } else {
            p.skip(wire);
        }
    }
    const count = ids.length;
    const latDeg = new Float64Array(count);
    const lonDeg = new Float64Array(count);
    for (let i = 0; i < count; i++) {
        latDeg[i] = 1e-9 * (latOffset + granularity * lats[i]);
        lonDeg[i] = 1e-9 * (lonOffset + granularity * lons[i]);
    }
    return { ids, lat: latDeg, lon: lonDeg };
}

function decodeWay(data, start, end, strings, requiredKey) {
    const p = new Proto(data, start, end);
    let id = 0;
    const keys = [];
    const vals = [];
    let refs = [];
    while (p.pos < p.end) {
        const { field, wire } = p.key();
        if (field === 1 && wire === 0) {
            id = p.varint();
        } else if (field === 2 && wire === 2) {
            const [s, e] = p.bytesRange();
            p.packedVarints(s, e, keys);
            if (requiredKey !== -1 && !keys.includes(requiredKey)) {
                return null;
            }
        } else if (field === 3 && wire === 2) {
            const [s, e] = p.bytesRange();
            p.packedVarints(s, e, vals);
        } else if (field === 8 && wire === 2) {
            const [s, e] = p.bytesRange();
            refs = p.packedDelta(s, e);
        } else {
            p.skip(wire);
        }
    }
    if (requiredKey !== -1 && !keys.includes(requiredKey)) {
        return null;
    }
    const tags = {};
    for (let i = 0; i < keys.length; i++) {
        tags[strings[keys[i]]] = strings[vals[i]];
    }
    return { id, tags, refs };
}
