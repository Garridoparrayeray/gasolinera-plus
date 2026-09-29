<?php

declare(strict_types=1);

require __DIR__ . '/../scripts/build-price-index.php';

$failures = [];

function expectEqual(mixed $actual, mixed $expected, string $message, array &$failures): void
{
    if ($actual !== $expected) {
        $failures[] = $message . ': esperaba ' . json_encode($expected) . ' y salio ' . json_encode($actual);
    }
}

function fixtureStation(string $lat, string $lon, string $province, array $prices): array
{
    $row = ['IDEESS' => 'x', 'Latitud' => $lat, 'Longitud (WGS84)' => $lon, 'IDProvincia' => $province];
    foreach ($prices as $field => $value) {
        $row[$field] = $value;
    }
    return $row;
}

$aggregate = aggregateSnapshot([
    fixtureStation('43,263000', '-2,935000', '48', ['Precio Gasoleo A' => '1,799', 'Precio Gasolina 95 E5' => '1,899']),
    fixtureStation('43,270000', '-2,930000', '48', ['Precio Gasoleo A' => '1,699']),
    fixtureStation('40,416800', '-3,703800', '28', ['Precio Gasoleo A' => '1,999', 'Precio Adblue' => '0,900']),
    fixtureStation('', '', '28', ['Precio Gasoleo A' => '1,111']),
]);

expectEqual($aggregate['n'][0], 6608, 'suma nacional gasoleo_a (incluye la estacion sin coordenadas)', $failures);
expectEqual($aggregate['n'][1], 4, 'estaciones nacional gasoleo_a', $failures);
expectEqual($aggregate['n'][2], 1899, 'suma nacional gasolina_95_e5', $failures);
expectEqual($aggregate['n'][3], 1, 'estaciones nacional gasolina_95_e5', $failures);
expectEqual($aggregate['p']['48'][0], 3498, 'suma provincia 48 gasoleo_a', $failures);
expectEqual($aggregate['p']['48'][1], 2, 'estaciones provincia 48 gasoleo_a', $failures);
expectEqual($aggregate['p']['28'][0], 3110, 'suma provincia 28 gasoleo_a', $failures);
expectEqual(indexCellKey(43.263, -2.935), '432_-30', 'clave de cuadricula de Bilbao', $failures);
expectEqual($aggregate['c']['432_-30'][0], 3498, 'suma de la cuadricula de Bilbao', $failures);
expectEqual($aggregate['c']['432_-30'][1], 2, 'estaciones de la cuadricula de Bilbao', $failures);
expectEqual(count($aggregate['c']), 2, 'numero de cuadriculas', $failures);
expectEqual(isset($aggregate['n'][10]), false, 'el adblue no entra en el indice', $failures);

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    echo "price-index: FALLA\n";
    exit(1);
}
echo "price-index: OK\n";
