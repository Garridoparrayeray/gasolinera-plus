<?php

declare(strict_types=1);

use Core\Http;

const SOURCE_PT = 'https://precoscombustiveis.dgeg.gov.pt/api/PrecoComb/PesquisarPostos?idsTiposComb=&idMarca=&idTipoPosto=&idDistrito=&idsMunicipios=&qtdPorPagina=%d&pagina=%d';
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

function fetchPortugal(): array
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
    return ['fecha' => snapshotNow(), 'estaciones' => array_values($rows)];
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

function fetchFrance(): array
{
    $map = fuelSourceMap('fr');
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
            'Rótulo' => mb_strtoupper($town),
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
            'Horario' => frenchHours($record),
            'Latitud' => (string)((float)$record['latitude'] / 100000),
            'Longitud (WGS84)' => (string)((float)$record['longitude'] / 100000),
            'prices' => $prices,
        ];
    }
    return ['fecha' => snapshotNow(), 'estaciones' => $rows];
}
