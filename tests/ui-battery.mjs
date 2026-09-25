import { launch, sleep } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9372));
const { ev, go, check, waitFor } = s;

const sizes = [{ n: 'movil', w: 390, h: 844, m: true }, { n: 'pc', w: 1366, h: 800, m: false }];
let sizeFilter = null;
if (process.env.SIZES) {
    sizeFilter = process.env.SIZES.split(',');
}

async function search(query) {
    await ev(`(()=>{const i=document.getElementById('search-input');i.value=${JSON.stringify(query)};i.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('search-form').requestSubmit();})()`);
    await sleep(300);
    return waitFor("document.querySelectorAll('#stations-list li').length > 0 && !document.getElementById('pagination-status').textContent.includes('Cargando')", 10000);
}

async function openFirstStation() {
    await ev("document.querySelector('#stations-list li').click()");
    return waitFor("document.getElementById('station-modal').open && document.querySelectorAll('#modal-fuels li').length > 0", 8000);
}

async function closeModal() {
    await ev("document.getElementById('modal-close').click()");
    await waitFor("!document.getElementById('station-modal').open", 3000);
}

for (const size of sizes.filter((x) => !sizeFilter || sizeFilter.includes(x.n))) {
    await s.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: 1, mobile: size.m });
    const tag = size.n;
    s.where = `${tag}/cerca`;
    await s.setGeolocation(43.2630, -2.9350);
    await go('/', 1500);
    await ev('localStorage.clear()');
    await go('/', 1500);
    check(`${tag} carga la lista de cercanas con ubicacion`, await waitFor("document.querySelectorAll('#stations-list li').length > 0", 12000));
    check(`${tag} sin scroll horizontal`, (await ev('document.documentElement.scrollWidth - document.documentElement.clientWidth')) <= 0);
    check(`${tag} paginador sin NaN`, !(await ev("document.getElementById('pagination-status').textContent")).includes('NaN'));
    check(`${tag} media nacional cargada`, await waitFor("/\\d/.test(document.getElementById('national-gasoleo-a').textContent)", 6000));

    s.where = `${tag}/buscar`;
    check(`${tag} buscar "bilbao" da resultados`, await search('bilbao'));
    check(`${tag} abre la ficha de una gasolinera`, await openFirstStation());
    check(`${tag} la ficha cambia la URL`, (await ev('location.pathname')).startsWith('/stations/'));
    check(`${tag} la ficha tiene horario`, (await ev("document.getElementById('modal-horario').textContent.length")) > 3);
    await ev("document.getElementById('modal-compare-toggle').click()");
    await sleep(1200);
    check(`${tag} anadir a comparar`, (await ev("document.getElementById('compare-count').textContent")) === '1');
    await openFirstStation();
    await ev("document.getElementById('modal-favorite-toggle').click()");
    await sleep(1200);
    check(`${tag} anadir a favoritas`, (await ev("document.getElementById('favorites-count').textContent")) === '1');
    if (await ev("document.getElementById('station-modal').open")) {
        await closeModal();
    }
    await ev("document.getElementById('compare-open').click()");
    check(`${tag} comparador muestra tabla`, await waitFor("document.querySelectorAll('#compare-table tr').length > 2", 6000));
    await ev("document.getElementById('compare-close').click()");
    await ev("document.getElementById('favorites-open').click()");
    check(`${tag} panel de favoritas lista 1`, await waitFor("document.querySelectorAll('#favorites-list li').length === 1", 3000));
    await ev("document.getElementById('favorites-close').click()");

    s.where = `${tag}/filtro`;
    await ev("(()=>{const f=document.getElementById('filter-fuel');f.value='glp';f.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await sleep(300);
    check(`${tag} filtro GLP muestra precios de GLP`, await waitFor("[...document.querySelectorAll('#stations-list li')].length > 0 && [...document.querySelectorAll('#stations-list li')].every(li => li.textContent.includes('GLP'))", 10000));
    await ev("(()=>{const f=document.getElementById('filter-fuel');f.value='gasoleo_a';f.dispatchEvent(new Event('change',{bubbles:true}));})()");

    s.where = `${tag}/mapa`;
    await ev("document.getElementById('view-map-btn').click()");
    check(`${tag} el mapa pinta gasolineras`, await waitFor("document.querySelectorAll('#map .leaflet-interactive, #map .marker-cluster').length > 0", 12000));

    s.where = `${tag}/estadisticas`;
    await ev("document.getElementById('view-stats-btn').click()");
    check(`${tag} estadisticas dibujan la media nacional`, await waitFor("typeof Chart !== 'undefined' && !!Chart.getChart(document.getElementById('stats-national-chart'))", 10000));
    check(`${tag} estadisticas por provincia`, await waitFor("!!Chart.getChart(document.getElementById('stats-province-chart'))", 10000));
    await ev("document.getElementById('view-list-btn').click()");

    s.where = `${tag}/legal`;
    await ev("document.getElementById('legal-open').click()");
    check(`${tag} aviso legal abre`, (await ev("document.getElementById('legal-panel').open")) === true);
    await ev("document.getElementById('legal-close').click()");
}

s.where = 'sin-ubicacion';
await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await s.send('Browser.setPermission', { permission: { name: 'geolocation' }, setting: 'prompt', origin: s.base });
await s.send('Emulation.clearGeolocationOverride');
await ev('localStorage.clear()');
await go('/', 1500);
check('sin ubicacion: aparece el dialogo', await waitFor("document.getElementById('geo-ask').open", 5000));
await ev("document.getElementById('geo-skip').click()");
await sleep(1500);
check('sin ubicacion: paginador sin NaN', !(await ev("document.getElementById('pagination-status').textContent")).includes('NaN'));
check('sin ubicacion: invita a buscar', (await ev("document.getElementById('stations-empty').hidden")) === false);
check('sin ubicacion: se puede buscar', await search('valladolid'));

s.where = 'enlace-directo';
const firstId = await ev("fetch('/api/stations/search?q=bilbao&limit=1').then(r=>r.json()).then(d=>d.stations[0].ideess)");
await go(`/stations/${firstId}`, 1500);
check('enlace directo abre la ficha', await waitFor("document.getElementById('station-modal').open && document.querySelectorAll('#modal-fuels li').length > 0", 8000));

s.where = 'offline';
await ev('navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister())))');
await ev("localStorage.setItem('gasolinera_location_pref','off')");
await go('/', 2000);
s.offline = true;
s.allowHttpErrors = true;
await s.send('Network.setBlockedURLs', { urls: ['*/api/*'] });
check('offline: buscar usa los datos locales', await search('bilbao'));
check('offline: abre la ficha', await openFirstStation());
check('offline: la ficha tiene precios', (await ev("document.querySelectorAll('#modal-fuels li').length")) > 0);
await s.send('Network.setBlockedURLs', { urls: [] });
s.offline = false;
s.allowHttpErrors = false;

s.finish('UI');
