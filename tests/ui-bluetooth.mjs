import { launch } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9379));
const { ev, go, check, waitFor } = s;
s.ignoreHttp = /zone-comparison|api\.github\.com/;

await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
        const saved = { address: '', name: '' };
        const calls = [];
        window.__bt = { saved, calls, devices: [] };
        const noop = async () => ({});
        const perms = { location: true, background: true, activity: true, notifications: true, bluetooth: true, unrestrictedBattery: true };
        const recorder = {
            status: async () => ({ trip: { recording: false }, recording: false, autoDetect: false, permissions: perms, bluetooth: { address: saved.address, name: saved.name } }),
            requestForeground: async () => perms,
            requestBluetooth: async () => perms,
            requestBackground: async () => perms,
            bluetoothDevices: async () => ({ devices: window.__bt.devices }),
            setBluetoothDevice: async (device) => { calls.push(device); saved.address = device.address; saved.name = device.name; },
            listTrips: async () => ({ trips: [] }),
            addListener: async () => ({ remove() {} }),
        };
        window.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
            Plugins: { TripRecorder: new Proxy(recorder, { get: (target, key) => target[key] || noop }) },
        };
    })();
` });

async function openBluetooth(devices) {
    await go('/', 800);
    await ev("localStorage.clear(); localStorage.setItem('gasolinera_location_pref','off'); indexedDB.deleteDatabase('gasolinera-garage')");
    await ev(`window.__bt.devices = ${JSON.stringify(devices)}; window.__bt.saved.address = ''; window.__bt.saved.name = ''; window.__bt.calls.length = 0;`);
    await go('/?view=garage', 2500);
    await ev(`window.__bt.devices = ${JSON.stringify(devices)}`);
    await ev("document.getElementById('trip-bt').click()");
}

s.where = 'un solo coche';
await openBluetooth([
    { name: 'Auriculares', address: 'AA:AA:AA:AA:AA:01', car: false },
    { name: 'Mi Seat', address: 'BB:BB:BB:BB:BB:02', car: true },
]);
check('elige solo el coche detectado', await waitFor("window.__bt.saved.address === 'BB:BB:BB:BB:BB:02'", 5000), await ev('JSON.stringify(window.__bt)'));
check('el coche sale el primero y marcado', (await ev("document.querySelectorAll('#trip-bt-device option')[1].textContent")) === 'Mi Seat (coche)');
check('el selector muestra el coche elegido', await waitFor("document.getElementById('trip-bt-device').value === 'BB:BB:BB:BB:BB:02'", 4000));

s.where = 'varios coches';
await openBluetooth([
    { name: 'Coche A', address: 'CC:CC:CC:CC:CC:01', car: true },
    { name: 'Coche B', address: 'CC:CC:CC:CC:CC:02', car: true },
]);
await waitFor("document.querySelectorAll('#trip-bt-device option').length === 3", 5000);
check('con dos coches no elige por su cuenta', (await ev('window.__bt.calls.length')) === 0);

s.where = 'sin coche';
await openBluetooth([{ name: 'Auriculares', address: 'AA:AA:AA:AA:AA:01', car: false }]);
await waitFor("document.querySelectorAll('#trip-bt-device option').length === 2", 5000);
check('sin dispositivos de coche no elige', (await ev('window.__bt.calls.length')) === 0);

s.finish('BLUETOOTH');
