<?php

declare(strict_types=1);

// Al buscar un lugar y ordenar por precio, las gasolineras del propio municipio y las de alrededor
// van mezcladas por precio: las del municipio no salen todas primero.

date_default_timezone_set('Europe/Madrid');
spl_autoload_register(function (string $class): void {
    $path = __DIR__ . '/../api/' . str_replace('\\', '/', $class) . '.php';
    if (is_file($path)) {
        require $path;
    }
});

use Core\Database;
use Models\Station;

$failures = [];
$model = new Station(Database::connection());
$place = ['lat' => 43.3500, 'lon' => -3.0100];
$fuel = 'gasolina_95_e5';

$page = $model->search('Getxo', null, null, 'price', $fuel, false, false, 10, 0, 40, $place, 10.0, null);
$items = $page['items'];
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
    $failures[] = 'no esta ordenado por precio: ' . json_encode($prices);
}
if (count($municipios) < 2) {
    $failures[] = 'no hay gasolineras de alrededor mezcladas con las del municipio';
}

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    echo "search-order: FALLA\n";
    exit(1);
}
echo "search-order: OK\n";
