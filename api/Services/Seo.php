<?php

declare(strict_types=1);

namespace Services;

require_once __DIR__ . '/OpeningHours.php';

class Seo
{
    public const PROFILES = [
        'es' => ['section' => 'gasolineras', 'report' => 'informe', 'archive' => 'historico', 'lang' => 'es', 'locale' => 'es_ES', 'iso' => 'ES', 'fuels' => ['gasoleo_a', 'gasolina_95_e5', 'gasoleo_premium', 'gasolina_98_e5']],
        'pt' => ['section' => 'postos', 'report' => 'relatorio', 'archive' => 'historico', 'lang' => 'pt', 'locale' => 'pt_PT', 'iso' => 'PT', 'fuels' => ['gasoleo_a', 'gasolina_95_e5', 'gasoleo_premium', 'gasolina_98_premium']],
        'fr' => ['section' => 'stations-service', 'report' => 'rapport', 'archive' => 'archives', 'lang' => 'fr', 'locale' => 'fr_FR', 'iso' => 'FR', 'fuels' => ['gasoleo_a', 'gasolina_95_e10', 'gasolina_98_e5', 'gasolina_95_e85']],
    ];

    private static array $dictionaries = [];
    private static ?array $fuelCatalog = null;

    public static function profile(?string $code = null): array
    {
        if ($code === null) {
            $code = \Core\Country::code();
        }
        $profile = self::PROFILES[$code];
        $profile['headline'] = \Core\Country::all()[$code]['headline'];
        return $profile;
    }

    public static function lang(): string
    {
        return self::profile()['lang'];
    }

    public static function t(string $key, array $vars = [], ?string $lang = null): string
    {
        if ($lang === null) {
            $lang = self::lang();
        }
        if (!isset(self::$dictionaries[$lang])) {
            self::$dictionaries[$lang] = json_decode((string)file_get_contents(__DIR__ . '/../../config/i18n/' . $lang . '.json'), true);
        }
        $text = $key;
        if (isset(self::$dictionaries[$lang][$key])) {
            $text = self::$dictionaries[$lang][$key];
        }
        $vars['fuente'] = \Core\Country::current()['source'];
        if (!isset($vars['pais'])) {
            $vars['pais'] = \Core\Country::current()['name'][$lang];
        }
        foreach ($vars as $name => $value) {
            $text = str_replace('{' . $name . '}', (string)$value, $text);
        }
        return $text;
    }

    public static function fuels(): array
    {
        if (self::$fuelCatalog === null) {
            self::$fuelCatalog = [];
            foreach (json_decode((string)file_get_contents(__DIR__ . '/../../config/fuels.json'), true) as $fuel) {
                self::$fuelCatalog[$fuel['slug']] = $fuel;
            }
        }
        $out = [];
        foreach (self::profile()['fuels'] as $slug) {
            $out[$slug] = self::$fuelCatalog[$slug]['label'][self::lang()];
        }
        return $out;
    }

    public static function fuelLabel(string $slug): string
    {
        self::fuels();
        return self::$fuelCatalog[$slug]['label'][self::lang()];
    }

    public static function base(): string
    {
        return self::siteUrl() . \Core\Country::prefix(\Core\Country::code());
    }

    public static function sectionUrl(): string
    {
        return \Core\Country::prefix(\Core\Country::code()) . '/' . self::profile()['section'];
    }

    public static function stationPath(string $ideess): string
    {
        return \Core\Country::prefix(\Core\Country::code()) . '/stations/' . rawurlencode($ideess);
    }

    public static function trim(string $text, int $max): string
    {
        if (mb_strlen($text) <= $max) {
            return $text;
        }
        $cut = mb_substr($text, 0, $max - 1);
        $space = mb_strrpos($cut, ' ');
        if ($space !== false && $space > $max * 0.6) {
            $cut = mb_substr($cut, 0, $space);
        }
        return rtrim($cut, " ,.;:·") . '…';
    }

    public static function date(string $iso): string
    {
        $months = [
            'es' => ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
            'pt' => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
            'fr' => ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
        ];
        $parts = explode('-', $iso);
        if (count($parts) !== 3) {
            return $iso;
        }
        $lang = self::lang();
        $month = $months[$lang][(int)$parts[1] - 1];
        if ($lang === 'fr') {
            return (int)$parts[2] . ' ' . $month . ' ' . $parts[0];
        }
        return (int)$parts[2] . ' de ' . $month . ' de ' . $parts[0];
    }

    public static function monthYear(string $iso): string
    {
        return (string)preg_replace('/^\d{1,2} (de )?/u', '', self::date($iso));
    }

    private const ARTICLES = ['A', 'LA', 'LAS', 'LOS', 'EL', 'ILLES', 'ELS', 'L\'', 'ES'];

    public static function siteUrl(): string
    {
        $env = getenv('GP_SITE_URL');
        if (is_string($env) && $env !== '') {
            return rtrim($env, '/');
        }
        return 'https://gasolineraplus.app';
    }

    public static function verificationToken(): string
    {
        $env = getenv('GP_GSC_VERIFICATION');
        if (is_string($env) && $env !== '') {
            return $env;
        }
        return 'd7akLe3xucjSHfxtm75cUFm5NyeE8X2NEX3f8knOGYU';
    }

    public static function escape(string $text): string
    {
        return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    }

    public static function slug(string $text): string
    {
        $text = mb_strtolower($text, 'UTF-8');
        $text = strtr($text, [
            'á' => 'a', 'à' => 'a', 'ä' => 'a', 'â' => 'a', 'ã' => 'a', 'æ' => 'ae', 'œ' => 'oe', 'õ' => 'o', 'ÿ' => 'y',
            'é' => 'e', 'è' => 'e', 'ë' => 'e', 'ê' => 'e',
            'í' => 'i', 'ì' => 'i', 'ï' => 'i', 'î' => 'i',
            'ó' => 'o', 'ò' => 'o', 'ö' => 'o', 'ô' => 'o',
            'ú' => 'u', 'ù' => 'u', 'ü' => 'u', 'û' => 'u',
            'ñ' => 'n', 'ç' => 'c', '·' => '',
        ]);
        $text = preg_replace('/[^a-z0-9]+/', '-', $text);
        return trim((string)$text, '-');
    }

    public static function display(string $name): string
    {
        $name = trim($name);
        if (preg_match('/^(.*?)\s*\(([^)]+)\)$/u', $name, $m)) {
            $article = mb_strtoupper($m[2], 'UTF-8');
            if (in_array($article, self::ARTICLES, true)) {
                $rest = $m[1];
                if ($rest === mb_strtoupper($rest, 'UTF-8')) {
                    $rest = self::titleCase($rest);
                }
                $name = self::titleCase($m[2]) . ' ' . $rest;
            }
        }
        if ($name === mb_strtoupper($name, 'UTF-8')) {
            return self::titleCase($name);
        }
        return $name;
    }

    public static function titleCase(string $text): string
    {
        return mb_convert_case(mb_strtolower($text, 'UTF-8'), MB_CASE_TITLE, 'UTF-8');
    }

    public static function price(float $value): string
    {
        return number_format($value, 3, ',', '.');
    }

    public static function jsonLd(array $data): string
    {
        $json = json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);
        return '<script type="application/ld+json">' . $json . '</script>';
    }

    public static function provinces(\PDO $pdo): array
    {
        $rows = $pdo->query('SELECT provincia, COUNT(*) AS n FROM stations GROUP BY provincia ORDER BY provincia')->fetchAll();
        $out = [];
        foreach ($rows as $row) {
            $slug = self::slug(self::display($row['provincia']));
            if ($slug === '') {
                continue;
            }
            $out[$slug] = ['raw' => $row['provincia'], 'name' => self::display($row['provincia']), 'slug' => $slug, 'n' => (int)$row['n']];
        }
        return $out;
    }

    public static function municipalities(\PDO $pdo, string $province): array
    {
        $stmt = $pdo->prepare('SELECT municipio, COUNT(*) AS n FROM stations WHERE provincia = ? GROUP BY municipio ORDER BY municipio');
        $stmt->execute([$province]);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $slug = self::slug(self::display($row['municipio']));
            if ($slug === '') {
                continue;
            }
            if (isset($out[$slug])) {
                $out[$slug]['n'] += (int)$row['n'];
                $out[$slug]['raws'][] = $row['municipio'];
                continue;
            }
            $out[$slug] = ['raw' => $row['municipio'], 'raws' => [$row['municipio']], 'name' => self::display($row['municipio']), 'slug' => $slug, 'n' => (int)$row['n']];
        }
        return $out;
    }

    public static function nationalHeadline(\PDO $pdo): array
    {
        $headlineFuels = self::profile()['headline'];
        $stmt = $pdo->prepare('SELECT fecha, carburante, media, estaciones FROM national_price_history WHERE carburante IN (?, ?) ORDER BY fecha DESC LIMIT 6');
        $stmt->execute($headlineFuels);
        $series = [];
        foreach ($stmt->fetchAll() as $row) {
            $series[$row['carburante']][] = $row;
        }
        $headline = [];
        foreach (self::profile()['headline'] as $fuel) {
            if (empty($series[$fuel])) {
                continue;
            }
            $today = $series[$fuel][0];
            $delta = null;
            if (isset($series[$fuel][1])) {
                $delta = (float)$today['media'] - (float)$series[$fuel][1]['media'];
            }
            $headline[$fuel] = [
                'fecha' => (string)$today['fecha'],
                'media' => (float)$today['media'],
                'estaciones' => (int)$today['estaciones'],
                'delta' => $delta,
            ];
        }
        return $headline;
    }

    public static function lastUpdate(\PDO $pdo): string
    {
        $value = $pdo->query('SELECT MAX(fecha) FROM current_prices')->fetchColumn();
        if (is_string($value) && $value !== '') {
            return $value;
        }
        return date('Y-m-d');
    }

    public static function freshClause(): string
    {
        return "s.last_seen_date >= date((SELECT MAX(last_seen_date) FROM stations), '-10 days')";
    }

    public static function fuelPlaceholders(): string
    {
        return implode(',', array_fill(0, count(self::profile()['fuels']), '?'));
    }

    public static function averages(\PDO $pdo, string $whereSql, array $params): array
    {
        $sql = 'SELECT p.carburante, AVG(p.precio) AS media, MIN(p.precio) AS minimo, MAX(p.precio) AS maximo, COUNT(*) AS n
            FROM current_prices p JOIN stations s ON s.ideess = p.ideess
            WHERE ' . $whereSql . ' AND ' . self::freshClause() . ' AND p.carburante IN (' . self::fuelPlaceholders() . ')
            GROUP BY p.carburante';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($params, self::profile()['fuels']));
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[$row['carburante']] = $row;
        }
        return $out;
    }

    public static function cheapest(\PDO $pdo, string $whereSql, array $params, string $fuel, int $limit): array
    {
        $sql = 'SELECT s.ideess, s.rotulo, s.direccion, s.municipio, s.cp, s.lat, s.lon, p.precio
            FROM stations s JOIN current_prices p ON p.ideess = s.ideess
            WHERE ' . $whereSql . ' AND ' . self::freshClause() . ' AND p.carburante = ?
            ORDER BY p.precio ASC, s.rotulo ASC LIMIT ' . (int)$limit;
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($params, [$fuel]));
        return $stmt->fetchAll();
    }

    public static function fuelShort(string $slug): string
    {
        self::fuels();
        $fuel = self::$fuelCatalog[$slug];
        return $fuel['short'][self::lang()] ?? $fuel['label'][self::lang()];
    }

    /**
     * Daily average of the headline fuels over the last $days snapshot days, newest first.
     * Returns [fecha => [carburante => media]].
     */
    public static function trend(\PDO $pdo, string $whereSql, array $params, int $days = 7): array
    {
        $fuels = self::profile()['headline'];
        $sql = 'SELECT h.fecha, h.carburante, AVG(h.precio) AS media
            FROM price_history h JOIN stations s ON s.ideess = h.ideess
            WHERE ' . $whereSql . ' AND ' . self::freshClause() . ' AND h.carburante IN (?, ?)
            AND h.fecha >= date((SELECT MAX(fecha) FROM price_history), ?)
            GROUP BY h.fecha, h.carburante ORDER BY h.fecha DESC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($params, $fuels, ['-' . max(1, $days - 1) . ' days']));
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(string)$row['fecha']][(string)$row['carburante']] = (float)$row['media'];
        }
        return $out;
    }

    /**
     * National daily average of the headline fuels over the last $days days, newest first.
     */
    public static function nationalTrend(\PDO $pdo, int $days = 30): array
    {
        $fuels = self::profile()['headline'];
        $stmt = $pdo->prepare('SELECT fecha, carburante, media FROM national_price_history
            WHERE carburante IN (?, ?) AND fecha >= date((SELECT MAX(fecha) FROM national_price_history), ?)
            ORDER BY fecha DESC');
        $stmt->execute(array_merge($fuels, ['-' . max(1, $days - 1) . ' days']));
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(string)$row['fecha']][(string)$row['carburante']] = (float)$row['media'];
        }
        return $out;
    }

    /**
     * Today's average, min and max of the headline fuels per province.
     * Returns [provincia raw => [carburante => row]], only cells with at least $minStations prices.
     */
    public static function provinceAverages(\PDO $pdo, int $minStations = 5): array
    {
        $fuels = self::profile()['headline'];
        $sql = 'SELECT s.provincia, p.carburante, AVG(p.precio) AS media, MIN(p.precio) AS minimo, MAX(p.precio) AS maximo, COUNT(*) AS n
            FROM current_prices p JOIN stations s ON s.ideess = p.ideess
            WHERE ' . self::freshClause() . ' AND p.carburante IN (?, ?)
            GROUP BY s.provincia, p.carburante HAVING n >= ' . (int)$minStations;
        $stmt = $pdo->prepare($sql);
        $stmt->execute($fuels);
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(string)$row['provincia']][(string)$row['carburante']] = $row;
        }
        return $out;
    }

    private const GENERIC_BRANDS = ['', '-', '.', 'N/A', 'NA', 'NO', 'NO TIENE', 'SIN ROTULO', 'SIN RÓTULO', 'OTROS', 'OTRAS', 'GENERICO', 'GENÉRICO', 'STATION', 'STATION-SERVICE', 'POSTO', 'INDEPENDENTE', 'INDÉPENDANT', 'AUTRE', 'AUTRES'];

    /**
     * Average price of $fuel per brand, for brands with at least $minStations stations, cheapest first.
     */
    public static function brands(\PDO $pdo, string $whereSql, array $params, string $fuel, int $minStations = 2, int $limit = 10): array
    {
        $sql = 'SELECT UPPER(TRIM(s.rotulo)) AS marca, AVG(p.precio) AS media, MIN(p.precio) AS minimo, COUNT(*) AS n
            FROM current_prices p JOIN stations s ON s.ideess = p.ideess
            WHERE ' . $whereSql . ' AND ' . self::freshClause() . ' AND p.carburante = ?
            GROUP BY marca HAVING n >= ' . (int)$minStations . ' ORDER BY media ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge($params, [$fuel]));
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            if (in_array((string)$row['marca'], self::GENERIC_BRANDS, true)) {
                continue;
            }
            $out[] = $row;
            if (count($out) >= $limit) {
                break;
            }
        }
        return $out;
    }

    /**
     * Todos los datos del informe mensual, sin textos: lo usan la página en vivo y la foto
     * que se guarda cada día en monthly_reports (la del último día del mes queda como cierre).
     */
    public static function reportData(\PDO $pdo, int $minStations = 5): array
    {
        $headline = self::profile()['headline'];
        $updated = self::lastUpdate($pdo);
        $month = substr($updated, 0, 7);

        $provinces = [];
        foreach (self::provinces($pdo) as $item) {
            $provinces[$item['raw']] = $item;
        }
        $ranked = [];
        foreach (self::provinceAverages($pdo, $minStations) as $raw => $fuels) {
            if (!isset($fuels[$headline[0]], $provinces[$raw])) {
                continue;
            }
            $cells = [];
            foreach ($fuels as $fuel => $row) {
                $cells[$fuel] = ['media' => (float)$row['media'], 'minimo' => (float)$row['minimo'], 'maximo' => (float)$row['maximo'], 'n' => (int)$row['n']];
            }
            $ranked[] = ['name' => $provinces[$raw]['name'], 'slug' => $provinces[$raw]['slug'], 'fuels' => $cells];
        }
        usort($ranked, static fn(array $a, array $b): int => $a['fuels'][$headline[0]]['media'] <=> $b['fuels'][$headline[0]]['media']);

        $averages = [];
        foreach (self::averages($pdo, '1 = 1', []) as $fuel => $row) {
            $averages[$fuel] = ['carburante' => $fuel, 'media' => (float)$row['media'], 'minimo' => (float)$row['minimo'], 'maximo' => (float)$row['maximo'], 'n' => (int)$row['n']];
        }
        $brands = [];
        foreach (self::brands($pdo, '1 = 1', [], $headline[0], 20, 10) as $row) {
            $brands[] = ['marca' => (string)$row['marca'], 'media' => (float)$row['media'], 'minimo' => (float)$row['minimo'], 'n' => (int)$row['n']];
        }
        $cheapest = [];
        foreach (self::cheapest($pdo, '1 = 1', [], $headline[0], 10) as $row) {
            $row['precio'] = (float)$row['precio'];
            $cheapest[] = $row;
        }

        return [
            'version' => 1,
            'month' => $month,
            'updated' => $updated,
            'headline' => $headline,
            'minStations' => $minStations,
            'stations' => (int)$pdo->query('SELECT COUNT(*) FROM stations s WHERE ' . self::freshClause())->fetchColumn(),
            'averages' => $averages,
            'ranked' => $ranked,
            'trend' => self::nationalTrend($pdo, 30),
            'monthDays' => self::monthTrend($pdo, $month),
            'brands' => $brands,
            'cheapest' => $cheapest,
        ];
    }

    /**
     * Media nacional diaria de los carburantes principales en un mes (AAAA-MM), del día más reciente al más antiguo.
     */
    public static function monthTrend(\PDO $pdo, string $month): array
    {
        $fuels = self::profile()['headline'];
        $stmt = $pdo->prepare('SELECT fecha, carburante, media FROM national_price_history
            WHERE carburante IN (?, ?) AND fecha >= ? AND fecha <= ? ORDER BY fecha DESC');
        $stmt->execute(array_merge($fuels, [$month . '-01', $month . '-31']));
        $out = [];
        foreach ($stmt->fetchAll() as $row) {
            $out[(string)$row['fecha']][(string)$row['carburante']] = (float)$row['media'];
        }
        return $out;
    }

    /**
     * Meses guardados en monthly_reports, del más reciente al más antiguo: [AAAA-MM => datos].
     * Si la tabla no existe todavía devuelve una lista vacía.
     */
    public static function archive(\PDO $pdo): array
    {
        try {
            $rows = $pdo->query('SELECT month, data FROM monthly_reports ORDER BY month DESC')->fetchAll();
        } catch (\Throwable $e) {
            return [];
        }
        $out = [];
        foreach ($rows as $row) {
            $data = json_decode((string)$row['data'], true);
            if (is_array($data)) {
                $out[(string)$row['month']] = $data;
            }
        }
        return $out;
    }

    public static function stationJsonLd(array $station, array $prices, string $updated, string $provinceName): array
    {
        $base = self::siteUrl();
        $data = [
            '@context' => 'https://schema.org',
            '@type' => 'GasStation',
            'name' => self::display($station['rotulo']),
            'url' => $base . self::stationPath($station['ideess']),
            'address' => [
                '@type' => 'PostalAddress',
                'streetAddress' => self::display($station['direccion']),
                'addressLocality' => self::display($station['municipio']),
                'addressRegion' => $provinceName,
                'postalCode' => $station['cp'],
                'addressCountry' => self::profile()['iso'],
            ],
            'geo' => [
                '@type' => 'GeoCoordinates',
                'latitude' => (float)$station['lat'],
                'longitude' => (float)$station['lon'],
            ],
            'dateModified' => $updated,
        ];
        $specification = OpeningHours::specification((string)$station['horario_raw']);
        if ($specification !== []) {
            $data['openingHoursSpecification'] = $specification;
        } elseif ((int)$station['is_24h'] === 1) {
            $data['openingHours'] = 'Mo-Su 00:00-23:59';
        }
        $offers = [];
        foreach (self::fuels() as $key => $label) {
            if (!isset($prices[$key])) {
                continue;
            }
            $offers[] = [
                '@type' => 'Offer',
                'name' => $label,
                'price' => number_format((float)$prices[$key], 3, '.', ''),
                'priceCurrency' => 'EUR',
            ];
        }
        if ($offers !== []) {
            $data['makesOffer'] = $offers;
        }
        return $data;
    }

    public static function breadcrumb(array $items): array
    {
        $list = [];
        foreach ($items as $index => $item) {
            $list[] = ['@type' => 'ListItem', 'position' => $index + 1, 'name' => $item[0], 'item' => $item[1]];
        }
        return ['@context' => 'https://schema.org', '@type' => 'BreadcrumbList', 'itemListElement' => $list];
    }
}
