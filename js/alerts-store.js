const AlertsStore = (() => {
    const DB_NAME = 'gasolinera-alerts';
    const STORE = 'kv';
    const DEFAULT_THRESHOLD = 0.03;

    const FUEL_LABELS = {
        gasoleo_a: 'Gasóleo A',
        gasolina_95_e5: 'Gasolina 95',
        gasoleo_premium: 'Gasóleo Premium',
        gasolina_98_e5: 'Gasolina 98',
        adblue: 'AdBlue',
        glp: 'GLP',
        gasoleo_b: 'Gasóleo B',
        gasolina_95_e5_premium: 'Gasolina 95 Premium',
        gasolina_95_e10: 'Gasolina 95 E10',
        gasolina_98_e10: 'Gasolina 98 E10',
        gasolina_95_e25: 'Gasolina 95 E25',
        gasolina_95_e85: 'Gasolina 95 E85',
        gnc: 'Gas Natural Comprimido',
        gnl: 'Gas Natural Licuado',
        hidrogeno: 'Hidrógeno',
        biodiesel: 'Biodiésel',
        bioetanol: 'Bioetanol',
        diesel_renovable: 'Diésel Renovable',
        gasolina_renovable: 'Gasolina Renovable',
        biogas_natural_comprimido: 'Biogás Natural Comprimido',
        biogas_natural_licuado: 'Biogás Natural Licuado',
        amoniaco: 'Amoniaco',
        metanol: 'Metanol',
    };

    const KG_FUELS = new Set(['gnc', 'gnl', 'hidrogeno', 'biogas_natural_comprimido', 'biogas_natural_licuado']);

    function unitFor(slug) {
        if (typeof GPCountry !== 'undefined') {
            return GPCountry.fuelUnit(slug);
        }
        if (KG_FUELS.has(slug)) {
            return 'kg';
        }
        return 'L';
    }

    function labelFor(slug) {
        if (typeof GPCountry !== 'undefined') {
            return GPCountry.fuelLabel(slug);
        }
        if (FUEL_LABELS[slug]) {
            return FUEL_LABELS[slug];
        }
        return slug;
    }

    function priceText(value, slug) {
        let text = value.toFixed(3) + ' €';
        if (unitFor(slug) === 'kg') {
            text += '/kg';
        }
        return text;
    }

    function changeLine(fuel) {
        return labelFor(fuel.slug) + ': ' + priceText(fuel.from, fuel.slug) + ' → ' + priceText(fuel.to, fuel.slug);
    }

    function notificationFor(drop) {
        const fuelDrops = drop.fuelDrops || [];
        const fuelRises = drop.fuelRises || [];
        let title = drop.favorite.rotulo + ' ha cambiado de precio';
        if (fuelRises.length === 0) {
            title = drop.favorite.rotulo + ' ha bajado de precio';
        } else if (fuelDrops.length === 0) {
            title = drop.favorite.rotulo + ' ha subido de precio';
        }
        const lines = [...fuelDrops, ...fuelRises].slice(0, 3).map(changeLine);
        return {
            title,
            options: {
                body: lines.join('\n'),
                icon: '/icons/icon-192.png',
                tag: 'price-' + drop.favorite.ideess,
                data: { ideess: drop.favorite.ideess },
            },
        };
    }

    let dbPromise = null;

    function openDb() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, 1);
                request.onupgradeneeded = () => request.result.createObjectStore(STORE);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => {
                    dbPromise = null;
                    reject(request.error);
                };
            });
        }
        return dbPromise;
    }

    async function get(key) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const request = db.transaction(STORE).objectStore(STORE).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function set(key, value) {
        const db = await openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getSettings() {
        const threshold = Number(await get('alertThreshold'));
        let valid = DEFAULT_THRESHOLD;
        if (threshold > 0 && threshold <= 1) {
            valid = threshold;
        }
        return { threshold: valid, rises: (await get('alertRises')) === true };
    }

    // El precio de referencia solo se cambia cuando el cambio llega al mínimo elegido. Así una
    // subida o bajada lenta, de uno o dos céntimos cada día, acaba avisando cuando suma lo bastante.
    function compare(previousPrices, stationFuels, settings) {
        const prices = {};
        const fuelDrops = [];
        const fuelRises = [];
        for (const [slug, info] of Object.entries(stationFuels)) {
            const previous = previousPrices[slug];
            prices[slug] = info.precio;
            if (typeof previous !== 'number') {
                continue;
            }
            const diff = info.precio - previous;
            if (Math.abs(diff) + 1e-9 < settings.threshold) {
                prices[slug] = previous;
            } else if (diff < 0) {
                fuelDrops.push({ slug, from: previous, to: info.precio });
            } else if (settings.rises) {
                fuelRises.push({ slug, from: previous, to: info.precio });
            }
        }
        return { prices, fuelDrops, fuelRises };
    }

    async function checkPrices(apiBase) {
        let base = '';
        if (apiBase) {
            base = apiBase;
        }
        const settings = await getSettings();
        const favorites = (await get('favorites')) || [];
        const last = (await get('lastPrices')) || {};
        const next = {};
        const drops = [];

        for (const favorite of favorites) {
            let key = favorite.ideess;
            let query = '';
            if (favorite.pais && favorite.pais !== 'es') {
                key = favorite.pais + ':' + favorite.ideess;
                query = '?pais=' + favorite.pais;
            }
            let station;
            try {
                const response = await fetch(`${base}/api/stations/${encodeURIComponent(favorite.ideess)}${query}`);
                if (!response.ok) {
                    throw new Error(String(response.status));
                }
                station = await response.json();
            } catch (e) {
                if (last[key]) {
                    next[key] = last[key];
                }
                continue;
            }

            const result = compare(last[key] || {}, station.combustibles || {}, settings);
            next[key] = result.prices;
            if (result.fuelDrops.length > 0 || result.fuelRises.length > 0) {
                drops.push({ favorite, fuelDrops: result.fuelDrops, fuelRises: result.fuelRises });
            }
        }

        await set('lastPrices', next);
        return drops;
    }

    return { FUEL_LABELS, DEFAULT_THRESHOLD, labelFor, unitFor, priceText, notificationFor, get, set, getSettings, compare, checkPrices };
})();
