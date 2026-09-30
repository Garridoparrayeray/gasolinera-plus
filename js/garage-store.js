const GarageStore = (() => {
    const DB_NAME = 'gasolinera-garage';
    const DB_VERSION = 1;
    const BACKUP_FORMAT = 'gasolinera-plus-backup';
    const STORES = ['vehicles', 'refuels', 'trips', 'settings'];

    let dbPromise = null;
    let persistRequested = false;

    function migrate(db, oldVersion) {
        if (oldVersion < 1) {
            db.createObjectStore('vehicles', { keyPath: 'id' });
            const refuels = db.createObjectStore('refuels', { keyPath: 'id' });
            refuels.createIndex('vehicleId', 'vehicleId');
            const trips = db.createObjectStore('trips', { keyPath: 'id' });
            trips.createIndex('vehicleId', 'vehicleId');
            trips.createIndex('startedAt', 'startedAt');
            db.createObjectStore('settings', { keyPath: 'key' });
        }
    }

    function open() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onupgradeneeded = (event) => migrate(request.result, event.oldVersion);
                request.onsuccess = () => {
                    const db = request.result;
                    db.onversionchange = () => {
                        db.close();
                        dbPromise = null;
                    };
                    resolve(db);
                };
                request.onerror = () => {
                    dbPromise = null;
                    reject(request.error);
                };
            });
        }
        return dbPromise;
    }

    function requestPersistence() {
        if (persistRequested || !navigator.storage || !navigator.storage.persist) {
            return;
        }
        persistRequested = true;
        navigator.storage.persist().catch(() => false);
    }

    function wrap(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function all(store) {
        const db = await open();
        return wrap(db.transaction(store).objectStore(store).getAll());
    }

    async function byIndex(store, index, value) {
        const db = await open();
        return wrap(db.transaction(store).objectStore(store).index(index).getAll(value));
    }

    async function get(store, key) {
        const db = await open();
        return wrap(db.transaction(store).objectStore(store).get(key));
    }

    async function put(store, value) {
        requestPersistence();
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(value);
            tx.oncomplete = () => resolve(value);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function remove(store, key) {
        const db = await open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    function newId() {
        if (window.crypto && window.crypto.randomUUID) {
            return window.crypto.randomUUID();
        }
        return Date.now().toString(36) + Math.random().toString(36).slice(2);
    }

    async function setting(key, fallback) {
        const row = await get('settings', key);
        if (row === undefined) {
            return fallback;
        }
        return row.value;
    }

    function saveSetting(key, value) {
        return put('settings', { key, value });
    }

    async function deleteVehicle(id) {
        const db = await open();
        const refuels = await byIndex('refuels', 'vehicleId', id);
        const trips = await byIndex('trips', 'vehicleId', id);
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['vehicles', 'refuels', 'trips'], 'readwrite');
            tx.objectStore('vehicles').delete(id);
            for (const refuel of refuels) {
                tx.objectStore('refuels').delete(refuel.id);
            }
            for (const trip of trips) {
                tx.objectStore('trips').delete(trip.id);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function exportAll(includeTrips, extra) {
        const payload = {
            format: BACKUP_FORMAT,
            schema: DB_VERSION,
            exportedAt: new Date().toISOString(),
            vehicles: await all('vehicles'),
            refuels: await all('refuels'),
            trips: [],
            settings: await all('settings'),
            extra: extra || {},
        };
        if (includeTrips) {
            payload.trips = await all('trips');
        }
        return payload;
    }

    const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
    const FUEL_PATTERN = /^[a-z0-9_]{1,40}$/;
    const MAX_IMPORT_ROWS = { vehicles: 50, refuels: 20000, trips: 5000, settings: 10 };

    function clean(value, max) {
        if (value === undefined || value === null) {
            return '';
        }
        return String(value).slice(0, max);
    }

    function finite(value) {
        if (value === null || value === undefined || value === '') {
            return null;
        }
        const number = Number(value);
        if (Number.isFinite(number)) {
            return number;
        }
        return null;
    }

    function sanitizeVehicle(row) {
        const tank = finite(row.tankCapacity);
        const homologated = finite(row.homologated);
        const odometer = finite(row.odometer);
        if (!ID_PATTERN.test(String(row.id)) || !FUEL_PATTERN.test(String(row.fuel)) || tank === null || homologated === null || odometer === null) {
            return null;
        }
        return {
            id: String(row.id),
            name: clean(row.name, 80),
            fuel: String(row.fuel),
            tankCapacity: tank,
            homologated,
            odometer,
            odometerAt: clean(row.odometerAt, 40),
            createdAt: clean(row.createdAt, 40),
            updatedAt: clean(row.updatedAt, 40),
        };
    }

    function sanitizeRefuel(row) {
        const odometer = finite(row.odometer);
        const liters = finite(row.liters);
        const price = finite(row.pricePerUnit);
        const total = finite(row.total);
        if (!ID_PATTERN.test(String(row.id)) || !ID_PATTERN.test(String(row.vehicleId)) || odometer === null || liters === null || price === null || total === null) {
            return null;
        }
        let stationId = null;
        let stationName = null;
        if (row.stationId) {
            stationId = clean(row.stationId, 30);
            stationName = clean(row.stationName, 80);
        }
        return {
            id: String(row.id),
            vehicleId: String(row.vehicleId),
            date: clean(row.date, 40),
            odometer,
            liters,
            pricePerUnit: price,
            total,
            full: Boolean(row.full),
            missedBefore: Boolean(row.missedBefore),
            stationId,
            stationName,
            stationLat: finite(row.stationLat),
            stationLon: finite(row.stationLon),
            nationalAvg: finite(row.nationalAvg),
            zoneAvg: finite(row.zoneAvg),
            zoneRadiusKm: finite(row.zoneRadiusKm),
            createdAt: clean(row.createdAt, 40),
            updatedAt: clean(row.updatedAt, 40),
        };
    }

    function sanitizeMetrics(metrics) {
        const out = {};
        if (!metrics || typeof metrics !== 'object') {
            return out;
        }
        for (const [key, value] of Object.entries(metrics)) {
            if (key === 'speedBands' && Array.isArray(value)) {
                out.speedBands = value.slice(0, 12).map((band) => ({ from: finite(band && band.from), to: finite(band && band.to), seconds: finite(band && band.seconds) }));
            } else if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
                out[key] = value;
            }
        }
        return out;
    }

    function sanitizeTrip(row) {
        if (!ID_PATTERN.test(String(row.id))) {
            return null;
        }
        let vehicleId = null;
        if (row.vehicleId && ID_PATTERN.test(String(row.vehicleId))) {
            vehicleId = String(row.vehicleId);
        }
        const track = [];
        if (Array.isArray(row.track)) {
            for (const point of row.track.slice(0, 20000)) {
                if (Array.isArray(point) && point.length >= 4 && point.slice(0, 4).every((v) => Number.isFinite(Number(v)))) {
                    track.push(point.slice(0, 4).map(Number));
                }
            }
        }
        return {
            id: String(row.id),
            vehicleId,
            auto: Boolean(row.auto),
            startedAt: clean(row.startedAt, 40),
            endedAt: clean(row.endedAt, 40),
            metrics: sanitizeMetrics(row.metrics),
            track,
            createdAt: clean(row.createdAt, 40),
        };
    }

    function sanitizeSetting(row) {
        if (row.key !== 'activeVehicleId') {
            return null;
        }
        if (row.value === null || (typeof row.value === 'string' && ID_PATTERN.test(row.value))) {
            return { key: 'activeVehicleId', value: row.value };
        }
        return null;
    }

    function sanitizeRows(store, rows) {
        const sanitizers = { vehicles: sanitizeVehicle, refuels: sanitizeRefuel, trips: sanitizeTrip, settings: sanitizeSetting };
        if (!Array.isArray(rows)) {
            return [];
        }
        const out = [];
        for (const row of rows.slice(0, MAX_IMPORT_ROWS[store])) {
            if (!row || typeof row !== 'object') {
                continue;
            }
            const safe = sanitizers[store](row);
            if (safe) {
                out.push(safe);
            }
        }
        return out;
    }

    async function importAll(payload) {        if (!payload || payload.format !== BACKUP_FORMAT) {
            throw new Error('El fichero no es una copia de Gasolinera+');
        }
        if (payload.schema > DB_VERSION) {
            throw new Error('La copia es de una versión más nueva de la app: actualízala primero');
        }
        const db = await open();
        const counts = {};
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORES, 'readwrite');
            for (const store of STORES) {
                const rows = sanitizeRows(store, payload[store]);
                counts[store] = rows.length;
                for (const row of rows) {
                    tx.objectStore(store).put(row);
                }
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
        return counts;
    }

    return {
        newId,
        vehicles: {
            list: () => all('vehicles'),
            get: (id) => get('vehicles', id),
            save: (vehicle) => put('vehicles', vehicle),
            remove: deleteVehicle,
        },
        refuels: {
            forVehicle: (vehicleId) => byIndex('refuels', 'vehicleId', vehicleId),
            save: (refuel) => put('refuels', refuel),
            remove: (id) => remove('refuels', id),
        },
        trips: {
            forVehicle: (vehicleId) => byIndex('trips', 'vehicleId', vehicleId),
            all: () => all('trips'),
            get: (id) => get('trips', id),
            save: (trip) => put('trips', trip),
            remove: (id) => remove('trips', id),
        },
        setting,
        saveSetting,
        exportAll,
        importAll,
    };
})();
