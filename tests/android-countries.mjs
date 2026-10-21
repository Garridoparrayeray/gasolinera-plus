import { writeFileSync } from 'node:fs';
import { attach, sleep } from './cdp.mjs';
import { adb, connectToApp, geoFix, PKG } from './android-helpers.mjs';

adb('reverse', 'tcp:8099', 'tcp:8099');
adb('shell', 'pm', 'clear', PKG);
adb('shell', 'pm', 'grant', PKG, 'android.permission.ACCESS_FINE_LOCATION');
geoFix(43.263, -2.935, 0);
adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
const s = await attach(await connectToApp(), () => {}, 'https://localhost');
s.allowHttpErrors = true;
s.ignoreConsole = /already exists, cannot be overwritten|Could not obtain location in time/;
const { ev, check, waitFor } = s;

async function route(points) {
    return ev(`new Promise((resolve) => {
        const worker = new Worker('/js/router-worker.js');
        worker.onmessage = (event) => {
            if (event.data.progress) {
                return;
            }
            resolve(JSON.stringify({ error: event.data.error || null, countries: event.data.result && event.data.result.countries, km: event.data.result && Math.round(event.data.result.meters / 1000) }));
            worker.terminate();
        };
        worker.postMessage({ id: 1, type: 'route', points: ${JSON.stringify(points)}, avoidTolls: false, remote: GPNative.apiBase() });
    })`);
}

async function cachedFiles() {
    return ev(`(async () => {
        const names = [];
        for (const key of await caches.keys()) {
            const cache = await caches.open(key);
            for (const request of await cache.keys()) {
                names.push(request.url.split('/').pop());
            }
        }
        return names.join(',');
    })()`);
}

s.where = 'es';
await waitFor("typeof GPCountry !== 'undefined'", 15000);
check('arranca en España', (await ev('GPCountry.code')) === 'es');
let result = JSON.parse(await route([[43.2630, -2.9350], [40.4168, -3.7038]]));
check('Bilbao → Madrid con el grafo del APK', result.km > 380 && result.km < 440 && JSON.stringify(result.countries) === '["es"]', JSON.stringify(result));
check('sin descargas de otros países', !(await cachedFiles()).includes('main-pt'));

result = JSON.parse(await route([[42.2406, -8.7207], [41.1579, -8.6291]]));
check('Vigo → Oporto descarga Portugal', result.km > 120 && result.km < 180 && JSON.stringify(result.countries) === '["es","pt"]', JSON.stringify(result));
check('Portugal queda guardado en el móvil', (await cachedFiles()).includes('main-pt'));

s.where = 'pt';
await ev("location.href = '/?pais=pt'");
await sleep(1500);
await waitFor("typeof GPCountry !== 'undefined' && GPCountry.code === 'pt' && document.readyState === 'complete'", 20000);
check('cambia a Portugal', (await ev('GPCountry.code')) === 'pt' && (await ev('document.documentElement.lang')) === 'pt');
check('cabecera PORTUGAL', (await ev("document.getElementById('app-title-country').textContent")) === 'Portugal');
await ev("document.getElementById('filter-location') && (document.getElementById('filter-location').value = 'Lisboa')");
const stations = await ev(`fetch(GPNative.apiBase() + '/api' + GPCountry.apiQuery('/stations/near?lat=38.7223&lon=-9.1393&radius=5&limit=3')).then((r) => r.json()).then((d) => d.stations.map((x) => x.rotulo).join(','))`);
check('la API responde con gasolineras de Portugal', typeof stations === 'string' && stations.length > 0, String(stations));
const shot = await s.send('Page.captureScreenshot', { format: 'png' });
if (process.env.SHOTS) {
    writeFileSync(`${process.env.SHOTS}/android-pt.png`, Buffer.from(shot.data, 'base64'));
}
await ev("location.href = '/?pais=es'");
await sleep(2000);
s.finish('android países');
process.exit(0);
