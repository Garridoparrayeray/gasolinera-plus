const GPCountry = (() => {
    const COUNTRY_KEY = 'gasolinera_pais';
    const LANG_KEY = 'gasolinera_idioma';
    const LANGS = ['es', 'pt', 'fr'];
    const countries = window.GP_COUNTRIES;
    const dictionaries = window.GP_I18N;
    const fuels = window.GP_FUELS;
    const fuelBySlug = {};
    fuels.forEach((fuel) => {
        fuelBySlug[fuel.slug] = fuel;
    });

    function stored(key) {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            return null;
        }
    }

    function store(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            return;
        }
    }

    const params = new URLSearchParams(window.location.search);

    let code = 'es';
    const requestedCountry = params.get('pais');
    const storedCountry = stored(COUNTRY_KEY);
    if (requestedCountry && countries[requestedCountry]) {
        code = requestedCountry;
        store(COUNTRY_KEY, code);
    } else if (storedCountry && countries[storedCountry]) {
        code = storedCountry;
    }
    const config = countries[code];

    let lang = config.lang;
    const requestedLang = params.get('lang');
    const storedLang = stored(LANG_KEY + '_' + code);
    if (requestedLang && LANGS.includes(requestedLang)) {
        lang = requestedLang;
        store(LANG_KEY + '_' + code, lang);
    } else if (storedLang && LANGS.includes(storedLang)) {
        lang = storedLang;
    }

    function t(key, vars) {
        let text = dictionaries[lang][key];
        if (text === undefined) {
            text = dictionaries.es[key];
        }
        if (text === undefined) {
            return key;
        }
        if (vars) {
            Object.keys(vars).forEach((name) => {
                text = text.split('{' + name + '}').join(vars[name]);
            });
        }
        return text;
    }

    function applyTranslations(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-i18n]').forEach((node) => {
            node.textContent = t(node.getAttribute('data-i18n'));
        });
        scope.querySelectorAll('[data-i18n-html]').forEach((node) => {
            node.innerHTML = t(node.getAttribute('data-i18n-html'));
        });
        scope.querySelectorAll('[data-i18n-attr]').forEach((node) => {
            node.getAttribute('data-i18n-attr').split(',').forEach((pair) => {
                const [attr, key] = pair.split(':');
                node.setAttribute(attr.trim(), t(key.trim()));
            });
        });
        document.documentElement.setAttribute('lang', lang);
    }

    function fuelLabel(slug) {
        const fuel = fuelBySlug[slug];
        if (!fuel) {
            return slug;
        }
        return fuel.label[lang];
    }

    function fuelShort(slug) {
        const fuel = fuelBySlug[slug];
        if (fuel && fuel.short) {
            return fuel.short[lang];
        }
        return fuelLabel(slug);
    }

    function fuelUnit(slug) {
        const fuel = fuelBySlug[slug];
        if (fuel) {
            return fuel.unit;
        }
        return 'L';
    }

    function countryName(other) {
        return countries[other].name[lang];
    }

    function label(name) {
        return config.labels[name][lang];
    }

    function apiQuery(path, other) {
        let target = code;
        if (other) {
            target = other;
        }
        if (target === 'es') {
            return path;
        }
        let joiner = '?';
        if (path.includes('?')) {
            joiner = '&';
        }
        return path + joiner + 'pais=' + target;
    }

    function liteUrl() {
        return '/' + config.lite;
    }

    function liteUrlFor(other) {
        return '/' + countries[other].lite;
    }

    function storageKey(base) {
        if (code === 'es') {
            return base;
        }
        return base + '_' + code;
    }

    function stationKey(ideess) {
        if (code === 'es') {
            return String(ideess);
        }
        return code + ':' + ideess;
    }

    function go(nextCountry, nextLang) {
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('pais', nextCountry);
        if (nextLang) {
            url.searchParams.set('lang', nextLang);
        }
        window.location.href = url.pathname + url.search;
    }

    function setLang(nextLang) {
        go(code, nextLang);
    }

    function setCountry(nextCountry) {
        go(nextCountry, null);
    }

    function formatNumber(value, digits) {
        return value.toLocaleString(config.locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    }

    function wireHeader() {
        const button = document.getElementById('home-link');
        const nav = document.getElementById('country-switcher');
        if (!button || !nav) {
            return;
        }
        if (code !== 'es') {
            document.getElementById('app-title-country').textContent = config.native.toUpperCase();
        }
        nav.querySelectorAll('.country-card').forEach((card) => {
            if (card.dataset.country === code) {
                card.setAttribute('aria-current', 'page');
            }
        });
        nav.querySelectorAll('[data-lang]').forEach((choice) => {
            choice.setAttribute('aria-pressed', String(choice.dataset.lang === lang));
            choice.addEventListener('click', () => {
                if (choice.dataset.lang !== lang) {
                    setLang(choice.dataset.lang);
                }
            });
        });
        const close = () => {
            nav.classList.remove('open');
            button.setAttribute('aria-expanded', 'false');
        };
        button.addEventListener('click', () => {
            const open = nav.classList.toggle('open');
            button.setAttribute('aria-expanded', String(open));
        });
        document.addEventListener('click', (event) => {
            if (!button.contains(event.target) && !nav.contains(event.target)) {
                close();
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && nav.classList.contains('open')) {
                close();
                button.focus();
            }
        });
    }

    if (lang !== 'es') {
        applyTranslations();
    }
    wireHeader();

    return {
        code,
        lang,
        config,
        countries,
        fuels,
        locale: config.locale,
        t,
        applyTranslations,
        fuelLabel,
        fuelShort,
        fuelUnit,
        countryName,
        label,
        apiQuery,
        liteUrl,
        liteUrlFor,
        storageKey,
        stationKey,
        setLang,
        setCountry,
        formatNumber,
    };
})();
