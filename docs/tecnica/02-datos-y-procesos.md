# 02 · Datos y procesos automáticos

## 1. El feed oficial

Fuente: servicio REST del Ministerio para la Transición Ecológica (`ServiciosRESTCarburantes`). Dos URL:

- `.../EstacionesTerrestres/`: precios de **hoy** de todas las gasolineras.
- `.../EstacionesTerrestresHist/DD-MM-AAAA`: precios de un día pasado.

Particularidades del formato:
- Los números vienen con **coma decimal** como texto (`"1,459"`). `parseSpanishDecimal` los convierte.
- Las fechas vienen como `DD/MM/AAAA HH:MM:SS`. `feedDateToIso` las pasa a `AAAA-MM-DD`; `isoDateToHistParam` hace el camino inverso para pedir el histórico.
- Los campos de precio empiezan por `Precio ` y se traducen a un identificador interno con `FUEL_FIELD_MAP` (por ejemplo `Precio Gasoleo A` → `gasoleo_a`). Si aparece un campo nuevo no mapeado, se avisa por `STDERR` y se ignora.
- No requiere clave de API.

Hay 23 carburantes mapeados. La interfaz solo ofrece los habituales; el resto se guarda igualmente.

## 2. Base SQLite (`data/gasolinera.sqlite`)

La genera `scripts/build-database.php`. El servidor PHP la abre en solo lectura. Tablas:

| Tabla | Clave | Contenido |
|---|---|---|
| `stations` | `ideess` | Datos fijos de cada gasolinera: rótulo, dirección, localidad, municipio, provincia, CP, horario en bruto, `is_24h`, `lat`, `lon`, columnas `*_normalizado` para buscar y `last_seen_date` |
| `current_prices` | (`ideess`, `carburante`) | Precio actual de cada carburante en cada gasolinera y su fecha |
| `price_history` | (`ideess`, `fecha`, `carburante`) | Precios por día. Solo se conservan `PRICE_HISTORY_RETENTION_DAYS = 10` días |
| `national_price_history` | (`fecha`, `carburante`) | Media nacional por día y carburante, y número de gasolineras. **No se recorta**: es la serie larga de estadísticas |
| `meta` | `key` | `last_snapshot_date`, `source_updated_at`, `backfill_completed_through` |

Índices relevantes: `lat`, `lon`, `municipio_id`, `municipio_normalizado`, `rotulo_normalizado`, `localidad_normalizada`, `current_prices(carburante, precio)`, `price_history(ideess, carburante, fecha DESC)` y `price_history(fecha, carburante)`.

### Columnas normalizadas

`Models\Search::normalize` transforma un texto a minúsculas, quita tildes (`á→a`, `ñ→n`, `ç→c`…) y colapsa espacios. Se aplica a municipio, dirección, rótulo y localidad al guardar y al texto de búsqueda al consultar. Así «Bermeo», «BERMEO» y «bérmeo» coinciden.

### Modos del script

| Modo | Uso | Efecto |
|---|---|---|
| `daily` | Ejecución diaria | Descarga hoy, actualiza `stations` (upsert), reemplaza `current_prices` de cada gasolinera, añade a `price_history`, guarda la media nacional del día, recorta el histórico y hace `VACUUM`. Al terminar genera el lite JSON |
| `backfill --days=N` | Una sola vez, para poblar el histórico | Recorre los N días anteriores, inserta solo las gasolineras que falten y añade precios al histórico sin tocar `current_prices` |
| `lite` | Pruebas y CI | Solo regenera `stations-lite.json` a partir de la base existente |

`applySnapshot` hace todo dentro de una transacción. En `daily` usa `INSERT ... ON CONFLICT DO UPDATE` para `stations` y borra/inserta `current_prices` por gasolinera; en `backfill` usa `INSERT OR IGNORE`.

### Gasolineras que desaparecen del feed

Si una gasolinera deja de aparecer, no se borra: se conserva con su último `last_seen_date`. Las consultas aplican `staleClause`: `last_seen_date >= date(MAX(last_seen_date), '-10 days')`. Es una fecha **relativa a la más reciente de la base**, no a hoy, para que un fallo de varios días del feed no vacíe la aplicación.

## 3. Lite JSON (`data/stations-lite.json`)

Fichero pensado para trabajar **sin servidor**: todas las gasolineras vigentes con sus precios de hoy (unos 5,5 MB). Lo genera `generateLiteJson`. Estructura:

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
- No incluye histórico ni horarios interpretados: el horario se guarda en bruto y la app solo lo muestra.

La app lo descarga cada 20 horas (`refreshOfflineData`) y lo guarda con `AlertsStore.set('offlineStations', ...)` en IndexedDB. En la APK también viaja empaquetado como primera copia.

## 4. Índice de precios (medias históricas)

Lo genera `scripts/build-price-index.php` y sirve para comparar lo que pagas con la media **del día en el que repostaste**, sin depender del servidor.

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

- `n` es la media nacional, `p` las medias por provincia (clave `IDProvincia`) y `c` las de cada **celda** de 0,1° de lado (clave `filaLat_colLon` = `floor(lat/0.1)_floor(lon/0.1)`).
- Cada cubo es un vector plano con **2 números por carburante**: la **suma de precios en milésimas de euro** (enteros, para no arrastrar decimales) y el **número de muestras**. La media de un conjunto de cubos es `suma_total / muestras_total / 1000`.
- Solo se guardan 5 carburantes (`INDEX_FUELS`). Para un coche con otro carburante la app no puede mostrar comparación histórica.

### Manifiesto `index.json`

Lista los meses disponibles: `month`, `file`, `days`, `lastDate`, `bytes`, más `firstDate`, `lastDate`, `cellDeg`, `fuels`. El cliente descarga solo los meses cuyo `lastDate` cambió.

### Proceso

`indexMain` recorre los días desde `--from` (o `--days`, 400 por defecto) hasta hoy. Para cada día ausente descarga el snapshot, comprueba que la fecha devuelta coincide con la pedida (el Ministerio a veces devuelve otra) y agrega. Hoy y ayer se **refrescan siempre**. Hay una pausa de 0,3 s entre peticiones para no saturar al Ministerio. Al terminar escribe los ficheros de mes y el manifiesto.

El proceso automático `price-index.yml` (cada día 09:30) baja los ficheros ya publicados, añade lo que falte y los sube a la release `price-index` de GitHub. Si la release no existe, la primera ejecución hace el histórico completo (400 días) y puede tardar horas.

### Cómo lo usa el cliente

Ver [06 · Cálculos](06-calculos.md), sección «Comparación con la media». En la app, `GPPriceIndex` descarga la release en `Filesystem` y `GPPriceIndexCore` hace las medias. La APK puede llevar una copia inicial (`tools/price-index/fetch-index.mjs` la baja en el build a `data/price-index-seed`; `seed()` la copia a `Filesystem` la primera vez).

## 5. Grafo de carreteras

Lo genera `tools/graph/build-graph.mjs` a partir de extractos de OpenStreetMap (formato `.osm.pbf`, descargados de Geofabrik) y lo empaqueta `write-graph.mjs`. Se publica como `road-graph.tar.gz` en la release `road-graph`. El formato y el algoritmo de ruta están en [05 · Ruta](05-ruta.md).

Etapas de `build-graph.mjs`:

1. **Pasada 1, vías transitables.** Lee las vías (`way`) con etiqueta `highway`. `isDrivable` descarta áreas y tramos con acceso `no`, `private`, `agricultural`, `forestry`, `delivery`, `customers` o `emergency` (salvo que un permiso explícito para coches lo autorice).
2. **Nodos únicos y cruces.** Un nodo es cruce si lo comparten varias vías o es extremo.
3. **Pasada 2, coordenadas y lugares.** Asigna posiciones y recoge los lugares con nombre (`place=city|town|village|suburb|quarter|neighbourhood|hamlet`).
4. **Troceo en tramos entre cruces.** Cada tramo guarda su geometría simplificada (`simplify`, tolerancia 8 m, por distancia perpendicular).
5. **Componentes conexas.** Se conservan solo las mayores de 300 cruces (`MIN_COMPONENT`) para descartar islotes desconectados.
6. **Escritura.** `writeGraph` genera `main.bin` (carreteras principales de toda España), teselas de 0,25° (`TILE_DEG`) con carreteras locales, `manifest.json` y `places.json`. Todo comprimido con gzip.

Velocidades: `speedOf` usa la velocidad declarada (`maxspeed`, con casos españoles `ES:urban=50`, `ES:rural=90`, `ES:motorway=120`, `ES:trunk=100`, `ES:living_street=20`, y conversión de mph) multiplicada por 0,85, o una velocidad por defecto según el tipo de vía (autopista 110, troncal 90, primaria 70, secundaria 60, terciaria 50, sin clasificar 40, residencial 25, calle residencial 10). Se limita por tipo (autopista 120, troncal 110, primaria 100, secundaria y terciaria 90) y nunca baja de 5.

Sentido único: `onewayOf` interpreta `oneway` (`yes/1/true` → 1, `-1/reverse` → −1, `no/false/0/reversible/alternating` → 0) y, sin etiqueta, considera de sentido único las autopistas, rotondas y glorietas.

Tras construir, el flujo `road-graph.yml` valida el grafo con rutas de referencia (`tests/router.test.mjs`) antes de publicarlo.

## 6. Mapas sin conexión

`tools/maps/build-maps.mjs` extrae de la última compilación de **Protomaps** (mapa vectorial de OpenStreetMap en formato PMTiles) una región por comunidad autónoma, definidas en `tools/maps/regions.json` con su caja (`bbox`), `minzoom 12` y `maxzoom 15`. Se publican como assets de la release `offline-maps` junto con un `index.json` con nombre, fichero y tamaño. El límite de tamaño de un asset de GitHub es 2 GB (`maxBytes`).

## 7. Procesos automáticos (GitHub Actions)

| Flujo | Cuándo | Qué hace |
|---|---|---|
| `rebuild-schedule.yml` | Cada día a las 05:00 (hora de Madrid) por un disparador externo, con respaldos programados en GitHub a las 03:17, 05:41 y 07:13 UTC; en cada push a `main` y manual | En la ejecución diaria descarga el snapshot, actualiza la base y el lite JSON y los **sube al repositorio** como commit. Si el snapshot de hoy ya está publicado, no repite nada (salvo que se lance a mano con `force`). Despliega en producción con Vercel CLI; luego borra despliegues antiguos para ahorrar almacenamiento |
| `price-index.yml` | Al terminar bien la actualización diaria, cada día 09:30 UTC como respaldo, al cambiar `build-price-index.php` en `feat/**` y manual | Actualiza y publica el índice de precios |
| `road-graph.yml` | Día 2 de cada mes 04:00 | Reconstruye y publica el grafo tras validarlo |
| `offline-maps.yml` | Día 3 de cada mes 05:00 | Extrae y publica los mapas por región |
| `tests.yml` | En cada push | Comprobaciones estáticas, pruebas de API, paridad JS/PHP y baterías de interfaz |
| `build-apps.yml` | Push a `feat/**` y manual | Compila el APK de Android (firmado si hay clave, y depuración) y la app de iOS para simulador; publica el APK de prueba como release `android-debug` |

**Disparo diario.** GitHub no garantiza la hora de los `schedule`: en este repositorio arrancan entre 5 y 6,5 horas tarde y algún día no arrancan. Por eso la ejecución de las 05:00 la lanza un servicio externo (por ejemplo cron-job.org, zona horaria `Europe/Madrid`) con una petición `POST https://api.github.com/repos/Garridoparrayeray/gasolinera-plus/actions/workflows/rebuild-schedule.yml/dispatches`, cuerpo `{"ref":"main"}` y cabeceras `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`. El token es un *fine-grained token* limitado a este repositorio con permiso **Actions: Read and write**. GitHub responde `204` si la acepta.

**Aviso de diseño:** el proceso diario hace `git commit` de `data/gasolinera.sqlite` (unos 50 MB). El historial de git crece con cada día. Si esto se vuelve un problema, la base debería publicarse como asset de una release en lugar de versionarse.
