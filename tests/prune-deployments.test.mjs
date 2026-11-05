import assert from 'node:assert/strict';
import {
    buildVercelArgs,
    classifyDeployments,
    parseVercelJson,
} from '../scripts/prune-deployments.mjs';

const now = 1700000000000;
const hourMs = 60 * 60 * 1000;

{
    const deployments = [
        { url: 'p4', target: 'production', state: 'READY', createdAt: now - 1 * hourMs },
        { url: 'p3', target: 'production', state: 'READY', createdAt: now - 5 * hourMs },
        { url: 'p2', target: 'production', state: 'READY', createdAt: now - 10 * hourMs },
        { url: 'p1', target: 'production', state: 'READY', createdAt: now - 20 * hourMs },
    ];
    const res = classifyDeployments(deployments, { keepProd: 2, now: now });
    assert.equal(res.toKeep.length, 2, 'conserva 2 producciones');
    assert.equal(res.toKeep[0].url, 'p4', 'la mas reciente primero');
    assert.equal(res.toKeep[1].url, 'p3', 'la segunda mas reciente');
    assert.equal(res.toDelete.length, 2, 'marca 2 producciones viejas para borrar');
    assert.equal(res.toDelete[0].url, 'p2');
    assert.equal(res.toDelete[1].url, 'p1');
}

{
    const deployments = [
        { url: 'prev-recent', target: null, state: 'READY', createdAt: now - 1 * hourMs },
        { url: 'prev-old', target: null, state: 'READY', createdAt: now - 3 * hourMs },
        { url: 'prev-failed', target: null, state: 'ERROR', createdAt: now - 0.5 * hourMs },
    ];
    const res = classifyDeployments(deployments, { now: now });
    assert.equal(res.toKeep.length, 1, 'solo conserva el preview de menos de 2h y READY');
    assert.equal(res.toKeep[0].url, 'prev-recent');
    assert.equal(res.toDelete.length, 2, 'marca el de 3h y el fallido para borrar');
    const deletedUrls = res.toDelete.map(function (d) { return d.url; });
    assert.ok(deletedUrls.includes('prev-old'));
    assert.ok(deletedUrls.includes('prev-failed'));
}

{
    const textWithBanner = 'Vercel CLI 56.2.1 (Node.js 22.23.1)\n{"deployments":[{"url":"test"}]}\n';
    const parsed = parseVercelJson(textWithBanner);
    assert.ok(parsed, 'parsea JSON precedido por el banner de la CLI');
    assert.equal(parsed.deployments[0].url, 'test');

    const badText = 'No json here';
    assert.equal(parseVercelJson(badText), null, 'devuelve null si no hay JSON valido');
}

{
    const args1 = buildVercelArgs(['list', 'app'], 'my-token');
    assert.deepEqual(args1, ['list', 'app', '--token=my-token']);

    const args2 = buildVercelArgs(['rm', 'url', '--yes'], '');
    assert.deepEqual(args2, ['rm', 'url', '--yes']);
}

console.log('prune-deployments: OK');
