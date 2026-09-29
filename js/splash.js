const GPSplash = (() => {
    const root = document.documentElement;
    const SLOW_MS = 400;
    const MAX_MS = 8000;
    const FALLBACK_HIDE_MS = 1600;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let showTimer = null;
    let maxTimer = null;
    let pending = 0;

    function hide() {
        clearTimeout(showTimer);
        clearTimeout(maxTimer);
        root.classList.remove('is-loading');
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

    begin();
    if (document.readyState === 'complete') {
        end();
    } else {
        window.addEventListener('load', end, { once: true });
    }

    return { begin, end };
})();
