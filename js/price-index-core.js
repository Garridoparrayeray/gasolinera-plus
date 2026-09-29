const GPPriceIndexCore = (() => {
    const CELL_DEG = 0.1;
    const EARTH_KM = 6371;
    const DAY_MS = 86400000;
    const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    function cellKey(lat, lon) {
        return `${Math.floor(lat / CELL_DEG)}_${Math.floor(lon / CELL_DEG)}`;
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
        const rad = Math.PI / 180;
        const dLat = (lat2 - lat1) * rad;
        const dLon = (lon2 - lon1) * rad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
        return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
    }

    function cellsAround(lat, lon, radiusKm) {
        const latPad = radiusKm / 111;
        const lonPad = radiusKm / (111 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
        const keys = new Set([cellKey(lat, lon)]);
        const i0 = Math.floor((lat - latPad) / CELL_DEG);
        const i1 = Math.floor((lat + latPad) / CELL_DEG);
        const j0 = Math.floor((lon - lonPad) / CELL_DEG);
        const j1 = Math.floor((lon + lonPad) / CELL_DEG);
        for (let i = i0; i <= i1; i++) {
            for (let j = j0; j <= j1; j++) {
                const centerLat = (i + 0.5) * CELL_DEG;
                const centerLon = (j + 0.5) * CELL_DEG;
                if (haversineKm(lat, lon, centerLat, centerLon) <= radiusKm) {
                    keys.add(`${i}_${j}`);
                }
            }
        }
        return [...keys];
    }

    function parseDate(iso) {
        const [y, m, d] = iso.split('-').map(Number);
        return Date.UTC(y, m - 1, d);
    }

    function formatDate(ms) {
        return new Date(ms).toISOString().slice(0, 10);
    }

    function addDays(iso, days) {
        return formatDate(parseDate(iso) + days * DAY_MS);
    }

    function datesBetween(from, to) {
        const dates = [];
        for (let ms = parseDate(from); ms <= parseDate(to); ms += DAY_MS) {
            dates.push(formatDate(ms));
        }
        return dates;
    }

    function periodOf(iso, kind) {
        const ms = parseDate(iso);
        const date = new Date(ms);
        if (kind === 'month') {
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth();
            const from = formatDate(Date.UTC(year, month, 1));
            const to = formatDate(Date.UTC(year, month + 1, 0));
            return { key: from.slice(0, 7), label: `${MONTH_NAMES[month]} ${year}`, from, to };
        }
        const weekday = (date.getUTCDay() + 6) % 7;
        const from = formatDate(ms - weekday * DAY_MS);
        const to = addDays(from, 6);
        const thursday = new Date(parseDate(from) + 3 * DAY_MS);
        const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
        const week = Math.floor((thursday.getTime() - yearStart) / (7 * DAY_MS)) + 1;
        const fromDate = new Date(parseDate(from));
        const toDate = new Date(parseDate(to));
        const label = `Semana ${week} · ${fromDate.getUTCDate()} ${MONTH_SHORT[fromDate.getUTCMonth()]} a ${toDate.getUTCDate()} ${MONTH_SHORT[toDate.getUTCMonth()]}`;
        return { key: from, label, from, to };
    }

    function bucketFor(day, scope) {
        if (scope.type === 'national') {
            return [day.n];
        }
        if (scope.type === 'province') {
            const bucket = day.p[scope.id];
            if (bucket) {
                return [bucket];
            }
            return [];
        }
        const buckets = [];
        for (const key of scope.keys) {
            if (day.c[key]) {
                buckets.push(day.c[key]);
            }
        }
        return buckets;
    }

    function average(months, fuelSlug, dates, scope) {
        let sum = 0;
        let count = 0;
        let days = 0;
        for (const date of dates) {
            const month = months[date.slice(0, 7)];
            if (!month || !month.days[date]) {
                continue;
            }
            const fuelIndex = month.fuels.indexOf(fuelSlug);
            if (fuelIndex < 0) {
                continue;
            }
            let hadData = false;
            for (const bucket of bucketFor(month.days[date], scope)) {
                const samples = bucket[fuelIndex * 2 + 1];
                if (samples > 0) {
                    sum += bucket[fuelIndex * 2];
                    count += samples;
                    hadData = true;
                }
            }
            if (hadData) {
                days++;
            }
        }
        if (count === 0) {
            return null;
        }
        return { avg: sum / count / 1000, samples: count, days };
    }

    function nearestDay(months, iso, maxBackDays) {
        for (let back = 0; back <= maxBackDays; back++) {
            const candidate = addDays(iso, -back);
            const month = months[candidate.slice(0, 7)];
            if (month && month.days[candidate]) {
                return candidate;
            }
        }
        return null;
    }

    return { cellKey, cellsAround, haversineKm, datesBetween, addDays, periodOf, average, nearestDay };
})();
