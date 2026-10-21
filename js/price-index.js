const GPPriceIndex = (() => {
    const SYNC_EVERY_MS = 6 * 60 * 60 * 1000;
    const MAX_BACK_DAYS = 3;
    const ZONE_RADIUS_KM = 10;

    const countries = {
        es: { tag: 'price-index', folder: 'price-index', syncKey: 'gp_price_index_sync', seed: true },
        pt: { tag: 'price-index-pt', folder: 'price-index-pt', syncKey: 'gp_price_index_sync_pt', seed: false },
        fr: { tag: 'price-index-fr', folder: 'price-index-fr', syncKey: 'gp_price_index_sync_fr', seed: false },
    };

    const state = {
        es: { months: {}, manifest: null, syncing: null },
        pt: { months: {}, manifest: null, syncing: null },
        fr: { months: {}, manifest: null, syncing: null },
    };

    function filesystem() {
        return GPNative.plugin('Filesystem');
    }

    function available() {
        return Boolean(GPNative.isNative() && filesystem());
    }

    function getCfg(country) {
        return countries[country] || countries.es;
    }

    function getState(country) {
        let c = 'es';
        if (countries[country]) {
            c = country;
        }
        return state[c];
    }

    function releaseUrl(country) {
        return `https://github.com/Garridoparrayeray/gasolinera-plus/releases/download/${getCfg(country).tag}/`;
    }

    function readSyncInfo(country) {
        try {
            const parsed = JSON.parse(localStorage.getItem(getCfg(country).syncKey) || '{}');
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (e) {
            return {};
        }
        return {};
    }

    function writeSyncInfo(country, info) {
        try {
            localStorage.setItem(getCfg(country).syncKey, JSON.stringify(info));
        } catch (e) {
            return;
        }
    }

    async function download(country, name) {
        const folder = getCfg(country).folder;
        try {
            await filesystem().mkdir({ path: folder, directory: 'DATA', recursive: true });
        } catch (e) {
            // Si la carpeta ya existe, no pasa nada; downloadFile no la crea en Android.
        }
        await filesystem().downloadFile({ url: releaseUrl(country) + name, path: `${folder}/${name}`, directory: 'DATA', recursive: true });
    }

    async function readJson(country, name) {
        const folder = getCfg(country).folder;
        const file = await filesystem().readFile({ path: `${folder}/${name}`, directory: 'DATA', encoding: 'utf8' });
        return JSON.parse(file.data);
    }

    async function seed(country) {
        if (!getCfg(country).seed) {
            return;
        }
        const info = readSyncInfo(country);
        if (info.seeded || !available()) {
            return;
        }
        try {
            const response = await fetch('/data/price-index-seed/index.json');
            if (!response.ok) {
                writeSyncInfo(country, { ...info, seeded: true });
                return;
            }
            const manifest = await response.json();
            const months = info.months || {};
            const folder = getCfg(country).folder;
            for (const entry of manifest.months) {
                if (months[entry.month] === entry.lastDate) {
                    continue;
                }
                const file = await fetch('/data/price-index-seed/' + entry.file);
                if (!file.ok) {
                    continue;
                }
                await filesystem().writeFile({ path: `${folder}/${entry.file}`, directory: 'DATA', data: await file.text(), encoding: 'utf8', recursive: true });
                months[entry.month] = entry.lastDate;
            }
            await filesystem().writeFile({ path: `${folder}/index.json`, directory: 'DATA', data: JSON.stringify(manifest), encoding: 'utf8', recursive: true });
            getState(country).manifest = manifest;
            writeSyncInfo(country, { ...info, months, seeded: true });
        } catch (e) {
            return;
        }
    }

    async function doSync(country, force) {
        const info = readSyncInfo(country);
        if (!force && info.checkedAt && Date.now() - info.checkedAt < SYNC_EVERY_MS) {
            return false;
        }
        await download(country, 'index.json');
        const manifest = await readJson(country, 'index.json');
        const months = info.months || {};
        let changed = false;
        for (const entry of manifest.months) {
            if (months[entry.month] === entry.lastDate) {
                continue;
            }
            await download(country, entry.file);
            months[entry.month] = entry.lastDate;
            delete getState(country).months[entry.month];
            changed = true;
        }
        getState(country).manifest = manifest;
        writeSyncInfo(country, { checkedAt: Date.now(), months, seeded: true });
        return changed;
    }

    async function syncCountry(country, force) {
        if (!available()) {
            return false;
        }
        const cState = getState(country);
        if (!cState.syncing) {
            cState.syncing = seed(country).then(() => doSync(country, Boolean(force))).catch(() => false).finally(() => {
                cState.syncing = null;
            });
        }
        return cState.syncing;
    }

    async function sync(force, country) {
        if (country) {
            return syncCountry(country, force);
        }
        let active = 'es';
        if (typeof GPCountry !== 'undefined' && GPCountry.code) {
            active = GPCountry.code;
        }
        return syncCountry(active, force);
    }

    async function ensureMonth(country, key) {
        const cState = getState(country);
        if (cState.months[key]) {
            return true;
        }
        if (!readSyncInfo(country).months || !readSyncInfo(country).months[key]) {
            return false;
        }
        try {
            cState.months[key] = await readJson(country, `${key}.json`);
            return true;
        } catch (e) {
            return false;
        }
    }

    async function ensure(country, from, to) {
        const keys = new Set(GPPriceIndexCore.datesBetween(GPPriceIndexCore.addDays(from, -MAX_BACK_DAYS), to).map((date) => date.slice(0, 7)));
        for (const key of keys) {
            await ensureMonth(country, key);
        }
    }

    async function dayReference({ fuel, date, lat, lon, country = 'es' }) {
        let c = 'es';
        if (countries[country]) {
            c = country;
        }
        await ensure(c, date, date);
        const cState = getState(c);
        const day = GPPriceIndexCore.nearestDay(cState.months, date, MAX_BACK_DAYS);
        if (!day) {
            return null;
        }
        const national = GPPriceIndexCore.average(cState.months, fuel, [day], { type: 'national' });
        let zone = null;
        if (typeof lat === 'number' && typeof lon === 'number') {
            zone = GPPriceIndexCore.average(cState.months, fuel, [day], { type: 'zone', keys: GPPriceIndexCore.cellsAround(lat, lon, ZONE_RADIUS_KM) });
        }
        return { date: day, national, zone };
    }

    async function periodReference({ fuel, from, to, points, country = 'es' }) {
        let c = 'es';
        if (countries[country]) {
            c = country;
        }
        await ensure(c, from, to);
        const cState = getState(c);
        const dates = GPPriceIndexCore.datesBetween(from, to);
        const national = GPPriceIndexCore.average(cState.months, fuel, dates, { type: 'national' });
        const zones = [];
        for (const point of points) {
            const zone = GPPriceIndexCore.average(cState.months, fuel, dates, { type: 'zone', keys: GPPriceIndexCore.cellsAround(point.lat, point.lon, ZONE_RADIUS_KM) });
            if (zone) {
                zones.push({ ...zone, liters: point.liters });
            }
        }
        return { national, zones };
    }

    return { available, sync, dayReference, periodReference, ZONE_RADIUS_KM };
})();

GPPriceIndex.sync(false);
window.addEventListener('online', () => GPPriceIndex.sync(false));
