import { execFileSync } from 'node:child_process';
import { sleep } from './cdp.mjs';

const SDK = process.env.ANDROID_HOME || `${process.env.LOCALAPPDATA}/Android/Sdk`;
export const ADB = `${SDK}/platform-tools/adb`;
export const PKG = 'app.vercel.gasolineraplus';
const DEVTOOLS_PORT = Number(process.env.WEBVIEW_PORT || 9333);

export function adb(...args) {
    return execFileSync(ADB, args, { encoding: 'utf8' }).trim();
}

export function foregroundActivity() {
    const dump = adb('shell', 'dumpsys', 'activity', 'activities');
    const line = dump.split('\n').find((l) => l.includes('topResumedActivity') || l.includes('mResumedActivity'));
    if (!line) {
        return '';
    }
    return line;
}

export function freshInstallState(permissions) {
    adb('reverse', 'tcp:8021', 'tcp:8021');
    adb('shell', 'pm', 'clear', PKG);
    for (const permission of permissions) {
        adb('shell', 'pm', 'grant', PKG, `android.permission.${permission}`);
    }
}

export async function connectToApp() {
    let pid = '';
    for (let i = 0; i < 30 && !pid; i++) {
        await sleep(500);
        try {
            pid = adb('shell', 'pidof', PKG);
        } catch (e) {
            pid = '';
        }
    }
    if (!pid) {
        throw new Error('la app no arranca');
    }
    try {
        adb('forward', '--remove', `tcp:${DEVTOOLS_PORT}`);
    } catch (e) {
        pid = pid.trim();
    }
    adb('forward', `tcp:${DEVTOOLS_PORT}`, `localabstract:webview_devtools_remote_${pid.trim()}`);
    let page = null;
    for (let i = 0; i < 30 && !page; i++) {
        await sleep(500);
        try {
            const targets = await (await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json`)).json();
            page = targets.find((t) => t.type === 'page' && t.url.startsWith('https://localhost'));
        } catch (e) {
            page = null;
        }
    }
    if (!page) {
        throw new Error('no se encuentra la WebView de la app');
    }
    return page.webSocketDebuggerUrl;
}

export function geoFix(lat, lon, speedMs) {
    adb('emu', 'geo', 'fix', lon.toFixed(7), lat.toFixed(7), '30', '10', (speedMs * 1.943844).toFixed(2));
}
