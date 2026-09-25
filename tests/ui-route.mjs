import { launch, sleep } from './cdp.mjs';

const BASE_URL = (process.env.BASE_URL || 'http://localhost:8021').replace(/\/$/, '');
const graph = await fetch(BASE_URL + '/data/road-graph/manifest.json').catch(() => null);
if (!graph || !graph.ok) {
    console.log('RESULTADO RUTA: SKIP (no hay grafo de carreteras en este servidor)');
    process.exit(0);
}

const s = await launch(Number(process.env.CDP_PORT || 9376));
const { ev, go, check, skip, waitFor } = s;

async function pickPlace(inputId, text, expected) {
    await ev(`(()=>{const i=document.getElementById('${inputId}');i.focus();i.value=${JSON.stringify(text)};i.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    const listId = inputId + '-suggestions';
    const shown = await waitFor(`!document.getElementById('${listId}').hidden && [...document.querySelectorAll('#${listId} button')].some(b => b.textContent.startsWith(${JSON.stringify(expected)}))`, 8000);
    if (shown) {
        await ev(`[...document.querySelectorAll('#${listId} button')].find(b => b.textContent.startsWith(${JSON.stringify(expected)})).click()`);
    }
    return shown;
}

async function calculate(timeout = 60000) {
    await ev("document.getElementById('route-form').requestSubmit()");
    await sleep(300);
    return waitFor("!document.getElementById('route-submit').disabled", timeout);
}

await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await s.setGeolocation(43.2630, -2.9350);
await go('/', 800);
await ev("localStorage.clear(); localStorage.setItem('gasolinera_location_pref','on'); indexedDB.deleteDatabase('gasolinera-garage')");
await go('/?view=route', 2500);

s.where = 'formulario';
check('la vista de ruta se abre', (await ev("!document.getElementById('view-route').hidden")) === true);
check('pestaña Ruta seleccionada', (await ev("document.getElementById('view-route-btn').getAttribute('aria-selected')")) === 'true');
check('sugiere Bilbao sin conexion', await pickPlace('route-from', 'bilb', 'Bilbao'));
check('sugiere Madrid', await pickPlace('route-to', 'madri', 'Madrid'));

s.where = 'calculo';
check('calcula la ruta', await calculate(120000), await ev("document.getElementById('route-status').textContent"));
check('muestra el resultado', (await ev("!document.getElementById('route-result').hidden")) === true);
const km = await ev("parseFloat(document.getElementById('route-distance').textContent.replace('.', '').replace(',', '.'))");
check('distancia plausible Bilbao-Madrid', km > 380 && km < 440, `${km} km`);
check('dibuja la ruta en el mapa', (await ev("document.querySelectorAll('#route-map path.leaflet-interactive').length")) > 0);
await waitFor("document.querySelectorAll('#route-stations li').length > 0", 15000);
const count = await ev("document.querySelectorAll('#route-stations li').length");
check('lista gasolineras del camino', count > 10, `${count}`);
check('marca la mas barata', (await ev("document.querySelectorAll('.route-station--cheapest').length")) >= 1);
check('invita a anadir coche para el consejo', (await ev("document.getElementById('route-refuel-advice').textContent")).includes('Mi coche'));

s.where = 'parada';
await ev("document.querySelector('#route-stations .route-station__stop').click()");
check('recalcula con la parada', await waitFor("document.getElementById('route-duration').textContent.includes('por la parada')", 30000), await ev("document.getElementById('route-duration').textContent"));
await ev("window.__opened = null; window.open = (u) => { window.__opened = u; return null; }");
await ev("document.getElementById('route-navigate').click()");
const url = await ev('window.__opened');
check('Google Maps con origen, destino y parada', typeof url === 'string' && url.includes('google.com/maps/dir') && url.includes('waypoints='), String(url).slice(0, 120));
await ev("document.getElementById('route-clear-stop').click()");
check('quitar la parada', (await ev("document.getElementById('route-clear-stop').hidden")) === true);

s.where = 'coche';
await ev(`(async () => {
    const now = new Date().toISOString();
    await GarageStore.vehicles.save({ id: 'test-car', name: 'Prueba', fuel: 'gasoleo_a', tankCapacity: 45, homologated: 5, odometer: 20000, odometerAt: now, createdAt: now, updatedAt: now });
    await GarageStore.saveSetting('activeVehicleId', 'test-car');
    await GarageStore.refuels.save({ id: 'r1', vehicleId: 'test-car', date: '2026-09-01T10:00:00Z', odometer: 19000, liters: 40, pricePerUnit: 1.5, total: 60, full: true, missedBefore: false });
    await GarageStore.refuels.save({ id: 'r2', vehicleId: 'test-car', date: '2026-09-10T10:00:00Z', odometer: 19800, liters: 44, pricePerUnit: 1.5, total: 66, full: true, missedBefore: false });
    await GPGarage.reload();
})()`);
await ev("(()=>{const f=document.getElementById('filter-fuel');f.value='gasoleo_a';f.dispatchEvent(new Event('change',{bubbles:true}));})()");
await sleep(800);
await ev("(()=>{const t=document.getElementById('route-tank');t.value='20';t.dispatchEvent(new Event('input',{bubbles:true}));})()");
await sleep(300);
const advice = await ev("document.getElementById('route-refuel-advice').textContent");
check('con el 20 % aconseja donde parar', advice.includes('Te conviene parar'), advice.slice(0, 140));
check('ofrece parar en la recomendada', (await ev("!document.getElementById('route-refuel-go').hidden")) === true);
check('estima el coste del viaje', (await ev("document.getElementById('route-cost').textContent")).includes('€'));
await ev("(()=>{const t=document.getElementById('route-tank');t.value='100';t.dispatchEvent(new Event('input',{bubbles:true}));})()");
await sleep(300);
check('con el deposito lleno llega sin repostar', (await ev("document.getElementById('route-refuel-advice').textContent")).includes('Llegas sin repostar'));

s.where = 'isla';
await pickPlace('route-from', 'Madri', 'Madrid');
await pickPlace('route-to', 'Palma', 'Palma');
await calculate();
check('Madrid-Palma sin conexion por carretera', (await ev("document.getElementById('route-status').textContent")).includes('No hay conexión'));

s.where = 'direccion';
await ev("(()=>{const i=document.getElementById('route-from');i.value='Gran Vía 1, Bilbao';i.dispatchEvent(new Event('input',{bubbles:true}));})()");
await pickPlace('route-to', 'Getx', 'Getxo');
await calculate();
const status = await ev("document.getElementById('route-status').textContent");
if (status.includes('Ruta calculada')) {
    const shortKm = await ev("parseFloat(document.getElementById('route-distance').textContent.replace(',', '.'))");
    check('ruta desde una direccion exacta', shortKm > 8 && shortKm < 30, `${shortKm} km`);
} else {
    skip('ruta desde una direccion exacta', status);
}

s.finish('RUTA');
