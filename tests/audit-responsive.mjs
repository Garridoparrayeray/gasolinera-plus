import { writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9407));
const { ev, go } = s;
const out = process.env.SHOTS || '.';
const sizes = (process.env.SIZES || '320x640,390x844,820x1180,1024x768,1440x900,1920x1080').split(',').map((text) => {
    const [width, height] = text.split('x').map(Number);
    return { width, height, mobile: width < 1024 };
});
const countries = (process.env.COUNTRIES || 'es,pt,fr').split(',');
const views = ['list', 'route', 'garage', 'stats', 'about'];
const shotsAt = (process.env.SHOT_SIZES || '390,1440').split(',').map(Number);
const shotCountries = (process.env.SHOT_COUNTRIES || 'pt').split(',');

const probe = `(() => {
    const vw = document.documentElement.clientWidth;
    const problems = [];
    if (document.documentElement.scrollWidth > vw + 1) {
        problems.push('PAGINA con scroll horizontal: ' + document.documentElement.scrollWidth + ' > ' + vw);
    }
    const describe = (el) => {
        let name = el.tagName.toLowerCase();
        if (el.id) {
            name += '#' + el.id;
        }
        if (typeof el.className === 'string' && el.className.trim()) {
            name += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
        }
        return name;
    };
    const clipped = (el) => {
        let node = el.parentElement;
        while (node && node !== document.body) {
            const style = getComputedStyle(node);
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                const box = node.getBoundingClientRect();
                if (box.right <= vw + 1 && box.left >= -1) {
                    return true;
                }
            }
            node = node.parentElement;
        }
        return false;
    };
    for (const el of document.querySelectorAll('body *')) {
        if (el.closest('.leaflet-container, canvas, svg, dialog:not([open]), [hidden], .sr-only, .splash, #update-banner')) {
            continue;
        }
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) {
            continue;
        }
        if (getComputedStyle(el).position === 'fixed') {
            if (box.right > vw + 1) {
                problems.push('FIJO fuera: ' + describe(el) + ' right ' + Math.round(box.right));
            }
            continue;
        }
        if ((box.right > vw + 1 || box.left < -1) && !clipped(el)) {
            problems.push('FUERA: ' + describe(el) + ' [' + Math.round(box.left) + ',' + Math.round(box.right) + '] vw ' + vw);
        }
        if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow === 'visible' && el.clientWidth > 0 && /^(BUTTON|A|LABEL|SPAN|STRONG|H1|H2|H3|H4|P|LI|TD|TH)$/.test(el.tagName) === false) {
            problems.push('TEXTO desbordado: ' + describe(el));
        }
    }
    const title = document.getElementById('app-title');
    if (title && title.getBoundingClientRect().height > 40) {
        problems.push('TITULO en varias lineas: ' + Math.round(title.getBoundingClientRect().height));
    }
    return JSON.stringify(problems.slice(0, 12));
})()`;

const spanish = /\b(el|la|los|las|del|para|con|sin|tu|tus|más|desde|hoy|gasolinera|gasolineras|no hay|puedes|elige|añade)\b/i;
const WAIT = { stats: 4500 };
const report = {};

for (const size of sizes) {
    await s.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
    for (const country of countries) {
        await s.setGeolocation(40.4168, -3.7038);
        await go(`/?pais=${country}`, 1500);
        await ev("localStorage.setItem('gasolinera_location_pref', 'off')");
        await go(`/?pais=${country}`, 3500);
        await ev("document.querySelectorAll('dialog[open]').forEach((d) => d.close())");
        for (const view of views) {
            await ev(`document.getElementById('view-${view}-btn').click()`);
            await sleep(WAIT[view] || 1500);
            const key = `${size.width}x${size.height} ${country} ${view}`;
            const found = JSON.parse(await ev(probe));
            if (found.length) {
                report[key] = found;
            }
            if (shotsAt.includes(size.width) && shotCountries.includes(country)) {
                const shot = await s.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
                writeFileSync(`${out}/aud-${size.width}-${country}-${view}.png`, Buffer.from(shot.data, 'base64'));
            }
        }
        if (country !== 'es') {
            const missing = JSON.parse(await ev('JSON.stringify(GPCountry.missing())')).filter((text) => spanish.test(text) && text.length < 160);
            if (missing.length) {
                report[`${size.width}x${size.height} ${country} SIN TRADUCIR`] = missing.slice(0, 15);
            }
        }
    }
}
console.log(JSON.stringify(report, null, 1));
console.log(Object.keys(report).length === 0 && 'AUDITORIA LIMPIA' || `AUDITORIA: ${Object.keys(report).length} pantallas con problemas`);
process.exit(0);
