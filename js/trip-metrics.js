const GPTripMetrics = (() => {
    const MAX_ACCURACY_M = 25;
    const MAX_JUMP_MS = 70;
    const MOVING_MS = 1.4;
    const HARSH_ACCEL = 3.0;
    const HARSH_BRAKE = -3.5;
    const SMOOTH_HALF_WINDOW = 2;
    const BANDS_KMH = [0, 30, 50, 80, 100, 120];
    const EARTH = 6371000;
    const RAD = Math.PI / 180;

    function distance(a, b) {
        const dLat = (b.lat - a.lat) * RAD;
        const dLon = (b.lon - a.lon) * RAD;
        const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
        return 2 * EARTH * Math.asin(Math.sqrt(h));
    }

    function bearing(a, b) {
        const y = Math.sin((b.lon - a.lon) * RAD) * Math.cos(b.lat * RAD);
        const x = Math.cos(a.lat * RAD) * Math.sin(b.lat * RAD) - Math.sin(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.cos((b.lon - a.lon) * RAD);
        return (Math.atan2(y, x) / RAD + 360) % 360;
    }

    function angleBetween(a, b) {
        const diff = Math.abs(a - b) % 360;
        if (diff > 180) {
            return 360 - diff;
        }
        return diff;
    }

    function clean(raw) {
        const sorted = [...raw].sort((a, b) => a.t - b.t);
        const good = [];
        let total = 0;
        for (const point of sorted) {
            total++;
            if (good.length && point.t <= good[good.length - 1].t) {
                continue;
            }
            if (!(point.acc <= MAX_ACCURACY_M)) {
                continue;
            }
            if (good.length) {
                const last = good[good.length - 1];
                const implied = distance(last, point) / ((point.t - last.t) / 1000);
                if (implied > MAX_JUMP_MS) {
                    continue;
                }
            }
            good.push(point);
        }
        return { good, total };
    }

    function speeds(points) {
        const out = new Float64Array(points.length);
        for (let i = 0; i < points.length; i++) {
            const point = points[i];
            if (typeof point.speed === 'number' && point.speed >= 0) {
                out[i] = point.speed;
                continue;
            }
            let a = points[i - 1];
            let b = point;
            if (!a) {
                a = point;
                b = points[i + 1];
            }
            if (!b || b.t === a.t) {
                out[i] = 0;
                continue;
            }
            out[i] = distance(a, b) / ((b.t - a.t) / 1000);
        }
        return out;
    }

    function smooth(values) {
        const out = new Float64Array(values.length);
        for (let i = 0; i < values.length; i++) {
            let sum = 0;
            let count = 0;
            for (let k = i - SMOOTH_HALF_WINDOW; k <= i + SMOOTH_HALF_WINDOW; k++) {
                if (k >= 0 && k < values.length) {
                    sum += values[k];
                    count++;
                }
            }
            out[i] = sum / count;
        }
        return out;
    }

    function emptyResult(raw, total, lowQuality) {
        let startedAt = null;
        let endedAt = null;
        let durationSeconds = 0;
        if (raw.length) {
            startedAt = raw[0].t;
            endedAt = raw[raw.length - 1].t;
            durationSeconds = (endedAt - startedAt) / 1000;
        }
        return {
            startedAt, endedAt, durationSeconds,
            distanceKm: 0, movingSeconds: 0, stoppedSeconds: durationSeconds,
            avgSpeedKmh: 0, maxSpeedKmh: 0,
            harshAccelerations: 0, harshBrakes: 0,
            percentAbove100: 0, percentAbove120: 0,
            speedBands: BANDS_KMH.map((from, i) => ({ from, to: BANDS_KMH[i + 1] || null, seconds: 0 })),
            ecoScore: null, fuelUsed: null, cost: null,
            points: total, goodPoints: 0, lowQuality,
        };
    }

    function compute(raw, options = {}) {
        const { good, total } = clean(raw);
        if (good.length < 2) {
            return emptyResult([...raw].sort((a, b) => a.t - b.t), total, true);
        }
        const speed = smooth(speeds(good));
        let meters = 0;
        let moving = 0;
        let above100 = 0;
        let above120 = 0;
        let maxSpeed = 0;
        const bands = BANDS_KMH.map(() => 0);
        for (let i = 1; i < good.length; i++) {
            const dt = (good[i].t - good[i - 1].t) / 1000;
            const isMoving = speed[i] >= MOVING_MS || speed[i - 1] >= MOVING_MS;
            if (!isMoving) {
                continue;
            }
            meters += distance(good[i - 1], good[i]);
            moving += dt;
            const kmh = ((speed[i] + speed[i - 1]) / 2) * 3.6;
            if (kmh > 100) {
                above100 += dt;
            }
            if (kmh > 120) {
                above120 += dt;
            }
            let band = 0;
            for (let b = 0; b < BANDS_KMH.length; b++) {
                if (kmh >= BANDS_KMH[b]) {
                    band = b;
                }
            }
            bands[band] += dt;
        }
        for (let i = 0; i < good.length; i++) {
            if (speed[i] > maxSpeed) {
                maxSpeed = speed[i];
            }
        }

        let harshAccelerations = 0;
        let harshBrakes = 0;
        let run = 0;
        let runKind = 0;
        for (let i = 1; i < good.length - 1; i++) {
            const dt = (good[i + 1].t - good[i - 1].t) / 1000;
            let kind = 0;
            if (dt > 0 && dt <= 4) {
                const accel = (speed[i + 1] - speed[i - 1]) / dt;
                if (accel >= HARSH_ACCEL) {
                    kind = 1;
                } else if (accel <= HARSH_BRAKE) {
                    kind = -1;
                }
            }
            if (kind !== 0 && kind === runKind) {
                run++;
            } else {
                run = 0;
                if (kind !== 0) {
                    run = 1;
                }
                runKind = kind;
            }
            if (run === 2) {
                if (kind === 1) {
                    harshAccelerations++;
                } else {
                    harshBrakes++;
                }
            }
        }

        const durationSeconds = (good[good.length - 1].t - good[0].t) / 1000;
        const distanceKm = meters / 1000;
        let avgSpeedKmh = 0;
        let percentAbove100 = 0;
        let percentAbove120 = 0;
        if (moving > 0) {
            avgSpeedKmh = (meters / moving) * 3.6;
            percentAbove100 = (above100 / moving) * 100;
            percentAbove120 = (above120 / moving) * 100;
        }
        let ecoScore = null;
        if (distanceKm >= 1) {
            ecoScore = Math.max(0, Math.round(100 - Math.min(50, (harshAccelerations + harshBrakes) * 10) - Math.min(30, percentAbove120)));
        }
        let fuelUsed = null;
        let cost = null;
        if (options.consumption > 0) {
            fuelUsed = (distanceKm * options.consumption) / 100;
            if (options.pricePerUnit > 0) {
                cost = fuelUsed * options.pricePerUnit;
            }
        }
        return {
            startedAt: good[0].t,
            endedAt: good[good.length - 1].t,
            durationSeconds,
            distanceKm,
            movingSeconds: moving,
            stoppedSeconds: Math.max(0, durationSeconds - moving),
            avgSpeedKmh,
            maxSpeedKmh: maxSpeed * 3.6,
            harshAccelerations,
            harshBrakes,
            percentAbove100,
            percentAbove120,
            speedBands: BANDS_KMH.map((from, i) => ({ from, to: BANDS_KMH[i + 1] || null, seconds: bands[i] })),
            ecoScore,
            fuelUsed,
            cost,
            points: total,
            goodPoints: good.length,
            lowQuality: good.length < total * 0.5,
        };
    }

    function thin(raw) {
        const { good } = clean(raw);
        if (!good.length) {
            return [];
        }
        const speed = smooth(speeds(good));
        const out = [];
        let last = null;
        let lastIndex = -1;
        let lastBearing = null;
        for (let i = 0; i < good.length; i++) {
            const point = good[i];
            let keep = i === 0 || i === good.length - 1;
            if (!keep && last) {
                const dt = (point.t - last.t) / 1000;
                const turn = lastBearing !== null && distance(last, point) > 10 && angleBetween(lastBearing, bearing(last, point)) >= 20;
                const speedChange = Math.abs(speed[i] - speed[lastIndex]) * 3.6 >= 10;
                keep = dt >= 5 || turn || speedChange;
            }
            if (!keep) {
                continue;
            }
            if (last && distance(last, point) > 1) {
                lastBearing = bearing(last, point);
            }
            out.push([point.t, +point.lat.toFixed(6), +point.lon.toFixed(6), +(speed[i] * 3.6).toFixed(1)]);
            last = point;
            lastIndex = i;
        }
        return out;
    }

    return { compute, thin, distance };
})();
