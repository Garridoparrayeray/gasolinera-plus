<?php

declare(strict_types=1);

require __DIR__ . '/../scripts/build-database.php';

// La media nacional del dia solo cuenta las estaciones de la recogida de ese dia: una que ya no aparece
// en la fuente oficial conserva su ultimo precio en current_prices, pero no debe contar en la media.
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

ob_start();
applySnapshot($pdo, [stationWith('1', 1.700), stationWith('2', 1.500)], '2026-11-20', true);
updateNationalPriceHistory($pdo, '2026-11-20');
applySnapshot($pdo, [stationWith('1', 1.800)], '2026-11-23', true);
updateNationalPriceHistory($pdo, '2026-11-23');
ob_end_clean();

$first = $pdo->query("SELECT media, estaciones FROM national_price_history WHERE fecha = '2026-11-20' AND carburante = 'gasolina_95_e5'")->fetch();
if ($first['estaciones'] !== 2 || abs((float)$first['media'] - 1.6) > 0.00001) {
    $failures[] = 'el dia con las dos estaciones deberia dar media 1.6 con 2 estaciones: ' . json_encode($first);
}

$second = $pdo->query("SELECT media, estaciones FROM national_price_history WHERE fecha = '2026-11-23' AND carburante = 'gasolina_95_e5'")->fetch();
if ($second['estaciones'] !== 1 || abs((float)$second['media'] - 1.8) > 0.00001) {
    $failures[] = 'la estacion que ya no sale en la fuente no deberia contar: se esperaba media 1.8 con 1 estacion y salio ' . json_encode($second);
}

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    echo "national-average: FALLA\n";
    exit(1);
}
echo "national-average: OK\n";
