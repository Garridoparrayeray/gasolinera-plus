const GPGarage = (() => {
    const $ = (id) => document.getElementById(id);
    const el = {
        empty: $('garage-empty'),
        main: $('garage-main'),
        addFirst: $('garage-add-first'),
        vehicles: $('garage-vehicles'),
        vehicleName: $('garage-vehicle-name'),
        vehicleFuel: $('garage-vehicle-fuel'),
        edit: $('garage-edit'),
        tankFill: $('garage-tank-fill'),
        tankText: $('garage-tank-text'),
        consumption: $('garage-consumption'),
        consumptionSource: $('garage-consumption-source'),
        costKm: $('garage-cost-km'),
        monthSpend: $('garage-month-spend'),
        odometerValue: $('garage-odometer-value'),
        refuelBtn: $('garage-refuel'),
        odometerBtn: $('garage-odometer'),
        consumptionChart: $('garage-consumption-chart'),
        consumptionNote: $('garage-consumption-note'),
        spendChart: $('garage-spend-chart'),
        priceChart: $('garage-price-chart'),
        savings: $('garage-savings'),
        savingsZone: $('garage-savings-zone'),
        compareList: $('garage-compare-list'),
        compareDay: $('garage-compare-day'),
        compareWeek: $('garage-compare-week'),
        compareMonth: $('garage-compare-month'),
        compareEmpty: $('garage-compare-empty'),
        stationSearch: $('refuel-station-search'),
        stationResults: $('refuel-station-results'),
        stationClear: $('refuel-station-clear'),
        refuels: $('garage-refuels'),
        refuelsEmpty: $('garage-refuels-empty'),
        backupIncludeTrips: $('backup-include-trips'),
        backupExport: $('backup-export'),
        backupImportBtn: $('backup-import-btn'),
        backupImport: $('backup-import'),
        backupNote: $('backup-note'),
        vehicleDialog: $('vehicle-dialog'),
        vehicleForm: $('vehicle-form'),
        vehicleDialogTitle: $('vehicle-dialog-title'),
        vehicleNameInput: $('vehicle-name'),
        vehicleFuelInput: $('vehicle-fuel'),
        vehicleTankInput: $('vehicle-tank'),
        vehicleTankLabel: $('vehicle-tank-label'),
        vehicleHomologatedInput: $('vehicle-homologated'),
        vehicleHomologatedLabel: $('vehicle-homologated-label'),
        vehicleOdometerInput: $('vehicle-odometer'),
        vehicleError: $('vehicle-error'),
        vehicleDelete: $('vehicle-delete'),
        vehicleCancel: $('vehicle-cancel'),
        refuelDialog: $('refuel-dialog'),
        refuelForm: $('refuel-form'),
        refuelStation: $('refuel-station'),
        refuelDate: $('refuel-date'),
        refuelOdometer: $('refuel-odometer'),
        refuelLiters: $('refuel-liters'),
        refuelLitersLabel: $('refuel-liters-label'),
        refuelPrice: $('refuel-price'),
        refuelPriceLabel: $('refuel-price-label'),
        refuelTotal: $('refuel-total'),
        refuelFull: $('refuel-full'),
        refuelMissed: $('refuel-missed'),
        refuelError: $('refuel-error'),
        refuelDelete: $('refuel-delete'),
        refuelCancel: $('refuel-cancel'),
        odometerDialog: $('odometer-dialog'),
        odometerForm: $('odometer-form'),
        odometerInput: $('odometer-value'),
        odometerError: $('odometer-error'),
        odometerCancel: $('odometer-cancel'),
        filterFuel: $('filter-fuel'),
    };

    const state = {
        loaded: false,
        vehicles: [],
        activeId: null,
        refuels: [],
        editingVehicle: null,
        editingRefuel: null,
        pendingStation: null,
        charts: {},
        nationalCache: {},
        compareMode: 'day',
        userLoc: null,
    };

    const MAX_PERIODS = 12;
    const REFERENCE_TIMEOUT_MS = 5000;
    const ZONE_RADIUS_KM = 10;
    const COMPARE_NOUN = { day: 'repostajes', week: 'semanas', month: 'meses' };

    const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

    function number(value, digits) {
        return value.toLocaleString('es-ES', { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function money(value) {
        return number(value, 2) + ' €';
    }

    function setMetric(element, value, unit) {
        element.textContent = value;
        const small = document.createElement('small');
        small.className = 'metric-unit';
        small.textContent = ' ' + unit;
        element.appendChild(small);
    }

    function unitOf(fuel) {
        return AlertsStore.unitFor(fuel);
    }

    function monthLabel(key) {
        const [year, month] = key.split('-');
        return `${MONTHS[Number(month) - 1]} ${year}`;
    }

    function shortDate(iso) {
        const [year, month, day] = GPFuel.madridDate(iso).split('-');
        return `${day}/${month}/${year}`;
    }

    function localInputValue(date) {
        const pad = (v) => String(v).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }

    function activeVehicle() {
        return state.vehicles.find((vehicle) => vehicle.id === state.activeId) || null;
    }

    function announceActive() {
        const vehicle = activeVehicle();
        if (vehicle) {
            document.dispatchEvent(new CustomEvent('gp:vehicle-active', { detail: { id: vehicle.id, fuel: vehicle.fuel } }));
        }
    }

    async function load() {
        const vehicles = await GarageStore.vehicles.list();
        state.vehicles = vehicles.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        let activeId = await GarageStore.setting('activeVehicleId', null);
        if (!state.vehicles.some((vehicle) => vehicle.id === activeId)) {
            activeId = null;
            if (state.vehicles.length) {
                activeId = state.vehicles[0].id;
            }
        }
        state.activeId = activeId;
        state.refuels = [];
        if (activeId) {
            state.refuels = await GarageStore.refuels.forVehicle(activeId);
        }
        state.loaded = true;
    }

    async function refresh() {
        await load();
        render();
    }

    function summary() {
        const vehicle = activeVehicle();
        if (!vehicle) {
            return null;
        }
        return GPFuel.summary(vehicle, state.refuels);
    }

    function render() {
        const vehicle = activeVehicle();
        el.empty.hidden = Boolean(vehicle);
        el.main.hidden = !vehicle;
        if (!vehicle) {
            return;
        }
        renderChips();
        const s = GPFuel.summary(vehicle, state.refuels);
        renderSummary(vehicle, s);
        renderRefuels(vehicle);
        renderCharts(vehicle);
    }

    function renderChips() {
        el.vehicles.innerHTML = '';
        for (const vehicle of state.vehicles) {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = 'pill';
            chip.setAttribute('role', 'tab');
            chip.setAttribute('aria-selected', String(vehicle.id === state.activeId));
            chip.textContent = vehicle.name;
            chip.addEventListener('click', () => setActive(vehicle.id));
            el.vehicles.appendChild(chip);
        }
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'pill';
        add.id = 'garage-add-vehicle';
        add.textContent = '+ Añadir coche';
        add.addEventListener('click', () => openVehicleDialog(null));
        el.vehicles.appendChild(add);
    }

    function renderSummary(vehicle, s) {
        const unit = unitOf(vehicle.fuel);
        el.vehicleName.textContent = vehicle.name;
        el.vehicleFuel.textContent = `${AlertsStore.labelFor(vehicle.fuel)} · depósito de ${number(vehicle.tankCapacity, 0)} ${unit}`;

        if (s.tankLiters === null) {
            el.tankFill.style.width = '0%';
            el.tankFill.dataset.level = 'unknown';
            el.tankText.textContent = 'Anota un repostaje con el depósito lleno para estimar lo que te queda.';
        } else {
            el.tankFill.style.width = `${Math.round(s.tankPercent)}%`;
            let level = 'ok';
            if (s.tankPercent < 15) {
                level = 'low';
            } else if (s.tankPercent < 35) {
                level = 'mid';
            }
            el.tankFill.dataset.level = level;
            el.tankText.textContent = `Quedan unos ${number(s.tankLiters, 0)} ${unit} (${Math.round(s.tankPercent)} %) · autonomía estimada de ${number(Math.max(0, s.autonomyKm), 0)} km`;
        }

        setMetric(el.consumption, number(s.avgConsumption, 1), `${unit}/100 km`);
        if (s.consumptionSource === 'real') {
            el.consumptionSource.textContent = `real, medido en ${number(s.trackedKm, 0)} km`;
        } else {
            el.consumptionSource.textContent = 'homologado, hasta tener dos llenos';
        }
        if (s.costPerKm === null) {
            el.costKm.textContent = '—';
        } else {
            setMetric(el.costKm, number(s.costPerKm, 3), '€/km');
        }
        const month = GPFuel.madridMonth(new Date().toISOString());
        setMetric(el.monthSpend, number(s.months[month] || 0, 2), '€');
        setMetric(el.odometerValue, number(s.odometer, 0), 'km');
    }

    function renderRefuels(vehicle) {
        const unit = unitOf(vehicle.fuel);
        const intervalsByEnd = new Map();
        for (const interval of GPFuel.intervals(state.refuels)) {
            intervalsByEnd.set(interval.to, interval);
        }
        const list = [...state.refuels].sort((a, b) => b.date.localeCompare(a.date));
        el.refuelsEmpty.hidden = list.length > 0;
        el.refuels.innerHTML = '';
        for (const refuel of list) {
            const li = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'garage-refuel-item';
            let kind = 'lleno';
            if (!refuel.full) {
                kind = 'parcial';
            }
            let consumption = '';
            const interval = intervalsByEnd.get(refuel.date);
            if (interval && !interval.suspicious) {
                consumption = ` · ${number(interval.lPer100, 1)} ${unit}/100 km`;
            } else if (interval) {
                consumption = ' · consumo raro, revisa los km';
            }
            let station = '';
            if (refuel.stationName) {
                station = ` · ${refuel.stationName}`;
            }
            button.innerHTML = `<strong></strong><small></small>`;
            button.querySelector('strong').textContent = `${shortDate(refuel.date)} · ${money(refuel.total)}`;
            button.querySelector('small').textContent = `${number(refuel.liters, 2)} ${unit} a ${number(refuel.pricePerUnit, 3)} €/${unit} · ${number(refuel.odometer, 0)} km · ${kind}${consumption}${station}`;
            button.addEventListener('click', () => openRefuelDialog(refuel, null));
            li.appendChild(button);
            el.refuels.appendChild(li);
        }
    }

    function replaceChart(key, canvas, config) {
        if (state.charts[key]) {
            state.charts[key].destroy();
            state.charts[key] = null;
        }
        if (typeof Chart === 'undefined') {
            return;
        }
        state.charts[key] = new Chart(canvas, config);
    }

    async function nationalByDate(fuel, from) {
        const key = `${fuel}|${from}`;
        if (state.nationalCache[key]) {
            return state.nationalCache[key];
        }
        const to = GPFuel.madridDate(new Date().toISOString());
        const byDate = {};
        try {
            const data = await Api.nationalStats(fuel, from, to);
            for (const point of data.serie) {
                byDate[point.fecha] = point.media;
            }
        } catch (e) {
            return byDate;
        }
        state.nationalCache[key] = byDate;
        return byDate;
    }

    function renderCharts(vehicle) {
        return GPSectionLoading.track('garage', renderChartsNow(vehicle));
    }

    async function renderChartsNow(vehicle) {
        const unit = unitOf(vehicle.fuel);
        const intervals = GPFuel.intervals(state.refuels).filter((interval) => !interval.suspicious);
        replaceChart('consumption', el.consumptionChart, {
            type: 'line',
            data: {
                labels: intervals.map((interval) => shortDate(interval.to).slice(0, 5)),
                datasets: [
                    {
                        label: `Real (${unit}/100 km)`,
                        data: intervals.map((interval) => +interval.lPer100.toFixed(2)),
                        borderColor: '#E8710A',
                        backgroundColor: 'rgba(232, 113, 10, 0.14)',
                        tension: 0.2,
                        fill: true,
                    },
                    {
                        label: 'Homologado',
                        data: intervals.map(() => vehicle.homologated),
                        borderColor: '#8A8A8A',
                        borderDash: [6, 4],
                        pointRadius: 0,
                    },
                ],
            },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } },
        });
        if (intervals.length) {
            el.consumptionNote.textContent = `Calculado con el método de lleno a lleno sobre ${intervals.length} tramos.`;
        } else {
            el.consumptionNote.textContent = 'Necesitas al menos dos repostajes con el depósito lleno para ver tu consumo real.';
        }

        const months = GPFuel.monthlySpend(state.refuels);
        replaceChart('spend', el.spendChart, {
            type: 'bar',
            data: {
                labels: Object.keys(months).map(monthLabel),
                datasets: [{ label: 'Gasto (€)', data: Object.values(months), backgroundColor: '#E8710A' }],
            },
            options: { responsive: true, plugins: { legend: { display: false } } },
        });

        const sortedRefuels = [...state.refuels].sort((a, b) => a.date.localeCompare(b.date));
        if (!sortedRefuels.length) {
            replaceChart('price', el.priceChart, { type: 'line', data: { labels: [], datasets: [] } });
            el.savings.textContent = '';
            el.savingsZone.textContent = '';
            el.compareList.innerHTML = '';
            updateCompareButtons();
            el.compareEmpty.hidden = false;
            el.priceChart.hidden = true;
            return;
        }
        el.compareEmpty.hidden = true;
        el.priceChart.hidden = false;
        await renderComparison(vehicle, sortedRefuels);
    }

    function hasCoords(refuel) {
        return typeof refuel.stationLat === 'number' && typeof refuel.stationLon === 'number';
    }

    async function refuelReferences(vehicle, refuel, nationalMap) {
        const date = GPFuel.madridDate(refuel.date);
        const refs = { national: null, zone: null };
        if (typeof refuel.nationalAvg === 'number') {
            refs.national = refuel.nationalAvg;
        }
        if (typeof refuel.zoneAvg === 'number') {
            refs.zone = refuel.zoneAvg;
        }
        const needsZone = refs.zone === null && hasCoords(refuel);
        if ((refs.national === null || needsZone) && GPPriceIndex.available()) {
            const ref = await GPPriceIndex.dayReference({ fuel: vehicle.fuel, date, lat: refuel.stationLat, lon: refuel.stationLon });
            if (ref && refs.national === null && ref.national) {
                refs.national = ref.national.avg;
            }
            if (ref && refs.zone === null && ref.zone) {
                refs.zone = ref.zone.avg;
            }
        }
        if (refs.national === null && typeof nationalMap[date] === 'number') {
            refs.national = nationalMap[date];
        }
        return refs;
    }

    async function dayRows(vehicle, sortedRefuels) {
        let nationalMap = {};
        if (!GPPriceIndex.available()) {
            nationalMap = await nationalByDate(vehicle.fuel, GPFuel.madridDate(sortedRefuels[0].date));
        }
        const rows = [];
        for (const refuel of sortedRefuels) {
            const refs = await refuelReferences(vehicle, refuel, nationalMap);
            rows.push({ label: shortDate(refuel.date).slice(0, 5), pricePerUnit: refuel.pricePerUnit, liters: refuel.liters, national: refs.national, zone: refs.zone });
        }
        return rows;
    }

    function groupByPeriod(sortedRefuels, kind) {
        const groups = new Map();
        for (const refuel of sortedRefuels) {
            const period = GPPriceIndexCore.periodOf(GPFuel.madridDate(refuel.date), kind);
            if (!groups.has(period.key)) {
                groups.set(period.key, { period, refuels: [] });
            }
            groups.get(period.key).refuels.push(refuel);
        }
        return [...groups.values()].slice(-MAX_PERIODS);
    }

    async function periodRows(vehicle, sortedRefuels, kind) {
        const rows = [];
        for (const group of groupByPeriod(sortedRefuels, kind)) {
            let liters = 0;
            let spent = 0;
            const points = [];
            for (const refuel of group.refuels) {
                liters += refuel.liters;
                spent += refuel.pricePerUnit * refuel.liters;
                if (hasCoords(refuel)) {
                    points.push({ lat: refuel.stationLat, lon: refuel.stationLon, liters: refuel.liters });
                }
            }
            const ref = await GPPriceIndex.periodReference({ fuel: vehicle.fuel, from: group.period.from, to: group.period.to, points });
            let zone = null;
            if (ref.zones.length) {
                let weighted = 0;
                let weight = 0;
                for (const entry of ref.zones) {
                    weighted += entry.avg * entry.liters;
                    weight += entry.liters;
                }
                zone = weighted / weight;
            }
            let national = null;
            if (ref.national) {
                national = ref.national.avg;
            }
            rows.push({ label: group.period.label, pricePerUnit: spent / liters, liters, national, zone });
        }
        return rows;
    }

    function chartLabel(label) {
        return label.split(' · ')[0];
    }

    function savingsText(saving, reference, noun, hook) {
        if (saving.amount >= 0) {
            return `${hook} ${money(saving.amount)} frente a ${reference} en ${saving.refuels} ${noun}.`;
        }
        return `Has pagado unos ${money(-saving.amount)} más que ${reference} en ${saving.refuels} ${noun}.`;
    }

    function differenceText(paid, reference, unit) {
        const diff = paid - reference;
        if (diff <= 0) {
            return `${number(-diff, 3)} € por debajo`;
        }
        return `${number(diff, 3)} € por encima (€/${unit})`;
    }

    function renderCompareList(vehicle, rows) {
        const unit = unitOf(vehicle.fuel);
        el.compareList.innerHTML = '';
        for (const row of [...rows].reverse()) {
            const item = document.createElement('li');
            const title = document.createElement('strong');
            title.textContent = row.label;
            item.appendChild(title);
            const lines = [`Pagaste ${number(row.pricePerUnit, 3)} €/${unit} de media · ${number(row.liters, 1)} ${unit}`];
            if (row.national !== null) {
                lines.push(`España ${number(row.national, 3)}: ${differenceText(row.pricePerUnit, row.national, unit)}`);
            }
            if (row.zone !== null) {
                lines.push(`Tu zona ${number(row.zone, 3)}: ${differenceText(row.pricePerUnit, row.zone, unit)}`);
            }
            for (const line of lines) {
                const small = document.createElement('small');
                small.textContent = line;
                item.appendChild(small);
            }
            el.compareList.appendChild(item);
        }
    }

    function drawComparison(vehicle, rows) {
        const datasets = [
            { label: 'Lo que pagaste', data: rows.map((row) => row.pricePerUnit), borderColor: '#E8710A', tension: 0.2 },
            { label: 'Media de España', data: rows.map((row) => row.national), borderColor: '#1D4E89', borderDash: [6, 4], spanGaps: true },
        ];
        if (rows.some((row) => row.zone !== null)) {
            datasets.push({ label: `Media de tu zona (${ZONE_RADIUS_KM} km)`, data: rows.map((row) => row.zone), borderColor: '#0F8B8D', borderDash: [2, 3], spanGaps: true });
        }
        replaceChart('price', el.priceChart, {
            type: 'line',
            data: { labels: rows.map((row) => chartLabel(row.label)), datasets },
            options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } } } },
        });

        const noun = COMPARE_NOUN[state.compareMode];
        const national = GPFuel.savingsBy(rows, (row) => row.national);
        const zone = GPFuel.savingsBy(rows, (row) => row.zone);
        el.savings.classList.toggle('is-saving', national.refuels > 0 && national.amount >= 0);
        if (!national.refuels) {
            el.savings.textContent = 'Sin datos de la media nacional para estas fechas.';
        } else if (national.amount >= 0) {
            el.savings.textContent = savingsText(national, 'la media de España', noun, 'Gracias a Gasolinera+ llevas ahorrados unos');
        } else {
            el.savings.textContent = savingsText(national, 'la media de España', noun, '') + ' Busca la más barata antes de repostar.';
        }
        if (zone.refuels) {
            el.savingsZone.textContent = savingsText(zone, `la media de tu zona (${ZONE_RADIUS_KM} km)`, noun, 'Llevas ahorrados unos');
        } else {
            el.savingsZone.textContent = 'Elige la gasolinera al anotar el repostaje para compararte también con tu zona.';
        }
        el.compareList.innerHTML = '';
        if (state.compareMode !== 'day') {
            renderCompareList(vehicle, rows);
        }
    }

    function updateCompareButtons() {
        const buttons = [['day', el.compareDay], ['week', el.compareWeek], ['month', el.compareMonth]];
        for (const [mode, button] of buttons) {
            button.setAttribute('aria-pressed', String(mode === state.compareMode));
        }
    }

    async function renderComparison(vehicle, sortedRefuels) {
        updateCompareButtons();
        if (state.compareMode !== 'day' && !GPPriceIndex.available()) {
            replaceChart('price', el.priceChart, { type: 'line', data: { labels: [], datasets: [] } });
            el.savings.classList.remove('is-saving');
            el.savings.textContent = 'La comparación por semanas y meses usa el histórico que guarda la app instalada.';
            el.savingsZone.textContent = '';
            el.compareList.innerHTML = '';
            return;
        }
        let rows;
        if (state.compareMode === 'day') {
            rows = await dayRows(vehicle, sortedRefuels);
        } else {
            rows = await periodRows(vehicle, sortedRefuels, state.compareMode);
        }
        drawComparison(vehicle, rows);
    }

    function withTimeout(promise, ms) {
        return Promise.race([promise, new Promise((resolve, reject) => setTimeout(() => reject(new Error('tiempo agotado')), ms))]);
    }

    async function loadReferences(refuel, fuel) {
        const date = GPFuel.madridDate(refuel.date);
        if (GPPriceIndex.available()) {
            const ref = await GPPriceIndex.dayReference({ fuel, date, lat: refuel.stationLat, lon: refuel.stationLon });
            if (ref && ref.national) {
                refuel.nationalAvg = ref.national.avg;
            }
            if (ref && ref.zone) {
                refuel.zoneAvg = ref.zone.avg;
                refuel.zoneRadiusKm = ZONE_RADIUS_KM;
            }
        }
        if (refuel.nationalAvg === null) {
            const map = await nationalByDate(fuel, date);
            if (typeof map[date] === 'number') {
                refuel.nationalAvg = map[date];
            }
        }
        if (refuel.zoneAvg === null && hasCoords(refuel)) {
            const zone = await Api.zoneAverage({ lat: refuel.stationLat, lon: refuel.stationLon, radius: ZONE_RADIUS_KM, fuel, date });
            refuel.zoneAvg = zone.media;
            refuel.zoneRadiusKm = zone.radioKm;
        }
    }

    async function attachReferences(refuel, fuel) {
        refuel.nationalAvg = null;
        refuel.zoneAvg = null;
        refuel.zoneRadiusKm = null;
        try {
            await withTimeout(loadReferences(refuel, fuel), REFERENCE_TIMEOUT_MS);
        } catch (error) {
            return;
        }
    }

    function applyStation(refuel, station) {
        refuel.stationId = null;
        refuel.stationName = null;
        refuel.stationLat = null;
        refuel.stationLon = null;
        if (!station) {
            return;
        }
        refuel.stationId = station.ideess;
        refuel.stationName = station.rotulo;
        if (typeof station.lat === 'number' && typeof station.lon === 'number') {
            refuel.stationLat = station.lat;
            refuel.stationLon = station.lon;
        }
    }

    async function setActive(id) {
        state.activeId = id;
        await GarageStore.saveSetting('activeVehicleId', id);
        await refresh();
        announceActive();
    }

    function fillFuelOptions() {
        if (el.vehicleFuelInput.options.length) {
            return;
        }
        el.vehicleFuelInput.innerHTML = el.filterFuel.innerHTML;
        for (const option of [...el.vehicleFuelInput.querySelectorAll('option')]) {
            if (option.value === 'adblue') {
                option.remove();
            }
        }
    }

    function updateVehicleUnits() {
        const unit = unitOf(el.vehicleFuelInput.value);
        el.vehicleTankLabel.textContent = `Capacidad del depósito (${unit})`;
        el.vehicleHomologatedLabel.textContent = `Consumo homologado (${unit}/100 km)`;
    }

    function showError(node, message) {
        node.textContent = message;
        node.hidden = message === '';
    }

    function openVehicleDialog(vehicle) {
        fillFuelOptions();
        state.editingVehicle = vehicle;
        showError(el.vehicleError, '');
        if (vehicle) {
            el.vehicleDialogTitle.textContent = 'Editar coche';
            el.vehicleNameInput.value = vehicle.name;
            el.vehicleFuelInput.value = vehicle.fuel;
            el.vehicleTankInput.value = vehicle.tankCapacity;
            el.vehicleHomologatedInput.value = vehicle.homologated;
            el.vehicleOdometerInput.value = vehicle.odometer;
            el.vehicleDelete.hidden = false;
        } else {
            el.vehicleDialogTitle.textContent = 'Añadir coche';
            el.vehicleForm.reset();
            el.vehicleFuelInput.value = el.filterFuel.value;
            if (!el.vehicleFuelInput.value) {
                el.vehicleFuelInput.value = 'gasoleo_a';
            }
            el.vehicleDelete.hidden = true;
        }
        updateVehicleUnits();
        el.vehicleDialog.showModal();
    }

    async function saveVehicle(event) {
        event.preventDefault();
        const name = el.vehicleNameInput.value.trim();
        const tank = Number(el.vehicleTankInput.value);
        const homologated = Number(el.vehicleHomologatedInput.value);
        const odometer = Math.round(Number(el.vehicleOdometerInput.value));
        if (!name) {
            showError(el.vehicleError, 'Ponle un nombre al coche.');
            return;
        }
        if (!(tank >= 5 && tank <= 300) || !(homologated >= 1 && homologated <= 40) || !(odometer >= 0)) {
            showError(el.vehicleError, 'Revisa el depósito, el consumo y los kilómetros.');
            return;
        }
        const now = new Date().toISOString();
        let vehicle = state.editingVehicle;
        if (vehicle) {
            vehicle = { ...vehicle, name, fuel: el.vehicleFuelInput.value, tankCapacity: tank, homologated, odometer, odometerAt: now, updatedAt: now };
        } else {
            vehicle = { id: GarageStore.newId(), name, fuel: el.vehicleFuelInput.value, tankCapacity: tank, homologated, odometer, odometerAt: now, createdAt: now, updatedAt: now };
        }
        await GarageStore.vehicles.save(vehicle);
        el.vehicleDialog.close();
        await setActive(vehicle.id);
        GP.showToast(`${vehicle.name} guardado`);
        if (state.pendingStation) {
            const station = state.pendingStation;
            state.pendingStation = null;
            openRefuelDialog(null, station);
        }
    }

    async function deleteVehicle() {
        const vehicle = state.editingVehicle;
        if (!vehicle || !window.confirm(`¿Borrar ${vehicle.name} con todos sus repostajes y viajes?`)) {
            return;
        }
        await GarageStore.vehicles.remove(vehicle.id);
        el.vehicleDialog.close();
        state.activeId = null;
        await GarageStore.saveSetting('activeVehicleId', null);
        await refresh();
        announceActive();
        GP.showToast('Coche borrado');
    }

    function stationPrice(station, fuel) {
        if (station && station.combustibles && station.combustibles[fuel]) {
            return station.combustibles[fuel].precio;
        }
        if (station && station.precios && typeof station.precios[fuel] === 'number') {
            return station.precios[fuel];
        }
        return null;
    }

    function showRefuelStation() {
        const station = state.refuelStation;
        el.stationClear.hidden = !station;
        if (!station) {
            el.refuelStation.hidden = true;
            return;
        }
        let where = `En ${station.rotulo}`;
        if (station.direccion) {
            where += ', ' + station.direccion;
        }
        el.refuelStation.textContent = where;
        el.refuelStation.hidden = false;
    }

    function renderStationResults(stations) {
        el.stationResults.innerHTML = '';
        for (const station of stations) {
            const item = document.createElement('li');
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = `${station.rotulo} · ${station.municipio}`;
            const small = document.createElement('small');
            small.textContent = station.direccion;
            button.appendChild(small);
            button.addEventListener('click', () => pickStation(station));
            item.appendChild(button);
            el.stationResults.appendChild(item);
        }
        el.stationResults.hidden = stations.length === 0;
    }

    async function searchStations() {
        const query = el.stationSearch.value.trim();
        const vehicle = activeVehicle();
        if (query.length < 3 || !vehicle) {
            el.stationResults.hidden = true;
            return;
        }
        const params = { q: query, sort: 'price', fuel: vehicle.fuel, limit: 6 };
        if (state.userLoc) {
            params.lat = state.userLoc.lat;
            params.lon = state.userLoc.lon;
            params.sort = 'distance';
        }
        try {
            const data = await Api.search(params);
            renderStationResults(data.stations);
        } catch (error) {
            el.stationResults.hidden = true;
        }
    }

    function pickStation(station) {
        state.refuelStation = station;
        const price = stationPrice(station, activeVehicle().fuel);
        if (price !== null) {
            el.refuelPrice.value = price;
        }
        el.stationSearch.value = '';
        el.stationResults.hidden = true;
        showRefuelStation();
    }

    function openRefuelDialog(refuel, station) {
        const vehicle = activeVehicle();
        if (!vehicle) {
            state.pendingStation = station;
            openVehicleDialog(null);
            GP.showToast('Primero añade tu coche');
            return;
        }
        const unit = unitOf(vehicle.fuel);
        state.editingRefuel = refuel;
        showError(el.refuelError, '');
        el.refuelLitersLabel.textContent = 'Litros';
        if (unit === 'kg') {
            el.refuelLitersLabel.textContent = 'Kilos';
        }
        el.refuelPriceLabel.textContent = `Precio (€/${unit})`;
        if (refuel) {
            el.refuelDate.value = localInputValue(new Date(refuel.date));
            el.refuelOdometer.value = refuel.odometer;
            el.refuelLiters.value = refuel.liters;
            el.refuelPrice.value = refuel.pricePerUnit;
            el.refuelTotal.value = refuel.total;
            el.refuelFull.checked = refuel.full;
            el.refuelMissed.checked = refuel.missedBefore;
            el.refuelDelete.hidden = false;
            state.refuelStation = null;
            if (refuel.stationId) {
                state.refuelStation = { ideess: refuel.stationId, rotulo: refuel.stationName, lat: refuel.stationLat, lon: refuel.stationLon };
            }
        } else {
            el.refuelForm.reset();
            el.refuelDate.value = localInputValue(new Date());
            el.refuelOdometer.value = GPFuel.summary(vehicle, state.refuels).odometer;
            el.refuelFull.checked = true;
            el.refuelMissed.checked = false;
            el.refuelDelete.hidden = true;
            state.refuelStation = station;
            const price = stationPrice(station, vehicle.fuel);
            if (price !== null) {
                el.refuelPrice.value = price;
            }
        }
        el.stationSearch.value = '';
        el.stationResults.hidden = true;
        showRefuelStation();
        el.refuelDialog.showModal();
    }

    function recomputeTotal() {
        const liters = Number(el.refuelLiters.value);
        const price = Number(el.refuelPrice.value);
        if (liters > 0 && price > 0) {
            el.refuelTotal.value = (liters * price).toFixed(2);
        }
    }

    function recomputeLiters() {
        const total = Number(el.refuelTotal.value);
        const price = Number(el.refuelPrice.value);
        if (total > 0 && price > 0) {
            el.refuelLiters.value = (total / price).toFixed(2);
        }
    }

    async function saveRefuel(event) {
        event.preventDefault();
        const vehicle = activeVehicle();
        const odometer = Math.round(Number(el.refuelOdometer.value));
        const liters = Number(el.refuelLiters.value);
        const price = Number(el.refuelPrice.value);
        const total = Number(el.refuelTotal.value);
        const date = new Date(el.refuelDate.value);
        if (Number.isNaN(date.getTime()) || !(liters > 0) || !(price > 0) || !(total > 0) || !(odometer >= 0)) {
            showError(el.refuelError, 'Revisa la fecha, los km y las cantidades.');
            return;
        }
        if (liters > vehicle.tankCapacity * 1.15) {
            let what = 'litros';
            if (unitOf(vehicle.fuel) === 'kg') {
                what = 'kilos';
            }
            showError(el.refuelError, `Son más ${what} de los que caben en el depósito (${vehicle.tankCapacity}).`);
            return;
        }
        const others = state.refuels.filter((r) => !state.editingRefuel || r.id !== state.editingRefuel.id);
        const iso = date.toISOString();
        const before = others.filter((r) => r.date < iso).sort((a, b) => b.date.localeCompare(a.date))[0];
        const after = others.filter((r) => r.date > iso).sort((a, b) => a.date.localeCompare(b.date))[0];
        if (before && odometer < before.odometer) {
            showError(el.refuelError, `Los km no pueden ser menos que en el repostaje anterior (${number(before.odometer, 0)} km).`);
            return;
        }
        if (after && odometer > after.odometer) {
            showError(el.refuelError, `Los km no pueden ser más que en el repostaje siguiente (${number(after.odometer, 0)} km).`);
            return;
        }
        let refuel = state.editingRefuel;
        const fields = {
            date: iso,
            odometer,
            liters,
            pricePerUnit: price,
            total: +total.toFixed(2),
            full: el.refuelFull.checked,
            missedBefore: el.refuelMissed.checked,
            updatedAt: new Date().toISOString(),
        };
        if (refuel) {
            refuel = { ...refuel, ...fields };
        } else {
            refuel = { id: GarageStore.newId(), vehicleId: vehicle.id, createdAt: fields.updatedAt, ...fields };
        }
        applyStation(refuel, state.refuelStation);
        await attachReferences(refuel, vehicle.fuel);
        await GarageStore.refuels.save(refuel);
        if (odometer > vehicle.odometer) {
            await GarageStore.vehicles.save({ ...vehicle, odometer, odometerAt: fields.updatedAt });
        }
        el.refuelDialog.close();
        await refresh();
        GP.showToast('Repostaje guardado');
    }

    async function deleteRefuel() {
        const refuel = state.editingRefuel;
        if (!refuel || !window.confirm('¿Borrar este repostaje?')) {
            return;
        }
        await GarageStore.refuels.remove(refuel.id);
        el.refuelDialog.close();
        await refresh();
    }

    function openOdometerDialog() {
        const vehicle = activeVehicle();
        showError(el.odometerError, '');
        el.odometerInput.value = GPFuel.summary(vehicle, state.refuels).odometer;
        el.odometerDialog.showModal();
    }

    async function saveOdometer(event) {
        event.preventDefault();
        const vehicle = activeVehicle();
        const value = Math.round(Number(el.odometerInput.value));
        const lastOdometer = Math.max(0, ...state.refuels.map((r) => r.odometer));
        if (!(value >= lastOdometer)) {
            showError(el.odometerError, `No puede ser menos que en tu último repostaje (${number(lastOdometer, 0)} km).`);
            return;
        }
        await GarageStore.vehicles.save({ ...vehicle, odometer: value, odometerAt: new Date().toISOString() });
        el.odometerDialog.close();
        await refresh();
    }

    function showBackupNote(message) {
        el.backupNote.textContent = message;
        el.backupNote.hidden = message === '';
    }

    async function exportBackup() {
        try {
            await GPBackup.exportBackup(el.backupIncludeTrips.checked);
            showBackupNote('Copia creada. Guárdala en un sitio seguro (Drive, correo…).');
        } catch (e) {
            showBackupNote('No se pudo crear la copia: ' + e.message);
        }
    }

    async function importBackup() {
        const file = el.backupImport.files[0];
        el.backupImport.value = '';
        if (!file) {
            return;
        }
        try {
            const counts = await GPBackup.importBackup(file);
            showBackupNote(`Importados ${counts.vehicles} coches, ${counts.refuels} repostajes y ${counts.trips} viajes.`);
            await refresh();
            announceActive();
        } catch (e) {
            showBackupNote('No se pudo importar: ' + e.message);
        }
    }

    el.addFirst.addEventListener('click', () => openVehicleDialog(null));
    el.edit.addEventListener('click', () => openVehicleDialog(activeVehicle()));
    el.vehicleForm.addEventListener('submit', saveVehicle);
    el.vehicleFuelInput.addEventListener('change', updateVehicleUnits);
    el.vehicleCancel.addEventListener('click', () => el.vehicleDialog.close());
    el.vehicleDelete.addEventListener('click', deleteVehicle);
    el.refuelBtn.addEventListener('click', () => openRefuelDialog(null, null));
    el.refuelForm.addEventListener('submit', saveRefuel);
    el.refuelLiters.addEventListener('input', recomputeTotal);
    el.refuelPrice.addEventListener('input', recomputeTotal);
    el.refuelTotal.addEventListener('input', recomputeLiters);
    el.refuelCancel.addEventListener('click', () => el.refuelDialog.close());
    el.refuelDelete.addEventListener('click', deleteRefuel);
    el.odometerBtn.addEventListener('click', openOdometerDialog);
    el.odometerForm.addEventListener('submit', saveOdometer);
    el.odometerCancel.addEventListener('click', () => el.odometerDialog.close());
    el.backupExport.addEventListener('click', exportBackup);
    el.backupImportBtn.addEventListener('click', () => el.backupImport.click());
    el.backupImport.addEventListener('change', importBackup);

    document.addEventListener('gp:view', (event) => {
        if (event.detail === 'garage') {
            refresh();
        }
    });
    document.addEventListener('gp:refuel-here', async (event) => {
        if (!state.loaded) {
            await load();
        }
        openRefuelDialog(null, event.detail);
    });

    load().then(() => {
        announceActive();
        if (GP.currentView() === 'garage') {
            render();
        }
    }).catch(() => {
        GP.showToast('No se pudo abrir tu garaje en este navegador');
    });

    return {
        refresh,
        activeVehicle,
        summary,
        reload: load,
    };
})();
