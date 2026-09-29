const GPMaps = (() => {
    const RELEASE = 'https://github.com/Garridoparrayeray/gasolinera-plus/releases/download/offline-maps/';
    const FOLDER = 'maps';
    const STORAGE_KEY = 'gp_offline_maps';
    const MIN_ZOOM = 12;
    const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>';

    const state = {
        installed: readRegistry(),
        maps: new Map(),
        index: null,
        busy: {},
    };

    function readRegistry() {
        try {
            const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
        } catch (e) {
            return {};
        }
        return {};
    }

    function saveRegistry() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state.installed));
        } catch (e) {
            return;
        }
    }

    function filesystem() {
        return GPNative.plugin('Filesystem');
    }

    function directory() {
        if (GPNative.platform() === 'ios') {
            return 'CACHE';
        }
        return 'DATA';
    }

    function available() {
        return Boolean(GPNative.isNative() && filesystem() && window.protomapsL);
    }

    async function fileUrl(file) {
        const result = await filesystem().getUri({ path: FOLDER + '/' + file, directory: directory() });
        return window.Capacitor.convertFileSrc(result.uri);
    }

    async function canReadRanges(url) {
        const controller = new AbortController();
        try {
            const response = await fetch(url, { headers: { Range: 'bytes=0-6' }, signal: controller.signal });
            if (response.status !== 206) {
                controller.abort();
                return false;
            }
            const text = new TextDecoder().decode(await response.arrayBuffer());
            return text === 'PMTiles';
        } catch (e) {
            return false;
        }
    }

    function regionBounds(entry) {
        return L.latLngBounds([entry.bbox[1], entry.bbox[0]], [entry.bbox[3], entry.bbox[2]]);
    }

    async function layerFor(entry) {
        const url = await fileUrl(entry.file);
        return window.protomapsL.leafletLayer({
            url,
            flavor: 'light',
            lang: 'es',
            maxDataZoom: entry.maxzoom,
            bounds: regionBounds(entry),
            attribution: ATTRIBUTION + ' · Protomaps',
        });
    }

    async function addRegionLayers(map, layers) {
        for (const id of Object.keys(state.installed)) {
            if (layers[id]) {
                continue;
            }
            try {
                const layer = await layerFor(state.installed[id]);
                layer.addTo(map);
                layers[id] = layer;
            } catch (e) {
                continue;
            }
        }
    }

    function addBaseLayers(map) {
        GPMapGuard.install(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: ATTRIBUTION,
            maxZoom: 19,
        }).addTo(map);
        if (!available()) {
            return;
        }
        const layers = {};
        state.maps.set(map, layers);
        map.on('unload', () => state.maps.delete(map));
        addRegionLayers(map, layers);
    }

    function refreshMaps() {
        for (const [map, layers] of state.maps) {
            for (const id of Object.keys(layers)) {
                if (!state.installed[id]) {
                    map.removeLayer(layers[id]);
                    delete layers[id];
                }
            }
            addRegionLayers(map, layers);
        }
    }

    async function exists(file) {
        try {
            const info = await filesystem().stat({ path: FOLDER + '/' + file, directory: directory() });
            return Number(info.size) > 0;
        } catch (e) {
            return false;
        }
    }

    async function verifyInstalled() {
        let changed = false;
        for (const id of Object.keys(state.installed)) {
            if (!(await exists(state.installed[id].file))) {
                delete state.installed[id];
                changed = true;
            }
        }
        if (changed) {
            saveRegistry();
        }
    }

    async function loadIndex() {
        const Filesystem = filesystem();
        const path = FOLDER + '/index.json';
        try {
            await Filesystem.downloadFile({ url: RELEASE + 'index.json', path, directory: directory(), recursive: true });
        } catch (e) {
            if (!state.index) {
                state.index = null;
            }
        }
        try {
            const file = await Filesystem.readFile({ path, directory: directory(), encoding: 'utf8' });
            state.index = JSON.parse(file.data);
        } catch (e) {
            state.index = null;
        }
        return state.index;
    }

    async function removeFile(file) {
        try {
            await filesystem().deleteFile({ path: FOLDER + '/' + file, directory: directory() });
        } catch (e) {
            return;
        }
    }

    async function install(entry, onProgress) {
        const Filesystem = filesystem();
        const handle = await Filesystem.addListener('progress', (event) => {
            if (event.url === RELEASE + entry.file && onProgress) {
                onProgress(event.bytes, event.contentLength || entry.bytes);
            }
        });
        try {
            await Filesystem.downloadFile({
                url: RELEASE + entry.file,
                path: FOLDER + '/' + entry.file,
                directory: directory(),
                recursive: true,
                progress: true,
            });
        } finally {
            handle.remove();
        }
        if (!(await exists(entry.file))) {
            throw new Error('La descarga no se completó');
        }
        const readable = await canReadRanges(await fileUrl(entry.file));
        if (!readable) {
            await removeFile(entry.file);
            throw new Error('Este dispositivo no permite leer el mapa descargado');
        }
        const previous = state.installed[entry.id];
        state.installed[entry.id] = entry;
        saveRegistry();
        if (previous && previous.file !== entry.file) {
            await removeFile(previous.file);
        }
        refreshMaps();
    }

    async function uninstall(entry) {
        const known = state.installed[entry.id];
        delete state.installed[entry.id];
        saveRegistry();
        if (known) {
            await removeFile(known.file);
        }
        refreshMaps();
    }

    function megabytes(bytes) {
        const mb = bytes / 1048576;
        if (mb >= 1024) {
            return (mb / 1024).toFixed(1).replace('.', ',') + ' GB';
        }
        return Math.round(mb) + ' MB';
    }

    function initCard() {
        const card = document.getElementById('offline-maps-card');
        if (!card) {
            return;
        }
        if (!available()) {
            card.hidden = true;
            return;
        }
        card.hidden = false;
        const list = document.getElementById('offline-maps-list');
        const note = document.getElementById('offline-maps-note');

        function say(text) {
            note.textContent = text;
            note.hidden = text === '';
        }

        function render() {
            list.innerHTML = '';
            if (!state.index) {
                say('No se pudo cargar la lista de mapas. Comprueba la conexión e inténtalo de nuevo.');
                return;
            }
            for (const entry of state.index.regions) {
                const installed = state.installed[entry.id];
                const outdated = installed && installed.file !== entry.file;
                const item = document.createElement('li');
                const name = document.createElement('span');
                name.textContent = entry.name + ' · ' + megabytes(entry.bytes);
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'pill';
                if (installed && !outdated) {
                    button.textContent = 'Borrar';
                } else if (outdated) {
                    button.textContent = 'Actualizar';
                } else {
                    button.textContent = 'Descargar';
                }
                button.addEventListener('click', () => act(entry, installed && !outdated, button));
                item.appendChild(name);
                item.appendChild(button);
                list.appendChild(item);
            }
        }

        async function act(entry, isInstalled, button) {
            if (state.busy[entry.id]) {
                return;
            }
            if (isInstalled) {
                await uninstall(entry);
                render();
                return;
            }
            const ok = window.confirm('Se van a descargar ' + megabytes(entry.bytes) + ' de ' + entry.name + '. Usa Wi-Fi si puedes. ¿Continuar?');
            if (!ok) {
                return;
            }
            state.busy[entry.id] = true;
            button.disabled = true;
            say('');
            try {
                await install(entry, (bytes, total) => {
                    button.textContent = Math.min(99, Math.round((bytes / total) * 100)) + '%';
                });
                say('Mapa de ' + entry.name + ' listo. Se ve sin conexión a partir del zoom ' + MIN_ZOOM + '.');
            } catch (error) {
                say('No se pudo descargar: ' + error.message);
            }
            state.busy[entry.id] = false;
            render();
        }

        document.addEventListener('gp:view', async (event) => {
            if (event.detail === 'garage') {
                await verifyInstalled();
                await loadIndex();
                render();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', initCard);

    return { addBaseLayers, available };
})();
