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
        let timeA = 0;
        if (a.createdAt) {
            timeA = a.createdAt;
        } else if (a.created) {
            timeA = a.created;
        }
        let timeB = 0;
        if (b.createdAt) {
            timeB = b.createdAt;
        } else if (b.created) {
            timeB = b.created;
        }
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
            let created = 0;
            if (dep.createdAt) {
                created = dep.createdAt;
            } else if (dep.created) {
                created = dep.created;
            }
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

export function buildFetchUrl(project, teamId, limit) {
    let count = 100;
    if (typeof limit === 'number') {
        count = limit;
    }
    let url = `https://api.vercel.com/v6/deployments?app=${encodeURIComponent(project)}&limit=${count}`;
    if (teamId) {
        url = url + `&teamId=${encodeURIComponent(teamId)}`;
    }
    return url;
}

export function buildDeleteUrl(id, teamId) {
    let url = `https://api.vercel.com/v13/deployments/${encodeURIComponent(id)}`;
    if (teamId) {
        url = url + `?teamId=${encodeURIComponent(teamId)}`;
    }
    return url;
}

async function fetchDeploymentsApi(project, token, teamId) {
    const url = buildFetchUrl(project, teamId);
    let res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok && res.status === 404 && teamId) {
        const fallbackUrl = buildFetchUrl(project, '');
        const fallbackRes = await fetch(fallbackUrl, {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (fallbackRes.ok) {
            res = fallbackRes;
        }
    }

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Vercel API error (${res.status}): ${errorText}`);
    }

    const data = await res.json();
    return data.deployments || [];
}

async function deleteDeploymentApi(id, token, teamId) {
    const url = buildDeleteUrl(id, teamId);
    let res = await fetch(url, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!res.ok && res.status === 404 && teamId) {
        const fallbackUrl = buildDeleteUrl(id, '');
        const fallbackRes = await fetch(fallbackUrl, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (fallbackRes.ok) {
            return await fallbackRes.json();
        }
    }

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errorText}`);
    }

    return await res.json();
}

function fetchDeploymentsCli(project) {
    const listArgs = buildVercelArgs(['list', project, '--format', 'json', '--limit', '100'], '');
    const output = execFileSync('vercel', listArgs, {
        encoding: 'utf-8',
        shell: true,
        stdio: ['ignore', 'pipe', 'inherit'],
    });

    const data = parseVercelJson(output);
    if (!data || !Array.isArray(data.deployments)) {
        throw new Error('No se pudo interpretar la salida JSON de Vercel CLI');
    }
    return data.deployments;
}

function deleteDeploymentCli(identifier) {
    const rmArgs = buildVercelArgs(['rm', identifier, '--yes'], '');
    execFileSync('vercel', rmArgs, {
        encoding: 'utf-8',
        shell: true,
        stdio: ['ignore', 'pipe', 'inherit'],
    });
}

export async function prune(customOptions) {
    let project = 'gasolineraplus';
    let token = '';
    let teamId = '';
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
    if (process.env.VERCEL_ORG_ID) {
        teamId = process.env.VERCEL_ORG_ID;
    }

    if (customOptions) {
        if (customOptions.project) {
            project = customOptions.project;
        }
        if (customOptions.token) {
            token = customOptions.token;
        }
        if (customOptions.teamId) {
            teamId = customOptions.teamId;
        }
        if (typeof customOptions.keepProd === 'number') {
            keepProd = customOptions.keepProd;
        }
        if (typeof customOptions.keepPreviewHours === 'number') {
            keepPreviewHours = customOptions.keepPreviewHours;
        }
    }

    console.log(`[prune-deployments] Consultando despliegues del proyecto "${project}"...`);

    let deployments = [];
    let useApi = false;
    if (token) {
        useApi = true;
    }

    try {
        if (useApi) {
            deployments = await fetchDeploymentsApi(project, token, teamId);
        } else {
            deployments = fetchDeploymentsCli(project);
        }
    } catch (err) {
        console.error('[prune-deployments] Error al obtener despliegues:', err.message);
        return { success: false, error: err };
    }

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
        let identifier = item.url;
        if (item.uid) {
            identifier = item.uid;
        } else if (item.id) {
            identifier = item.id;
        }

        console.log(`  - BORRANDO: ${item.url} (${identifier}) [target=${targetDesc}, state=${item.state}]`);

        try {
            if (useApi) {
                await deleteDeploymentApi(identifier, token, teamId);
            } else {
                deleteDeploymentCli(identifier);
            }
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
