const GPPermissions = (() => {
    const list = document.getElementById('permissions-list');
    const note = document.getElementById('permissions-note');

    function recorder() {
        return GPNative.plugin('TripRecorder');
    }

    function say(text) {
        note.textContent = text;
        note.hidden = text === '';
    }

    function row(title, status, detail, buttons, kind) {
        const item = document.createElement('li');
        const head = document.createElement('div');
        head.className = 'permission-head';
        const name = document.createElement('strong');
        name.textContent = title;
        head.appendChild(name);
        if (status) {
            const state = document.createElement('span');
            state.className = 'permission-state';
            if (kind) {
                state.classList.add('permission-state--' + kind);
            }
            state.textContent = status;
            head.appendChild(state);
        }
        item.appendChild(head);
        const text = document.createElement('p');
        text.textContent = detail;
        item.appendChild(text);
        const actions = document.createElement('div');
        actions.className = 'permission-actions';
        for (const [label, handler] of buttons) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'pill';
            button.textContent = label;
            button.addEventListener('click', async () => {
                button.disabled = true;
                try {
                    await handler();
                } finally {
                    setTimeout(render, 600);
                }
            });
            actions.appendChild(button);
        }
        if (buttons.length) {
            item.appendChild(actions);
        }
        return item;
    }

    async function openSystemSettings() {
        const plugin = recorder();
        if (plugin) {
            await plugin.openAppSettings();
            return;
        }
        say('En el navegador, pulsa el candado junto a la dirección web y cambia el permiso desde ahí.');
    }

    async function locationRow() {
        const permission = await GPNative.locationPermission();
        const active = GP.locationActive();
        if (permission === 'denied') {
            return row('Ubicación', 'Bloqueada', 'El sistema no deja usar tu ubicación. Puedes buscar por pueblo, calle o marca sin ella.', [['Abrir ajustes', openSystemSettings]], 'off');
        }
        if (active) {
            return row('Ubicación', 'Activada', 'Se usa para mostrar las gasolineras cercanas. Tus coordenadas no se guardan.', [['Desactivar', async () => GP.toggleLocation()]], 'on');
        }
        return row('Ubicación', 'Desactivada', 'Sin ella verás las más baratas de España. Actívala para ver las de tu zona.', [['Activar', async () => GP.toggleLocation()]], 'off');
    }

    function alertsRow() {
        const on = GP.alertsOn();
        let permission = '';
        if (typeof Notification !== 'undefined' && Notification.permission === 'denied' && !GPNative.isNative()) {
            permission = ' Las notificaciones están bloqueadas en el navegador.';
        }
        let browserNote = '';
        if (!GPNative.isNative()) {
            browserNote = ' En el navegador puede que las notificaciones no funcionen con la web cerrada; para recibirlas en segundo plano instala la app.';
        }
        if (on) {
            return row('Avisos de bajada de precio', 'Activados', 'Te avisamos como mucho una vez al día si baja el precio de tus favoritas.' + permission + browserNote, [['Desactivar', async () => say(await GP.setAlerts(false))]], 'on');
        }
        return row('Avisos de bajada de precio', 'Desactivados', 'Al activarlos se te pedirá permiso para enviar notificaciones.' + permission + browserNote, [['Activar', async () => say(await GP.setAlerts(true))]], 'off');
    }

    async function tripRows() {
        const plugin = recorder();
        if (!plugin) {
            return [];
        }
        let status;
        try {
            status = await plugin.status();
        } catch (error) {
            return [];
        }
        const rows = [];
        const perms = status.permissions;
        let autoText = 'Desactivada';
        let autoKind = 'off';
        if (status.autoDetect) {
            autoText = 'Activada';
            autoKind = 'on';
        }
        rows.push(row('Detección automática de viajes', autoText, 'Necesita la ubicación «todo el tiempo» y la actividad física. Se activa o desactiva en la sección Coche.', [['Ir a Coche', async () => GP.switchView('garage')], ['Abrir ajustes', openSystemSettings]], autoKind));
        if (GPNative.platform() === 'android') {
            // Android solo informa del ajuste estándar y muchos móviles tienen el suyo: no se afirma nada del estado.
            rows.push(row('Batería', '', 'Para que los viajes se graben con la app cerrada, desactiva el ahorro de batería para Gasolinera+ en los ajustes del móvil.', [['Abrir ajustes de batería', async () => plugin.openBatterySettings()]], ''));
        }
        return rows;
    }

    async function render() {
        if (!list) {
            return;
        }
        const rows = [await locationRow(), alertsRow(), ...(await tripRows())];
        list.innerHTML = '';
        for (const item of rows) {
            list.appendChild(item);
        }
    }

    document.addEventListener('gp:view', (event) => {
        if (event.detail === 'about') {
            say('');
            render();
        }
    });

    return { render };
})();
