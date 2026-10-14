const SITE_URL = 'https://gasolineraplus.vercel.app';
const DEFAULT_THRESHOLD = 0.03;
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
    let threshold = Number(readJson('threshold', DEFAULT_THRESHOLD));
    if (!(threshold > 0 && threshold <= 1)) {
        threshold = DEFAULT_THRESHOLD;
    }
    const notifyRises = readJson('rises', false) === true;
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
        const drops = [];
        const rises = [];
        const slugs = Object.keys(station.combustibles);
        for (let j = 0; j < slugs.length; j++) {
            const slug = slugs[j];
            const price = station.combustibles[slug].precio;
            prices[slug] = price;
            if (typeof previous[slug] !== 'number') {
                continue;
            }
            const diff = price - previous[slug];
            if (Math.abs(diff) + 1e-9 < threshold) {
                prices[slug] = previous[slug];
            } else if (diff < 0) {
                drops.push(labelFor(slug) + ': ' + priceText(previous[slug], slug) + ' → ' + priceText(price, slug));
            } else if (notifyRises) {
                rises.push(labelFor(slug) + ': ' + priceText(previous[slug], slug) + ' → ' + priceText(price, slug));
            }
        }
        next[favorite.ideess] = prices;
        const lines = drops.concat(rises).slice(0, 3);
        if (lines.length > 0) {
            let title = favorite.rotulo + ' ha cambiado de precio';
            if (rises.length === 0) {
                title = favorite.rotulo + ' ha bajado de precio';
            } else if (drops.length === 0) {
                title = favorite.rotulo + ' ha subido de precio';
            }
            notifications.push({
                id: 1000 + (i % 900),
                title: title,
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
        if (args && typeof args.threshold === 'number') {
            writeJson('threshold', args.threshold);
        }
        if (args && typeof args.rises === 'boolean') {
            writeJson('rises', args.rises);
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
