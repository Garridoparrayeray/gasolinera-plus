import { launch, sleep } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9403));
const { ev, go, check, waitFor } = s;
s.ignoreHttp = /api\.github\.com|github\.com|price-index|zone-comparison/;
await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

await go('/?pais=es', 1500);
await ev('localStorage.clear()');

const coords = { es: [40.41, -3.7], pt: [38.72, -9.14], fr: [48.85, 2.35] };

const expected = {
    es: { first: 'gasoleo_a', has: ['adblue', 'gasolina_95_e10'], lacks: ['gasolina_98_premium', 'gnc_m3'], firstDay: 'Lunes' },
    pt: { first: 'gasoleo_a', has: ['gasolina_98_premium', 'gasolina_mistura', 'gnc_m3', 'gasoleo_b'], lacks: ['adblue', 'gasolina_95_e10'], firstDay: 'Segunda-feira' },
    fr: { first: 'gasoleo_a', second: 'gasolina_95_e10', has: ['gasolina_95_e85', 'glp'], lacks: ['adblue', 'gasoleo_premium', 'gasolina_98_premium'], firstDay: 'Lundi' },
};

for (const [code, want] of Object.entries(expected)) {
    s.where = code;
    await go(`/?pais=${code}`, 3500);
    const options = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#filter-fuel option')].map((o) => o.value))`));
    check(`${code}: ${options.length} carburantes en el filtro`, options.length >= 6, options.join(','));
    check(`${code}: primero ${want.first}`, options[0] === want.first);
    if (want.second) {
        check(`${code}: segundo ${want.second}`, options[1] === want.second, options.slice(0, 3).join(','));
    }
    check(`${code}: incluye ${want.has.join(', ')}`, want.has.every((slug) => options.includes(slug)));
    check(`${code}: no incluye ${want.lacks.join(', ')}`, want.lacks.every((slug) => !options.includes(slug)));
    const statsOptions = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#stats-fuel option')].map((o) => o.value))`));
    check(`${code}: mismo listado en estadísticas`, JSON.stringify(statsOptions) === JSON.stringify(options));
    const groups = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#filter-fuel optgroup')].map((g) => g.label))`));
    if (options.length > 6) {
        check(`${code}: grupos con nombre`, groups.length >= 1 && groups.every((label) => label.length > 3), groups.join(' | '));
    } else {
        check(`${code}: solo carburantes principales, sin grupos`, groups.length === 0, groups.join(' | '));
    }

    const filtered = await ev(`(async () => {
        const select = document.getElementById('filter-fuel');
        const wanted = [...select.options].map((o) => o.value);
        const failures = [];
        for (const fuel of wanted) {
            const response = await fetch('/api/stations/near?pais=${code}&lat=${coords[code][0]}&lon=${coords[code][1]}&radius=50&fuel=' + fuel + '&limit=1');
            if (!response.ok) {
                failures.push(fuel + ':' + response.status);
            }
        }
        return failures.join(',');
    })()`);
    check(`${code}: la API acepta todos los carburantes del filtro`, filtered === '', String(filtered));

    const withHours = await ev(`(async () => {
        const stations = await OfflineEngine.loadData();
        const found = stations.find((st) => st.horario_raw && st.horario_raw.split(';').length >= 2 && !st.horario_raw.includes('24H') && /^L/.test(st.horario_raw));
        if (!found) {
            return '';
        }
        return String(found.ideess);
    })()`);
    check(`${code}: hay una gasolinera con horario de semana`, withHours !== '', String(withHours));
    if (withHours) {
        await ev(`GP.openStationModal('${withHours}')`);
        await waitFor("document.getElementById('station-modal').open && !document.getElementById('modal-horario-week').hidden", 15000);
        const lines = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#modal-horario-week li')].map((li) => li.textContent))`));
        check(`${code}: horario escrito por días`, lines.length >= 2 && lines[0].startsWith(want.firstDay), JSON.stringify(lines));
        const status = await ev("document.getElementById('modal-horario').textContent");
        check(`${code}: estado de apertura en su idioma`, !/Abierto|Cerrado/.test(status) || code === 'es', status);
        await ev("document.getElementById('station-modal').close()");
    }

    const open24 = await ev(`(async () => {
        const stations = await OfflineEngine.loadData();
        const found = stations.find((st) => st.is_24h && st.horario_raw === 'L-D: 24H');
        if (!found) {
            return '';
        }
        return String(found.ideess);
    })()`);
    if (open24) {
        await ev(`GP.openStationModal('${open24}')`);
        await waitFor("document.getElementById('station-modal').open && document.getElementById('modal-fuels').children.length > 0", 15000);
        check(`${code}: una 24 h no muestra lista de días`, await ev("document.getElementById('modal-horario-week').hidden"));
        await ev("document.getElementById('station-modal').close()");
    }
}

s.where = 'garaje';
await go('/?pais=fr', 3000);
await ev("document.getElementById('view-garage-btn').click()");
await sleep(1500);
await ev("document.getElementById('garage-add-first').click()");
await sleep(800);
const vehicleFuels = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#vehicle-fuel option')].map((o) => o.value))`));
check('garaje: el coche ofrece los carburantes de los tres países', ['gasolina_95_e10', 'gasolina_98_premium', 'gasolina_mistura', 'gasolina_95_e85'].every((slug) => vehicleFuels.includes(slug)) && !vehicleFuels.includes('adblue') && !vehicleFuels.includes('gnc_m3'), vehicleFuels.join(','));

s.where = 'colores';
await go('/?pais=fr', 3000);
await ev("document.getElementById('view-stats-btn').click()");
const chart = await waitFor("!!Chart.getChart(document.getElementById('stats-by-fuel-chart'))", 20000);
check('estadísticas de Francia: gráfica por carburante', chart);
const colors = JSON.parse(await ev(`JSON.stringify(Chart.getChart(document.getElementById('stats-by-fuel-chart')).data.datasets.map((d) => [d.label, d.borderColor]))`));
const distinct = new Set(colors.map((pair) => pair[1]));
check('Francia: cada carburante con su color', colors.length >= 5 && distinct.size === colors.length, JSON.stringify(colors));
check('Francia: sale el SP95-E10', colors.some((pair) => /E10/.test(pair[0])), JSON.stringify(colors.map((pair) => pair[0])));

await go('/?pais=es', 1000);
s.finish('carburantes y horarios');
