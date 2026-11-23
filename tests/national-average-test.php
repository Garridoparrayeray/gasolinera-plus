<?php

declare(strict_types=1);

require __DIR__ . '/../scripts/build-database.php';

// La media nacional del dia no cuenta las estaciones que llevan mas de NATIONAL_AVERAGE_FRESH_DAYS dias sin salir
// en la fuente oficial: conservan su ultimo precio en current_prices, pero ya no son una estacion en funcionamiento.
$failures = [];
$pdo = new \PDO('sqlite::memory:');
$pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(\PDO::ATTR_DEFAULT_FETCH_MODE, \PDO::FETCH_ASSOC);
ensureSchema($pdo);

function stationWith(string $id, float $price): array
{
    return [
        'IDEESS' => $id,
        'Rótulo' => 'PRUEBA ' . $id,
        'Dirección' => 'CALLE ' . $id,
        'Localidad' => 'BILBAO',
        'Municipio' => 'BILBAO',
        'Provincia' => 'BIZKAIA',
        'Latitud' => '43,26',
        'Longitud (WGS84)' => '-2,93',
        'prices' => ['gasolina_95_e5' => $price],
    ];
}

function nationalAverage(\PDO $pdo, string $date): array
{
    return $pdo->query("SELECT media, estaciones FROM national_price_history WHERE fecha = '$date' AND carburante = 'gasolina_95_e5'")->fetch();
}

ob_start();
// La 2 sale solo el 10/11, la 3 solo el 20/11 y la 1 todos los dias.
applySnapshot($pdo, [stationWith('1', 1.700), stationWith('2', 1.500)], '2026-11-10', true);
updateNationalPriceHistory($pdo, '2026-11-10');
applySnapshot($pdo, [stationWith('1', 1.800), stationWith('3', 1.600)], '2026-11-20', true);
updateNationalPriceHistory($pdo, '2026-11-20');
applySnapshot($pdo, [stationWith('1', 1.800)], '2026-11-23', true);
updateNationalPriceHistory($pdo, '2026-11-23');
ob_end_clean();

$first = nationalAverage($pdo, '2026-11-10');
if ($first['estaciones'] !== 2 || abs((float)$first['media'] - 1.6) > 0.00001) {
    $failures[] = 'el 10/11 salen dos estaciones: media 1.6 con 2 estaciones, y salio ' . json_encode($first);
}

// El 20/11 la 2 lleva 10 dias sin salir (justo en el limite) y cuenta; la 3 es nueva.
$second = nationalAverage($pdo, '2026-11-20');
if ($second['estaciones'] !== 3 || abs((float)$second['media'] - (1.8 + 1.5 + 1.6) / 3) > 0.0001) {
    $failures[] = 'el 20/11 la estacion que lleva 10 dias sin salir todavia cuenta: media 1.6333 con 3 estaciones, y salio ' . json_encode($second);
}

// El 23/11 la 2 lleva 13 dias sin salir y ya no cuenta; la 3, que salio hace 3, si.
$third = nationalAverage($pdo, '2026-11-23');
if ($third['estaciones'] !== 2 || abs((float)$third['media'] - 1.7) > 0.00001) {
    $failures[] = 'el 23/11 la estacion que lleva 13 dias sin salir no debe contar: media 1.7 con 2 estaciones, y salio ' . json_encode($third);
}

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    echo "national-average: FALLA\n";
    exit(1);
}
echo "national-average: OK\n";
