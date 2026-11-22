<?php

declare(strict_types=1);

/*
 * Guarda la foto del informe mensual en la tabla monthly_reports de la base del país.
 *
 * Se ejecuta después de cada importación diaria. La fila del mes de los datos se sobrescribe cada día,
 * así que cuando empieza el mes siguiente queda congelada con los datos del último día del mes:
 * ese es el informe "cerrado" que se publica en /{sección}/{informe}/AAAA-MM.
 *
 * Como copia de seguridad, el histórico completo se exporta a un JSON (--backup) que el workflow sube a la
 * release de datos; si la base se tuviera que reconstruir desde cero, se recuperan de ahí los meses que falten.
 *
 * Uso: php scripts/snapshot-report.php --country=es [--db=ruta.sqlite] [--backup=informes-es.json]
 */

date_default_timezone_set('Europe/Madrid');

require_once __DIR__ . '/../api/Core/Country.php';
require_once __DIR__ . '/../api/Services/Seo.php';

use Core\Country;
use Services\Seo;

$opts = ['country' => 'es', 'db' => null, 'backup' => null];
foreach (array_slice($argv, 1) as $arg) {
    foreach (array_keys($opts) as $name) {
        if (str_starts_with($arg, '--' . $name . '=')) {
            $opts[$name] = substr($arg, strlen($name) + 3);
        }
    }
}
if (!isset(Country::all()[$opts['country']]) || !isset(Seo::PROFILES[$opts['country']])) {
    fwrite(STDERR, "Error: --country debe ser uno de: " . implode(', ', array_keys(Seo::PROFILES)) . "\n");
    exit(1);
}
$_GET['pais'] = $opts['country'];
$dbPath = $opts['db'] ?? Country::dbPathFor($opts['country']);
if (!is_file($dbPath)) {
    fwrite(STDERR, "Error: no existe la base $dbPath\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . $dbPath);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
$pdo->exec('CREATE TABLE IF NOT EXISTS monthly_reports (month TEXT PRIMARY KEY, updated TEXT NOT NULL, data TEXT NOT NULL)');

// 1. Recuperar de la copia los meses que no estén en la base.
$restored = 0;
if ($opts['backup'] !== null && is_file($opts['backup'])) {
    $backup = json_decode((string)file_get_contents($opts['backup']), true);
    if (is_array($backup)) {
        $insert = $pdo->prepare('INSERT OR IGNORE INTO monthly_reports (month, updated, data) VALUES (?, ?, ?)');
        foreach ($backup as $month => $data) {
            if (is_string($month) && preg_match('/^\d{4}-\d{2}$/', $month) && is_array($data) && isset($data['updated'])) {
                $insert->execute([$month, (string)$data['updated'], json_encode($data, JSON_UNESCAPED_UNICODE)]);
                $restored += $insert->rowCount();
            }
        }
    }
}

// 2. Foto del mes de los datos de hoy.
$data = Seo::reportData($pdo);
if ($data['ranked'] === [] || $data['averages'] === []) {
    fwrite(STDERR, "Aviso: sin datos suficientes para el informe de {$opts['country']}; no se guarda la foto\n");
} else {
    $existing = $pdo->prepare('SELECT updated FROM monthly_reports WHERE month = ?');
    $existing->execute([$data['month']]);
    $previous = $existing->fetchColumn();
    if (is_string($previous) && $previous > $data['updated']) {
        // Nunca se pisa una foto con datos más antiguos (por ejemplo, al reimportar un día pasado).
        echo "Informe {$data['month']} ({$opts['country']}): ya hay una foto del $previous, más reciente; no se cambia\n";
    } else {
        $stmt = $pdo->prepare('INSERT INTO monthly_reports (month, updated, data) VALUES (?, ?, ?)
            ON CONFLICT(month) DO UPDATE SET updated = excluded.updated, data = excluded.data');
        $stmt->execute([$data['month'], $data['updated'], json_encode($data, JSON_UNESCAPED_UNICODE)]);
        echo "Informe {$data['month']} ({$opts['country']}): foto guardada con los datos del {$data['updated']}\n";
    }
}

// 3. Exportar el histórico completo.
if ($opts['backup'] !== null) {
    $all = [];
    foreach ($pdo->query('SELECT month, data FROM monthly_reports ORDER BY month') as $row) {
        $all[$row['month']] = json_decode($row['data'], true);
    }
    file_put_contents($opts['backup'], json_encode($all, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    echo 'Histórico exportado a ' . $opts['backup'] . ': ' . count($all) . " meses ($restored recuperados de la copia)\n";
}
