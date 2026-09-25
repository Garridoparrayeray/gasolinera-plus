import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9374));
const { ev, go, check, waitFor } = s;
const downloads = mkdtempSync(join(tmpdir(), 'gasolinera-descargas-'));

async function fill(values) {
    for (const [id, value] of Object.entries(values)) {
        await ev(`(()=>{const i=document.getElementById('${id}');i.value=${JSON.stringify(String(value))};i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    }
}

async function addRefuel(date, odometer, liters, price) {
    await ev("document.getElementById('garage-refuel').click()");
    await waitFor("document.getElementById('refuel-dialog').open", 3000);
    await fill({ 'refuel-date': date, 'refuel-odometer': odometer, 'refuel-liters': liters, 'refuel-price': price });
    await ev("document.getElementById('refuel-form').requestSubmit()");
    return waitFor("!document.getElementById('refuel-dialog').open", 4000);
}

await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await s.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
await go('/', 1200);
await ev("localStorage.clear(); localStorage.setItem('gasolinera_location_pref','off'); indexedDB.deleteDatabase('gasolinera-garage')");
await go('/', 2000);

s.where = 'vacio';
await ev("document.getElementById('view-garage-btn').click()");
check('la barra inferior es fija en movil', (await ev("getComputedStyle(document.getElementById('view-toggle')).position")) === 'fixed');
check('el garaje vacio invita a anadir coche', await waitFor("!document.getElementById('garage-empty').hidden", 4000));
check('en el garaje se ocultan buscador y filtros', (await ev("getComputedStyle(document.getElementById('search-form')).display")) === 'none');

s.where = 'coche';
await ev("document.getElementById('garage-add-first').click()");
check('abre el formulario del coche', await waitFor("document.getElementById('vehicle-dialog').open", 3000));
await fill({ 'vehicle-name': 'Golf', 'vehicle-fuel': 'gasoleo_a', 'vehicle-tank': 50, 'vehicle-homologated': 5, 'vehicle-odometer': 10000 });
await ev("document.getElementById('vehicle-form').requestSubmit()");
check('guarda el coche', await waitFor("!document.getElementById('garage-main').hidden && document.getElementById('garage-vehicle-name').textContent === 'Golf'", 4000));
check('usa el homologado sin repostajes', (await ev("document.getElementById('garage-consumption-source').textContent")).includes('homologado'));
check('el filtro pasa al carburante del coche', (await ev("document.getElementById('filter-fuel').value")) === 'gasoleo_a');

s.where = 'repostajes';
check('primer lleno', await addRefuel('2026-09-01T10:00', 10000, 40, 1.5));
check('segundo lleno', await addRefuel('2026-09-10T10:00', 10800, 44, 1.6));
check('calcula el consumo real', await waitFor("document.getElementById('garage-consumption').textContent.startsWith('5,5')", 4000), await ev("document.getElementById('garage-consumption').textContent"));
check('estima lo que queda en el deposito', (await ev("document.getElementById('garage-tank-text').textContent")).includes('Quedan'));
check('lista los dos repostajes', (await ev("document.querySelectorAll('#garage-refuels li').length")) === 2);
check('grafica de consumo', await waitFor("!!Chart.getChart(document.getElementById('garage-consumption-chart'))", 4000));
check('grafica de gasto mensual', await waitFor("!!Chart.getChart(document.getElementById('garage-spend-chart'))", 4000));

await ev("document.getElementById('garage-refuel').click()");
await waitFor("document.getElementById('refuel-dialog').open", 3000);
await fill({ 'refuel-date': '2026-09-20T10:00', 'refuel-odometer': 10500, 'refuel-liters': 30, 'refuel-price': 1.5 });
await ev("document.getElementById('refuel-form').requestSubmit()");
check('rechaza km menores que el repostaje anterior', await waitFor("!document.getElementById('refuel-error').hidden && document.getElementById('refuel-dialog').open", 3000));
check('litros por precio da el total', (await ev("document.getElementById('refuel-total').value")) === '45.00');
await ev("document.getElementById('refuel-cancel').click()");

s.where = 'repostar-aqui';
await ev("document.getElementById('view-list-btn').click()");
await ev("(()=>{const i=document.getElementById('search-input');i.value='bilbao';document.getElementById('search-form').requestSubmit();})()");
await waitFor("document.querySelectorAll('#stations-list li').length > 0", 10000);
await ev("document.querySelector('#stations-list li').click()");
await waitFor("document.getElementById('station-modal').open", 8000);
await ev("document.getElementById('modal-refuel').click()");
check('"Repostar aqui" abre el repostaje', await waitFor("document.getElementById('refuel-dialog').open", 3000));
check('con la gasolinera y su precio', (await ev("!document.getElementById('refuel-station').hidden && Number(document.getElementById('refuel-price').value) > 0")) === true);
await ev("document.getElementById('refuel-cancel').click()");

s.where = 'copia';
await ev("document.getElementById('view-garage-btn').click()");
await sleep(600);
await ev("document.getElementById('backup-export').click()");
await sleep(1500);
const files = readdirSync(downloads).filter((f) => f.endsWith('.json'));
check('exporta la copia en JSON', files.length === 1, files.join(','));
let backup = null;
if (files.length) {
    backup = JSON.parse(readFileSync(join(downloads, files[0]), 'utf8'));
}
check('la copia trae el coche y los repostajes', Boolean(backup) && backup.vehicles.length === 1 && backup.refuels.length === 2);

await ev("indexedDB.deleteDatabase('gasolinera-garage')");
await go('/', 1500);
await ev("document.getElementById('view-garage-btn').click()");
check('sin datos tras borrar', await waitFor("!document.getElementById('garage-empty').hidden", 4000));
if (files.length) {
    const doc = await s.send('DOM.getDocument', {});
    const node = await s.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#backup-import' });
    await s.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [join(downloads, files[0])] });
    check('importa la copia', await waitFor("document.getElementById('backup-note').textContent.includes('Importados 1 coches, 2 repostajes')", 5000));
    check('vuelve el coche importado', await waitFor("!document.getElementById('garage-main').hidden", 4000));
}

s.where = 'persistencia';
await go('/?view=garage', 2000);
check('los datos siguen tras recargar', await waitFor("document.getElementById('garage-vehicle-name').textContent === 'Golf'", 5000));

if (process.env.SHOT) {
    const shot = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(process.env.SHOT, Buffer.from(shot.data, 'base64'));
}

s.finish('GARAJE');
