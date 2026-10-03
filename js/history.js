const GPHistory = (() => {
    const $ = (id) => document.getElementById(id);
    const el = {
        dialog: $('history-dialog'),
        close: $('history-close'),
        from: $('history-from'),
        to: $('history-to'),
        summary: $('history-summary'),
        list: $('history-list'),
        more: $('history-more'),
        kinds: document.querySelectorAll('[data-history-kind]'),
        presets: document.querySelectorAll('[data-history-days]'),
    };

    const PAGE_SIZE = 20;
    const DEFAULT_DAYS = 30;

    const state = {
        kind: 'trips',
        offset: 0,
        total: 0,
        refuels: null,
        loading: false,
    };

    function localDate(date) {
        const pad = (value) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function daysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return localDate(date);
    }

    function setRange(days) {
        el.to.value = localDate(new Date());
        el.from.value = '';
        if (days > 0) {
            el.from.value = daysAgo(days);
        }
    }

    function bounds() {
        let from = '0000';
        let to = '9999';
        if (el.from.value) {
            from = new Date(el.from.value + 'T00:00:00').toISOString();
        }
        if (el.to.value) {
            to = new Date(el.to.value + 'T23:59:59.999').toISOString();
        }
        return { from, to };
    }

    function plural(count, one, many) {
        let word = many;
        if (count === 1) {
            word = one;
        }
        return `${count.toLocaleString('es-ES')} ${word}`;
    }

    function periodText() {
        if (el.from.value && el.to.value) {
            return ` entre el ${el.from.value.split('-').reverse().join('/')} y el ${el.to.value.split('-').reverse().join('/')}`;
        }
        if (el.to.value) {
            return ` hasta el ${el.to.value.split('-').reverse().join('/')}`;
        }
        return '';
    }

    async function loadTripsPage(reset) {
        const { from, to } = bounds();
        if (reset) {
            state.total = await GarageStore.trips.countBetween(from, to);
            el.summary.textContent = plural(state.total, 'viaje', 'viajes') + periodText() + '.';
        }
        const [trips, names] = await Promise.all([
            GarageStore.trips.between(from, to, state.offset, PAGE_SIZE),
            GPTrips.vehicleNames(),
        ]);
        for (const trip of trips) {
            el.list.appendChild(GPTrips.tripItem(trip, names));
        }
        state.offset += trips.length;
    }

    function loadRefuelsPage(reset) {
        if (reset) {
            const { from, to } = bounds();
            state.refuels = GPGarage.refuelHistory(from, to);
            state.total = state.refuels.list.length;
            const spent = state.refuels.list.reduce((sum, refuel) => sum + refuel.total, 0);
            el.summary.textContent = plural(state.total, 'repostaje', 'repostajes') + periodText()
                + ` · ${spent.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €.`;
        }
        const page = state.refuels.list.slice(state.offset, state.offset + PAGE_SIZE);
        for (const refuel of page) {
            el.list.appendChild(state.refuels.build(refuel));
        }
        state.offset += page.length;
    }

    async function load(reset) {
        if (state.loading) {
            return;
        }
        state.loading = true;
        el.more.disabled = true;
        try {
            if (reset) {
                state.offset = 0;
                el.list.innerHTML = '';
            }
            if (state.kind === 'trips') {
                await loadTripsPage(reset);
            } else {
                loadRefuelsPage(reset);
            }
            el.more.hidden = state.offset >= state.total;
            el.more.textContent = `Cargar más (${(state.total - state.offset).toLocaleString('es-ES')} restantes)`;
        } catch (error) {
            el.summary.textContent = 'No se pudo leer el historial: ' + error.message;
        } finally {
            state.loading = false;
            el.more.disabled = false;
        }
    }

    function setKind(kind) {
        state.kind = kind;
        el.kinds.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.historyKind === kind)));
    }

    function open(kind) {
        setKind(kind);
        if (!el.to.value) {
            setRange(DEFAULT_DAYS);
        }
        if (!el.dialog.open) {
            el.dialog.showModal();
        }
        load(true);
    }

    el.kinds.forEach((button) => button.addEventListener('click', () => {
        setKind(button.dataset.historyKind);
        load(true);
    }));
    el.presets.forEach((button) => button.addEventListener('click', () => {
        setRange(Number(button.dataset.historyDays));
        load(true);
    }));
    [el.from, el.to].forEach((input) => input.addEventListener('change', () => load(true)));
    el.more.addEventListener('click', () => load(false));
    el.close.addEventListener('click', () => el.dialog.close());
    el.dialog.addEventListener('click', (event) => {
        if (event.target === el.dialog) {
            el.dialog.close();
        }
    });
    document.addEventListener('gp:history-refresh', () => {
        if (el.dialog.open) {
            load(true);
        }
    });

    return { open };
})();
