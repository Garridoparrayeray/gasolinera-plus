const GPBackground = (() => {
    const LABEL = 'app.vercel.gasolineraplus.alerts';

    function runner() {
        return GPNative.plugin('BackgroundRunner');
    }

    async function syncAlerts(favorites, enabled) {
        const plugin = runner();
        if (!plugin) {
            return;
        }
        const details = {
            favorites: favorites.map((favorite) => ({ ideess: favorite.ideess, rotulo: favorite.rotulo, pais: favorite.pais })),
        };
        if (enabled !== null) {
            details.enabled = enabled;
        }
        details.labels = {};
        GPCountry.fuels.forEach((fuel) => {
            details.labels[fuel.slug] = GPCountry.fuelLabel(fuel.slug);
        });
        details.texts = {
            changed: GPCountry.tr('ha cambiado de precio'),
            down: GPCountry.tr('ha bajado de precio'),
            up: GPCountry.tr('ha subido de precio'),
        };
        const settings = await AlertsStore.getSettings();
        details.threshold = settings.threshold;
        details.rises = settings.rises;
        await plugin.dispatchEvent({ label: LABEL, event: 'syncFavorites', details });
    }

    async function checkNow() {
        const plugin = runner();
        if (!plugin) {
            return false;
        }
        await plugin.dispatchEvent({ label: LABEL, event: 'checkPrices', details: {} });
        return true;
    }

    return { syncAlerts, checkNow };
})();
