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
.home-btn{display:inline-flex;align-items:center;gap:8px;margin:16px 0 0;padding:8px 14px;border:1px solid var(--border);background:var(--surface);color:var(--text);font-weight:700;text-decoration:none;font-size:.92rem}
.home-btn svg{width:18px;height:18px}
.years{font-weight:700}
.years a{margin-right:4px}
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
        . '<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" type="image/png" sizes="48x48" href="/icons/favicon-48.png"><link rel="icon" type="image/png" sizes="96x96" href="/icons/favicon-96.png"><link rel="icon" type="image/png" sizes="192x192" href="/icons/favicon-192.png">'
        . seoStyles() . $jsonLd . '</head><body>'
        . '<div class="top"><a href="' . Seo::escape(Country::prefix(Country::code()) . '/') . '">Gasolinera+</a>' . seoCountryNav() . '</div><div class="wrap">';
}

function seoFooter(string $updated): string
{
    return '<p class="note">' . Seo::escape(Seo::t('seo.footer', ['date' => Seo::date($updated)])) . '</p></div></body></html>';
}

/** Botón para volver a la portada de la aplicación, arriba de los informes. */
function seoHomeButton(): string
{
    $icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>';
    return '<a class="home-btn" href="' . Seo::escape(Country::prefix(Country::code()) . '/') . '">' . $icon . Seo::escape(Seo::t('seo.home')) . '</a>';
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

function seoTrend(array $trend, string $placeLabel, int $tableRows = 7, bool $lead = true): string
{
    if (count($trend) < 2) {
        return '';
    }
    $fuels = Seo::profile()['headline'];
    $dates = array_keys($trend);
    $newest = $trend[$dates[0]];
    $oldest = $trend[$dates[count($dates) - 1]];
    $parts = [];
    foreach ($fuels as $fuel) {
        if (!isset($newest[$fuel], $oldest[$fuel])) {
            continue;
        }
        $cents = ($newest[$fuel] - $oldest[$fuel]) * 100;
        $vars = ['fuel' => Seo::fuelLabel($fuel), 'cents' => number_format(abs($cents), 1, ',', '.')];
        if (abs($cents) < 0.05) {
            $parts[] = Seo::t('seo.trend.flat', $vars);
        } elseif ($cents > 0) {
            $parts[] = Seo::t('seo.trend.up', $vars);
        } else {
            $parts[] = Seo::t('seo.trend.down', $vars);
        }
    }
    $html = '';
    if ($lead && $parts !== []) {
        $span = (int)round((strtotime($dates[0] . ' 12:00:00 UTC') - strtotime($dates[count($dates) - 1] . ' 12:00:00 UTC')) / 86400) + 1;
        $separator = '; ';
        if (Seo::lang() === 'fr') {
            $separator = ' ; ';
        }
        $html .= '<p>' . Seo::escape(Seo::t('seo.trend.lead', ['d' => $span, 'place' => $placeLabel, 'list' => implode($separator, $parts)])) . '</p>';
    }
    $head = '<th>' . Seo::escape(Seo::t('seo.table.date')) . '</th>';
    foreach ($fuels as $fuel) {
        $head .= '<th class="n">' . Seo::escape(Seo::fuelLabel($fuel)) . '</th>';
    }
    $rows = '';
    foreach (array_slice($dates, 0, $tableRows) as $date) {
        $rows .= '<tr><td><time datetime="' . Seo::escape($date) . '">' . Seo::escape(Seo::date($date)) . '</time></td>';
        foreach ($fuels as $fuel) {
            $cell = '—';
            if (isset($trend[$date][$fuel])) {
                $cell = Seo::price($trend[$date][$fuel]) . ' €';
            }
            $rows .= '<td class="n">' . $cell . '</td>';
        }
        $rows .= '</tr>';
    }
    return $html . '<div class="card"><table><thead><tr>' . $head . '</tr></thead><tbody>' . $rows . '</tbody></table></div>';
}

function seoBrands(array $brands, string $fuel, string $placeLabel, int $min = 2): string
{
    if (count($brands) < 2) {
        return '';
    }
    $rows = '';
    foreach ($brands as $row) {
        $rows .= '<tr><td>' . Seo::escape(Seo::display((string)$row['marca'])) . '</td><td class="n">' . Seo::price((float)$row['media']) . ' €</td><td class="n">' . Seo::price((float)$row['minimo']) . ' €</td><td class="n">' . (int)$row['n'] . '</td></tr>';
    }
    $html = '<h2>' . Seo::escape(Seo::t('seo.h2.brands', ['p' => $placeLabel, 'fuel' => Seo::fuelLabel($fuel)])) . '</h2>';
    $html .= '<p>' . Seo::escape(Seo::t('seo.brands.intro', ['p' => $placeLabel, 'fuel' => Seo::fuelLabel($fuel), 'min' => $min])) . '</p>';
    $html .= '<div class="card"><table><thead><tr><th>' . Seo::escape(Seo::t('seo.table.brand')) . '</th><th class="n">' . Seo::escape(Seo::t('seo.table.mean')) . '</th><th class="n">' . Seo::escape(Seo::t('seo.table.min')) . '</th><th class="n">' . Seo::escape(Seo::t('seo.table.count')) . '</th></tr></thead><tbody>' . $rows . '</tbody></table></div>';
    return $html;
}

function seoPriceTitle(string $key, array $vars, string $fallback): string
{
    $title = Seo::t($key, $vars) . ' | Gasolinera+';
    if (mb_strlen($title) > 65) {
        $title = Seo::t($key, $vars);
    }
    if (mb_strlen($title) > 65) {
        return $fallback;
    }
    return $title;
}

function seoReportUrl(?string $code = null): string
{
    if ($code === null) {
        $code = Country::code();
    }
    $profile = Seo::profile($code);
    return Country::prefix($code) . '/' . $profile['section'] . '/' . $profile['report'];
}

function seoReportLink(): string
{
    return '<p><a href="' . Seo::escape(seoReportUrl()) . '">' . Seo::escape(Seo::t('seo.report.link')) . '</a></p>';
}

function seoThousands(int $value): string
{
    $separator = '.';
    if (Seo::lang() !== 'es') {
        $separator = "\u{00A0}";
    }
    return number_format($value, 0, ',', $separator);
}

function seoArchiveUrl(?string $month = null, ?string $code = null): string
{
    if ($code === null) {
        $code = Country::code();
    }
    if ($month === null) {
        return seoReportUrl($code) . '/' . Seo::profile($code)['archive'];
    }
    return seoReportUrl($code) . '/' . $month;
}

/** Nombre del mes de una clave AAAA-MM ("noviembre de 2026"). */
function seoMonthName(string $month): string
{
    return Seo::monthYear($month . '-01');
}

/**
 * Resumen de un mes con la media nacional diaria: media del mes, día más barato, día más caro y variación.
 */
function seoMonthSummary(array $days, string $monthName): string
{
    if (count($days) < 2) {
        return '';
    }
    $items = '';
    foreach (Seo::profile()['headline'] as $fuel) {
        $values = [];
        foreach ($days as $date => $fuels) {
            if (isset($fuels[$fuel])) {
                $values[$date] = (float)$fuels[$fuel];
            }
        }
        if (count($values) < 2) {
            continue;
        }
        $cheapDay = array_search(min($values), $values, true);
        $dearDay = array_search(max($values), $values, true);
        $dates = array_keys($values);
        $last = $values[$dates[0]];
        $first = $values[$dates[count($dates) - 1]];
        $cents = ($last - $first) * 100;
        $key = 'seo.archive.summaryFlat';
        if ($cents >= 0.05) {
            $key = 'seo.archive.summaryUp';
        } elseif ($cents <= -0.05) {
            $key = 'seo.archive.summaryDown';
        }
        $items .= '<li>' . Seo::escape(Seo::t($key, [
            'fuel' => Seo::fuelLabel($fuel),
            'mean' => Seo::price(array_sum($values) / count($values)),
            'cheapDay' => Seo::date((string)$cheapDay),
            'cheap' => Seo::price(min($values)),
            'dearDay' => Seo::date((string)$dearDay),
            'dear' => Seo::price(max($values)),
            'cents' => number_format(abs($cents), 1, ',', '.'),
        ])) . '</li>';
    }
    if ($items === '') {
        return '';
    }
    return '<h2>' . Seo::escape(Seo::t('seo.archive.h2.summary', ['month' => $monthName])) . '</h2><ul>' . $items . '</ul>';
}

/** Enlaces a los informes de meses anteriores (los ya cerrados). */
function seoArchiveLinks(array $archive, string $currentMonth, int $limit = 3): string
{
    $items = '';
    $shown = 0;
    foreach (array_keys($archive) as $month) {
        if ($month >= $currentMonth) {
            continue;
        }
        $items .= '<li><a href="' . Seo::escape(seoArchiveUrl($month)) . '">' . Seo::escape(Seo::t('seo.archive.item', ['month' => seoMonthName($month)])) . '</a></li>';
        $shown++;
        if ($shown >= $limit) {
            break;
        }
    }
    $html = '';
    if ($items !== '') {
        $html = '<h2>' . Seo::escape(Seo::t('seo.archive.h2.previous')) . '</h2><ul>' . $items . '</ul>';
    }
    return $html . '<p><a href="' . Seo::escape(seoArchiveUrl()) . '">' . Seo::escape(Seo::t('seo.archive.link')) . '</a></p>';
}

function seoReportPage(\PDO $pdo): void
{
    $data = Seo::reportData($pdo);
    seoRenderReport($data, '', Seo::archive($pdo));
}

/**
 * Pinta el informe. Con $month vacío es la página en vivo; con un mes (AAAA-MM) es la foto guardada de ese mes,
 * que queda fija cuando el mes termina.
 */
function seoRenderReport(array $data, string $month, array $archive): void
{
    $base = Seo::siteUrl();
    $section = Seo::sectionUrl();
    $home = Country::prefix(Country::code()) . '/';
    $updated = (string)$data['updated'];
    $headline = Seo::profile()['headline'];
    $country = Country::all()[Country::code()];
    $countryName = $country['name'][Seo::lang()] ?? $country['native'];
    $isArchive = $month !== '';
    $monthName = seoMonthName((string)$data['month']);
    $closed = $isArchive && $month < substr(date('Y-m-d'), 0, 7);
    $canonical = $base . seoReportUrl();
    if ($isArchive) {
        $canonical = $base . seoArchiveUrl($month);
    }
    $minStations = (int)$data['minStations'];
    $averages = $data['averages'];
    $ranked = [];
    foreach ($data['ranked'] as $row) {
        if (isset($row['fuels'][$headline[0]])) {
            $ranked[] = $row;
        }
    }

    $intro = Seo::t('seo.report.intro', ['date' => Seo::date($updated), 'n' => seoThousands((int)$data['stations']), 'pais' => $countryName, 'list' => seoAverageList($averages)]);
    $gaps = [];
    foreach ($headline as $fuel) {
        $list = [];
        foreach ($ranked as $row) {
            if (isset($row['fuels'][$fuel])) {
                $list[] = [$row['name'], (float)$row['fuels'][$fuel]['media']];
            }
        }
        if (count($list) < 2) {
            continue;
        }
        usort($list, function (array $a, array $b): int {
            return $a[1] <=> $b[1];
        });
        $cheap = $list[0];
        $dear = $list[count($list) - 1];
        $gaps[] = Seo::t('seo.report.gap', [
            'fuel' => Seo::fuelLabel($fuel),
            'cheap' => $cheap[0],
            'cheapPrice' => Seo::price($cheap[1]),
            'dear' => $dear[0],
            'dearPrice' => Seo::price($dear[1]),
            'cents' => number_format(($dear[1] - $cheap[1]) * 100, 1, ',', '.'),
        ]);
    }

    $reportLabel = Seo::t('seo.report.link');
    $crumbs = [['Gasolinera+', $home], [Seo::t('seo.section'), $section], [$reportLabel, '']];
    $ldCrumbs = [['Gasolinera+', $base . $home], [Seo::t('seo.section'), $base . $section], [$reportLabel, $canonical]];
    $h1 = Seo::t('seo.report.h1', ['month' => $monthName]);
    $title = Seo::t('seo.report.title', ['month' => $monthName]);
    $description = Seo::t('seo.report.desc', ['month' => $monthName, 'pais' => $countryName]);
    $robots = 'index, follow';
    if ($isArchive) {
        $crumbs = [['Gasolinera+', $home], [Seo::t('seo.section'), $section], [$reportLabel, seoReportUrl()], [Seo::t('seo.archive.title'), seoArchiveUrl()], [$monthName, '']];
        $ldCrumbs = [['Gasolinera+', $base . $home], [Seo::t('seo.section'), $base . $section], [$reportLabel, $base . seoReportUrl()], [Seo::t('seo.archive.title'), $base . seoArchiveUrl()], [$monthName, $canonical]];
        $h1 = Seo::t('seo.archive.h1', ['month' => $monthName, 'pais' => $countryName]);
        $title = Seo::t('seo.archive.pageTitle', ['month' => $monthName, 'pais' => $countryName]);
        $description = Seo::t('seo.archive.desc', ['month' => $monthName, 'pais' => $countryName]);
        if (!$closed) {
            // El mes en curso ya tiene la página en vivo: esta foto provisional no se indexa hasta que se cierre.
            $robots = 'noindex, follow';
        }
    }

    $ld = Seo::jsonLd(Seo::breadcrumb($ldCrumbs));
    $report = [
        '@context' => 'https://schema.org',
        '@type' => 'Report',
        'headline' => $h1,
        'inLanguage' => Seo::profile()['lang'],
        'dateModified' => $updated,
        'url' => $canonical,
        'author' => ['@type' => 'Person', 'name' => 'Yeray Garrido', 'url' => 'https://yeraygarrido.dev/'],
        'publisher' => ['@type' => 'Organization', 'name' => 'Gasolinera+', 'url' => $base . '/'],
        'isBasedOn' => $country['source'],
        'spatialCoverage' => ['@type' => 'Country', 'name' => $countryName],
        'isAccessibleForFree' => true,
    ];
    if ($isArchive) {
        $report['datePublished'] = $updated;
        $report['temporalCoverage'] = $month;
        $report['isPartOf'] = ['@type' => 'CollectionPage', 'url' => $base . seoArchiveUrl()];
    }
    $ld .= Seo::jsonLd($report);
    // Los meses guardados no llevan hreflang: el mismo mes puede no existir todavía en otro país.
    $alternates = '';
    if (!$isArchive) {
        $alternates = seoAlternates(function (string $code): string {
            $profile = Seo::profile($code);
            return '/' . $profile['section'] . '/' . $profile['report'];
        });
    }

    $html = seoHead($title, Seo::trim($description, 160), $canonical, $robots, $ld, $alternates);
    $html .= seoHomeButton();
    $html .= seoCrumbs($crumbs);
    $html .= '<h1>' . Seo::escape($h1) . '</h1>';
    if ($isArchive) {
        $lead = Seo::t('seo.archive.open', ['month' => $monthName]);
        if ($closed) {
            $lead = Seo::t('seo.archive.closed', ['month' => $monthName, 'date' => Seo::date($updated)]);
        }
        $html .= '<p><strong>' . Seo::escape($lead) . '</strong></p>';
    }
    $html .= '<p>' . Seo::escape($intro) . '</p>';
    foreach ($gaps as $gap) {
        $html .= '<p>' . Seo::escape($gap) . '</p>';
    }
    $html .= '<a class="cta" href="' . Seo::escape($home) . '">' . Seo::escape(Seo::t('seo.cta')) . '</a>';
    $html .= seoMonthSummary($data['monthDays'] ?? [], $monthName);
    $averagesTitle = Seo::t('seo.index.averages');
    if ($isArchive) {
        $averagesTitle = Seo::t('seo.archive.averages', ['pais' => $countryName, 'date' => Seo::date($updated)]);
    }
    $html .= '<h2>' . Seo::escape($averagesTitle) . '</h2>' . seoPriceTable($averages);

    $provinceLabel = $country['labels']['province'][Seo::lang()];
    $rankTable = function (array $rows) use ($headline, $section, $provinceLabel): string {
        $head = '<th>' . Seo::escape($provinceLabel) . '</th>';
        foreach ($headline as $fuel) {
            $head .= '<th class="n">' . Seo::escape(Seo::fuelLabel($fuel)) . '</th>';
        }
        $body = '';
        foreach ($rows as $row) {
            $body .= '<tr><td><a href="' . Seo::escape($section . '/' . $row['slug']) . '">' . Seo::escape($row['name']) . '</a></td>';
            foreach ($headline as $fuel) {
                $cell = '—';
                if (isset($row['fuels'][$fuel])) {
                    $cell = Seo::price((float)$row['fuels'][$fuel]['media']) . ' €';
                }
                $body .= '<td class="n">' . $cell . '</td>';
            }
            $body .= '</tr>';
        }
        return '<div class="card"><table><thead><tr>' . $head . '</tr></thead><tbody>' . $body . '</tbody></table></div>';
    };
    if (count($ranked) >= 2) {
        $size = min(10, intdiv(count($ranked), 2));
        $noteKey = 'seo.report.rankNote';
        if ($isArchive) {
            $noteKey = 'seo.archive.rankNote';
        }
        $note = '<p>' . Seo::escape(Seo::t($noteKey, ['min' => $minStations, 'date' => Seo::date($updated)])) . '</p>';
        $html .= '<h2>' . Seo::escape(Seo::t('seo.report.h2.cheapest')) . '</h2>' . $note . $rankTable(array_slice($ranked, 0, $size));
        $html .= '<h2>' . Seo::escape(Seo::t('seo.report.h2.dearest')) . '</h2>' . $rankTable(array_reverse(array_slice($ranked, -$size)));
    }

    $spreads = [];
    foreach ($ranked as $row) {
        $cell = $row['fuels'][$headline[0]];
        $spreads[] = [$row['name'], (float)$cell['maximo'] - (float)$cell['minimo']];
    }
    usort($spreads, function (array $a, array $b): int {
        return $b[1] <=> $a[1];
    });
    if ($spreads !== []) {
        $items = '';
        foreach (array_slice($spreads, 0, 5) as $spread) {
            $items .= '<li>' . Seo::escape(Seo::t('seo.report.spreadRow', [
                'p' => $spread[0],
                'cents' => number_format($spread[1] * 100, 1, ',', '.'),
                'euros' => number_format($spread[1] * 50, 2, ',', '.'),
            ])) . '</li>';
        }
        $html .= '<h2>' . Seo::escape(Seo::t('seo.report.h2.spread')) . '</h2>';
        $html .= '<p>' . Seo::escape(Seo::t('seo.report.spreadIntro', ['fuel' => Seo::fuelLabel($headline[0])])) . '</p><ul>' . $items . '</ul>';
    }

    if ($isArchive) {
        $trendHtml = seoTrend($data['monthDays'] ?? [], $countryName, 31, false);
    } else {
        $trendHtml = seoTrend($data['trend'] ?? [], $countryName, 7);
    }
    if ($trendHtml !== '') {
        $html .= '<h2>' . Seo::escape(Seo::t('seo.index.trend', ['pais' => $countryName])) . '</h2>' . $trendHtml;
    }
    $html .= seoBrands($data['brands'], $headline[0], $countryName, 20);
    if ($data['cheapest'] !== []) {
        $html .= '<h2>' . Seo::escape(Seo::t('seo.report.h2.stations', ['pais' => $countryName, 'fuel' => Seo::fuelLabel($headline[0])])) . '</h2>' . seoRanking($data['cheapest']);
    }
    $html .= '<h2>' . Seo::escape(Seo::t('seo.report.h2.method')) . '</h2>';
    $methodKey = 'seo.report.method';
    if ($isArchive) {
        $methodKey = 'seo.archive.method';
    }
    $html .= '<p>' . Seo::escape(Seo::t($methodKey, ['fuente' => $country['source'], 'date' => Seo::date($updated)])) . '</p>';
    $html .= '<p>' . Seo::escape(Seo::t('seo.report.cite')) . ' <code>' . Seo::escape($canonical) . '</code></p>';
    if ($isArchive) {
        $html .= seoArchiveNav($archive, $month);
    } else {
        $html .= seoArchiveLinks($archive, (string)$data['month']);
    }
    $html .= seoFooter($updated);

    header('Content-Type: text/html; charset=utf-8');
    if ($closed) {
        seoCache(86400);
    } else {
        seoCache(3600);
    }
    echo $html;
}

/** Mes anterior, mes siguiente e informe en vivo, al pie de un informe guardado. */
function seoArchiveNav(array $archive, string $month): string
{
    $months = array_keys($archive);
    $links = [];
    $index = array_search($month, $months, true);
    if ($index !== false && isset($months[$index + 1])) {
        $links[] = '<a href="' . Seo::escape(seoArchiveUrl($months[$index + 1])) . '">← ' . Seo::escape(seoMonthName($months[$index + 1])) . '</a>';
    }
    $links[] = '<a href="' . Seo::escape(seoArchiveUrl()) . '">' . Seo::escape(Seo::t('seo.archive.link')) . '</a>';
    $links[] = '<a href="' . Seo::escape(seoReportUrl()) . '">' . Seo::escape(Seo::t('seo.archive.live')) . '</a>';
    if ($index !== false && $index > 0) {
        $links[] = '<a href="' . Seo::escape(seoArchiveUrl($months[$index - 1])) . '">' . Seo::escape(seoMonthName($months[$index - 1])) . ' →</a>';
    }
    return '<p class="crumbs">' . implode(' · ', $links) . '</p>';
}

function seoArchiveMonthPage(\PDO $pdo, string $month): void
{
    $archive = Seo::archive($pdo);
    if (!isset($archive[$month])) {
        seoNotFound();
        return;
    }
    seoRenderReport($archive[$month], $month, $archive);
}

/** Índice de los informes mensuales guardados, del más reciente al más antiguo. */
function seoArchiveIndexPage(\PDO $pdo): void
{
    $base = Seo::siteUrl();
    $section = Seo::sectionUrl();
    $home = Country::prefix(Country::code()) . '/';
    $headline = Seo::profile()['headline'];
    $country = Country::all()[Country::code()];
    $countryName = $country['name'][Seo::lang()] ?? $country['native'];
    $archive = Seo::archive($pdo);
    $current = substr(date('Y-m-d'), 0, 7);
    $canonical = $base . seoArchiveUrl();
    $reportLabel = Seo::t('seo.report.link');
    $title = Seo::t('seo.archive.title');

    // Una tabla por año, del más reciente al más antiguo, con la variación frente al mes anterior.
    $months = array_keys($archive);
    $years = [];
    $elements = [];
    foreach ($months as $i => $month) {
        $data = $archive[$month];
        $label = seoMonthName($month);
        if ($month >= $current) {
            $label .= ' (' . Seo::t('seo.archive.inProgress') . ')';
        }
        $row = '<tr><td><a href="' . Seo::escape(seoArchiveUrl($month)) . '">' . Seo::escape($label) . '</a></td>';
        foreach ($headline as $fuel) {
            $cell = '—';
            if (isset($data['averages'][$fuel])) {
                $cell = Seo::price((float)$data['averages'][$fuel]['media']) . ' €';
            }
            $row .= '<td class="n">' . $cell . '</td>';
        }
        $change = '—';
        $previous = $months[$i + 1] ?? null;
        if ($previous !== null && $previous !== date('Y-m', strtotime($month . '-01 -1 month'))) {
            $previous = null; // Solo se compara con el mes justo anterior, no con el último guardado.
        }
        if ($previous !== null && isset($data['averages'][$headline[0]], $archive[$previous]['averages'][$headline[0]])) {
            $cents = ((float)$data['averages'][$headline[0]]['media'] - (float)$archive[$previous]['averages'][$headline[0]]['media']) * 100;
            $change = number_format(abs($cents), 1, ',', '.');
            if ($cents >= 0.05) {
                $change = '+' . $change;
            } elseif ($cents <= -0.05) {
                $change = '−' . $change;
            } else {
                $change = '0,0';
            }
        }
        $row .= '<td class="n">' . $change . '</td></tr>';
        $years[substr($month, 0, 4)][] = $row;
        if ($month < $current) {
            $elements[] = ['@type' => 'ListItem', 'position' => count($elements) + 1, 'url' => $base . seoArchiveUrl($month), 'name' => Seo::t('seo.archive.item', ['month' => seoMonthName($month)])];
        }
    }

    $ld = Seo::jsonLd(Seo::breadcrumb([['Gasolinera+', $base . $home], [Seo::t('seo.section'), $base . $section], [$reportLabel, $base . seoReportUrl()], [$title, $canonical]]));
    if ($elements !== []) {
        $ld .= Seo::jsonLd(['@context' => 'https://schema.org', '@type' => 'ItemList', 'name' => $title . ' · ' . $countryName, 'itemListElement' => $elements]);
    }
    $alternates = seoAlternates(function (string $code): string {
        $profile = Seo::profile($code);
        return '/' . $profile['section'] . '/' . $profile['report'] . '/' . $profile['archive'];
    });
    $description = Seo::t('seo.archive.indexDesc', ['pais' => $countryName]);
    $html = seoHead($title . ' · ' . $countryName . ' | Gasolinera+', Seo::trim($description, 160), $canonical, 'index, follow', $ld, $alternates);
    $html .= seoHomeButton();
    $html .= seoCrumbs([['Gasolinera+', $home], [Seo::t('seo.section'), $section], [$reportLabel, seoReportUrl()], [$title, '']]);
    $html .= '<h1>' . Seo::escape($title . ' · ' . $countryName) . '</h1>';
    $html .= '<p>' . Seo::escape($description) . '</p>';
    $html .= '<p><a class="cta" href="' . Seo::escape(seoReportUrl()) . '">' . Seo::escape(Seo::t('seo.archive.live')) . '</a></p>';
    if ($years === []) {
        $html .= '<p>' . Seo::escape(Seo::t('seo.archive.empty')) . '</p>';
    } else {
        if (count($years) > 1) {
            $jumps = [];
            foreach (array_keys($years) as $year) {
                $jumps[] = '<a href="#y' . $year . '">' . $year . '</a>';
            }
            $html .= '<p class="years">' . implode(' · ', $jumps) . '</p>';
        }
        $head = '<th>' . Seo::escape(Seo::t('seo.archive.month')) . '</th>';
        foreach ($headline as $fuel) {
            $head .= '<th class="n">' . Seo::escape(Seo::fuelLabel($fuel)) . '</th>';
        }
        $head .= '<th class="n">' . Seo::escape(Seo::t('seo.archive.change')) . '</th>';
        $html .= '<p>' . Seo::escape(Seo::t('seo.archive.tableNote', ['fuel' => Seo::fuelLabel($headline[0])])) . '</p>';
        foreach ($years as $year => $rows) {
            $html .= '<h2 id="y' . $year . '">' . $year . '</h2>';
            $html .= '<div class="card"><table><thead><tr>' . $head . '</tr></thead><tbody>' . implode('', $rows) . '</tbody></table></div>';
        }
    }
    $updated = date('Y-m-d');
    if ($archive !== []) {
        $updated = (string)reset($archive)['updated'];
    }
    $html .= seoFooter($updated);

    header('Content-Type: text/html; charset=utf-8');
    seoCache(3600);
    echo $html;
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
        foreach (Country::withData() as $altCountry) {
            if ($altCountry === Country::code()) {
                continue;
            }
            try {
                $altPath = Country::dbPathFor($altCountry);
                if (!is_file($altPath)) {
                    continue;
                }
                $altPdo = new \PDO('sqlite:' . $altPath);
                $altPdo->setAttribute(\PDO::ATTR_ERRMODE, \PDO::ERRMODE_EXCEPTION);
                $altPdo->setAttribute(\PDO::ATTR_DEFAULT_FETCH_MODE, \PDO::FETCH_ASSOC);
                $altProvinces = Seo::provinces($altPdo);
                if (isset($altProvinces[$provinceSlug])) {
                    $target = Seo::siteUrl() . Country::prefix($altCountry) . '/' . Seo::profile($altCountry)['section'] . '/' . $provinceSlug;
                    if ($municipalitySlug !== '') {
                        $target .= '/' . $municipalitySlug;
                    }
                    header('Location: ' . $target, true, 301);
                    exit;
                }
            } catch (\Throwable $e) {
                continue;
            }
        }
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
    if ($first !== []) {
        $titleVars = ['p' => $province['name'], 'fuel' => Seo::fuelShort($headline[0]), 'price' => Seo::price((float)$first[0]['precio'])];
        if ($municipalitySlug === '') {
            $title = seoPriceTitle('seo.prov.titlePrice', $titleVars, $title);
        } else {
            $title = seoPriceTitle('seo.muni.titlePrice', $titleVars + ['m' => $municipality['name']], $title);
        }
    }
    $trend = Seo::trend($pdo, $where, $params, 7);
    $brands = Seo::brands($pdo, $where, $params, $headline[0]);

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
    $trendHtml = seoTrend($trend, $placeLabel);
    if ($trendHtml !== '') {
        $html .= '<h2>' . Seo::escape(Seo::t('seo.h2.trend', ['place' => $placeLabel])) . '</h2>' . $trendHtml;
    }
    if ($first !== []) {
        $html .= '<h2>' . Seo::escape(Seo::t('seo.h2.cheapest', ['fuel' => Seo::fuelLabel($headline[0])])) . '</h2>' . seoRanking($first);
    }
    if ($second !== []) {
        $html .= '<h2>' . Seo::escape(Seo::t('seo.h2.cheapest', ['fuel' => Seo::fuelLabel($headline[1])])) . '</h2>' . seoRanking($second);
    }
    $html .= seoBrands($brands, $headline[0], $placeLabel);
    $html .= seoReportLink();
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
    $countryName = Country::all()[Country::code()]['name'][Seo::lang()] ?? Country::all()[Country::code()]['native'];
    $trendHtml = seoTrend(Seo::nationalTrend($pdo, 30), $countryName, 7);
    if ($trendHtml !== '') {
        $html .= '<h2>' . Seo::escape(Seo::t('seo.index.trend', ['pais' => $countryName])) . '</h2>' . $trendHtml;
    }
    $html .= seoReportLink();
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
    $urls = [[$base . Country::prefix(Country::code()) . '/', 'daily', '1.0'], [$base . $section, 'daily', '0.9'], [$base . seoReportUrl(), 'daily', '0.9']];
    $archive = Seo::archive($pdo);
    if ($archive !== []) {
        $urls[] = [$base . seoArchiveUrl(), 'monthly', '0.7'];
        $current = substr(date('Y-m-d'), 0, 7);
        foreach (array_keys($archive) as $month) {
            if ($month < $current) {
                $urls[] = [$base . seoArchiveUrl($month), 'yearly', '0.6'];
            }
        }
    }
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
        echo '- [' . Seo::t('seo.report.link', [], $profile['lang']) . '](' . $base . seoReportUrl($code) . "): zonas más baratas y más caras, evolución de 30 días, marcas y gasolineras más baratas.\n";
        echo '- [' . Seo::t('seo.archive.title', [], $profile['lang']) . '](' . $base . seoArchiveUrl(null, $code) . "): informes de cada mes ya cerrado, con los datos congelados del último día del mes ({AAAA-MM}).\n";
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
    } elseif ($path === $section . '/' . Seo::profile()['report']) {
        seoReportPage($pdo);
    } elseif ($path === $section . '/' . Seo::profile()['report'] . '/' . Seo::profile()['archive']) {
        seoArchiveIndexPage($pdo);
    } elseif (preg_match('#^' . preg_quote($section . '/' . Seo::profile()['report'], '#') . '/(\d{4}-(0[1-9]|1[0-2]))$#', $path, $m)) {
        seoArchiveMonthPage($pdo, $m[1]);
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
