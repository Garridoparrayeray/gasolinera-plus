<?php
$isNative = getenv('GP_NATIVE') === '1';
$ogTitle = 'Gasolinera+';
$ogDescription = 'Precios de gasolina y diésel cerca de ti, actualizados a diario.';
$ogUrl = 'https://gasolineraplus.vercel.app/';

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$path = parse_url($requestUri, PHP_URL_PATH);

if (preg_match('#^/stations/([^/]+)/?$#', $path, $matches)) {
    $ideess = $matches[1];

    require_once __DIR__ . '/Core/Config.php';
    require_once __DIR__ . '/Core/Database.php';
    
    try {
        $pdo = \Core\Database::connection();
        $stmt = $pdo->prepare('SELECT rotulo, direccion, municipio FROM stations WHERE ideess = ?');
        $stmt->execute([$ideess]);
        $station = $stmt->fetch();
        
        if ($station) {
            $ogTitle = $station['rotulo'] . ' en ' . $station['municipio'];
            
            $priceStmt = $pdo->prepare("SELECT carburante, precio FROM current_prices WHERE ideess = ? AND carburante IN ('gasoleo_a', 'gasolina_95_e5')");
            $priceStmt->execute([$ideess]);
            $prices = $priceStmt->fetchAll();
            
            $priceText = [];
            foreach ($prices as $p) {
                $name = 'Gasolina 95';
                if ($p['carburante'] === 'gasoleo_a') {
                    $name = 'Gasóleo A';
                }
                $priceText[] = $name . ' a ' . number_format((float)$p['precio'], 3, ',', '.') . '€';
            }
            
            $desc = $station['direccion'];
            if (!empty($priceText)) {
                $desc .= '. ' . implode(', ', $priceText);
            }
            $ogDescription = $desc . '. Comprueba el precio actual en Gasolinera+.';
            $ogUrl = 'https://gasolineraplus.vercel.app/stations/' . urlencode($ideess);
        }
    } catch (\Throwable $t) {
        error_log('Gasolinera+ shell OG: ' . $t->getMessage());
    }
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Gasolinera+">
    <title><?= htmlspecialchars($ogTitle) ?></title>
    <meta name="description" content="<?= htmlspecialchars($ogDescription) ?>">
    <meta property="og:title" content="<?= htmlspecialchars($ogTitle) ?>">
    <meta property="og:description" content="<?= htmlspecialchars($ogDescription) ?>">
    <meta property="og:url" content="<?= htmlspecialchars($ogUrl) ?>">
    <meta property="og:image" content="https://gasolineraplus.vercel.app/icons/icon-512.png">
    <meta property="og:image:width" content="512">
    <meta property="og:image:height" content="512">
    <meta property="og:site_name" content="Gasolinera+">
    <meta property="og:type" content="website">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:image" content="https://gasolineraplus.vercel.app/icons/icon-512.png">
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#8A5A00">
    <link rel="apple-touch-icon" href="/icons/icon-maskable-192.png">
    <link rel="icon" href="/icons/icon-192.png">
    <link rel="stylesheet" href="/vendor/fonts/fonts.css">
    <link rel="stylesheet" href="/vendor/leaflet/leaflet.css">
    <link rel="stylesheet" href="/vendor/markercluster/MarkerCluster.css">
    <link rel="stylesheet" href="/vendor/markercluster/MarkerCluster.Default.css">
    <link rel="stylesheet" href="/style.css">
<?php if (!$isNative): ?>
    <script>
      window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    </script>
    <script defer src="/_vercel/insights/script.js"></script>
<?php endif; ?>
</head>
<body>

    <main class="app-container">

        <header>
            <div class="home-link-wrap">
                <span id="app-logomark" aria-hidden="true">
                    <svg class="logo-gasolinera" viewBox="0 0 512 512">
                        <rect width="512" height="512" rx="116" fill="#8A5A00"/>
                        <g transform="translate(112,112) scale(4.5)">
                            <path d="M32 3c1.6 11.6 10.4 16.2 15.6 24.6 5.6 9.1 2.4 22.3-7.3 27.7-2.7 1.6-5.5 2.3-8.3 2.4 5.5-4.6 7.1-11 3.7-16.3-2.1-3.2-5.6-5.1-5.8-10-3.3 3.3-4.6 7.3-3.9 11.5-4.4-2.7-6.4-6.9-6.5-11.8-4.2 4.6-5.6 10-4.2 15.9C10.8 41.5 10.2 33.8 13.5 26.5 17.4 18 30 14.7 32 3z" fill="#F2B705"/>
                        </g>
                    </svg>
                </span>
                <span>
                    <strong id="app-title">GASOLINERA<span class="plus">+</span></strong>
                    <span id="app-subtitle">Precios reales de gasolineras</span>
                </span>
            </div>
            <span class="header-actions">
                <button id="geo-toggle" class="btn-icon" type="button" aria-label="Activar ubicación" aria-pressed="false" hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.5C12 21.5 5 15.2 5 9.8C5 5.9 8.1 2.5 12 2.5C15.9 2.5 19 5.9 19 9.8C19 15.2 12 21.5 12 21.5Z"/><circle cx="12" cy="9.5" r="2.5"/></svg>
                </button>
                <button id="favorites-open" class="btn-icon" type="button" aria-label="Ver favoritas">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20.5C12 20.5 3.5 15.4 3.5 9.5C3.5 6.5 5.8 4.5 8.5 4.5C10.1 4.5 11.3 5.3 12 6.5C12.7 5.3 13.9 4.5 15.5 4.5C18.2 4.5 20.5 6.5 20.5 9.5C20.5 15.4 12 20.5 12 20.5Z"/></svg>
                    <span id="favorites-count" class="count-badge" hidden>0</span>
                </button>
                <button id="compare-open" class="btn-icon" type="button" aria-label="Ver comparador">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="10" width="6" height="11"/><rect x="15" y="4" width="6" height="17"/></svg>
                    <span id="compare-count" class="count-badge" hidden>0</span>
                </button>
            </span>
        </header>

        <p id="update-banner" role="status" hidden>Hay una versión nueva de Gasolinera+ (<span id="update-version"></span>). <a id="update-link" href="#">Descargar e instalar</a></p>

        <p id="offline-banner" role="status" hidden>Estás en modo local sin conexión: precios del último día sincronizado, sin histórico ni tendencias. Cuando te conectes otra vez a internet se actualizarán automáticamente.</p>

        <dialog id="geo-ask">
            <span id="geo-ask-logomark" aria-hidden="true">
                <svg class="logo-gasolinera" viewBox="0 0 512 512">
                    <rect width="512" height="512" rx="116" fill="#8A5A00"/>
                    <g transform="translate(112,112) scale(4.5)">
                        <path d="M32 3c1.6 11.6 10.4 16.2 15.6 24.6 5.6 9.1 2.4 22.3-7.3 27.7-2.7 1.6-5.5 2.3-8.3 2.4 5.5-4.6 7.1-11 3.7-16.3-2.1-3.2-5.6-5.1-5.8-10-3.3 3.3-4.6 7.3-3.9 11.5-4.4-2.7-6.4-6.9-6.5-11.8-4.2 4.6-5.6 10-4.2 15.9C10.8 41.5 10.2 33.8 13.5 26.5 17.4 18 30 14.7 32 3z" fill="#F2B705"/>
                    </g>
                </svg>
            </span>
            <h3>¿Nos dejas tu ubicación?</h3>
            <p>Para enseñarte las gasolineras más cercanas necesitamos tu ubicación. No se guarda en ningún servidor, solo se usa en tu navegador para calcular distancias.</p>
            <div id="geo-ask-actions">
                <button id="geo-allow" type="button" class="pill">Activar ubicación</button>
                <button id="geo-skip" type="button">Buscar sin ubicación</button>
            </div>
        </dialog>

        <section id="national-stats">
            <button id="national-stats-toggle" type="button" aria-expanded="false">
                <span class="national-stats__figures">
                    <span><small>Gasóleo A hoy en España</small><strong id="national-gasoleo-a">—</strong></span>
                    <span><small>Gasolina 95 hoy en España</small><strong id="national-gasolina-95">—</strong></span>
                </span>
                <svg id="national-stats-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div id="national-stats-detail" hidden>
                <canvas id="national-chart" height="120"></canvas>
                <p id="national-stats-note"></p>
            </div>
        </section>

        <form id="search-form" autocomplete="off">
            <input id="search-input" type="search" placeholder="Buscar municipio, dirección o marca…" aria-label="Buscar gasolinera" autocomplete="off">
            <button type="submit" class="btn-icon" aria-label="Buscar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            </button>
            <ul id="search-suggestions" hidden></ul>
        </form>
        <button id="back-to-nearby" type="button" hidden>« Volver a gasolineras cerca de mí</button>

        <div id="filters-bar">
            <select id="filter-fuel" aria-label="Carburante">
                <option value="gasoleo_a">Gasóleo A</option>
                <option value="gasolina_95_e5">Gasolina 95 E5</option>
                <option value="gasoleo_premium">Gasóleo Premium</option>
                <option value="gasolina_98_e5">Gasolina 98 E5</option>
                <option value="adblue">AdBlue</option>
                <option value="glp">GLP</option>
                <optgroup label="Otras gasolinas y gasóleos">
                    <option value="gasolina_95_e5_premium">Gasolina 95 Premium</option>
                    <option value="gasoleo_b">Gasóleo B</option>
                    <option value="gasolina_95_e10">Gasolina 95 E10</option>
                    <option value="gasolina_98_e10">Gasolina 98 E10</option>
                    <option value="gasolina_95_e85">Gasolina 95 E85</option>
                </optgroup>
                <optgroup label="Alternativos y renovables">
                    <option value="diesel_renovable">Diésel Renovable</option>
                    <option value="gasolina_renovable">Gasolina Renovable</option>
                    <option value="biodiesel">Biodiésel</option>
                    <option value="bioetanol">Bioetanol</option>
                    <option value="gnc">Gas Natural Comprimido</option>
                    <option value="gnl">Gas Natural Licuado</option>
                    <option value="biogas_natural_comprimido">Biogás Natural Comprimido</option>
                    <option value="biogas_natural_licuado">Biogás Natural Licuado</option>
                    <option value="hidrogeno">Hidrógeno</option>
                </optgroup>
            </select>
            <select id="filter-radius" aria-label="Radio de búsqueda">
                <option value="1">1 km</option>
                <option value="3">3 km</option>
                <option value="5" selected>5 km</option>
                <option value="10">10 km</option>
                <option value="25">25 km</option>
            </select>
            <select id="filter-sort" aria-label="Ordenar por">
                <option value="price">Más barata primero</option>
                <option value="distance">Más cercana primero</option>
            </select>
            <select id="filter-open" aria-label="Apertura">
                <option value="">Cualquier horario</option>
                <option value="now">Abierto ahora</option>
                <option value="24h">Abierto 24h</option>
            </select>
        </div>

        <nav id="view-toggle" role="tablist" aria-label="Secciones">
            <button id="view-list-btn" type="button" role="tab" aria-selected="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>
                <span>Lista</span>
            </button>
            <button id="view-map-btn" type="button" role="tab" aria-selected="false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
                <span>Mapa</span>
            </button>
            <button id="view-route-btn" type="button" role="tab" aria-selected="false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/></svg>
                <span>Ruta</span>
            </button>
            <button id="view-garage-btn" type="button" role="tab" aria-selected="false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 17h14v-5l-2-5H7l-2 5v5z"/><line x1="5" y1="12" x2="19" y2="12"/><circle cx="8" cy="17" r="2"/><circle cx="16" cy="17" r="2"/></svg>
                <span>Mi coche</span>
            </button>
            <button id="view-stats-btn" type="button" role="tab" aria-selected="false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="20" x2="6" y2="12"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="18" y1="20" x2="18" y2="9"/></svg>
                <span>Estadísticas</span>
            </button>
        </nav>

        <p id="geo-fallback" hidden>
            No hemos podido acceder a tu ubicación. Puedes buscar por municipio o dirección arriba, o
            <button id="geo-retry" type="button">reintentar la ubicación</button>.
        </p>

        <section id="view-list">
            <p id="stations-geocoded-note" hidden></p>
            <ul id="stations-list"></ul>
            <p id="stations-empty" hidden>No hay gasolineras que coincidan con la búsqueda.</p>
            <nav id="stations-pagination" hidden aria-label="Paginación de resultados">
                <button id="pagination-prev" type="button" class="pill">« Anterior</button>
                <span id="pagination-status"></span>
                <button id="pagination-next" type="button" class="pill">Siguiente »</button>
            </nav>
        </section>

        <section id="view-map" hidden>
            <div id="map-controls">
                <button id="heatmap-toggle" type="button" class="pill" aria-pressed="false">Mapa de calor de precio</button>
                <button id="locate-me" type="button" class="pill">Mi ubicación</button>
            </div>
            <div id="map-wrap">
                <div id="map"></div>
                <div id="map-legend">
                    <span>Barata</span>
                    <span id="map-legend-gradient"></span>
                    <span>Cara</span>
                </div>
            </div>
            <p id="map-note" hidden></p>
        </section>

        <section id="view-route" hidden>
            <div class="garage-card" id="route-form-card">
                <h3>Ruta con gasolineras</h3>
                <form id="route-form" autocomplete="off">
                    <div class="route-field">
                        <label for="route-from">Desde</label>
                        <div class="route-input">
                            <input id="route-from" type="search" placeholder="Tu ubicación, pueblo o calle" autocomplete="off">
                            <button id="route-from-here" type="button" class="pill">Mi ubicación</button>
                        </div>
                        <ul id="route-from-suggestions" class="route-suggestions" hidden></ul>
                    </div>
                    <div class="route-field">
                        <div class="route-label-row">
                            <label for="route-to">Hasta</label>
                            <button id="route-swap" type="button" class="btn-icon" aria-label="Intercambiar origen y destino">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 4 7 20"/><polyline points="3 8 7 4 11 8"/><polyline points="17 20 17 4"/><polyline points="13 16 17 20 21 16"/></svg>
                            </button>
                        </div>
                        <div class="route-input">
                            <input id="route-to" type="search" placeholder="Pueblo, ciudad o calle" autocomplete="off">
                        </div>
                        <ul id="route-to-suggestions" class="route-suggestions" hidden></ul>
                    </div>
                    <div class="route-options">
                        <label>Desvío máximo
                            <select id="route-detour">
                                <option value="1">1 km</option>
                                <option value="2" selected>2 km</option>
                                <option value="5">5 km</option>
                            </select>
                        </label>
                        <label>Ordenar
                            <select id="route-sort">
                                <option value="along">Por el camino</option>
                                <option value="price">Más barata</option>
                            </select>
                        </label>
                    </div>
                    <button id="route-submit" type="submit" class="pill pill--primary">Calcular ruta</button>
                    <p id="route-status" class="garage-note" role="status"></p>
                    <div id="route-progress" hidden><span id="route-progress-bar"></span></div>
                </form>
            </div>

            <div id="route-map-wrap">
                <div id="route-map"></div>
                <p class="garage-note">Toca el mapa para elegir el destino. Rutas calculadas en tu dispositivo con datos de © OpenStreetMap, sin tráfico en tiempo real.</p>
            </div>

            <div id="route-result" hidden>
                <div class="garage-card">
                    <div class="garage-tiles">
                        <div><small>Distancia</small><strong id="route-distance">—</strong></div>
                        <div><small>Tiempo estimado</small><strong id="route-duration">—</strong></div>
                        <div><small>Coste estimado</small><strong id="route-cost">—</strong><small id="route-cost-note"></small></div>
                        <div><small>Gasolineras en ruta</small><strong id="route-count">—</strong></div>
                    </div>
                    <p id="route-toll" class="garage-note" hidden>La ruta incluye tramos de peaje.</p>
                    <div class="garage-actions">
                        <button id="route-navigate" type="button" class="pill pill--primary">Iniciar en Google Maps</button>
                        <button id="route-clear-stop" type="button" class="pill" hidden>Quitar la parada</button>
                    </div>
                </div>

                <div class="garage-card" id="route-refuel-card">
                    <h3>Dónde repostar</h3>
                    <div id="route-tank-row">
                        <label for="route-tank">Depósito ahora: <strong id="route-tank-value">50 %</strong></label>
                        <input id="route-tank" type="range" min="0" max="100" step="5" value="50">
                    </div>
                    <p id="route-refuel-advice"></p>
                    <button id="route-refuel-go" type="button" class="pill pill--primary" hidden>Parar en esta gasolinera</button>
                </div>

                <div class="garage-card">
                    <h3>Gasolineras del camino</h3>
                    <ul id="route-stations"></ul>
                    <p id="route-stations-empty" class="garage-note" hidden>No hay gasolineras con ese carburante a esa distancia de la ruta. Prueba con un desvío mayor.</p>
                </div>
            </div>
        </section>

        <section id="view-garage" hidden>
            <div id="garage-empty" class="garage-card">
                <h3>Tu garaje</h3>
                <p>Añade tu coche para conocer tu consumo real, cuánto gastas al mes y hasta dónde llegas con lo que queda en el depósito. Todo se guarda solo en este dispositivo.</p>
                <button id="garage-add-first" type="button" class="pill pill--primary">Añadir mi coche</button>
            </div>
            <div id="garage-main" hidden>
                <div id="garage-vehicles" role="tablist" aria-label="Tus coches"></div>
                <div class="garage-card" id="garage-vehicle-card">
                    <div class="garage-vehicle-head">
                        <div>
                            <strong id="garage-vehicle-name"></strong>
                            <small id="garage-vehicle-fuel"></small>
                        </div>
                        <button id="garage-edit" type="button" class="pill">Editar</button>
                    </div>
                    <div id="garage-tank">
                        <div id="garage-tank-bar"><span id="garage-tank-fill"></span></div>
                        <p id="garage-tank-text"></p>
                    </div>
                    <div class="garage-tiles">
                        <div><small>Consumo medio</small><strong id="garage-consumption">—</strong><small id="garage-consumption-source"></small></div>
                        <div><small>Coste por km</small><strong id="garage-cost-km">—</strong></div>
                        <div><small>Gasto este mes</small><strong id="garage-month-spend">—</strong></div>
                        <div><small>Cuentakilómetros</small><strong id="garage-odometer-value">—</strong></div>
                    </div>
                    <div class="garage-actions">
                        <button id="garage-refuel" type="button" class="pill pill--primary">Anotar repostaje</button>
                        <button id="garage-odometer" type="button" class="pill">Actualizar km</button>
                    </div>
                </div>
                <div class="garage-card">
                    <h3>Consumo real</h3>
                    <canvas id="garage-consumption-chart" height="160"></canvas>
                    <p id="garage-consumption-note" class="garage-note"></p>
                </div>
                <div class="garage-card">
                    <h3>Gasto por mes</h3>
                    <canvas id="garage-spend-chart" height="160"></canvas>
                </div>
                <div class="garage-card">
                    <h3>Lo que pagas frente a la media</h3>
                    <canvas id="garage-price-chart" height="160"></canvas>
                    <p id="garage-savings" class="garage-note"></p>
                </div>
                <div class="garage-card">
                    <h3>Repostajes</h3>
                    <p id="garage-refuels-empty" class="garage-note">Todavía no has anotado ningún repostaje. Anota los llenos con los km del cuentakilómetros para calcular tu consumo real.</p>
                    <ul id="garage-refuels"></ul>
                </div>
                <div class="garage-card" id="garage-trips-card" hidden>
                    <h3>Viajes</h3>
                    <div id="garage-trips"></div>
                </div>
                <div class="garage-card">
                    <h3>Copia de seguridad</h3>
                    <p class="garage-note">Tus coches, repostajes y viajes solo existen en este dispositivo. Guarda una copia de vez en cuando por si cambias de móvil.</p>
                    <label class="garage-check"><input type="checkbox" id="backup-include-trips" checked> Incluir los recorridos de los viajes</label>
                    <div class="garage-actions">
                        <button id="backup-export" type="button" class="pill">Exportar copia</button>
                        <button id="backup-import-btn" type="button" class="pill">Importar copia</button>
                        <input id="backup-import" type="file" accept="application/json,.json" hidden>
                    </div>
                    <p id="backup-note" class="garage-note" hidden></p>
                </div>
            </div>
        </section>

        <section id="view-stats" hidden>
            <div class="stats-block">
                <h3>Filtros</h3>
                <div class="stats-controls">
                    <select id="stats-fuel" aria-label="Carburante para las estadísticas">
                        <option value="gasoleo_a">Gasóleo A</option>
                        <option value="gasolina_95_e5">Gasolina 95 E5</option>
                        <option value="gasoleo_premium">Gasóleo Premium</option>
                        <option value="gasolina_98_e5">Gasolina 98 E5</option>
                        <option value="adblue">AdBlue</option>
                        <option value="glp">GLP</option>
                        <optgroup label="Otras gasolinas y gasóleos">
                            <option value="gasolina_95_e5_premium">Gasolina 95 Premium</option>
                            <option value="gasoleo_b">Gasóleo B</option>
                            <option value="gasolina_95_e10">Gasolina 95 E10</option>
                            <option value="gasolina_98_e10">Gasolina 98 E10</option>
                            <option value="gasolina_95_e85">Gasolina 95 E85</option>
                        </optgroup>
                        <optgroup label="Alternativos y renovables">
                            <option value="diesel_renovable">Diésel Renovable</option>
                            <option value="gasolina_renovable">Gasolina Renovable</option>
                            <option value="biodiesel">Biodiésel</option>
                            <option value="bioetanol">Bioetanol</option>
                            <option value="gnc">Gas Natural Comprimido</option>
                            <option value="gnl">Gas Natural Licuado</option>
                            <option value="biogas_natural_comprimido">Biogás Natural Comprimido</option>
                            <option value="biogas_natural_licuado">Biogás Natural Licuado</option>
                            <option value="hidrogeno">Hidrógeno</option>
                        </optgroup>
                    </select>
                    <div id="stats-group-toggle" role="tablist">
                        <button type="button" class="pill" data-group="day" aria-pressed="true">Diario</button>
                        <button type="button" class="pill" data-group="month" aria-pressed="false">Mensual</button>
                    </div>
                </div>
                <div class="stats-date-range">
                    <label>Desde <input id="stats-from" type="date"></label>
                    <label>Hasta <input id="stats-to" type="date"></label>
                </div>
                <p id="stats-range-note"></p>
            </div>

            <div class="stats-block">
                <h3>Media nacional</h3>
                <p id="stats-national-variation"></p>
                <canvas id="stats-national-chart" height="180"></canvas>
            </div>

            <div class="stats-block">
                <h3>Comparativa entre carburantes</h3>
                <canvas id="stats-by-fuel-chart" height="220"></canvas>
            </div>

            <div class="stats-block">
                <h3>Precio medio por provincia hoy</h3>
                <div id="stats-province-chart-wrap">
                    <canvas id="stats-province-chart"></canvas>
                </div>
            </div>

            <div class="stats-block">
                <h3>Distribución de precios hoy</h3>
                <p id="stats-distribution-note"></p>
                <canvas id="stats-distribution-chart" height="200"></canvas>
            </div>

            <div class="stats-block">
                <h3>Por gasolinera</h3>
                <div id="stats-station-search-wrap">
                    <input id="stats-station-search" type="search" placeholder="Buscar una gasolinera…" aria-label="Buscar gasolinera para sus estadísticas" autocomplete="off">
                    <ul id="stats-station-results"></ul>
                </div>
                <div id="stats-station-detail" hidden>
                    <p id="stats-station-name"></p>
                    <p id="stats-station-variation"></p>
                    <canvas id="stats-station-chart" height="180"></canvas>
                </div>
            </div>
        </section>

<?php if (!$isNative): ?>
        <section id="get-app" aria-labelledby="get-app-title">
            <h3 id="get-app-title">Gasolinera+ como app</h3>
            <p>Instálala para usarla sin navegador, con rutas, tu garaje y tus viajes.</p>
            <div id="get-app-actions">
                <a id="get-app-android" class="pill" href="https://github.com/Garridoparrayeray/gasolinera-plus/releases/latest/download/gasolinera-plus.apk" rel="noopener">Descargar para Android</a>
                <button id="get-app-ios" type="button" class="pill">Instalar en iPhone</button>
            </div>
            <p id="get-app-ios-help" hidden>En Safari, pulsa <strong>Compartir</strong> y después <strong>Añadir a pantalla de inicio</strong>. Se abrirá como una app, a pantalla completa.</p>
        </section>
<?php endif; ?>

        <footer id="dev-footer">
            <p>Hecho por Yeray Garrido</p>
            <p>
                <a href="https://www.linkedin.com/in/yeray-garrido" target="_blank" rel="noopener noreferrer">LinkedIn</a>
                <a href="https://www.yeraygarrido.dev/" target="_blank" rel="noopener noreferrer">Portfolio</a>
                <a href="https://github.com/Garridoparrayeray" target="_blank" rel="noopener noreferrer">GitHub</a>
                <button id="legal-open" type="button">Aviso legal y privacidad</button>
            </p>
        </footer>

    </main>

    <dialog id="legal-panel">
        <button id="legal-close" class="btn-icon" type="button" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
        </button>
        <h3>Aviso Legal, Privacidad y Cookies</h3>
        <p>En estricto cumplimiento del <strong>Artículo 18 de la Constitución Española</strong> (derecho a la intimidad), el <strong>Reglamento General de Protección de Datos (RGPD)</strong>, la <strong>LSSI-CE</strong> y la <strong>Ley 37/2007 de reutilización de la información del sector público</strong>, informamos de lo siguiente:</p>
        <p><strong>Identidad del responsable:</strong> Proyecto independiente desarrollado sin ánimo de lucro por Yeray Garrido. Gasolinera+ no está afiliado ni respaldado por el Ministerio para la Transición Ecológica ni por ninguna marca de estaciones de servicio.</p>
        <p><strong>Privacidad y ubicación:</strong> Esta app <strong>no recopila ni almacena datos personales en ningún servidor</strong>. Si activas la ubicación: con conexión a internet, tus coordenadas se envían de forma puntual a nuestro servidor únicamente para calcular las gasolineras más cercanas, sin guardarse; sin conexión, ese cálculo se hace enteramente en tu propio navegador y las coordenadas no salen de tu dispositivo.</p>
        <p><strong>Analíticas:</strong> Usamos Vercel Web Analytics, una herramienta sin cookies que identifica cada visita con un hash no persistente (no un identificador de usuario) y descarta los datos a las 24 horas. Solo recoge estadísticas agregadas y anónimas (página vista, ubicación aproximada por ciudad, tipo de dispositivo y navegador): no permite identificarte ni rastrearte entre webs. Más información en <a href="https://vercel.com/docs/analytics/privacy-policy" target="_blank" rel="noopener noreferrer">la política de privacidad de Vercel</a>. El servicio se aloja de forma segura en Vercel, que procesa direcciones IP temporalmente por motivos técnicos y de seguridad.</p>
        <p><strong>Cookies y almacenamiento local:</strong> No usamos cookies de terceros ni de rastreo. Empleamos el almacenamiento de tu propio navegador (<code>localStorage</code> e <code>IndexedDB</code>) exclusivamente para guardar tus gasolineras "Favoritas", el estado del "Comparador" y, si los activas, tus avisos de bajada de precio; todo queda solo en tu dispositivo. Al ser una petición del usuario de carácter puramente técnico, está exento del banner de consentimiento bajo el Art. 22.2 de la LSSI. Si borras los datos del navegador, se pierden.</p>
        <p><strong>Modo sin conexión:</strong> Sin internet, la app sigue funcionando con la última copia de datos descargada (normalmente, la del día anterior). No están disponibles el histórico de precios, las tendencias, la comparación con la media de la zona ni la búsqueda de localidades sin gasolineras propias: todo eso requiere conexión. Al recuperar internet, la app se actualiza sola.</p>
        <p><strong>Fuentes de datos y exención de responsabilidad:</strong> Los precios se publican tal cual los facilita el Ministerio para la Transición Ecológica, con actualización diaria automática y sin alterarlos; el mapa usa teselas de © OpenStreetMap contributors y búsquedas de lugares mediante Nominatim. No garantizamos la exactitud, actualidad ni disponibilidad continua de estos datos, que pueden no coincidir con el precio real en el momento de repostar. Esta aplicación es meramente informativa, no sustituye la comprobación del precio en el propio surtidor, y su uso es responsabilidad exclusiva de quien la utiliza.</p>
        <p><strong>Contacto.</strong> <a href="https://www.yeraygarrido.dev/" target="_blank" rel="noopener noreferrer">yeraygarrido.dev</a></p>
    </dialog>

    <dialog id="station-modal">
        <div id="modal-top-actions">
            <button id="modal-close" class="btn-icon" type="button" aria-label="Cerrar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
            </button>
            <button id="modal-share" class="btn-icon" type="button" aria-label="Compartir" hidden>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line></svg>
            </button>
            <button id="modal-favorite-toggle" class="btn-icon" type="button" aria-label="Añadir a favoritas" aria-pressed="false">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20.5C12 20.5 3.5 15.4 3.5 9.5C3.5 6.5 5.8 4.5 8.5 4.5C10.1 4.5 11.3 5.3 12 6.5C12.7 5.3 13.9 4.5 15.5 4.5C18.2 4.5 20.5 6.5 20.5 9.5C20.5 15.4 12 20.5 12 20.5Z"/></svg>
            </button>
        </div>
        <span id="modal-rotulo" class="badge"></span>
        <h3 id="modal-direccion"></h3>
        <p id="modal-municipio"></p>
        <p id="modal-horario"></p>
        <ul id="modal-fuels"></ul>
        <div id="modal-zone-comparison"></div>
        <canvas id="modal-chart" height="140"></canvas>
        <div id="modal-actions">
            <a id="modal-directions" class="pill" target="_blank" rel="noopener">Cómo llegar</a>
            <button id="modal-compare-toggle" type="button" class="pill">Añadir a comparar</button>
            <button id="modal-refuel" type="button" class="pill">Repostar aquí</button>
        </div>
    </dialog>

    <dialog id="vehicle-dialog">
        <form id="vehicle-form" method="dialog">
            <h3 id="vehicle-dialog-title">Tu coche</h3>
            <label>Nombre <input id="vehicle-name" type="text" maxlength="40" required placeholder="Por ejemplo, el Golf de casa"></label>
            <label>Carburante <select id="vehicle-fuel" required></select></label>
            <label><span id="vehicle-tank-label">Capacidad del depósito (L)</span> <input id="vehicle-tank" type="number" min="5" max="300" step="1" required></label>
            <label><span id="vehicle-homologated-label">Consumo homologado (L/100 km)</span> <input id="vehicle-homologated" type="number" min="1" max="40" step="0.1" required></label>
            <label>Kilómetros actuales <input id="vehicle-odometer" type="number" min="0" step="1" required></label>
            <p id="vehicle-error" class="form-error" hidden></p>
            <div class="dialog-actions">
                <button id="vehicle-delete" type="button" class="pill pill--danger" hidden>Borrar coche</button>
                <button id="vehicle-cancel" type="button" class="pill">Cancelar</button>
                <button id="vehicle-save" type="submit" class="pill pill--primary">Guardar</button>
            </div>
        </form>
    </dialog>

    <dialog id="refuel-dialog">
        <form id="refuel-form" method="dialog">
            <h3>Anotar repostaje</h3>
            <p id="refuel-station" class="garage-note" hidden></p>
            <label>Fecha y hora <input id="refuel-date" type="datetime-local" required></label>
            <label>Kilómetros del cuentakilómetros <input id="refuel-odometer" type="number" min="0" step="1" required></label>
            <div class="form-row">
                <label><span id="refuel-liters-label">Litros</span> <input id="refuel-liters" type="number" min="0.1" step="0.01" required></label>
                <label><span id="refuel-price-label">Precio (€/L)</span> <input id="refuel-price" type="number" min="0.1" step="0.001" required></label>
            </div>
            <label>Total pagado (€) <input id="refuel-total" type="number" min="0.1" step="0.01" required></label>
            <label class="garage-check"><input id="refuel-full" type="checkbox" checked> He llenado el depósito</label>
            <label class="garage-check"><input id="refuel-missed" type="checkbox"> Me salté anotar algún repostaje antes de este</label>
            <p id="refuel-error" class="form-error" hidden></p>
            <div class="dialog-actions">
                <button id="refuel-delete" type="button" class="pill pill--danger" hidden>Borrar</button>
                <button id="refuel-cancel" type="button" class="pill">Cancelar</button>
                <button id="refuel-save" type="submit" class="pill pill--primary">Guardar</button>
            </div>
        </form>
    </dialog>

    <dialog id="odometer-dialog">
        <form id="odometer-form" method="dialog">
            <h3>Kilómetros actuales</h3>
            <p class="garage-note">Mira el cuentakilómetros del coche. Sirve para estimar cuánto queda en el depósito.</p>
            <label>Kilómetros <input id="odometer-value" type="number" min="0" step="1" required></label>
            <p id="odometer-error" class="form-error" hidden></p>
            <div class="dialog-actions">
                <button id="odometer-cancel" type="button" class="pill">Cancelar</button>
                <button type="submit" class="pill pill--primary">Guardar</button>
            </div>
        </form>
    </dialog>


    <dialog id="favorites-panel">
        <button id="favorites-close" class="btn-icon" type="button" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
        </button>
        <h3>Gasolineras favoritas</h3>
        <p id="favorites-empty">Añade gasolineras desde su ficha para tenerlas siempre a mano aquí.</p>
        <ul id="favorites-list"></ul>
        <label id="alerts-toggle-wrap"><input type="checkbox" id="alerts-toggle"> Avisarme cuando bajen de precio</label>
        <p id="alerts-note" hidden></p>
    </dialog>

    <dialog id="compare-panel">
        <button id="compare-close" class="btn-icon" type="button" aria-label="Cerrar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>
        </button>
        <h3>Comparar gasolineras</h3>
        <p id="compare-empty">Añade gasolineras desde su ficha o desde la lista para compararlas aquí, una junto a otra.</p>
        <div id="compare-table"></div>
    </dialog>

    <p id="toast" hidden></p>

    <script src="/vendor/leaflet/leaflet.js"></script>
    <script src="/vendor/markercluster/leaflet.markercluster.js"></script>
    <script src="/vendor/leaflet-heat/leaflet-heat.js"></script>
    <script src="/vendor/chartjs/chart.umd.js"></script>
    <script src="/js/native.js"></script>
    <script src="/js/background.js"></script>
    <script src="/js/alerts-store.js"></script>
    <script src="/js/api.js"></script>
    <script src="/js/app.js"></script>
    <script src="/js/fuel-math.js"></script>
    <script src="/js/garage-store.js"></script>
    <script src="/js/backup.js"></script>
    <script src="/js/garage.js"></script>
    <script src="/js/router-core.js"></script>
    <script src="/js/route.js"></script>
<?php if (!$isNative): ?>
    <script>
        if ('serviceWorker' in navigator && !window.Capacitor) {
            window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
        }
    </script>
<?php endif; ?>
</body>
</html>
