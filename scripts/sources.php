<?php

declare(strict_types=1);

use Core\Http;

const SOURCE_PT = 'https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos?idsTiposComb=&idMarca=&idTipoPosto=&idDistrito=&idsMunicipios=&qtdPorPagina=%d&pagina=%d';
const SOURCE_PT_STATION = 'https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/GetDadosPosto?id=%s';
const PT_HOURS_REFRESH_DAYS = 7;
const SOURCE_FR = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/exports/json';
const SOURCE_FR_FIELDS = 'id,latitude,longitude,cp,ville,adresse,pop,departement,code_departement,region,code_region,horaires,horaires_automate_24_24,prix';
const SOURCE_MAX_PRICE_AGE_DAYS = 10;

function countriesConfig(): array
{
    return json_decode((string)file_get_contents(__DIR__ . '/../config/countries.json'), true);
}

function fuelSourceMap(string $country): array
{
    $map = [];
    foreach (json_decode((string)file_get_contents(__DIR__ . '/../config/fuels.json'), true) as $fuel) {
        if (isset($fuel['sources'][$country])) {
            $map[$fuel['sources'][$country]] = $fuel['slug'];
        }
    }
    return $map;
}

function httpGetWithRetries(string $url, int $timeout): string
{
    $lastError = null;
    for ($attempt = 1; $attempt <= 3; $attempt++) {
        try {
            return Http::get($url, $timeout);
        } catch (\RuntimeException $e) {
            $lastError = $e;
            fwrite(STDERR, "Intento $attempt fallido: " . $e->getMessage() . "\n");
            sleep(5 * $attempt);
        }
    }
    throw $lastError;
}

function snapshotNow(): string
{
    $now = new \DateTime('now', new \DateTimeZone('Europe/Madrid'));
    return $now->format('d/m/Y H:i:s');
}

function isRecentPrice(string $updatedAt): bool
{
    $time = strtotime($updatedAt);
    if ($time === false) {
        return false;
    }
    return $time >= time() - SOURCE_MAX_PRICE_AGE_DAYS * 86400;
}

function portugueseRange(?string $text): string
{
    $text = trim((string)$text);
    if ($text === '' || stripos($text, 'fechado') !== false) {
        return '';
    }
    if (stripos($text, '24') !== false && stripos($text, 'hora') !== false) {
        return '00:00-23:59';
    }
    if (!preg_match_all('/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/', $text, $matches, PREG_SET_ORDER)) {
        return '';
    }
    $ranges = [];
    foreach ($matches as $m) {
        $end = sprintf('%02d:%s', (int)$m[3], $m[4]);
        if ($end === '00:00' || $end === '24:00') {
            $end = '23:59';
        }
        $ranges[] = sprintf('%02d:%s', (int)$m[1], $m[2]) . '-' . $end;
    }
    return implode(' Y ', $ranges);
}

function portugueseHours(array $schedule): string
{
    $weekdays = portugueseRange(fieldStr($schedule, 'DiasUteis'));
    $saturday = portugueseRange(fieldStr($schedule, 'Sabado'));
    $sunday = portugueseRange(fieldStr($schedule, 'Domingo'));
    if ($weekdays === '' && $saturday === '' && $sunday === '') {
        return '';
    }
    if ($weekdays === '00:00-23:59' && $saturday === $weekdays && $sunday === $weekdays) {
        return 'L-D: 24H';
    }
    if ($weekdays !== '' && $saturday === $weekdays && $sunday === $weekdays) {
        return 'L-D: ' . $weekdays;
    }
    $blocks = [];
    if ($weekdays !== '') {
        $blocks[] = 'L-V: ' . $weekdays;
    }
    if ($saturday !== '') {
        $blocks[] = 'S: ' . $saturday;
    }
    if ($sunday !== '') {
        $blocks[] = 'D: ' . $sunday;
    }
    return implode('; ', $blocks);
}

function portugueseObservationsHours(string $obs): string
{
    $obs = trim($obs);
    if ($obs === '' || $obs === '-') {
        return '';
    }
    if (preg_match('/24\s*hora/i', $obs) || preg_match('/\b24\s*h\b/i', $obs)) {
        return 'L-D: 24H';
    }
    if (preg_match('/(?:das\s*)?(\d{1,2})(?:[hH:]|\.|\s*h\s*)(\d{2})?\s*(?:às|as|a|-|ate|\/)\s*(\d{1,2})(?:[hH:]|\.|\s*h\s*)(\d{2})?/iu', $obs, $m)) {
        $startH = (int)$m[1];
        $startM = '00';
        if (isset($m[2]) && $m[2] !== '') {
            $startM = $m[2];
        }
        $endH = (int)$m[3];
        $endM = '00';
        if (isset($m[4]) && $m[4] !== '') {
            $endM = $m[4];
        }
        $end = sprintf('%02d:%s', $endH, $endM);
        if ($end === '00:00' || $end === '24:00') {
            $end = '23:59';
        }
        return sprintf('L-D: %02d:%s-%s', $startH, $startM, $end);
    }
    return '';
}

function previousHours(?\PDO $pdo): array
{
    if ($pdo === null) {
        return [];
    }
    try {
        $rows = $pdo->query('SELECT ideess, horario_raw FROM stations')->fetchAll(\PDO::FETCH_KEY_PAIR);
    } catch (\Throwable $e) {
        return [];
    }
    return $rows;
}

function fetchPortugueseHoursOnce(array $ids, int $parallel): array
{
    $hours = [];
    $failed = [];
    foreach (array_chunk($ids, $parallel) as $batch) {
        $multi = curl_multi_init();
        $handles = [];
        foreach ($batch as $id) {
            $handle = curl_init(sprintf(SOURCE_PT_STATION, rawurlencode((string)$id)));
            curl_setopt_array($handle, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 25, CURLOPT_ENCODING => '']);
            curl_multi_add_handle($multi, $handle);
            $handles[$id] = $handle;
        }
        do {
            $status = curl_multi_exec($multi, $running);
            if ($running) {
                curl_multi_select($multi, 1.0);
            }
        } while ($running && $status === CURLM_OK);
        foreach ($handles as $id => $handle) {
            $data = json_decode((string)curl_multi_getcontent($handle), true);
            curl_multi_remove_handle($multi, $handle);
            curl_close($handle);
            if (!is_array($data) || !isset($data['resultado']) || !is_array($data['resultado'])) {
                $failed[] = $id;
                continue;
            }
            $h = '';
            if (isset($data['resultado']['HorarioPosto']) && is_array($data['resultado']['HorarioPosto'])) {
                $h = portugueseHours($data['resultado']['HorarioPosto']);
            }
            if ($h === '' && isset($data['resultado']['Observacoes'])) {
                $h = portugueseObservationsHours(fieldStr($data['resultado'], 'Observacoes'));
            }
            $hours[$id] = $h;
        }
        curl_multi_close($multi);
    }
    return ['hours' => $hours, 'failed' => $failed];
}

function fetchPortugueseHours(array $ids): array
{
    $hours = [];
    $pending = $ids;
    $parallel = 6;
    for ($round = 1; $round <= 4 && $pending !== []; $round++) {
        $result = fetchPortugueseHoursOnce($pending, $parallel);
        foreach ($result['hours'] as $id => $h) {
            $hours[$id] = $h;
        }
        $pending = $result['failed'];
        if ($pending !== []) {
            fwrite(STDERR, 'Horarios de Portugal: ' . count($pending) . " fichas sin respuesta en la ronda $round\n");
            $parallel = max(1, intdiv($parallel, 2));
            sleep(3 * $round);
        }
    }
    foreach ($hours as $id => $h) {
        if ($h === '') {
            unset($hours[$id]);
        }
    }
    return ['hours' => $hours, 'missing' => $pending];
}

function fetchPortugal(?\PDO $pdo = null): array
{
    $map = fuelSourceMap('pt');
    $rows = [];
    $page = 1;
    $total = null;
    $seen = 0;
    while ($total === null || $seen < $total) {
        $data = json_decode(httpGetWithRetries(sprintf(SOURCE_PT, 2000, $page), 90), true);
        if (!is_array($data) || !isset($data['resultado']) || !is_array($data['resultado'])) {
            throw new \RuntimeException('respuesta inesperada de la DGEG en la página ' . $page);
        }
        if (!$data['resultado']) {
            break;
        }
        foreach ($data['resultado'] as $item) {
            $seen++;
            $total = (int)$item['Quantidade'];
            $id = (string)$item['Id'];
            if (!isset($rows[$id])) {
                $brand = trim((string)$item['Marca']);
                if ($brand === '' || strcasecmp($brand, 'Genérico') === 0) {
                    $brand = trim((string)$item['Nome']);
                }
                $rows[$id] = [
                    'IDEESS' => $id,
                    'Rótulo' => mb_strtoupper($brand),
                    'Dirección' => trim((string)$item['Morada']),
                    'Localidad' => trim((string)$item['Localidade']),
                    'Municipio' => trim((string)$item['Municipio']),
                    'IDMunicipio' => trim((string)$item['Municipio']),
                    'Provincia' => trim((string)$item['Distrito']),
                    'IDProvincia' => trim((string)$item['Distrito']),
                    'IDCCAA' => '',
                    'C.P.' => trim((string)$item['CodPostal']),
                    'Margen' => '',
                    'Tipo Venta' => trim((string)$item['TipoPosto']),
                    'Horario' => '',
                    'Latitud' => (string)$item['Latitude'],
                    'Longitud (WGS84)' => (string)$item['Longitude'],
                    'prices' => [],
                ];
            }
            $fuel = (string)$item['Combustivel'];
            if (!isset($map[$fuel]) || !isRecentPrice((string)$item['DataAtualizacao'])) {
                continue;
            }
            $price = (float)str_replace(',', '.', preg_replace('/[^0-9,.]/', '', (string)$item['Preco']));
            if ($price > 0) {
                $rows[$id]['prices'][$map[$fuel]] = $price;
            }
        }
        $page++;
    }
    $previous = previousHours($pdo);
    $day = (int)date('z') % PT_HOURS_REFRESH_DAYS;
    $refresh = [];
    foreach ($rows as $id => $row) {
        if (isset($previous[$id]) && $previous[$id] !== '') {
            $rows[$id]['Horario'] = $previous[$id];
            if ((int)$id % PT_HOURS_REFRESH_DAYS !== $day) {
                continue;
            }
        }
        $refresh[] = $id;
    }
    echo 'Horarios de Portugal: ' . count($refresh) . " fichas a consultar\n";
    $fetched = fetchPortugueseHours($refresh);
    foreach ($fetched['hours'] as $id => $hours) {
        $rows[$id]['Horario'] = $hours;
    }
    echo 'Horarios de Portugal: ' . count($fetched['hours']) . ' con horario, ' . count($fetched['missing']) . " sin poder descargar\n";
    $osm = osmData('pt');
    foreach ($rows as $id => $row) {
        $rows[$id]['Horario'] = hoursOrOsm($rows[$id]['Horario'], $osm['hours'], (string)$id);
        if ($rows[$id]['Horario'] === '' && strcasecmp($row['Tipo Venta'], 'Auto-estrada') === 0) {
            $rows[$id]['Horario'] = 'L-D: 24H';
        }
    }
    return ['fecha' => snapshotNow(), 'estaciones' => array_values($rows)];
}

function frenchLabel(array $brands, string $id, string $town): string
{
    if (isset($brands[$id]) && trim((string)$brands[$id]) !== '') {
        return mb_strtoupper(trim((string)$brands[$id]));
    }
    return mb_strtoupper('Station ' . $town);
}

function frenchHours(array $record): string
{
    if (fieldStr($record, 'horaires_automate_24_24') === 'Oui') {
        return 'L-D: 24H';
    }
    $hours = json_decode(fieldStr($record, 'horaires'), true);
    if (!is_array($hours) || !isset($hours['jour']) || !is_array($hours['jour'])) {
        return '';
    }
    $codes = ['1' => 'L', '2' => 'M', '3' => 'X', '4' => 'J', '5' => 'V', '6' => 'S', '7' => 'D'];
    $blocks = [];
    foreach ($hours['jour'] as $day) {
        if (!isset($codes[fieldStr($day, '@id')]) || fieldStr($day, '@ferme') === '1' || !isset($day['horaire'])) {
            continue;
        }
        $spans = $day['horaire'];
        if (isset($spans['@ouverture'])) {
            $spans = [$spans];
        }
        $parts = [];
        foreach ($spans as $span) {
            $from = str_replace('.', ':', fieldStr($span, '@ouverture'));
            $to = str_replace('.', ':', fieldStr($span, '@fermeture'));
            if (preg_match('/^\d{1,2}:\d{2}$/', $from) && preg_match('/^\d{1,2}:\d{2}$/', $to)) {
                $parts[] = $from . '-' . $to;
            }
        }
        if ($parts) {
            $blocks[] = $codes[$day['@id']] . ': ' . implode(' Y ', $parts);
        }
    }
    return implode('; ', $blocks);
}

function osmData(string $country): array
{
    $empty = ['brands' => [], 'hours' => []];
    $path = __DIR__ . '/../data/osm-' . $country . '.json';
    if (!is_file($path)) {
        return $empty;
    }
    $data = json_decode((string)file_get_contents($path), true);
    if (!is_array($data)) {
        return $empty;
    }
    foreach (['brands', 'hours'] as $key) {
        if (!isset($data[$key]) || !is_array($data[$key])) {
            $data[$key] = [];
        }
    }
    return $data;
}

function hoursOrOsm(string $official, array $osmHours, string $id): string
{
    if ($official !== '') {
        return $official;
    }
    if (isset($osmHours[$id]) && is_string($osmHours[$id])) {
        return $osmHours[$id];
    }
    return '';
}

function fetchFrance(): array
{
    $map = fuelSourceMap('fr');
    $osm = osmData('fr');
    $brands = $osm['brands'];
    $osmHours = array_filter($osm['hours'], fn($hours) => $hours !== 'L-D: 24H');
    $records = json_decode(httpGetWithRetries(SOURCE_FR . '?select=' . SOURCE_FR_FIELDS, 180), true);
    if (!is_array($records)) {
        throw new \RuntimeException('respuesta inesperada de data.economie.gouv.fr');
    }
    $rows = [];
    foreach ($records as $record) {
        if (!isset($record['id'], $record['latitude'], $record['longitude'])) {
            continue;
        }
        $prices = [];
        $list = json_decode(fieldStr($record, 'prix'), true);
        if (is_array($list) && isset($list['@nom'])) {
            $list = [$list];
        }
        foreach ((array)$list as $item) {
            $key = strtolower(fieldStr($item, '@nom'));
            if (!isset($map[$key]) || !isRecentPrice(fieldStr($item, '@maj'))) {
                continue;
            }
            $price = (float)fieldStr($item, '@valeur');
            if ($price > 0) {
                $prices[$map[$key]] = $price;
            }
        }
        $town = trim(fieldStr($record, 'ville'));
        $margin = '';
        if (fieldStr($record, 'pop') === 'A') {
            $margin = 'A';
        }
        $rows[] = [
            'IDEESS' => (string)$record['id'],
            'Rótulo' => frenchLabel($brands, (string)$record['id'], $town),
            'Dirección' => trim(fieldStr($record, 'adresse')),
            'Localidad' => $town,
            'Municipio' => $town,
            'IDMunicipio' => fieldStr($record, 'cp'),
            'Provincia' => trim(fieldStr($record, 'departement')),
            'IDProvincia' => fieldStr($record, 'code_departement'),
            'IDCCAA' => fieldStr($record, 'code_region'),
            'C.P.' => fieldStr($record, 'cp'),
            'Margen' => $margin,
            'Tipo Venta' => '',
            'Horario' => hoursOrOsm(frenchHours($record), $osmHours, (string)$record['id']),
            'Latitud' => (string)((float)$record['latitude'] / 100000),
            'Longitud (WGS84)' => (string)((float)$record['longitude'] / 100000),
            'prices' => $prices,
        ];
    }
    return ['fecha' => snapshotNow(), 'estaciones' => $rows];
}
