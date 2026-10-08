<?php

declare(strict_types=1);

// Al buscar un lugar y ordenar por precio, primero va todo lo que cae dentro del radio elegido, de más
// barata a más cara, y después lo que queda fuera del radio.

date_default_timezone_set('Europe/Madrid');
spl_autoload_register(function (string $class): void {
    $path = __DIR__ . '/../api/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

use Core\Database;
use Models\Station;

function kmBetween(float $lat1, float $lon1, float $lat2, float $lon2): float
{
    $dLat = deg2rad($lat2 - $lat1);
    $dLon = deg2rad($lon2 - $lon1);
    $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
    return 6371.0 * 2 * asin(sqrt($a));
}

$failures = [];
$model = new Station(Database::connection());
$fuel = 'gasolina_95_e5';

// 1. «Getxo» con 25 km: las del municipio y las de alrededor, mezcladas por precio.
$getxo = ['lat' => 43.3500, 'lon' => -3.0100];
$items = $model->search('Getxo', null, null, 'price', $fuel, false, false, 10, 0, 40, $getxo, 25.0, 25.0)['items'];
if (count($items) < 15) {
    $failures[] = 'pocas gasolineras en Getxo y alrededores: ' . count($items);
}
$prices = [];
$municipios = [];
foreach (array_slice($items, 0, 15) as $item) {
    $prices[] = $item['precios'][$fuel];
    $municipios[$item['municipio']] = true;
}
$sorted = $prices;
sort($sorted);
if ($prices !== $sorted) {
    $failures[] = 'Getxo 25 km: no esta ordenado por precio: ' . json_encode($prices);
}
if (count($municipios) < 2) {
    $failures[] = 'Getxo 25 km: no hay gasolineras de alrededor mezcladas con las del municipio';
}

// 2. Radio corto alrededor de Getxo, buscando «Ortuella»: las de Ortuella (a 4 y 6 km) son más baratas,
// pero quedan fuera del radio de 3 km, así que van después de las de Getxo.
$radius = 3.0;
$items = $model->search('Ortuella', null, null, 'price', $fuel, false, false, 10, 0, 500, $getxo, $radius, $radius)['items'];
$inside = [];
$outside = [];
$seenOutside = false;
foreach ($items as $item) {
    $isOutside = kmBetween($getxo['lat'], $getxo['lon'], $item['lat'], $item['lon']) > $radius;
    if ($isOutside) {
        $seenOutside = true;
        $outside[] = $item['precios'][$fuel];
    } else {
        if ($seenOutside) {
            $failures[] = 'una gasolinera dentro del radio sale despues de una de fuera';
            break;
        }
        $inside[] = $item['precios'][$fuel];
    }
}
if (count($inside) < 3 || count($outside) < 2) {
    $failures[] = 'radio corto: faltan gasolineras dentro (' . count($inside) . ') o fuera (' . count($outside) . ')';
}
foreach ([$inside, $outside] as $group) {
    $copy = $group;
    sort($copy);
    if ($group !== $copy) {
        $failures[] = 'un grupo no esta ordenado por precio: ' . json_encode(array_slice($group, 0, 8));
    }
}

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    echo "search-order: FALLA\n";
    exit(1);
}
echo "search-order: OK\n";
