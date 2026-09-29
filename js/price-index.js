const GPPriceIndex = (() => {
    const RELEASE = 'https://github.com/Garridoparrayeray/gasolinera-plus/releases/download/price-index/';
    const FOLDER = 'price-index';
    const SYNC_KEY = 'gp_price_index_sync';
    const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
    const MAX_BACK_DAYS = 3;
    const ZONE_RADIUS_KM = 10;

    const state = { months: {}, manifest: null, syncing: null };

    function filesystem() {
        return GPNative.plugin('Filesystem');
    }

    function available() {
        return Boolean(GPNative.isNative() && filesystem());
    }

    function readSyncInfo() {
        try {
            const parsed = JSON.parse(localStorage.getItem(SYNC_KEY) || '{}');
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (e) {
            return {};
        }
        return {};
    }

    function writeSyncInfo(info) {
        try {
            localStorage.setItem(SYNC_KEY, JSON.stringify(info));
        } catch (e) {
            return;
        }
    }

    async function download(name) {
        await filesystem().downloadFile({ url: RELEASE + name, path: `${FOLDER}/${name}`, directory: 'DATA', recursive: true });
    }

    async function readJson(name) {
        const file = await filesystem().readFile({ path: `${FOLDER}/${name}`, directory: 'DATA', encoding: 'utf8' });
        return JSON.parse(file.data);
    }

    async function doSync(force) {
        const info = readSyncInfo();
        if (!force && info.checkedAt && Date.now() - info.checkedAt < SYNC_EVERY_MS) {
            return false;
        }
        await download('index.json');
        const manifest = await readJson('index.json');
        const months = info.months || {};
        let changed = false;
        for (const entry of manifest.months) {
            if (months[entry.month] === entry.lastDate) {
                continue;
            }
            await download(entry.file);
            months[entry.month] = entry.lastDate;
            delete state.months[entry.month];
            changed = true;
        }
        state.manifest = manifest;
        writeSyncInfo({ checkedAt: Date.now(), months });
        return changed;
    }

    async function sync(force) {
        if (!available()) {
            return false;
        }
        if (!state.syncing) {
            state.syncing = doSync(Boolean(force)).catch(() => false).finally(() => {
                state.syncing = null;
            });
        }
        return state.syncing;
    }

    async function ensureMonth(key) {
        if (state.months[key]) {
            return true;
        }
        if (!readSyncInfo().months || !readSyncInfo().months[key]) {
            return false;
        }
        try {
            state.months[key] = await readJson(`${key}.json`);
            return true;
        } catch (e) {
            return false;
        }
    }

    async function ensure(from, to) {
        const keys = new Set(GPPriceIndexCore.datesBetween(GPPriceIndexCore.addDays(from, -MAX_BACK_DAYS), to).map((date) => date.slice(0, 7)));
        for (const key of keys) {
            await ensureMonth(key);
        }
    }

    async function dayReference({ fuel, date, lat, lon }) {
        await ensure(date, date);
        const day = GPPriceIndexCore.nearestDay(state.months, date, MAX_BACK_DAYS);
        if (!day) {
            return null;
        }
        const national = GPPriceIndexCore.average(state.months, fuel, [day], { type: 'national' });
        let zone = null;
        if (typeof lat === 'number' && typeof lon === 'number') {
            zone = GPPriceIndexCore.average(state.months, fuel, [day], { type: 'zone', keys: GPPriceIndexCore.cellsAround(lat, lon, ZONE_RADIUS_KM) });
        }
        return { date: day, national, zone };
    }

    async function periodReference({ fuel, from, to, points }) {
        await ensure(from, to);
        const dates = GPPriceIndexCore.datesBetween(from, to);
        const national = GPPriceIndexCore.average(state.months, fuel, dates, { type: 'national' });
        const zones = [];
        for (const point of points) {
            const zone = GPPriceIndexCore.average(state.months, fuel, dates, { type: 'zone', keys: GPPriceIndexCore.cellsAround(point.lat, point.lon, ZONE_RADIUS_KM) });
            if (zone) {
                zones.push({ ...zone, liters: point.liters });
            }
        }
        return { national, zones };
    }

    return { available, sync, dayReference, periodReference, ZONE_RADIUS_KM };
})();
