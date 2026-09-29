const GPMapGuard = (() => {
    const WHEEL_STEP_MS = 250;

    function createShield(wrap) {
        const shield = document.createElement('button');
        shield.type = 'button';
        shield.className = 'map-shield';
        const label = document.createElement('span');
        label.textContent = 'Toca para mover el mapa';
        shield.appendChild(label);
        wrap.appendChild(shield);
        return shield;
    }

    function guardTouch(wrap) {
        const shield = createShield(wrap);
        const coarse = window.matchMedia('(pointer: coarse)');

        function sync() {
            shield.hidden = !coarse.matches;
        }

        shield.addEventListener('click', () => {
            shield.hidden = true;
        });
        document.addEventListener('touchstart', (event) => {
            if (coarse.matches && !wrap.contains(event.target)) {
                shield.hidden = false;
            }
        }, { passive: true });
        coarse.addEventListener('change', sync);
        sync();
    }

    function guardWheel(map, container) {
        let last = 0;
        map.scrollWheelZoom.disable();
        container.addEventListener('wheel', (event) => {
            if (!event.ctrlKey && !event.metaKey) {
                return;
            }
            event.preventDefault();
            const now = Date.now();
            if (now - last < WHEEL_STEP_MS) {
                return;
            }
            last = now;
            if (event.deltaY < 0) {
                map.zoomIn();
            } else {
                map.zoomOut();
            }
        }, { passive: false });
    }

    function install(map) {
        const container = map.getContainer();
        const wrap = document.createElement('div');
        wrap.className = 'map-guard-wrap';
        container.parentNode.insertBefore(wrap, container);
        wrap.appendChild(container);
        map.invalidateSize();
        guardWheel(map, container);
        guardTouch(wrap);
    }

    return { install };
})();
