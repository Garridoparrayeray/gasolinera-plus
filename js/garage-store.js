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

    async function importAll(payload) {
        if (!payload || payload.format !== BACKUP_FORMAT) {
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
                const rows = payload[store] || [];
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
