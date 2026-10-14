import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const AlertsStore = new Function(readFileSync(join(root, 'js', 'alerts-store.js'), 'utf8') + '\nreturn AlertsStore;')();

const fuels = (price) => ({ gasoleo_a: { precio: price } });
const settings = { threshold: 0.03, rises: false };

{
    const result = AlertsStore.compare({ gasoleo_a: 1.5 }, fuels(1.49), settings);
    assert.equal(result.fuelDrops.length, 0, 'una bajada de 1 céntimo no avisa con un mínimo de 3');
    assert.equal(result.prices.gasoleo_a, 1.5, 'la referencia no se mueve si no llega al mínimo');
}

{
    let reference = { gasoleo_a: 1.5 };
    let alerted = 0;
    for (const price of [1.49, 1.48, 1.47]) {
        const result = AlertsStore.compare(reference, fuels(price), settings);
        reference = result.prices;
        alerted += result.fuelDrops.length;
    }
    assert.equal(alerted, 1, 'varias bajadas pequeñas seguidas acaban avisando cuando suman el mínimo');
    assert.equal(reference.gasoleo_a, 1.47, 'tras avisar, la referencia es el precio nuevo');
}

{
    const result = AlertsStore.compare({ gasoleo_a: 1.5 }, fuels(1.56), settings);
    assert.equal(result.fuelRises.length, 0, 'las subidas no avisan si no se ha pedido');
    assert.equal(result.prices.gasoleo_a, 1.56, 'pero la referencia se actualiza');
}

{
    const result = AlertsStore.compare({ gasoleo_a: 1.5 }, fuels(1.56), { threshold: 0.03, rises: true });
    assert.equal(result.fuelRises.length, 1, 'las subidas avisan si se ha pedido');
    const note = AlertsStore.notificationFor({ favorite: { ideess: '1', rotulo: 'REPSOL' }, fuelDrops: [], fuelRises: result.fuelRises });
    assert.equal(note.title, 'REPSOL ha subido de precio');
}

{
    const result = AlertsStore.compare({}, fuels(1.5), settings);
    assert.equal(result.prices.gasoleo_a, 1.5, 'un combustible nuevo se anota sin avisar');
    assert.equal(result.fuelDrops.length + result.fuelRises.length, 0);
}

console.log('alerts: OK');
