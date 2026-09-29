# 03 · API

Servidor PHP sin framework. Todas las rutas son `GET` y devuelven JSON UTF-8.

## Entrada y enrutado

- `api/index.php` es la única entrada. En Vercel, `vercel.json` reescribe `/api/(.*)` hacia ese fichero. En local, `dev-router.php` hace lo mismo con el servidor integrado de PHP.
- `Core\Request` lee el método y la ruta. Si viene el parámetro `path` lo usa; si no, toma la ruta de la URL y le quita el prefijo `/api`.
- `Core\Router` compara cada patrón (`/stations/{ideess}` se convierte en una expresión regular) con la ruta. Si coincide la ruta pero no el método devuelve 405; si no coincide ninguna, 404.
- La carga de clases es por `spl_autoload_register`: el espacio de nombres (`Controllers\StationsController`) se traduce a la ruta de fichero.
- Zona horaria fija: `Europe/Madrid`.

## Base de datos

`Core\Database::connection` abre `data/gasolinera.sqlite` con `mode=ro&immutable=1` (solo lectura, sin bloqueos). Si esa forma no funciona, la abre de la manera normal. Modo de errores `EXCEPTION` y resultados asociativos.

## Configuración (`api/Config/config.php`)

| Clave | Valor | Uso |
|---|---|---|
| `db_path` | `data/gasolinera.sqlite` | Ruta de la base |
| `nearby_max_radius_km` | 50 | Tope del radio en `near`, `search` (radio) y `zone-average` |
| `stale_station_days` | 10 | Antigüedad máxima de una gasolinera (ver `staleClause`) |
| `history_retention_days` | 10 | Rango máximo de `/history` |
| `bbox_max_stations` | 4000 | Tope de puntos por consulta de mapa |
| `attribution` | Ministerio para la Transición Ecológica | Se añade a las respuestas de lista y ficha |

## Caché y límite de peticiones

- **Respuestas correctas (2xx):** `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=3600`. El navegador guarda 5 minutos y la red de Vercel una hora, con reutilización mientras se refresca. Errores: `no-store`.
- **CORS:** `Access-Control-Allow-Origin: *` (la app nativa llama desde otro origen).
- **Límite:** `Core\RateLimit::allow` cuenta peticiones por IP en ventanas de 60 s y permite **240**. Se guarda un fichero por IP y ventana en el directorio temporal, con `flock` para evitar carreras, y limpia ventanas antiguas. La IP se toma de `X-Vercel-Forwarded-For`, `X-Forwarded-For` o `X-Real-IP` (la primera). Localhost no se limita. Al superar el límite responde 429 con `Retry-After: 60`.
- **Redondeo de coordenadas** en el cliente (`Api`): las peticiones `near`, `search` y `zone` usan 3 decimales (`roundCoord`, unos 100 m) y `bbox` ajusta los bordes a 0,01° hacia fuera (`snapDown/snapUp`), de modo que usuarios cercanos comparten la misma URL cacheada. Después, `exactDistances` recalcula en el cliente la distancia real y reordena si el orden es por distancia.
- **Caché de geocodificación:** `Core\Cache::remember` guarda 30 días en un fichero temporal el resultado de cada lugar consultado a Nominatim.

## Parámetros comunes

| Parámetro | Significado | Valores |
|---|---|---|
| `fuel` | Carburante | Uno de los 23 de `KNOWN_FUELS`; otro valor da 422 |
| `sort` | Orden | `price` (por defecto) o `distance` |
| `open` | Apertura | `24h` (solo abiertas 24 h) o `now` (abiertas ahora según horario) |
| `offset`, `limit` | Paginación | `offset >= 0`; `limit` 1–100, 30 por defecto |
| `lat`, `lon` | Coordenadas | Válidas (−90..90, −180..180); si no, 422 |

## Endpoints

### `GET /api/stations/near`

Gasolineras en un radio. Obligatorios `lat`, `lon`. `radius` en km (por defecto 5, máximo 50).

Proceso (`Station::near`): caja envolvente del círculo → filtro por `staleClause`, `open=24h` y carburante → distancia real (Haversine) y descarte fuera del radio → si `open=now`, filtro por horario → `sortPaginateAndBuild`.

Respuesta: `{ stations: [...], total, hasMore, attribution }`. Cada elemento: `ideess, rotulo, direccion, municipio, lat, lon, is24h, horarioRaw, distanciaKm, precios{carburante: precio}, tendencias{carburante: up|down|same|null}`. Solo se devuelven `gasoleo_a`, `gasolina_95_e5` y, si se pidió otro, ese carburante.

### `GET /api/stations/search`

Búsqueda por texto. `q` obligatorio (mínimo 2 caracteres; si no, lista vacía). Opcionales: `lat`, `lon` (para calcular distancia), `radius`, `fuel`, `sort`, `open`, paginación.

Resumen: coincidencias por municipio, dirección, rótulo, CP y localidad; varias palabras (todas deben coincidir en algún campo); con `lat`, `lon` y `radius` se descartan marcas y calles lejanas, pero no municipios ni CP. Si `q` parece un lugar (existe municipio o localidad que empieza así) se añaden las gasolineras a menos de 10 km del lugar geocodificado. Si no hay ninguna coincidencia de texto se intenta geocodificar y se devuelven las de 20 km alrededor (`geocodedFrom` indica el texto). Detalle en [04 · Búsqueda](04-busqueda-y-paridad.md).

Respuesta: como `near`, más `geocodedFrom`.

### `GET /api/stations/suggest-places`

Autocompletado de lugares. `q` (mínimo 2). Devuelve hasta 8 municipios y localidades cuyo nombre normalizado **empieza** por el texto: `{ places: [{ label, sublabel }] }`.

### `GET /api/stations/bbox`

Puntos para el mapa. Obligatorios `north, south, east, west`. Opcionales `fuel`, `open=24h`. Respuesta: `{ stations: [{ ideess, rotulo, lat, lon, is24h, precio }], total, truncated }`. Con más de `bbox_max_stations` puntos se hace un **muestreo uniforme** (`step = total / máximo`) y `truncated` es `true`.

### `GET /api/stations/{ideess}`

Ficha completa de una gasolinera: datos, `horario` interpretado (`OpeningHours::describe` → `estado`, `texto`, `raw`), `combustibles{carburante: {precio, tendencia}}` y `lastSeenDate`. 404 si no existe.

### `GET /api/stations/{ideess}/history`

Serie de precios de un carburante de esa gasolinera. `fuel` (por defecto `gasoleo_a`), `from`, `to` (`AAAA-MM-DD`; por defecto los últimos 10 días y máximo 10), `group=day|month`. Respuesta: `{ ideess, carburante, group, from, to, retentionDays, serie: [{ fecha, precio }] }`. Solo hay 10 días de historia por gasolinera.

### `GET /api/stations/{ideess}/zone-comparison`

Precio de la gasolinera frente a la media de las demás del **mismo municipio** (`municipio_id`) para un carburante: `{ precioPropio, mediaZona, estacionesEnMedia }`. 404 si falta precio o no hay otras.

### `GET /api/stats/national`

Serie de la media nacional. `fuel`, `from`, `to`, `group`. Rango por defecto 14 días (máximo 90 en días o 730 en meses). Respuesta: `{ carburante, group, from, to, hoy, serie: [{ fecha, media, estaciones }] }`. Sale de `national_price_history`, que no se recorta.

### `GET /api/stats/by-fuel`

Serie de las medias nacionales de los 6 carburantes principales (`MAIN_FUELS`): `{ group, from, to, series: { carburante: [{ fecha, media }] } }`. Rango por defecto 30 días.

### `GET /api/stats/by-province`

Media actual por provincia para un carburante, de más barata a más cara: `{ carburante, provincias: [{ provincia, media, estaciones }] }`.

### `GET /api/stats/price-distribution`

Histograma de precios actuales de un carburante. Calcula mínimo y máximo, divide el rango en 14 cubos (mínimo 0,01 €; 0,02 € si todos valen lo mismo) y cuenta: `{ carburante, buckets: [{ desde, hasta, estaciones }] }`.

### `GET /api/stats/zone-average`

Media de precios en una zona para una fecha. Obligatorios `lat`, `lon`, `fuel`. Opcionales `radius` (por defecto 10, máximo 50) y `date` (`AAAA-MM-DD`). Busca las gasolinera dentro del radio y hace `AVG` sobre `price_history` en la fecha usada: la más reciente disponible, o, si se pidió una anterior, la más cercana hacia atrás hasta 3 días. Respuesta: `{ fecha, media, minimo, maximo, estaciones, radioKm }`. 404 sin datos.

### `GET /api/places/resolve`

Convierte un texto (3–120 caracteres) en coordenadas con Nominatim (OpenStreetMap, solo España, con identificación por User-Agent). Respuesta `{ lat, lon, label }`. Se cachea 30 días por texto.

## Códigos de error

| Código | Cuándo |
|---|---|
| 404 | Ruta o recurso inexistente |
| 405 | Método distinto de GET |
| 422 | Parámetros obligatorios ausentes o inválidos |
| 429 | Más de 240 peticiones por minuto desde la misma IP |
| 500 | Excepción no controlada (`Response::internalError`, se registra en el log del servidor) |

Los errores devuelven `{ "error": "mensaje" }`.

## Horarios

`Services\OpeningHours` interpreta el texto de horario del Ministerio (por ejemplo `L-V: 06:00-22:00; S: 07:00-15:00`).
- `isAlwaysOpen`: `true` si el texto contiene «24H» o si las franjas cubren 00:00–23:59 los 7 días. Es el origen de la columna `is_24h`.
- `isOpenAt`: `true/false/null` (`null` cuando el texto no se puede interpretar) para un instante dado.
- `describe`: devuelve `estado` (`abierto`, `cerrado`, `desconocido`) y un texto legible, con la próxima apertura si está cerrado.
- Códigos de día: `L M X J V S D`. `parseRanges` admite rangos de días y varias franjas horarias.
