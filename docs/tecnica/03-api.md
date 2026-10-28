# 03 · API

Servidor PHP sin framework. Todas las rutas son `GET` y devuelven JSON UTF-8.

## Entrada y enrutado

- `api/index.php` es la única entrada. En Vercel, `vercel.json` reescribe `/api/(.*)` hacia ese fichero. En local, `dev-router.php` hace lo mismo con el servidor integrado de PHP. Las rutas `/pt`, `/fr`, `/stations/…` y la portada van a `api/shell.php`, y las páginas de SEO, los sitemaps y `robots.txt` a `api/seo.php` (ver [13 · SEO](13-seo.md)).
- Por seguridad, las bases `.sqlite` no se descargan: `vercel.json` redirige `/data/*.sqlite` (y `/scripts`, `/tests`, `/tools` y `dev-router.php`) a la portada, y `dev-router.php` responde 404 a `.sqlite`, `.sqlite3`, `.db`, `.env`, `.log` y a cualquier ruta con un fichero oculto (`/.`). Del directorio `data/` el servidor local solo sirve `.json`, `.bin` y `.gz`.
- `Core\Request` lee el método y la ruta. Si viene el parámetro `path` lo usa; si no, toma la ruta de la URL y le quita el prefijo `/api`.
- `Core\Router` compara cada patrón (`/stations/{ideess}` se convierte en una expresión regular) con la ruta. Si coincide la ruta pero no el método devuelve 405; si no coincide ninguna, 404.
- La carga de clases es por `spl_autoload_register`: el espacio de nombres (`Controllers\StationsController`) se traduce a la ruta de fichero.
- Zona horaria por defecto: `Europe/Madrid`. Solo se usa para las fechas del servidor (rangos `from`/`to`, «hoy»). La hora de «abierto ahora» no usa esta zona: se calcula con la del país y la de la propia gasolinera (ver la sección «Horarios»).
- Antes de enrutar, `index.php` aplica el límite de peticiones y comprueba que el país pedido tiene base de datos (ver la sección «País»).

## Base de datos

`Core\Database::connection` abre la base **del país de la petición** (`data/gasolinera.sqlite`, `data/gasolinera-pt.sqlite` o `data/gasolinera-fr.sqlite`, según `config/countries.json`) con `mode=ro&immutable=1` (solo lectura, sin bloqueos). Si esa forma no funciona, la abre de la manera normal. Modo de errores `EXCEPTION` y resultados asociativos.

## País (`pais`)

Todas las rutas de la API aceptan el parámetro opcional **`pais`** (`es`, `pt` o `fr`). `Core\Country::code` lo resuelve así: parámetro `pais` en minúsculas; si no viene, el prefijo `/pt` o `/fr` de la URL de la petición; si no, `es`. Un valor desconocido no da error: se usa `es`. Todo lo que sigue se evalúa para ese país:

- La base SQLite y, por tanto, las gasolineras, los precios y los identificadores (`ideess`) que se consultan.
- La atribución de las respuestas (`Datos: <fuente del país>`).
- Los carburantes principales (`by-fuel`) y los destacados de las listas.
- La zona horaria de «abierto ahora» y del horario de la ficha.
- El país donde se geocodifica un texto en `search`.

Como `pais` forma parte de la URL, la caché de Vercel y la del navegador guardan una respuesta distinta para cada país. En el cliente, `Api` añade `?pais=` con `GPCountry.apiQuery` a todas las peticiones salvo las de España; algunas llamadas aceptan un país explícito (`station`, `history`, `zoneAverage`, `zoneComparison`, `nationalStats`) para consultar una gasolinera de otro país, por ejemplo una favorita.

Si el país pedido no tiene base de datos desplegada (`Country::hasData` es falso) la API responde **503** `Todavía no hay precios de <país>`, salvo las rutas `/places/…`.

## Configuración (`api/Config/config.php` y `config/`)

`Core\Config::current` une `api/Config/config.php` con los datos del país actual.

| Clave | Valor | Uso |
|---|---|---|
| `db_path` | Según el país (`Country::dbPath`) | Ruta de la base |
| `nearby_max_radius_km` | 50 | Tope del radio en `near`, `search` (radio) y `zone-average` |
| `stale_station_days` | 10 | Antigüedad máxima de una gasolinera (ver `staleClause`) |
| `history_retention_days` | 10 | Rango máximo de `/history` |
| `bbox_max_stations` | 4000 | Tope de puntos por consulta de mapa |
| `attribution` | `Datos: ` + `source` del país (por ejemplo «Ministerio para la Transición Ecológica (geoportalgasolineras.es)», «Direção-Geral de Energia e Geologia (precoscombustiveis.dgeg.gov.pt)», «Ministère de l'Économie (prix-carburants.gouv.fr)») | Se añade a las respuestas de lista y ficha |
| `country` | `es`, `pt` o `fr` | País resuelto de la petición |

## Caché y límite de peticiones

- **Respuestas correctas (2xx):** `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=3600`. El navegador guarda 5 minutos y la red de Vercel una hora, con reutilización mientras se refresca. Errores: `no-store`.
- **CORS:** `Access-Control-Allow-Origin: *` (la app nativa llama desde otro origen).
- **Límite:** `Core\RateLimit::allow` cuenta peticiones por IP en ventanas de 60 s y permite **240**. Se guarda un fichero por IP y ventana en el directorio temporal, con `flock` para evitar carreras, y limpia ventanas antiguas. La IP se toma de `X-Vercel-Forwarded-For`, `X-Forwarded-For` o `X-Real-IP` (la primera). Localhost no se limita. Al superar el límite responde 429 con `Retry-After: 60`.
- **Redondeo de coordenadas** en el cliente (`Api`): las peticiones `near`, `search` y `zone` usan 3 decimales (`roundCoord`, unos 100 m) y `bbox` ajusta los bordes a 0,01° hacia fuera (`snapDown/snapUp`), de modo que usuarios cercanos comparten la misma URL cacheada. Después, `exactDistances` recalcula en el cliente la distancia real y reordena si el orden es por distancia.
- **Caché de geocodificación:** `Core\Cache::remember` guarda 30 días en un fichero temporal el resultado de cada lugar consultado a Nominatim.

## Parámetros comunes

| Parámetro | Significado | Valores |
|---|---|---|
| `pais` | País | `es` (por defecto), `pt` o `fr`; ver la sección «País» |
| `fuel` | Carburante | Un `slug` de `config/fuels.json` (`Core\Fuels::known`, 26 carburantes); otro valor da 422 |
| `sort` | Orden | `price` (por defecto) o `distance` |
| `open` | Apertura | `24h` (solo abiertas 24 h) o `now` (abiertas ahora según horario) |
| `offset`, `limit` | Paginación | `offset >= 0`; `limit` 1–100, 30 por defecto |
| `lat`, `lon` | Coordenadas | Válidas (−90..90, −180..180); si no, 422 |

### Carburantes por país

`fuel` se valida contra el catálogo completo, no contra los carburantes del país: pedir un carburante que ese país no vende no es un error, simplemente la lista sale vacía. (En la 1.9.1 se corrigió que en Portugal «Gasolina especial 98», `gasolina_98_premium`, diera «Carburante no válido».) Lo que sí depende del país:

| Dato | Origen | Ejemplo |
|---|---|---|
| Carburantes que salen en cada elemento de una lista | `Fuels::headline` del país más el `fuel` pedido | España y Portugal `gasoleo_a` y `gasolina_95_e5`; Francia `gasoleo_a` y `gasolina_95_e10` |
| Carburante de reserva al ordenar por precio cuando una gasolinera no tiene el pedido | Segundo de `headline` (`batchSortPrices`) | `gasolina_95_e5` en España y Portugal, `gasolina_95_e10` en Francia |
| Carburantes de `/stats/by-fuel` | `Fuels::main` (`mainFuels`) del país | 6 en España y Francia, 5 en Portugal (sin AdBlue) |

El nombre de cada carburante en el feed de origen (`sources`) solo lo usa el importador; la API siempre habla en `slug`.

## Endpoints

### `GET /api/stations/near`

Gasolineras en un radio. Obligatorios `lat`, `lon`. `radius` en km (por defecto 5, máximo 50).

Proceso (`Station::near`): caja envolvente del círculo → filtro por `staleClause`, `open=24h` y carburante → distancia real (Haversine) y descarte fuera del radio → si `open=now`, filtro por horario → `sortPaginateAndBuild`.

Respuesta: `{ stations: [...], total, hasMore, attribution }`. Cada elemento: `ideess, rotulo, direccion, municipio, lat, lon, is24h, horarioRaw, distanciaKm, precios{carburante: precio}, tendencias{carburante: up|down|same|null}`. Solo se devuelven los carburantes destacados del país (`Fuels::headline`) y, si se pidió otro, ese carburante.

### `GET /api/stations/search`

Búsqueda por texto. `q` obligatorio (mínimo 2 caracteres; si no, lista vacía). Opcionales: `lat`, `lon` (para calcular distancia), `radius`, `fuel`, `sort`, `open`, paginación.

En Francia y Portugal «municipio» y «provincia» son la comuna/concelho y el departamento/distrito; en la base y en la API se llaman igual que en España. Resumen: coincidencias por municipio, dirección, rótulo, CP y localidad; varias palabras (todas deben coincidir en algún campo); con `lat`, `lon` y `radius` se descartan marcas y calles lejanas, pero no municipios ni CP. Si `q` parece un lugar (existe municipio o localidad que empieza así) se añaden las gasolineras a menos de 10 km del lugar geocodificado. Si no hay ninguna coincidencia de texto se intenta geocodificar y se devuelven las de 20 km alrededor (`geocodedFrom` indica el texto). Detalle en [04 · Búsqueda](04-busqueda-y-paridad.md).

Respuesta: como `near`, más `geocodedFrom`.

### `GET /api/stations/suggest-places`

Autocompletado de lugares. `q` (mínimo 2). Devuelve hasta 8 municipios y localidades cuyo nombre normalizado **empieza** por el texto: `{ places: [{ label, sublabel }] }`.

### `GET /api/stations/bbox`

Puntos para el mapa. Obligatorios `north, south, east, west`. Opcionales `fuel`, `open=24h`. Respuesta: `{ stations: [{ ideess, rotulo, lat, lon, is24h, precio }], total, truncated }`. Con más de `bbox_max_stations` puntos se hace un **muestreo uniforme** (`step = total / máximo`) y `truncated` es `true`.

### `GET /api/stations/{ideess}`

Ficha completa de una gasolinera de la base del país pedido (el `ideess` solo es único dentro de un país): datos, `horario` interpretado con la hora local de la gasolinera (`OpeningHours::describe` → `estado`, `texto`, `raw`), `combustibles{carburante: {precio, tendencia}}` y `lastSeenDate`. 404 si no existe.

### `GET /api/stations/{ideess}/history`

Serie de precios de un carburante de esa gasolinera. `fuel` (por defecto `gasoleo_a`), `from`, `to` (`AAAA-MM-DD`; por defecto los últimos 10 días y máximo 10), `group=day|month`. Respuesta: `{ ideess, carburante, group, from, to, retentionDays, serie: [{ fecha, precio }] }`. Solo hay 10 días de historia por gasolinera.

### `GET /api/stations/{ideess}/zone-comparison`

Precio de la gasolinera frente a la media de las demás del **mismo municipio** (`municipio_id`) para un carburante: `{ precioPropio, mediaZona, estacionesEnMedia }`. 404 si falta precio o no hay otras.

### `GET /api/stats/national`

Serie de la media nacional. `fuel`, `from`, `to`, `group`. Rango por defecto 14 días (máximo 90 en días o 730 en meses). Respuesta: `{ carburante, group, from, to, hoy, serie: [{ fecha, media, estaciones }] }`. Sale de `national_price_history`, que no se recorta.

### `GET /api/stats/by-fuel`

Serie de las medias nacionales de los carburantes principales del país (`Fuels::main`): `{ group, from, to, series: { carburante: [{ fecha, media }] } }`. Rango por defecto 30 días.

### `GET /api/stats/by-province`

Media actual por provincia para un carburante, de más barata a más cara: `{ carburante, provincias: [{ provincia, media, estaciones }] }`.

### `GET /api/stats/price-distribution`

Histograma de precios actuales de un carburante. Calcula mínimo y máximo, divide el rango en 14 cubos (mínimo 0,01 €; 0,02 € si todos valen lo mismo) y cuenta: `{ carburante, buckets: [{ desde, hasta, estaciones }] }`.

### `GET /api/stats/zone-average`

Media de precios en una zona para una fecha. Obligatorios `lat`, `lon`, `fuel`. Opcionales `radius` (por defecto 10, máximo 50) y `date` (`AAAA-MM-DD`). Busca las gasolinera dentro del radio y hace `AVG` sobre `price_history` en la fecha usada: la más reciente disponible, o, si se pidió una anterior, la más cercana hacia atrás hasta 3 días. Respuesta: `{ fecha, media, minimo, maximo, estaciones, radioKm }`. 404 sin datos.

### `GET /api/places/resolve`

Convierte un texto (3–120 caracteres) en coordenadas con Nominatim (OpenStreetMap, con identificación por User-Agent). Busca en **los tres países a la vez** (`countrycodes=es,pt,fr`), porque se usa para el origen y el destino de rutas que cruzan fronteras; no depende de `pais` ni exige que haya base de datos. Respuesta `{ lat, lon, label }`. Se cachea 30 días por texto y lista de países. Distinto es el geocodificado interno de `stations/search`, que solo busca en el país de la petición (`PlaceGeocoder::resolve($q, Country::code())`).

## Códigos de error

| Código | Cuándo |
|---|---|
| 404 | Ruta o recurso inexistente |
| 405 | Método distinto de GET |
| 422 | Parámetros obligatorios ausentes o inválidos (`Carburante no válido`, coordenadas, fecha `AAAA-MM-DD`, lugar de 3 a 120 caracteres) |
| 429 | Más de 240 peticiones por minuto desde la misma IP |
| 503 | El país pedido no tiene base de datos desplegada: `Todavía no hay precios de <país>` |
| 500 | Excepción no controlada (`Response::internalError`, se registra en el log del servidor) |

Los errores devuelven `{ "error": "mensaje" }`.

## Horarios

`Services\OpeningHours` interpreta el texto de horario (por ejemplo `L-V: 06:00-22:00; S: 07:00-15:00`). Es el mismo formato interno en los tres países: el importador de cada fuente (`scripts/sources.php`) convierte el horario de Portugal y de Francia a ese formato, y donde la fuente oficial no trae horario lo completa con OpenStreetMap sin contradecir nunca un dato oficial. El formato interno solo usa los códigos de día españoles `L M X J V S D`, aunque la app lo escriba en el idioma del usuario.

**Hora local.** «Abierto ahora» (`open=now`) y el estado de la ficha se calculan con la hora de la gasolinera, no con la de Madrid: `Station::localNow` pide a `Country::timezoneFor(lat, lon)` la zona del país actual, con las excepciones por longitud de `zones` (Canarias `Atlantic/Canary` en España, Azores `Atlantic/Azores` en Portugal; Francia no tiene). Países: `Europe/Madrid`, `Europe/Lisbon`, `Europe/Paris`. Antes de la 1.9.1 se usaba siempre Madrid y en Portugal y Canarias salía una hora desfasada.

- `isAlwaysOpen`: `true` si el texto contiene «24H» o si las franjas cubren 00:00–23:59 los 7 días. Es el origen de la columna `is_24h`.
- `isOpenAt`: `true/false/null` (`null` cuando el texto no se puede interpretar) para un instante dado.
- `describe`: devuelve `estado` (`abierto`, `cerrado`, `desconocido`) y un texto legible, con la próxima apertura si está cerrado.
- `specification`: devuelve el horario como lista de `OpeningHoursSpecification` de schema.org (todos los días 00:00–23:59 si es 24 h), para los datos estructurados de las páginas de SEO.
- Códigos de día: `L M X J V S D`. `parseRanges` admite rangos de días y varias franjas horarias.
- Textos como «Abierto 24 horas» o «Cerrado, abre mañana a las 07:00» salen de `describe` en español; el cliente los traduce con `GPCountry.tr`. El horario escrito día por día de la ficha (por ejemplo «Lunes a viernes: 06:00–22:00») lo compone el cliente con `GPCountry.weeklyHours` a partir de `horarioRaw`, en el idioma elegido (en francés «Lundi au vendredi» y «24 h/24»), agrupando los días consecutivos con el mismo horario.
