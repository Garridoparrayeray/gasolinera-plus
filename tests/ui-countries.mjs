import { writeFileSync } from 'node:fs';
import { launch } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9391));
const { ev, go, check, waitFor } = s;
s.ignoreHttp = /zone-comparison|api\.github\.com|github\.com|price-index-seed/;

await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

const cases = [
    { code: 'es', lat: 43.263, lon: -2.935, place: '', fuel: 'Gasóleo A' },
    { code: 'pt', lat: 38.7223, lon: -9.1393, place: 'Portugal', fuel: 'Gasóleo' },
    { code: 'fr', lat: 48.8566, lon: 2.3522, place: 'France', fuel: 'Gazole' },
];

await go('/?pais=es', 1500);
await ev('localStorage.clear()');

for (const c of cases) {
    s.where = c.code;
    await s.setGeolocation(c.lat, c.lon);
    await go(`/?pais=${c.code}`, 3000);
    check(`${c.code}: país activo`, (await ev('GPCountry.code')) === c.code);
    check(`${c.code}: idioma del país`, (await ev('document.documentElement.lang')) === c.code);
    check(`${c.code}: nombre en la cabecera`, (await ev("document.getElementById('app-title-country').textContent")) === c.place);
    const loaded = await waitFor("document.querySelectorAll('.station-card, #stations-list li').length > 0", 12000);
    check(`${c.code}: lista con gasolineras`, loaded);
    check(`${c.code}: carburante en su idioma`, (await ev(`GPCountry.fuelShort('gasoleo_a')`)) === c.fuel);
    await ev("document.getElementById('home-link').click()");
    check(`${c.code}: el selector se abre`, (await ev("document.getElementById('country-switcher').classList.contains('open')")) === true);
    check(`${c.code}: país marcado`, (await ev(`document.querySelector('.country-card[aria-current="page"]').dataset.country`)) === c.code);
    const shot = await s.send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`${process.env.SHOTS || '.'}/pais-${c.code}.png`, Buffer.from(shot.data, 'base64'));
}

s.where = 'idioma';
await go('/?pais=pt&lang=es', 2500);
check('Portugal en español al elegirlo', (await ev('document.documentElement.lang')) === 'es' && (await ev("GPCountry.fuelShort('gasoleo_a')")) === 'Gasóleo A');
await go('/', 2500);
check('recuerda el último país', (await ev('GPCountry.code')) === 'pt');
check('recuerda el idioma elegido para ese país', (await ev('GPCountry.lang')) === 'es');
await go('/?pais=es', 1500);

s.finish('países');
