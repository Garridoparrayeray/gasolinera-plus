<?php

declare(strict_types=1);

ini_set('memory_limit', '1024M');

require_once __DIR__ . '/build-price-index.php';

const INDEX_FR_ANNUAL_URL = 'https://donnees.roulez-eco.fr/opendata/annee/%d';
const INDEX_FR_DEFAULT_OUT = __DIR__ . '/../data/price-index-fr';
const FR_PRICE_MAX_AGE_DAYS = 30;

const FR_FUEL_MAP = [
    'gazole' => 0, // gasoleo_a
    'sp95'   => 1, // gasolina_95_e5
    'sp98'   => 3, // gasolina_98_e5
    'gplc'   => 4, // glp
];

function downloadAndExtractFrenchAnnualXml(int $year): ?string
{
    $url = sprintf(INDEX_FR_ANNUAL_URL, $year);
    $tempZip = sys_get_temp_dir() . "/fr_annuel_{$year}_" . getmypid() . '.zip';
    $tempXml = sys_get_temp_dir() . "/fr_annuel_{$year}_" . getmypid() . '.xml';

    echo "  Descargando archivo anual oficial de Francia {$year}...\n";
    $fp = fopen($tempZip, 'w');
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_FILE, $fp);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
    curl_setopt($ch, CURLOPT_TIMEOUT, 120);
    $ok = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);

    if (!$ok || $status !== 200 || filesize($tempZip) < 1000) {
        @unlink($tempZip);
        fwrite(STDERR, "Aviso: no se pudo descargar el archivo anual de Francia {$year} (HTTP $status)\n");
        return null;
    }

    $zip = new \ZipArchive();
    if ($zip->open($tempZip) !== true) {
        @unlink($tempZip);
        fwrite(STDERR, "Aviso: no se pudo abrir el ZIP de Francia {$year}\n");
        return null;
    }

    $xmlName = null;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if (str_ends_with(strtolower($name), '.xml')) {
            $xmlName = $name;
            break;
        }
    }
    if ($xmlName === null) {
        $zip->close();
        @unlink($tempZip);
        fwrite(STDERR, "Aviso: no se encontro XML dentro del ZIP de Francia {$year}\n");
        return null;
    }

    copy("zip://{$tempZip}#{$xmlName}", $tempXml);
    $zip->close();
    @unlink($tempZip);

    return $tempXml;
}

function processFrenchAnnualXml(string $xmlPath, array $datesNeeded, array &$monthBuckets): int
{
    if (empty($datesNeeded)) {
        return 0;
    }

    $reader = new \XMLReader();
    if (!$reader->open($xmlPath)) {
        fwrite(STDERR, "Aviso: no se pudo abrir el XML $xmlPath\n");
        return 0;
    }

    $currentStation = null;
    $changes = [];
    $processed = 0;

    $flush = function () use (&$currentStation, &$changes, &$monthBuckets, $datesNeeded, &$processed) {
        if ($currentStation === null || empty($changes)) {
            return;
        }
        $dept = $currentStation['dept'];
        $cell = $currentStation['cell'];

        foreach ($changes as $fIdx => $list) {
            usort($list, fn($a, $b) => strcmp($a['date'], $b['date']));

            foreach ($datesNeeded as $targetDate) {
                $lastPrice = null;
                $lastDate = null;
                foreach ($list as $item) {
                    if ($item['date'] <= $targetDate) {
                        $lastPrice = $item['valeur'];
                        $lastDate = $item['date'];
                    } else {
                        break;
                    }
                }
                if ($lastPrice !== null && (strtotime($targetDate) - strtotime($lastDate)) <= FR_PRICE_MAX_AGE_DAYS * 86400) {
                    $mKey = substr($targetDate, 0, 7);
                    if (!isset($monthBuckets[$mKey]['days'][$targetDate])) {
                        $monthBuckets[$mKey]['days'][$targetDate] = ['n' => emptyBucket(), 'p' => [], 'c' => []];
                    }
                    $day = &$monthBuckets[$mKey]['days'][$targetDate];
                    $millis = (int)round($lastPrice * 1000);
                    addSample($day['n'], $fIdx, $millis);
                    if ($dept !== '') {
                        if (!isset($day['p'][$dept])) {
                            $day['p'][$dept] = emptyBucket();
                        }
                        addSample($day['p'][$dept], $fIdx, $millis);
                    }
                    if ($cell !== null) {
                        if (!isset($day['c'][$cell])) {
                            $day['c'][$cell] = emptyBucket();
                        }
                        addSample($day['c'][$cell], $fIdx, $millis);
                    }
                }
            }
        }
        $processed++;
    };

    while ($reader->read()) {
        if ($reader->nodeType === \XMLReader::ELEMENT) {
            if ($reader->name === 'pdv') {
                $flush();
                $latRaw = (float)$reader->getAttribute('latitude');
                $lonRaw = (float)$reader->getAttribute('longitude');
                $lat = $latRaw / 100000;
                $lon = $lonRaw / 100000;
                $cp = (string)$reader->getAttribute('cp');
                $dept = substr($cp, 0, 2);
                $cell = null;
                if ($lat != 0.0 && $lon != 0.0) {
                    $cell = indexCellKey($lat, $lon);
                }
                $currentStation = ['dept' => $dept, 'cell' => $cell];
                $changes = [];
            } elseif ($reader->name === 'prix' && $currentStation !== null) {
                $nom = strtolower((string)$reader->getAttribute('nom'));
                if (isset(FR_FUEL_MAP[$nom])) {
                    $fIdx = FR_FUEL_MAP[$nom];
                    $maj = (string)$reader->getAttribute('maj');
                    $valeur = (float)$reader->getAttribute('valeur');
                    if ($valeur > 0 && strlen($maj) >= 10) {
                        $changes[$fIdx][] = ['date' => substr($maj, 0, 10), 'valeur' => $valeur];
                    }
                }
            }
        }
    }
    $flush();
    $reader->close();

    return $processed;
}

function indexFrMain(array $argv): void
{
    $opts = parseIndexArgs($argv);
    $dir = $opts['out'];
    if ($dir === INDEX_DEFAULT_OUT) {
        $dir = INDEX_FR_DEFAULT_OUT;
    }
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    $timezone = new \DateTimeZone('Europe/Paris');
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

    echo "== Indice de precios Francia $from a $to ==\n";

    // Load existing months into memory
    $monthFiles = [];
    $missingDaysByYear = [];
    $allMissingDays = [];

    for ($d = new \DateTime($from, $timezone); $d->format('Y-m-d') <= $to; $d->modify('+1 day')) {
        $iso = $d->format('Y-m-d');
        $mKey = substr($iso, 0, 7);
        if (!isset($monthFiles[$mKey])) {
            $monthFiles[$mKey] = readMonthFile($dir . '/' . $mKey . '.json', $mKey);
        }
        $refresh = $iso === $today || $iso === $yesterday;
        if (!isset($monthFiles[$mKey]['days'][$iso]) || $refresh) {
            $year = (int)substr($iso, 0, 4);
            $missingDaysByYear[$year][] = $iso;
            $allMissingDays[] = $iso;
        }
    }

    if (empty($allMissingDays)) {
        echo "Todos los dias solicitados ya estan presentes en el indice de Francia.\n";
        writeManifest($dir);
        return;
    }

    echo "Dias a procesar: " . count($allMissingDays) . " repartidos en " . count($missingDaysByYear) . " anio(s)\n";

    // If today is requested, we can use the instant feed for today if needed
    $instantHandled = false;
    if (in_array($today, $allMissingDays, true)) {
        echo "  Descargando snapshot instantaneo de Francia para {$today}...\n";
        try {
            $instant = fetchFrance();
            if (!empty($instant['estaciones'])) {
                $mKey = substr($today, 0, 7);
                $monthFiles[$mKey]['days'][$today] = aggregateSnapshot($instant['estaciones']);
                $instantHandled = true;
                echo "  {$today}: " . count($instant['estaciones']) . " estaciones incorporadas\n";
            }
        } catch (\Throwable $e) {
            fwrite(STDERR, "Aviso: no se pudo obtener el snapshot instantaneo: {$e->getMessage()}\n");
        }
    }

    // Process annual XML for remaining historical days
    foreach ($missingDaysByYear as $year => $dates) {
        $datesToProcess = array_filter($dates, fn($d) => !($instantHandled && $d === $today));
        if (empty($datesToProcess)) {
            continue;
        }

        $xmlPath = downloadAndExtractFrenchAnnualXml($year);
        if ($xmlPath === null) {
            continue;
        }

        echo "  Procesando " . count($datesToProcess) . " dias del archivo {$year}...\n";
        $t0 = microtime(true);
        $stations = processFrenchAnnualXml($xmlPath, $datesToProcess, $monthFiles);
        @unlink($xmlPath);
        echo "  Archivo {$year} completado en " . round(microtime(true) - $t0, 2) . "s ($stations estaciones)\n";
    }

    // Save all modified months
    foreach ($monthFiles as $mKey => $monthData) {
        writeMonthFile($dir . '/' . $mKey . '.json', $monthData);
    }

    writeManifest($dir);
    echo "Indice de Francia generado y manifest actualizado en $dir\n";
}

if (isset($argv[0]) && realpath($argv[0]) === realpath(__FILE__)) {
    indexFrMain(array_slice($argv, 1));
}
