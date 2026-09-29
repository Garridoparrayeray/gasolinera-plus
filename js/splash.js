const GPSplash = (() => {
    const root = document.documentElement;
    const SLOW_MS = 400;
    const MAX_MS = 8000;
    const FALLBACK_HIDE_MS = 1600;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let showTimer = null;
    let maxTimer = null;
    let pending = 0;
    let waiting = [];

    function hide() {
        clearTimeout(showTimer);
        clearTimeout(maxTimer);
        root.classList.remove('is-loading');
        const callbacks = waiting;
        waiting = [];
        for (const callback of callbacks) {
            callback();
        }
    }

    function whenHidden() {
        return new Promise((resolve) => {
            if (!root.classList.contains('is-loading')) {
                resolve();
                return;
            }
            waiting.push(resolve);
        });
    }

    function show() {
        if (reduceMotion.matches) {
            return;
        }
        root.classList.add('is-loading');
        clearTimeout(maxTimer);
        maxTimer = setTimeout(hide, MAX_MS);
    }

    function begin() {
        pending++;
        if (pending === 1) {
            clearTimeout(showTimer);
            showTimer = setTimeout(show, SLOW_MS);
        }
    }

    function end() {
        pending = Math.max(0, pending - 1);
        if (pending > 0) {
            return;
        }
        clearTimeout(showTimer);
        if (!root.classList.contains('is-loading')) {
            return;
        }
        const plus = document.querySelector('.splash__plus');
        if (!plus) {
            hide();
            return;
        }
        plus.addEventListener('animationiteration', hide, { once: true });
        setTimeout(hide, FALLBACK_HIDE_MS);
    }

    pending = 1;
    show();
    if (document.readyState === 'complete') {
        end();
    } else {
        window.addEventListener('load', end, { once: true });
    }

    return { begin, end, whenHidden };
})();

const GPSectionLoading = (() => {
    const SLOW_MS = 200;
    const pending = {};
    const timers = {};

    function banner(view, create) {
        let element = document.getElementById(`loading-${view}`);
        if (!element && create) {
            element = document.createElement('p');
            element.id = `loading-${view}`;
            element.className = 'view-loading';
            element.setAttribute('role', 'status');
            element.textContent = 'Cargando…';
            element.hidden = true;
            const host = document.getElementById(`view-${view}`);
            if (host) {
                host.prepend(element);
            } else {
                element.classList.add('view-loading--float');
                document.body.appendChild(element);
            }
        }
        return element;
    }

    function begin(view) {
        pending[view] = (pending[view] || 0) + 1;
        if (pending[view] === 1) {
            clearTimeout(timers[view]);
            timers[view] = setTimeout(() => {
                banner(view, true).hidden = false;
            }, SLOW_MS);
        }
    }

    function end(view) {
        pending[view] = Math.max(0, (pending[view] || 0) - 1);
        if (pending[view] > 0) {
            return;
        }
        clearTimeout(timers[view]);
        const element = banner(view, false);
        if (element) {
            element.hidden = true;
        }
    }

    async function track(view, promise) {
        begin(view);
        try {
            return await promise;
        } finally {
            end(view);
        }
    }

    return { begin, end, track };
})();
