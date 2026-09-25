const GPRoute = (() => {
    const $ = (id) => document.getElementById(id);
    const el = {
        form: $('route-form'),
        from: $('route-from'),
        fromHere: $('route-from-here'),
        fromSuggestions: $('route-from-suggestions'),
        to: $('route-to'),
        toSuggestions: $('route-to-suggestions'),
        swap: $('route-swap'),
        detour: $('route-detour'),
        sort: $('route-sort'),
        submit: $('route-submit'),
        status: $('route-status'),
        progress: $('route-progress'),
        progressBar: $('route-progress-bar'),
        map: $('route-map'),
        result: $('route-result'),
        distance: $('route-distance'),
        duration: $('route-duration'),
        cost: $('route-cost'),
        costNote: $('route-cost-note'),
        count: $('route-count'),
        toll: $('route-toll'),
        navigate: $('route-navigate'),
        clearStop: $('route-clear-stop'),
        tank: $('route-tank'),
        tankValue: $('route-tank-value'),
        tankRow: $('route-tank-row'),
        advice: $('route-refuel-advice'),
        refuelGo: $('route-refuel-go'),
        stations: $('route-stations'),
        stationsEmpty: $('route-stations-empty'),
        filterFuel: $('filter-fuel'),
        filterOpen: $('filter-open'),
    };

    const RESERVE_KM = 30;
    const KIND_LABELS = ['ciudad', 'pueblo', 'pueblo', 'barrio', 'barrio', 'barrio', 'aldea'];

    const state = {
        worker: null,
        requestId: 0,
        pending: new Map(),
        places: null,
        placesPromise: null,
        from: null,
        to: null,
        stop: null,
        direct: null,
        result: null,
        corridor: [],
        plan: [],
        map: null,
        routeLayer: null,
        stationLayer: null,
        pointLayer: null,
        suggestTimers: {},
        tankTouched: false,
    };

    function number(value, digits) {
        return value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function durationText(seconds) {
        const minutes = Math.round(seconds / 60);
        if (minutes < 60) {
            return `${minutes} min`;
        }
        return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    }

    function setStatus(text) {
        el.status.textContent = text;
    }

    function worker() {
        if (!state.worker) {
            state.worker = new Worker('/js/router-worker.js');
            state.worker.onmessage = (event) => {
                const { id, result, error, progress } = event.data;
                const pending = state.pending.get(id);
                if (!pending) {
                    return;
                }
                if (progress) {
                    pending.onProgress(progress);
                    return;
                }
                state.pending.delete(id);
                if (error) {
                    pending.reject(new Error(error));
                } else {
                    pending.resolve(result);
                }
            };
        }
        return state.worker;
    }

    function computeRoute(points) {
        state.requestId++;
        const id = state.requestId;
        return new Promise((resolve, reject) => {
            state.pending.set(id, {
                resolve,
                reject,
                onProgress: ({ received, total }) => {
                    el.progress.hidden = false;
                    let percent = 0;
                    if (total) {
                        percent = Math.min(100, Math.round((received / total) * 100));
                    }
                    el.progressBar.style.width = percent + '%';
                    setStatus(`Descargando el mapa de carreteras (${number(total / 1e6, 0)} MB, solo la primera vez)… ${percent} %`);
                },
            });
            worker().postMessage({ id, type: 'route', points });
        });
    }

    async function loadPlaces() {
        if (!state.placesPromise) {
            state.placesPromise = fetch('/data/road-graph/places.json')
                .then((response) => {
                    if (!response.ok) {
                        throw new Error('sin lugares');
                    }
                    return response.json();
                })
                .then((payload) => {
                    state.places = payload.places.map((row) => ({
                        name: row[0],
                        lat: row[1],
                        lon: row[2],
                        kind: row[3],
                        province: row[4],
                        alt: row[5] || '',
                        key: OfflineEngine.normalize(row[0]),
                        altKey: OfflineEngine.normalize(row[5] || ''),
                    }));
                    return state.places;
                })
                .catch(() => {
                    state.placesPromise = null;
                    return [];
                });
        }
        return state.placesPromise;
    }

    async function searchPlaces(text) {
        const query = OfflineEngine.normalize(text.trim());
        if (query.length < 2) {
            return [];
        }
        const places = await loadPlaces();
        const scored = [];
        for (const place of places) {
            let score = -1;
            if (place.key === query || place.altKey === query) {
                score = 0;
            } else if (place.key.startsWith(query) || (place.altKey && place.altKey.startsWith(query))) {
                score = 1;
            } else if (query.length >= 4 && (place.key.includes(query) || (place.altKey && place.altKey.includes(query)))) {
                score = 2;
            }
            if (score !== -1) {
                scored.push({ place, score: score * 10 + place.kind });
            }
        }
        scored.sort((a, b) => a.score - b.score || a.place.name.localeCompare(b.place.name, 'es'));
        return scored.slice(0, 8).map((entry) => entry.place);
    }

    function placeLabel(place) {
        let label = place.name;
        if (place.alt) {
            label += ` (${place.alt})`;
        }
        return label;
    }

    function renderSuggestions(list, input, places, onPick) {
        list.innerHTML = '';
        if (!places.length) {
            list.hidden = true;
            return;
        }
        for (const place of places) {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.innerHTML = '<span></span><small></small>';
            button.querySelector('span').textContent = placeLabel(place);
            let where = KIND_LABELS[place.kind];
            if (place.province) {
                where += ' · ' + place.province;
            }
            button.querySelector('small').textContent = where;
            button.addEventListener('mousedown', (event) => event.preventDefault());
            button.addEventListener('click', () => {
                input.value = placeLabel(place);
                list.hidden = true;
                onPick({ lat: place.lat, lon: place.lon, label: input.value });
            });
            li.appendChild(button);
            list.appendChild(li);
        }
        list.hidden = false;
    }

    function wireSuggestions(input, list, key) {
        input.addEventListener('input', () => {
            state[key] = null;
            clearTimeout(state.suggestTimers[key]);
            state.suggestTimers[key] = setTimeout(async () => {
                const places = await searchPlaces(input.value);
                renderSuggestions(list, input, places, (point) => {
                    state[key] = point;
                    updatePointMarkers();
                });
            }, 150);
        });
        input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 150));
    }

    async function resolveInput(input, key) {
        const text = input.value.trim();
        if (state[key] && state[key].label === text) {
            return state[key];
        }
        if (text.length < 2) {
            return null;
        }
        const exact = (await searchPlaces(text)).find((place) => {
            const norm = OfflineEngine.normalize(text);
            return place.key === norm || place.altKey === norm || OfflineEngine.normalize(placeLabel(place)) === norm;
        });
        if (exact) {
            return { lat: exact.lat, lon: exact.lon, label: text };
        }
        try {
            const found = await Api.resolvePlace(text);
            return { lat: found.lat, lon: found.lon, label: text };
        } catch (error) {
            const fallback = (await searchPlaces(text))[0];
            if (fallback) {
                return { lat: fallback.lat, lon: fallback.lon, label: placeLabel(fallback) };
            }
            throw new Error(`No encuentro "${text}". Prueba con el nombre del pueblo o de la ciudad.`);
        }
    }

    async function useMyLocation() {
        setStatus('Buscando tu ubicación…');
        try {
            const position = await GPNative.getPosition({ timeout: 10000, maximumAge: 5 * 60 * 1000 });
            state.from = { lat: position.coords.latitude, lon: position.coords.longitude, label: 'Mi ubicación' };
            el.from.value = 'Mi ubicación';
            setStatus('');
            updatePointMarkers();
        } catch (error) {
            setStatus('No se pudo obtener tu ubicación. Escribe el origen.');
        }
    }

    function ensureMap() {
        if (state.map) {
            state.map.invalidateSize();
            return;
        }
        state.map = L.map(el.map).setView([40.2, -3.7], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
            maxZoom: 19,
        }).addTo(state.map);
        state.routeLayer = L.layerGroup().addTo(state.map);
        state.stationLayer = L.layerGroup().addTo(state.map);
        state.pointLayer = L.layerGroup().addTo(state.map);
        state.map.on('click', (event) => {
            state.to = { lat: event.latlng.lat, lon: event.latlng.lng, label: `Punto del mapa (${number(event.latlng.lat, 4)}, ${number(event.latlng.lng, 4)})` };
            el.to.value = state.to.label;
            updatePointMarkers();
            GP.showToast('Destino elegido en el mapa');
        });
    }

    function updatePointMarkers() {
        if (!state.map) {
            return;
        }
        state.pointLayer.clearLayers();
        const bounds = [];
        for (const [point, color] of [[state.from, '#1D4E89'], [state.to, '#B3261E']]) {
            if (point) {
                L.circleMarker([point.lat, point.lon], { radius: 9, color: 'white', weight: 3, fillColor: color, fillOpacity: 1 }).addTo(state.pointLayer);
                bounds.push([point.lat, point.lon]);
            }
        }
        if (!state.result && bounds.length === 2) {
            state.map.fitBounds(bounds, { padding: [30, 30] });
        } else if (!state.result && bounds.length === 1) {
            state.map.setView(bounds[0], 11);
        }
    }

    function buildCorridor(coords, maxKm, stations, fuel, only24h) {
        const cumulative = new Float64Array(coords.length);
        for (let i = 1; i < coords.length; i++) {
            cumulative[i] = cumulative[i - 1] + GPRouter.metersBetween(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]);
        }
        const cell = 0.05;
        const grid = new Map();
        const padLat = (maxKm * 1000) / 111000;
        for (let i = 0; i < coords.length - 1; i++) {
            const [aLat, aLon] = coords[i];
            const [bLat, bLon] = coords[i + 1];
            const padLon = padLat / Math.cos((aLat * Math.PI) / 180);
            const y0 = Math.floor((Math.min(aLat, bLat) - padLat) / cell);
            const y1 = Math.floor((Math.max(aLat, bLat) + padLat) / cell);
            const x0 = Math.floor((Math.min(aLon, bLon) - padLon) / cell);
            const x1 = Math.floor((Math.max(aLon, bLon) + padLon) / cell);
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const key = y * 100000 + x;
                    let bucket = grid.get(key);
                    if (!bucket) {
                        bucket = [];
                        grid.set(key, bucket);
                    }
                    bucket.push(i);
                }
            }
        }
        const found = [];
        for (const station of stations) {
            const price = station.precios[fuel];
            if (price === undefined) {
                continue;
            }
            if (only24h && Number(station.is_24h) !== 1) {
                continue;
            }
            const bucket = grid.get(Math.floor(station.lat / cell) * 100000 + Math.floor(station.lon / cell));
            if (!bucket) {
                continue;
            }
            let best = Infinity;
            let along = 0;
            for (const i of bucket) {
                const [aLat, aLon] = coords[i];
                const [bLat, bLon] = coords[i + 1];
                const k = Math.cos((aLat * Math.PI) / 180);
                const bx = (bLon - aLon) * k;
                const by = bLat - aLat;
                const px = (station.lon - aLon) * k;
                const py = station.lat - aLat;
                const len2 = bx * bx + by * by;
                let t = 0;
                if (len2 > 0) {
                    t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
                }
                const d = GPRouter.metersBetween(station.lat, station.lon, aLat + t * (bLat - aLat), aLon + t * (bLon - aLon));
                if (d < best) {
                    best = d;
                    along = cumulative[i] + t * (cumulative[i + 1] - cumulative[i]);
                }
            }
            if (best <= maxKm * 1000) {
                found.push({ station, price: Number(price), offKm: best / 1000, alongKm: along / 1000 });
            }
        }
        return found;
    }

    function vehicleContext() {
        const vehicle = GPGarage.activeVehicle();
        if (!vehicle) {
            return null;
        }
        const summary = GPGarage.summary();
        return { vehicle, summary };
    }

    function planStops(routeKm, corridor, context, levelPercent) {
        const { vehicle, summary } = context;
        const perKm = summary.avgConsumption / 100;
        const fullRange = vehicle.tankCapacity / perKm;
        let range = (vehicle.tankCapacity * levelPercent) / 100 / perKm - RESERVE_KM;
        let position = 0;
        const stops = [];
        while (routeKm - position > range) {
            const reachable = corridor.filter((c) => c.alongKm > position + 1 && c.alongKm <= position + range);
            if (!reachable.length) {
                return { stops, stranded: true, reachKm: Math.max(0, position + range) };
            }
            const window = reachable.filter((c) => c.alongKm >= position + range * 0.4);
            let pool = window;
            if (!pool.length) {
                pool = reachable;
            }
            const choice = pool.reduce((best, c) => {
                if (!best || c.price < best.price) {
                    return c;
                }
                return best;
            }, null);
            stops.push(choice);
            position = choice.alongKm;
            range = fullRange - RESERVE_KM;
            if (stops.length > 8) {
                break;
            }
        }
        return { stops, stranded: false, leftoverKm: position + range - routeKm };
    }

    function renderAdvice() {
        const result = state.result;
        if (!result) {
            return;
        }
        const context = vehicleContext();
        const fuel = el.filterFuel.value;
        const unit = AlertsStore.unitFor(fuel);
        const corridor = state.corridor;
        el.refuelGo.hidden = true;
        state.plan = [];
        if (!context) {
            el.tankRow.hidden = true;
            const cheapest = corridor.reduce((best, c) => {
                if (!best || c.price < best.price) {
                    return c;
                }
                return best;
            }, null);
            let text = 'Añade tu coche en "Mi coche" y te diré hasta dónde llegas y dónde te conviene parar.';
            if (cheapest) {
                text += ` La más barata del camino es ${cheapest.station.rotulo} (km ${number(cheapest.alongKm, 0)}) a ${number(cheapest.price, 3)} €/${unit}.`;
            }
            el.advice.textContent = text;
            el.cost.textContent = '—';
            el.costNote.textContent = '';
            return;
        }
        el.tankRow.hidden = false;
        if (!state.tankTouched) {
            let estimate = 50;
            if (context.summary.tankPercent !== null) {
                estimate = Math.round(context.summary.tankPercent / 5) * 5;
            }
            el.tank.value = String(estimate);
        }
        const level = Number(el.tank.value);
        el.tankValue.textContent = `${level} %`;
        const routeKm = result.meters / 1000;
        const litres = (routeKm * context.summary.avgConsumption) / 100;
        const vehicleFuel = context.vehicle.fuel;
        let reference = null;
        const prices = corridor.map((c) => c.price);
        if (prices.length) {
            reference = prices.reduce((a, b) => a + b, 0) / prices.length;
        }
        if (reference !== null) {
            el.cost.textContent = `${number(litres * reference, 2)} €`;
            el.costNote.textContent = `${number(litres, 1)} ${unit} a precio medio del camino`;
        } else {
            el.cost.textContent = `${number(litres, 1)} ${unit}`;
            el.costNote.textContent = '';
        }
        if (fuel !== vehicleFuel) {
            el.advice.textContent = `Tu ${context.vehicle.name} usa ${AlertsStore.labelFor(vehicleFuel)}; el filtro está en ${AlertsStore.labelFor(fuel)}. Cámbialo arriba para ver sus precios.`;
            return;
        }
        const plan = planStops(routeKm, corridor, context, level);
        state.plan = plan.stops;
        if (plan.stranded && !plan.stops.length) {
            el.advice.textContent = `Con el ${level} % no llegas a ninguna gasolinera del camino (te alcanza para unos ${number(plan.reachKm, 0)} km contando ${RESERVE_KM} km de reserva). Reposta antes de salir.`;
            return;
        }
        if (!plan.stops.length) {
            const cheapest = corridor.reduce((best, c) => {
                if (!best || c.price < best.price) {
                    return c;
                }
                return best;
            }, null);
            let text = `Llegas sin repostar: te sobrarán unos ${number(Math.max(0, plan.leftoverKm), 0)} km de autonomía.`;
            if (cheapest) {
                text += ` Si quieres llenar, la más barata del camino es ${cheapest.station.rotulo} (km ${number(cheapest.alongKm, 0)}) a ${number(cheapest.price, 3)} €/${unit}.`;
            }
            el.advice.textContent = text;
            return;
        }
        const parts = plan.stops.map((stop, i) => `${i + 1}) ${stop.station.rotulo}, km ${number(stop.alongKm, 0)}, a ${number(stop.price, 3)} €/${unit}`);
        let times = '';
        if (plan.stops.length > 1) {
            times = `${plan.stops.length} veces `;
        }
        let text = `Te conviene parar ${times}en: ${parts.join('; ')}.`;
        if (plan.stranded) {
            text += ' Después no hay gasolineras a tu alcance con ese carburante: amplía el desvío.';
        }
        el.advice.textContent = text;
        el.refuelGo.hidden = false;
    }

    function priceColor(price, min, max) {
        if (max === min) {
            return '#8A5A00';
        }
        const ratio = (price - min) / (max - min);
        return `hsl(${120 - ratio * 120}, 70%, 42%)`;
    }

    function renderStations() {
        const fuel = el.filterFuel.value;
        const unit = AlertsStore.unitFor(fuel);
        let list = [...state.corridor];
        if (el.sort.value === 'price') {
            list.sort((a, b) => a.price - b.price);
        } else {
            list.sort((a, b) => a.alongKm - b.alongKm);
        }
        el.count.textContent = String(list.length);
        el.stationsEmpty.hidden = list.length > 0;
        el.stations.innerHTML = '';
        state.stationLayer.clearLayers();
        if (!list.length) {
            return;
        }
        const prices = list.map((c) => c.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        for (const entry of list.slice(0, 150)) {
            const { station } = entry;
            const li = document.createElement('li');
            li.className = 'route-station';
            if (entry.price === min) {
                li.classList.add('route-station--cheapest');
            }
            li.innerHTML = `
                <div class="route-station__main">
                    <strong></strong>
                    <small></small>
                </div>
                <div class="route-station__side">
                    <span class="route-station__price"></span>
                    <button type="button" class="pill route-station__stop">Parar aquí</button>
                </div>`;
            li.querySelector('strong').textContent = station.rotulo;
            let details = `km ${number(entry.alongKm, 0)} · a ${number(entry.offKm, 1)} km de la ruta`;
            if (Number(station.is_24h) === 1) {
                details += ' · 24h';
            }
            details += ` · ${station.municipio}`;
            li.querySelector('small').textContent = details;
            const priceNode = li.querySelector('.route-station__price');
            priceNode.textContent = `${number(entry.price, 3)} €/${unit}`;
            priceNode.style.color = priceColor(entry.price, min, max);
            li.querySelector('.route-station__main').addEventListener('click', () => GP.openStationModal(String(station.ideess)));
            li.querySelector('.route-station__stop').addEventListener('click', () => setStop(entry));
            el.stations.appendChild(li);

            const marker = L.circleMarker([station.lat, station.lon], {
                radius: 7,
                color: 'white',
                weight: 1,
                fillColor: priceColor(entry.price, min, max),
                fillOpacity: 0.95,
            });
            marker.bindPopup(`<strong></strong><br>${number(entry.price, 3)} €/${unit} · km ${number(entry.alongKm, 0)}`);
            marker.on('popupopen', (event) => {
                event.popup.getElement().querySelector('strong').textContent = station.rotulo;
            });
            marker.addTo(state.stationLayer);
        }
    }

    function drawRoute() {
        state.routeLayer.clearLayers();
        const line = L.polyline(state.result.coords, { color: '#1D4E89', weight: 5, opacity: 0.85 });
        line.addTo(state.routeLayer);
        state.map.fitBounds(line.getBounds(), { padding: [30, 30] });
        if (state.stop) {
            L.circleMarker([state.stop.station.lat, state.stop.station.lon], { radius: 11, color: '#1D4E89', weight: 3, fillColor: '#F2B705', fillOpacity: 1 }).addTo(state.routeLayer);
        }
    }

    async function refreshCorridor() {
        if (!state.result) {
            return;
        }
        const stations = await OfflineEngine.loadData();
        state.corridor = buildCorridor(state.direct.coords, Number(el.detour.value), stations, el.filterFuel.value, el.filterOpen.value === '24h');
        renderStations();
        renderAdvice();
    }

    function renderSummary() {
        const result = state.result;
        el.distance.textContent = `${number(result.meters / 1000, 1)} km`;
        let duration = durationText(result.seconds);
        if (state.stop && state.direct) {
            const extraMin = Math.max(0, Math.round((result.seconds - state.direct.seconds) / 60));
            const extraKm = Math.max(0, (result.meters - state.direct.meters) / 1000);
            duration += ` (+${extraMin} min, +${number(extraKm, 1)} km por la parada)`;
        }
        el.duration.textContent = duration;
        el.toll.hidden = !result.toll;
        el.clearStop.hidden = !state.stop;
        el.result.hidden = false;
    }

    async function run(points) {
        el.submit.disabled = true;
        setStatus('Calculando la ruta en tu dispositivo…');
        try {
            const result = await computeRoute(points);
            el.progress.hidden = true;
            if (result.error === 'no-road') {
                let which = 'la parada';
                if (result.index === 0) {
                    which = 'el origen';
                } else if (result.index === points.length - 1) {
                    which = 'el destino';
                }
                setStatus(`No hay ninguna carretera cerca de ${which}.`);
                return null;
            }
            if (result.error === 'no-connection') {
                setStatus('No hay conexión por carretera entre esos puntos (¿una isla?).');
                return null;
            }
            setStatus(`Ruta calculada en ${number(result.ms / 1000, 1)} s.`);
            return result;
        } catch (error) {
            el.progress.hidden = true;
            setStatus('No se pudo calcular la ruta: ' + error.message);
            return null;
        } finally {
            el.submit.disabled = false;
        }
    }

    async function calculate(event) {
        if (event) {
            event.preventDefault();
        }
        ensureMap();
        let from;
        let to;
        if (!el.from.value.trim()) {
            await useMyLocation();
        }
        try {
            from = await resolveInput(el.from, 'from');
            to = await resolveInput(el.to, 'to');
        } catch (error) {
            setStatus(error.message);
            return;
        }
        if (!from || !to) {
            setStatus('Indica el origen y el destino.');
            return;
        }
        state.from = from;
        state.to = to;
        state.stop = null;
        updatePointMarkers();
        const result = await run([[from.lat, from.lon], [to.lat, to.lon]]);
        if (!result) {
            return;
        }
        el.submit.disabled = true;
        state.direct = result;
        state.result = result;
        drawRoute();
        renderSummary();
        try {
            await refreshCorridor();
        } finally {
            el.submit.disabled = false;
        }
    }

    async function setStop(entry) {
        const result = await run([[state.from.lat, state.from.lon], [entry.station.lat, entry.station.lon], [state.to.lat, state.to.lon]]);
        if (!result) {
            return;
        }
        state.stop = entry;
        state.result = result;
        drawRoute();
        renderSummary();
        GP.showToast(`Parada en ${entry.station.rotulo}`);
        el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function clearStop() {
        state.stop = null;
        state.result = state.direct;
        drawRoute();
        renderSummary();
    }

    function navigate() {
        const params = new URLSearchParams({
            api: '1',
            origin: `${state.from.lat},${state.from.lon}`,
            destination: `${state.to.lat},${state.to.lon}`,
            travelmode: 'driving',
        });
        if (state.stop) {
            params.set('waypoints', `${state.stop.station.lat},${state.stop.station.lon}`);
        }
        GPNative.openExternal('https://www.google.com/maps/dir/?' + params.toString());
    }

    function swap() {
        const from = state.from;
        state.from = state.to;
        state.to = from;
        const text = el.from.value;
        el.from.value = el.to.value;
        el.to.value = text;
        updatePointMarkers();
    }

    function onShow() {
        ensureMap();
        if (!state.from && !el.from.value) {
            const position = GP.userPosition();
            if (position) {
                state.from = { lat: position.lat, lon: position.lon, label: 'Mi ubicación' };
                el.from.value = 'Mi ubicación';
                updatePointMarkers();
            }
        }
        loadPlaces();
    }

    wireSuggestions(el.from, el.fromSuggestions, 'from');
    wireSuggestions(el.to, el.toSuggestions, 'to');
    el.form.addEventListener('submit', calculate);
    el.fromHere.addEventListener('click', useMyLocation);
    el.swap.addEventListener('click', swap);
    el.navigate.addEventListener('click', navigate);
    el.clearStop.addEventListener('click', clearStop);
    el.refuelGo.addEventListener('click', () => {
        if (state.plan.length) {
            setStop(state.plan[0]);
        }
    });
    el.tank.addEventListener('input', () => {
        state.tankTouched = true;
        renderAdvice();
    });
    for (const input of [el.detour, el.filterFuel, el.filterOpen]) {
        input.addEventListener('change', refreshCorridor);
    }
    el.sort.addEventListener('change', renderStations);
    document.addEventListener('gp:location', (event) => {
        if (!el.from.value.trim()) {
            state.from = { lat: event.detail.lat, lon: event.detail.lon, label: 'Mi ubicación' };
            el.from.value = 'Mi ubicación';
            updatePointMarkers();
        }
    });
    document.addEventListener('gp:view', (event) => {
        if (event.detail === 'route') {
            onShow();
        }
    });

    return { calculate, state };
})();
