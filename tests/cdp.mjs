import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const BASE = (process.env.BASE_URL || 'http://localhost:8021').replace(/\/$/, '');
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const IGNORED_FAILURES = /_vercel|googleapis|gstatic|tile\.openstreetmap|unpkg|jsdelivr/;

export async function launch(port) {
    const chrome = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
    const profile = mkdtempSync(join(tmpdir(), 'gasolinera-tests-'));
    const flags = ['--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'];
    if (process.env.CI) {
        flags.unshift('--no-sandbox');
    }
    const browser = spawn(chrome, flags, { stdio: 'ignore' });

    let targets = null;
    for (let i = 0; i < 40 && !targets; i++) {
        await sleep(500);
        try {
            targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        } catch (e) {
            targets = null;
        }
    }
    if (!targets) {
        browser.kill();
        throw new Error('no se pudo conectar con el navegador');
    }

    const session = await attach(targets.find((t) => t.type === 'page').webSocketDebuggerUrl, () => browser.kill());
    return session;
}

export async function attach(wsUrl, onFinish = () => {}, base = BASE) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve) => { ws.onopen = resolve; });

    let nextId = 0;
    const pending = new Map();
    const problems = [];
    const results = [];
    const session = { where: '', problems, results, base };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.id && pending.has(message.id)) {
            pending.get(message.id)(message.result || { error: message.error });
            pending.delete(message.id);
            return;
        }
        if (message.method === 'Runtime.exceptionThrown') {
            const details = message.params.exceptionDetails;
            let text = details.text;
            if (details.exception && details.exception.description) {
                text = details.exception.description.split('\n')[0];
            }
            let origin = '';
            if (details.url) {
                origin = ` @ ${details.url.replace(session.base, '')}:${details.lineNumber}`;
            }
            problems.push(`[${session.where}] EXCEPCION ${text}${origin}`);
        }
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
            const parts = message.params.args.map((arg) => {
                if (arg.preview && arg.preview.properties) {
                    return '{' + arg.preview.properties.map((p) => `${p.name}: ${p.value}`).join(', ') + '}';
                }
                return String(arg.value || arg.description || '');
            });
            const text = parts.join(' ');
            if (!session.ignoreConsole || !session.ignoreConsole.test(text)) {
                problems.push(`[${session.where}] console.error ${text.slice(0, 240)}`);
            }
        }
        if (message.method === 'Network.responseReceived') {
            const { status, url } = message.params.response;
            const ignored = session.ignoreHttp && session.ignoreHttp.test(url);
            if (status >= 400 && !/favicon|_vercel/.test(url) && !session.allowHttpErrors && !ignored) {
                problems.push(`[${session.where}] HTTP ${status} ${url.replace(session.base, '')}`);
            }
        }
        if (message.method === 'Network.loadingFailed') {
            const { errorText } = message.params;
            if (errorText !== 'net::ERR_ABORTED' && !IGNORED_FAILURES.test(errorText) && !session.offline) {
                problems.push(`[${session.where}] carga fallida ${errorText}`);
            }
        }
    };

    session.send = (method, params = {}) => new Promise((resolve) => {
        nextId += 1;
        pending.set(nextId, resolve);
        ws.send(JSON.stringify({ id: nextId, method, params }));
    });

    session.ev = async (expression) => {
        const result = await session.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (result.exceptionDetails) {
            let description = '';
            if (result.exceptionDetails.exception) {
                description = result.exceptionDetails.exception.description || '';
            }
            return 'EXC:' + description.split('\n')[0];
        }
        if (result.result) {
            return result.result.value;
        }
        return undefined;
    };

    session.go = async (url, wait = 2500) => {
        await session.send('Page.navigate', { url: session.base + url });
        await sleep(wait);
    };

    session.waitFor = async (expression, timeout = 8000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            if ((await session.ev(expression)) === true) {
                return true;
            }
            await sleep(200);
        }
        return false;
    };

    session.check = (name, ok, extra = '') => {
        let line = `MAL ${name}`;
        if (ok) {
            line = `OK  ${name}`;
        }
        if (extra) {
            line += ` — ${extra}`;
        }
        results.push(line);
        if (process.env.VERBOSE) {
            console.log(line);
        }
    };

    session.skip = (name, why) => results.push(`SKIP ${name} — ${why}`);

    session.setGeolocation = async (lat, lon) => {
        await session.send('Browser.grantPermissions', { origin: session.base, permissions: ['geolocation'] });
        await session.send('Emulation.setGeolocationOverride', { latitude: lat, longitude: lon, accuracy: 10 });
    };

    session.finish = (label) => {
        const unique = [...new Set(problems)];
        const bad = results.filter((r) => r.startsWith('MAL')).length;
        const ok = results.filter((r) => r.startsWith('OK')).length;
        const skipped = results.filter((r) => r.startsWith('SKIP')).length;
        console.log(results.join('\n'));
        console.log(`\nRESULTADO ${label}: ${ok} OK, ${bad} MAL, ${skipped} SKIP, ${unique.length} problemas de consola/red`);
        for (const problem of unique.slice(0, 30)) {
            console.log(' -', problem);
        }
        ws.close();
        onFinish();
        let code = 0;
        if (bad || unique.length) {
            code = 1;
        }
        process.exit(code);
    };

    await session.send('Runtime.enable');
    await session.send('Page.enable');
    await session.send('Network.enable');
    return session;
}
