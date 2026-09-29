(function (root) {
    const PAGE = 100;
    const FUELS = ['gasoleo_a', 'gasolina_95_e5'];
    const CENTERS = [
        { name: 'Bilbao', lat: 43.263, lon: -2.935 },
        { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
        { name: 'Sevilla', lat: 37.3891, lon: -5.9845 },
        { name: 'Soria', lat: 41.7664, lon: -2.479 },
    ];
    const QUERIES = [
        { q: 'repsol', place: false },
        { q: 'plaza', place: false },
        { q: 'getxo', place: true },
        { q: '48001', place: true },
    ];
    const DISTANCE_TOLERANCE_KM = 0.02;

    async function collectPages(fetchPage) {
        const items = [];
        for (let offset = 0; offset < 5000; offset += PAGE) {
            const page = await fetchPage(offset, PAGE);
            items.push(...page.stations);
            if (!page.hasMore || page.stations.length === 0) {
                break;
            }
        }
        return items;
    }

    function ids(items) {
        return new Set(items.map((item) => String(item.ideess)));
    }

    function difference(a, b) {
        return [...a].filter((id) => !b.has(id));
    }

    function compareSets(label, js, php, failures) {
        const jsIds = ids(js);
        const phpIds = ids(php);
        const onlyJs = difference(jsIds, phpIds);
        const onlyPhp = difference(phpIds, jsIds);
        if (onlyJs.length || onlyPhp.length) {
            failures.push(`${label}: solo JS ${onlyJs.length} [${onlyJs.slice(0, 3)}], solo PHP ${onlyPhp.length} [${onlyPhp.slice(0, 3)}], JS ${jsIds.size} / PHP ${phpIds.size}`);
        }
    }

    function comparePriceOrder(label, js, php, fuel, failures) {
        const a = js.map((item) => item.precios[fuel]);
        const b = php.map((item) => item.precios[fuel]);
        const length = Math.min(a.length, b.length);
        for (let i = 0; i < length; i++) {
            if (a[i] !== b[i]) {
                failures.push(`${label}: el orden por precio difiere en la posicion ${i} (JS ${a[i]} / PHP ${b[i]})`);
                return;
            }
        }
    }

    function compareDistanceOrder(label, js, php, failures) {
        const length = Math.min(js.length, php.length);
        for (let i = 0; i < length; i++) {
            if (Math.abs(js[i].distanciaKm - php[i].distanciaKm) > DISTANCE_TOLERANCE_KM) {
                failures.push(`${label}: el orden por distancia difiere en la posicion ${i} (JS ${js[i].distanciaKm} / PHP ${php[i].distanciaKm})`);
                return;
            }
        }
    }

    async function checkNear(engine, getJson, failures, counter) {
        for (const center of CENTERS) {
            for (const fuel of FUELS) {
                for (const sort of ['price', 'distance']) {
                    for (const open of ['', '24h']) {
                        const label = `near ${center.name} ${fuel} ${sort} ${open || 'todas'}`;
                        const js = (await engine.near({ lat: center.lat, lon: center.lon, radius: 5, sort, fuel, open, offset: 0, limit: 100000 })).stations;
                        const php = await collectPages((offset, limit) => getJson(`/api/stations/near?lat=${center.lat}&lon=${center.lon}&radius=5&sort=${sort}&fuel=${fuel}&open=${open}&offset=${offset}&limit=${limit}`));
                        counter.count++;
                        compareSets(label, js, php, failures);
                        if (sort === 'price') {
                            comparePriceOrder(label, js, php, fuel, failures);
                        } else {
                            compareDistanceOrder(label, js, php, failures);
                        }
                    }
                }
            }
        }
    }

    async function checkBbox(engine, getJson, failures, counter) {
        for (const center of CENTERS) {
            for (const fuel of FUELS) {
                const box = { north: center.lat + 0.04, south: center.lat - 0.04, east: center.lon + 0.06, west: center.lon - 0.06 };
                const label = `bbox ${center.name} ${fuel}`;
                const js = (await engine.bbox({ ...box, fuel, open: '' })).stations;
                const query = `north=${box.north}&south=${box.south}&east=${box.east}&west=${box.west}&fuel=${fuel}`;
                const php = (await getJson(`/api/stations/bbox?${query}`)).stations;
                counter.count++;
                compareSets(label, js, php, failures);
                const phpById = new Map(php.map((item) => [String(item.ideess), item]));
                for (const item of js) {
                    const other = phpById.get(String(item.ideess));
                    if (other && other.precio !== item.precio) {
                        failures.push(`${label}: precio distinto en ${item.ideess} (JS ${item.precio} / PHP ${other.precio})`);
                        break;
                    }
                }
            }
        }
    }

    async function checkSearch(engine, getJson, failures, counter) {
        const center = CENTERS[0];
        for (const { q, place } of QUERIES) {
            for (const fuel of FUELS) {
                const label = `search "${q}" ${fuel}`;
                const js = (await engine.search({ q, lat: center.lat, lon: center.lon, sort: 'price', fuel, open: '', offset: 0, limit: 100000 })).stations;
                const php = await collectPages((offset, limit) => getJson(`/api/stations/search?q=${encodeURIComponent(q)}&lat=${center.lat}&lon=${center.lon}&sort=price&fuel=${fuel}&offset=${offset}&limit=${limit}`));
                counter.count++;
                if (place) {
                    const missing = difference(ids(js), ids(php));
                    if (missing.length) {
                        failures.push(`${label}: el JS devuelve ${missing.length} que el PHP no [${missing.slice(0, 3)}]`);
                    }
                } else {
                    compareSets(label, js, php, failures);
                }
            }
        }
    }

    async function runParity(engine, getJson) {
        const failures = [];
        const counter = { count: 0 };
        await checkNear(engine, getJson, failures, counter);
        await checkBbox(engine, getJson, failures, counter);
        await checkSearch(engine, getJson, failures, counter);
        return { comparisons: counter.count, failures };
    }

    root.runParity = runParity;
})(globalThis);
