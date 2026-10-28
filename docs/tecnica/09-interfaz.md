# 09 · Interfaz

## Estructura de la página

`api/shell.php` genera un único HTML. Contiene:

- Pantalla de carga (`.splash`), cabecera (con el selector de país e idioma, `country-switcher`), avisos (`update-banner`, `offline-banner`), diálogo de permiso de ubicación (`geo-ask`).
- **Seis vistas** (`<section id="view-...">`), de las que solo se muestra una (o dos: lista y mapa se ven juntas): `list`, `map`, `route`, `garage`, `stats`, `about`.
- **Barra de navegación** (`view-toggle`) con cinco botones: Listado, Ruta, Coche, Estad., Info. En pantallas de ordenador se muestra abajo igual que en móvil; los rótulos largos cambian a cortos con CSS (`.tab-long/.tab-short`).
- Diálogos modales (`<dialog>`): ficha de gasolinera, favoritas, comparador, aviso legal, coche, repostaje, cuentakilómetros, resumen de viaje, detalle de viaje e historial de viajes y repostajes (`history-dialog`).
- Pantalla de viaje en curso (`trip-drive`) y chip «EN CURSO».

Antes de los scripts de la app, `shell.php` vuelca en la página tres objetos globales leídos de `config/`: `window.GP_COUNTRIES` (`countries.json`), `window.GP_FUELS` (`fuels.json`) y `window.GP_I18N` (diccionarios `i18n/es.json`, `pt.json` y `fr.json`). `js/country.js` (`GPCountry`) los usa para fijar el país y el idioma, traducir los textos y rellenar los selectores de carburante; ver [10](10-referencia-funciones.md).

`switchView(vista)` (en `app.js`) muestra la sección, marca el botón activo (`aria-selected`), fija `document.documentElement.dataset.view` (el CSS lo usa para mostrar u ocultar controles según la vista) y emite el evento `gp:view`; los módulos de cada pantalla escuchan ese evento para pintarse al entrar. `map` es un alias de `list`: lista y mapa comparten pantalla.

## Diálogos y capas

- Los `<dialog>` se abren con `showModal()` y se cierran con `close()`. La tecla Esc los cierra.
- Fuera de un diálogo, un clic en el fondo (`click` sobre el propio `<dialog>`) lo cierra en favoritas, comparador, aviso legal y ficha.
- El selector de país e idioma de la cabecera no es un `<dialog>`: es un menú desplegable (`nav#country-switcher`) que se abre y cierra con la clase `open`.
- Estilo: esquinas rectas en toda la app (regla global `border-radius: 0`, con excepciones como los puntos del mapa).

## Referencia de controles

Cada fila es un elemento con `id` de `shell.php`. «Función» es la que se ejecuta al activarlo. Los controles de un mismo formulario que no tienen acción propia (solo aportan un valor) se indican como «valor».

### Cabecera y avisos

| id | Control | Qué hace | Función |
|---|---|---|---|
| `home-link` | Botón con el logo y el título «GASOLINERA+» (más el país en pequeño debajo si no es España) | Abre o cierra el selector de país e idioma (`aria-expanded`, `aria-controls="country-switcher"`). Un clic fuera o Esc lo cierra y devuelve el foco al botón. Ya no es un enlace que lleve a Listado | `wireHeader` (`GPCountry`) |
| `country-switcher` | Menú desplegable | Tres tarjetas de país (`.country-card[data-country]`: España, Portugal, Francia; la del país actual lleva `aria-current="page"`) y una fila «Idioma» con tres botones (`[data-lang]`: Español, Português, Français; el activo lleva `aria-pressed`). En el móvil se abre bajo la cabecera; en escritorio flota (`position: fixed`) sobre el contenido, con altura máxima y scroll propio | `GPCountry.setCountry`, `GPCountry.setLang` |
| `app-title-country` | Texto | Nombre del país en su idioma («PORTUGAL», «FRANCE») bajo «GASOLINERA+», con el mismo ancho que el título. Vacío (oculto) en España | `wireHeader` |
| `geo-toggle` | Botón (pin) | Activa o desactiva la ubicación. Si está activa la desactiva y borra la lista de cercanas; si no, pide permiso | `toggleLocation` |
| `favorites-open` | Botón (corazón) | Abre el panel de favoritas; el contador muestra cuántas hay | `openFavoritesPanel` |
| `compare-open` | Botón (barras) | Abre el comparador de gasolineras (hasta 5) | `openComparePanel` |

La cabecera (logo, título y país) se mantiene siempre en una línea. Las tarjetas de país son enlaces (`/?pais=es`; en la web, `/pt` y `/fr`): al elegir otro país o idioma se recarga la página con ese país (`GPCountry.go`). El país se recuerda en `localStorage` (`gasolinera_pais`) y el idioma de cada país en `gasolinera_idioma_<país>`. Cada país abre en su idioma (es, pt, fr) y se puede cambiar. Las preferencias propias de cada país (carburante, favoritas, comparador) llevan el sufijo `_pt` o `_fr` (`GPCountry.storageKey`).
| `update-link` | Enlace | Descarga el APK de la versión nueva (solo Android) | enlace directo |
| `update-close` | Botón (×) | Cierra el aviso de versión nueva | — |
| `offline-banner` | Aviso | Se muestra sin red; ver [08](08-viajes-y-nativo.md) | `syncOfflineBanner` |

### Permiso de ubicación (`geo-ask`)

| id | Qué hace | Función |
|---|---|---|
| `geo-allow` | Cierra el diálogo y pide la ubicación | `requestGeolocation` |
| `geo-skip` | Guarda «no quiero ubicación» y muestra el buscador | `saveLocationPref('off')`, `showSearchPrompt` |
| `geo-retry` | Reintenta la ubicación tras un fallo | `requestGeolocation` |

Si la ubicación cae a más de 25 km de cualquier gasolinera del país abierto, `insideCountry` lo detecta: se avisa («Estás fuera de…»), no se busca cerca de ti y se muestra el buscador con las gasolineras más baratas del país (`showSearchPrompt`).

### Vista Listado / Mapa

| id | Control | Qué hace | Función |
|---|---|---|---|
| `national-stats-toggle` | Botón | Despliega u oculta el resumen de precios medios del país con su gráfico de 14 días (los dos carburantes de cabecera de cada país) | `toggleNationalDetail` |
| `search-input` | Campo de búsqueda | Al escribir (≥ 2 letras) muestra sugerencias de lugares tras 250 ms; al enviar hace la búsqueda; vacío en modo búsqueda vuelve a «cerca de ti» | `fetchSearchSuggestions`, `performSearch`, `backToNearby` |
| `back-to-nearby` | Enlace-botón | Vuelve de una búsqueda a las gasolineras cercanas | `backToNearby` |
| `filter-fuel` | Selector | Carburante: las opciones salen de `GPCountry.fillFuelSelect` y son los carburantes del país (los principales primero, y debajo «Otras gasolinas y gasóleos» y «Alternativos y renovables»). Guarda la preferencia por país (`gasolinera_fuel`, o `gasolinera_fuel_pt`/`_fr`), relanza la búsqueda y actualiza el gráfico nacional si está abierto | `loadNearby`/`performSearch` |
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
| `modal-favorite-toggle` | Botón corazón | Añade o quita de favoritas. Se oculta si la ficha es de una gasolinera de otro país (por ejemplo, abierta desde una ruta entre países) |
| `modal-route` | Botón «Ruta hasta aquí» (solo escritorio) | Cierra la ficha, cambia a la vista Ruta y rellena el destino con la gasolinera (evento `gp:route-to`) |
| `modal-directions` | Enlace «Cómo llegar» | Abre Google Maps con destino en la gasolinera |
| `modal-compare-toggle` | Botón | Añade o quita del comparador (máximo 5) |
| `modal-horario`, `modal-horario-week` | Texto y lista | Resumen del horario («24 horas», «abierta ahora»…) y, debajo, el horario escrito día por día en el idioma del país (`renderWeekHours`, `GPCountry.weeklyHours`): los días con el mismo horario se agrupan («Lunes a viernes», «Todos los días») y «cerrado» o «24 horas» según el caso. La lista se oculta si no hay horario o si es 24 h todos los días |
| `modal-refuel` | Botón «Repostar aquí» | Cierra la ficha, cambia a la pestaña Coche y abre el asistente con esa gasolinera (evento `gp:refuel-here`) |

Además muestra los precios de todos los carburantes con su tendencia (▲ ▼ =), horario, comparación con la zona (`loadZoneComparison`) y gráfico de 14 días (`loadHistoryChart`). La ficha se abre con `openStationModal(ideess, país)`; sin país usa el actual, y las peticiones de la ficha (`Api.station`, zona, histórico) llevan el país de la gasolinera.

### Panel de favoritas (`favorites-panel`)

| id | Qué hace |
|---|---|
| `favorites-close` | Cierra el panel |
| `alerts-toggle` | Activa o desactiva los avisos de bajada de precio de las favoritas |
| `alerts-threshold`, `alerts-rises` | Dentro de `alerts-options` (oculto hasta activar los avisos): variación mínima para avisar (1, 2, 3 —por defecto—, 5 o 10 céntimos) y casilla «Avisarme también cuando suban». El precio de referencia solo cambia al llegar al mínimo |
| `alerts-note` | Aviso de estado o error al activar los avisos (permisos, sin conexión…) |
| Filas (dinámicas) | Botón para abrir la ficha y botón para quitar de favoritas. En escritorio cada fila muestra además los precios (`fillFavoritePrices`) |

Las favoritas se guardan por país: el panel lista las del país abierto, pero los avisos de bajada vigilan las de los tres países (`allFavorites`) y llegan en el idioma de la app. En el escritorio (web) el panel solo informa de que los avisos están en la app del móvil.

### Comparador (`compare-panel`)

`compare-close` cierra. La tabla (`renderComparePanel`) pide la ficha de cada gasolinera guardada y muestra una columna por gasolinera (rótulo, dirección y municipio) y una fila por carburante con su precio (`—` si no lo vende). La última fila tiene un botón «Quitar» por columna. Resalta (`is-best`) el precio más bajo de cada carburante cuando hay más de una gasolinera con precio.

### Vista Ruta

| id | Control | Qué hace | Función |
|---|---|---|---|
| `route-from` | Campo | Origen, con sugerencias de lugares al escribir | `wireSuggestions`, `resolveInput` |
| `route-from-here` | Botón «Mi ubicación» | Rellena el origen con tu posición | `useMyLocation` |
| `route-swap` | Botón | Intercambia origen y destino | `swap` |
| `route-to` | Campo | Destino | igual |
| `route-avoid-tolls` | Casilla «Evitar peajes» | Recalcula la ruta sin usar tramos de peaje (y con la misma parada) | `recalculate` |
| `route-detour` | Selector | Desvío máximo a la ruta (distancia perpendicular) para buscar gasolineras | `refreshCorridor` |
| `route-submit` | Botón «Calcular ruta» | Envía el formulario | `calculate` |
| `route-navigate` | Botón | Abre la ruta en Google Maps | `navigate` |
| `route-clear-stop` | Botón | Quita la parada elegida | `clearStop` |
| `route-tank` | Deslizador | Nivel de depósito al salir, para el plan de paradas | `renderAdvice` |
| `route-refuel-go` | Botón | Elige la primera parada del plan | `setStop` |
| `route-sort` | Selector | Ordena las gasolineras del corredor por precio o por km | `renderStations` |
| Filas (dinámicas) | «Parar aquí» / tocar la fila | Fija la parada / abre la ficha | `setStop`, `openStationModal` |

Al tocar el mapa se elige el destino en ese punto. El mapa se centra en el país abierto (`GPCountry.config.center`). En las rutas entre países (Bilbao–Lisboa, Madrid–Burdeos) el estado muestra «Cargando el mapa de carreteras de Portugal/Francia (N MB)… %» la primera vez, y las gasolineras del corredor son las de todos los países que cruza la ruta; al tocar una fila se abre su ficha con su país. Los filtros de carburante y de apertura de la pestaña Listado (`filter-fuel`, `filter-open`) se reutilizan aquí.

### Vista Coche

| id | Control | Qué hace | Función |
|---|---|---|---|
| `garage-add-first` | Botón | Añade el primer coche | `openVehicleDialog(null)` |
| chips de coches (dinámicos) | Botones | Cambian el coche activo; el último chip añade otro | `setActive`, `openVehicleDialog` |
| `garage-edit` | Botón Editar | Edita el coche activo | `openVehicleDialog` |
| `garage-refuel` | Botón «Anotar repostaje» | Abre el asistente | `openRefuelDialog(null, null)` |
| `garage-odometer` | Botón «Actualizar km» | Abre el diálogo del cuentakilómetros | `openOdometerDialog` |
| `garage-compare-day` / `-week` / `-month` | Botones | Comparación con la media por repostaje, por semana o por mes. Cada repostaje se compara con la media de su propio país; la leyenda dice «Media de España/Portugal/Francia» (o «Media del país» si mezcla) y, si hay varios países, los ahorros se desglosan por país | `renderComparison` |
| `trip-start`, `trip-stop` | Botones | Empezar y terminar viaje | `start`, `stop` |
| `trip-pause` | Botón «Pausar»/«Reanudar» | Pausa y reanuda la grabación; el tiempo en pausa no cuenta en la duración ni en la velocidad media | `togglePause` |
| `trip-auto` | Casilla | Detección automática de viajes | `setAuto` |
| `trip-bt`, `trip-bt-cars`, `trip-bt-device`, `trip-bt-add`, `trip-bt-help` | Casilla, lista de coches con «Quitar», selector con «Añadir» y ayuda (app de Android e iPhone) | Empezar al conectar el Bluetooth de un coche (o CarPlay en iPhone). Se pueden tener varios. La ayuda cambia según la plataforma | `setBluetooth`, `addBluetoothCar`, `removeBluetoothCar` |
| `trip-permissions-fix` | Botón «Dar permisos» | Abre los ajustes de la app | `openAppSettings` |
| `trip-battery` | Botón | Abre los ajustes de ahorro de batería. El aviso es un recordatorio fijo (`BATTERY_HINT`) cuando se usa la detección automática, el Bluetooth o se está grabando: no se lee el estado, porque Android solo informa del ajuste estándar y muchos móviles tienen el suyo | `openBatterySettings` |
| `recap-month` / `-year` / `-all` | Botones | Periodo del resumen | `setRecapPeriod` |
| `recap-image`, `recap-pdf` | Botones | Guardar el resumen como imagen o PDF. Mientras se genera el archivo, el botón pulsado pasa a «Generando…» con un círculo girando (`is-busy`) y los otros dos se bloquean; `recap-note` muestra los errores | `exportRecap` |
| `recap-share` | Botón | Compartir la imagen del resumen (mismo indicador «Generando…») | `exportRecap(..., true)` |
| `backup-include-trips` | Casilla | Incluir los recorridos en la copia | valor |
| `backup-export` | Botón | Exportar copia | `exportBackup` |
| `backup-import-btn`, `backup-import` | Botón y selector de fichero | Importar copia | `importBackup` |
| Filas de repostajes y de viajes | Botones | Abren el repostaje para editarlo o el detalle del viaje | `openRefuelDialog`, `openTrip` |
| `refuel-history-open`, `trip-history-open` | Botones «Ver todo el historial» | Aparecen cuando hay más de 10 repostajes (o viajes) y abren el diálogo de historial | `GPHistory.open` |

Bloques de la vista: estado vacío, coche activo (nombre, carburante, depósito, barra de nivel y autonomía, cuatro cifras: consumo medio, coste por km, gasto del mes y cuentakilómetros), gráficos (consumo, gasto mensual, precio frente a la media), lista de repostajes, viajes y mapas sin conexión (`offline-maps-card`).

### Diálogo de coche (`vehicle-dialog`)

| id | Qué hace |
|---|---|
| `vehicle-name` | Nombre (valor) |
| `vehicle-fuel` | Carburante, con los de los tres países (`fillFuelSelect(..., 'all', ['adblue', 'gnc_m3'])`, sin AdBlue ni GNC en €/m³); al cambiar actualiza las unidades (`updateVehicleUnits`) |
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
| `trip-drive-pause` | Pausa o reanuda el viaje desde la pantalla de viaje |
| `trip-drive-stop` | Termina el viaje |
| `trip-summary-close` | Cierra el resumen al terminar un viaje |
| `trip-dialog-close` | Cierra el detalle de un viaje |
| `trip-delete` | Borra el viaje abierto |

La pantalla de viaje (`trip-drive`) muestra velocidad, tiempo, distancia y velocidad máxima; la velocidad se colorea por rangos (`speedLevel`: aviso a partir de 100 km/h, exceso a partir de 120) y una barra hasta 160 km/h.

### Historial (`history-dialog`)

| id | Qué hace |
|---|---|
| `history-close` | Cierra el diálogo (también un clic en el fondo) |
| Botones `data-history-kind` | Cambian entre Viajes y Repostajes |
| `history-from`, `history-to` | Rango de fechas; al cambiarlas se recarga la lista |
| Botones `data-history-days` | Rangos rápidos: 30 días, 3 meses, 1 año o todo |
| `history-summary` | Resumen del rango (número de viajes o repostajes y, en repostajes, el gasto) |
| `history-list`, `history-more` | Lista de 20 en 20 y botón «Cargar más» |

### Vista Estadísticas

| id | Control | Qué hace |
|---|---|---|
| `stats-fuel` | Selector | Carburante de las estadísticas (mismos carburantes del país que `filter-fuel`) |
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
| `get-app-desktop` | Botón | En ordenador (web): lanza la instalación de la web como aplicación o, si el navegador no la ofrece, muestra la ayuda (`get-app-desktop-help`) |
| `feedback-kind`, botones `.feedback-kind` | Selector de tipo | Sugerencia, error u otro comentario (`feedback-kind` guarda el valor) |
| `feedback-message`, `feedback-count` | Campo y contador | Mensaje de 5 a 1500 caracteres |
| `feedback-tech` | Casilla | Incluir datos técnicos (versión, sistema, pantalla, idioma…; nunca la ubicación) |
| `feedback-send`, `feedback-copy`, `feedback-note` | Botones y aviso | Abrir la aplicación de correo con el mensaje preparado, o copiarlo (`GPFeedback`) |
| `permissions-list`, `permissions-note` | Lista y aviso | «Permisos y privacidad»: una fila por permiso (ubicación, avisos de bajada de precio y, en la app, detección de viajes, Bluetooth del coche y batería) con su estado y botones para activar, desactivar o abrir los ajustes del sistema. Los permisos del sistema solo se retiran desde los ajustes del móvil (`GPPermissions.render`) |
| Acordeones de la guía | `<details>` | «Guía de uso» con seis apartados y el botón de descarga del PDF |

La sección «Conseguir la app» se oculta dentro de la app y en modo instalado (`display-mode: standalone`).

## Convenciones de interfaz

- **Idiomas:** español, portugués y francés. Los textos están escritos en español en el código y `GPCountry.tr` (y el traductor del DOM de `country.js`) los pasa al idioma elegido con los diccionarios `config/i18n/*.json`; lo que no tenga traducción queda en español. El castellano usa tuteo. Números y fechas con la configuración regional del idioma (`GPCountry.uiLocale`: `es-ES`, `pt-PT` o `fr-FR`).
- **Contraste:** paleta negro + naranja. Tokens en `:root` de `style.css` con variantes para modo claro y oscuro (`prefers-color-scheme`): `--bg`, `--surface`, `--border`, `--primary`, `--accent-bg`, `--btn-bg`… Cualquier color nuevo debe definirse como token y comprobarse en ambos modos.
- **Tipografía:** una sola, Bricolage Grotesque, para títulos, cifras y texto, también en los gráficos (ficheros locales en `vendor/fonts`).
- **Movimiento:** se respeta `prefers-reduced-motion`.
- **Accesibilidad:** botones con `aria-label` o texto, estados con `aria-pressed`/`aria-selected`/`aria-expanded`, avisos con `role="status"`.
- **Un clic no debe lanzar varias cargas:** las funciones de carga usan un candado o una clave de petición (ver [04](04-busqueda-y-paridad.md)).
