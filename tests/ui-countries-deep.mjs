import { writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9397));
const { ev, go, check, waitFor } = s;
s.ignoreHttp = /api\.github\.com|github\.com|price-index|__fake/;
await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

const cases = [
    { code: 'pt', lat: 38.7223, lon: -9.1393, query: 'Porto' },
    { code: 'fr', lat: 48.8566, lon: 2.3522, query: 'Lyon' },
];

await go('/?pais=es', 1500);
await ev('localStorage.clear()');
const report = {};

for (const c of cases) {
    s.where = c.code;
    await s.setGeolocation(c.lat, c.lon);
    await ev("localStorage.setItem('gasolinera_location_pref', 'on')");
    await go(`/?pais=${c.code}`, 3500);
    await waitFor("document.querySelectorAll('.station-card').length > 0", 15000);
    check(`${c.code}: lista cerca`, (await ev("document.querySelectorAll('.station-card').length")) > 0);

    await ev(`(() => { const input = document.getElementById('search-input'); input.value = '${c.query}'; input.form.requestSubmit(); })()`);
    const found = await waitFor(`document.getElementById('stations-status').textContent.includes('${c.query}') && document.querySelectorAll('.station-card').length > 0`, 15000);
    check(`${c.code}: búsqueda de ${c.query}`, found, await ev("document.getElementById('stations-status').textContent"));

    await ev("document.querySelector('.station-card .station-card__open').click()");
    const modal = await waitFor("document.getElementById('station-modal').open && document.getElementById('modal-fuels').children.length > 0", 15000);
    check(`${c.code}: ficha de gasolinera`, modal, await ev("document.getElementById('modal-rotulo').textContent + ' · ' + document.getElementById('modal-horario').textContent"));
    await sleep(2500);
    check(`${c.code}: histórico en la ficha`, await ev("!!document.querySelector('#station-modal canvas')"));
    await ev("document.getElementById('station-modal').close()");

    await ev("document.getElementById('view-stats-btn').click()");
    await sleep(5000);
    const stats = await ev("JSON.stringify([...document.querySelectorAll('#view-stats canvas')].map((c) => c.id))");
    check(`${c.code}: estadísticas`, JSON.parse(stats).length >= 2, stats);
    report[c.code] = { provinceKpi: await ev("(document.getElementById('stats-kpi-cheap') || {}).textContent || ''") };

    await ev("document.getElementById('view-list-btn').click()");
    await sleep(1500);
    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    if (process.env.SHOTS) {
        writeFileSync(`${process.env.SHOTS}/deep-${c.code}.png`, Buffer.from(shot.data, 'base64'));
    }
    report[c.code].missing = JSON.parse(await ev('JSON.stringify(GPCountry.missing())')).filter((t) => /\b(de|la|el|los|las|tu|con|sin|para|del|hoy|gasolinera)\b/i.test(t));
}
console.log(JSON.stringify(report, null, 1));
await go('/?pais=es', 1000);
s.finish('países a fondo');
