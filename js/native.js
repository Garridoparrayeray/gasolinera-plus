const GPNative = (() => {
    const SITE_URL = 'https://gasolineraplus.vercel.app';
    const RELEASES_API = 'https://api.github.com/repos/Garridoparrayeray/gasolinera-plus/releases/latest';
    const APK_URL = 'https://github.com/Garridoparrayeray/gasolinera-plus/releases/latest/download/gasolinera-plus.apk';
    const OFFLINE_REFRESH_MS = 20 * 60 * 60 * 1000;
    const backHandlers = [];

    function isNative() {
        return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    }

    function platform() {
        if (window.Capacitor && window.Capacitor.getPlatform) {
            return window.Capacitor.getPlatform();
        }
        return 'web';
    }

    function plugin(name) {
        if (!isNative() || !window.Capacitor.Plugins) {
            return null;
        }
        return window.Capacitor.Plugins[name] || null;
    }

    function remoteBase() {
        if (window.GP_API_BASE) {
            return window.GP_API_BASE;
        }
        return SITE_URL;
    }

    function apiBase() {
        if (window.GP_API_BASE) {
            return window.GP_API_BASE;
        }
        if (isNative()) {
            return SITE_URL;
        }
        return '';
    }

    function publicUrl(path) {
        if (isNative()) {
            return SITE_URL + path;
        }
        return window.location.origin + path;
    }

    async function share({ title, text, path }) {
        const url = publicUrl(path);
        const Share = plugin('Share');
        if (Share) {
            await Share.share({ title, text, url, dialogTitle: 'Compartir gasolinera' });
            return true;
        }
        if (navigator.share) {
            await navigator.share({ title, text, url });
            return true;
        }
        return false;
    }

    function canShare() {
        return Boolean(plugin('Share') || navigator.share);
    }

    async function openExternal(url) {
        const AppLauncher = plugin('AppLauncher');
        if (AppLauncher) {
            try {
                await AppLauncher.openUrl({ url });
                return;
            } catch (e) {
                window.open(url, '_blank');
                return;
            }
        }
        window.open(url, '_blank', 'noopener');
    }

    function readPosition(options) {
        const Geolocation = plugin('Geolocation');
        if (Geolocation) {
            return Geolocation.getCurrentPosition({
                enableHighAccuracy: false,
                timeout: options.timeout,
                maximumAge: options.maximumAge,
            });
        }
        return new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    }

    async function getPosition(options) {
        try {
            return await readPosition(options);
        } catch (error) {
            if (error && error.code === 1) {
                throw error;
            }
            return readPosition({ timeout: 5000, maximumAge: 30 * 60 * 1000 });
        }
    }

    async function locationPermission() {
        const Geolocation = plugin('Geolocation');
        if (Geolocation) {
            try {
                const status = await Geolocation.checkPermissions();
                return status.location;
            } catch (e) {
                return 'denied';
            }
        }
        if ('permissions' in navigator) {
            try {
                const status = await navigator.permissions.query({ name: 'geolocation' });
                return status.state;
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    function hasGeolocation() {
        return Boolean(plugin('Geolocation')) || 'geolocation' in navigator;
    }

    function onBack(handler) {
        backHandlers.push(handler);
    }

    function handleBack() {
        for (let i = backHandlers.length - 1; i >= 0; i--) {
            if (backHandlers[i]()) {
                return true;
            }
        }
        return false;
    }

    function closeTopDialog() {
        const open = [...document.querySelectorAll('dialog[open]')];
        if (!open.length) {
            return false;
        }
        open[open.length - 1].close();
        return true;
    }

    function versionNumber(tag) {
        return String(tag || '').replace(/^v/, '').split('.').map((part) => Number(part) || 0);
    }

    function isNewer(remote, local) {
        const a = versionNumber(remote);
        const b = versionNumber(local);
        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            const x = a[i] || 0;
            const y = b[i] || 0;
            if (x !== y) {
                return x > y;
            }
        }
        return false;
    }

    async function checkForUpdate(notify) {
        const App = plugin('App');
        if (!App || platform() !== 'android' || !navigator.onLine) {
            return;
        }
        try {
            const info = await App.getInfo();
            const response = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } });
            if (!response.ok) {
                return;
            }
            const release = await response.json();
            if (isNewer(release.tag_name, info.version)) {
                notify(release.tag_name.replace(/^v/, ''), APK_URL);
            }
        } catch (e) {
            return;
        }
    }

    async function refreshOfflineData() {
        if (!isNative() || !navigator.onLine) {
            return;
        }
        try {
            const last = await AlertsStore.get('offlineStationsAt');
            if (last && Date.now() - last < OFFLINE_REFRESH_MS) {
                return;
            }
            const response = await fetch(remoteBase() + '/data/stations-lite.json');
            if (!response.ok) {
                return;
            }
            const payload = await response.json();
            await AlertsStore.set('offlineStations', payload);
            await AlertsStore.set('offlineStationsAt', Date.now());
        } catch (e) {
            return;
        }
    }

    async function cachedOfflineStations() {
        if (!isNative()) {
            return null;
        }
        try {
            const payload = await AlertsStore.get('offlineStations');
            if (payload) {
                return payload;
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    function setupGetApp() {
        const section = document.getElementById('get-app');
        if (!section) {
            return;
        }
        const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (isNative() || standalone) {
            section.hidden = true;
            return;
        }
        const ua = navigator.userAgent;
        const isIos = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const isAndroid = /Android/.test(ua);
        const androidLink = document.getElementById('get-app-android');
        const iosButton = document.getElementById('get-app-ios');
        const iosHelp = document.getElementById('get-app-ios-help');
        if (isIos) {
            androidLink.hidden = true;
        }
        if (isAndroid) {
            iosButton.hidden = true;
        }
        iosButton.addEventListener('click', () => {
            iosHelp.hidden = !iosHelp.hidden;
        });
    }

    function setupNativeShell() {
        if (!isNative()) {
            return;
        }
        document.documentElement.classList.add('is-native', 'is-' + platform());

        document.addEventListener('click', (event) => {
            const link = event.target.closest('a[href]');
            if (!link) {
                return;
            }
            const url = new URL(link.href, window.location.href);
            if (url.origin === window.location.origin) {
                return;
            }
            event.preventDefault();
            openExternal(url.href);
        }, true);

        const App = plugin('App');
        if (App) {
            App.addListener('backButton', () => {
                if (closeTopDialog()) {
                    return;
                }
                if (handleBack()) {
                    return;
                }
                if (window.history.length > 1 && window.location.pathname !== '/') {
                    window.history.back();
                    return;
                }
                App.minimizeApp();
            });
            App.addListener('appUrlOpen', (event) => {
                const target = new URL(event.url);
                if (target.pathname.startsWith('/stations/')) {
                    window.location.href = target.pathname;
                }
            });
        }
    }

    setupNativeShell();
    document.addEventListener('DOMContentLoaded', setupGetApp);

    return {
        SITE_URL,
        APK_URL,
        isNative,
        platform,
        plugin,
        apiBase,
        publicUrl,
        share,
        canShare,
        getPosition,
        hasGeolocation,
        locationPermission,
        openExternal,
        onBack,
        checkForUpdate,
        refreshOfflineData,
        cachedOfflineStations,
    };
})();
