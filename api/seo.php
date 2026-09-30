<?php

declare(strict_types=1);

date_default_timezone_set('Europe/Madrid');

ini_set('display_errors', '0');
ini_set('log_errors', '1');

require_once __DIR__ . '/Core/Config.php';
require_once __DIR__ . '/Core/Database.php';
require_once __DIR__ . '/Services/Seo.php';

use Services\Seo;

$path = (string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$path = rtrim(urldecode($path), '/');
if ($path === '') {
    $path = '/';
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
    echo '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Página no encontrada | Gasolinera+</title></head><body><h1>Página no encontrada</h1><p><a href="' . Seo::escape($base) . '/gasolineras">Ver gasolineras por provincia</a> · <a href="' . Seo::escape($base) . '/">Ir a Gasolinera+</a></p></body></html>';
}

function seoStyles(): string
{
    return '<style>
:root{--bg:#F6F5F3;--surface:#fff;--text:#111;--muted:#45423D;--border:#CFCBC3;--accent:#FF7A1A;--link:#B34700}
@media (prefers-color-scheme:dark){:root{--bg:#0F0F0F;--surface:#1E1E1E;--text:#F4F2EE;--muted:#D0CCC4;--border:#444;--link:#FF9A4D}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--link)}
.wrap{max-width:860px;margin:0 auto;padding:0 16px 48px}
.top{background:var(--accent);color:#111;padding:14px 16px}
.top a{color:#111;text-decoration:none;font-weight:800;font-size:1.15rem}
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

function seoHead(string $title, string $description, string $canonical, string $robots, string $jsonLd): string
{
    $base = Seo::siteUrl();
    $verification = '';
    $verification = '<meta name="google-site-verification" content="' . Seo::escape(Seo::verificationToken()) . '">';
    return '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . Seo::escape($title) . '</title>'
        . '<meta name="description" content="' . Seo::escape($description) . '">'
        . '<meta name="robots" content="' . Seo::escape($robots) . '">'
        . '<link rel="canonical" href="' . Seo::escape($canonical) . '">'
        . $verification
        . '<meta property="og:type" content="website"><meta property="og:site_name" content="Gasolinera+">'
        . '<meta property="og:title" content="' . Seo::escape($title) . '">'
        . '<meta property="og:description" content="' . Seo::escape($description) . '">'
        . '<meta property="og:url" content="' . Seo::escape($canonical) . '">'
        . '<meta property="og:image" content="' . Seo::escape($base) . '/icons/og-image.png">'
        . '<meta name="twitter:card" content="summary">'
        . '<link rel="icon" href="/icons/icon-192.png">'
        . seoStyles() . $jsonLd . '</head><body>'
        . '<div class="top"><a href="/">Gasolinera+</a></div><div class="wrap">';
}

function seoFooter(string $updated): string
{
    return '<p class="note">Precios oficiales del Ministerio para la Transición Ecológica y el Reto Demográfico, actualizados el ' . Seo::escape($updated) . '. Son precios de referencia: confírmalos en el surtidor.</p></div></body></html>';
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
    foreach (Seo::FUELS as $key => $label) {
        if (!isset($averages[$key])) {
            continue;
        }
        $a = $averages[$key];
        $rows .= '<tr><td>' . Seo::escape($label) . '</td><td class="n">' . Seo::price((float)$a['media']) . ' €</td><td class="n">' . Seo::price((float)$a['minimo']) . ' €</td><td class="n">' . Seo::price((float)$a['maximo']) . ' €</td></tr>';
    }
    if ($rows === '') {
        return '';
    }
    return '<div class="card"><table><thead><tr><th>Carburante</th><th class="n">Media</th><th class="n">Más barato</th><th class="n">Más caro</th></tr></thead><tbody>' . $rows . '</tbody></table></div>';
}

function seoRanking(array $rows, string $areaLabel): string
{
    $items = '';
    foreach ($rows as $row) {
        $name = Seo::display($row['rotulo']);
        $items .= '<li><a href="/stations/' . Seo::escape(rawurlencode($row['ideess'])) . '">' . Seo::escape($name) . '</a> · ' . Seo::escape(Seo::display($row['municipio'])) . ' · ' . Seo::escape(Seo::display($row['direccion'])) . ' — <strong>' . Seo::price((float)$row['precio']) . ' €</strong></li>';
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
            'url' => $base . '/stations/' . rawurlencode($row['ideess']),
            'name' => Seo::display($row['rotulo']) . ' · ' . Seo::display($row['municipio']),
        ];
    }
    return ['@context' => 'https://schema.org', '@type' => 'ItemList', 'name' => $listName, 'dateModified' => $updated, 'itemListElement' => $elements];
}

function seoIntro(string $placeLabel, array $averages, int $count, array $topDiesel): string
{
    $parts = [];
    if (isset($averages['gasoleo_a'])) {
        $parts[] = 'el gasóleo A cuesta de media ' . Seo::price((float)$averages['gasoleo_a']['media']) . ' €/L';
    }
    if (isset($averages['gasolina_95_e5'])) {
        $parts[] = 'la gasolina 95, ' . Seo::price((float)$averages['gasolina_95_e5']['media']) . ' €/L';
    }
    $text = 'Hay ' . $count . ' gasolineras en ' . $placeLabel . '.';
    if ($parts !== []) {
        $text .= ' Hoy ' . implode(' y ', $parts) . '.';
    }
    if ($topDiesel !== []) {
        $first = $topDiesel[0];
        $text .= ' El gasóleo A más barato está en ' . Seo::display($first['rotulo']) . ' (' . Seo::display($first['municipio']) . '), a ' . Seo::price((float)$first['precio']) . ' €/L.';
    }
    return $text;
}

function seoDescription(string $text): string
{
    $text .= ' Compara precios, horarios y mapa en Gasolinera+.';
    if (mb_strlen($text) > 300) {
        return mb_substr($text, 0, 297) . '...';
    }
    return $text;
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
    $updated = Seo::lastUpdate($pdo);
    $provinceUrl = $base . '/gasolineras/' . $province['slug'];
    $municipalities = Seo::municipalities($pdo, $province['raw']);

    if ($municipalitySlug === '') {
        $where = 's.provincia = ?';
        $params = [$province['raw']];
        $placeLabel = $province['name'];
        $canonical = $provinceUrl;
        $title = 'Gasolineras baratas en ' . $province['name'] . ': precios hoy | Gasolinera+';
        $robots = 'index, follow';
        $crumbs = [['Gasolinera+', '/'], ['Gasolineras', '/gasolineras'], [$province['name'], '']];
        $crumbsLd = [['Gasolinera+', $base . '/'], ['Gasolineras', $base . '/gasolineras'], [$province['name'], $canonical]];
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
        $title = 'Gasolineras en ' . $municipality['name'] . ' (' . $province['name'] . '): precios hoy | Gasolinera+';
        $robots = 'index, follow';
        if ($municipality['n'] < 2) {
            $robots = 'noindex, follow';
        }
        $crumbs = [['Gasolinera+', '/'], ['Gasolineras', '/gasolineras'], [$province['name'], '/gasolineras/' . $province['slug']], [$municipality['name'], '']];
        $crumbsLd = [['Gasolinera+', $base . '/'], ['Gasolineras', $base . '/gasolineras'], [$province['name'], $provinceUrl], [$municipality['name'], $canonical]];
        $count = $municipality['n'];
    }

    $averages = Seo::averages($pdo, $where, $params);
    $diesel = Seo::cheapest($pdo, $where, $params, 'gasoleo_a', 10);
    $petrol = Seo::cheapest($pdo, $where, $params, 'gasolina_95_e5', 10);
    $intro = seoIntro($placeLabel, $averages, $count, $diesel);

    $ld = Seo::jsonLd(Seo::breadcrumb($crumbsLd));
    if ($diesel !== []) {
        $ld .= Seo::jsonLd(seoCheapestJsonLd($diesel, 'Gasóleo A más barato en ' . $placeLabel, $updated));
    }

    $html = seoHead($title, seoDescription($intro), $canonical, $robots, $ld);
    $html .= seoCrumbs($crumbs);
    $heading = 'Gasolineras en ' . $placeLabel;
    if ($municipalitySlug === '') {
        $heading = 'Gasolineras baratas en ' . $province['name'];
    }
    $html .= '<h1>' . Seo::escape($heading) . '</h1>';
    $html .= '<p>' . Seo::escape($intro) . '</p>';
    $html .= '<a class="cta" href="/">Ver el mapa y buscar cerca de ti</a>';
    $html .= '<h2>Precios de hoy</h2>' . seoPriceTable($averages);
    if ($diesel !== []) {
        $html .= '<h2>Gasóleo A más barato</h2>' . seoRanking($diesel, $placeLabel);
    }
    if ($petrol !== []) {
        $html .= '<h2>Gasolina 95 más barata</h2>' . seoRanking($petrol, $placeLabel);
    }
    if ($municipalitySlug === '') {
        $links = '';
        foreach ($municipalities as $item) {
            $links .= '<li><a href="/gasolineras/' . Seo::escape($province['slug']) . '/' . Seo::escape($item['slug']) . '">' . Seo::escape($item['name']) . '</a> (' . $item['n'] . ')</li>';
        }
        $html .= '<h2>Gasolineras por municipio en ' . Seo::escape($province['name']) . '</h2><ul class="cols">' . $links . '</ul>';
    } else {
        $sql = 'SELECT s.ideess, s.rotulo, s.direccion, s.horario_raw, s.is_24h,
                (SELECT precio FROM current_prices WHERE ideess = s.ideess AND carburante = \'gasoleo_a\') AS gasoleo,
                (SELECT precio FROM current_prices WHERE ideess = s.ideess AND carburante = \'gasolina_95_e5\') AS gasolina
            FROM stations s WHERE ' . $where . ' AND ' . Seo::freshClause() . ' ORDER BY s.rotulo, s.direccion LIMIT 100';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = '';
        foreach ($stmt->fetchAll() as $row) {
            $diesel = '—';
            if ($row['gasoleo'] !== null) {
                $diesel = Seo::price((float)$row['gasoleo']) . ' €';
            }
            $petrolCell = '—';
            if ($row['gasolina'] !== null) {
                $petrolCell = Seo::price((float)$row['gasolina']) . ' €';
            }
            $hours = $row['horario_raw'];
            if ((int)$row['is_24h'] === 1) {
                $hours = '24 horas';
            }
            $rows .= '<tr><td><a href="/stations/' . Seo::escape(rawurlencode($row['ideess'])) . '">' . Seo::escape(Seo::display($row['rotulo'])) . '</a><br><small>' . Seo::escape(Seo::display($row['direccion'])) . ' · ' . Seo::escape($hours) . '</small></td><td class="n">' . $diesel . '</td><td class="n">' . $petrolCell . '</td></tr>';
        }
        $html .= '<h2>Todas las gasolineras de ' . Seo::escape($municipality['name']) . '</h2><div class="card"><table><thead><tr><th>Gasolinera</th><th class="n">Gasóleo A</th><th class="n">Gasolina 95</th></tr></thead><tbody>' . $rows . '</tbody></table></div>';
        $html .= '<p><a href="/gasolineras/' . Seo::escape($province['slug']) . '">Más gasolineras en ' . Seo::escape($province['name']) . '</a></p>';
    }
    $html .= seoFooter($updated);

    header('Content-Type: text/html; charset=utf-8');
    seoCache(3600);
    echo $html;
}

function seoIndexPage(\PDO $pdo): void
{
    $base = Seo::siteUrl();
    $updated = Seo::lastUpdate($pdo);
    $provinces = Seo::provinces($pdo);
    $averages = Seo::averages($pdo, '1 = 1', []);
    $links = '';
    foreach ($provinces as $item) {
        $links .= '<li><a href="/gasolineras/' . Seo::escape($item['slug']) . '">' . Seo::escape($item['name']) . '</a> (' . $item['n'] . ')</li>';
    }
    $intro = 'Precios de gasolina y diésel en las ' . count($provinces) . ' provincias de España.';
    if (isset($averages['gasoleo_a'])) {
        $intro .= ' Media nacional hoy: gasóleo A ' . Seo::price((float)$averages['gasoleo_a']['media']) . ' €/L';
        if (isset($averages['gasolina_95_e5'])) {
            $intro .= ' y gasolina 95 ' . Seo::price((float)$averages['gasolina_95_e5']['media']) . ' €/L';
        }
        $intro .= '.';
    }
    $title = 'Gasolineras por provincia: precios de gasolina y diésel hoy | Gasolinera+';
    $canonical = $base . '/gasolineras';
    $ld = Seo::jsonLd(Seo::breadcrumb([['Gasolinera+', $base . '/'], ['Gasolineras', $canonical]]));
    $html = seoHead($title, seoDescription($intro), $canonical, 'index, follow', $ld);
    $html .= seoCrumbs([['Gasolinera+', '/'], ['Gasolineras', '']]);
    $html .= '<h1>Gasolineras por provincia</h1><p>' . Seo::escape($intro) . '</p>';
    $html .= '<a class="cta" href="/">Ver el mapa y buscar cerca de ti</a>';
    $html .= '<h2>Precios medios en España hoy</h2>' . seoPriceTable($averages);
    $html .= '<h2>Elige tu provincia</h2><ul class="cols">' . $links . '</ul>';
    $html .= seoFooter($updated);
    header('Content-Type: text/html; charset=utf-8');
    seoCache(3600);
    echo $html;
}

function seoSitemap(\PDO $pdo): void
{
    $base = Seo::siteUrl();
    $updated = Seo::lastUpdate($pdo);
    $urls = [[$base . '/', 'daily', '1.0'], [$base . '/gasolineras', 'daily', '0.9']];
    foreach (Seo::provinces($pdo) as $province) {
        $urls[] = [$base . '/gasolineras/' . $province['slug'], 'daily', '0.8'];
        foreach (Seo::municipalities($pdo, $province['raw']) as $municipality) {
            if ($municipality['n'] >= 2) {
                $urls[] = [$base . '/gasolineras/' . $province['slug'] . '/' . $municipality['slug'], 'daily', '0.6'];
            }
        }
    }
    $stmt = $pdo->query('SELECT s.ideess FROM stations s WHERE ' . Seo::freshClause() . ' AND EXISTS (SELECT 1 FROM current_prices p WHERE p.ideess = s.ideess) ORDER BY s.ideess');
    foreach ($stmt->fetchAll(\PDO::FETCH_COLUMN) as $ideess) {
        $urls[] = [$base . '/stations/' . rawurlencode((string)$ideess), 'daily', '0.5'];
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

function seoLlms(\PDO $pdo): void
{
    $base = Seo::siteUrl();
    $updated = Seo::lastUpdate($pdo);
    header('Content-Type: text/plain; charset=utf-8');
    seoCache(86400);
    echo "# Gasolinera+\n\n";
    echo "> Precios de gasolina y diésel de las gasolineras de España, actualizados cada día con los datos oficiales del Ministerio para la Transición Ecológica y el Reto Demográfico. Última actualización de precios: " . $updated . ".\n\n";
    echo "Gasolinera+ permite ver la gasolinera más barata cerca de ti, comparar precios por provincia y municipio, calcular rutas con paradas de repostaje y llevar el gasto y el consumo de tu coche. La web es gratuita y no requiere cuenta.\n\n";
    echo "## Páginas principales\n\n";
    echo "- [Inicio y mapa de precios](" . $base . "/): buscador y mapa de gasolineras.\n";
    echo "- [Gasolineras por provincia](" . $base . "/gasolineras): precios medios de hoy en las provincias de España.\n";
    echo "- Provincia: " . $base . "/gasolineras/{provincia} (precio medio, gasolineras más baratas y municipios).\n";
    echo "- Municipio: " . $base . "/gasolineras/{provincia}/{municipio} (todas las gasolineras con sus precios).\n";
    echo "- Gasolinera: " . $base . "/stations/{id} (precios por carburante, horario y ubicación).\n\n";
    echo "## Datos\n\n";
    echo "- Fuente: geoportalgasolineras.es, datos abiertos del Ministerio. Los precios son de referencia.\n";
    echo "- Frecuencia: diaria.\n";
    echo "- Mapa de sitio: " . $base . "/sitemap.xml\n";
}

if ($path === '/robots.txt') {
    seoRobots();
    exit;
}

try {
    $pdo = \Core\Database::connection();
    if ($path === '/sitemap.xml') {
        seoSitemap($pdo);
    } elseif ($path === '/llms.txt') {
        seoLlms($pdo);
    } elseif ($path === '/gasolineras') {
        seoIndexPage($pdo);
    } elseif (preg_match('#^/gasolineras/([a-z0-9-]+)$#', $path, $m)) {
        seoAreaPage($pdo, $m[1], '');
    } elseif (preg_match('#^/gasolineras/([a-z0-9-]+)/([a-z0-9-]+)$#', $path, $m)) {
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
