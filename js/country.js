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
    let requestedCountry = params.get('pais');
    const pathMatch = /^\/(pt|fr)(\/|$)/.exec(window.location.pathname);
    if (!requestedCountry && pathMatch) {
        requestedCountry = pathMatch[1];
    }
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

    const UI_LOCALES = { es: 'es-ES', pt: 'pt-PT', fr: 'fr-FR' };
    const uiLocale = UI_LOCALES[lang];
    let texts = {};
    if (dictionaries[lang].texts) {
        texts = dictionaries[lang].texts;
    }
    const patterns = [];
    if (dictionaries[lang].patterns) {
        Object.keys(dictionaries[lang].patterns).forEach((source) => {
            const names = [];
            const escaped = source.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\{(\w+)\}/g, (all, name) => {
                names.push(name);
                return '([\\s\\S]+?)';
            });
            patterns.push({ regex: new RegExp('^' + escaped + '$'), names, target: dictionaries[lang].patterns[source] });
        });
    }
    const missing = new Set();
    fuels.forEach((fuel) => {
        if (!Object.prototype.hasOwnProperty.call(texts, fuel.label.es)) {
            texts[fuel.label.es] = fuel.label[lang];
        }
    });

    function tr(source, vars) {
        let text = source;
        if (lang !== 'es') {
            const found = lookup(source);
            if (found !== undefined) {
                text = found;
            }
        }
        if (vars) {
            Object.keys(vars).forEach((name) => {
                text = text.split('{' + name + '}').join(vars[name]);
            });
        }
        return text;
    }

    function localize(text) {
        return text.split('{pais}').join(countries[code].name[lang]).split('{fuente}').join(config.source);
    }

    function lookup(source) {
        const direct = lookupExact(source);
        if (direct !== undefined) {
            return localize(direct);
        }
        const trailing = /^(.*?)(\s*[:·]\s*)$/.exec(source);
        if (trailing && trailing[1]) {
            const head = lookupExact(trailing[1]);
            if (head !== undefined) {
                return localize(head + trailing[2]);
            }
        }
        if (source.includes(' · ')) {
            let changed = false;
            const parts = source.split(' · ').map((part) => {
                const found = lookupExact(part);
                if (found === undefined) {
                    return part;
                }
                changed = true;
                return found;
            });
            if (changed) {
                return localize(parts.join(' · '));
            }
        }
        if (code !== 'es' && lang === 'es' && /España|Ministerio para la Transición Ecológica/.test(source)) {
            return source.split('España').join(config.name.es).split('Ministerio para la Transición Ecológica').join(config.source);
        }
        return undefined;
    }

    function lookupExact(source) {
        if (Object.prototype.hasOwnProperty.call(texts, source)) {
            return texts[source];
        }
        for (const pattern of patterns) {
            const match = pattern.regex.exec(source);
            if (match) {
                let out = pattern.target;
                pattern.names.forEach((name, i) => {
                    let value = match[i + 1];
                    const nested = lookup(value);
                    if (nested !== undefined) {
                        value = nested;
                    }
                    out = out.split('{' + name + '}').join(value);
                });
                return out;
            }
        }
        return undefined;
    }

    const translated = new WeakMap();
    const ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt', 'label'];

    function translateTextNode(node) {
        const value = node.nodeValue;
        if (translated.get(node) === value) {
            return;
        }
        const trimmed = value.trim();
        if (!trimmed || !/[a-záéíóúñ]/i.test(trimmed)) {
            return;
        }
        const found = lookup(trimmed);
        if (found === undefined) {
            missing.add(trimmed);
            return;
        }
        const start = value.indexOf(trimmed);
        const next = value.slice(0, start) + found + value.slice(start + trimmed.length);
        translated.set(node, next);
        node.nodeValue = next;
    }

    function translateAttributes(element) {
        ATTRIBUTES.forEach((name) => {
            const value = element.getAttribute(name);
            if (!value) {
                return;
            }
            const found = lookup(value.trim());
            if (found !== undefined) {
                element.setAttribute(name, found);
            } else if (/[a-záéíóúñ]/i.test(value)) {
                missing.add(value.trim());
            }
        });
    }

    function translateTree(root) {
        if (root.nodeType === Node.TEXT_NODE) {
            translateTextNode(root);
            return;
        }
        if (root.nodeType !== Node.ELEMENT_NODE || root.closest('script, style, textarea')) {
            return;
        }
        translateAttributes(root);
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (node.nodeType === Node.ELEMENT_NODE && /^(SCRIPT|STYLE|TEXTAREA)$/.test(node.tagName)) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        let node = walker.nextNode();
        while (node) {
            if (node.nodeType === Node.TEXT_NODE) {
                translateTextNode(node);
            } else {
                translateAttributes(node);
            }
            node = walker.nextNode();
        }
    }

    function watchPage() {
        translateTree(document.body);
        const titleNode = document.querySelector('title');
        if (titleNode) {
            translateTree(titleNode);
        }
        new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(translateTree);
                } else if (mutation.type === 'characterData') {
                    translateTextNode(mutation.target);
                } else if (mutation.type === 'attributes') {
                    translateAttributes(mutation.target);
                }
            }
        }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRIBUTES });
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
        if (!window.Capacitor && pathMatch && nextCountry === code) {
            url.pathname = '/' + code;
        } else {
            url.pathname = '/';
            url.searchParams.set('pais', nextCountry);
        }
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
            if (!window.Capacitor && card.dataset.country !== 'es') {
                card.setAttribute('href', '/' + card.dataset.country);
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

    function fillFuelSelects() {
        document.querySelectorAll('select').forEach((select) => {
            if (select.id === 'vehicle-fuel') {
                return;
            }
            const options = [...select.options].filter((option) => fuelBySlug[option.value]);
            if (options.length < 3) {
                return;
            }
            const present = new Set();
            options.forEach((option) => {
                const fuel = fuelBySlug[option.value];
                if (!fuel.sources[code]) {
                    option.remove();
                    return;
                }
                option.textContent = fuel.label[lang];
                present.add(fuel.slug);
            });
            fuels.forEach((fuel) => {
                if (fuel.sources[code] && !present.has(fuel.slug)) {
                    const option = document.createElement('option');
                    option.value = fuel.slug;
                    option.textContent = fuel.label[lang];
                    select.appendChild(option);
                }
            });
            select.querySelectorAll('optgroup').forEach((group) => {
                if (!group.children.length) {
                    group.remove();
                }
            });
        });
    }

    fillFuelSelects();
    if (lang !== 'es' || code !== 'es') {
        applyTranslations();
        watchPage();
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
        tr,
        uiLocale,
        missing: () => [...missing].sort(),
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
