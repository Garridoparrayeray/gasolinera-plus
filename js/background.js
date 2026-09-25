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
            favorites: favorites.map((favorite) => ({ ideess: favorite.ideess, rotulo: favorite.rotulo })),
        };
        if (enabled !== null) {
            details.enabled = enabled;
        }
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
