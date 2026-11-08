# 02 · Datos y procesos automáticos

La app trabaja con tres países (`es`, `pt`, `fr`). Todo lo que depende del país sale de `config/countries.json` (base, lite JSON, mínimo de gasolineras, fuente, carburantes principales, zona horaria) y de `config/fuels.json` (carburantes y nombre con el que cada fuente los llama). Cada país tiene su propia base SQLite y su propio lite JSON.

## 1. Los feeds oficiales

| País | Fuente | Qué se descarga | Importador |
|---|---|---|---|
| España (`es`) | Ministerio para la Transición Ecológica (`ServiciosRESTCarburantes`) | Un JSON con todas las gasolineras y sus precios de hoy | `fetchLocalOrRemote` / `fetchSnapshot` en `scripts/build-database.php` |
| Portugal (`pt`) | DGEG (`precoscombustiveis.dgeg.gov.pt`) | Listado paginado de postos con sus precios y, aparte, una ficha por posto para el horario | `fetchPortugal` en `scripts/sources.php` |
| Francia (`fr`) | Ministère de l'Économie (`prix-carburants.gouv.fr`, publicado en `data.economie.gouv.fr`, conjunto «prix des carburants en France, flux instantané v2») | Una exportación JSON con todas las estaciones | `fetchFrance` en `scripts/sources.php` |

Ninguno requiere clave de API. `fetchCountrySnapshot` elige el importador según `--country`; los tres devuelven lo mismo (`fecha` y lista de `estaciones` con los campos del feed español), así que `applySnapshot` es común.

### España

Servicio REST del Ministerio. Dos URL:

- `.../EstacionesTerrestres/`: precios de **hoy** de todas las gasolineras.
- `.../EstacionesTerrestresHist/DD-MM-AAAA`: precios de un día pasado.

Particularidades del formato:
- Los números vienen con **coma decimal** como texto (`"1,459"`). `parseSpanishDecimal` los convierte.
- Las fechas vienen como `DD/MM/AAAA HH:MM:SS`. `feedDateToIso` las pasa a `AAAA-MM-DD`; `isoDateToHistParam` hace el camino inverso para pedir el histórico.
- Los campos de precio empiezan por `Precio ` y se traducen a un identificador interno con el mapa de `config/fuels.json` (`fuelSourceMap('es')`; por ejemplo `Precio Gasoleo A` → `gasoleo_a`). Si aparece un campo nuevo no mapeado, se avisa por `STDERR` y se ignora.

### Portugal (DGEG)

- `SOURCE_PT` pide `PesquisarPostos` de 2000 en 2000 por página hasta cubrir el total (`Quantidade`). Cada fila es un par posto + combustible: el posto se crea la primera vez que aparece y cada fila añade un precio.
- El nombre de la marca sale de `Marca` (o de `Nome` si es «Genérico»), en mayúsculas. El distrito hace de provincia y el municipio (concelho) de municipio; `IDCCAA` queda vacío.
- Los precios traen coma decimal y símbolo de euro; solo se aceptan los de carburantes de `config/fuels.json` y con `DataAtualizacao` de los últimos `SOURCE_MAX_PRICE_AGE_DAYS = 10` días (`isRecentPrice`).
- El feed no trae fecha del snapshot: `snapshotNow()` usa la fecha de la ejecución en hora de Madrid.
- El horario no viene en el listado: se pide ficha a ficha (`GetDadosPosto`), ver [sección 9](#9-horarios).

### Francia (prix-carburants.gouv.fr)

- `SOURCE_FR` con los campos de `SOURCE_FR_FIELDS`. Las coordenadas vienen multiplicadas por 100 000 y se dividen.
- Los precios están en un JSON anidado (`prix`) con el nombre del carburante en minúsculas (`gazole`, `sp95`, `sp98`, `e10`, `e85`, `gplc`); igual que en Portugal solo cuentan los de los últimos 10 días.
- El departamento hace de provincia (`code_departement`), la región de `IDCCAA`, el código postal de `IDMunicipio`, y `Margen` vale `A` si la estación es de autopista (`pop = A`).
- El feed no trae la marca: `frenchLabel` la toma de `data/osm-fr.json` y, si no hay, pone `STATION <localidad>`.
- Como en Portugal, la fecha del snapshot es la de la ejecución.

### Carburantes

`config/fuels.json` define 26 carburantes. España trae 23 (por ejemplo `gasoleo_a`, `gasolina_95_e5`, `gasolina_95_e10`, `gasoleo_premium`, `adblue`, `glp`, hidrógeno, biocarburantes). Portugal añade `gasolina_98_premium` (gasolina especial 98), `gasolina_mistura` (mezcla para motores de 2 tiempos) y `gnc_m3` (GNC en €/m³, además del GNC en €/kg). Francia usa `gasolina_95_e10` (SP95-E10) y `gasolina_95_e85` (E85). Cada carburante tiene un `group` (`main`, `other`, `alt`). La interfaz de cada país ofrece los suyos (`mainFuels`); el resto se guarda igualmente.

Los carburantes principales por país (`config/countries.json`):

| País | `headline` (los dos de la lista y las estadísticas) | `mainFuels` |
|---|---|---|
| `es` | `gasoleo_a`, `gasolina_95_e5` | `gasoleo_a`, `gasolina_95_e5`, `gasoleo_premium`, `gasolina_98_e5`, `adblue`, `glp` |
| `pt` | `gasoleo_a`, `gasolina_95_e5` | `gasoleo_a`, `gasolina_95_e5`, `gasoleo_premium`, `gasolina_98_e5`, `glp` |
| `fr` | `gasoleo_a`, `gasolina_95_e10` | `gasoleo_a`, `gasolina_95_e10`, `gasolina_95_e5`, `gasolina_98_e5`, `gasolina_95_e85`, `glp` |

## 2. Base SQLite (una por país)

La genera `scripts/build-database.php --country=<es|pt|fr>`. El servidor PHP abre la del país de la petición (`?pais=`) en solo lectura. Ficheros (campo `db` de `config/countries.json`):

| País | Base | Mínimo de gasolineras para aceptar el snapshot (`minStations`) |
|---|---|---|
| `es` | `data/gasolinera.sqlite` | 9000 |
| `pt` | `data/gasolinera-pt.sqlite` | 2500 |
| `fr` | `data/gasolinera-fr.sqlite` | 8000 |

Si el feed trae menos estaciones que el mínimo, el script termina con error y **no toca la base**. Tablas (iguales en los tres países):

| Tabla | Clave | Contenido |
|---|---|---|
| `stations` | `ideess` | Datos fijos de cada gasolinera: rótulo, dirección, localidad, municipio, provincia, CP, horario en bruto, `is_24h`, `lat`, `lon`, columnas `*_normalizado` para buscar y `last_seen_date` |
| `current_prices` | (`ideess`, `carburante`) | Precio actual de cada carburante en cada gasolinera y su fecha |
| `price_history` | (`ideess`, `fecha`, `carburante`) | Precios por día. Solo se conservan `PRICE_HISTORY_RETENTION_DAYS = 10` días. En la base que se despliega es una tabla sin rowid (ver [sección 10](#10-adelgazar-las-bases-antes-de-desplegar)) |
| `national_price_history` | (`fecha`, `carburante`) | Media nacional por día y carburante, y número de gasolineras. **No se recorta**: es la serie larga de estadísticas |
| `meta` | `key` | `last_snapshot_date`, `source_updated_at`, `backfill_completed_through` |

Índices relevantes: `lat`, `lon`, `municipio_id`, `municipio_normalizado`, `rotulo_normalizado`, `localidad_normalizada`, `current_prices(carburante, precio)`, `price_history(ideess, carburante, fecha DESC)` y `price_history(fecha, carburante)`.

En Portugal y Francia las columnas de lugar se rellenan así: `provincia` = distrito / departamento, `municipio` = concelho / comuna, y `tipo_venta` guarda el tipo de posto de la DGEG (por ejemplo `Auto-estrada`). Los nombres de columna son los mismos para no duplicar código.

### Columnas normalizadas

`Models\Search::normalize` transforma un texto a minúsculas, quita tildes (`á→a`, `ñ→n`, `ç→c`…) y colapsa espacios. Se aplica a municipio, dirección, rótulo y localidad al guardar y al texto de búsqueda al consultar. Así «Bermeo», «BERMEO» y «bérmeo» coinciden.

### Modos del script

| Modo | Uso | Efecto |
|---|---|---|
| `daily` | Ejecución diaria (con `--country`) | Descarga hoy, actualiza `stations` (upsert), reemplaza `current_prices` de cada gasolinera, añade a `price_history`, guarda la media nacional del día, recorta el histórico y hace `VACUUM`. Al terminar genera el lite JSON del país |
| `backfill --days=N` | Una sola vez, para poblar el histórico. **Solo España** (en otro país termina con error) | Recorre los N días anteriores, inserta solo las gasolineras que falten y añade precios al histórico sin tocar `current_prices` |
| `lite` | Pruebas y CI | Solo regenera el lite JSON a partir de la base existente |

`applySnapshot` hace todo dentro de una transacción. En `daily` usa `INSERT ... ON CONFLICT DO UPDATE` para `stations` y borra/inserta `current_prices` por gasolinera; en `backfill` usa `INSERT OR IGNORE`. `is_24h` se calcula con `OpeningHours::isAlwaysOpen` sobre el horario en bruto.

### Gasolineras que desaparecen del feed

Si una gasolinera deja de aparecer, no se borra: se conserva con su último `last_seen_date`. Las consultas aplican `staleClause`: `last_seen_date >= date(MAX(last_seen_date), '-10 days')`. Es una fecha **relativa a la más reciente de la base**, no a hoy, para que un fallo de varios días del feed no vacíe la aplicación.

## 3. Lite JSON (uno por país)

Fichero pensado para trabajar **sin servidor**: todas las gasolineras vigentes con sus precios de hoy (el de España pesa unos 5,5 MB). Lo genera `generateLiteJson`. Nombres (campo `lite` de `config/countries.json`):

| País | Fichero |
|---|---|
| `es` | `data/stations-lite.json` |
| `pt` | `data/stations-lite-pt.json` |
| `fr` | `data/stations-lite-fr.json` |

Estructura:

```json
{
  "generatedAt": "2026-09-29T03:05:12+00:00",
  "snapshotDate": "2026-09-29",
  "stations": [
    { "ideess": "175", "rotulo": "REPSOL", "direccion": "...", "localidad": "...", "municipio": "...",
      "municipio_id": "...", "provincia": "...", "provincia_id": "...", "ccaa_id": "...", "cp": "...",
      "margen": "...", "tipo_venta": "...", "horario_raw": "...", "is_24h": 0,
      "lat": 43.21, "lon": -2.73,
      "precios": { "gasoleo_a": 1.459, "gasolina_95_e5": 1.529 },
      "t": { "gasoleo_a": "d", "gasolina_95_e5": "s" } }
  ]
}
```

- Las coordenadas se redondean a 5 decimales.
- `t` guarda la **tendencia** de cada carburante frente al día anterior: `u` (sube), `d` (baja), `s` (igual). `trendCodes` la calcula con una tolerancia de 0,0005 €. El día anterior sale de `price_history` (fila 2 por `ROW_NUMBER() OVER (PARTITION BY ideess, carburante ORDER BY fecha DESC)`).
- No incluye histórico. El horario se guarda en bruto (`horario_raw`) y la app lo interpreta (ver [sección 9](#9-horarios)).

La app lo descarga como máximo cada 3 horas (`refreshOfflineData`, constante `OFFLINE_REFRESH_MS`) y lo guarda con `AlertsStore.set('offlineStations', ...)` en IndexedDB. En la APK viaja empaquetado como primera copia solo el de España (`scripts/build-www.mjs` copia `data/stations-lite.json`); el despliegue web publica los tres (`scripts/vercel-build.mjs`).

## 4. Índice de precios (medias históricas, 400 días)

Sirve para comparar lo que pagas con la media **del día en el que repostaste**, sin depender del servidor. Hay un generador por país, con el mismo formato de salida (los de Portugal y Francia reutilizan las funciones de `scripts/build-price-index.php`) y 400 días de histórico por defecto (`INDEX_DEFAULT_DAYS`):

| País | Generador | Release | Fuente del histórico | Carburantes | Cubos |
|---|---|---|---|---|---|
| `es` | `scripts/build-price-index.php` | `price-index` | Una petición al Ministerio por día (`EstacionesTerrestresHist`), agregando todas las gasolineras | `INDEX_FUELS`: `gasoleo_a`, `gasolina_95_e5`, `gasoleo_premium`, `gasolina_98_e5`, `glp` | nacional, provincia y celda de 0,1° |
| `pt` | `scripts/build-price-index-pt.php` | `price-index-pt` | Precio medio diario oficial de la DGEG (`PMD`, campo `PrecoMedioC4` ponderado por `NumPostos`), una petición por mes | los mismos 5 (`PT_FUEL_MAP`) | **solo nacional** (`p` y `c` vacíos) |
| `fr` | `scripts/build-price-index-fr.php` | `price-index-fr` | Archivo anual oficial `donnees.roulez-eco.fr/opendata/annee/<año>` (ZIP con un XML de todos los cambios de precio); para cada día se toma el último precio conocido de cada estación, si no tiene más de 30 días (`FR_PRICE_MAX_AGE_DAYS`). Para hoy se usa el feed instantáneo | `FR_INDEX_FUELS`: los 5 anteriores más `gasolina_95_e10` y `gasolina_95_e85` | nacional, departamento (dos primeras cifras del código postal) y celda de 0,1° |

### Estructura de un fichero mensual (`AAAA-MM.json`)

```json
{
  "version": 1, "month": "2026-09", "cellDeg": 0.1,
  "fuels": ["gasoleo_a","gasolina_95_e5","gasoleo_premium","gasolina_98_e5","glp"],
  "days": {
    "2026-09-28": {
      "n": [suma_gasoleo_a, muestras_gasoleo_a, suma_95, muestras_95, ...],
      "p": { "48": [ ... ], "28": [ ... ] },
      "c": { "432_-28": [ ... ] }
    }
  }
}
```

- `n` es la media nacional, `p` las medias por provincia (en España la clave `IDProvincia`; en Francia el departamento) y `c` las de cada **celda** de 0,1° de lado (clave `filaLat_colLon` = `floor(lat/0.1)_floor(lon/0.1)`).
- Cada cubo es un vector plano con **2 números por carburante**: la **suma de precios en milésimas de euro** (enteros, para no arrastrar decimales) y el **número de muestras**. La media de un conjunto de cubos es `suma_total / muestras_total / 1000`. El orden de los carburantes es el de la lista `fuels` del propio fichero (por eso Francia tiene 14 números por cubo y España y Portugal 10).
- Para un coche con un carburante fuera de la lista del país la app no puede mostrar comparación histórica.

### Manifiesto `index.json`

Lista los meses disponibles: `month`, `file`, `days`, `lastDate`, `bytes`, más `firstDate`, `lastDate`, `cellDeg`, `fuels`. El cliente descarga solo los meses cuyo `lastDate` cambió.

### Proceso

Cada generador recorre los días desde `--from` (o `--days`, 400 por defecto) hasta hoy (en la zona horaria del país: Madrid, Lisboa, París). Para cada día ausente obtiene los datos y agrega. Hoy y ayer se **refrescan siempre**. En España se comprueba que la fecha devuelta coincide con la pedida (el Ministerio a veces devuelve otra) y hay una pausa de 0,3 s entre peticiones. Al terminar se escriben los ficheros de mes y el manifiesto.

El proceso automático `price-index.yml` ejecuta una **matriz de tres países** (`es`, `pt`, `fr`, cada uno con su generador y su release). Para cada país baja los ficheros ya publicados, añade lo que falte y los sube a su release. Si la release no existe, la primera ejecución hace el histórico completo (400 días) y puede tardar horas. Se lanza al terminar bien la actualización diaria (`workflow_run`, excepto si venía de un push) y como respaldo cada día a las 09:30 UTC.

### Cómo lo usa el cliente

Ver [06 · Cálculos](06-calculos.md), sección «Comparación con la media». En la app, `GPPriceIndex` tiene un estado por país: descarga la release de ese país (`price-index`, `price-index-pt`, `price-index-fr`) en `Filesystem` (carpetas `price-index`, `price-index-pt`, `price-index-fr`) y `GPPriceIndexCore` hace las medias; cada repostaje del garaje se compara con la media de su país. Solo España lleva copia inicial en la APK (`tools/price-index/fetch-index.mjs` baja la release `price-index` en el build a `data/price-index-seed`; `seed()` la copia a `Filesystem` la primera vez); Portugal y Francia se descargan al usarse.

## 5. Grafo de carreteras

Lo genera `tools/graph/build-graph.mjs` a partir de extractos de OpenStreetMap (formato `.osm.pbf`, descargados de Geofabrik) y lo empaqueta `write-graph.mjs`. Se publica como `road-graph.tar.gz` en la release `road-graph` (las ramas publican en `road-graph-test`). El formato y el algoritmo de ruta están en [05 · Ruta](05-ruta.md).

Entradas: `--country es spain.osm.pbf canarias.osm.pbf --country pt portugal.osm.pbf --country fr france.osm.pbf`. Cada país es una «parte» del grafo; las teselas se asignan al país con más cruces dentro de la celda.

Etapas de `build-graph.mjs`:

1. **Pasada 1, vías transitables.** Lee las vías (`way`) con etiqueta `highway`. `isDrivable` descarta áreas y tramos con acceso `no`, `private`, `agricultural`, `forestry`, `delivery`, `customers` o `emergency` (salvo que un permiso explícito para coches lo autorice).
2. **Nodos únicos y cruces.** Un nodo es cruce si lo comparten varias vías o es extremo.
3. **Pasada 2, coordenadas y lugares.** Asigna posiciones y recoge los lugares con nombre (`place=city|town|village|suburb|quarter|neighbourhood|hamlet`).
4. **Troceo en tramos entre cruces.** Cada tramo guarda su geometría simplificada (`simplify`, tolerancia 8 m, por distancia perpendicular).
5. **Componentes conexas.** Se conservan solo las mayores de 300 cruces (`MIN_COMPONENT`) para descartar islotes desconectados.
6. **Escritura.** `writeGraph` genera un paquete de carreteras principales **por país** (`main-es.bin.gz`, `main-pt.bin.gz`, `main-fr.bin.gz`), teselas de 0,25° (`TILE_DEG`) con carreteras locales (`tiles/<fila>_<col>.bin.gz`, comunes a todos los países), `manifest.json` (con `countries`, `parts` con el tamaño de cada país, `cells` que dice a qué país pertenece cada tesela, y `tiles`) y `places.json`.

Velocidades: `speedOf` usa la velocidad declarada (`maxspeed`, con casos españoles `ES:urban=50`, `ES:rural=90`, `ES:motorway=120`, `ES:trunk=100`, `ES:living_street=20`, y conversión de mph) multiplicada por 0,85, o una velocidad por defecto según el tipo de vía (autopista 110, troncal 90, primaria 70, secundaria 60, terciaria 50, sin clasificar 40, residencial 25, calle residencial 10). Se limita por tipo (autopista 120, troncal 110, primaria 100, secundaria y terciaria 90) y nunca baja de 5.

Sentido único: `onewayOf` interpreta `oneway` (`yes/1/true` → 1, `-1/reverse` → −1, `no/false/0/reversible/alternating` → 0) y, sin etiqueta, considera de sentido único las autopistas, rotondas y glorietas.

### Dónde se construye y cómo llega a cada sitio

- `road-graph.yml` se ejecuta en un **runner propio** (`self-hosted, windows, osm`, con memoria de sobra: `--max-old-space-size=65536`) porque Francia no cabe en un runner de GitHub. Tras construir, valida el grafo con rutas de referencia (`tests/router.test.mjs`) antes de publicarlo. El mismo flujo refresca las marcas y horarios de OpenStreetMap (ver [sección 9](#9-horarios)).
- **España va dentro de la app.** `scripts/build-www.mjs` empaqueta solo el país de origen (`manifest.countries[0]`, que se anota en `manifest.bundled`): su `main-es.bin.gz`, `places.json` y las teselas cuya celda es de España. Los compiladores de la APK y de iOS bajan el grafo con `tools/graph/fetch-graph.mjs` (etiqueta `road-graph` en `main` y en etiquetas de versión; `road-graph-test` en ramas).
- **Portugal y Francia se descargan al usarlos.** Si una ruta necesita un país que no está en `bundled`, `router-worker.js` pide al servidor web el `manifest.json`, el `main-<país>.bin` y las teselas que hagan falta y los guarda en la caché del dispositivo (`road-graph-<builtAt>`; al cambiar la versión se borran los anteriores). Los paquetes pesan unos 14 MB (Portugal) y 87 MB (Francia).
- **El despliegue web lleva los tres países**: `scripts/vercel-build.mjs` ejecuta `fetch-graph.mjs` y copia `data/road-graph` entera a `public/`. Las rutas internacionales (Bilbao–Lisboa, Madrid–Burdeos) cargan los paquetes de los países que cruza el trazado.

## 6. Mapas sin conexión

`tools/maps/build-maps.mjs` extrae de la última compilación de **Protomaps** (mapa vectorial de OpenStreetMap en formato PMTiles) una región por zona, definidas en `tools/maps/regions.json` con su `id`, país (`country`), nombre y caja (`bbox`), `minzoom 12` y `maxzoom 15`. Hay 39 regiones: 19 de España (una por comunidad autónoma), 7 de Portugal y 13 de Francia. Se publican como assets de la release `offline-maps` junto con un `index.json` con país, nombre, fichero y tamaño; la app los agrupa por país. El límite de tamaño de un asset de GitHub es 2 GB (`maxBytes`). Al publicar, `offline-maps.yml` borra de la release los ficheros que ya no figuran en `index.json`.

## 7. Procesos automáticos (GitHub Actions)

| Flujo | Cuándo | Qué hace |
|---|---|---|
| `rebuild-schedule.yml` | Cuatro veces al día, a las 03:00, 09:00, 15:00 y 21:00 (hora de Madrid), lanzado por un servicio externo de tareas programadas (cron job) que llama a `workflow_dispatch`; la programación de GitHub (03:17, 05:41 y 07:13 UTC) queda solo de respaldo, y solo importa si no hay foto de las últimas 6 horas, porque GitHub retrasa sus ejecuciones programadas hasta unas 5 horas; en cada push a `main` y manual (`force`, `preview`) | Job `data` (matriz `es`, `pt`, `fr`): importa el feed de cada país y publica su base y su lite JSON en la release `data-<país>`. Job `deploy`: baja lo último de las tres releases, adelgaza las bases y despliega en Vercel. Detalle en [sección 8](#8-releases-de-datos-y-despliegue-diario) |
| `price-index.yml` | Al terminar bien la actualización diaria, cada día 09:30 UTC como respaldo, al cambiar un `build-price-index*.php` en `feat/**` y manual | Matriz `es`, `pt`, `fr`: actualiza y publica el índice de precios de cada país (`price-index`, `price-index-pt`, `price-index-fr`) |
| `road-graph.yml` | Día 2 de cada mes 04:00 (y al cambiar `tools/graph/**` en `feat/**`) | En un runner propio reconstruye el grafo de los tres países, lo valida y lo publica. En `main` también refresca `osm-pt.json` y `osm-fr.json` (marcas y horarios de OpenStreetMap) en las releases `data-pt` y `data-fr` |
| `offline-maps.yml` | Día 3 de cada mes 05:00 (y al cambiar `tools/maps/**` en `feat/**`) | Extrae y publica los mapas por región de los tres países |
| `tests.yml` | En cada push a `main`, en pull requests y manual | Baja las bases de Portugal y Francia de sus releases y ejecuta comprobaciones estáticas, pruebas de horarios y zonas horarias, de API, de orden de búsqueda, paridad JS/PHP y baterías de interfaz (incluidas las de países, carburantes y horarios) |
| `build-apps.yml` | Push a `feat/**` y manual | Compila el APK de Android (firmado si hay clave, y depuración) y la app de iOS para simulador; publica el APK de prueba como release `android-debug` |
| `check-production.yml` | Solo manual | Comprueba en producción los sitemaps de cada país, las páginas indexables, las redirecciones y la API (`/api/stats/national` de `es`, `pt` y `fr`, y cerca de una coordenada) |

**Disparo de las actualizaciones.** GitHub no garantiza la hora de los `schedule`: en este repositorio arrancan entre 5 y 6,5 horas tarde y algún día no arrancan. Por eso las cuatro ejecuciones diarias (03:00, 09:00, 15:00 y 21:00, hora de Madrid) las lanza un servicio externo (por ejemplo cron-job.org, zona horaria `Europe/Madrid`) con una petición `POST https://api.github.com/repos/Garridoparrayeray/gasolinera-plus/actions/workflows/rebuild-schedule.yml/dispatches`, cuerpo `{"ref":"main"}` y cabeceras `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`. El token es un *fine-grained token* limitado a este repositorio con permiso **Actions: Read and write**. GitHub responde `204` si la acepta.

## 8. Releases de datos y despliegue diario

**Los datos diarios ya no se comitean al repositorio.** Antes el proceso diario hacía `git commit` de la base (unos 50 MB) cada día y el historial crecía sin parar. Ahora cada país publica su base en una release de GitHub propia: `data-es`, `data-pt` y `data-fr`. El repositorio solo conserva una copia antigua de `data/gasolinera.sqlite`, `data/stations-lite.json`, `data/osm-pt.json` y `data/osm-fr.json`, que sirve de último recurso si no hay release; el proceso diario ya no la actualiza.

### Assets de cada release `data-<país>`

| Asset | Qué es |
|---|---|
| `gasolinera-<país>.sqlite.gz` | La base completa (`es`, `pt` o `fr`) comprimida con gzip, la **última que pasó las comprobaciones** |
| `gasolinera-<país>-anterior.sqlite.gz` | La base que había publicada justo antes: la de la ejecución anterior. Se sube antes de reemplazar la actual, y sirve de copia de seguridad |
| `stations-lite.json` (`es`), `stations-lite-pt.json` (`pt`), `stations-lite-fr.json` (`fr`) | El lite JSON del país, tal como se llama en `config/countries.json` |
| `osm-pt.json`, `osm-fr.json` | Solo en `data-pt` y `data-fr`: marcas y horarios de OpenStreetMap (los sube `road-graph.yml`, ver [sección 9](#9-horarios)) |

Las releases se crean la primera vez con `--latest=false` (no son la «última versión» del repositorio).

### Job `data` (uno por país)

La matriz `country: [es, pt, fr]` ejecuta con `fail-fast: false`, así que un país que falla no impide los otros. Pasos:

1. **Descargar la base de ayer.** Si existe `gasolinera-<país>.sqlite.gz` en `data-<país>`, la descomprime en la ruta `db` del país. Si no hay release, parte de la base del repositorio, y si tampoco existe la crea desde cero. En `pt` y `fr` baja antes `osm-<país>.json` (si no hay, usa el del repositorio).
2. **Saltar si la foto es reciente.** Lee `source_updated_at` de la tabla `meta` (la hora de Madrid a la que se tomó la última foto) y calcula los minutos que han pasado. Si son menos de 90 (o menos de 360 si la ejecución es una programada de GitHub, que solo es respaldo) y no se lanzó con `force`, el país no se repite (evita importar dos veces por un push justo después de otra ejecución). En cualquier otro caso se importa: los precios cambian durante el día y se actualizan en cada ejecución.
3. **Importar y comprobar.** `php scripts/build-database.php --mode=daily --country=<país>`: descarga el feed, exige el mínimo de gasolineras (`minStations`) y genera el lite JSON. Si algo falla, no se publica nada de ese país.
4. **Publicar.** Copia la base descargada en el paso 1 como `...-anterior.sqlite.gz` y sube esa más la nueva (`gzip -9`) y el lite JSON, con `--clobber`.
5. **Marcar como publicado.** Sube el artefacto `published-<país>` (retención de 1 día) para que el job `deploy` sepa cuántos países trajeron datos nuevos.

El `last_snapshot_date` es la fecha de los precios de la base (`meta`): en España la que declara el Ministerio y en Portugal y Francia la del día de la ejecución. Es lo que lee el aviso de datos viejos en el lite JSON (`snapshotDate`). El `source_updated_at` es la fecha y hora exactas de la última foto y es lo que usa el paso de salto.

**Varias fotos al día.** Cada importación sustituye `current_prices` por completo con los precios de ese momento, actualiza la media nacional del día (`national_price_history`) y, en `price_history`, sobrescribe el precio del día (`INSERT OR REPLACE`), de modo que el historial guarda **el último precio de cada día**. El relleno de días pasados (`--mode=backfill`) sigue sin pisar nada (`INSERT OR IGNORE`). La prueba `tests/price-history-daily-test.php` lo comprueba. Hasta la 1.9.2 había una sola foto al día, hacia las 05:00 (hora de Madrid), y se enseñaba hasta el día siguiente: lo que una gasolinera cambiara después no llegaba a la app.

### Job `deploy`

`needs: data` con `if: always()`: se ejecuta aunque algún país haya fallado o se haya saltado. Pasos:

1. **Decidir.** Cuenta los artefactos `published-*`. Despliega si el evento es un `push`, si se lanzó con `force` o si al menos un país publicó datos nuevos. Si no, termina con «Nada nuevo que desplegar».
2. **Bajar lo último bueno de cada país.** Para `es`, `pt` y `fr` descarga de `data-<país>` la base y el lite JSON a sus rutas de `config/countries.json` (no usa lo que acaba de generar el job `data`, sino lo publicado). Si un país no tiene release usa la base del repositorio, y si tampoco la hay lo avisa y la app lo muestra como «próximamente».
3. **Adelgazar las bases** con `scripts/slim-database.py` ([sección 10](#10-adelgazar-las-bases-antes-de-desplegar)).
4. **Avisar de datos viejos.** Lee `snapshotDate` de cada lite JSON y emite un aviso si algún país lleva 2 días o más sin actualizarse.
5. **Bajar el grafo de carreteras** con `fetch-graph.mjs` (`road-graph` en `main`; `road-graph-test` en cualquier otra rama).
6. **Desplegar con la CLI de Vercel.** `scripts/vercel-build.mjs` genera `public/` (JS, estilos, lite JSON de los tres países y grafo); las bases SQLite van dentro de la función PHP (`vercel.json` excluye de ella los lite JSON y el grafo).
7. **Comprobar producción** (solo en producción): reintenta hasta 3 veces cada una de estas URL de `gasolineraplus.vercel.app` y falla si alguna no da 200: `/api/stats/national`, `/api/stations/near?...`, `/api/stats/national?pais=pt`, `/api/stats/national?pais=fr`, `/` y `/gasolineras`.
8. **Limpiar despliegues antiguos** (`vercel rm gasolineraplus --safe`) para ahorrar almacenamiento (solo en producción).

**Regla: una rama nunca despliega a producción.** El despliegue a producción (`vercel deploy --prod`) solo ocurre si `github.ref` es `refs/heads/main` y no se pidió `preview`. En cualquier otra rama, o en `main` con la opción `preview`, el flujo hace un despliegue de **prueba** (`vercel deploy` sin `--prod`), escribe su URL en el resumen del trabajo y no ejecuta la comprobación de producción ni la limpieza. Además, al desplegar desde una rama el grafo sale de `road-graph-test`, no del de producción. El `concurrency` `production-deploy` (sin cancelar) evita dos despliegues a la vez.

## 9. Horarios

El horario de cada gasolinera se guarda en `stations.horario_raw` con un único formato de texto, el mismo en los tres países: bloques separados por `;` de la forma `DÍAS: HH:MM-HH:MM`, donde los días son `L M X J V S D` (rango con guion: `L-V`), varias franjas del mismo día se unen con ` Y ` y la apertura 24 h se escribe `L-D: 24H`. Ejemplo: `L-V: 06:00-22:00 Y 23:00-23:30; S: 07:00-15:00`. Lo interpreta `Services\OpeningHours` (ver [03 · API](03-api.md)): `isAlwaysOpen` (origen de `is_24h`), `isOpenAt`, `describe` y `specification` (datos estructurados). Las franjas que acaban a medianoche se escriben como `23:59`.

### De dónde sale el horario

| País | Fuente principal | Complementos |
|---|---|---|
| `es` | Campo `Horario` del Ministerio, tal cual (ya viene en el formato anterior) | Ninguno |
| `pt` | Ficha de cada posto (`GetDadosPosto`): `DiasUteis`, `Sabado` y `Domingo`, convertidos por `portugueseHours` | 1) rescate desde las observaciones; 2) OpenStreetMap |
| `fr` | Campo `horaires` (JSON por día) o `horaires_automate_24_24 = Oui` (→ `L-D: 24H`); `frenchHours` y `groupedHours` agrupan los días con el mismo horario | OpenStreetMap |

- **Apertura 24 h.** Se marca `is_24h` cuando el texto contiene `24H` o las franjas cubren 00:00–23:59 los 7 días.
- **Regla de autopistas.** El código no aplica en ningún país la regla «una gasolinera de autopista abre 24 h». En Portugal se probó (el tipo de posto `Auto-estrada` sin horario se marcaba como `L-D: 24H`, versión 1.9.0) y se retiró en la 1.9.2 porque suponía un dato que la fuente no da. Hoy, en Portugal, una gasolinera de autopista sin horario oficial recibe el de OpenStreetMap si lo hay, y si no se queda sin horario. Además, si una base anterior tenía `L-D: 24H` en un posto `Auto-estrada` (heredado de aquella regla), se vuelve a consultar en lugar de conservarlo.
- **Rescate desde observaciones (Portugal).** Si la ficha no trae horario estructurado, `portugueseObservationsHours` busca en el texto libre `Observacoes` «24 horas» / «24h» (→ `L-D: 24H`) o un intervalo del tipo «das 7h às 22h» (→ `L-D: 07:00-22:00`).
- **Reparto de la carga (Portugal).** Pedir cada ficha es lento, así que se consultan en paralelo (6 a la vez, con hasta 4 rondas que reducen el paralelismo) y solo se refrescan las gasolineras sin horario guardado más una séptima parte por día (`PT_HOURS_REFRESH_DAYS = 7`, según `id % 7`). El resto conserva el horario de la base anterior (`previousHours`). **Los horarios inferidos no se conservan**: si el horario guardado coincide con el de OpenStreetMap, se vuelve a consultar la ficha cada día para sustituirlo por el oficial en cuanto exista.
- **Completado con OpenStreetMap.** `data/osm-pt.json` y `data/osm-fr.json` tienen `brands` y `hours` por identificador de gasolinera. Los genera `tools/osm/build-osm.mjs` (con `osm-hours.mjs`, que traduce `opening_hours` de OpenStreetMap al formato anterior): `road-graph.yml`, en `main`, descarga de Overpass las gasolineras (`amenity=fuel`) de Portugal y Francia, las empareja con las del lite JSON publicado de ese país (la más cercana a menos de 150 m) y publica el resultado en las releases `data-pt` y `data-fr`. El flujo diario baja ese fichero antes de importar. Si falla, el flujo diario sigue con el del repositorio.
- **Nunca se contradice un dato oficial.** `hoursOrOsm` solo usa el horario de OpenStreetMap cuando el oficial está vacío. En Francia, además, se descartan los `24H` de OpenStreetMap (`osmHours` sin `L-D: 24H`): solo cuenta como 24 h lo que declara la estación (`horaires_automate_24_24`). Con esto, tras la 1.9.1 llegan a tener horario el 85 % de las gasolineras de Portugal y el 67 % de las de Francia.

### Hora local de cada gasolinera

«Abierto ahora» (`open=now`) y el estado de la ficha se calculan con la hora **local de la gasolinera**, no la del servidor ni la de Madrid: `Station::localNow` usa `Core\Country::timezoneFor(lat, lon)`, que toma la zona del país (`timezone` de `config/countries.json`: `Europe/Madrid`, `Europe/Lisbon`, `Europe/Paris`) salvo en las zonas con huso distinto, definidas con `zones` por longitud: Canarias (`lon < -13`, `Atlantic/Canary`) y Azores (`lon < -24`, `Atlantic/Azores`).

## 10. Adelgazar las bases antes de desplegar

`scripts/slim-database.py` se ejecuta en el job `deploy` (paso «Slim the databases to fit in the function»), sobre las tres bases ya descargadas y antes de llamar a Vercel.

**Por qué existe.** Las bases SQLite viajan dentro de la función PHP de Vercel, que tiene un límite de peso. Con España sola cabía, pero al sumar Portugal y Francia las tres bases ocupaban 117 MB y la función se caía con un error 500; con 107 MB funcionaba. Había que quitar unos 10 MB sin perder datos.

**Qué hace.** Para cada base que se le pasa por argumento (si el fichero no existe, lo ignora):

1. Cambia el modo del diario a `DELETE` (sin ficheros auxiliares `-wal`).
2. Si `price_history` no es ya una tabla `WITHOUT ROWID`, crea `price_history_slim` con las mismas columnas y la clave primaria `(ideess, carburante, fecha)` **sin rowid**, copia todas las filas, comprueba que el número de filas copiadas es igual al original (si no, se detiene sin modificar la base), borra la tabla original, renombra la nueva a `price_history` y recrea el índice `idx_history_zone_lookup (fecha, carburante)`.
3. Ejecuta `VACUUM` y escribe en pantalla el tamaño antes y después.

Con la clave en ese orden la propia tabla hace de índice de las consultas por estación y carburante, así que desaparece el índice duplicado `idx_history_station_fuel` (la tabla sin rowid ya está ordenada por la clave). El contenido de las tablas no cambia.

**Las bases publicadas no se tocan.** El adelgazado se hace sobre la copia descargada dentro del job `deploy`; lo que hay en las releases `data-<país>` sigue siendo la base completa que genera `build-database.php`, y es la que usa el job `data` al día siguiente.

**Cómo se comprobó que las respuestas son idénticas.** El script comprueba que no se pierde ninguna fila (compara el recuento antes de borrar la tabla original). La equivalencia de las respuestas se probó una vez, el 26/10/2026, con la base real de España de ese día: se levantó la API con la base original y con la adelgazada y se compararon 13 respuestas, todas idénticas byte a byte: `stats/national` (diario y mensual), `stations/near`, la ficha, `history`, `zone-comparison`, `zone-average`, `stats/by-fuel`, `stats/by-province`, `stats/price-distribution`, `stations/search` y `stations/bbox`. Si se cambia el script o el esquema de `price_history`, hay que repetir esa comparación. Después de cada despliegue a producción el propio flujo comprueba que la API responde 200 (paso «Check that production answers»).
