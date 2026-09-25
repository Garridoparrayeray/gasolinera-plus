const SITE_URL = 'https://gasolineraplus.vercel.app';
const MIN_DROP = 0.002;
const KG_FUELS = ['gnc', 'gnl', 'hidrogeno', 'biogas_natural_comprimido', 'biogas_natural_licuado'];
const LABELS = {
    gasoleo_a: 'Gasóleo A',
    gasolina_95_e5: 'Gasolina 95',
    gasoleo_premium: 'Gasóleo Premium',
    gasolina_98_e5: 'Gasolina 98',
    adblue: 'AdBlue',
    glp: 'GLP',
    gasoleo_b: 'Gasóleo B',
    gasolina_95_e5_premium: 'Gasolina 95 Premium',
};

function readJson(key, fallback) {
    const stored = CapacitorKV.get(key);
    if (!stored || !stored.value) {
        return fallback;
    }
    try {
        return JSON.parse(stored.value);
    } catch (e) {
        return fallback;
    }
}

function writeJson(key, value) {
    CapacitorKV.set(key, JSON.stringify(value));
}

function priceText(value, slug) {
    let text = value.toFixed(3).replace('.', ',') + ' €';
    if (KG_FUELS.indexOf(slug) !== -1) {
        text += '/kg';
    }
    return text;
}

function labelFor(slug) {
    if (LABELS[slug]) {
        return LABELS[slug];
    }
    return slug;
}

async function checkPrices() {
    if (readJson('enabled', false) !== true) {
        return 0;
    }
    const favorites = readJson('favorites', []);
    const last = readJson('lastPrices', {});
    const next = {};
    const notifications = [];

    for (let i = 0; i < favorites.length; i++) {
        const favorite = favorites[i];
        let station = null;
        try {
            const response = await fetch(SITE_URL + '/api/stations/' + encodeURIComponent(favorite.ideess));
            if (response.ok) {
                station = await response.json();
            }
        } catch (e) {
            station = null;
        }
        if (!station || !station.combustibles) {
            if (last[favorite.ideess]) {
                next[favorite.ideess] = last[favorite.ideess];
            }
            continue;
        }
        const previous = last[favorite.ideess] || {};
        const prices = {};
        const lines = [];
        const slugs = Object.keys(station.combustibles);
        for (let j = 0; j < slugs.length; j++) {
            const slug = slugs[j];
            const price = station.combustibles[slug].precio;
            prices[slug] = price;
            if (typeof previous[slug] === 'number' && previous[slug] - price >= MIN_DROP && lines.length < 3) {
                lines.push(labelFor(slug) + ': ' + priceText(previous[slug], slug) + ' → ' + priceText(price, slug));
            }
        }
        next[favorite.ideess] = prices;
        if (lines.length > 0) {
            notifications.push({
                id: 1000 + (i % 900),
                title: favorite.rotulo + ' ha bajado de precio',
                body: lines.join('\n'),
                scheduleAt: new Date(Date.now() + 1000),
            });
        }
    }

    writeJson('lastPrices', next);
    if (notifications.length > 0) {
        CapacitorNotifications.schedule(notifications);
    }
    return notifications.length;
}

addEventListener('syncFavorites', (resolve, reject, args) => {
    try {
        if (args && args.favorites) {
            writeJson('favorites', args.favorites);
        }
        if (args && typeof args.enabled === 'boolean') {
            writeJson('enabled', args.enabled);
        }
        resolve();
    } catch (e) {
        reject(e);
    }
});

addEventListener('checkPrices', async (resolve, reject) => {
    try {
        const sent = await checkPrices();
        resolve({ sent });
    } catch (e) {
        reject(e);
    }
});
