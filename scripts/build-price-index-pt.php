<?php

declare(strict_types=1);

require_once __DIR__ . '/build-price-index.php';

use Core\Http;

/**
 * Portugal price index builder — fetches national average fuel prices
 * from the DGEG PMD API and generates monthly index JSON files matching
 * the same format used by the Spain index builder.
 */

const DGEG_PMD_URL = 'https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PMD';

/** Map DGEG fuel names (sources.pt) → INDEX_FUELS slugs. */
const PT_FUEL_MAP = [
    'Gasóleo simples'     => 'gasoleo_a',
    'Gasolina simples 95' => 'gasolina_95_e5',
    'Gasóleo especial'    => 'gasoleo_premium',
    'Gasolina 98'         => 'gasolina_98_e5',
    'GPL Auto'            => 'glp',
];

/**
 * Parse a Portuguese price string like "2,1764 €" → float 2.1764.
 */
function parsePortuguesePrice(string $raw): ?float
{
    // Strip everything except digits and comma
    $cleaned = preg_replace('/[^\d,]/', '', $raw);
    if ($cleaned === '' || $cleaned === null) {
        return null;
    }
    $cleaned = str_replace(',', '.', $cleaned);
    $val = (float)$cleaned;
    if ($val > 0) {
        return $val;
    }
    return null;
}

/**
 * Fetch one month of PMD data from DGEG.
 * Returns the 'resultado' array, or null on failure.
 *
 * @return array<int, array<string, mixed>>|null
 */
function fetchDgegMonth(string $dateIni, string $dateFim): ?array
{
    $params = http_build_query([
        'idsTiposComb' => '',
        'dataIni'      => $dateIni,
        'dataFim'      => $dateFim,
        'qtdPorPagina' => 500,
        'pagina'       => 1,
        'orderDesc'    => 0,
    ]);
    $url = DGEG_PMD_URL . '?' . $params;

    try {
        $body = Http::get($url, 30);
    } catch (\Throwable $e) {
        fwrite(STDERR, "Aviso: falha ao descarregar DGEG $dateIni..$dateFim: {$e->getMessage()}\n");
        return null;
    }

    $json = json_decode($body, true);
    if (!is_array($json) || !isset($json['resultado'])) {
        fwrite(STDERR, "Aviso: resposta DGEG inválida para $dateIni..$dateFim\n");
        return null;
    }

    return $json['resultado'];
}

/**
 * Build a slug→fuelIndex lookup for INDEX_FUELS.
 * @return array<string, int>
 */
function buildFuelIndexMap(): array
{
    $map = [];
    foreach (INDEX_FUELS as $i => $slug) {
        $map[$slug] = $i;
    }
    return $map;
}

/**
 * Aggregate DGEG PMD rows into the day-bucket format.
 * Returns ['YYYY-MM-DD' => ['n' => [...], 'p' => {}, 'c' => {}], ...].
 *
 * @param array<int, array<string, mixed>> $rows
 * @return array<string, array{n: int[], p: object, c: object}>
 */
function aggregatePtRows(array $rows): array
{
    $fuelIndexMap = buildFuelIndexMap();
    $days = [];

    foreach ($rows as $row) {
        $date = $row['Data'] ?? null;
        $fuelName = $row['TipoCombustivel'] ?? null;
        $priceRaw = $row['PrecoMedioC4'] ?? null;
        $numPostos = (int)($row['NumPostos'] ?? 0);

        if ($date === null || $fuelName === null || $priceRaw === null || $numPostos <= 0) {
            continue;
        }

        $slug = PT_FUEL_MAP[$fuelName] ?? null;
        if ($slug === null || !isset($fuelIndexMap[$slug])) {
            continue;
        }

        $price = parsePortuguesePrice((string)$priceRaw);
        if ($price === null) {
            continue;
        }

        $fuelIndex = $fuelIndexMap[$slug];
        $millis = (int)round($price * 1000);
        $sum = $millis * $numPostos;

        if (!isset($days[$date])) {
            $days[$date] = ['n' => emptyBucket(), 'p' => new \stdClass(), 'c' => new \stdClass()];
        }

        $days[$date]['n'][$fuelIndex * 2] += $sum;
        $days[$date]['n'][$fuelIndex * 2 + 1] += $numPostos;
    }

    return $days;
}

function indexPtMain(array $argv): void
{
    date_default_timezone_set('Europe/Lisbon');

    $opts = parseIndexArgs($argv);
    $dir = $opts['out'];
    if ($dir === INDEX_DEFAULT_OUT) {
        $dir = __DIR__ . '/../data/price-index-pt';
    }
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    $timezone = new \DateTimeZone('Europe/Lisbon');
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

    echo "== Índice de preços PT $from a $to ==\n";

    // Determine which months we need to query
    $months = [];
    for ($d = new \DateTime($from, $timezone); $d->format('Y-m-d') <= $to; $d->modify('+1 day')) {
        $mk = $d->format('Y-m');
        if (!isset($months[$mk])) {
            $months[$mk] = true;
        }
    }

    $added = 0;

    foreach (array_keys($months) as $monthKey) {
        // Determine month boundaries, clamped by from/to
        $monthStart = $monthKey . '-01';
        $monthEnd = (new \DateTime($monthStart, $timezone))
            ->modify('last day of this month')
            ->format('Y-m-d');

        $clampedStart = max($monthStart, $from);
        $clampedEnd = min($monthEnd, $to);

        // Load existing month file
        $monthPath = $dir . '/' . $monthKey . '.json';
        $monthFile = readMonthFile($monthPath, $monthKey);

        // Check which days actually need fetching
        $needsFetch = false;
        for ($d = new \DateTime($clampedStart, $timezone); $d->format('Y-m-d') <= $clampedEnd; $d->modify('+1 day')) {
            $iso = $d->format('Y-m-d');
            $refresh = $iso === $today || $iso === $yesterday;
            if (!isset($monthFile['days'][$iso]) || $refresh) {
                $needsFetch = true;
                break;
            }
        }

        if (!$needsFetch) {
            continue;
        }

        // Fetch entire month range from DGEG in one HTTP call
        $rows = fetchDgegMonth($clampedStart, $clampedEnd);
        if ($rows === null) {
            continue;
        }

        $dayBuckets = aggregatePtRows($rows);

        // Merge into month file
        for ($d = new \DateTime($clampedStart, $timezone); $d->format('Y-m-d') <= $clampedEnd; $d->modify('+1 day')) {
            $iso = $d->format('Y-m-d');
            $refresh = $iso === $today || $iso === $yesterday;

            if (isset($monthFile['days'][$iso]) && !$refresh) {
                continue;
            }

            if (isset($dayBuckets[$iso])) {
                $monthFile['days'][$iso] = $dayBuckets[$iso];
                $added++;
                // Count total stations from the first non-zero fuel
                $totalPostos = 0;
                $bucket = $dayBuckets[$iso]['n'];
                for ($f = 0; $f < count(INDEX_FUELS); $f++) {
                    $totalPostos = max($totalPostos, $bucket[$f * 2 + 1]);
                }
                echo "  $iso: $totalPostos postos (média nacional)\n";
            }
        }

        writeMonthFile($monthPath, $monthFile);
        usleep(500000); // Be polite to the DGEG API
    }

    writeManifest($dir);
    echo "Dias novos ou atualizados: $added\n";
}

if (isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    indexPtMain(array_slice($argv, 1));
}
