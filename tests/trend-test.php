<?php

declare(strict_types=1);

require __DIR__ . '/../scripts/build-database.php';

$failures = [];
$codes = trendCodes(
    ['gasoleo_a' => 1.800, 'gasolina_95_e5' => 1.700, 'glp' => 0.9, 'adblue' => 1.0],
    ['gasoleo_a' => 1.750, 'gasolina_95_e5' => 1.7002, 'glp' => 0.95, 'sin_precio_hoy' => 2.0]
);
if ($codes !== ['gasoleo_a' => 'u', 'gasolina_95_e5' => 's', 'glp' => 'd']) {
    $failures[] = 'tendencias inesperadas: ' . json_encode($codes);
}

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    echo "trend: FALLA\n";
    exit(1);
}
echo "trend: OK\n";
