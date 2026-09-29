# 04 · Búsqueda y paridad

Hay **dos implementaciones** de la misma lógica de búsqueda:

- **Servidor:** `Models\Station::search` y `::near` (PHP, sobre SQLite).
- **Cliente sin conexión:** `OfflineEngine.search` y `.near` en `js/api.js` (JavaScript, sobre el lite JSON).

Deben dar los mismos resultados. `tests/api-parity.mjs` y `tests/parity-lib.js` lo comprueban en CI comparando ambas para una batería de consultas. **Cualquier cambio en una debe hacerse también en la otra.**

## Normalización

Servidor: `Models\Search::normalize`. Cliente: `OfflineEngine`/`normalize`.

- Servidor: sustituye las letras acentuadas por su versión simple (`á→a`, `ñ→n`, `ç→c`…), pasa a minúsculas y colapsa cualquier secuencia de espacios en uno.
- Cliente: `text.normalize('NFD')` y elimina las marcas diacríticas, luego minúsculas.

En la base, las columnas `municipio_normalizado`, `direccion_normalizada`, `rotulo_normalizado` y `localidad_normalizada` ya están normalizadas. En el cliente se normaliza cada campo en el momento de comparar.

## Cerca de ti (`near`)

1. Se descartan las gasolineras sin el carburante elegido y, si `open=24h`, las que no abren 24 h.
2. Se calcula la distancia **Haversine** al usuario y se descarta lo que supera el radio.
3. Orden: `distance` (menor distancia primero) o `price` (menor precio del carburante; las que no tienen precio van al final).
4. Paginación por `offset` y `limit`.

Servidor: primero una **caja envolvente** (`boundingBox`: ±`radio/111` grados de latitud y ±`radio/(111·cos(lat))` de longitud) para que SQLite use los índices de `lat` y `lon`, y después el filtro exacto por Haversine.

`open=now` (abierto ahora) solo existe en el servidor: el lite JSON no incluye horarios interpretados. En la app nativa, `canUseLocal` devuelve `false` si `open` es `now`, y entonces se va al servidor.

## Búsqueda por texto (`search`)

### Coincidencias

Una gasolinera coincide si el texto normalizado, completo, aparece en alguno de: municipio, dirección, rótulo, localidad, o el código postal **empieza** por el texto tal como se escribió.

Además:
- **Marca sin espacios:** `rotulo_normalizado` sin espacios contiene el texto sin espacios. Así «easy gas» encuentra «EASYGAS».
- **Varias palabras:** si el texto tiene más de una palabra, también coincide si **cada palabra** aparece en alguno de esos campos (no tiene por qué ser el mismo). Así «repsol amorebieta» encuentra REPSOL de Amorebieta: una palabra está en el rótulo y la otra en el municipio.

### Relevancia (menor es mejor)

| Valor | Condición |
|---|---|
| 0 | Municipio o localidad exactamente igual al texto, o CP exacto |
| 1 | Municipio o localidad empieza por el texto |
| 2 | CP empieza por el texto |
| 3 | Municipio o localidad contiene el texto; o, con varias palabras, alguna palabra aparece en el municipio o la localidad |
| 4 | El rótulo contiene el texto |
| 5 | Resto |
| 6 | Gasolinera añadida por proximidad a un lugar (solo servidor) |

El orden final es **relevancia y después distancia** (si se pidió `sort=distance` y hay ubicación) **o precio**.

### Filtro por radio (solo si hay ubicación)

Si llegan `lat`, `lon` y `radius`, una coincidencia con relevancia **mayor que 3** (es decir, por rótulo o dirección, no por lugar) se descarta cuando está a más distancia que el radio. Las coincidencias por municipio, localidad o CP (relevancia ≤ 3) nunca se descartan: puedes consultar una ciudad lejana.

### Mezcla con el lugar (solo servidor)

Si el texto parece un lugar (`looksLikePlaceQuery`: existe algún municipio o localidad que empiece así), el servidor geocodifica el texto con Nominatim y añade las gasolineras a menos de **10 km** del punto que no estuvieran ya, con relevancia 6. El cliente sin conexión no hace esto (no puede geocodificar).

### Sin resultados de texto

Si `total = 0` y **ninguna gasolinera coincidió por texto** (`textMatched` es falso), el servidor intenta geocodificar y devuelve las de **20 km** alrededor del lugar, con `geocodedFrom` para avisar al usuario. Si sí hubo coincidencias de texto pero el radio las descartó, **no** se hace ese salto: el usuario ve la lista vacía y la ayuda «Prueba con más radio o escribe otra ubicación».

## Lista por defecto sin ubicación (`cheapest`)

Si el usuario no da su ubicación (o la rechaza), la pantalla de precios no queda vacía: muestra **las gasolineras más baratas de España** para el carburante y el horario elegidos (`OfflineEngine.cheapest`, sobre el lite JSON, ordenadas por precio y paginadas). La línea de estado lo dice y sugiere activar la ubicación. Es el modo `stationsMode = 'cheapest'` de `app.js`; el radio no se aplica. En cuanto llega la ubicación se pasa a `nearby`. También se muestra mientras se espera la respuesta del GPS.

## Sugerencias de lugares

`suggestPlaces` devuelve hasta 8 municipios y localidades cuyo nombre normalizado empieza por el texto (municipios primero, después localidades distintas del municipio), ordenados alfabéticamente. Servidor: SQL con `UNION` y `ORDER BY grupo, label`. Cliente: recorrido del lite JSON con dos `Map` para no repetir.

## Ficha de gasolinera (`station`)

Servidor: `Station::find` con todos los precios y tendencias e `OpeningHours::describe`. Cliente sin conexión: los datos del lite JSON con `horario.estado = 'desconocido'` y el horario en bruto como texto.

## Tendencias

Servidor: para cada gasolinera y carburante de la página, compara el precio actual con el segundo más reciente de `price_history` (tolerancia 0,0005 €): `up`, `down` o `same`. Cliente: el lite JSON trae la letra `u/d/s` ya calculada (`t`).

## Mapa (`bbox`)

Devuelve `ideess, rotulo, lat, lon, is24h, precio` de todas las gasolineras dentro de la caja. Tope de 4000 puntos con muestreo uniforme (`capForMap` en el cliente, `withinBounds` en el servidor). En la app nativa se resuelve siempre en local.

## Dónde se decide servidor o local (`Api`)

| Método | App nativa | Web |
|---|---|---|
| `near` | Local (excepto `open=now`) | Servidor; si no hay red, local |
| `bbox` | Local | Servidor; si no hay red, local |
| `search` | Servidor; si no hay red, local | Igual |
| `suggestPlaces` | Servidor; si no hay red, local | Igual |
| `station` | Servidor; si no hay red, local | Igual |
| `history` | Servidor; sin red devuelve serie vacía | Igual |
| `nationalStats`, `statsByFuel`, `statsByProvince`, `priceDistribution`, `zoneAverage`, `zoneComparison`, `resolvePlace` | Servidor (sin alternativa local) | Igual |

Una petición «sin red» se detecta como un `fetch` que falla: el error se marca con `status = 0` (`isOffline`).

## Evitar cargas repetidas

- Una sola carga de lista a la vez (`state.stationsLoading`). Si llega otra idéntica (misma clave) mientras carga, se ignora; si es distinta, queda **una** pendiente que se lanza al terminar.
- Un solo cálculo de ruta a la vez (`calculating`).
- La ficha de una gasolinera ignora pulsaciones repetidas sobre la misma mientras se abre (`state.modalLoadingId`).
- El mapa aplaza 300 ms (`scheduleBboxLoad`) y cancela la petición anterior con `AbortController`.
