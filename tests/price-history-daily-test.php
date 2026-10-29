<?php

declare(strict_types=1);

require __DIR__ . '/../scripts/build-database.php';

// Los precios se importan varias veces al dia: el historial del dia debe quedarse con el ultimo,
// y el relleno de dias pasados no debe pisar lo que ya hay.
$failures = [];
$pdo = new \PDO('sqlite::memory:');
$pdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(\PDO::ATTR_DEFAULT_FETCH_MODE, \PDO::FETCH_ASSOC);
ensureSchema($pdo);

function station(float $price): array
{
    return [
        'IDEESS' => '1',
        'Rótulo' => 'PRUEBA',
        'Dirección' => 'CALLE 1',
        'Localidad' => 'BILBAO',
        'Municipio' => 'BILBAO',
        'Provincia' => 'BIZKAIA',
        'Latitud' => '43,26',
        'Longitud (WGS84)' => '-2,93',
        'prices' => ['gasolina_95_e5' => $price],
    ];
}

function historyPrice(\PDO $pdo, string $date): ?float
{
    $value = $pdo->query("SELECT precio FROM price_history WHERE ideess = '1' AND fecha = '$date' AND carburante = 'gasolina_95_e5'")->fetchColumn();
    if ($value === false) {
        return null;
    }
    return (float)$value;
}

ob_start();
applySnapshot($pdo, [station(1.700)], '2026-10-29', true);
applySnapshot($pdo, [station(1.650)], '2026-10-29', true);
applySnapshot($pdo, [station(1.500)], '2026-10-20', false);
applySnapshot($pdo, [station(1.400)], '2026-10-20', false);
ob_end_clean();

$current = (float)$pdo->query("SELECT precio FROM current_prices WHERE ideess = '1' AND carburante = 'gasolina_95_e5'")->fetchColumn();
if ($current !== 1.650) {
    $failures[] = "el precio actual deberia ser el ultimo importado (1.65), es $current";
}
if (historyPrice($pdo, '2026-10-29') !== 1.650) {
    $failures[] = 'el historial del dia deberia tener el ultimo precio (1.65): ' . var_export(historyPrice($pdo, '2026-10-29'), true);
}
if ((int)$pdo->query("SELECT COUNT(*) FROM price_history WHERE fecha = '2026-10-29'")->fetchColumn() !== 1) {
    $failures[] = 'el historial del dia no deberia tener filas repetidas';
}
if (historyPrice($pdo, '2026-10-20') !== 1.500) {
    $failures[] = 'el relleno de un dia pasado no debe pisar el precio que ya hay (1.5): ' . var_export(historyPrice($pdo, '2026-10-20'), true);
}

if ($failures) {
    fwrite(STDERR, implode("\n", $failures) . "\n");
    echo "price-history-daily: FALLA\n";
    exit(1);
}
echo "price-history-daily: OK\n";
