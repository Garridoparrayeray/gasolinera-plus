import { execFileSync } from 'node:child_process';
import { attach, sleep } from './cdp.mjs';

const SDK = process.env.ANDROID_HOME || `${process.env.LOCALAPPDATA}/Android/Sdk`;
const ADB = `${SDK}/platform-tools/adb`;
const PKG = 'app.vercel.gasolineraplus';
const DEVTOOLS_PORT = Number(process.env.WEBVIEW_PORT || 9333);

function adb(...args) {
    return execFileSync(ADB, args, { encoding: 'utf8' }).trim();
}

function foregroundPackage() {
    const dump = adb('shell', 'dumpsys', 'activity', 'activities');
    const line = dump.split('\n').find((l) => l.includes('topResumedActivity') || l.includes('mResumedActivity'));
    if (!line) {
        return '';
    }
    return line;
}

async function connectToApp() {
    let pid = '';
    for (let i = 0; i < 30 && !pid; i++) {
        await sleep(500);
        try {
            pid = adb('shell', 'pidof', PKG);
        } catch (e) {
            pid = '';
        }
    }
    if (!pid) {
        throw new Error('la app no arranca');
    }
    execFileSync(ADB, ['forward', '--remove', `tcp:${DEVTOOLS_PORT}`], { stdio: 'ignore' });
    adb('forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:webview_devtools_remote_${pid}`);
    let page = null;
    for (let i = 0; i < 30 && !page; i++) {
        await sleep(500);
        try {
            const targets = await (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json`)).json();
            page = targets.find((t) => t.type === 'page' && t.url.startsWith('https://localhost'));
        } catch (e) {
            page = null;
        }
    }
    if (!page) {
        throw new Error('no se encuentra la WebView de la app');
    }
    return page.webSocketDebuggerUrl;
}

adb('reverse', `tcp:8021`, `tcp:8021`);
adb('shell', 'pm', 'clear', PKG);
for (const permission of ['ACCESS_FINE_LOCATION', 'ACCESS_COARSE_LOCATION', 'POST_NOTIFICATIONS']) {
    adb('shell', 'pm', 'grant', PKG, `android.permission.${permission}`);
}
const gpsTicker = setInterval(() => {
    try {
        adb('emu', 'geo', 'fix', '-2.9350', '43.2630');
    } catch (e) {
        return;
    }
}, 1000);
adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);

const s = await attach(await connectToApp(), () => {}, 'https://localhost');
const { ev, check, waitFor } = s;
s.ignoreHttp = /api\.github\.com\/repos\/.*\/releases\/latest/;
s.ignoreConsole = /OS-PLUG-GLOC-0010/;
s.where = 'arranque';

check('corre como app nativa Android', await waitFor("typeof GPNative !== 'undefined' && GPNative.isNative() && GPNative.platform() === 'android'", 10000));
check('Leaflet y Chart.js cargados sin CDN', (await ev("typeof L !== 'undefined' && typeof Chart !== 'undefined'")) === true);
check('fuentes propias cargadas', await waitFor("document.fonts.check('16px Inter') && document.fonts.check('16px \"Bricolage Grotesque\"')", 5000));
check('User-Agent propio para los tiles de OSM', (await ev('navigator.userAgent')).includes('GasolineraPlus/'));
check('sin seccion de descarga dentro de la app', (await ev("document.getElementById('get-app') === null")) === true);

check('no pregunta de nuevo si el permiso ya esta concedido', (await waitFor("document.getElementById('geo-ask').open", 3000)) === false);
check('lista de cercanas con el GPS del movil', await waitFor("document.querySelectorAll('#stations-list li').length > 0", 20000));
clearInterval(gpsTicker);
check('media nacional desde la API', await waitFor("/\\d/.test(document.getElementById('national-gasoleo-a').textContent)", 8000));

s.where = 'ficha';
await ev("document.querySelector('#stations-list li').click()");
check('abre la ficha', await waitFor("document.getElementById('station-modal').open && document.querySelectorAll('#modal-fuels li').length > 0", 8000));
check('boton compartir nativo visible', (await ev("!document.getElementById('modal-share').hidden")) === true);
adb('shell', 'input', 'keyevent', '4');
check('el boton atras cierra la ficha', await waitFor("!document.getElementById('station-modal').open", 4000));
check('la app sigue abierta tras atras', foregroundPackage().includes(PKG));

await ev("document.querySelector('#stations-list li').click()");
await waitFor("document.getElementById('station-modal').open", 6000);
await ev("document.getElementById('modal-directions').click()");
await sleep(3000);
const opened = foregroundPackage();
check('"Como llegar" abre Maps o el navegador', !opened.includes(PKG) && !opened.includes('launcher'), opened.trim().slice(0, 140));
adb('shell', 'am', 'start', '-n', `${PKG}/.MainActivity`);
await sleep(1500);
await ev("document.getElementById('station-modal').open && document.getElementById('modal-close').click()");

s.where = 'mapa';
await ev("document.getElementById('view-map-btn').click()");
check('el mapa pinta gasolineras', await waitFor("document.querySelectorAll('#map .leaflet-interactive, #map .marker-cluster').length > 0", 15000));
check('el mapa carga teselas', await waitFor("[...document.querySelectorAll('#map img.leaflet-tile')].some(img => img.complete && img.naturalWidth > 0)", 15000));
await ev("document.getElementById('view-list-btn').click()");

s.where = 'avisos';
check('el runner de avisos responde', (await ev('GPBackground.checkNow().then(() => true).catch(e => "ERROR " + e.message)')) === true);

s.where = 'offline';
s.offline = true;
s.allowHttpErrors = true;
await s.send('Network.setBlockedURLs', { urls: ['*localhost:8021*', '*gasolineraplus.vercel.app*'] });
await ev("(()=>{const i=document.getElementById('search-input');i.value='valladolid';document.getElementById('search-form').requestSubmit();})()");
check('sin conexion busca con los datos del APK', await waitFor("document.querySelectorAll('#stations-list li').length > 0 && document.getElementById('stations-list').textContent.toLowerCase().includes('valladolid')", 10000));
await ev("document.querySelector('#stations-list li').click()");
check('sin conexion abre la ficha', await waitFor("document.getElementById('station-modal').open && document.querySelectorAll('#modal-fuels li').length > 0", 8000));
await s.send('Network.setBlockedURLs', { urls: [] });
s.offline = false;
s.allowHttpErrors = false;

s.where = 'enlace';
const id = await ev("fetch(GPNative.apiBase() + '/api/stations/search?q=bilbao&limit=1').then(r => r.json()).then(d => d.stations[0].ideess)");
adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', `https://gasolineraplus.vercel.app/stations/${id}`, PKG);
check('un enlace a una ficha abre esa ficha en la app', await waitFor(`location.pathname === '/stations/${id}' && document.getElementById('station-modal').open`, 10000));

s.finish('ANDROID');
