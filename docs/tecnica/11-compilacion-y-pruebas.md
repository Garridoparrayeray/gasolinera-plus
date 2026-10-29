# 11 · Compilación, despliegue y pruebas

## Entorno local

Requisitos: PHP 8.3 con `sqlite3`, `pdo_sqlite`, `curl` y `mbstring`; Node 22 (las pruebas usan el WebSocket nativo); Python 3 para las comprobaciones estáticas; Edge o Chrome para las pruebas de interfaz; JDK 21 y Android SDK para la app de Android; macOS y Xcode para iOS.

```
php scripts/build-database.php --mode=backfill --days=14   # una vez: histórico real
php scripts/build-database.php --mode=daily                # snapshot de hoy (y genera el lite JSON)
php scripts/build-database.php --mode=daily --country=pt   # ídem para Portugal (o fr); por defecto es
php -S localhost:8021 dev-router.php                       # servidor local
```

Cada país tiene su base y su lite JSON (`config/countries.json`): `data/gasolinera.sqlite` y `data/stations-lite.json` para España, `data/gasolinera-pt.sqlite` y `data/stations-lite-pt.json` para Portugal, `data/gasolinera-fr.sqlite` y `data/stations-lite-fr.json` para Francia. Solo la base y el lite de España están en git; los de Portugal y Francia están en `.gitignore` y se bajan de las releases `data-pt` y `data-fr` (`gh release download data-pt -p "gasolinera-pt.sqlite.gz"`, y `gunzip -c` hacia `data/gasolinera-pt.sqlite`). Sin la base de un país, la app lo muestra como próximamente. `--mode=backfill` solo admite España.

`dev-router.php` imita el enrutado de Vercel: `/api/*` a `api/index.php`; `/` y `/stations/*` a `api/shell.php`; ficheros estáticos tal cual; oculta `/api/shell.php` directo.

Datos opcionales para probar todo en local:
- Grafo de carreteras (ruta): `node tools/graph/fetch-graph.mjs` lo baja de la release a `data/road-graph/`.
- Índice de precios semilla: `node tools/price-index/fetch-index.mjs` lo baja a `data/price-index-seed/`.

## Producción (Vercel)

### `vercel.json`

- `installCommand: "true"` (no hay `npm install`), `buildCommand: node scripts/vercel-build.mjs`, `outputDirectory: public`, región `cdg1` (París).
- `scripts/vercel-build.mjs` baja el grafo de carreteras (si no hay, avisa y sigue) y copia a `public/` los ficheros estáticos: `js`, `vendor`, `icons`, `style.css`, `sw.js`, `manifest.json`, `favicon.ico`, `privacidad.html`, `data/stations-lite.json`, `data/stations-lite-pt.json`, `data/stations-lite-fr.json`, `data/road-graph` y `docs/guia-usuario.pdf`. Lo que no existe se salta sin error. `public/` está en `.gitignore`.
- La función PHP es `api/*.php` con el runtime `vercel-php@0.9.0` y una lista de exclusiones (`excludeFiles`) para que no se empaqueten datos grandes ni código de cliente (`public/**`, `docs/**`, los lite JSON, el grafo, `data/places.json`, `tests/**`, `tools/**`, `scripts/**`, `screenshots/**`, `icons/**`, `vendor/**`, `js/**`, `*.css`, `*.md`, `android/**`, `ios/**`, `www/**`, etc.). Es imprescindible: sin ella el tamaño supera el límite de la función. Las bases SQLite **no** se excluyen: son lo que la función lee.
- `git.deploymentEnabled.main = false`: **Vercel no despliega solo desde `main`**. El despliegue lo lanza el flujo `rebuild-schedule.yml` con Vercel CLI. Necesita los secretos `TOKEN_GASOLINERA`, `TEAM_ID` y `PROJECT_ID`.

| Regla | Destino / efecto |
|---|---|
| Reescritura `/api/(.*)` | `api/index.php` |
| Reescrituras de la web | `/`, `/stations/(.*)`, `/(pt\|fr)`, `/(pt\|fr)/` y `/(pt\|fr)/stations/(.*)` van a `api/shell.php` |
| Reescrituras de SEO | `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/sitemap-(es\|pt\|fr).xml` y las secciones de cada país (`/gasolineras` y `/gasolineras/(.*)`, `/pt/postos` y `/pt/postos/(.*)`, `/fr/stations-service` y `/fr/stations-service/(.*)`) van a `api/seo.php` |
| Redirecciones (temporales, `permanent: false`) | `/data/(.*).sqlite` (cualquier base, de cualquier país), `/scripts/`, `/tests/`, `/tools/` y `/dev-router.php` redirigen a `/` |
| Cabeceras de seguridad (en `/(.*)`) | `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (solo geolocalización propia), `Strict-Transport-Security` de dos años y `Content-Security-Policy` con `frame-ancestors 'none'`, `base-uri 'self'`, `object-src 'none'` y `form-action 'self'` |
| Caché | `/vendor/` e `/icons/`: 7 días con `stale-while-revalidate` de 30; `/js/` y `/style.css`: 5 minutos con revalidación de un día; `/data/`: 1 hora con revalidación de un día |
| CORS (`Access-Control-Allow-Origin: *`) | `/data/road-graph/` y `/data/stations-lite*.json`, que lee la app nativa |

`dev-router.php` aplica lo mismo en local: responde 404 a `/api/shell.php` directo, a cualquier `.sqlite`, `.sqlite3`, `.db`, `.env` o `.log` y a cualquier ruta con un segmento oculto (`/.`); sirve `/data/*.json|bin|gz` con CORS; y enruta `/api/*`, SEO (`robots.txt`, sitemaps, `llms.txt` y las tres secciones de país) y la web (`/`, `/pt`, `/fr`, `/stations/*`, `/pt/stations/*`, `/fr/stations/*`).

Regla aprendida: `api/shell.php` debe existir físicamente dentro de `api/` para que Vercel la reconozca como función.

### Límite de peso de la función

**No se pueden desplegar bases de más de unos 110 MB en total.** Con las tres bases sin adelgazar (117 MB) la función de Vercel respondía `500 FUNCTION_INVOCATION_FAILED` en toda la API; con 107 MB funcionaba. Por eso el despliegue pasa `scripts/slim-database.py` sobre las tres bases (ver abajo). Si se añade otro país o crece el histórico, hay que volver a comprobar el total.

### Despliegue: `rebuild-schedule.yml`

Se lanza cuatro veces al día (03:00, 09:00, 15:00 y 21:00, hora de Madrid) desde un servicio externo de tareas programadas que llama a `workflow_dispatch`, con la programación de GitHub (dos veces al día, 02:47 y 14:47 UTC) solo como respaldo, en cada push a `main` y a mano (`workflow_dispatch` con `force`, que descarga y despliega aunque la última foto de precios tenga menos de 90 minutos, y `preview`, que despliega como vista previa). El grupo de concurrencia `production-deploy` impide dos ejecuciones a la vez y no cancela la que está en marcha.

**Job `data`** (no se ejecuta en un push; una instancia por país en la matriz `country: [es, pt, fr]`, con `fail-fast: false` para que un país caído no pare a los otros):

1. Descarga la base de ayer de la release `data-<país>` (`gasolinera-<país>.sqlite.gz`). Para Portugal y Francia baja también `osm-<país>.json`. Si no hay release, parte de la base del repositorio o la crea desde cero.
2. Comprueba cuántos minutos hace que se tomó la última foto (`source_updated_at` de `meta`, hora de Madrid); si son menos de 90 y no hay `force`, se salta el resto.
3. Importa y valida los precios con `php scripts/build-database.php --mode=daily --country=<país>`.
4. Publica en la release `data-<país>` la base comprimida (`gasolinera-<país>.sqlite.gz`), el lite JSON del país y una copia de la anterior (`gasolinera-<país>-anterior.sqlite.gz`). Solo llega aquí si las comprobaciones pasaron.
5. Sube un artefacto `published-<país>` para avisar al job siguiente.

**Job `deploy`** (`needs: data`, `if: always()`):

1. **Decide si despliega:** cuenta los artefactos `published-*`. Despliega si el evento es un push, si hay `force` o si algún país publicó datos nuevos. Si no, termina sin hacer nada.
2. Descarga de la release `data-<país>` la última base buena de cada país y su lite JSON. Si un país no tiene release usa la base del repositorio, y si tampoco la hay lo avisa y la app lo muestra como próximamente.
3. **Adelgaza las bases** (`Slim the databases to fit in the function`): `python3 scripts/slim-database.py data/gasolinera.sqlite data/gasolinera-pt.sqlite data/gasolinera-fr.sqlite`.
4. Avisa si los precios de algún país llevan 2 días o más sin actualizarse (`snapshotDate` del lite JSON).
5. Descarga el grafo de carreteras: la release `road-graph` en `main` y `road-graph-test` en cualquier otra rama.
6. Instala Vercel CLI y despliega.

**`scripts/slim-database.py`** convierte `price_history` en una tabla `WITHOUT ROWID` con clave `(ideess, carburante, fecha)`, que ya sirve de índice de las consultas por estación; descarta el índice duplicado y la tabla original, recrea `idx_history_zone_lookup` y hace `VACUUM`. También pasa el diario a `journal_mode = DELETE`. Comprueba que se copian todas las filas antes de borrar nada, y el contenido no cambia. **Solo adelgaza la copia desplegada:** las bases de las releases `data-<país>` conservan la forma original (la que escribe `build-database.php`). Si ya está en `WITHOUT ROWID` solo hace `VACUUM`; ignora las rutas que no existen.

**Producción solo desde `main`:**

| Cómo se lanza | Qué hace |
|---|---|
| Cron o push en `main` | `vercel deploy --prod` y las comprobaciones posteriores |
| `workflow_dispatch` en `main` con `preview` | `vercel deploy` (vista previa), sin tocar producción |
| `workflow_dispatch` en cualquier otra rama | Vista previa siempre, con el grafo `road-graph-test`; la URL sale en el resumen del job |

Una rama **nunca** despliega a producción: el paso «Deploy to production» exige `github.ref == 'refs/heads/main'` y no `preview`.

**Paso «Check that production answers»** (solo tras un despliegue a producción): pide con `curl` `/api/stats/national`, `/api/stations/near?lat=43.33&lon=-3.0&radius=5&fuel=gasolina_95_e5`, `/api/stats/national?pais=pt`, `/api/stats/national?pais=fr`, `/` y `/gasolineras` en `https://gasolineraplus.vercel.app`. Cada dirección se intenta hasta 3 veces con 15 s entre intentos; si alguna no da 200, el job falla con «Produccion no responde tras el despliegue». Es lo que habría detectado el 500 por exceso de peso. Después, el paso «Clean up old deployments» ejecuta `vercel rm gasolineraplus --safe --yes` para ahorrar almacenamiento.

### Otros workflows

| Workflow | Cuándo | Qué hace |
|---|---|---|
| `check-production.yml` | Solo a mano | Mira producción desde fuera, como Google (ver abajo) |
| `price-index.yml` | Tras `Rebuild schedule data` (si acabó bien y no fue un push), a diario a las 09:30, a mano y en pushes a `feat/**` que toquen los generadores | Matriz `es`/`pt`/`fr`: baja el índice ya publicado, añade los días que faltan (`--days`, 400 por defecto) y lo sube a las releases `price-index`, `price-index-pt` y `price-index-fr` |
| `offline-maps.yml` | El día 3 de cada mes, a mano y en pushes a `feat/**` que toquen `tools/maps/**` | Extrae las regiones de los tres países de Protomaps y las publica en la release `offline-maps` junto con `index.json`; borra los ficheros que ya no figuran en el índice |
| `road-graph.yml` | El día 2 de cada mes, a mano y en pushes a `feat/**` que toquen `tools/graph/**` | En un runner propio (`self-hosted, windows, osm`) construye el grafo de España, Canarias, Portugal y Francia, lo comprueba con `tests/router.test.mjs` y lo publica en `road-graph` (en `main`) o `road-graph-test` (otras ramas). En `main` también refresca marcas y horarios de OpenStreetMap de Francia y Portugal (`osm-fr.json`, `osm-pt.json`, en las releases `data-fr` y `data-pt`) |
| `build-apps.yml` | Etiquetas `v*`, `feat/**`, pull requests que toquen la app y manual | Compila Android e iOS (ver «App nativa») |
| `tests.yml` | Push a `main`, pull requests y manual | Las pruebas (ver «Pruebas») |

### `check-production.yml`

Lanzamiento manual (`workflow_dispatch`), solo lectura. Con un script de Python comprueba contra `https://gasolineraplus.vercel.app` sin seguir redirecciones:

- `/sitemap-es.xml`, `/sitemap-pt.xml` y `/sitemap-fr.xml`: 200, XML válido, más de 100 URLs, sin duplicados y todas de este dominio. `/sitemap.xml` debe ser un índice con 3 sitemaps.
- `/favicon.ico` y `/icons/favicon-48.png`, `-96.png` y `-192.png`: 200 y tipo de contenido `image/*`. `/robots.txt` debe nombrar un `Sitemap:`.
- Páginas `/`, `/gasolineras`, `/pt/postos`, `/fr/stations-service`, `/gasolineras/albacete`, `/fr/stations-service/bas-rhin` y `/fr/stations/67360002`: 200, con `<meta name="robots">` que empieza por `index` y un `canonical`.
- Redirecciones 301: `/gasolineras/bas-rhin` a `/fr/stations-service/bas-rhin` y `/gasolineras/aveiro` a `/pt/postos/aveiro`; `/gasolineras/no-existe` debe dar 404.
- La API: `/api/stats/national` (también con `?pais=pt` y `?pais=fr`) y `/api/stations/near` deben dar 200.

Falla (código de salida 1) y lista lo que no cumple. Se usa tras un despliegue, o cuando Search Console avisa de errores.

## App nativa

```
npm ci
npm run sync:android      # genera www/ y lo copia a android/
npm run sync:ios          # ídem para ios/
cd android && ./gradlew assembleDebug
```

- `scripts/build-www.mjs` genera `www/`: el HTML sale de `php api/shell.php` con `GP_NATIVE=1` (sin analítica ni Service Worker) y se copian los recursos.
- La versión sale de `package.json`: `versionName = version` y `versionCode = mayor·10000 + menor·100 + parche`.
- **Firma:** el APK de release se firma con `android/keystore.properties` (fuera de git) o, en CI, con `ANDROID_KEYSTORE_BASE64` y `ANDROID_KEYSTORE_PASSWORD` (alias `gasolinera`). **Si se pierde la clave, los usuarios no podrán actualizar encima de su instalación y perderían los datos locales.** Sin clave, `assembleRelease` genera un APK sin firmar.
- **APK de prueba:** en cada push a `feat/**`, `build-apps.yml` compila un APK de depuración (instalable sin clave) y lo publica en la release `android-debug`, que sirve para probar. **Desde la 1.0, la pestaña Info enlaza la página de la última release firmada** (`releases/latest`, donde se descarga `gasolinera-plus.apk`; el enlace directo al fichero se quedaba al 100 % en algunos navegadores), que publica el mismo flujo al subir una etiqueta `vX.Y.Z` con los secretos `ANDROID_KEYSTORE_BASE64` y `ANDROID_KEYSTORE_PASSWORD`. El APK de prueba y el de release tienen firmas distintas: no se pueden instalar uno encima del otro.
- **iOS:** proyecto con Swift Package Manager; en CI compila para el simulador sin firmar. Distribuirlo exige cuenta de Apple Developer.
- **Plugins:** los oficiales de Capacitor están en `package.json`; el propio está en `android/.../trips` y `ios/App/App/TripRecorderPlugin.swift`. El manifiesto de Android declara permisos de ubicación (también en segundo plano), actividad física, notificaciones, servicio en primer plano de tipo ubicación, arranque, Bluetooth y el receptor Bluetooth.

## Pruebas

Todas usan `BASE_URL` (por defecto `http://localhost:8021`) y, las de interfaz, `CHROME_PATH` (por defecto Edge de Windows; en CI, `google-chrome`). Las de interfaz abren un navegador sin cabeza por el protocolo DevTools (`tests/cdp.mjs`) y cada una usa su propio puerto (`CDP_PORT`).

### Pruebas que corre `tests.yml`

| Prueba | Qué comprueba | Cómo se lanza |
|---|---|---|
| `tests/static-checks.py` | `id` que busca el JS y no existen en `shell.php`; `id` de CSS sin elemento; sintaxis de PHP (`php -l`) y de JS (`node --check`); **ausencia de ternarios**; que los ficheros de `SHELL_FILES` existan; **y ejecuta por sí solo todo `tests/*-test.php` y `tests/*.test.mjs`** (los unitarios de abajo) | `python tests/static-checks.py` |
| `tests/osm-hours.test.mjs` | `osmToRaw` (`tools/osm/osm-hours.mjs`): traduce el horario de OpenStreetMap (`Mo-Fr 07:00-20:00; Sa 08:00-13:00; Su off`, `24/7`, tramos partidos, nocturnos) al formato del dato oficial (`L-V: 07:00-20:00; S: 08:00-13:00`) y devuelve vacío ante lo que no sabe expresar (`sunrise-sunset`, meses, `open "con cita"`) | `node tests/osm-hours.test.mjs` |
| `tests/timezone-test.php` | `Country::timezoneFor`: Madrid y Canarias (`Atlantic/Canary`), Lisboa, Madeira (`Europe/Lisbon`), Azores (`Atlantic/Azores`) y París | `php tests/timezone-test.php` |
| `tests/opening-hours-test.php` | `OpeningHours`: «abre mañana», «abre el lunes», horarios nocturnos que cruzan la medianoche, tramos partidos, 24 h (texto, rango y por bloques), horario ilegible o vacío y la especificación para los datos estructurados | `php tests/opening-hours-test.php` |
| `tests/api-smoke.py` | La API contra datos reales, y también los sitemaps (índice y `sitemap-es.xml` con más de 5000 URLs y menos de 50 000, 404 para un país inexistente), `robots.txt`, `llms.txt` y las páginas de provincia | `python tests/api-smoke.py` |
| `tests/search-order-test.php` | Orden de resultados al buscar un lugar | `php tests/search-order-test.php` |
| `tests/api-parity.mjs` + `tests/parity-lib.js` | Que `OfflineEngine` y la API PHP devuelven lo mismo (mismas gasolineras, orden y distancias con tolerancia de 0,02 km) para cuatro centros (Bilbao, Madrid, Sevilla, Soria), consultas de marca y lugar, y los dos carburantes principales | `node tests/api-parity.mjs` (antes, `php scripts/build-database.php --mode=lite`) |
| `tests/ui-battery.mjs`, `ui-garage.mjs`, `ui-route.mjs` | La interfaz en móvil y escritorio con un navegador sin cabeza, incluido el modo sin conexión | `node tests/ui-battery.mjs` |
| `tests/ui-countries.mjs` | Para España, Portugal y Francia (ubicación simulada en Bilbao, Lisboa y París): país activo, idioma del documento, nombre de país en la cabecera, selector de país, lista con gasolineras, carburante en su idioma; recuerda el último país y el idioma elegido | `node tests/ui-countries.mjs` |
| `tests/ui-countries-deep.mjs` | En Portugal y Francia: lista cerca, búsqueda por lugar (Porto, Lyon), ficha de gasolinera, histórico en la ficha y estadísticas | `node tests/ui-countries-deep.mjs` |
| `tests/ui-fuels-hours.mjs` | Carburantes de cada país en el filtro (el primero, los que tiene y los que no: AdBlue y E10 en España; gasolina 98, mezcla, GNC y gasóleo B en Portugal; SP95-E10, E85 y GLP en Francia), que la API acepta todos, el mismo listado en estadísticas, colores por carburante en Francia, el coche con carburantes de los tres países, estado de apertura en el idioma del país, horario escrito por días (con el primer día en su idioma), días agrupados y que una gasolinera 24 h no muestre lista de días | `node tests/ui-fuels-hours.mjs` |
| `tests/ui-garage-countries.mjs` | Repostajes de varios países en el garaje: el país sobrevive a exportar e importar la copia, cada repostaje se compara con la media de su país (ahorro en España y Portugal, sobrecoste en Francia) y la línea de la gráfica es la media del país | `node tests/ui-garage-countries.mjs` |
| `tests/ui-bluetooth.mjs` | El Bluetooth del coche en la interfaz | `node tests/ui-bluetooth.mjs` |
| `tests/ui-maps.mjs` | Mapas sin conexión «como en la app»: se arranca otro servidor con `GP_NATIVE=1` en el puerto 8022 (`BASE_URL=http://localhost:8022`); comprueba que se crea la carpeta de mapas antes de descargar y lo mismo para el índice de precios | `GP_NATIVE=1 php -S localhost:8022 dev-router.php` y `node tests/ui-maps.mjs` |

El grafo de carreteras se baja antes (`node tools/graph/fetch-graph.mjs`, con `continue-on-error`) y las bases de Portugal y Francia se descargan de las releases `data-pt` y `data-fr` para que las pruebas de interfaz tengan datos de los tres países.

### Pruebas que se lanzan solas, a mano o en otro flujo

| Prueba | Dónde | Qué comprueba |
|---|---|---|
| `tests/fuel-math.test.mjs`, `trip-metrics.test.mjs`, `alerts.test.mjs`, `recap.test.mjs`, `price-index-core.test.mjs` | `static-checks.py` | Consumo lleno a lleno, depósito y ahorros; limpieza, franjas, eco y consumo de viajes; avisos de precio; resumen; medias, celdas y periodos del índice |
| `tests/price-history-daily-test.php` | `static-checks.py` | Que varias importaciones el mismo día dejan en `price_history` el último precio, sin filas repetidas, y que el relleno de días pasados no pisa lo que ya hay |
| `tests/price-index-test.php`, `rate-limit-test.php`, `trend-test.php` | `static-checks.py` | Agregación del índice (nacional, provincia y cuadrícula de 0,1 grados, sin AdBlue) y los generadores de Portugal (`parsePortuguesePrice`) y Francia; límite de peticiones; tendencias |
| `tests/router.test.mjs` | `road-graph.yml` (y a mano con `GRAPH_DIR`); `static-checks.py` también lo ejecuta, pero se salta si no hay grafo en `data/road-graph` | Lee el manifiesto del grafo y calcula rutas de referencia con rango de km y de horas: Bilbao–Madrid, Bilbao–Donostia, Barcelona–Sevilla, Tenerife, Lisboa–Oporto, Bilbao–Lisboa, Bilbao–Burdeos y París–Versalles; qué países necesita cada ruta (`countriesFor`); y que Madrid–Palma y un punto en el mar den error |
| `tests/seo-audit.py` | A mano | Audita las páginas de `SEO_PAGES` (separadas por espacios) y el `robots.txt` y `sitemap.xml`: título, meta description, canonical, Open Graph, un solo `h1`, JSON-LD válido, `lang` del país, `alt`. Imprime críticos, avisos y una puntuación; sale con error si hay críticos. `SEO_PAGES="/gasolineras /pt/postos" python tests/seo-audit.py` |
| `tests/audit-responsive.mjs` | A mano | Recorre vistas (lista, ruta, garaje, estadísticas, Info) en seis tamaños (de 320×640 a 1920×1080) y los tres países buscando scroll horizontal de la página y elementos que se salen; guarda capturas en `SHOTS`. Se configura con `SIZES`, `COUNTRIES`, `SHOT_SIZES` y `SHOT_COUNTRIES` |
| `tests/shots-header.mjs` | A mano | Capturas de la cabecera (cerrada y con el selector de país abierto) en siete tamaños; `COUNTRIES` y `SHOTS` |
| `tests/ui-trips.mjs` | Manual | Interfaz de viajes |
| `tests/android-e2e.mjs`, `android-trip.mjs` | Manual | Prueba en emulador de Android con GPS simulado |
| `tests/android-countries.mjs` | Manual | En emulador, con la app y un servidor local por `adb reverse tcp:8099`: arranca en España, cambia a Portugal (cabecera «PORTUGAL»), la API responde con gasolineras de Portugal, Bilbao–Madrid usa el grafo del APK sin descargas de otros países y Vigo–Oporto descarga el grafo de Portugal y lo deja guardado en el móvil |
| `tests/cdp.mjs`, `android-helpers.mjs` | Utilidades | Control del navegador o de la app por protocolo DevTools sin dependencias |

Ejecución local:

```
python tests/static-checks.py
python tests/api-smoke.py
node tests/api-parity.mjs
node tests/ui-battery.mjs
node tests/ui-countries.mjs
```

El flujo `tests.yml` se ejecuta en cada push a `main`, en pull requests y a mano (`workflow_dispatch`); **un push a una rama que no es `main` ni tiene pull request no lo lanza**. Arranca `dev-router.php` con 4 procesos (`PHP_CLI_SERVER_WORKERS=4`) y, antes de las pruebas de paridad, regenera el lite JSON de la base con `--mode=lite`. El orden es: comprobaciones estáticas, pruebas unitarias (`osm-hours`, `timezone`, `opening-hours`), humo de la API, orden de búsqueda, paridad, baterías de interfaz (batería, garaje, países, Bluetooth, rutas) y mapas sin conexión.

### Lo que hay que tocar en pares

- **Cambio en la búsqueda:** `Station.php` **y** `OfflineEngine` en `api.js`. Ejecuta la paridad.
- **Fichero JS nuevo:** añadirlo a `api/shell.php` (orden de carga), a `SHELL_FILES` de `sw.js` y, si es un módulo con ID nuevos, a las comprobaciones estáticas (ya recorren `js/*.js` solas).
- **Nuevo control en la interfaz:** su `id` debe existir en `shell.php` y en el CSS si se estiliza por `id`; la comprobación estática lo verifica.
- **Cambio de esquema en IndexedDB:** subir `DB_VERSION` y añadir la migración.
- **Nuevo carburante:** `FUEL_FIELD_MAP` (`build-database.php`), `KNOWN_FUELS` (controlador), `FUEL_LABELS` (`alerts-store.js`) y las opciones de `filter-fuel`. Para que tenga comparación histórica, `INDEX_FUELS` (`build-price-index.php`).
