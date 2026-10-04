import { launch } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9379));
const { ev, go, check, waitFor } = s;
s.ignoreHttp = /zone-comparison|api\.github\.com/;

await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
        const saved = { address: '', name: '' };
        const calls = [];
        window.__bt = { saved, calls, devices: [], denied: false, extra: {} };
        const noop = async () => ({});
        const perms = { location: true, background: true, activity: true, notifications: true, bluetooth: true, unrestrictedBattery: true };
        const recorder = {
            status: async () => ({ trip: { recording: false }, recording: false, autoDetect: false, permissions: perms, bluetooth: { address: saved.address, name: saved.name } }),
            requestForeground: async () => perms,
            requestBluetooth: async () => { window.__bt.denied = false; window.__bt.asked = true; return perms; },
            requestBackground: async () => perms,
            bluetoothDevices: async () => {
                if (window.__bt.denied) {
                    throw Object.assign(new Error('Falta el permiso de Bluetooth'), { code: 'permissions' });
                }
                return { devices: window.__bt.devices, ...window.__bt.extra };
            },
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

async function openBluetooth(devices, options = {}) {
    await go('/', 800);
    await ev("localStorage.clear(); localStorage.setItem('gasolinera_location_pref','off'); indexedDB.deleteDatabase('gasolinera-garage')");
    const setup = `window.__bt.devices = ${JSON.stringify(devices)}; window.__bt.extra = ${JSON.stringify(options.extra || {})}; window.__bt.denied = ${Boolean(options.denied)}; window.__bt.asked = false; window.__bt.saved.address = ''; window.__bt.saved.name = ''; window.__bt.calls.length = 0;`;
    await ev(setup);
    await go('/?view=garage', 2500);
    await ev(setup);
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

s.where = 'conectado ahora';
await openBluetooth([
    { name: 'Reloj', address: 'DD:DD:DD:DD:DD:01', car: false, connected: false },
    { name: 'Altavoz', address: 'DD:DD:DD:DD:DD:02', car: false, connected: true },
]);
await waitFor("document.querySelectorAll('#trip-bt-device option').length === 3", 5000);
check('los conectados salen primero y marcados', (await ev("document.querySelectorAll('#trip-bt-device option')[1].textContent")) === 'Altavoz · conectado');
check('sin coche anunciado no elige al conectado', (await ev('window.__bt.calls.length')) === 0);

s.where = 'sin permiso';
await openBluetooth([{ name: 'Mi Seat', address: 'BB:BB:BB:BB:BB:02', car: true, connected: true }], { denied: true });
check('pide el permiso y reintenta', await waitFor("window.__bt.asked === true && document.querySelectorAll('#trip-bt-device option').length === 2", 6000));
check('tras el permiso elige el coche', await waitFor("window.__bt.saved.address === 'BB:BB:BB:BB:BB:02'", 4000));

s.where = 'bluetooth apagado';
await openBluetooth([], { extra: { enabled: false } });
check('avisa de que el Bluetooth esta apagado', await waitFor("document.getElementById('trip-note').textContent.includes('apagado')", 5000), await ev("document.getElementById('trip-note').textContent"));

s.finish('BLUETOOTH');
