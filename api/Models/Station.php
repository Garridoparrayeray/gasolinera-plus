<?php

namespace Models;

use Services\OpeningHours;

class Station
{
    public function __construct(private \PDO $pdo)
    {
    }

    
    public function near(
        float $lat,
        float $lon,
        float $radiusKm,
        string $sort,
        ?string $fuel,
        bool $open24h,
        bool $openNow,
        int $staleStationDays,
        int $offset,
        int $limit
    ): array {
        $bbox = self::boundingBox($lat, $lon, $radiusKm);
        $rows = $this->fetchInBoundingBox($bbox, $fuel, $open24h, $staleStationDays);

        $candidates = [];
        foreach ($rows as $row) {
            $distanceKm = self::haversineKm($lat, $lon, (float)$row['lat'], (float)$row['lon']);
            if ($distanceKm > $radiusKm) {
                continue;
            }
            if ($openNow && $this->isOpenNow($row['horario_raw']) !== true) {
                continue;
            }
            $candidates[] = ['row' => $row, 'distanceKm' => $distanceKm];
        }

        return $this->sortPaginateAndBuild($candidates, $sort, $fuel, $offset, $limit);
    }

    
    public function search(
        string $query,
        ?float $lat,
        ?float $lon,
        string $sort,
        ?string $fuel,
        bool $open24h,
        bool $openNow,
        int $staleStationDays,
        int $offset,
        int $limit,
        ?array $mergePlace = null,
        float $mergeRadiusKm = 10.0
    ): array {
        $normalized = Search::normalize($query);
        $like = '%' . $normalized . '%';
        $rawQuery = trim($query);
        $cpLike = $rawQuery . '%';

        $where = 'WHERE (municipio_normalizado LIKE :q1 OR direccion_normalizada LIKE :q2 OR rotulo_normalizado LIKE :q3 OR cp LIKE :q4 OR localidad_normalizada LIKE :q5)';
        $params = ['q1' => $like, 'q2' => $like, 'q3' => $like, 'q4' => $cpLike, 'q5' => $like];
        $where .= self::staleClause($staleStationDays);
        if ($open24h) {
            $where .= ' AND is_24h = 1';
        }
        if ($fuel !== null) {
            $where .= ' AND EXISTS (SELECT 1 FROM current_prices cp WHERE cp.ideess = stations.ideess AND cp.carburante = :fuel)';
            $params['fuel'] = $fuel;
        }

        $stmt = $this->pdo->prepare("
            SELECT ideess, rotulo, direccion, municipio, localidad, cp, lat, lon, horario_raw, is_24h
            FROM stations
            $where
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $candidates = [];
        $seenIdeess = [];
        foreach ($rows as $row) {
            $distanceKm = null;
            if ($lat !== null && $lon !== null) {
                $distanceKm = self::haversineKm($lat, $lon, (float)$row['lat'], (float)$row['lon']);
            }
            if ($openNow && $this->isOpenNow($row['horario_raw']) !== true) {
                continue;
            }
            $seenIdeess[$row['ideess']] = true;
            $candidates[] = [
                'row' => $row,
                'distanceKm' => $distanceKm,
                'relevance' => $this->relevanceScore($row, $normalized, $rawQuery),
            ];
        }

        if ($mergePlace !== null) {
            $bbox = self::boundingBox($mergePlace['lat'], $mergePlace['lon'], $mergeRadiusKm);
            $nearbyRows = $this->fetchInBoundingBox($bbox, $fuel, $open24h, $staleStationDays);
            foreach ($nearbyRows as $row) {
                if (isset($seenIdeess[$row['ideess']])) {
                    continue;
                }
                $placeDistanceKm = self::haversineKm($mergePlace['lat'], $mergePlace['lon'], (float)$row['lat'], (float)$row['lon']);
                if ($placeDistanceKm > $mergeRadiusKm) {
                    continue;
                }
                if ($openNow && $this->isOpenNow($row['horario_raw']) !== true) {
                    continue;
                }
                $distanceKm = null;
                if ($lat !== null && $lon !== null) {
                    $distanceKm = self::haversineKm($lat, $lon, (float)$row['lat'], (float)$row['lon']);
                }
                $seenIdeess[$row['ideess']] = true;
                $candidates[] = [
                    'row' => $row,
                    'distanceKm' => $distanceKm,
                    'relevance' => 6,
                ];
            }
        }

        return $this->sortPaginateAndBuild($candidates, $sort, $fuel, $offset, $limit);
    }

    
    
    public function suggestPlaces(string $query, int $limit): array
    {
        $normalized = Search::normalize($query);
        if ($normalized === '') {
            return [];
        }
        $like = $normalized . '%';

        $stmt = $this->pdo->prepare('
            SELECT label, sublabel FROM (
                SELECT DISTINCT municipio AS label, provincia AS sublabel, 0 AS grupo
                FROM stations
                WHERE municipio_normalizado LIKE :like1
                UNION
                SELECT DISTINCT localidad AS label, municipio || \', \' || provincia AS sublabel, 1 AS grupo
                FROM stations
                WHERE localidad_normalizada LIKE :like2 AND localidad_normalizada != municipio_normalizado
            )
            ORDER BY grupo ASC, label ASC
            LIMIT :limit
        ');
        $stmt->bindValue(':like1', $like, \PDO::PARAM_STR);
        $stmt->bindValue(':like2', $like, \PDO::PARAM_STR);
        $stmt->bindValue(':limit', $limit, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }

    public function looksLikePlaceQuery(string $query): bool
    {
        $normalized = Search::normalize($query);
        if ($normalized === '') {
            return false;
        }
        $stmt = $this->pdo->prepare('SELECT 1 FROM stations WHERE municipio_normalizado LIKE ? OR localidad_normalizada LIKE ? LIMIT 1');
        $stmt->execute([$normalized . '%', $normalized . '%']);
        return $stmt->fetchColumn() !== false;
    }

    
    private function relevanceScore(array $row, string $normalizedQuery, string $rawQuery): int
    {
        if ($normalizedQuery === '') {
            return 5;
        }
        $municipio = Search::normalize($row['municipio']);
        $localidadRaw = '';
        if (isset($row['localidad'])) {
            $localidadRaw = $row['localidad'];
        }
        $localidad = Search::normalize($localidadRaw);
        if ($municipio === $normalizedQuery || $localidad === $normalizedQuery || (string)$row['cp'] === $rawQuery) {
            return 0;
        }
        if (str_starts_with($municipio, $normalizedQuery) || str_starts_with($localidad, $normalizedQuery)) {
            return 1;
        }
        if ($rawQuery !== '' && str_starts_with((string)$row['cp'], $rawQuery)) {
            return 2;
        }
        if (str_contains($municipio, $normalizedQuery) || str_contains($localidad, $normalizedQuery)) {
            return 3;
        }
        if (str_contains(Search::normalize($row['rotulo']), $normalizedQuery)) {
            return 4;
        }
        return 5;
    }

    
    public function withinBounds(
        float $north,
        float $south,
        float $east,
        float $west,
        ?string $fuel,
        bool $open24h,
        int $staleStationDays,
        int $maxStations
    ): array {
        $where = 'WHERE lat BETWEEN :south AND :north AND lon BETWEEN :west AND :east';
        $where .= self::staleClause($staleStationDays);
        $params = ['south' => $south, 'north' => $north, 'west' => $west, 'east' => $east];
        if ($open24h) {
            $where .= ' AND is_24h = 1';
        }

        $stmt = $this->pdo->prepare("
            SELECT ideess, rotulo, lat, lon, is_24h
            FROM stations
            $where
        ");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $priceMap = [];
        if ($fuel !== null) {
            $priceMap = $this->batchFuelPrices(array_column($rows, 'ideess'), $fuel);
        }

        $results = [];
        foreach ($rows as $row) {
            if ($fuel !== null) {
                if (!isset($priceMap[$row['ideess']])) {
                    continue;
                }
                $precio = $priceMap[$row['ideess']];
            } else {
                $precio = null;
            }
            $results[] = [
                'ideess' => $row['ideess'],
                'rotulo' => $row['rotulo'],
                'lat' => (float)$row['lat'],
                'lon' => (float)$row['lon'],
                'is24h' => (bool)$row['is_24h'],
                'precio' => $precio,
            ];
        }

        $total = count($results);
        $truncated = $total > $maxStations;
        if ($truncated) {
            $step = $total / $maxStations;
            $sampled = [];
            for ($i = 0; $i < $maxStations; $i++) {
                $sampled[] = $results[(int)floor($i * $step)];
            }
            $results = $sampled;
        }
        return ['stations' => $results, 'total' => $total, 'truncated' => $truncated];
    }

    
    private function batchFuelPrices(array $ideessList, string $fuel): array
    {
        $result = [];
        if (empty($ideessList)) {
            return $result;
        }

        foreach (array_chunk($ideessList, 400) as $chunk) {
            $idPlaceholders = implode(',', array_fill(0, count($chunk), '?'));
            $stmt = $this->pdo->prepare("
                SELECT ideess, precio FROM current_prices
                WHERE carburante = ? AND ideess IN ($idPlaceholders)
            ");
            $stmt->execute([$fuel, ...$chunk]);
            foreach ($stmt->fetchAll() as $row) {
                $result[$row['ideess']] = (float)$row['precio'];
            }
        }

        return $result;
    }

    
    public function find(string $ideess): ?array
    {
        $stmt = $this->pdo->prepare('SELECT * FROM stations WHERE ideess = ?');
        $stmt->execute([$ideess]);
        $row = $stmt->fetch();
        if ($row === false) {
            return null;
        }

        $pricesById = $this->batchAllPrices([$ideess]);
        $stationPrices = [];
        if (isset($pricesById[$ideess])) {
            $stationPrices = $pricesById[$ideess];
        }
        $trends = $this->batchTrends([$ideess], array_keys($stationPrices), $pricesById);
        $fuels = [];
        foreach ($stationPrices as $slug => $precio) {
            $trend = null;
            if (isset($trends[$ideess][$slug])) {
                $trend = $trends[$ideess][$slug];
            }
            $fuels[$slug] = ['precio' => $precio, 'tendencia' => $trend];
        }

        return [
            'ideess' => $row['ideess'],
            'rotulo' => $row['rotulo'],
            'direccion' => $row['direccion'],
            'localidad' => $row['localidad'],
            'municipio' => $row['municipio'],
            'municipioId' => $row['municipio_id'],
            'provincia' => $row['provincia'],
            'cp' => $row['cp'],
            'lat' => (float)$row['lat'],
            'lon' => (float)$row['lon'],
            'is24h' => (bool)$row['is_24h'],
            'horario' => OpeningHours::describe($row['horario_raw'], new \DateTime('now', new \DateTimeZone('Europe/Madrid'))),
            'combustibles' => $fuels,
            'lastSeenDate' => $row['last_seen_date'],
        ];
    }

    
    private function batchAllPrices(array $ideessList): array
    {
        $result = [];
        foreach (array_chunk($ideessList, 400) as $chunk) {
            $placeholders = implode(',', array_fill(0, count($chunk), '?'));
            $stmt = $this->pdo->prepare("SELECT ideess, carburante, precio FROM current_prices WHERE ideess IN ($placeholders)");
            $stmt->execute($chunk);
            foreach ($stmt->fetchAll() as $row) {
                $result[$row['ideess']][$row['carburante']] = (float)$row['precio'];
            }
        }
        return $result;
    }

    private function batchTrends(array $ideessList, array $fuels, array $pricesById): array
    {
        $trends = [];
        if (empty($ideessList) || empty($fuels)) {
            return $trends;
        }
        $fuelPlaceholders = implode(',', array_fill(0, count($fuels), '?'));
        foreach (array_chunk($ideessList, 200) as $chunk) {
            $idPlaceholders = implode(',', array_fill(0, count($chunk), '?'));
            $stmt = $this->pdo->prepare("
                SELECT ideess, carburante, precio FROM price_history
                WHERE ideess IN ($idPlaceholders) AND carburante IN ($fuelPlaceholders)
                ORDER BY ideess, carburante, fecha DESC
            ");
            $stmt->execute([...$chunk, ...$fuels]);
            $seen = [];
            foreach ($stmt->fetchAll() as $row) {
                $key = $row['ideess'] . '|' . $row['carburante'];
                if (!isset($seen[$key])) {
                    $seen[$key] = 1;
                    continue;
                }
                if ($seen[$key] > 1) {
                    continue;
                }
                $seen[$key] = 2;
                if (!isset($pricesById[$row['ideess']][$row['carburante']])) {
                    continue;
                }
                $today = $pricesById[$row['ideess']][$row['carburante']];
                $previous = (float)$row['precio'];
                $trend = 'down';
                if (abs($today - $previous) < 0.0005) {
                    $trend = 'same';
                } elseif ($today > $previous) {
                    $trend = 'up';
                }
                $trends[$row['ideess']][$row['carburante']] = $trend;
            }
        }
        return $trends;
    }

    
    public function zoneComparison(string $ideess, string $fuel): ?array
    {
        $stmt = $this->pdo->prepare('SELECT municipio_id FROM stations WHERE ideess = ?');
        $stmt->execute([$ideess]);
        $municipioId = $stmt->fetchColumn();
        if ($municipioId === false) {
            return null;
        }

        $ownStmt = $this->pdo->prepare('SELECT precio FROM current_prices WHERE ideess = ? AND carburante = ?');
        $ownStmt->execute([$ideess, $fuel]);
        $ownPrice = $ownStmt->fetchColumn();
        if ($ownPrice === false) {
            return null;
        }

        $avgStmt = $this->pdo->prepare('
            SELECT AVG(cp.precio) AS media, COUNT(*) AS n
            FROM current_prices cp
            JOIN stations s ON s.ideess = cp.ideess
            WHERE s.municipio_id = ? AND cp.carburante = ? AND cp.ideess != ?
        ');
        $avgStmt->execute([$municipioId, $fuel, $ideess]);
        $avgRow = $avgStmt->fetch();
        if ($avgRow === false || $avgRow['media'] === null) {
            return null;
        }

        return [
            'precioPropio' => (float)$ownPrice,
            'mediaZona' => round((float)$avgRow['media'], 4),
            'estacionesEnMedia' => (int)$avgRow['n'],
        ];
    }

    
    private static function boundingBox(float $lat, float $lon, float $radiusKm): array
    {
        $deltaLat = $radiusKm / 111.0;
        $cosLat = cos(deg2rad($lat));
        if (abs($cosLat) < 0.01) {
            $cosLat = 0.01;
        }
        $deltaLon = $radiusKm / (111.0 * $cosLat);
        return [
            'north' => $lat + $deltaLat,
            'south' => $lat - $deltaLat,
            'east' => $lon + $deltaLon,
            'west' => $lon - $deltaLon,
        ];
    }

    
    private static function haversineKm(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $earthRadiusKm = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));
        return $earthRadiusKm * $c;
    }

    private function fetchInBoundingBox(array $bbox, ?string $fuel, bool $open24h, int $staleStationDays): array
    {
        $where = 'WHERE lat BETWEEN :south AND :north AND lon BETWEEN :west AND :east';
        $params = ['south' => $bbox['south'], 'north' => $bbox['north'], 'west' => $bbox['west'], 'east' => $bbox['east']];
        $where .= self::staleClause($staleStationDays);
        if ($open24h) {
            $where .= ' AND is_24h = 1';
        }

        $stmt = $this->pdo->prepare("
            SELECT ideess, rotulo, direccion, municipio, lat, lon, horario_raw, is_24h
            FROM stations
            $where
        ");
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    
    private static function staleClause(int $staleStationDays): string
    {
        return " AND last_seen_date >= date('now', '-$staleStationDays days')";
    }

    private function buildListItem(array $row, ?float $distanceKm, array $showFuels, array $pricesById, array $trends): array
    {
        $allPrices = [];
        if (isset($pricesById[$row['ideess']])) {
            $allPrices = $pricesById[$row['ideess']];
        }

        $distanciaKmRounded = null;
        if ($distanceKm !== null) {
            $distanciaKmRounded = round($distanceKm, 2);
        }

        $item = [
            'ideess' => $row['ideess'],
            'rotulo' => $row['rotulo'],
            'direccion' => $row['direccion'],
            'municipio' => $row['municipio'],
            'lat' => (float)$row['lat'],
            'lon' => (float)$row['lon'],
            'is24h' => (bool)$row['is_24h'],
            'horarioRaw' => $row['horario_raw'],
            'distanciaKm' => $distanciaKmRounded,
            'precios' => [],
            'tendencias' => [],
        ];

        foreach ($showFuels as $slug) {
            if (!isset($allPrices[$slug])) {
                continue;
            }
            $item['precios'][$slug] = $allPrices[$slug];
            $item['tendencias'][$slug] = null;
            if (isset($trends[$row['ideess']][$slug])) {
                $item['tendencias'][$slug] = $trends[$row['ideess']][$slug];
            }
        }

        return $item;
    }

    
    private function relevanceOf(array $candidate): int
    {
        if (isset($candidate['relevance'])) {
            return $candidate['relevance'];
        }
        return 0;
    }

    private function isOpenNow(string $horarioRaw): ?bool
    {
        return OpeningHours::isOpenAt($horarioRaw, new \DateTime('now', new \DateTimeZone('Europe/Madrid')));
    }

    
    private function sortPaginateAndBuild(array $candidates, string $sort, ?string $fuel, int $offset, int $limit): array
    {
        if ($fuel !== null) {
            $ideessList = array_map(fn($c) => $c['row']['ideess'], $candidates);
            $hasFuel = $this->batchHasFuel($ideessList, $fuel);
            $candidates = array_values(array_filter($candidates, function ($c) use ($hasFuel) {
                if (isset($hasFuel[$c['row']['ideess']])) {
                    return $hasFuel[$c['row']['ideess']];
                }
                return false;
            }));
        }

        if ($sort === 'distance') {
            usort($candidates, function ($a, $b) {
                $relevanceCmp = $this->relevanceOf($a) <=> $this->relevanceOf($b);
                if ($relevanceCmp !== 0) {
                    return $relevanceCmp;
                }
                if ($a['distanceKm'] === null && $b['distanceKm'] === null) {
                    return 0;
                }
                if ($a['distanceKm'] === null) {
                    return 1;
                }
                if ($b['distanceKm'] === null) {
                    return -1;
                }
                return $a['distanceKm'] <=> $b['distanceKm'];
            });
        } else {
            $sortFuel = $fuel;
            if ($sortFuel === null) {
                $sortFuel = 'gasoleo_a';
            }
            $ideessList = array_map(fn($c) => $c['row']['ideess'], $candidates);
            $priceMap = $this->batchSortPrices($ideessList, $sortFuel);
            usort($candidates, function ($a, $b) use ($priceMap) {
                $relevanceCmp = $this->relevanceOf($a) <=> $this->relevanceOf($b);
                if ($relevanceCmp !== 0) {
                    return $relevanceCmp;
                }
                $priceA = $priceMap[$a['row']['ideess']];
                $priceB = $priceMap[$b['row']['ideess']];
                if ($priceA === null && $priceB === null) {
                    return 0;
                }
                if ($priceA === null) {
                    return 1;
                }
                if ($priceB === null) {
                    return -1;
                }
                return $priceA <=> $priceB;
            });
        }

        $total = count($candidates);
        $page = array_slice($candidates, $offset, $limit);

        $showFuels = ['gasoleo_a', 'gasolina_95_e5'];
        if ($fuel !== null && !in_array($fuel, $showFuels, true)) {
            $showFuels[] = $fuel;
        }
        $pageIds = array_map(fn($c) => $c['row']['ideess'], $page);
        $pricesById = $this->batchAllPrices($pageIds);
        $trends = $this->batchTrends($pageIds, $showFuels, $pricesById);

        $items = [];
        foreach ($page as $candidate) {
            $items[] = $this->buildListItem($candidate['row'], $candidate['distanceKm'], $showFuels, $pricesById, $trends);
        }

        return ['items' => $items, 'total' => $total];
    }

    
    
    private function batchHasFuel(array $ideessList, string $fuel): array
    {
        $result = array_fill_keys($ideessList, false);
        if (empty($ideessList)) {
            return $result;
        }

        foreach (array_chunk($ideessList, 400) as $chunk) {
            $idPlaceholders = implode(',', array_fill(0, count($chunk), '?'));
            $stmt = $this->pdo->prepare("
                SELECT ideess FROM current_prices
                WHERE carburante = ? AND ideess IN ($idPlaceholders)
            ");
            $stmt->execute([$fuel, ...$chunk]);
            foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $ideess) {
                $result[$ideess] = true;
            }
        }

        return $result;
    }

    private function batchSortPrices(array $ideessList, string $sortFuel): array
    {
        $result = array_fill_keys($ideessList, null);
        if (empty($ideessList)) {
            return $result;
        }

        $fuels = [$sortFuel];
        if ($sortFuel !== 'gasolina_95_e5') {
            $fuels[] = 'gasolina_95_e5';
        }
        $fuelPlaceholders = implode(',', array_fill(0, count($fuels), '?'));

        foreach (array_chunk($ideessList, 400) as $chunk) {
            $idPlaceholders = implode(',', array_fill(0, count($chunk), '?'));
            $stmt = $this->pdo->prepare("
                SELECT ideess, carburante, precio FROM current_prices
                WHERE ideess IN ($idPlaceholders) AND carburante IN ($fuelPlaceholders)
            ");
            $stmt->execute([...$chunk, ...$fuels]);

            $byStation = [];
            foreach ($stmt->fetchAll() as $row) {
                $byStation[$row['ideess']][$row['carburante']] = (float)$row['precio'];
            }
            foreach ($chunk as $ideess) {
                $prices = [];
                if (isset($byStation[$ideess])) {
                    $prices = $byStation[$ideess];
                }
                if (isset($prices[$sortFuel])) {
                    $result[$ideess] = $prices[$sortFuel];
                } elseif (isset($prices['gasolina_95_e5'])) {
                    $result[$ideess] = $prices['gasolina_95_e5'];
                }
            }
        }

        return $result;
    }
}
