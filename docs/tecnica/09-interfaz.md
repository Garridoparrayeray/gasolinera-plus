# 09 · Interfaz

## Estructura de la página

`api/shell.php` genera un único HTML. Contiene:

- Pantalla de carga (`.splash`), cabecera, avisos (`update-banner`, `offline-banner`), diálogo de permiso de ubicación (`geo-ask`).
- **Seis vistas** (`<section id="view-...">`), de las que solo se muestra una (o dos: lista y mapa se ven juntas): `list`, `map`, `route`, `garage`, `stats`, `about`.
- **Barra de navegación** (`view-toggle`) con cinco botones: Listado, Ruta, Coche, Estad., Info. En pantallas de ordenador se muestra abajo igual que en móvil; los rótulos largos cambian a cortos con CSS (`.tab-long/.tab-short`).
- Diálogos modales (`<dialog>`): ficha de gasolinera, favoritas, comparador, aviso legal, coche, repostaje, cuentakilómetros, resumen de viaje, detalle de viaje.
- Pantalla de viaje en curso (`trip-drive`) y chip «EN CURSO».

`switchView(vista)` (en `app.js`) muestra la sección, marca el botón activo (`aria-selected`), fija `document.documentElement.dataset.view` (el CSS lo usa para mostrar u ocultar controles según la vista) y emite el evento `gp:view`; los módulos de cada pantalla escuchan ese evento para pintarse al entrar. `map` es un alias de `list`: lista y mapa comparten pantalla.

## Diálogos y capas

- Los `<dialog>` se abren con `showModal()` y se cierran con `close()`. La tecla Esc los cierra.
- Fuera de un diálogo, un clic en el fondo (`click` sobre el propio `<dialog>`) lo cierra en favoritas, comparador, aviso legal y ficha.
- Estilo: esquinas rectas en toda la app (regla global `border-radius: 0`, con excepciones como los puntos del mapa).

## Referencia de controles

Cada fila es un elemento con `id` de `shell.php`. «Función» es la que se ejecuta al activarlo. Los controles de un mismo formulario que no tienen acción propia (solo aportan un valor) se indican como «valor».

### Cabecera y avisos

| id | Control | Qué hace | Función |
|---|---|---|---|
| `geo-toggle` | Botón (pin) | Activa o desactiva la ubicación. Si está activa la desactiva y borra la lista de cercanas; si no, pide permiso | `toggleLocation` |
| `favorites-open` | Botón (corazón) | Abre el panel de favoritas; el contador muestra cuántas hay | `openFavoritesPanel` |
| `compare-open` | Botón (barras) | Abre el comparador de gasolineras (hasta 5) | `openComparePanel` |
| `update-link` | Enlace | Descarga el APK de la versión nueva (solo Android) | enlace directo |
| `offline-banner` | Aviso | Se muestra sin red; ver [08](08-viajes-y-nativo.md) | `syncOfflineBanner` |

### Permiso de ubicación (`geo-ask`)

| id | Qué hace | Función |
|---|---|---|
| `geo-allow` | Cierra el diálogo y pide la ubicación | `requestGeolocation` |
| `geo-skip` | Guarda «no quiero ubicación» y muestra el buscador | `saveLocationPref('off')`, `showSearchPrompt` |
| `geo-retry` | Reintenta la ubicación tras un fallo | `requestGeolocation` |

### Vista Listado / Mapa

| id | Control | Qué hace | Función |
|---|---|---|---|
| `national-stats-toggle` | Botón | Despliega u oculta el resumen de precios medios de España con su gráfico de 14 días | `toggleNationalDetail` |
| `search-input` | Campo de búsqueda | Al escribir (≥ 2 letras) muestra sugerencias de lugares tras 250 ms; al enviar hace la búsqueda; vacío en modo búsqueda vuelve a «cerca de ti» | `fetchSearchSuggestions`, `performSearch`, `backToNearby` |
| `back-to-nearby` | Enlace-botón | Vuelve de una búsqueda a las gasolineras cercanas | `backToNearby` |
| `filter-fuel` | Selector | Carburante. Guarda la preferencia, relanza la búsqueda y actualiza el gráfico nacional si está abierto | `loadNearby`/`performSearch`, `localStorage gasolinera_fuel` |
| `filter-radius` | Selector | Radio: 1, 3, 5, 10 o 25 km | igual |
| `filter-sort` | Selector | Orden: más barata o más cercana | igual |
| `filter-open` | Selector | Horario: cualquiera, 24 h o abierta ahora | igual |
| `stations-search-btn` | Botón grande | Busca con el texto y filtros actuales; queda deshabilitado con «Buscando…» mientras carga | `performSearch` o `loadNearby` |
| `stations-progress`, `stations-status` | Estado | Barra de progreso y texto «Cerca de ti: N gasolineras · filtros» | `setStationsStatus` |
| `stations-empty` | Texto | Sin resultados. Si hay ubicación explica que no hay nada dentro del radio | `renderList` |
| `pagination-prev`, `pagination-next` | Botones | Página anterior o siguiente (10 por página); hace scroll al principio | `loadStationsPage` |
| `map-toggle` | Botón | Muestra u oculta el mapa (se recuerda) | `toggleMap` |
| `heatmap-toggle` | Botón | Mapa de calor de precios por zona | `toggleHeatmap` |
| `locate-me` | Botón | Centra el mapa en tu ubicación (o la pide) | `locateOnMap` |
| `map-show-all` | Botón | Quita la gasolinera seleccionada y vuelve a ver todas | `clearSelection` |

En cada tarjeta de gasolinera (`renderList`) hay un botón «Ver ficha» que abre la ficha, y al tocar la tarjeta se selecciona y se marca en el mapa (`selectStation`). Tocar un punto del mapa abre una burbuja con precio y botón «Ver ficha» (`bindStationPopup`).

### Ficha de gasolinera (`station-modal`)

| id | Control | Qué hace |
|---|---|---|
| `modal-rotulo` | Etiqueta | Marca, en negro con letras blancas |
| `modal-close` | Botón Cerrar | Retrocede en el historial (si se abrió con `pushState`) o cierra |
| `modal-share` | Botón Compartir | Comparte el enlace de la ficha (solo si el dispositivo lo permite) |
| `modal-favorite-toggle` | Botón corazón | Añade o quita de favoritas |
| `modal-directions` | Enlace «Cómo llegar» | Abre Google Maps con destino en la gasolinera |
| `modal-compare-toggle` | Botón | Añade o quita del comparador (máximo 5) |
| `modal-refuel` | Botón «Repostar aquí» | Cierra la ficha, cambia a la pestaña Coche y abre el asistente con esa gasolinera (evento `gp:refuel-here`) |

Además muestra los precios de todos los carburantes con su tendencia (▲ ▼ =), horario, comparación con la zona (`loadZoneComparison`) y gráfico de 14 días (`loadHistoryChart`).

### Panel de favoritas (`favorites-panel`)

| id | Qué hace |
|---|---|
| `favorites-close` | Cierra el panel |
| `alerts-toggle` | Activa o desactiva los avisos de bajada de precio de las favoritas |
| Filas (dinámicas) | Botón para abrir la ficha y botón para quitar de favoritas |

### Comparador (`compare-panel`)

`compare-close` cierra. La tabla (`renderComparePanel`) pide la ficha de cada gasolinera guardada y muestra una columna por gasolinera (rótulo, dirección y municipio) y una fila por carburante con su precio (`—` si no lo vende). La última fila tiene un botón «Quitar» por columna. No resalta el más barato.

### Vista Ruta

| id | Control | Qué hace | Función |
|---|---|---|---|
| `route-from` | Campo | Origen, con sugerencias de lugares al escribir | `wireSuggestions`, `resolveInput` |
| `route-from-here` | Botón «Mi ubicación» | Rellena el origen con tu posición | `useMyLocation` |
| `route-swap` | Botón | Intercambia origen y destino | `swap` |
| `route-to` | Campo | Destino | igual |
| `route-detour` | Selector | Desvío máximo a la ruta (distancia perpendicular) para buscar gasolineras | `refreshCorridor` |
| `route-submit` | Botón «Calcular ruta» | Envía el formulario | `calculate` |
| `route-navigate` | Botón | Abre la ruta en Google Maps | `navigate` |
| `route-clear-stop` | Botón | Quita la parada elegida | `clearStop` |
| `route-tank` | Deslizador | Nivel de depósito al salir, para el plan de paradas | `renderAdvice` |
| `route-refuel-go` | Botón | Elige la primera parada del plan | `setStop` |
| `route-sort` | Selector | Ordena las gasolineras del corredor por precio o por km | `renderStations` |
| Filas (dinámicas) | «Parar aquí» / tocar la fila | Fija la parada / abre la ficha | `setStop`, `openStationModal` |

Al tocar el mapa se elige el destino en ese punto. Los filtros de carburante y de apertura de la pestaña Listado (`filter-fuel`, `filter-open`) se reutilizan aquí.

### Vista Coche

| id | Control | Qué hace | Función |
|---|---|---|---|
| `garage-add-first` | Botón | Añade el primer coche | `openVehicleDialog(null)` |
| chips de coches (dinámicos) | Botones | Cambian el coche activo; el último chip añade otro | `setActive`, `openVehicleDialog` |
| `garage-edit` | Botón Editar | Edita el coche activo | `openVehicleDialog` |
| `garage-refuel` | Botón «Anotar repostaje» | Abre el asistente | `openRefuelDialog(null, null)` |
| `garage-odometer` | Botón «Actualizar km» | Abre el diálogo del cuentakilómetros | `openOdometerDialog` |
| `garage-compare-day` / `-week` / `-month` | Botones | Comparación con la media por repostaje, por semana o por mes | `renderComparison` |
| `trip-start`, `trip-stop` | Botones | Empezar y terminar viaje | `start`, `stop` |
| `trip-auto` | Casilla | Detección automática de viajes | `setAuto` |
| `trip-bt`, `trip-bt-device` | Casilla y selector (solo Android) | Empezar al conectar el Bluetooth del coche | `setBluetooth`, `chooseBluetoothDevice` |
| `trip-permissions-fix` | Botón «Dar permisos» | Abre los ajustes de la app | `openAppSettings` |
| `trip-battery` | Botón | Abre los ajustes de ahorro de batería | `openBatterySettings` |
| `recap-month` / `-year` / `-all` | Botones | Periodo del resumen | `setRecapPeriod` |
| `recap-image`, `recap-pdf` | Botones | Guardar el resumen como imagen o PDF | `exportRecap` |
| `recap-share` | Botón | Compartir la imagen del resumen | `exportRecap(..., true)` |
| `backup-include-trips` | Casilla | Incluir los recorridos en la copia | valor |
| `backup-export` | Botón | Exportar copia | `exportBackup` |
| `backup-import-btn`, `backup-import` | Botón y selector de fichero | Importar copia | `importBackup` |
| Filas de repostajes y de viajes | Botones | Abren el repostaje para editarlo o el detalle del viaje | `openRefuelDialog`, `openTrip` |

Bloques de la vista: estado vacío, coche activo (nombre, carburante, depósito, barra de nivel y autonomía, cuatro cifras: consumo medio, coste por km, gasto del mes y cuentakilómetros), gráficos (consumo, gasto mensual, precio frente a la media), lista de repostajes, viajes y mapas sin conexión (`offline-maps-card`).

### Diálogo de coche (`vehicle-dialog`)

| id | Qué hace |
|---|---|
| `vehicle-name` | Nombre (valor) |
| `vehicle-fuel` | Carburante; al cambiar actualiza las unidades (`updateVehicleUnits`) |
| `vehicle-tank`, `vehicle-homologated`, `vehicle-odometer` | Depósito, consumo homologado y km (valores) |
| `vehicle-save` | Guarda (`saveVehicle`) |
| `vehicle-cancel` | Cierra sin guardar |
| `vehicle-delete` | Borra el coche con sus repostajes y viajes, tras confirmar (`deleteVehicle`) |

### Asistente de repostaje (`refuel-dialog`)

Detalle de pasos en [07](07-garaje-y-repostajes.md).

| id | Paso | Qué hace |
|---|---|---|
| `refuel-station-search` | 1 | Busca gasolinera (favoritas y cercanas al enfocar) |
| `refuel-station-results` | 1 | Lista de resultados, sobre el campo |
| `refuel-station-clear` | 1 | Quita la gasolinera elegida |
| `refuel-date` | 2 | Fecha y hora; al cambiar cierra el calendario y recalcula el precio del día |
| `refuel-price` | 2 | Precio por unidad; escribirlo marca que es manual |
| `refuel-total` | 3 | Total pagado; recalcula litros |
| `refuel-liters-yes` | 4 | «Sí, es correcto»: avanza |
| `refuel-liters-edit` | 4 | «No, editar»: abre la edición de litros |
| `refuel-liters` | 4.5 | Litros; escribirlos recalcula el total |
| `refuel-liters-ok` | 4.5 | OK: conserva y vuelve al paso 4 |
| `refuel-liters-back` | 4.5 | Atrás: descarta el cambio y vuelve al paso 4 |
| `refuel-odometer` | 5 | Kilómetros |
| `refuel-km-yes` / `refuel-km-fix` | 5.5 | «Sí, son correctos» / «Corregir» |
| `refuel-full` | 6 | Depósito lleno |
| `refuel-missed` | 6 | Falta algún repostaje |
| `refuel-next`, `refuel-back` | 1–5 | Siguiente y Atrás |
| `refuel-save` | 6 | Guardar (`saveRefuel`) |
| `refuel-cancel` | todos | Cancelar (cierra) |
| `refuel-delete` | edición | Borra el repostaje |
| `refuel-done-close` | 7 | Cierra tras el guardado |

### Cuentakilómetros (`odometer-dialog`)

`odometer-value` (valor), el botón «Guardar» (sin `id`, envía `odometer-form` a `saveOdometer`) y `odometer-cancel` (cierra).

### Viajes

| id | Qué hace |
|---|---|
| `trip-rec-chip` | Chip «EN CURSO» que reabre la pantalla de viaje si se minimizó |
| `trip-drive-min` | Minimiza la pantalla de viaje |
| `trip-drive-stop` | Termina el viaje |
| `trip-summary-close` | Cierra el resumen al terminar un viaje |
| `trip-dialog-close` | Cierra el detalle de un viaje |
| `trip-delete` | Borra el viaje abierto |

La pantalla de viaje (`trip-drive`) muestra velocidad, tiempo, distancia y velocidad máxima; la velocidad se colorea por rangos (`speedLevel`: aviso a partir de 100 km/h, exceso a partir de 120) y una barra hasta 160 km/h.

### Vista Estadísticas

| id | Control | Qué hace |
|---|---|---|
| `stats-fuel` | Selector | Carburante de las estadísticas |
| Botones de `stats-group-toggle` (`data-group`) | Diario / Mensual | Agrupación de las series (`setStatsGroup`) |
| `stats-from`, `stats-to` | Fechas | Rango; se ajusta a los datos disponibles (`loadStatsAvailability`, `updateStatsRangeNote`) |
| `stats-station-search` | Campo | Busca una gasolinera para ver su histórico (`searchStatsStation`, `selectStatsStation`) |

Gráficos: media nacional, precios por carburante, por provincia (barras horizontales) y distribución de precios (histograma).

### Vista Info

| id | Control | Qué hace |
|---|---|---|
| `legal-open` | Botón | Abre el aviso legal y la privacidad (`legal-panel`) |
| `legal-close` | Botón | Lo cierra |
| `get-app-android` | Enlace | Descarga el APK de prueba (solo en web) |
| `get-app-ios` | Botón | Muestra u oculta la ayuda para instalar en iPhone (solo en web) |

La sección «Conseguir la app» se oculta dentro de la app y en modo instalado (`display-mode: standalone`).

## Convenciones de interfaz

- **Textos siempre en español** con tuteo. Números con formato `es-ES` (coma decimal).
- **Contraste:** paleta negro + naranja. Tokens en `:root` de `style.css` con variantes para modo claro y oscuro (`prefers-color-scheme`): `--bg`, `--surface`, `--border`, `--primary`, `--accent-bg`, `--btn-bg`… Cualquier color nuevo debe definirse como token y comprobarse en ambos modos.
- **Tipografías:** Bricolage Grotesque para títulos y cifras, Inter para texto (ficheros locales en `vendor/fonts`).
- **Movimiento:** se respeta `prefers-reduced-motion`.
- **Accesibilidad:** botones con `aria-label` o texto, estados con `aria-pressed`/`aria-selected`/`aria-expanded`, avisos con `role="status"`.
- **Un clic no debe lanzar varias cargas:** las funciones de carga usan un candado o una clave de petición (ver [04](04-busqueda-y-paridad.md)).
