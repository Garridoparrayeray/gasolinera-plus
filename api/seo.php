<?php

declare(strict_types=1);

date_default_timezone_set('Europe/Madrid');

ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/Core/Country.php';
require_once __DIR__ . '/Core/Config.php';
require_once __DIR__ . '/Core/Database.php';
require_once __DIR__ . '/Services/Seo.php';

use Core\Country;
use Services\Seo;

$path = '/';
if (isset($_SERVER['REQUEST_URI'])) {
    $path = (string)parse_url((string)$_SERVER['REQUEST_URI'], PHP_URL_PATH);
}
$path = rtrim(urldecode($path), '/');
if ($path === '') {
    $path = '/';
}
if (preg_match('#^/(pt|fr)(/.*)?$#', $path, $prefixMatch)) {
    $_GET['pais'] = $prefixMatch[1];
    $path = '/';
    if (isset($prefixMatch[2])) {
        $path = $prefixMatch[2];
    }
}

function seoCache(int $seconds): void
{
    header('Cache-Control: public, max-age=300, s-maxage=' . $seconds . ', stale-while-revalidate=86400');
}

function seoNotFound(): void
{
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex');
    $base = Seo::siteUrl();
    echo '<!DOCTYPE html><html lang="' . Seo::lang() . '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>' . Seo::escape(Seo::t('seo.notfound.title')) . ' | Gasolinera+</title></head><body><h1>' . Seo::escape(Seo::t('seo.notfound.title')) . '</h1><p><a href="' . Seo::escape($base . Seo::sectionUrl()) . '">' . Seo::escape(Seo::t('seo.notfound.link')) . '</a> · <a href="' . Seo::escape(Seo::base()) . '/">' . Seo::escape(Seo::t('seo.go')) . '</a></p></body></html>';
}

function seoStyles(): string
{
    return '<style>
:root{--bg:#F6F5F3;--surface:#fff;--text:#111;--muted:#45423D;--border:#CFCBC3;--accent:#FF7A1A;--link:#B34700}
@media (prefers-color-scheme:dark){:root{--bg:#0F0F0F;--surface:#1E1E1E;--text:#F4F2EE;--muted:#D0CCC4;--border:#444;--link:#FF9A4D}}
@font-face{font-family:"Bricolage Grotesque";font-style:normal;font-display:swap;font-weight:200 800;src:url(/vendor/fonts/bricolage-grotesque-latin-standard-normal.woff2) format("woff2-variations")}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 "Bricolage Grotesque",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--link)}
.wrap{max-width:860px;margin:0 auto;padding:0 16px 48px}
.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;background:var(--accent);color:#111;padding:14px 16px}
.top a{color:#111;text-decoration:none;font-weight:800;font-size:1.15rem}
.top nav a{font-size:.9rem;font-weight:600;margin-left:12px}
.crumbs{font-size:.88rem;color:var(--muted);margin:16px 0 4px}
h1{font-size:1.7rem;line-height:1.2;margin:8px 0 12px}
h2{font-size:1.2rem;margin:28px 0 10px}
.card{background:var(--surface);border:1px solid var(--border);padding:14px 16px;margin:12px 0}
table{width:100%;border-collapse:collapse;font-size:.95rem}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid var(--border)}
td.n,th.n{text-align:right;white-space:nowrap}
ol.rank{padding-left:22px;margin:0}
ol.rank li{padding:6px 0;border-bottom:1px solid var(--border)}
ul.cols{list-style:none;padding:0;margin:0;columns:2 220px;column-gap:24px}
ul.cols li{padding:3px 0;break-inside:avoid}
.cta{display:inline-block;background:var(--accent);color:#111;padding:12px 18px;font-weight:800;text-decoration:none;margin:8px 0}
.note{font-size:.85rem;color:var(--muted);margin-top:28px}
</style>';
}

function seoAlternates(callable $suffix): string
{
    $html = '';
    foreach (Country::withData() as $code) {
        $profile = Seo::profile($code);
        $url = Seo::siteUrl() . Country::prefix($code) . $suffix($code);
        $html .= '<link rel="alternate" hreflang="' . $profile['lang'] . '-' . $profile['iso'] . '" href="' . Seo::escape($url) . '">';
        if ($code === Country::DEFAULT) {
            $html .= '<link rel="alternate" hreflang="x-default" href="' . Seo::escape($url) . '">';
        }
    }
    return $html;
}

function seoCountryNav(): string
{
    $links = '';
    foreach (Country::withData() as $code) {
        if ($code === Country::code()) {
            continue;
        }
        $profile = Seo::profile($code);
        $links .= '<a href="' . Seo::escape(Country::prefix($code) . '/' . $profile['section']) . '" hreflang="' . $profile['lang'] . '">' . Seo::escape(Country::all()[$code]['native']) . '</a>';
    }
    return '<nav aria-label="Gasolinera+">' . $links . '</nav>';
}

function seoHead(string $title, string $description, string $canonical, string $robots, string $jsonLd, string $alternates = ''): string
{
    $base = Seo::siteUrl();
    $verification = '<meta name="google-site-verification" content="' . Seo::escape(Seo::verificationToken()) . '">';
    $description = Seo::trim($description, 160);
    return '<!DOCTYPE html><html lang="' . Seo::lang() . '"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . Seo::escape($title) . '</title>'
        . '<meta name="description" content="' . Seo::escape($description) . '">'
        . '<meta name="robots" content="' . Seo::escape($robots) . '">'
        . '<link rel="canonical" href="' . Seo::escape($canonical) . '">'
        . $alternates
        . $verification
        . '<meta property="og:type" content="website"><meta property="og:site_name" content="Gasolinera+">'
        . '<meta property="og:locale" content="' . Seo::profile()['locale'] . '">'
        . '<meta property="og:title" content="' . Seo::escape($title) . '">'
        . '<meta property="og:description" content="' . Seo::escape($description) . '">'
        . '<meta property="og:url" content="' . Seo::escape($canonical) . '">'
        . '<meta property="og:image" content="' . Seo::escape($base) . '/icons/og-image.png">'
        . '<meta property="og:image:alt" content="' . Seo::escape(Seo::t('seo.og.alt')) . '">'
        . '<meta name="twitter:card" content="summary">'
        . '<meta name="twitter:title" content="' . Seo::escape($title) . '">'
        . '<meta name="twitter:description" content="' . Seo::escape($description) . '">'
        . '<link rel="icon" href="/icons/icon-192.png">'
        . seoStyles() . $jsonLd . '</head><body>'
        . '<div class="top"><a href="' . Seo::escape(Country::prefix(Country::code()) . '/') . '">Gasolinera+</a>' . seoCountryNav() . '</div><div class="wrap">';
}

function seoFooter(string $updated): string
{
    return '<p class="note">' . Seo::escape(Seo::t('seo.footer', ['date' => Seo::date($updated)])) . '</p></div></body></html>';
}

function seoCrumbs(array $items): string
{
    $parts = [];
    foreach ($items as $item) {
        if ($item[1] === '') {
            $parts[] = Seo::escape($item[0]);
        } else {
            $parts[] = '<a href="' . Seo::escape($item[1]) . '">' . Seo::escape($item[0]) . '</a>';
        }
    }
    return '<p class="crumbs">' . implode(' › ', $parts) . '</p>';
}

function seoPriceTable(array $averages): string
{
    $rows = '';
    foreach (Seo::fuels() as $key => $label) {
        if (!isset($averages[$key])) {
            continue;
        }
        $a = $averages[$key];
        $rows .= '<tr><td>' . Seo::escape($label) . '</td><td class="n">' . Seo::price((float)$a['media']) . ' €</td><td class="n">' . Seo::price((float)$a['minimo']) . ' €</td><td class="n">' . Seo::price((float)$a['maximo']) . ' €</td></tr>';
    }
    if ($rows === '') {
        return '';
    }
    return '<div class="card"><table><thead><tr><th>' . Seo::escape(Seo::t('seo.table.fuel')) . '</th><th class="n">' . Seo::escape(Seo::t('seo.table.mean')) . '</th><th class="n">' . Seo::escape(Seo::t('seo.table.min')) . '</th><th class="n">' . Seo::escape(Seo::t('seo.table.max')) . '</th></tr></thead><tbody>' . $rows . '</tbody></table></div>';
}

function seoRanking(array $rows): string
{
    $items = '';
    foreach ($rows as $row) {
        $name = Seo::display($row['rotulo']);
        $items .= '<li><a href="' . Seo::escape(Seo::stationPath($row['ideess'])) . '">' . Seo::escape($name) . '</a> · ' . Seo::escape(Seo::display($row['municipio'])) . ' · ' . Seo::escape(Seo::display($row['direccion'])) . ' — <strong>' . Seo::price((float)$row['precio']) . ' €</strong></li>';
    }
    return '<ol class="rank">' . $items . '</ol>';
}

function seoCheapestJsonLd(array $rows, string $listName, string $updated): array
{
    $base = Seo::siteUrl();
    $elements = [];
    foreach ($rows as $index => $row) {
        $elements[] = [
            '@type' => 'ListItem',
            'position' => $index + 1,
            'url' => $base . Seo::stationPath($row['ideess']),
            'name' => Seo::display($row['rotulo']) . ' · ' . Seo::display($row['municipio']),
        ];
    }
    return ['@context' => 'https://schema.org', '@type' => 'ItemList', 'name' => $listName, 'dateModified' => $updated, 'itemListElement' => $elements];
}

function seoAverageList(array $averages): string
{
    $parts = [];
    foreach (Seo::profile()['headline'] as $fuel) {
        if (isset($averages[$fuel])) {
            $parts[] = mb_strtolower(Seo::fuelLabel($fuel)) . ' ' . Seo::price((float)$averages[$fuel]['media']) . ' €/L';
        }
    }
    return implode(' ' . Seo::t('seo.and') . ' ', $parts);
}

function seoIntro(string $placeLabel, array $averages, int $count, array $topCheapest): string
{
    $text = Seo::t('seo.intro.count', ['n' => $count, 'place' => $placeLabel]);
    $list = seoAverageList($averages);
    if ($list !== '') {
        $text .= ' ' . Seo::t('seo.intro.today', ['list' => $list]);
    }
    if ($topCheapest !== []) {
        $first = $topCheapest[0];
        $text .= ' ' . Seo::t('seo.intro.cheapest', [
            'fuel' => mb_strtolower(Seo::fuelLabel(Seo::profile()['headline'][0])),
            'name' => Seo::display($first['rotulo']),
            'town' => Seo::display($first['municipio']),
            'price' => Seo::price((float)$first['precio']),
        ]);
    }
    return $text;
}

function seoDescription(string $text): string
{
    $suffix = ' ' . Seo::t('seo.desc.suffix');
    return Seo::trim($text, 160 - mb_strlen($suffix)) . $suffix;
}

function seoAreaPage(\PDO $pdo, string $provinceSlug, string $municipalitySlug): void
{
    $provinces = Seo::provinces($pdo);
    if (!isset($provinces[$provinceSlug])) {
        seoNotFound();
        return;
    }
    $province = $provinces[$provinceSlug];
    $base = Seo::siteUrl();
    $section = Seo::sectionUrl();
    $home = Country::prefix(Country::code()) . '/';
    $sectionLabel = Seo::t('seo.section');
    $updated = Seo::lastUpdate($pdo);
    $provinceUrl = $base . $section . '/' . $province['slug'];
    $municipalities = Seo::municipalities($pdo, $province['raw']);
    $headline = Seo::profile()['headline'];

    if ($municipalitySlug === '') {
        $where = 's.provincia = ?';
        $params = [$province['raw']];
        $placeLabel = $province['name'];
        $canonical = $provinceUrl;
        $title = Seo::t('seo.prov.title', ['p' => $province['name']]);
        $heading = Seo::t('seo.prov.h1', ['p' => $province['name']]);
        $robots = 'index, follow';
        $crumbs = [['Gasolinera+', $home], [$sectionLabel, $section], [$province['name'], '']];
        $crumbsLd = [['Gasolinera+', $base . $home], [$sectionLabel, $base . $section], [$province['name'], $canonical]];
        $count = $province['n'];
    } else {
        if (!isset($municipalities[$municipalitySlug])) {
            seoNotFound();
            return;
        }
        $municipality = $municipalities[$municipalitySlug];
        $marks = implode(',', array_fill(0, count($municipality['raws']), '?'));
        $where = 's.provincia = ? AND s.municipio IN (' . $marks . ')';
        $params = array_merge([$province['raw']], $municipality['raws']);
        $placeLabel = $municipality['name'] . ' (' . $province['name'] . ')';
        $canonical = $provinceUrl . '/' . $municipality['slug'];
        $title = Seo::t('seo.muni.title', ['m' => $municipality['name'], 'p' => $province['name']]);
        $heading = Seo::t('seo.muni.h1', ['m' => $municipality['name'], 'p' => $province['name']]);
        $robots = 'index, follow';
        if ($municipality['n'] < 2) {
            $robots = 'noindex, follow';
        }
        $crumbs = [['Gasolinera+', $home], [$sectionLabel, $section], [$province['name'], $section . '/' . $province['slug']], [$municipality['name'], '']];
        $crumbsLd = [['Gasolinera+', $base . $home], [$sectionLabel, $base . $section], [$province['name'], $provinceUrl], [$municipality['name'], $canonical]];
        $count = $municipality['n'];
    }
    if (mb_strlen($title) > 65) {
        $title = str_replace(' | Gasolinera+', '', $title);
    }

    $averages = Seo::averages($pdo, $where, $params);
    $first = Seo::cheapest($pdo, $where, $params, $headline[0], 10);
    $second = Seo::cheapest($pdo, $where, $params, $headline[1], 10);
    $intro = seoIntro($placeLabel, $averages, $count, $first);

    $ld = Seo::jsonLd(Seo::breadcrumb($crumbsLd));
    if ($first !== []) {
        $ld .= Seo::jsonLd(seoCheapestJsonLd($first, Seo::t('seo.ld.cheapest', ['fuel' => Seo::fuelLabel($headline[0]), 'place' => $placeLabel]), $updated));
    }

    $html = seoHead($title, seoDescription($intro), $canonical, $robots, $ld);
    $html .= seoCrumbs($crumbs);
    $html .= '<h1>' . Seo::escape($heading) . '</h1>';
    $html .= '<p>' . Seo::escape($intro) . '</p>';
    $html .= '<a class="cta" href="' . Seo::escape($home) . '">' . Seo::escape(Seo::t('seo.cta')) . '</a>';
    $html .= '<h2>' . Seo::escape(Seo::t('seo.h2.today')) . '</h2>' . seoPriceTable($averages);
    if ($first !== []) {
        $html .= '<h2>' . Seo::escape(Seo::t('seo.h2.cheapest', ['fuel' => Seo::fuelLabel($headline[0])])) . '</h2>' . seoRanking($first);
    }
    if ($second !== []) {
        $html .= '<h2>' . Seo::escape(Seo::t('seo.h2.cheapest', ['fuel' => Seo::fuelLabel($headline[1])])) . '</h2>' . seoRanking($second);
    }
    if ($municipalitySlug === '') {
        $links = '';
        foreach ($municipalities as $item) {
            $links .= '<li><a href="' . Seo::escape($section . '/' . $province['slug'] . '/' . $item['slug']) . '">' . Seo::escape($item['name']) . '</a> (' . $item['n'] . ')</li>';
        }
        $html .= '<h2>' . Seo::escape(Seo::t('seo.h2.towns', ['p' => $province['name']])) . '</h2><ul class="cols">' . $links . '</ul>';
    } else {
        $sql = 'SELECT s.ideess, s.rotulo, s.direccion, s.horario_raw, s.is_24h,
                (SELECT precio FROM current_prices WHERE ideess = s.ideess AND carburante = ?) AS first_price,
                (SELECT precio FROM current_prices WHERE ideess = s.ideess AND carburante = ?) AS second_price
            FROM stations s WHERE ' . $where . ' AND ' . Seo::freshClause() . ' ORDER BY s.rotulo, s.direccion LIMIT 100';
        $stmt = $pdo->prepare($sql);
        $stmt->execute(array_merge([$headline[0], $headline[1]], $params));
        $rows = '';
        foreach ($stmt->fetchAll() as $row) {
            $firstCell = '—';
            if ($row['first_price'] !== null) {
                $firstCell = Seo::price((float)$row['first_price']) . ' €';
            }
            $secondCell = '—';
            if ($row['second_price'] !== null) {
                $secondCell = Seo::price((float)$row['second_price']) . ' €';
            }
            $hours = $row['horario_raw'];
            if ((int)$row['is_24h'] === 1) {
                $hours = Seo::t('seo.h24');
            }
            $details = Seo::escape(Seo::display($row['direccion']));
            if ($hours !== '') {
                $details .= ' · ' . Seo::escape($hours);
            }
            $rows .= '<tr><td><a href="' . Seo::escape(Seo::stationPath($row['ideess'])) . '">' . Seo::escape(Seo::display($row['rotulo'])) . '</a><br><small>' . $details . '</small></td><td class="n">' . $firstCell . '</td><td class="n">' . $secondCell . '</td></tr>';
        }
        $html .= '<h2>' . Seo::escape(Seo::t('seo.h2.all', ['m' => $municipality['name']])) . '</h2><div class="card"><table><thead><tr><th>' . Seo::escape(Seo::t('seo.table.station')) . '</th><th class="n">' . Seo::escape(Seo::fuelLabel($headline[0])) . '</th><th class="n">' . Seo::escape(Seo::fuelLabel($headline[1])) . '</th></tr></thead><tbody>' . $rows . '</tbody></table></div>';
        $html .= '<p><a href="' . Seo::escape($section . '/' . $province['slug']) . '">' . Seo::escape(Seo::t('seo.more', ['p' => $province['name']])) . '</a></p>';
    }
    $html .= seoFooter($updated);

    header('Content-Type: text/html; charset=utf-8');
    seoCache(3600);
    echo $html;
}

function seoIndexPage(\PDO $pdo): void
{
    $base = Seo::siteUrl();
    $section = Seo::sectionUrl();
    $home = Country::prefix(Country::code()) . '/';
    $updated = Seo::lastUpdate($pdo);
    $provinces = Seo::provinces($pdo);
    $averages = Seo::averages($pdo, '1 = 1', []);
    $links = '';
    foreach ($provinces as $item) {
        $links .= '<li><a href="' . Seo::escape($section . '/' . $item['slug']) . '">' . Seo::escape($item['name']) . '</a> (' . $item['n'] . ')</li>';
    }
    $intro = Seo::t('seo.index.intro', ['n' => count($provinces)]);
    $list = seoAverageList($averages);
    if ($list !== '') {
        $intro .= ' ' . Seo::t('seo.index.national', ['list' => $list]);
    }
    $canonical = $base . $section;
    $ld = Seo::jsonLd(Seo::breadcrumb([['Gasolinera+', $base . $home], [Seo::t('seo.section'), $canonical]]));
    $alternates = seoAlternates(function (string $code): string {
        return '/' . Seo::profile($code)['section'];
    });
    $html = seoHead(Seo::t('seo.index.title'), seoDescription($intro), $canonical, 'index, follow', $ld, $alternates);
    $html .= seoCrumbs([['Gasolinera+', $home], [Seo::t('seo.section'), '']]);
    $html .= '<h1>' . Seo::escape(Seo::t('seo.index.h1')) . '</h1><p>' . Seo::escape($intro) . '</p>';
    $html .= '<a class="cta" href="' . Seo::escape($home) . '">' . Seo::escape(Seo::t('seo.cta')) . '</a>';
    $html .= '<h2>' . Seo::escape(Seo::t('seo.index.averages')) . '</h2>' . seoPriceTable($averages);
    $html .= '<h2>' . Seo::escape(Seo::t('seo.index.choose')) . '</h2><ul class="cols">' . $links . '</ul>';
    $html .= seoFooter($updated);
    header('Content-Type: text/html; charset=utf-8');
    seoCache(3600);
    echo $html;
}

function seoSitemapIndex(): void
{
    $base = Seo::siteUrl();
    header('Content-Type: application/xml; charset=utf-8');
    seoCache(21600);
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach (Country::withData() as $code) {
        echo '<sitemap><loc>' . Seo::escape($base . '/sitemap-' . $code . '.xml') . '</loc><lastmod>' . date('Y-m-d') . '</lastmod></sitemap>' . "\n";
    }
    echo '</sitemapindex>' . "\n";
}

function seoSitemap(\PDO $pdo): void
{
    $base = Seo::siteUrl();
    $section = Seo::sectionUrl();
    $updated = Seo::lastUpdate($pdo);
    $urls = [[$base . Country::prefix(Country::code()) . '/', 'daily', '1.0'], [$base . $section, 'daily', '0.9']];
    foreach (Seo::provinces($pdo) as $province) {
        $urls[] = [$base . $section . '/' . $province['slug'], 'daily', '0.8'];
        foreach (Seo::municipalities($pdo, $province['raw']) as $municipality) {
            if ($municipality['n'] >= 2) {
                $urls[] = [$base . $section . '/' . $province['slug'] . '/' . $municipality['slug'], 'daily', '0.6'];
            }
        }
    }
    $stmt = $pdo->query('SELECT s.ideess FROM stations s WHERE ' . Seo::freshClause() . ' AND EXISTS (SELECT 1 FROM current_prices p WHERE p.ideess = s.ideess) ORDER BY s.ideess');
    foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $ideess) {
        $urls[] = [$base . Seo::stationPath((string)$ideess), 'daily', '0.5'];
    }
    header('Content-Type: application/xml; charset=utf-8');
    seoCache(21600);
    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n" . '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    foreach ($urls as $url) {
        echo '<url><loc>' . Seo::escape($url[0]) . '</loc><lastmod>' . $updated . '</lastmod><changefreq>' . $url[1] . '</changefreq><priority>' . $url[2] . '</priority></url>' . "\n";
    }
    echo '</urlset>' . "\n";
}

function seoRobots(): void
{
    $base = Seo::siteUrl();
    header('Content-Type: text/plain; charset=utf-8');
    seoCache(86400);
    echo "User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /data/\nDisallow: /scripts/\nDisallow: /tests/\n\nSitemap: " . $base . "/sitemap.xml\n";
}

function seoLlms(): void
{
    $base = Seo::siteUrl();
    header('Content-Type: text/plain; charset=utf-8');
    seoCache(86400);
    echo "# Gasolinera+\n\n";
    echo "> Precios de gasolina y diésel de las gasolineras de España, Portugal y Francia, actualizados cada día con los datos oficiales de cada país.\n\n";
    echo "Gasolinera+ permite ver la gasolinera más barata cerca de ti, comparar precios por provincia y municipio, calcular rutas entre los tres países con paradas de repostaje y llevar el gasto y el consumo de tu coche. La web es gratuita y no requiere cuenta. Está en español, portugués y francés.\n\n";
    echo "Mapa de sitio general: " . $base . "/sitemap.xml\n\n";
    foreach (Country::withData() as $code) {
        $country = Country::all()[$code];
        $profile = Seo::profile($code);
        $prefix = Country::prefix($code);
        try {
            $_GET['pais'] = $code;
            $pdo = new \PDO('sqlite:' . Country::dbPathFor($code));
            $updated = Seo::lastUpdate($pdo);
        } catch (\Throwable $e) {
            $updated = '';
        }
        echo '## ' . Seo::t('seo.llms.country', [], $profile['lang']) . ' (' . $country['name']['es'] . ")\n\n";
        echo '- [Inicio y mapa de precios](' . $base . $prefix . "/): buscador y mapa de gasolineras.\n";
        echo '- [' . Seo::t('seo.areaIndex', [], $profile['lang']) . '](' . $base . $prefix . '/' . $profile['section'] . "): precios medios de hoy por zona.\n";
        echo '- Zona: ' . $base . $prefix . '/' . $profile['section'] . "/{zona} (precio medio, gasolineras más baratas y municipios).\n";
        echo '- Municipio: ' . $base . $prefix . '/' . $profile['section'] . "/{zona}/{municipio} (todas las gasolineras con sus precios).\n";
        echo '- Gasolinera: ' . $base . $prefix . "/stations/{id} (precios por carburante, horario y ubicación).\n";
        echo '- Fuente: ' . $country['source'] . '. Idioma: ' . $profile['lang'] . '. Última actualización: ' . $updated . ".\n";
        echo '- Mapa de sitio: ' . $base . '/sitemap-' . $code . ".xml\n\n";
    }
    unset($_GET['pais']);
}

if ($path === '/robots.txt') {
    seoRobots();
    exit;
}
if ($path === '/sitemap.xml') {
    seoSitemapIndex();
    exit;
}
if ($path === '/llms.txt') {
    seoLlms();
    exit;
}
$isCountrySitemap = false;
if (preg_match('#^/sitemap-(es|pt|fr)\.xml$#', $path, $sitemapMatch)) {
    $isCountrySitemap = true;
    $_GET['pais'] = $sitemapMatch[1];
    if (!Country::hasData()) {
        seoNotFound();
        exit;
    }
}

try {
    if (!Country::hasData()) {
        seoNotFound();
        exit;
    }
    $pdo = \Core\Database::connection();
    $section = '/' . Seo::profile()['section'];
    if ($isCountrySitemap) {
        seoSitemap($pdo);
    } elseif ($path === $section) {
        seoIndexPage($pdo);
    } elseif (preg_match('#^' . preg_quote($section, '#') . '/([a-z0-9-]+)$#', $path, $m)) {
        seoAreaPage($pdo, $m[1], '');
    } elseif (preg_match('#^' . preg_quote($section, '#') . '/([a-z0-9-]+)/([a-z0-9-]+)$#', $path, $m)) {
        seoAreaPage($pdo, $m[1], $m[2]);
    } else {
        seoNotFound();
    }
} catch (\Throwable $error) {
    error_log('Gasolinera+ seo: ' . $error->getMessage());
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Error temporal';
}
