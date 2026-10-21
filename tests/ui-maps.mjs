import { launch } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9381));
const { ev, go, check, waitFor } = s;
s.ignoreHttp = /zone-comparison|api\.github\.com|github\.com|price-index-seed|__fake_maps__/;

await s.send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 GasolineraPlus/2' });
await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
        const index = { version: 1, regions: [
            { id: 'pais-vasco', name: 'País Vasco', bbox: [-3.5, 42.4, -1.7, 43.5], file: 'pais-vasco-1.pmtiles', bytes: 152709044, maxzoom: 15 },
            { id: 'madrid', name: 'Madrid', bbox: [-4.6, 39.8, -3.0, 41.2], file: 'madrid-1.pmtiles', bytes: 126300864, maxzoom: 15 },
        ] };
        const folders = new Set();
        const files = {};
        window.__fs = { folders, files, downloads: [], mkdirs: [] };
        // Como el de Android: downloadFile no crea las carpetas que faltan aunque se pida recursive.
        const filesystem = {
            mkdir: async ({ path }) => { window.__fs.mkdirs.push(path); folders.add(path); },
            downloadFile: async ({ url, path }) => {
                window.__fs.downloads.push(path);
                const folder = path.split('/').slice(0, -1).join('/');
                if (folder && !folders.has(folder)) {
                    throw new Error('Error downloading file: ' + path + ' (No such file or directory)');
                }
                files[path] = url.endsWith('index.json') ? JSON.stringify(index) : '';
                return { path };
            },
            readFile: async ({ path }) => {
                if (!(path in files)) { throw new Error('File does not exist'); }
                return { data: files[path] };
            },
            writeFile: async ({ path, data }) => { files[path] = data; return { uri: 'file:///' + path }; },
            stat: async ({ path }) => { if (!(path in files)) { throw new Error('File does not exist'); } return { size: 1 }; },
            getUri: async ({ path }) => ({ uri: 'file:///' + path }),
            deleteFile: async ({ path }) => { delete files[path]; },
            addListener: async () => ({ remove() {} }),
        };
        const noop = async () => ({});
        window.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
            convertFileSrc: (uri) => '/__fake_maps__/' + uri,
            Plugins: { Filesystem: filesystem, TripRecorder: new Proxy({ addListener: async () => ({ remove() {} }), listTrips: async () => ({ trips: [] }) }, { get: (t, k) => t[k] || noop }) },
        };
    })();
` });

s.where = 'mapas sin conexion';
await go('/', 800);
await ev("localStorage.clear(); indexedDB.deleteDatabase('gasolinera-garage')");
await go('/', 2500);
await ev("document.getElementById('view-garage-btn').click()");
check('la tarjeta de mapas esta visible en la app', (await ev("!document.getElementById('offline-maps-card').hidden")) === true);
check('la lista de mapas se carga aunque la carpeta no exista', await waitFor("document.querySelectorAll('#offline-maps-list li:not(.offline-maps-country)').length === 2", 6000), await ev("document.getElementById('offline-maps-note').textContent"));
check('no sale el aviso de error', (await ev("document.getElementById('offline-maps-note').hidden")) === true);
check('crea la carpeta de mapas antes de descargar', (await ev("window.__fs.mkdirs.includes('maps')")) === true, await ev('JSON.stringify(window.__fs.mkdirs)'));

s.where = 'descarga';
await ev("window.confirm = () => true; document.querySelector('#offline-maps-list li button').click()");
check('la descarga de un mapa se intenta con la carpeta creada', await waitFor("window.__fs.downloads.includes('maps/pais-vasco-1.pmtiles')", 5000), await ev('JSON.stringify(window.__fs.downloads)'));

s.where = 'indice de precios';
check('el indice de precios tambien crea su carpeta antes de descargar', await waitFor("window.__fs.mkdirs.includes('price-index')", 6000), await ev('JSON.stringify(window.__fs.mkdirs)'));

s.finish('MAPAS');
