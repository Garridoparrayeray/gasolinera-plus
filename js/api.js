const OfflineEngine = (() => {
    let stationsCache = null;

    async function loadData() {
        if (!stationsCache) {
            const res = await fetch('/data/stations-lite.json');
            const payload = await res.json();
            if (Array.isArray(payload)) {
                stationsCache = payload;
            } else {
                stationsCache = payload.stations || [];
            }
        }
        return stationsCache;
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const p = 0.017453292519943295;
        const c = Math.cos;
        const a = 0.5 - c((lat2 - lat1) * p) / 2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p)) / 2;
        return 12742 * Math.asin(Math.sqrt(a));
    }

    function normalize(text) {
        if (!text) {
            return '';
        }
        return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    function isOpen24h(station) {
        return Number(station.is_24h) === 1 || station.is_24h === true;
    }

    function applyFilters(stations, fuel, open) {
        return stations.filter((s) => {
            if (fuel && s.precios[fuel] === undefined) {
                return false;
            }
            if (open === '24h' && !isOpen24h(s)) {
                return false;
            }
            return true;
        });
    }

    function priceOrMax(station, fuel) {
        const value = station.precios[fuel];
        if (value === undefined) {
            return 999;
        }
        return value;
    }

    function listItem(station, distanciaKm) {
        return {
            ideess: String(station.ideess),
            rotulo: station.rotulo,
            direccion: station.direccion,
            municipio: station.municipio,
            lat: station.lat,
            lon: station.lon,
            is24h: isOpen24h(station),
            horarioRaw: station.horario_raw || '',
            distanciaKm,
            precios: station.precios,
            tendencias: {},
        };
    }

    function page(items, offset, limit) {
        return {
            stations: items.slice(offset, offset + limit),
            total: items.length,
            hasMore: offset + limit < items.length,
            geocodedFrom: null,
            offline: true,
        };
    }

    return {
        haversine,
        normalize,
        loadData,
        near: async ({ lat, lon, radius = 10, sort = 'price', fuel = 'gasoleo_a', open, offset = 0, limit = 20 }) => {
            const data = applyFilters(await loadData(), fuel, open);
            const withDist = data
                .map((s) => ({ station: s, distanciaKm: Math.round(haversine(lat, lon, s.lat, s.lon) * 100) / 100 }))
                .filter((entry) => entry.distanciaKm <= Number(radius));
            if (sort === 'distance') {
                withDist.sort((a, b) => a.distanciaKm - b.distanciaKm);
            } else {
                withDist.sort((a, b) => priceOrMax(a.station, fuel) - priceOrMax(b.station, fuel));
            }
            return page(withDist.map((entry) => listItem(entry.station, entry.distanciaKm)), offset, limit);
        },
        bbox: async ({ north, south, east, west, fuel, open }) => {
            const data = applyFilters(await loadData(), fuel, open);
            const stations = data
                .filter((s) => s.lat <= north && s.lat >= south && s.lon <= east && s.lon >= west)
                .map((s) => {
                    let precio = null;
                    if (fuel && s.precios[fuel] !== undefined) {
                        precio = s.precios[fuel];
                    }
                    return { ideess: String(s.ideess), rotulo: s.rotulo, lat: s.lat, lon: s.lon, is24h: isOpen24h(s), precio };
                });
            return { stations, total: stations.length, truncated: false, offline: true };
        },
        search: async ({ q, lat, lon, sort = 'price', fuel = 'gasoleo_a', open, offset = 0, limit = 20 }) => {
            const data = applyFilters(await loadData(), fuel, open);
            const nq = normalize(q);
            const rawQuery = (q || '').trim();
            const hasLocation = lat !== undefined && lat !== null && lon !== undefined && lon !== null;

            function relevance(s) {
                const muni = normalize(s.municipio);
                const loc = normalize(s.localidad);
                const cp = String(s.cp || '');
                if (muni === nq || loc === nq || cp === rawQuery) {
                    return 0;
                }
                if (muni.startsWith(nq) || loc.startsWith(nq)) {
                    return 1;
                }
                if (rawQuery !== '' && cp.startsWith(rawQuery)) {
                    return 2;
                }
                if (muni.includes(nq) || loc.includes(nq)) {
                    return 3;
                }
                if (normalize(s.rotulo).includes(nq)) {
                    return 4;
                }
                return 5;
            }

            const matches = [];
            for (const s of data) {
                const hit = normalize(s.rotulo).includes(nq) || normalize(s.municipio).includes(nq)
                    || normalize(s.localidad).includes(nq) || normalize(s.direccion).includes(nq)
                    || (rawQuery !== '' && String(s.cp || '').startsWith(rawQuery));
                if (!hit) {
                    continue;
                }
                let distanciaKm = null;
                if (hasLocation) {
                    distanciaKm = Math.round(haversine(lat, lon, s.lat, s.lon) * 100) / 100;
                }
                matches.push({ station: s, relevance: relevance(s), distanciaKm });
            }

            matches.sort((a, b) => {
                if (a.relevance !== b.relevance) {
                    return a.relevance - b.relevance;
                }
                if (hasLocation && sort === 'distance') {
                    return a.distanciaKm - b.distanciaKm;
                }
                return priceOrMax(a.station, fuel) - priceOrMax(b.station, fuel);
            });

            return page(matches.map((entry) => listItem(entry.station, entry.distanciaKm)), offset, limit);
        },
        station: async (ideess) => {
            const data = await loadData();
            const s = data.find((entry) => String(entry.ideess) === String(ideess));
            if (!s) {
                return null;
            }
            const combustibles = {};
            for (const [slug, precio] of Object.entries(s.precios || {})) {
                combustibles[slug] = { precio: Number(precio), tendencia: null };
            }
            let texto = 'Horario no disponible';
            if (isOpen24h(s)) {
                texto = 'Abierto 24 horas';
            } else if (s.horario_raw) {
                texto = s.horario_raw;
            }
            return {
                ideess: String(s.ideess),
                rotulo: s.rotulo,
                direccion: s.direccion,
                localidad: s.localidad,
                municipio: s.municipio,
                provincia: s.provincia,
                cp: s.cp,
                lat: s.lat,
                lon: s.lon,
                is24h: isOpen24h(s),
                horario: { estado: 'desconocido', texto, raw: s.horario_raw || '' },
                combustibles,
                offline: true,
            };
        },
        suggestPlaces: async (q) => {
            const nq = normalize(q);
            if (!nq) {
                return [];
            }
            const data = await loadData();
            const municipios = new Map();
            const localidades = new Map();
            for (const s of data) {
                const muniNorm = normalize(s.municipio);
                if (s.municipio && muniNorm.startsWith(nq) && !municipios.has(muniNorm)) {
                    municipios.set(muniNorm, { label: s.municipio, sublabel: s.provincia });
                }
                const locNorm = normalize(s.localidad);
                if (s.localidad && locNorm.startsWith(nq) && locNorm !== muniNorm && !localidades.has(locNorm)) {
                    localidades.set(locNorm, { label: s.localidad, sublabel: `${s.municipio}, ${s.provincia}` });
                }
            }
            const byLabel = (a, b) => a.label.localeCompare(b.label, 'es');
            return [...municipios.values()].sort(byLabel)
                .concat([...localidades.values()].sort(byLabel))
                .slice(0, 8);
        },
    };
})();

const Api = (() => {
    async function request(path, signal) {
        let response;
        try {
            response = await fetch('/api' + path, { credentials: 'same-origin', signal });
        } catch (e) {
            if (e.name === 'AbortError') {
                throw e;
            }
            const error = new Error('Sin conexión a internet');
            error.status = 0;
            throw error;
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            const error = new Error(data.error || 'Error ' + response.status);
            error.status = response.status;
            throw error;
        }
        return data;
    }

    function isOffline(error) {
        return error.status === 0;
    }

    return {
        near: async (params) => {
            const { lat, lon, radius, sort, fuel, open, offset, limit } = params;
            const p = new URLSearchParams({ lat, lon, radius, sort });
            if (fuel) p.set('fuel', fuel);
            if (open) p.set('open', open);
            if (offset) p.set('offset', offset);
            if (limit) p.set('limit', limit);
            try {
                return await request('/stations/near?' + p);
            } catch (e) {
                if (isOffline(e)) {
                    return OfflineEngine.near(params);
                }
                throw e;
            }
        },
        search: async (params) => {
            const { q, lat, lon, sort, fuel, open, offset, limit } = params;
            const p = new URLSearchParams({ q, sort });
            if (lat !== undefined && lat !== null) p.set('lat', lat);
            if (lon !== undefined && lon !== null) p.set('lon', lon);
            if (fuel) p.set('fuel', fuel);
            if (open) p.set('open', open);
            if (offset) p.set('offset', offset);
            if (limit) p.set('limit', limit);
            try {
                return await request('/stations/search?' + p);
            } catch (e) {
                if (isOffline(e)) {
                    return OfflineEngine.search(params);
                }
                throw e;
            }
        },
        suggestPlaces: async (q) => {
            try {
                return await request('/stations/suggest-places?q=' + encodeURIComponent(q));
            } catch (e) {
                if (isOffline(e)) {
                    return { places: await OfflineEngine.suggestPlaces(q) };
                }
                throw e;
            }
        },
        bbox: async (params, signal) => {
            const { north, south, east, west, fuel, open } = params;
            const p = new URLSearchParams({ north, south, east, west });
            if (fuel) p.set('fuel', fuel);
            if (open) p.set('open', open);
            try {
                return await request('/stations/bbox?' + p, signal);
            } catch (e) {
                if (isOffline(e)) {
                    return OfflineEngine.bbox(params);
                }
                throw e;
            }
        },
        station: async (ideess) => {
            try {
                return await request('/stations/' + encodeURIComponent(ideess));
            } catch (e) {
                if (isOffline(e)) {
                    const station = await OfflineEngine.station(ideess);
                    if (!station) {
                        throw new Error('Gasolinera no encontrada en los datos sin conexión');
                    }
                    return station;
                }
                throw e;
            }
        },
        history: async (ideess, fuel, from, to, group = 'day') => {
            try {
                return await request('/stations/' + encodeURIComponent(ideess) + '/history?fuel=' + fuel + '&from=' + from + '&to=' + to + '&group=' + group);
            } catch (e) {
                if (isOffline(e)) {
                    return { serie: [], offline: true };
                }
                throw e;
            }
        },
        zoneComparison: async (ideess, fuel) => request('/stations/' + encodeURIComponent(ideess) + '/zone-comparison?fuel=' + fuel),
        nationalStats: async (fuel, from, to, group = 'day') => request('/stats/national?fuel=' + fuel + '&from=' + from + '&to=' + to + '&group=' + group),
        statsByFuel: async (from, to, group = 'day') => request('/stats/by-fuel?from=' + from + '&to=' + to + '&group=' + group),
        statsByProvince: async (fuel) => request('/stats/by-province?fuel=' + fuel),
        priceDistribution: async (fuel) => request('/stats/price-distribution?fuel=' + fuel),
    };
})();
