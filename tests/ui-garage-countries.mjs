import { launch, sleep } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9401));
const { ev, go, check, waitFor } = s;
s.ignoreHttp = /api\.github\.com|github\.com|price-index/;
await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

await go('/?pais=es', 2500);
await ev(`(async () => {
    localStorage.clear();
    const now = new Date().toISOString();
    await GarageStore.vehicles.save({ id: 'cochePrueba', name: 'Coche de prueba', fuel: 'gasoleo_a', tankCapacity: 50, homologated: 5.5, odometer: 11000, createdAt: now, updatedAt: now });
    await GarageStore.saveSetting('activeVehicleId', 'cochePrueba');
    const base = { vehicleId: 'cochePrueba', full: true, missedBefore: false, createdAt: now, updatedAt: now };
    await GarageStore.refuels.save({ ...base, id: 'r1', date: '2026-10-10T10:00:00.000Z', odometer: 10000, liters: 40, pricePerUnit: 1.60, total: 64, pais: 'es', nationalAvg: 1.70, zoneAvg: null });
    await GarageStore.refuels.save({ ...base, id: 'r2', date: '2026-10-15T10:00:00.000Z', odometer: 10600, liters: 35, pricePerUnit: 2.40, total: 84, pais: 'fr', nationalAvg: 2.30, zoneAvg: null });
    await GarageStore.refuels.save({ ...base, id: 'r3', date: '2026-10-18T10:00:00.000Z', odometer: 10900, liters: 20, pricePerUnit: 2.10, total: 42, pais: 'pt', nationalAvg: 2.20, zoneAvg: null });
})()`);
const stored = await ev(`(async () => {
    const payload = await GarageStore.exportAll(false, {});
    await GarageStore.importAll(payload);
    return (await GarageStore.refuels.forVehicle('cochePrueba')).map((r) => r.pais).sort().join(',');
})().catch((e) => 'EXC ' + e.message)`);
check('el país sobrevive a exportar e importar la copia', stored === 'es,fr,pt', String(stored));

await go('/?pais=es', 3000);
await ev("document.getElementById('view-garage-btn').click()");
const ready = await waitFor("document.getElementById('garage-savings').textContent.length > 0", 15000);
const text = await ev("document.getElementById('garage-savings').textContent");
check('ahorro calculado', ready, text);
check('ahorro de España', text.includes('España'), text);
check('sobrecoste en Francia', text.includes('Francia'), text);
check('ahorro en Portugal', text.includes('Portugal'), text);
const legend = await ev("Chart.getChart(document.getElementById('garage-price-chart')).data.datasets[1].label");
check('la línea es la media del país', legend === 'Media del país', legend);

await go('/?pais=fr', 3000);
await ev("document.getElementById('view-garage-btn').click()");
await waitFor("document.getElementById('garage-savings').textContent.length > 0", 15000);
const french = await ev("document.getElementById('garage-savings').textContent");
check('en francés', /Espagne|France|Portugal/.test(french) && !french.includes('ahorr'), french);
await ev('(async () => { await GarageStore.refuels.remove("r1"); await GarageStore.refuels.remove("r2"); await GarageStore.refuels.remove("r3"); await GarageStore.vehicles.remove("cochePrueba"); })().catch(() => null)');
await go('/?pais=es', 1000);
s.finish('garaje por país');
