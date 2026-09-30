# 05 · Cálculo de ruta

La ruta se calcula **en el propio dispositivo**, sin servicio externo de rutas. Hay tres piezas:

| Pieza | Fichero | Tarea |
|---|---|---|
| Interfaz | `js/route.js` (`GPRoute`) | Formulario, lugares, mapa, corredor de gasolineras, plan de paradas |
| Trabajador | `js/router-worker.js` | Descarga el grafo y ejecuta el cálculo en un hilo aparte, sin bloquear la pantalla |
| Motor | `js/router-core.js` (`GPRouter`) | Interpretación del formato binario, enganche a la carretera y algoritmo A* |

El grafo lo genera `tools/graph/` (ver [02 · Datos](02-datos-y-procesos.md), sección 5).

## Formato del grafo

Se sirve en `/data/road-graph/`:

| Fichero | Contenido |
|---|---|
| `manifest.json` | `tileDeg` (0,25), `mainBytes`, y `tiles`: mapa de las teselas existentes por clave `fila_columna` |
| `main.bin.gz` | Carreteras principales de toda España en un solo fichero |
| `tiles/<fila>_<col>.bin.gz` | Carreteras locales de una tesela de 0,25° de lado |
| `places.json` | Lugares con nombre para el autocompletado del origen y el destino |

Los ficheros `.bin` van comprimidos con gzip; `readBuffer` los descomprime con `DecompressionStream('gzip')` si detecta la cabecera `1f 8b`.

### `main.bin` (`parseMain`)

Cabecera: 4 bytes de firma `GPRG`, seis enteros de 32 bits (`versión, M, N, E, S, G`) y a partir del byte 28 los vectores, alineados a 4 bytes:

| Vector | Tipo | Significado |
|---|---|---|
| `lat`, `lon` (M) | Int32 | Coordenadas de los cruces principales, en millonésimas de grado |
| `firstEdge` (M+1) | Uint32 | Índice del primer arco de cada cruce (formato CSR) |
| `edgeTarget`, `edgeTime`, `edgeSeg` (E) | Uint32 | Destino, tiempo en décimas de segundo, y `tramo*2 + sentido` de cada arco |
| `segFrom`, `segTo`, `segLength`, `segClass`, `segFlags` (S) | Uint32/Float32/Uint8 | Extremos, longitud en metros, clase de carretera y `1` si es de peaje |
| `geomStart` (S+1), `geomLat`, `geomLon` (G) | Uint32/Int32 | Puntos intermedios de la geometría de cada tramo |

`M` es el número de cruces principales, `N` el total de cruces (los de detalle se numeran a continuación, así un cruce de una tesela tiene un índice global único), `E` arcos, `S` tramos y `G` puntos de geometría.

### Teselas (`parseTile`)

Firma `GPRT`, cuatro enteros (`versión, K, S, G`). Vectores: `nodeGlobal`, `nodeLat`, `nodeLon` (K nodos con su índice global), `segFrom`, `segTo`, `segTime`, `segLength`, `segClass`, `segOneway` (−1, 0, 1) y la geometría.

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

Antes de calcular se cargan las teselas alrededor de cada punto dentro de `DETAIL_RADIUS_DEG = 0,12` grados (0,168 en longitud). Se descargan en paralelo solo las que faltan. En rutas largas, el interior lo cubre `main.bin` y las teselas dan el detalle en los extremos.

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

`route(points)` encadena tramos para más de dos puntos (origen → parada → destino) y devuelve `{ coords, meters, seconds, toll, visited, legs, snapped }` o `{ error: 'no-road' | 'no-connection', index }`. `no-connection` ocurre, por ejemplo, entre una isla y la península.

## Pantalla de ruta (`route.js`)

### Lugares

`loadPlaces` carga `places.json` (cada fila: nombre, lat, lon, tipo 0–6, provincia, nombre alternativo). `searchPlaces` normaliza el texto y puntúa: coincidencia exacta 0, empieza por el texto 1, contiene el texto 2 (solo con 4 o más letras); orden por `puntuación * 10 + tipo` (ciudades antes que aldeas) y después alfabético; devuelve 8.

`resolveInput` convierte lo escrito en coordenadas: usa el punto ya elegido si el texto no cambió; si no, busca coincidencia exacta en los lugares; si no, `Api.resolvePlace` (Nominatim); y si el servidor falla, toma el primer lugar aproximado. Si nada sirve, error «No encuentro…».

Clic en el mapa fija el destino como «Punto del mapa».

### Corredor de gasolineras (`buildCorridor`)

Dado el trazado, un radio máximo de desvío (`route-detour`, en km), los datos de gasolineras, el carburante y si solo 24 h:

1. Distancias acumuladas a lo largo de la ruta (`cumulative`).
2. Rejilla espacial de 0,05° (`cell`): cada segmento de la ruta se anota en todas las celdas que toca ampliadas por el radio (`padLat = maxKm*1000/111000`, `padLon = padLat/cos(lat)`).
3. Para cada gasolinera con precio (y 24 h si se pidió) se mira solo el cubo de su celda; se proyecta sobre cada segmento y se queda la **distancia perpendicular mínima** (`offKm`) y la posición a lo largo de la ruta (`alongKm`).
4. Se conservan las que están a `offKm ≤ radio`.

Importante: el «desvío» es la distancia perpendicular a la ruta, no un tiempo adicional. El coste en tiempo y km de parar en una gasolinera se calcula después (`setStop`) recalculando la ruta con esa parada intermedia.

### Coste y aviso de repostaje (`renderAdvice`)

- Litros del trayecto = `km de ruta × consumo medio / 100` (el consumo sale del resumen del coche activo).
- Coste estimado = litros × **precio medio de las gasolineras del corredor**.
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

`worker()` crea `router-worker.js` una vez. Cada petición lleva un `id`; el trabajador contesta con `result`, `error` o `progress`. Mientras se descarga `main.bin.gz` se muestra el porcentaje (`«Descargando el mapa de carreteras … solo la primera vez»`). Después queda en memoria dentro del trabajador.

## Casos límite conocidos

- Fuera de la cobertura del grafo, o en puntos a más de 2,5 km de una carretera, devuelve `no-road`.
- El tiempo usa velocidades teóricas; no hay tráfico ni cortes.
- Los peajes se pueden evitar o no (casilla «Evitar peajes»), pero no se calcula su coste. Solo se marcan los peajes de las carreteras principales del grafo (`main.bin`), no los de las teselas locales.
- Sin grafo publicado, la ruta no funciona en ese despliegue (el proceso de compilación lo avisa).
