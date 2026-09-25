const GPBackup = (() => {
    function readLocalList(key) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(parsed)) {
                return parsed;
            }
        } catch (e) {
            return [];
        }
        return [];
    }

    function mergeLocalList(key, incoming) {
        if (!Array.isArray(incoming) || !incoming.length) {
            return 0;
        }
        const current = readLocalList(key);
        const known = new Set(current.map((entry) => entry.ideess));
        let added = 0;
        for (const entry of incoming) {
            if (entry && entry.ideess && !known.has(entry.ideess)) {
                current.push(entry);
                known.add(entry.ideess);
                added++;
            }
        }
        localStorage.setItem(key, JSON.stringify(current));
        return added;
    }

    function fileName() {
        return `gasolinera-plus-copia-${GPFuel.madridDate(new Date().toISOString())}.json`;
    }

    async function exportBackup(includeTrips) {
        const payload = await GarageStore.exportAll(includeTrips, {
            favorites: readLocalList('gasolinera_favorites'),
            compare: readLocalList('gasolinera_compare'),
        });
        const text = JSON.stringify(payload);
        const Filesystem = GPNative.plugin('Filesystem');
        const Share = GPNative.plugin('Share');
        if (Filesystem && Share) {
            const written = await Filesystem.writeFile({
                path: fileName(),
                data: text,
                directory: 'CACHE',
                encoding: 'utf8',
            });
            await Share.share({ title: 'Copia de Gasolinera+', files: [written.uri], dialogTitle: 'Guardar la copia' });
            return payload;
        }
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName();
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return payload;
    }

    async function importBackup(file) {
        const text = await file.text();
        let payload;
        try {
            payload = JSON.parse(text);
        } catch (e) {
            throw new Error('El fichero no es un JSON válido');
        }
        const counts = await GarageStore.importAll(payload);
        const extra = payload.extra || {};
        counts.favorites = mergeLocalList('gasolinera_favorites', extra.favorites);
        counts.compare = mergeLocalList('gasolinera_compare', extra.compare);
        return counts;
    }

    return { exportBackup, importBackup };
})();
