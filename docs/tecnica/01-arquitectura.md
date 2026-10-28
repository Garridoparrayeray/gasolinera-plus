# 01 · Arquitectura

## Capas

```
        Fuente oficial de cada país (feed JSON / API)
        ES: Ministerio · PT: DGEG · FR: prix-carburants.gouv.fr
                            │  cada día, GitHub Actions (un trabajo por país)
                            ▼
        scripts/build-database.php --country=es|pt|fr
        ├─ data/gasolinera[-pt|-fr].sqlite      (servidor PHP)
        └─ data/stations-lite[-pt|-fr].json     (web y app, uso local)
                            │  release de GitHub data-es / data-pt / data-fr
                            ▼
              despliegue en Vercel (slim de las bases)

  Navegador / WebView (Capacitor)
  ├─ api/shell.php  → HTML de una sola página
  ├─ js/*.js        → lógica de cliente (sin framework, sin bundler)
  ├─ IndexedDB      → coches, repostajes, viajes (solo en el dispositivo)
  ├─ localStorage   → favoritas, comparador, preferencias
  └─ Filesystem     → (app) índice de precios, mapas sin conexión

  Servidor (Vercel + PHP)
  ├─ api/index.php  → API JSON sobre SQLite (solo lectura), una base por país
  └─ api/seo.php    → páginas indexables, sitemaps y robots (ver 13 · SEO)
```

No hay base de datos de usuarios ni cuentas. El servidor solo sirve datos públicos de gasolineras.

## Núcleo multipaís

Desde la versión 1.2.0 la app sirve **España, Portugal y Francia**. Todo lo que cambia de un país a otro vive en tres ficheros de `config/` y en las clases `Core\Country` y `Core\Fuels` (servidor) y el módulo `GPCountry` (`js/country.js`, cliente). El resto del código es común.

### Qué es un país

Cada entrada de `config/countries.json` (`es`, `pt`, `fr`) define:

| Clave | Contenido |
|---|---|
| `native`, `name` | Nombre del país en su idioma y en `es`, `pt` y `fr` |
| `lang`, `locale` | Idioma por defecto (`es`, `pt`, `fr`) y configuración regional de números y fechas (`es-ES`, `pt-PT`, `fr-FR`) |
| `db`, `lite` | Base SQLite del servidor y lite JSON del cliente: `data/gasolinera.sqlite` y `data/stations-lite.json` para España; `data/gasolinera-pt.sqlite` y `data/stations-lite-pt.json` para Portugal; `data/gasolinera-fr.sqlite` y `data/stations-lite-fr.json` para Francia |
| `center`, `zoom`, `bbox` | Vista inicial del mapa y caja que contiene el país |
| `minStations` | Mínimo de gasolineras con el que el proceso diario da por buena una descarga (9000, 2500 y 8000) |
| `source` | Fuente oficial; es la atribución que devuelve la API |
| `labels` | Cómo se llaman en ese país la región, la provincia y el municipio (por ejemplo «Distrito» y «Concelho» en Portugal, «Département» y «Commune» en Francia) |
| `headline`, `mainFuels` | Carburantes que muestran las listas (dos) y carburantes principales del país, en orden |
| `timezone`, `zones` | Zona horaria del país y excepciones por longitud (Canarias en España, Azores en Portugal) |

### Cómo se elige el país

| Dónde | Regla |
|---|---|
| Servidor (`Core\Country::code`) | Parámetro `?pais=` (`es`, `pt`, `fr`; en minúsculas); si no viene, prefijo `/pt` o `/fr` en la URL de la petición; si no, `es`. Un valor desconocido también da `es` |
| Cliente (`js/country.js`) | `?pais=`; si no, prefijo `/pt` o `/fr` de la ruta; si no, el país guardado en `localStorage` (`gasolinera_pais`); si no, `es` |
| Idioma (cliente) | `?lang=`; si no, el idioma guardado para ese país (`gasolinera_idioma_<país>`); si no, el idioma por defecto del país. El idioma se elige aparte del país: se puede ver Portugal en español |
| Cambio de país o idioma | `GPCountry.go` recarga la página: `/<país>` en la web y `/?pais=<país>` en la app nativa (que no tiene rutas por país). El selector flota en escritorio y se abre desde el logo |

`Core\Country::prefix` devuelve `''` para España y `/pt` o `/fr` para los demás; lo usan las páginas de `api/shell.php` y `api/seo.php`.

### Un país, una base y un lite

- **Servidor.** `Core\Config::current` toma `db_path` de `Country::dbPath` y fija la atribución (`Datos: <source>`). `Core\Database::connection` abre la base de ese país. Si el fichero de la base no existe (`Country::hasData`), la API responde 503 «Todavía no hay precios de <país>» (salvo `/places/…`).
- **Cliente.** `GPCountry.liteUrl()` da el lite del país actual y `liteUrlFor(país)` el de otro. `OfflineEngine.loadData` carga el del país actual; `loadCountries` carga los de varios (rutas entre países).
- **Datos del proceso diario.** Una matriz `[es, pt, fr]` genera cada base con `build-database.php --country=<país>` y la publica en la release `data-<país>`. Los detalles están en [02 · Datos y procesos automáticos](02-datos-y-procesos.md).

### Carburantes por país

`config/fuels.json` es un único catálogo de 26 carburantes. Cada uno lleva `slug`, `unit` (`L`, `kg` o `m3`), etiquetas por idioma (`label`, y `short` en los principales), `sources` (el nombre exacto en la fuente de cada país: si no hay entrada para un país, ese país no tiene ese carburante), `group` (`main`, `other`, `alt`) y `color`. El `slug` es el mismo en toda la app, la API y el garaje; solo cambia la etiqueta. Ejemplos: `gasolina_95_e10` existe en España y Francia; `gasolina_98_premium` (gasolina especial 98), `gasolina_mistura` (mezcla para 2 tiempos) y `gnc_m3` (GNC en €/m³) solo en Portugal; `adblue` solo en España.

- **Servidor:** `Core\Fuels::known` es todo el catálogo (lo que valida el parámetro `fuel`, ver [03 · API](03-api.md)); `Fuels::main` y `Fuels::headline` salen del país actual.
- **Cliente:** `GPCountry.fillFuelSelect` rellena los desplegables con los carburantes del país (los que tienen `sources[país]`), con los principales primero y los demás en grupos «Otras gasolinas y gasóleos» y «Alternativos y renovables». El garaje usa el ámbito `all` y por eso el coche puede llevar cualquier carburante de los tres países. `fuelLabel`, `fuelShort`, `fuelUnit` y `fuelColor` leen el catálogo.
- El carburante elegido se guarda por país (`GPCountry.storageKey`).

### Idiomas

La interfaz está escrita en español en el HTML y el JavaScript. `config/i18n/{es,pt,fr}.json` traen el resto:

| Clave | Contenido |
|---|---|
| Claves con punto (`header.subtitle`, `switcher.es`…) y las de SEO | Textos fijos que se piden por clave (`GPCountry.t`, `data-i18n`) |
| `texts` (solo `pt` y `fr`) | Texto español completo → traducción |
| `patterns` (solo `pt` y `fr`) | Frases con huecos `{nombre}` → traducción con los mismos huecos |

`GPCountry.tr` traduce un texto español buscándolo en `texts` y en `patterns`, y sustituye `{pais}` y `{fuente}`. Un `MutationObserver` (`watchPage`) traduce los nodos que la app va añadiendo. `GPCountry.missing()` lista lo que no se encontró (lo usan los tests de países).

Los ficheros JSON **no se editan a mano**: `tools/i18n/build.py` los regenera a partir de `tools/i18n/seo.tsv` (claves y SEO en los tres idiomas), `texts.tsv` y `patterns.tsv` (español, portugués, francés). `tools/i18n/extract.py` recorre el HTML y los módulos JS y escribe `tools/i18n/sources.json` con los textos en español que faltan por traducir.

### Claves por país en el cliente

Todo lo que se guarda en `localStorage` o en el almacén de la app usa `GPCountry.storageKey(base)`: para España la clave se queda como está (`gasolinera_favorites`) y para los demás lleva sufijo (`gasolinera_favorites_pt`). Así las favoritas, el comparador, el carburante elegido y el lite descargado en el móvil (`offlineStations`) son independientes por país y las instalaciones anteriores a 1.2.0 siguen funcionando. `GPCountry.stationKey` hace lo mismo con el identificador de una gasolinera (`pt:123`) para que no choque con otro país.

## Carpetas

| Ruta | Contenido |
|---|---|
| `api/` | Servidor PHP: `index.php` (entrada de la API), `shell.php` (HTML de la web), `seo.php` (páginas indexables, sitemaps, robots), `Core/` (países, carburantes, peticiones, respuestas, caché, límite), `Controllers/`, `Models/`, `Services/` (geocodificación, horarios, SEO), `Config/` |
| `config/` | `countries.json` (países), `fuels.json` (catálogo de carburantes) e `i18n/` (textos en `es`, `pt`, `fr`, generados) |
| `js/` | Cliente. Un fichero por módulo, cada uno es una función que se ejecuta al cargar y expone un objeto global (`GPFuel`, `GPRoute`…) |
| `runners/` | `alerts.js`, código que el sistema ejecuta en segundo plano para los avisos de precio |
| `scripts/` | Procesos de datos y compilación: `build-database.php`, `build-price-index.php` (y las variantes `-pt` y `-fr`), `slim-database.py`, `sources.php` (lectura de cada fuente oficial), `build-www.mjs`, `vercel-build.mjs` |
| `tools/` | Herramientas de generación pesada: grafo de carreteras (`graph/`), mapas (`maps/`), descarga del índice (`price-index/`), datos de OpenStreetMap (`osm/`), textos de idioma (`i18n/`) |
| `data/` | Datos generados: una base SQLite y un lite JSON por país, `osm-pt.json` y `osm-fr.json`. El grafo y el índice no se guardan en git |
| `android/`, `ios/` | Proyectos nativos de Capacitor con el plugin propio de viajes |
| `tests/` | Pruebas de PHP, de JavaScript y de la interfaz |
| `vendor/` | Librerías de terceros incluidas tal cual (Leaflet, Chart.js, protomaps…) |
| `docs/` | Esta documentación |
| `.github/workflows/` | Procesos automáticos |

## Cómo se conectan los módulos JS

Todos los ficheros se cargan como `<script>` clásicos, en el orden de `api/shell.php`. Cada módulo es una función autoejecutada que devuelve su interfaz pública:

```js
const GPFuel = (() => { ...; return { intervals, summary, ... }; })();
```

Por eso el orden importa: un módulo solo puede usar los que se cargan antes o los que sean llamados después de que todo esté cargado (dentro de funciones).

| Módulo | Responsabilidad |
|---|---|
| `country.js` (`GPCountry`) | País y idioma actuales, textos y traducción, carburantes del país, claves por país, horario escrito por días, selector de país. Se carga el primero |
| `native.js` (`GPNative`) | Detecta si es app nativa, URL base del servidor, plugins, compartir, ubicación, actualizaciones |
| `splash.js` (`GPSplash`, `GPSectionLoading`) | Pantalla de carga inicial y aviso «Cargando…» por sección |
| `map-guard.js` (`GPMapGuard`) | Evita que el mapa atrape el scroll de la página en pantallas táctiles |
| `offline-maps.js` (`GPMaps`) | Mapas de teselas sin conexión |
| `api.js` (`OfflineEngine`, `Api`) | Motor local de búsqueda (sobre el lite de cada país) y capa de peticiones al servidor con caída a local; añade `?pais=` a cada petición |
| `alerts-store.js` (`AlertsStore`) | Etiquetas de carburantes y comprobación de bajadas de precio |
| `background.js` (`GPBackground`) | Sincroniza favoritas con el ejecutor en segundo plano |
| `app.js` | Pantalla de precios, mapa, estadísticas, ficha de gasolinera, favoritas, comparador, avisos |
| `price-index-core.js`, `price-index.js` | Medias históricas: cálculo puro y sincronización del índice |
| `fuel-math.js` (`GPFuel`) | Consumo, depósito, autonomía, gasto mensual, ahorro |
| `garage-store.js` (`GarageStore`), `backup.js` | IndexedDB y copias de seguridad |
| `recap.js` (`GPRecap`) | Resumen exportable en imagen y PDF |
| `garage.js` (`GPGarage`) | Pantalla Coche, asistente de repostaje, comparaciones |
| `trip-metrics.js`, `trips.js` | Métricas de un viaje y pantalla de viajes |
| `router-core.js`, `router-worker.js`, `route.js` | Cálculo de ruta y pantalla Ruta |

## Flujo de una búsqueda de gasolineras

1. El usuario pulsa **Buscar gasolineras** (`stations-search-btn`) o cambia un filtro.
2. `loadStationsPage` construye una clave de petición (modo, texto, ubicación, filtros, página). Si ya hay una carga en curso con esa misma clave, se ignora el clic; si es distinta, se encola una sola.
3. `Api.near` o `Api.search` decide dónde resolver:
   - **`near` (cerca de ti) y `bbox` (puntos del mapa) en la app nativa:** siempre el motor local `OfflineEngine` sobre el lite JSON descargado en el móvil. No hay petición.
   - **`near` y `bbox` en la web:** petición a `/api/...`; si no hay red, cae a `OfflineEngine`.
   - **`search` (búsqueda por texto), en web y en app:** petición al servidor; si no hay red, cae a `OfflineEngine`. El servidor la cachea.
4. `renderList` pinta las tarjetas y `refreshMapMarkers` los puntos del mapa.

Antes de nada, la página ya se sirvió para un país (`/`, `/pt` o `/fr`) y `GPCountry` lo conoce: toda petición a la API lleva `?pais=` salvo en España (`GPCountry.apiQuery`).

Si el usuario no da su ubicación, o está fuera del país elegido (`insideCountry`: ninguna gasolinera del país a menos de 25 km), la pantalla muestra las gasolineras más baratas del país (`OfflineEngine.cheapest`) en vez de buscar cerca de él, y avisa con «Estás fuera de {pais}».

Los detalles están en [04 · Búsqueda y paridad](04-busqueda-y-paridad.md).

## Dónde vive cada dato

| Dato | Dónde | Cómo se pierde |
|---|---|---|
| Gasolineras y precios de hoy | Una SQLite por país (servidor) y un lite JSON por país (web y móvil); la copia diaria de cada país está en su release `data-<país>` | Se regeneran cada día |
| Histórico por gasolinera | SQLite, 10 días de retención | Se recorta solo |
| Medias históricas (índice) | Ficheros mensuales JSON publicados en una release de GitHub; el móvil los guarda en `Filesystem` | Se vuelven a descargar |
| Coches, repostajes, viajes, ajustes | IndexedDB `gasolinera-garage` | Solo si se borran los datos de la app; hay copia de seguridad manual |
| Favoritas, comparador, preferencias | `localStorage`, con clave distinta por país (`GPCountry.storageKey`) | Igual |
| Viajes grabados por el plugin nativo | Ficheros en el almacenamiento privado de la app hasta que la interfaz los importa a IndexedDB | Se borran al importarlos |
| Mapas sin conexión | `Filesystem` (app), regiones agrupadas por país | El usuario los borra |
| Mapas de carreteras de Portugal y Francia para rutas | Se descargan la primera vez que una ruta pasa por el país y se guardan en el móvil; España viene dentro de la app | El usuario los borra |

## Decisiones de arquitectura

- **Sin framework ni bundler.** La aplicación se entiende leyendo los ficheros y no depende de una cadena de compilación. Coste: los módulos usan globales y el orden de carga importa.
- **Local primero.** Con 10.000 usuarios, si cada consulta llamara al servidor, la carga sería enorme. En la app, la lista de gasolineras cercanas y los puntos del mapa se resuelven en el móvil, igual que las rutas y las comparaciones históricas (índice de precios). El servidor atiende la búsqueda por texto, la ficha de una gasolinera y las estadísticas, con caché.
- **Caché agresiva en el servidor.** Las respuestas correctas llevan `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=3600` y las coordenadas de la petición se redondean, de modo que muchos usuarios comparten la misma respuesta cacheada.
- **Datos personales solo en el dispositivo.** No hay cuentas ni servidor de usuarios: menos coste, menos superficie de privacidad. La contrapartida es que la copia de seguridad es manual.
- **Un país es configuración, no código.** Añadir un país es añadir una entrada a `config/countries.json`, sus carburantes en `config/fuels.json`, su importador en `scripts/sources.php`, su idioma en `config/i18n` y su fila en la matriz de los procesos diarios. Servidor y cliente leen los mismos ficheros de `config/`, así que no pueden desincronizarse.
- **Una base por país.** Las consultas del servidor no filtran por país: abren la base de ese país. Evita mezclar identificadores de fuentes distintas y deja que cada país se actualice, falle o se despliegue por separado.
- **Un solo código para web y app.** La app es la misma web empaquetada con Capacitor; solo cambian la URL base de la API y los plugins nativos.
