import { writeFileSync } from 'node:fs';
import { launch, sleep } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9405));
const { ev, go } = s;
const out = process.env.SHOTS || '.';
const sizes = [
    { name: 'movil-estrecho', width: 320, height: 640, mobile: true },
    { name: 'movil', width: 390, height: 844, mobile: true },
    { name: 'movil-horizontal', width: 844, height: 390, mobile: true },
    { name: 'tablet', width: 820, height: 1180, mobile: true },
    { name: 'portatil', width: 1024, height: 768, mobile: false },
    { name: 'escritorio', width: 1440, height: 900, mobile: false },
    { name: 'ancho', width: 1920, height: 1080, mobile: false },
];
const countries = (process.env.COUNTRIES || 'pt').split(',');

for (const size of sizes) {
    await s.send('Emulation.setDeviceMetricsOverride', { width: size.width, height: size.height, deviceScaleFactor: 1, mobile: size.mobile });
    for (const country of countries) {
        await s.setGeolocation(40.4, -3.7);
        await go(`/?pais=${country}`, 3500);
        const clip = { x: 0, y: 0, width: size.width, height: Math.min(size.height, 560), scale: 1 };
        const closed = await s.send('Page.captureScreenshot', { format: 'png', clip });
        writeFileSync(`${out}/hdr-${size.name}-${country}-cerrado.png`, Buffer.from(closed.data, 'base64'));
        await ev("document.querySelectorAll('dialog[open]').forEach((d) => d.close()); document.getElementById('home-link').click()");
        await sleep(500);
        const open = await s.send('Page.captureScreenshot', { format: 'png', clip });
        writeFileSync(`${out}/hdr-${size.name}-${country}-abierto.png`, Buffer.from(open.data, 'base64'));
        const metrics = await ev(`(() => {
            const title = document.getElementById('app-title').getBoundingClientRect();
            const plus = document.querySelector('#app-title .plus').getBoundingClientRect();
            const nav = document.getElementById('country-switcher').getBoundingClientRect();
            const cards = [...document.querySelectorAll('.country-card')].map((c) => Math.round(c.getBoundingClientRect().right));
            const langs = [...document.querySelectorAll('.switcher-langs button')].map((b) => Math.round(b.getBoundingClientRect().right));
            return JSON.stringify({ titleLines: Math.round(title.height), plusTop: Math.round(plus.top - title.top), navRight: Math.round(nav.right), navWidth: Math.round(nav.width), viewport: window.innerWidth, desktop: document.documentElement.classList.contains('desktop'), cardsRight: cards, langsRight: langs });
        })()`);
        console.log(size.name, country, metrics);
    }
}
process.exit(0);
