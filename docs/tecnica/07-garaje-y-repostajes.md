# 07 · Garaje y repostajes

## Almacenamiento local (`GarageStore`)

Base IndexedDB `gasolinera-garage`, versión 1, con cuatro almacenes:

| Almacén | Clave | Índices | Contenido |
|---|---|---|---|
| `vehicles` | `id` | — | Coches |
| `refuels` | `id` | `vehicleId` | Repostajes |
| `trips` | `id` | `vehicleId`, `startedAt` | Viajes grabados |
| `settings` | `key` | — | Ajustes sueltos (`activeVehicleId`, viaje web en curso…) |

Detalles de implementación:
- `open()` abre una sola vez (`dbPromise`) y se cierra si otra pestaña actualiza la versión (`onversionchange`).
- `migrate(db, oldVersion)` crea los almacenes al pasar de la versión 0 a la 1. Para cambiar el esquema hay que subir `DB_VERSION` y añadir un `if (oldVersion < N)`.
- `put` pide almacenamiento persistente (`navigator.storage.persist`) la primera vez, para que el navegador no lo borre por falta de espacio.
- `newId()` usa `crypto.randomUUID` o, si no existe, un identificador aleatorio.
- `deleteVehicle` borra en **una sola transacción** el coche, sus repostajes y sus viajes.
- Las funciones devuelven promesas envolviendo las peticiones de IndexedDB (`wrap`).

### Modelo de datos

**Coche (`vehicles`)**

| Campo | Tipo | Notas |
|---|---|---|
| `id` | texto | UUID |
| `name` | texto | Nombre libre |
| `fuel` | texto | Identificador de carburante (`gasoleo_a`…), cualquiera de los de `config/fuels.json`, es decir, de los **tres países** (en la importación solo se exige que sea un identificador válido: `FUEL_PATTERN`). El AdBlue y el GNC en €/m³ (`gnc_m3`) no se ofrecen. El coche no está atado al país: se puede tener un coche de gasóleo y repostar en España, Portugal y Francia |
| `tankCapacity` | número | 5–300 |
| `homologated` | número | Consumo homologado, 1–40 por 100 km |
| `odometer`, `odometerAt` | número, ISO | Última lectura del cuentakilómetros y cuándo se puso |
| `createdAt`, `updatedAt` | ISO | |

**Repostaje (`refuels`)**

| Campo | Notas |
|---|---|
| `id`, `vehicleId`, `createdAt`, `updatedAt` | |
| `date` | ISO UTC de la fecha y hora del repostaje |
| `odometer` | km del cuentakilómetros (entero) |
| `liters`, `pricePerUnit`, `total` | Litros (o kilos), precio por unidad y total pagado |
| `full` | `true` si se llenó el depósito |
| `missedBefore` | `true` si se saltó anotar un repostaje anterior |
| `stationId`, `stationName`, `stationLat`, `stationLon` | Gasolinera; todo `null` si no se indicó |
| `pais` | País del repostaje: `es`, `pt` o `fr` (`GarageStore` lo normaliza a `es` si falta o no es válido). Es el que decide con qué media se compara (ver [06](06-calculos.md)) |
| `nationalAvg`, `zoneAvg`, `zoneRadiusKm` | Medias del día guardadas al anotar (o `null`) |

**Viaje (`trips`)**: `id`, `vehicleId`, `auto`, `startedAt`, `endedAt`, `metrics` (ver [06](06-calculos.md)), `track` (puntos aligerados `[t, lat, lon, km/h]`), `createdAt`.

**País del repostaje (`pais`).** Se fija en `applyStation`: es el país de la gasolinera elegida (`station.pais`) y, sin gasolinera, el país abierto en la app (`GPCountry.code`). Al editar un repostaje ya guardado se conserva su país si la gasolinera sigue siendo la misma, o si se le quita la gasolinera. El campo se añadió sin cambiar el esquema de IndexedDB (`DB_VERSION` sigue en 1): los repostajes anteriores no lo tienen y se tratan como `es`.

**Copia de seguridad** (`GPBackup`, `GarageStore.exportAll/importAll`): JSON con `format: "gasolinera-plus-backup"`, `schema` (el de `DB_VERSION`, hoy 1), `exportedAt`, los cuatro almacenes y `extra`. El fichero se llama `gasolinera-plus-copia-AAAA-MM-DD.json`. `extra` lleva las listas de `localStorage` de los **tres países**:

| Clave de `extra` | Origen en `localStorage` | Contenido |
|---|---|---|
| `favorites` | `gasolinera_favorites` | Favoritas de España |
| `favoritesPt` | `gasolinera_favorites_pt` | Favoritas de Portugal |
| `favoritesFr` | `gasolinera_favorites_fr` | Favoritas de Francia |
| `compare` | `gasolinera_compare` | Comparador (una sola lista, la de España) |

Cada favorita guarda `ideess`, `rotulo`, `direccion` y, si lo tiene, `municipio`. La importación **añade y sobrescribe por clave** (`put`), no borra lo existente; las favoritas y el comparador se fusionan sin duplicar por `ideess` dentro de la lista de cada país (`mergeLocalList`), y se descartan los identificadores con caracteres no válidos o de más de 20. Una copia hecha con una versión anterior, sin `favoritesPt` ni `favoritesFr`, se importa igual (esas listas faltan y no se toca nada). Si el fichero es de un esquema más nuevo, se rechaza. En la app nativa se escribe en caché y se abre el menú de compartir; en web se descarga.

## Carga y estado (`GPGarage`)

- `load()` lee los coches (ordenados por creación), decide el coche activo (`activeVehicleId`, o el primero si el guardado ya no existe) y carga **solo los repostajes del coche activo**.
- `refresh()` = `load()` + `render()`.
- `render()` muestra el estado vacío («Añadir mi coche») o la ficha: chips de coches, resumen, repostajes, gráficos.
- Cambiar de coche (`setActive`) guarda `activeVehicleId`, recarga y anuncia el coche activo (`gp:vehicle-active`), lo que hace que la pestaña de precios cambie su filtro de carburante (`useVehicleFuel`). Ese filtro solo contiene los carburantes principales del país abierto, así que si el carburante del coche no es uno de ellos (por ejemplo un E10 en Portugal), el filtro se queda como estaba.

### Alta y edición de coches

`saveVehicle` valida nombre no vacío, depósito 5–300, consumo 1–40, km ≥ 0. Al editar, `odometerAt` se actualiza a ahora. Si se llegó pulsando «Repostar aquí» sin coche (`pendingStation`), al terminar se abre el asistente con esa gasolinera.

### Actualizar km

`saveOdometer` (diálogo «Actualizar km») fija la lectura del cuentakilómetros del coche y la hora (`odometerAt`).

## Asistente de repostaje

Es un diálogo (`refuel-dialog`) con siete paneles `<section class="refuel-step" data-step="...">` de los que solo se ve uno. `setStep(n)` controla la visibilidad y los botones.

### Pasos

| `data-step` | Panel | Botones visibles |
|---|---|---|
| 1 | Buscar gasolinera (opcional) | Seguir sin nombre / Siguiente, Cancelar |
| 2 | Fecha y hora, precio | Atrás, Siguiente, Cancelar |
| 3 | Total pagado | Atrás, Siguiente, Cancelar |
| 4 | Confirmar litros | «Sí, es correcto», «No, editar», Atrás, Cancelar |
| 4.5 | Editar litros | OK, Atrás (los del panel) |
| 5 | Kilómetros | Atrás, Siguiente, Cancelar |
| 5.5 | Revisa los kilómetros | «Sí, son correctos», Corregir |
| 6 | Comprobación final: resumen, depósito lleno, saltado | Atrás, Guardar, Cancelar |
| 7 | «Repostaje guardado» | Cerrar |

Los pasos 4.5 y 5.5 son pantallas laterales: no cambian el número mostrado («Paso 4 de 6», «Paso 5 de 6»).

### Reglas de navegación

- `nextStep` valida el paso actual (`stepError`): fecha válida y precio > 0 en el 2; total > 0 en el 3; litros > 0 en el 4; km no vacío en el 5. Al salir del 3 recalcula los litros.
- Al salir del 5 llama a `kmWarning`; si devuelve texto, va al 5.5 en lugar del 6.
- Entrar en el 4 solo prepara el texto de confirmación (`prepareLitersStep`); **no recalcula** litros, así una edición se conserva al pasar de un panel a otro. El recálculo ocurre al salir del paso 3, por lo que volver atrás y cambiar el total o el precio renueva los litros.
- Entrar en el 5 propone los km estimados (`prepareOdometerStep`) salvo que el usuario ya los haya escrito (`kmTouched`).
- Entrar en el 6: `checkFullTank`, `updateMissedHint`, `renderReview`.
- Si se elige gasolinera en el paso 1 (`pickStation`), salta directo al 2.
- **Enter** en un campo no envía: el envío del formulario avanza de paso mientras no se esté en el 6.
- **Cancelar** cierra el diálogo en cualquier paso menos el 7.

### Modo edición

Si se abre un repostaje ya guardado (`openRefuelDialog(refuel, null)`), `state.wizardAll = true` y se muestran a la vez todos los paneles 1–6 (salvo el 4 de confirmación y el 5.5), con los botones Borrar, Cancelar y Guardar. Al guardar, si algo de los km no cuadra (`kmWarning`), se pide confirmación con `window.confirm` (el paso 5.5 no existe en este modo).

### Guardado (`saveRefuel`)

1. Avanza de paso si aún no se está en el 6.
2. Ignora un segundo envío mientras guarda (`savingRefuel`).
3. Valida: fecha correcta, litros/precio/total > 0, km ≥ 0, litros ≤ capacidad × 1,15.
4. En edición confirma avisos de km.
5. `checkFullTank()` por última vez.
6. Construye el registro (`applyStation` copia la gasolinera y su país), añade las medias del día (`attachReferences`) y guarda.
7. Sube el odómetro del coche si el del repostaje es mayor (`odometerAt` = ahora).
8. Recarga el garaje y muestra el panel 7 con el resumen (o cierra con aviso en edición).

### Sugerencias de gasolinera

Las sugerencias son del **país abierto en la app**: las favoritas de ese país (`GPCountry.storageKey('gasolinera_favorites')`) y las búsquedas a la API de ese país. Para anotar un repostaje en otro país hay que abrir ese país en el selector de la cabecera. Al abrir el campo (sin texto o con menos de 3 letras) aparecen las **favoritas** y las **cercanas** (hasta 25 km, 15 resultados), ordenadas: favoritas que están cerca (por distancia), resto de favoritas, y cercanas. Con 3 o más letras se busca por texto con hasta 25 resultados, ordenados por cercanía si hay ubicación (la ubicación viene de la app o se pide al dispositivo con un tiempo máximo de 4 s). La lista se muestra encima del campo para que no la tape el teclado.

## Carga de secciones y otros detalles

- La sección Coche llama a `GPSectionLoading.track('garage', ...)` al dibujar gráficos; si tarda más de 200 ms aparece «Cargando…».
- `setMetric` escribe un valor con su unidad en pequeño (`<small class="metric-unit">`) para que las cifras largas quepan en móvil.
- `replaceChart` destruye el gráfico anterior antes de crear el nuevo (Chart.js no admite reutilizar un lienzo).
