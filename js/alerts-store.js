const AlertsStore = (() => {
    const DB_NAME = 'gasolinera-alerts';
    const STORE = 'kv';
    const MIN_DROP = 0.002;

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
        if (KG_FUELS.has(slug)) {
            return 'kg';
        }
        return 'L';
    }

    function labelFor(slug) {
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

    function notificationFor(drop) {
        const lines = drop.fuelDrops.slice(0, 3).map((fuel) =>
            labelFor(fuel.slug) + ': ' + priceText(fuel.from, fuel.slug) + ' → ' + priceText(fuel.to, fuel.slug)
        );
        return {
            title: drop.favorite.rotulo + ' ha bajado de precio',
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

    async function checkPrices(apiBase) {
        let base = '';
        if (apiBase) {
            base = apiBase;
        }
        const favorites = (await get('favorites')) || [];
        const last = (await get('lastPrices')) || {};
        const next = {};
        const drops = [];

        for (const favorite of favorites) {
            let station;
            try {
                const response = await fetch(`${base}/api/stations/${encodeURIComponent(favorite.ideess)}`);
                if (!response.ok) {
                    throw new Error(String(response.status));
                }
                station = await response.json();
            } catch (e) {
                if (last[favorite.ideess]) {
                    next[favorite.ideess] = last[favorite.ideess];
                }
                continue;
            }

            const previousPrices = last[favorite.ideess] || {};
            const prices = {};
            const fuelDrops = [];
            for (const [slug, info] of Object.entries(station.combustibles || {})) {
                prices[slug] = info.precio;
                const previous = previousPrices[slug];
                if (typeof previous === 'number' && previous - info.precio >= MIN_DROP) {
                    fuelDrops.push({ slug, from: previous, to: info.precio });
                }
            }
            next[favorite.ideess] = prices;
            if (fuelDrops.length > 0) {
                drops.push({ favorite, fuelDrops });
            }
        }

        await set('lastPrices', next);
        return drops;
    }

    return { FUEL_LABELS, labelFor, unitFor, priceText, notificationFor, get, set, checkPrices };
})();
