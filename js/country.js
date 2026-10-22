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
            let found = lookupExact(source);
            if (found === undefined) {
                found = lookup(source);
            }
            if (found !== undefined) {
                text = found;
            }
        }
        if (vars) {
            Object.keys(vars).forEach((name) => {
                text = text.split('{' + name + '}').join(vars[name]);
            });
        }
        return localize(text);
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
            const place = document.getElementById('app-title-country');
            place.textContent = config.native;
            const fit = () => {
                const title = document.getElementById('app-title').getBoundingClientRect().width;
                const plus = document.querySelector('#app-title .plus').getBoundingClientRect().width;
                place.style.width = Math.max(0, title - plus) + 'px';
            };
            fit();
            if (document.fonts) {
                document.fonts.ready.then(fit);
            }
            window.addEventListener('resize', fit);
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

    const HOURS_TEXT = {
        es: { to: ' a ', and: ' y ', h24: '24 horas', closed: 'cerrado', every: 'Todos los días', days: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] },
        pt: { to: ' a ', and: ' e ', h24: '24 horas', closed: 'fechado', every: 'Todos os dias', days: ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'] },
        fr: { to: ' au ', and: ' et ', h24: '24 h/24', closed: 'fermé', every: 'Tous les jours', days: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] },
    };

    function pad(value) {
        return String(value).padStart(2, '0');
    }

    function parseHours(raw) {
        const text = String(raw || '').toUpperCase().trim();
        if (!text) {
            return null;
        }
        const codes = 'LMXJVSD';
        const perDay = [null, null, null, null, null, null, null];
        for (const block of text.split(';')) {
            const part = block.trim();
            if (!part) {
                continue;
            }
            const match = /^([LMXJVSD])(-([LMXJVSD]))?\s*[:]\s*(.+)$/.exec(part);
            if (!match) {
                return null;
            }
            const from = codes.indexOf(match[1]);
            let to = from;
            if (match[3]) {
                to = codes.indexOf(match[3]);
            }
            const spans = [];
            for (const span of match[4].split(/\s+Y\s+/)) {
                const trimmed = span.trim();
                if (trimmed === '24H' || trimmed === '24 H') {
                    spans.push('24H');
                    continue;
                }
                const range = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/.exec(trimmed);
                if (!range) {
                    return null;
                }
                spans.push(pad(range[1]) + ':' + range[2] + '–' + pad(range[3]) + ':' + range[4]);
            }
            let day = from;
            for (let step = 0; step < 7; step++) {
                perDay[day] = spans;
                if (day === to) {
                    break;
                }
                day = (day + 1) % 7;
            }
        }
        return perDay;
    }

    function capitalize(text) {
        return text.charAt(0).toUpperCase() + text.slice(1);
    }

    function weeklyHours(raw) {
        const perDay = parseHours(raw);
        if (!perDay || perDay.every((spans) => spans === null)) {
            return [];
        }
        if (perDay.every((spans) => spans !== null && spans.length === 1 && spans[0] === '24H')) {
            return [];
        }
        const words = HOURS_TEXT[lang];
        const keyOf = (spans) => {
            if (spans === null) {
                return 'closed';
            }
            return spans.join('|');
        };
        const lines = [];
        let day = 0;
        while (day < 7) {
            let last = day;
            while (last + 1 < 7 && keyOf(perDay[last + 1]) === keyOf(perDay[day])) {
                last++;
            }
            let label = capitalize(words.days[day]);
            if (day === 0 && last === 6) {
                label = words.every;
            } else if (last === day + 1) {
                label = capitalize(words.days[day]) + words.and + words.days[last];
            } else if (last > day + 1) {
                label = capitalize(words.days[day]) + words.to + words.days[last];
            }
            let value = words.closed;
            if (perDay[day] !== null) {
                value = perDay[day].map((span) => {
                    if (span === '24H') {
                        return words.h24;
                    }
                    return span;
                }).join(words.and);
            }
            lines.push({ label, value });
            day = last + 1;
        }
        return lines;
    }

    function fuelColor(slug) {
        const fuel = fuelBySlug[slug];
        if (fuel && fuel.color) {
            return fuel.color;
        }
        return '#8A8A8A';
    }

    function fillFuelSelect(select, scope, exclude) {
        const previous = select.value;
        const available = fuels.filter((fuel) => {
            if (exclude.includes(fuel.slug)) {
                return false;
            }
            if (scope === 'all') {
                return true;
            }
            return Boolean(fuel.sources[code]);
        });
        let mainSlugs = available.filter((fuel) => fuel.group === 'main').map((fuel) => fuel.slug);
        if (scope === 'country') {
            mainSlugs = config.mainFuels.filter((slug) => available.some((fuel) => fuel.slug === slug));
        }
        select.innerHTML = '';
        const add = (parent, fuel) => {
            const option = document.createElement('option');
            option.value = fuel.slug;
            option.textContent = fuel.label[lang];
            parent.appendChild(option);
        };
        mainSlugs.forEach((slug) => add(select, fuelBySlug[slug]));
        const groups = [
            ['other', 'Otras gasolinas y gasóleos'],
            ['alt', 'Alternativos y renovables'],
        ];
        groups.forEach(([name, title]) => {
            const members = available.filter((fuel) => !mainSlugs.includes(fuel.slug) && (fuel.group === name || (name === 'other' && fuel.group === 'main')));
            if (!members.length) {
                return;
            }
            const group = document.createElement('optgroup');
            group.label = tr(title);
            members.forEach((fuel) => add(group, fuel));
            select.appendChild(group);
        });
        if (previous && [...select.options].some((option) => option.value === previous)) {
            select.value = previous;
        }
    }

    function fillFuelSelects() {
        ['filter-fuel', 'stats-fuel'].forEach((id) => {
            const select = document.getElementById(id);
            if (select) {
                fillFuelSelect(select, 'country', []);
            }
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
        fuelColor,
        fillFuelSelect,
        weeklyHours,
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
