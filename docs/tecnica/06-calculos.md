# 06 · Cálculos

Todas las fórmulas de la aplicación. Las funciones puras están en `fuel-math.js`, `price-index-core.js` y `trip-metrics.js` y tienen pruebas unitarias en `tests/`. Otras fórmulas viven dentro de `garage.js`, `route.js` y `recap.js`.

## Convenciones

- **Fechas de repostaje:** se guardan en ISO UTC. Para agrupar por día o mes se convierten siempre a la zona `Europe/Madrid` (`GPFuel.madridDate` con `Intl.DateTimeFormat('en-CA', timeZone: 'Europe/Madrid')`). Un repostaje a las 00:30 de un 1 de octubre cae en octubre aunque en UTC sea septiembre. Esto vale también para los repostajes hechos en Portugal o Francia: el día de un repostaje es el de Madrid, no el de la hora local de la gasolinera, y con ese día se busca la media de su país.
- **Litros, kilos y m³:** la unidad de cada carburante sale de `config/fuels.json` (`unit`) y `AlertsStore.unitFor(slug)` la da (en realidad delega en `GPCountry.fuelUnit`). Los carburantes en kilos (GNC, GNL, hidrógeno, biogás…) hablan de kilos; el GNC de Portugal que su fuente publica en €/m³ es un carburante aparte, `gnc_m3` (unidad `m3`, texto «€/m³»), que solo se ve como precio de gasolinera (alertas, fichas): no se ofrece como carburante del coche (`fillFuelSelect(…, 'all', ['adblue', 'gnc_m3'])`) y la app no convierte entre m³, kg y litros.
- **Moneda:** los tres países usan euros, así que no hay conversión; el cálculo del consumo y de los gastos no depende del país.
- **Importes:** euros con dos decimales; precios por litro con tres.

## Consumo: método «lleno a lleno» (`GPFuel.intervals`)

El consumo real solo se puede medir entre dos repostajes con el depósito lleno: lo que entra en el segundo lleno es lo gastado desde el primero.

Algoritmo, con los repostajes ordenados por **kilómetros** (y a igualdad, por fecha):

```
ancla = ninguna; litros = 0; coste = 0
para cada repostaje r:
    si r.missedBefore:            # me salté anotar uno antes de este
        ancla = ninguna; litros = 0; coste = 0
    si hay ancla:
        litros += r.liters; coste += r.total
    si r no es lleno: continuar
    si hay ancla:
        km = r.odometer - ancla.odometer
        si km > 0:
            lPer100 = litros / km * 100
            guardar tramo { desde ancla.date, hasta r.date, km, litros, coste, lPer100,
                            sospechoso = lPer100 < 1,5  o  lPer100 > 40 }
    ancla = r; litros = 0; coste = 0
```

Un repostaje **parcial** suma litros al tramo pero no lo cierra. Un repostaje marcado `missedBefore` corta el tramo: no se sabe cuánto combustible entró en medio. Los tramos con consumo fuera de 1,5–40 l/100 km se marcan `suspicious` y no cuentan en las medias.

## Resumen del coche (`GPFuel.summary`)

Con los tramos válidos:

```
km = suma de km de los tramos válidos
consumoMedio = suma litros / km * 100        (si km > 0; origen "real")
             = vehicle.homologated            (si no; origen "homologated")
costeKm = suma coste / km                     (o nada si km = 0)
gastoTotal, litrosTotales = suma de todos los repostajes
odometro = max(odómetro del coche, odómetro del último repostaje)
```

El consumo medio es una media **ponderada por kilómetros**, no la media de los porcentajes de cada tramo.

### Depósito estimado (`estimateTank`)

Simula el nivel repostaje a repostaje:

```
nivel = desconocido
para cada repostaje r, con previo:
    si nivel conocido: nivel = max(0, nivel - (r.odometer - previo.odometer) * consumo / 100)
    si r es lleno: nivel = capacidad
    si no y nivel conocido: nivel = min(capacidad, nivel + r.liters)
tras el último: nivel -= (odómetroActual - último.odometer) * consumo / 100
resultado = limitar(nivel, 0, capacidad)
```

**Punto de partida:** el coche puede guardar `startLevel` (porcentaje del depósito), `startOdometer` y `startAt` cuando el usuario indica cuánto combustible tiene al crearlo o editarlo. Si no hay ningún lleno posterior a `startAt`, el cálculo arranca de ahí (`nivel = capacidad * startLevel / 100`, `previo.odometer = startOdometer`) y solo cuentan los repostajes posteriores a `startAt`. Un lleno posterior sustituye al punto de partida.

Si no hay ni punto de partida ni lleno, el nivel es desconocido y la pantalla pide indicar uno. Al terminar el asistente de repostaje se muestra el nivel resultante (`~N %`, litros sobre capacidad) o `100 %` si se marcó lleno.


```
tankPercent = nivel / capacidad * 100
autonomyKm  = nivel / consumoMedio * 100
```

Colores de la barra: `< 15 %` rojo (`low`), `< 35 %` naranja (`mid`), resto ámbar (`ok`).

### Margen del consumo real

El consumo solo es real entre llenados completos; los repostajes parciales intermedios se suman a los litros del tramo. Como el «clic» del surtidor varía, se asume un error de `CLICK_ERROR_L = 2` litros por cadena de tramos consecutivos: `margen = 2 × cadenas × 100 / km` en L/100 km, y la pantalla lo muestra como `±`. Si no hay dos llenos, se usa el consumo homologado y no se estima nada. Con 3 repostajes parciales seguidos (`FULL_HINT_AFTER`), el asistente sugiere llenar hasta el primer clic (`updateFullHint`).

### Gasto mensual (`monthlySpend`)

Suma `total` de cada repostaje por mes de `Europe/Madrid` (`AAAA-MM`), redondeado a 2 decimales y ordenado por mes. El indicador «Gasto este mes» toma la clave del mes actual.

## Asistente de repostaje: cálculos y validaciones

### Precio del día (`updateDayPrice`)

Al elegir gasolinera o cambiar la fecha se propone un precio, salvo que el usuario ya haya escrito el suyo (`priceTouched`):

1. Si hay gasolinera y la fecha es **hoy** (día de Madrid): precio actual de esa gasolinera para el carburante del coche (de la lista o pidiendo la ficha).
2. Si no, y hay índice de precios: **media de la zona** de la gasolinera (radio 10 km) de ese día o, si no hay dato de zona, la **media del país de la gasolinera** («Precio medio de ese día en Portugal»). Si el día exacto no está, se acepta hasta 3 días atrás (`nearestDay`). El país es el de la gasolinera elegida (`station.pais`) o, sin gasolinera, el país abierto en la app.
3. Si nada de eso existe: se pide al usuario.

### Total, precio y litros

- Al salir del paso del total: `litros = total / precio` (2 decimales).
- Escribir litros recalcula `total = litros × precio`; escribir el total recalcula litros.
- El paso de litros muestra el valor bloqueado con «¿Es correcto?». «No, editar» abre una página de edición; **Atrás** restaura litros y total a como estaban al entrar; **OK** conserva el cambio.

### Depósito lleno coherente (`checkFullTank`)

Si «He llenado el depósito» está marcado y los litros son menos del **25 %** de la capacidad, se desmarca solo y se avisa: no se puede llenar el depósito con tan poco combustible sin que el consumo salga falseado. Se ejecuta al cambiar los litros, al cambiar la casilla, al abrir la comprobación y al guardar.

Al guardar, además: `litros ≤ capacidad × 1,15` (margen del 15 % por depósitos que admiten más de lo nominal); si no, error.

### Kilómetros estimados y avisos

Ritmo de uso (`usualKmPerDay`):

```
ordenar los repostajes del coche por fecha
dias = (fecha último - fecha primero) / 1 día
si hay < 2 repostajes, o dias < 7, o km último <= km primero: sin ritmo
km/día = (km último - km primero) / dias
```

Base para estimar (`odometerBase`): el último repostaje anterior a la fecha; y si el odómetro del coche se actualizó después (por un viaje o «Actualizar km») y antes de la fecha, esa lectura.

```
estimado = base.km + km/día * dias desde la base
```

Sugerencia: el paso de kilómetros se rellena con el estimado, con la nota «Calculado según tu ritmo…». Si el usuario lo edita, se respeta.

Avisos (`kmWarning`, no bloquean; piden confirmar en una pantalla «Revisa los kilómetros» o con un `confirm` al editar):

| Condición | Mensaje |
|---|---|
| km menores que la base | «Son menos km que en tu anterior anotación» |
| km mayores que el repostaje siguiente (fecha posterior) | «Son más km que en tu repostaje siguiente» |
| `km − base > max(3 × esperado, 800)` (o `> 3000` sin ritmo) | «Son N km más que en tu anterior anotación. Por tu ritmo esperaba unos M km» |
| Sin base y `km > 1.000.000` | «Es una cifra muy alta para un cuentakilómetros» |

### Repostaje saltado (`updateMissedHint`)

En la comprobación final se compara `km desde el repostaje anterior` con lo que da **un depósito entero** (`GPFuel.fullTankRangeKm`: `capacidad / consumo × 100`, con el consumo medido o, si aún no hay, `homologado` o 7). Si `km > rango × 1,25`, se marca automáticamente «falta algún repostaje» (con cifras), lo que corta el tramo del consumo. Antes se comparaba con la autonomía que quedaba en el depósito, y marcaba tramos normales; `GPFuel.falseMissedFlags` detecta esas marcas y `clearFalseMissedFlags` (garage.js) las quita al cargar. En caso contrario la casilla no se muestra y queda sin marcar. Al editar un repostaje ya guardado la casilla siempre se ve.

## Comparación con la media

Cada repostaje se compara con la media **de su propio país**, no con la de España. El país se guarda en el repostaje (campo `pais`: `es`, `pt` o `fr`, ver [07](07-garaje-y-repostajes.md)) y `refuelCountry` lo lee, con `es` por defecto en los repostajes antiguos. La media es la del **carburante del coche** en ese país. Como el coche puede usar cualquier carburante de los tres países, si el país del repostaje no publica la media de ese carburante (por ejemplo, AdBlue, o un carburante que su índice no recoge), la referencia queda a `null` y ese repostaje no entra en el ahorro.

### Histórico oficial de 400 días

Las medias salen del índice de precios (`GPPriceIndex`), que existe por país y cubre 400 días (`INDEX_DEFAULT_DAYS = 400`; el flujo `price-index.yml` lo regenera cada día con un generador por país y publica un fichero JSON por mes en una release propia):

| País | Release / carpeta local | Generador | Contenido |
|---|---|---|---|
| España | `price-index` | `scripts/build-price-index.php` | Nacional, provincia y celdas de 0,1°. Carburantes: `gasoleo_a`, `gasolina_95_e5`, `gasoleo_premium`, `gasolina_98_e5`, `glp` |
| Portugal | `price-index-pt` | `scripts/build-price-index-pt.php` | Media **nacional** de la DGEG (API PMD). Sin provincias ni celdas: no hay media de zona. Mismos cinco carburantes que España |
| Francia | `price-index-fr` | `scripts/build-price-index-fr.php` | Nacional, departamento y celdas, desde los ficheros anuales oficiales. `gasoleo_a`, `gasolina_95_e5`, `gasolina_98_e5`, `glp`, `gasolina_95_e10` y `gasolina_95_e85` |

En la app, `GPPriceIndex` guarda cada país en su carpeta (`price-index`, `price-index-pt`, `price-index-fr`) y recuerda su sincronización por separado (`gp_price_index_sync`, `…_pt`, `…_fr`). La sincronización (`sync`) se hace para el **país que está abierto** y como mucho cada 6 h (`SYNC_EVERY_MS`); España trae además una copia inicial dentro de la app (`data/price-index-seed`) y Portugal y Francia se descargan la primera vez que se abre ese país. `ensureMonth` solo carga los meses de un país que ya se hayan sincronizado, así que la referencia de un país que nunca se ha abierto en el móvil cae a la serie del servidor. Todas las funciones de referencia (`dayReference`, `periodReference`) reciben el país (`country`, por defecto `es`) y usan el índice de ese país.

### Referencias por repostaje

Al guardar, `attachReferences` intenta guardar dentro del repostaje la **media nacional del país del repostaje** (`nationalAvg`; el nombre del campo no ha cambiado) y la de **la zona** (`zoneAvg`, `zoneRadiusKm`) de ese día, con un tope de 5 s (`REFERENCE_TIMEOUT_MS`). Orden de fuentes:

1. Índice de precios local del país (`GPPriceIndex.dayReference`), disponible solo en la app.
2. Serie nacional del servidor de ese país (`nationalByDate` → `/stats/national`, con el país en la petición).
3. Media de zona del servidor de ese país (`/stats/zone-average`), solo si hay coordenadas de la gasolinera.

Si no se consigue, quedan a `null` y se vuelve a intentar al dibujar (`refuelReferences`). En Portugal la media de zona del índice local no existe (solo hay media nacional), así que depende del servidor.

### Medias del índice (`GPPriceIndexCore.average`)

Para un carburante, un conjunto de fechas y un ámbito (nacional, provincia o lista de celdas):

```
para cada fecha con datos:
    para cada cubo del ámbito con muestras > 0:
        suma += cubo[2*i]         # milésimas
        cuenta += cubo[2*i + 1]
media = suma / cuenta / 1000
```

Devuelve `{ avg, samples, days }` o nulo. Es una media ponderada por número de gasolineras.

### Celdas de una zona (`cellsAround`)

La zona de un punto con radio 10 km es el conjunto de celdas de 0,1° cuyo **centro** está a ≤ radio del punto (Haversine), más la celda del propio punto. No es un círculo exacto, es una aproximación por celdas.

### Por repostaje, semana o mes

- **Por repostaje:** cada punto es el precio pagado frente a la media de ese día en el país del repostaje (`dayRows`; cada fila lleva su país en `countries`).
- **Por semana / por mes:** los repostajes se agrupan por periodo (`periodOf`; semana de lunes a domingo con numeración ISO por el jueves; mes natural). Últimos `MAX_PERIODS = 12`.
  - Precio pagado del periodo = `Σ(precio × litros) / Σ litros`.
  - Los repostajes del periodo se separan por país (`byCountry`). Para cada país:
    - Media nacional del país = media del índice de ese país sobre **todas las fechas** del periodo.
    - Media de zona = media del índice por cada gasolinera donde se repostó en ese país, sobre las fechas del periodo.
  - Media nacional del periodo = media de las medias de cada país **ponderada por los litros repostados en cada país**. Media de zona del periodo = media **ponderada por litros** de la media de zona de cada gasolinera.
  - Si el índice no da la referencia de un país, se usan las medias que se guardaron en esos repostajes (`nationalAvg`, `zoneAvg`), también ponderadas por litros.
- **Semana y mes solo funcionan en la app** (necesitan el índice local); en web se muestra un aviso.

### Ahorro (`GPFuel.savingsBy`)

```
importe = Σ (referencia − precioPagado) × litros    (solo repostajes con referencia)
```

Positivo = ahorro. Si es negativo, el texto dice «Vas unos X € por encima de la media…». Se calcula por separado frente a la media del país y frente a la zona.

Texto del ahorro (`drawComparison`):
- Con repostajes de **un solo país**: «…ahorrados unos X € frente a la media de {país} en N repostajes», con el nombre del país en el idioma de la app (`GPCountry.countryName`). La leyenda de la gráfica pasa a «Media de {país}».
- Con repostajes de **varios países** en las filas mostradas: no se suma todo en una cifra, sino una frase por país («En Portugal: X € menos que la media (N repostajes). En Francia: …», con `savingsBy` sobre las filas de ese país), y la leyenda queda como «Media del país». Una fila de semana o mes con repostajes de varios países muestra los países juntos («España + Francia»).
- Las diferencias por periodo se escriben con la unidad del carburante del coche: €/L, €/kg o €/m³.

## Resumen tipo recap (`GPRecap`)

Filtra los repostajes del coche por periodo (mes actual, año actual o todos, en fecha de Madrid) y calcula:

- Gasto total y número de repostajes; litros; precio medio = `Σ total / Σ litros`.
- Kilómetros recorridos = cuentakilómetros actual − cuentakilómetros al empezar el periodo (`odometerAtStart`). Ese valor se reparte en línea recta, según los días, entre el repostaje anterior al periodo y el primero del periodo; si no hay anterior, se parte del primero. Con un solo repostaje también sale. Si los viajes grabados del periodo suman más, se enseña esa cifra (cada una es un mínimo).
- Consumo medio y coste por km: depósitos completos que se cierran dentro del periodo (`GPFuel.intervals` sobre todos los repostajes del coche), aunque el depósito anterior se llenara el mes pasado.
- Repostaje más barato (por precio unitario) y su gasolinera.
- Gasolinera más repetida, con el número de veces y su precio medio (`Σ total / Σ litros` de esa gasolinera). Los repostajes sin gasolinera cuentan en los totales pero no aquí.
- Frente a la media del país = `Σ (nationalAvg − precio) × litros` de los repostajes que la tienen guardada, **agrupados por el país de cada repostaje** (`versusByCountry`). El resumen muestra una fila por país («Frente a la media de España», «…de Portugal», «…de Francia»), con «Ahorras X €», «Pagas X € de más» o «Justo en la media» (umbral de ±0,01 €).

La imagen es un lienzo de 1080×1920 dibujado con `<canvas>`. El PDF es una página de 595 pt de ancho que contiene esa imagen en JPEG (`pdfFromJpeg` escribe el PDF a mano: catálogo, páginas, página, imagen con filtro `DCTDecode`, contenido y tabla de referencias cruzadas).

## Métricas de un viaje (`GPTripMetrics.compute`)

Entrada: puntos GPS `{ t (ms), lat, lon, acc (m), speed (m/s o nulo) }`.

1. **Limpieza (`clean`):** ordena por tiempo; descarta tiempos repetidos, precisión peor de 25 m y saltos con velocidad implícita > 70 m/s (252 km/h).
2. **Velocidades:** la del GPS si existe; si no, distancia/tiempo entre puntos vecinos. Se suavizan con una media móvil de ±2 puntos.
3. **Movimiento:** un tramo cuenta si la velocidad en alguno de sus extremos es ≥ 1,4 m/s. Si entre dos puntos válidos pasan más de 8 s (túnel, garaje, cobertura perdida), el tramo se mide con su **velocidad media real** (distancia en línea recta / tiempo transcurrido) en lugar de la de los extremos, cuenta como movimiento solo si esa media es ≥ 1,4 m/s y se acumula en `gapSeconds`. La distancia en línea recta subestima ligeramente un túnel curvo. Se acumulan metros y segundos en movimiento; tiempo parado = duración − movimiento.
4. **Velocidad media** = metros en movimiento / segundos en movimiento. **Máxima** = velocidad suavizada máxima.
5. **Franjas de velocidad:** segundos y metros en `0, 30, 50, 80, 100, 120 km/h`. Porcentaje del tiempo por encima de 100 y de 120.
6. **Consumo estimado:**
   - Factor de velocidad = media de los factores por franja ponderada por metros, con `BAND_FACTORS = [1,45; 1,10; 0,90; 0,95; 1,15; 1,40]` (más consumo en ciudad lenta y en autopista rápida, mínimo hacia 50–80 km/h).
   - `relativo = limitar(factorViaje / factorReferencia, 0,7, 1,5)`; si no hay referencia, 1.
   - `litros = km × consumoMedio × relativo / 100` y `coste = litros × último precio pagado`.
   - `factorReferencia` = factor medio ponderado por km de los viajes anteriores del coche, solo si hay al menos 3 viajes y 30 km (`referenceFactorFor` en `trips.js`); así el consumo del viaje se expresa **relativo al estilo habitual del conductor**.
9. `lowQuality` si se conservan menos de la mitad de los puntos.

### Aligerado del recorrido (`thin`)

Para guardar el trazado sin ocupar mucho, se conserva un punto si: es el primero o el último, pasaron ≥ 5 s desde el último guardado, hay un giro ≥ 20° (con ≥ 10 m recorridos), o la velocidad cambió ≥ 10 km/h. Cada punto se guarda como `[t, lat, lon, km/h]`.

### Al guardar un viaje (`saveTrip`)

- Un viaje **automático** de menos de 0,5 km se descarta.
- El odómetro del coche sube en `distanceKm` (`shiftOdometer`).

## Avisos de precio (`checkPrices`)

Para cada favorita se consulta la ficha y se comparan sus precios con los guardados la última vez. Hay aviso si algún carburante **baja al menos el mínimo elegido** (1, 2, 3, 5 o 10 céntimos; por defecto 0,03 €, guardado como `alertThreshold`) y, si se marca `alertRises`, también si **sube** otro tanto. El precio de referencia solo se actualiza cuando el cambio llega al mínimo, de modo que varias variaciones pequeñas seguidas acaban avisando cuando suman lo bastante (`AlertsStore.compare`). El texto lista hasta 3 carburantes: «Gasóleo A: 1,459 → 1,449». El mismo algoritmo existe en `alerts-store.js` (primer plano) y en `runners/alerts.js` (segundo plano, cada 720 minutos).

**Favoritas de los tres países.** La lista que se vigila es la de los tres países a la vez (`allFavorites` en `app.js`): cada favorita lleva su `pais`. La ficha se pide a la API de su país (`/api/stations/<id>?pais=pt`), y el precio guardado se identifica con la clave `pt:<id>` o `fr:<id>` (las de España conservan la clave `<id>`), para que un mismo identificador de dos países no se mezcle. Los precios con unidad (kg, m³) se escriben con su unidad (`€/kg`, `€/m³`; `AlertsStore.priceText` en la app y `priceText` en el ejecutor).

**Idioma de los avisos.** El título («{gasolinera} ha bajado de precio») y los nombres de los carburantes salen en el idioma de la app (`GPCountry.tr`, `GPCountry.fuelLabel`). El ejecutor de segundo plano no puede leer el diccionario, así que la app se lo manda ya traducido en cada sincronización (`GPBackground.syncAlerts`: `labels` con el nombre de cada carburante y `texts` con las tres frases `changed`, `down` y `up`, además del umbral y de si se avisa de las subidas); el ejecutor usa esos textos y, si faltan, el castellano. El Service Worker de la web (`sw.js`) carga `alerts-store.js` sin el módulo de idioma, por lo que los avisos con la web cerrada pueden salir en castellano.

## Tendencias

`up` cuando el precio de hoy supera al del día anterior en más de 0,0005 €, `down` cuando es menor, `same` en caso contrario.
