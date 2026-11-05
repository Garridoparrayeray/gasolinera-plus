import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function classifyDeployments(deployments, options) {
    let keepProd = 2;
    let keepPreviewHours = 2;
    let now = Date.now();

    if (options) {
        if (typeof options.keepProd === 'number') {
            keepProd = options.keepProd;
        }
        if (typeof options.keepPreviewHours === 'number') {
            keepPreviewHours = options.keepPreviewHours;
        }
        if (typeof options.now === 'number') {
            now = options.now;
        }
    }

    const list = Array.from(deployments || []);
    list.sort(function (a, b) {
        const timeA = a.createdAt || 0;
        const timeB = b.createdAt || 0;
        return timeB - timeA;
    });

    const toKeep = [];
    const toDelete = [];
    let prodKept = 0;
    const maxAgeMs = keepPreviewHours * 60 * 60 * 1000;

    for (let i = 0; i < list.length; i = i + 1) {
        const dep = list[i];
        const isProd = dep.target === 'production';
        if (isProd) {
            if (prodKept < keepProd) {
                toKeep.push(dep);
                prodKept = prodKept + 1;
            } else {
                toDelete.push(dep);
            }
        } else {
            const created = dep.createdAt || 0;
            const age = now - created;
            const isRecent = age < maxAgeMs;
            const isReady = dep.state === 'READY';
            if (isRecent && isReady) {
                toKeep.push(dep);
            } else {
                toDelete.push(dep);
            }
        }
    }

    return {
        toKeep: toKeep,
        toDelete: toDelete,
    };
}

export function parseVercelJson(output) {
    const start = output.indexOf('{');
    const end = output.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) {
        return null;
    }
    try {
        return JSON.parse(output.slice(start, end + 1));
    } catch (err) {
        return null;
    }
}

export function buildVercelArgs(baseArgs, token) {
    const args = Array.from(baseArgs);
    if (token) {
        args.push(`--token=${token}`);
    }
    return args;
}

export async function prune(customOptions) {
    let project = 'gasolineraplus';
    let token = '';
    let keepProd = 2;
    let keepPreviewHours = 2;

    if (process.env.VERCEL_PROJECT_NAME) {
        project = process.env.VERCEL_PROJECT_NAME;
    }
    if (process.env.VERCEL_TOKEN) {
        token = process.env.VERCEL_TOKEN;
    } else if (process.env.TOKEN_GASOLINERA) {
        token = process.env.TOKEN_GASOLINERA;
    }

    if (customOptions) {
        if (customOptions.project) {
            project = customOptions.project;
        }
        if (customOptions.token) {
            token = customOptions.token;
        }
        if (typeof customOptions.keepProd === 'number') {
            keepProd = customOptions.keepProd;
        }
        if (typeof customOptions.keepPreviewHours === 'number') {
            keepPreviewHours = customOptions.keepPreviewHours;
        }
    }

    console.log(`[prune-deployments] Consultando despliegues del proyecto "${project}"...`);

    const listArgs = buildVercelArgs(['list', project, '--format', 'json', '--limit', '100'], token);
    let output = '';
    try {
        output = execFileSync('vercel', listArgs, {
            encoding: 'utf-8',
            shell: true,
            stdio: ['ignore', 'pipe', 'inherit'],
        });
    } catch (err) {
        console.error('[prune-deployments] Error al ejecutar "vercel list":', err.message);
        return { success: false, error: err };
    }

    const data = parseVercelJson(output);
    if (!data || !Array.isArray(data.deployments)) {
        console.warn('[prune-deployments] No se pudo interpretar la salida JSON de Vercel');
        return { success: false, countKept: 0, countDeleted: 0 };
    }

    const deployments = data.deployments;
    console.log(`[prune-deployments] Total de despliegues encontrados: ${deployments.length}`);

    const classification = classifyDeployments(deployments, {
        keepProd: keepProd,
        keepPreviewHours: keepPreviewHours,
        now: Date.now(),
    });

    console.log(`[prune-deployments] Despliegues a conservar: ${classification.toKeep.length} (ultimas ${keepProd} producciones + previews de < ${keepPreviewHours}h)`);
    for (let i = 0; i < classification.toKeep.length; i = i + 1) {
        const item = classification.toKeep[i];
        let targetDesc = 'preview';
        if (item.target) {
            targetDesc = item.target;
        }
        console.log(`  - CONSERVA: ${item.url} [target=${targetDesc}, state=${item.state}]`);
    }

    console.log(`[prune-deployments] Despliegues a eliminar: ${classification.toDelete.length}`);
    let deletedCount = 0;

    for (let i = 0; i < classification.toDelete.length; i = i + 1) {
        const item = classification.toDelete[i];
        let targetDesc = 'preview';
        if (item.target) {
            targetDesc = item.target;
        }
        console.log(`  - BORRANDO: ${item.url} [target=${targetDesc}, state=${item.state}]`);

        const rmArgs = buildVercelArgs(['rm', item.url, '--yes'], token);
        try {
            execFileSync('vercel', rmArgs, {
                encoding: 'utf-8',
                shell: true,
                stdio: ['ignore', 'pipe', 'inherit'],
            });
            deletedCount = deletedCount + 1;
        } catch (err) {
            console.warn(`    [!] No se pudo borrar ${item.url}: ${err.message}`);
        }
    }

    console.log(`[prune-deployments] Limpieza completada: ${deletedCount}/${classification.toDelete.length} eliminados`);
    return {
        success: true,
        countKept: classification.toKeep.length,
        countDeleted: deletedCount,
    };
}

let isMain = false;
if (process.argv[1]) {
    const scriptPath = fileURLToPath(import.meta.url);
    if (resolve(process.argv[1]) === resolve(scriptPath)) {
        isMain = true;
    }
}

if (isMain) {
    const result = await prune();
    if (!result.success) {
        process.exitCode = 1;
    }
}
