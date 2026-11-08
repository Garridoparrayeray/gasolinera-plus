# 05 · Cálculo de ruta

La ruta se calcula **en el propio dispositivo**, sin servicio externo de rutas, y puede cruzar la frontera entre España, Portugal y Francia (un único grafo con los tres países). Hay tres piezas:

| Pieza | Fichero | Tarea |
|---|---|---|
| Interfaz | `js/route.js` (`GPRoute`) | Formulario, lugares, mapa, corredor de gasolineras, plan de paradas |
| Trabajador | `js/router-worker.js` | Decide qué países hacen falta, descarga sus paquetes y ejecuta el cálculo en un hilo aparte, sin bloquear la pantalla |
| Motor | `js/router-core.js` (`GPRouter`) | Interpretación del formato binario, unión de los paquetes de país, enganche a la carretera y algoritmo A* |

El grafo lo genera `tools/graph/` (ver [02 · Datos](02-datos-y-procesos.md), sección 5) con el flujo `road-graph.yml`: una sola ejecución lee los extractos de OpenStreetMap de España (península y Canarias), Portugal y Francia (`build-graph.mjs --country es … --country pt … --country fr …`) y escribe un grafo común. Se regenera cada mes.

## Formato del grafo

Se sirve en `/data/road-graph/`:

| Fichero | Contenido |
|---|---|
| `manifest.json` | Índice del grafo (ver abajo) |
| `main-<país>.bin.gz` | Carreteras principales de un país (`main-es`, `main-pt`, `main-fr`): un paquete por país |
| `tiles/<fila>_<col>.bin.gz` | Carreteras locales de una tesela de 0,25° de lado |
| `places.json` | Lugares con nombre para el autocompletado del origen y el destino |

Los ficheros `.bin` van comprimidos con gzip; `decode` (en `router-worker.js`) los descomprime con `DecompressionStream('gzip')` si detecta la cabecera `1f 8b`. El formato anterior, con un único `main.bin.gz` para toda España, ya no existe: `scripts/build-www.mjs` rechaza un `data/road-graph` sin `parts`.

### Manifiesto (`manifest.json`)

| Campo | Significado |
|---|---|
| `version`, `builtAt` | Versión del formato y fecha de generación (la usa el trabajador como nombre de la caché) |
| `tileDeg` | Lado de las teselas, 0,25° |
| `classes`, `mainClassCount` | Clases de carretera y cuántas son «principales» (10) |
| `countries` | Países del grafo, en el orden en que se generó: `['es', 'pt', 'fr']`. El primero es el país «de casa» |
| `mainNodes`, `totalNodes`, `mainEdges`, `mainSegments`, `geomTotal` | Tamaños **globales** de los vectores principales, sumando los tres países |
| `parts` | Por país: `bytes` (tamaño comprimido), `rawBytes`, `nodes` y `segments` |
| `cells` | Por cada celda `fila_columna` con cruces, el país al que pertenece (`es`, `pt` o `fr`; gana el país con más cruces en la celda) |
| `tiles` | Mapa de las teselas existentes por clave `fila_columna` → tamaño comprimido |
| `bundled` | Solo en el manifiesto que va dentro de la app: los países incluidos en el instalador (lo añade `build-www.mjs`) |

### Paquetes por país y frontera

Los nodos de OpenStreetMap se unifican **por identificador** al leer los extractos. Un nodo de la frontera que aparece en el extracto de España y en el de Portugal (o de Francia) es el mismo cruce, así que las carreteras de un lado y otro se enlazan sin ningún puente artificial.

`write-graph.mjs` numera los cruces principales país por país (`partNodeStart`, `partSegStart`), de modo que cada país ocupa un tramo contiguo de índices globales, y escribe un paquete `GPRP` (`main-<país>.bin.gz`) con sus nodos, arcos, tramos y geometría. Un arco puede apuntar a un cruce de otro país: por eso los índices de destino son globales. Los lugares de Portugal y Francia solo incluyen ciudades, pueblos y aldeas (`village`); los de España también barrios y caseríos.

`parsePart` lee un paquete y `mergeParts` junta los que se hayan cargado en los vectores globales (`lat`, `lon`, `segFrom`…, `firstEdge`):
- Los vectores se dimensionan con los totales del manifiesto y cada paquete se copia en su rango (`nodeStart`, `segStart`, `geomOffset`).
- `nodeLoaded` marca qué cruces existen en memoria. Al reconstruir `firstEdge` se **descartan los arcos cuyo destino pertenece a un país que no se ha cargado**, así una ruta dentro de España no arrastra arcos hacia Francia.
- `segRanges` guarda los intervalos de tramos cargados, para que `snap` solo recorra tramos reales.

### Países que hacen falta (`countriesFor`)

`GPRouter.countriesFor(manifest, points)` decide qué paquetes cargar. Mira la celda de cada punto (origen, paradas, destino) en `manifest.cells` y, entre cada par de puntos consecutivos, muestrea la línea recta cada `tileDeg / 5` grados para detectar países intermedios (Bilbao–Lisboa pasa por Portugal aunque ambos extremos se resuelvan bien). Devuelve los países encontrados en el orden de `manifest.countries`; si no encuentra ninguno, usa el primero (`es`). Una ruta dentro de España carga solo `main-es`; Bilbao–Lisboa carga `es` y `pt`; Madrid–Burdeos, `es` y `fr`.

### Origen de los paquetes (`router-worker.js`)

El instalador de la app trae **solo el país de casa** (`bundled = [countries[0]]`, es decir, España): `main-es.bin.gz`, sus teselas y `places.json`. Portugal y Francia se descargan **la primera vez que una ruta pasa por allí**:

1. `sourceFor(points)` carga el manifiesto local. Si no tiene `bundled` (despliegue web), se lee todo del propio servidor. Si todos los países necesarios están en `bundled`, se usan los ficheros locales (`bundledOnly`).
2. En caso contrario `remoteSource()` descarga el manifiesto remoto (`remote + /data/road-graph/manifest.json`, con `remote = GPNative.apiBase()`) y sus ficheros se piden a producción. Si el manifiesto remoto tiene el mismo `builtAt` que el local, los ficheros del país de casa se siguen leyendo del instalador (`bases` con dos orígenes: local primero, remoto después).
3. Lo descargado se guarda en la caché del navegador `road-graph-<builtAt>` (Cache Storage); al cambiar `builtAt` se borran las cachés `road-graph-*` anteriores. Así el paquete de Portugal (unos 14 MB) o el de Francia (unos 87 MB) se baja una sola vez y queda en el móvil.
4. `routerFor` mantiene el `Router` mientras los países pedidos ya estén cargados (`routerCountries`). Si hace falta otro, lo reconstruye con la unión de los que ya tenía y los nuevos, leyendo cada `main-<país>.bin` con su progreso (`progress: { received, total, country }`).

### Paquete principal (`parsePart`)

Cabecera: 4 bytes de firma `GPRP`, ocho enteros de 32 bits (`versión, nodeStart, nodeCount, segStart, segCount, edgeCount, geomOffset, geomCount`: el rango de cruces, tramos y geometría que ocupa el país en los vectores globales) y a partir del byte 36 los vectores, alineados a 4 bytes. Cada vector es el trozo del país:

| Vector | Tipo | Significado |
|---|---|---|
| `lat`, `lon` (M) | Int32 | Coordenadas de los cruces principales, en millonésimas de grado |
| `firstEdge` (M+1) | Uint32 | Índice del primer arco de cada cruce (formato CSR, relativo al paquete) |
| `edgeTarget`, `edgeTime`, `edgeSeg` (E) | Uint32 | Destino (índice global), tiempo en décimas de segundo, y `tramo*2 + sentido` de cada arco |
| `segFrom`, `segTo`, `segLength`, `segClass`, `segFlags` (S) | Uint32/Float32/Uint8 | Extremos, longitud en metros, clase de carretera y `1` si es de peaje |
| `geomStart` (S+1), `geomLat`, `geomLon` (G) | Uint32/Int32 | Puntos intermedios de la geometría de cada tramo |

Aquí `M`, `S`, `E` y `G` son los del país (`nodeCount`, `segCount`, `edgeCount`, `geomCount`). En el manifiesto, `mainNodes` es el número total de cruces principales de todos los países, `totalNodes` el total de cruces (los de detalle se numeran a continuación, así un cruce de una tesela tiene un índice global único), y `mainSegments` y `geomTotal` los tramos y puntos de geometría de todos.

### Teselas (`parseTile`)

Firma `GPRT`, cuatro enteros (`versión, K, S, G`). Las teselas no pertenecen a un paquete: cada una se identifica por su posición, y `manifest.cells` dice de qué país es la celda. Vectores: `nodeGlobal`, `nodeLat`, `nodeLon` (K nodos con su índice global), `segFrom`, `segTo`, `segTime`, `segLength`, `segClass`, `segOneway` (−1, 0, 1) y la geometría.

Los arcos de una tesela **no viven en `firstEdge`**: `addTile` los convierte en aristas de detalle (`detailEdges`, un `Map` por cruce) en ambos sentidos según `segOneway`.

## Enganche a la carretera (`snap`)

Para cada punto (origen, destino, parada) se busca el tramo más cercano:

1. Radio máximo `SNAP_RADIUS_M = 2500` m.
2. Se recorren primero los tramos de las teselas cargadas y luego los de `main`. En `main` se descartan pronto los que están lejos usando un margen `(longitud + radio) * 12` en microgrados.
3. Para cada candidato se proyecta el punto sobre la polilínea del tramo (`projectOnSegment`): por cada par de puntos consecutivos se proyecta con una aproximación plana (`k = cos(lat)`), se limita a `[0,1]` y se mide la distancia real con `metersBetween`.
4. **Penalización de vías rápidas:** en `main`, si el tramo es de clase autopista o troncal (`segClass < 4`), se suma 40 m a la puntuación. Sirve para no engancharse a una autopista que pasa cerca de un pueblo cuando lo razonable es la carretera local.
5. Gana la menor puntuación (distancia + penalización). Si ninguna cae dentro del radio, no hay carretera y se devuelve `error: 'no-road'`.

**Alternativas de enganche.** `snapCandidates(lat, lon, 24)` devuelve los 24 mejores tramos, no solo el más cercano. Antes de calcular se ordenan por **viabilidad**: un origen debe poder alcanzar al menos 400 nodos de la red (`reachableNodes`, hacia delante) y un destino debe poder ser alcanzado desde otros 400 (`reverseReachable`, hacia atrás, con una tabla inversa `buildReverse` que se construye una vez). Se conservan los 4 mejores y `route` prueba combinaciones de origen y destino (máximo 8 búsquedas por tramo) hasta que una conecta. Así un punto pegado a un fragmento aislado o a un tramo de sentido único sin entrada no impide la ruta. Verificado con 1.015 rutas entre 203 localidades peninsulares y 5 destinos, sin fallos. En una ruta con parada, el punto intermedio conserva el candidato con el que llegó el tramo anterior.

El punto enganchado guarda el tramo, la posición proyectada, la distancia recorrida a lo largo del tramo (`alongMeters`), la longitud total y el índice de segmento de la polilínea (`pieceIndex`).

## Carga de teselas (`ensureTiles`)

Antes de calcular se cargan las teselas alrededor de cada punto dentro de `DETAIL_RADIUS_DEG = 0,12` grados (0,168 en longitud). `tileKeysAround` solo devuelve las que existen en `manifest.tiles`, sin importar el país: si un punto está cerca de la frontera, entran las teselas de los dos lados. Se descargan en paralelo solo las que faltan. En rutas largas, el interior lo cubren los paquetes principales y las teselas dan el detalle en los extremos.

`loadTile` (en el trabajador) depende del origen: con `bundledOnly` (la ruta solo toca países incluidos en el instalador) una tesela cuya celda pertenece a un país no incluido devuelve `null` y se anota vacía (`tiles.set(key, { segFrom: [], usable: [] })`) en lugar de intentar descargarla; con el origen remoto se pide `tiles/<clave>.bin` al servidor. Por eso la ruta de Bilbao a Lisboa descarga el paquete de Portugal y las teselas de detalle de la zona de Lisboa, y no pide nada de Francia.

## Búsqueda (A*)

`Router.search` calcula el camino de mínimo **tiempo** entre dos puntos enganchados.

- **Salida:** desde un tramo enganchado se puede salir por uno o por ambos extremos según el sentido único, con un coste proporcional al trozo que falta recorrer (`endpointCosts`).
- **Cola de prioridad:** un montículo binario (`Heap`) con claves `Float64Array` y valores `Int32Array`, que crece al llenarse.
- **Heurística:** distancia recta al destino dividida por la velocidad máxima `MAX_SPEED_MS = 120/3,6` m/s y multiplicada por 0,995. Es admisible (nunca sobrestima), así que el resultado es óptimo.
- **Marcas por generación:** `stamp`, `closed`, `gScore` se reutilizan entre búsquedas sin limpiarlos, comparando con un contador `generation`. Evita reservar memoria en cada ruta.
- **Fin:** se guarda el mejor destino visto (`bestTotal`); se detiene cuando la cabeza de la cola ya no puede mejorarlo.
- **Arcos:** los de `main` (`firstEdge`) y los de detalle (`detailEdges`). Los de detalle se referencian con códigos negativos `-2 - id`.

### Evitar peajes

`route(points, { avoidTolls })` y `search(..., avoidTolls)`: cuando está activo, al recorrer los arcos de `main` se **descartan** los que pertenecen a un tramo con `segFlags = 1` (peaje). El resto del algoritmo no cambia. Si no existe ninguna ruta sin peajes, devuelve `no-connection` y la pantalla lo explica («No hay ninguna ruta sin peajes entre esos puntos…»). El casilla `route-avoid-tolls` recalcula la ruta al cambiarla, con la misma parada si la hay. Ejemplo real con el grafo: Bilbao–Barcelona, 609 km y 6 h 12 min con peaje frente a 595 km y 6 h 56 min sin él.

### Reconstrucción (`leg`)

1. Si origen y destino están en el **mismo tramo**, se calcula la ruta directa por él (`directOnSegment`, respetando el sentido único) y se usa si no es más lenta.
2. En caso contrario, se recorre `prevNode`/`prevEdge` hacia atrás desde el mejor nodo y se invierte.
3. Se une la geometría: recorte del tramo inicial, cada arco (con su geometría en el sentido correcto), recorte del tramo final. Se eliminan puntos consecutivos repetidos.
4. Se acumulan metros, tiempo y si algún tramo tiene peaje (`segFlags`).

`route(points)` encadena tramos para más de dos puntos (origen → parada → destino) y devuelve `{ coords, meters, seconds, toll, visited, legs, snapped }` o `{ error: 'no-road' | 'no-connection', index }`. `no-connection` ocurre, por ejemplo, entre una isla y la península. El trabajador añade a la respuesta `ms` (milisegundos de cálculo) y `countries` (los paquetes cargados), que la pantalla usa para saber de qué países hay que traer gasolineras.

## Pantalla de ruta (`route.js`)

### Lugares

`loadPlaces` carga `places.json` (cada fila: nombre, lat, lon, tipo 0–6, provincia, nombre alternativo). `searchPlaces` normaliza el texto y puntúa: coincidencia exacta 0, empieza por el texto 1, contiene el texto 2 (solo con 4 o más letras); orden por `puntuación * 10 + tipo` (ciudades antes que aldeas) y después alfabético; devuelve 8.

`places.json` mezcla los lugares de los tres países (Portugal y Francia solo hasta aldeas), así que se puede escribir «Lisboa» o «Burdeos» como origen o destino. `resolveInput` convierte lo escrito en coordenadas: usa el punto ya elegido si el texto no cambió; si no, busca coincidencia exacta en los lugares; si no, `Api.resolvePlace` (Nominatim); y si el servidor falla, toma el primer lugar aproximado. Si nada sirve, error «No encuentro…».

Clic en el mapa fija el destino como «Punto del mapa».

### Gasolineras de cada lado de la frontera (`refreshCorridor`)

Tras calcular la ruta, `refreshCorridor` lee `state.direct.countries` (los países por los que pasa) y, si falta, usa el país activo (`GPCountry.code`). Con ellos llama a `OfflineEngine.loadCountries(countries)` (`js/api.js`):
- `loadCountry` devuelve las gasolineras del país activo desde la copia local (`loadData`) y las de los demás países descargando su fichero ligero (`GPCountry.liteUrlFor(país)`, por ejemplo `data/stations-lite-pt.json`, sobre `GPNative.apiBase()`). Si la descarga falla, ese país aporta una lista vacía y se vuelve a intentar la próxima vez.
- A cada gasolinera se le añade el campo `pais`, y las listas de todos los países se **concatenan** en una sola. El corredor, el coste y el plan de paradas trabajan sobre esa lista única, sin distinguir fronteras.
- Al abrir la ficha de una gasolinera del corredor se usa `GP.openStationModal(ideess, station.pais)`, para pedirla al país correcto.

El filtro de carburante (`filter-fuel`) se rellena con los carburantes principales del país activo. Una gasolinera de otro país que no vende ese carburante (clave ausente en `precios`) se descarta en el corredor; los carburantes que usa cada país están en `config/fuels.json` y `config/countries.json`.

### Corredor de gasolineras (`buildCorridor`)

Dado el trazado, un radio máximo de desvío (`route-detour`, en km), los datos de gasolineras (de uno o varios países), el carburante y si solo 24 h:

1. Distancias acumuladas a lo largo de la ruta (`cumulative`).
2. Rejilla espacial de 0,05° (`cell`): cada segmento de la ruta se anota en todas las celdas que toca ampliadas por el radio (`padLat = maxKm*1000/111000`, `padLon = padLat/cos(lat)`).
3. Para cada gasolinera con precio (y 24 h si se pidió) se mira solo el cubo de su celda; se proyecta sobre cada segmento y se queda la **distancia perpendicular mínima** (`offKm`) y la posición a lo largo de la ruta (`alongKm`).
4. Se conservan las que están a `offKm ≤ radio`.

Importante: el «desvío» es la distancia perpendicular a la ruta, no un tiempo adicional. El coste en tiempo y km de parar en una gasolinera se calcula después (`setStop`) recalculando la ruta con esa parada intermedia.

### Coste y aviso de repostaje (`renderAdvice`)

- Litros del trayecto = `km de ruta × consumo medio / 100` (el consumo sale del resumen del coche activo).
- Coste estimado = litros × **precio medio de las gasolineras del corredor**, todas las del trazado sean del país que sean (no hay conversión de moneda: los tres países están en euros). La unidad (`AlertsStore.unitFor`) sale del carburante elegido.
- Nivel del depósito (`route-tank`): al principio se estima con `tankPercent` del garaje, redondeado a 5 %, y el usuario lo puede mover.
- Si el carburante del filtro no es el del coche, solo avisa.

### Plan de paradas (`planStops`)

Algoritmo voraz:

1. `alcance = depósito × nivel% / consumoPorKm − RESERVE_KM` (`RESERVE_KM = 30`) y `alcanceCompleto = depósito / consumoPorKm`.
2. Mientras lo que queda hasta el destino supere el alcance:
   - `alcanzables` = gasolineras del corredor entre `posición + 1 km` y `posición + alcance`. Si no hay ninguna, se marca `stranded` (sin cobertura) y se devuelve lo planificado.
   - Se prefieren las de la ventana `≥ posición + 40 % del alcance` (para no parar demasiado pronto). Si no hay, se usan todas las alcanzables.
   - Se elige la **más barata**, se coloca la posición ahí y el alcance pasa a `alcanceCompleto − reserva` (se supone que se llena el depósito).
   - Máximo 8 paradas.
3. Si no hace falta parar, se calcula el sobrante `posición + alcance − kmRuta`.

El botón «Parar en esta gasolinera» (`route-refuel-go`) usa la primera parada del plan; «Parar aquí» en cada fila usa esa gasolinera. `setStop` recalcula la ruta con la parada y muestra el incremento (+min, +km).

### Navegar

`navigate` abre Google Maps con origen, destino y la parada como punto intermedio (`waypoints`). No se usa la ruta calculada por la app, solo los puntos; la ruta propia sirve para elegir dónde repostar.

## Trabajador y progreso

`worker()` crea `router-worker.js` una vez. Cada petición lleva un `id`; el trabajador contesta con `result`, `error` o `progress`. Mientras se descarga cada `main-<país>.bin.gz` se muestra el porcentaje con el país y el tamaño (`«Cargando el mapa de carreteras de Portugal (14 MB)… 40 %»`; `COUNTRY_NAMES` en `route.js`), y al terminar la descarga «Preparando el mapa de carreteras en tu móvil…» mientras se unen los paquetes. El progreso lleva `{ received, total, country }`, y `total` sale de `Content-Length` o, si falta, de `manifest.parts[país].bytes`. Después los paquetes quedan en memoria dentro del trabajador, y en la caché del navegador para la próxima vez.

## Casos límite conocidos

- Fuera de la cobertura del grafo (los extractos de España con Canarias, Portugal y Francia), o en puntos a más de 2,5 km de una carretera, devuelve `no-road`.
- El tiempo usa velocidades teóricas; no hay tráfico ni cortes.
- Los peajes se pueden evitar o no (casilla «Evitar peajes»), pero no se calcula su coste. Solo se marcan los peajes de las carreteras principales del grafo (los paquetes `main-<país>.bin`), no los de las teselas locales. Las autopistas de peaje de Francia y de Portugal salen marcadas igual que las de España, pero tampoco se calcula su importe.
- Sin grafo publicado, la ruta no funciona en ese despliegue (el proceso de compilación lo avisa).
- Sin conexión, una ruta dentro de España funciona (su paquete viene en la app), pero una que entra en Portugal o Francia necesita haber descargado antes ese paquete; si no, el cálculo falla y la pantalla muestra «No se pudo calcular la ruta: …».
- Las rutas con paradas intermedias entre países funcionan igual: `countriesFor` considera todos los puntos.
