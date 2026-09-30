# 06 · Cálculos

Todas las fórmulas de la aplicación. Las funciones puras están en `fuel-math.js`, `price-index-core.js` y `trip-metrics.js` y tienen pruebas unitarias en `tests/`. Otras fórmulas viven dentro de `garage.js`, `route.js` y `recap.js`.

## Convenciones

- **Fechas de repostaje:** se guardan en ISO UTC. Para agrupar por día o mes se convierten siempre a la zona `Europe/Madrid` (`GPFuel.madridDate` con `Intl.DateTimeFormat('en-CA', timeZone: 'Europe/Madrid')`). Un repostaje a las 00:30 de un 1 de octubre cae en octubre aunque en UTC sea septiembre.
- **Litros y kilos:** para carburantes en kilos (GNC, GNL, hidrógeno, biogás…) la app habla de kilos. `AlertsStore.unitFor(slug)` da la unidad.
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
2. Si no, y hay índice de precios: **media de la zona** de la gasolinera (radio 10 km) de ese día o, si no hay dato de zona, la **media de España**. Si el día exacto no está, se acepta hasta 3 días atrás (`nearestDay`).
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

En la comprobación final se compara `km desde el repostaje anterior` con la **autonomía** (autonomía estimada del garaje o, si no hay, `capacidad / (homologado o 7) × 100`). Si `km > autonomía × 1,25`, se marca automáticamente «falta algún repostaje» (con cifras), lo que corta el tramo del consumo. En caso contrario la casilla no se muestra y queda sin marcar. Al editar un repostaje ya guardado la casilla siempre se ve.

## Comparación con la media

### Referencias por repostaje

Al guardar, `attachReferences` intenta guardar dentro del repostaje la **media de España** (`nationalAvg`) y la de **la zona** (`zoneAvg`, `zoneRadiusKm`) de ese día, con un tope de 5 s (`REFERENCE_TIMEOUT_MS`). Orden de fuentes:

1. Índice de precios local (`GPPriceIndex.dayReference`), disponible solo en la app.
2. Serie nacional del servidor (`nationalByDate`).
3. Media de zona del servidor (`/stats/zone-average`), solo si hay coordenadas de la gasolinera.

Si no se consigue, quedan a `null` y se vuelve a intentar al dibujar (`refuelReferences`).

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

- **Por repostaje:** cada punto es el precio pagado frente a la media de ese día.
- **Por semana / por mes:** los repostajes se agrupan por periodo (`periodOf`; semana de lunes a domingo con numeración ISO por el jueves; mes natural). Últimos `MAX_PERIODS = 12`.
  - Precio pagado del periodo = `Σ(precio × litros) / Σ litros`.
  - Media nacional del periodo = media del índice sobre **todas las fechas** del periodo.
  - Media de zona del periodo = media **ponderada por litros** de la media de zona de cada gasolinera donde se repostó (cada una calculada sobre las fechas del periodo).
- **Semana y mes solo funcionan en la app** (necesitan el índice local); en web se muestra un aviso.

### Ahorro (`GPFuel.savingsBy`)

```
importe = Σ (referencia − precioPagado) × litros    (solo repostajes con referencia)
```

Positivo = ahorro. Si es negativo, el texto dice «Vas unos X € por encima de la media…». Se calcula por separado frente a España y frente a la zona.

## Resumen tipo recap (`GPRecap`)

Filtra los repostajes del coche por periodo (mes actual, año actual o todos, en fecha de Madrid) y calcula:

- Gasto total y número de repostajes; litros; precio medio = `Σ total / Σ litros`.
- Kilómetros recorridos = km del último − km del primero (con ≥ 2 repostajes). Consumo medio y coste por km desde `GPFuel.summary` sobre esos repostajes, si hay tramos medidos.
- Repostaje más barato (por precio unitario) y su gasolinera.
- Gasolinera más repetida, con el número de veces y su precio medio (`Σ total / Σ litros` de esa gasolinera). Los repostajes sin gasolinera cuentan en los totales pero no aquí.
- Frente a la media de España = `Σ (nationalAvg − precio) × litros` de los repostajes que la tienen guardada.

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

Para cada favorita se consulta la ficha y se comparan sus precios con los guardados la última vez. Hay aviso si algún carburante **baja al menos 0,002 €** (`MIN_DROP`). El texto lista hasta 3 carburantes: «Gasóleo A: 1,459 → 1,449». El mismo algoritmo existe en `alerts-store.js` (primer plano) y en `runners/alerts.js` (segundo plano, cada 720 minutos).

## Tendencias

`up` cuando el precio de hoy supera al del día anterior en más de 0,0005 €, `down` cuando es menor, `same` en caso contrario.
