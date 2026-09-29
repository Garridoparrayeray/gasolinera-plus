<?php

declare(strict_types=1);

ini_set('memory_limit', '1024M');

require __DIR__ . '/build-database.php';

const INDEX_VERSION = 1;
const INDEX_CELL_DEG = 0.1;
const INDEX_FUELS = ['gasoleo_a', 'gasolina_95_e5', 'gasoleo_premium', 'gasolina_98_e5', 'glp'];
const INDEX_DEFAULT_DAYS = 400;
const INDEX_DEFAULT_OUT = __DIR__ . '/../data/price-index';

function indexCellKey(float $lat, float $lon): string
{
    return (int)floor($lat / INDEX_CELL_DEG) . '_' . (int)floor($lon / INDEX_CELL_DEG);
}

function emptyBucket(): array
{
    return array_fill(0, count(INDEX_FUELS) * 2, 0);
}

function addSample(array &$bucket, int $fuelIndex, int $millis): void
{
    $bucket[$fuelIndex * 2] += $millis;
    $bucket[$fuelIndex * 2 + 1]++;
}

function aggregateSnapshot(array $estaciones): array
{
    $national = emptyBucket();
    $provinces = [];
    $cells = [];

    foreach ($estaciones as $row) {
        $lat = parseSpanishDecimal(fieldStr($row, 'Latitud'));
        $lon = parseSpanishDecimal(fieldStr($row, 'Longitud (WGS84)'));
        $cell = null;
        if ($lat !== null && $lon !== null) {
            $cell = indexCellKey($lat, $lon);
        }
        $prices = loadFuelPrices($row);
        $province = fieldStr($row, 'IDProvincia');

        foreach (INDEX_FUELS as $fuelIndex => $slug) {
            if (!isset($prices[$slug])) {
                continue;
            }
            $millis = (int)round($prices[$slug] * 1000);
            if (!isset($provinces[$province])) {
                $provinces[$province] = emptyBucket();
            }
            addSample($national, $fuelIndex, $millis);
            addSample($provinces[$province], $fuelIndex, $millis);
            if ($cell === null) {
                continue;
            }
            if (!isset($cells[$cell])) {
                $cells[$cell] = emptyBucket();
            }
            addSample($cells[$cell], $fuelIndex, $millis);
        }
    }

    return ['n' => $national, 'p' => $provinces, 'c' => $cells];
}

function newMonthFile(string $month): array
{
    return [
        'version' => INDEX_VERSION,
        'month' => $month,
        'cellDeg' => INDEX_CELL_DEG,
        'fuels' => INDEX_FUELS,
        'days' => [],
    ];
}

function readMonthFile(string $path, string $month): array
{
    if (!is_file($path)) {
        return newMonthFile($month);
    }
    $data = json_decode((string)file_get_contents($path), true);
    if (!is_array($data) || !isset($data['days']) || ($data['version'] ?? 0) !== INDEX_VERSION) {
        return newMonthFile($month);
    }
    return $data;
}

function writeMonthFile(string $path, array $month): void
{
    ksort($month['days']);
    file_put_contents($path, json_encode($month, JSON_UNESCAPED_SLASHES));
}

function writeManifest(string $dir): void
{
    $months = [];
    $first = null;
    $last = null;
    $files = glob($dir . '/????-??.json');
    sort($files);
    foreach ($files as $file) {
        $data = json_decode((string)file_get_contents($file), true);
        if (!is_array($data) || empty($data['days'])) {
            continue;
        }
        $dates = array_keys($data['days']);
        sort($dates);
        if ($first === null || $dates[0] < $first) {
            $first = $dates[0];
        }
        if ($last === null || $dates[count($dates) - 1] > $last) {
            $last = $dates[count($dates) - 1];
        }
        $months[] = [
            'month' => $data['month'],
            'file' => basename($file),
            'days' => count($dates),
            'lastDate' => $dates[count($dates) - 1],
            'bytes' => filesize($file),
        ];
    }
    $manifest = [
        'version' => INDEX_VERSION,
        'generatedAt' => gmdate('c'),
        'cellDeg' => INDEX_CELL_DEG,
        'fuels' => INDEX_FUELS,
        'firstDate' => $first,
        'lastDate' => $last,
        'months' => $months,
    ];
    file_put_contents($dir . '/index.json', json_encode($manifest, JSON_UNESCAPED_SLASHES));
}

function parseIndexArgs(array $argv): array
{
    $opts = ['out' => INDEX_DEFAULT_OUT, 'from' => null, 'to' => null, 'days' => INDEX_DEFAULT_DAYS];
    foreach ($argv as $arg) {
        if (str_starts_with($arg, '--out=')) {
            $opts['out'] = substr($arg, 6);
        } elseif (str_starts_with($arg, '--from=')) {
            $opts['from'] = substr($arg, 7);
        } elseif (str_starts_with($arg, '--to=')) {
            $opts['to'] = substr($arg, 5);
        } elseif (str_starts_with($arg, '--days=')) {
            $opts['days'] = (int)substr($arg, 7);
        }
    }
    return $opts;
}

function fetchDaySnapshot(string $isoDate, string $today): ?array
{
    $url = SOURCE_HIST_PREFIX . isoDateToHistParam($isoDate);
    if ($isoDate === $today) {
        $url = SOURCE_CURRENT;
    }
    try {
        $snapshot = fetchSnapshot($url);
    } catch (\Throwable $e) {
        fwrite(STDERR, "Aviso: no se pudo descargar $isoDate: {$e->getMessage()}\n");
        return null;
    }
    if (feedDateToIso($snapshot['fecha']) !== $isoDate) {
        fwrite(STDERR, "Aviso: el Ministerio devolvio la fecha " . $snapshot['fecha'] . " para $isoDate; se omite\n");
        return null;
    }
    return $snapshot;
}

function indexMain(array $argv): void
{
    $opts = parseIndexArgs($argv);
    $dir = $opts['out'];
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    $timezone = new \DateTimeZone('Europe/Madrid');
    $todayDate = new \DateTime('today', $timezone);
    $today = $todayDate->format('Y-m-d');
    $to = $opts['to'];
    if ($to === null) {
        $to = $today;
    }
    $from = $opts['from'];
    if ($from === null) {
        $from = (new \DateTime($to, $timezone))->modify('-' . ($opts['days'] - 1) . ' day')->format('Y-m-d');
    }
    $yesterday = (clone $todayDate)->modify('-1 day')->format('Y-m-d');

    echo "== Indice de precios $from a $to ==\n";
    $currentMonth = '';
    $month = null;
    $added = 0;

    for ($date = new \DateTime($from, $timezone); $date->format('Y-m-d') <= $to; $date->modify('+1 day')) {
        $iso = $date->format('Y-m-d');
        $monthKey = substr($iso, 0, 7);
        if ($monthKey !== $currentMonth) {
            if ($month !== null) {
                writeMonthFile($dir . '/' . $currentMonth . '.json', $month);
            }
            $currentMonth = $monthKey;
            $month = readMonthFile($dir . '/' . $monthKey . '.json', $monthKey);
        }
        $refresh = $iso === $today || $iso === $yesterday;
        if (isset($month['days'][$iso]) && !$refresh) {
            continue;
        }
        $snapshot = fetchDaySnapshot($iso, $today);
        if ($snapshot === null) {
            continue;
        }
        $month['days'][$iso] = aggregateSnapshot($snapshot['estaciones']);
        $added++;
        echo "  $iso: " . count($snapshot['estaciones']) . " estaciones\n";
        usleep(300000);
    }

    if ($month !== null) {
        writeMonthFile($dir . '/' . $currentMonth . '.json', $month);
    }
    writeManifest($dir);
    echo "Dias nuevos o actualizados: $added\n";
}

if (isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    indexMain(array_slice($argv, 1));
}
