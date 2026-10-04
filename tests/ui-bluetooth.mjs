import { launch } from './cdp.mjs';

const s = await launch(Number(process.env.CDP_PORT || 9379));
const { ev, go, check, waitFor } = s;
s.ignoreHttp = /zone-comparison|api\.github\.com/;

await s.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await s.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    (() => {
        const cars = [];
        window.__bt = { cars, added: [], removed: [], devices: [], denied: false, extra: {}, asked: false };
        const noop = async () => ({});
        const perms = { location: true, background: true, activity: true, notifications: true, bluetooth: true, unrestrictedBattery: true };
        const recorder = {
            status: async () => ({ trip: { recording: false }, recording: false, autoDetect: false, permissions: perms, bluetooth: { devices: cars.map((car) => ({ ...car })) } }),
            requestForeground: async () => perms,
            requestBluetooth: async () => { window.__bt.denied = false; window.__bt.asked = true; return perms; },
            requestBackground: async () => perms,
            bluetoothDevices: async () => {
                if (window.__bt.denied) {
                    throw Object.assign(new Error('Falta el permiso de Bluetooth'), { code: 'permissions' });
                }
                return { devices: window.__bt.devices, ...window.__bt.extra };
            },
            addBluetoothDevice: async (device) => { window.__bt.added.push(device); cars.push({ address: device.address, name: device.name }); },
            removeBluetoothDevice: async (device) => {
                window.__bt.removed.push(device.address);
                const index = cars.findIndex((car) => car.address === device.address);
                if (index >= 0) { cars.splice(index, 1); }
            },
            listTrips: async () => ({ trips: [] }),
            addListener: async () => ({ remove() {} }),
        };
        window.Capacitor = {
            isNativePlatform: () => true,
            getPlatform: () => 'android',
            Plugins: { TripRecorder: new Proxy(recorder, { get: (target, key) => target[key] || noop }) },
        };
        window.confirm = () => true;
    })();
` });

async function openBluetooth(devices, options = {}) {
    await go('/', 800);
    await ev("localStorage.clear(); localStorage.setItem('gasolinera_location_pref','off'); indexedDB.deleteDatabase('gasolinera-garage')");
    const setup = `window.__bt.devices = ${JSON.stringify(devices)}; window.__bt.extra = ${JSON.stringify(options.extra || {})}; window.__bt.denied = ${Boolean(options.denied)}; window.__bt.asked = false; window.__bt.added.length = 0; window.__bt.removed.length = 0; window.__bt.cars.length = 0;`;
    await ev(setup);
    await go('/?view=garage', 2500);
    await ev(setup);
    await ev("document.getElementById('trip-bt').click()");
}

const optionTexts = "[...document.querySelectorAll('#trip-bt-device option')].map((o) => o.textContent).join('|')";
const carNames = "[...document.querySelectorAll('#trip-bt-cars li span')].map((o) => o.textContent).join('|')";

s.where = 'lista';
await openBluetooth([
    { name: 'Auriculares', address: 'AA:01', car: false, connected: false },
    { name: 'Mi Seat', address: 'BB:02', car: true, connected: true },
    { name: 'Reloj', address: 'CC:03', car: false, connected: true },
]);
await waitFor("document.querySelectorAll('#trip-bt-device option').length === 4", 5000);
check('muestra todos los dispositivos, conectados y coches primero', (await ev(optionTexts)) === 'Elige un dispositivo|Mi Seat (coche) · conectado|Reloj · conectado|Auriculares', await ev(optionTexts));
check('no elige ninguno por su cuenta', (await ev('window.__bt.added.length')) === 0);
check('el boton Añadir esta activo con dispositivos', (await ev("document.getElementById('trip-bt-add').disabled")) === false);

s.where = 'añadir';
await ev("document.getElementById('trip-bt-device').value = 'BB:02'");
await ev("document.getElementById('trip-bt-add').click()");
check('añade el dispositivo elegido sin las marcas', await waitFor("window.__bt.added.length === 1 && window.__bt.added[0].name === 'Mi Seat'", 4000), await ev('JSON.stringify(window.__bt.added)'));
check('sale en la lista de coches', await waitFor(`${carNames} === 'Mi Seat'`, 4000));
check('ya no sale entre los dispositivos por añadir', await waitFor(`${optionTexts} === 'Elige un dispositivo|Reloj · conectado|Auriculares'`, 4000), await ev(optionTexts));
await ev("document.getElementById('trip-bt-device').value = 'AA:01'");
await ev("document.getElementById('trip-bt-add').click()");
check('puede tener varios coches', await waitFor(`${carNames} === 'Mi Seat|Auriculares'`, 4000), await ev(carNames));

s.where = 'quitar';
await ev("document.querySelector('#trip-bt-cars li button').click()");
check('quita el coche', await waitFor("window.__bt.removed.length === 1 && window.__bt.removed[0] === 'BB:02'", 4000));
check('desaparece de la lista de coches', await waitFor(`${carNames} === 'Auriculares'`, 4000), await ev(carNames));
check('vuelve a salir entre los dispositivos', await waitFor(`${optionTexts}.includes('Mi Seat')`, 4000), await ev(optionTexts));
await ev("document.getElementById('trip-bt').click()");
check('al desactivar quita los que quedan', await waitFor("window.__bt.cars.length === 0 && document.getElementById('trip-bt-picker').hidden", 4000));

s.where = 'sin permiso';
await openBluetooth([{ name: 'Mi Seat', address: 'BB:02', car: true, connected: true }], { denied: true });
check('pide el permiso y reintenta', await waitFor("window.__bt.asked === true && document.querySelectorAll('#trip-bt-device option').length === 2", 6000));
check('sin elegir por su cuenta', (await ev('window.__bt.added.length')) === 0);

s.where = 'bluetooth apagado';
await openBluetooth([], { extra: { enabled: false } });
check('avisa de que el Bluetooth esta apagado', await waitFor("document.getElementById('trip-note').textContent.includes('apagado')", 5000), await ev("document.getElementById('trip-note').textContent"));

s.where = 'sin dispositivos';
await openBluetooth([]);
check('explica que no hay dispositivos', await waitFor("document.getElementById('trip-note').textContent.includes('No hay dispositivos')", 5000), await ev("document.getElementById('trip-note').textContent"));

s.finish('BLUETOOTH');
