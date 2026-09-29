# 10 · Referencia de funciones

Todas las funciones y métodos del código propio, por fichero. Las funciones anidadas o internas de un módulo se listan igualmente. Para la lógica completa de un cálculo, ver el documento indicado en cada apartado.

Los módulos JavaScript son funciones autoejecutadas: las funciones que se listan son internas y solo las que aparecen en el `return` del módulo son públicas.

## Cliente · pantalla de precios

### `js/app.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `applyChartTheme` | — | Ajusta los colores, la tipografía y el tamaño de letra por defecto de Chart.js según el tema claro u oscuro del sistema. Se vuelve a llamar al cambiar el tema. |
| `localIso` | `date` | Convierte una fecha a texto `AAAA-MM-DD` en hora local del dispositivo. |
| `todayIso` | — | Fecha de hoy en formato `AAAA-MM-DD`. |
| `daysAgoIso` | `n` | Fecha de hace `n` días en formato `AAAA-MM-DD`. |
| `loadCompareList` | — | Lee del `localStorage` (`gasolinera_compare`) la lista de gasolineras a comparar; devuelve `[]` si está vacía o dañada. |
| `saveCompareList` | — | Guarda la lista del comparador en `localStorage` y actualiza el contador. |
| `isInCompareList` | `ideess` | Indica si una gasolinera ya está en el comparador. |
| `compareToggleLabel` | `ideess` | Texto del botón de la ficha: «Quitar de comparar» o «Añadir a comparar». |
| `addToCompare` | `ideess, rotulo, direccion` | Añade una gasolinera al comparador (máximo 5, sin duplicados). |
| `removeFromCompare` | `ideess` | Quita una gasolinera del comparador y guarda. |
| `updateCompareCount` | — | Muestra u oculta el contador del botón del comparador. |
| `loadFavorites` | — | Lee las favoritas de `localStorage` (`gasolinera_favorites`). |
| `saveFavorites` | — | Guarda las favoritas, actualiza el contador y las sincroniza con los avisos de precio (`AlertsStore` y ejecutor en segundo plano). |
| `isFavorite` | `ideess` | Indica si una gasolinera es favorita. |
| `favoriteToggleLabel` | `ideess` | Texto accesible del botón de favorita según su estado. |
| `addToFavorites` | `ideess, rotulo, direccion, municipio` | Añade una gasolinera a favoritas (sin duplicados). |
| `removeFromFavorites` | `ideess` | Quita una gasolinera de favoritas. |
| `updateFavoritesCount` | — | Muestra u oculta el contador del botón de favoritas. |
| `openFavoritesPanel` | — | Pinta y abre el panel de favoritas. |
| `renderFavoritesPanel` | — | Dibuja la lista de favoritas con un botón para abrir la ficha y otro para quitar. |
| `showToast` | `message` | Muestra un aviso breve (1,6 s) en la parte baja de la pantalla. |
| `closeGeoAsk` | — | Cierra el diálogo de permiso de ubicación si está abierto. |
| `requestGeolocation` | — | Pide la posición al dispositivo (10 s de espera, caché de 5 min). Si va bien guarda las coordenadas, emite `gp:location`, recuerda la preferencia «activada» y lanza la búsqueda; si falla muestra el aviso de reintento. |
| `showSearchPrompt` | — | Estado «sin ubicación»: vacía la lista y explica que hay que activar la ubicación o buscar un lugar. |
| `initGeolocationFlow` | — | Decide al arrancar qué hacer con la ubicación según la preferencia guardada y el permiso del sistema: pedirla, respetar «no», o mostrar el diálogo de permiso tras la pantalla de carga. |
| `loadLocationPref` | — | Lee la preferencia de ubicación (`on`, `off` o nula). |
| `saveLocationPref` | `value` | Guarda esa preferencia. |
| `updateGeoToggle` | — | Actualiza el botón de ubicación (estado pulsado y texto accesible). |
| `toggleLocation` | — | Desactiva la ubicación (borrando la lista de cercanas) o la vuelve a pedir. |
| `loadNationalHeadline` | — | Carga los precios medios de hoy de gasóleo A y gasolina 95 para el resumen superior. |
| `toggleNationalDetail` | — | Despliega u oculta el detalle del resumen nacional y dibuja su gráfico la primera vez. |
| `renderNationalChart` | — | Dibuja el gráfico de 14 días de la media nacional del carburante seleccionado. |
| `currentFilters` | — | Devuelve los filtros de las búsquedas: carburante, radio, orden y apertura. |
| `selectedText` | `select` | Texto visible de la opción elegida en un selector. |
| `filterSummary` | — | Resumen textual de los filtros activos para la línea de estado. |
| `placeSummary` | — | Texto del lugar de la búsqueda («Cerca de ti» o «texto buscado»). |
| `flashStatus` | — | Reinicia la animación de destello de la línea de estado. |
| `setStationsStatus` | `kind` | Actualiza la línea de estado y el botón de buscar según el estado de la carga (`loading`, `done`, `error`, `needs-location`). |
| `loadNearby` | — | Carga la primera página de gasolineras cercanas al usuario (o pide ubicación si no hay). |
| `backToNearby` | — | Limpia la búsqueda por texto y vuelve a las gasolineras cercanas. |
| `performSearch` | `query` | Inicia una búsqueda por texto (mínimo 2 letras) y carga la primera página. |
| `hideSearchSuggestions` | — | Oculta y vacía la lista de sugerencias de lugares. |
| `fetchSearchSuggestions` | `query` | Pide sugerencias de lugares y las pinta si el texto no cambió mientras tanto. |
| `renderSearchSuggestions` | `places` | Dibuja los botones de sugerencia; al pulsar uno lanza la búsqueda. |
| `stationsRequestKey` | `pageNumber` | Clave (texto JSON) que identifica una petición de lista: modo, texto, ubicación, filtros y página. Sirve para ignorar peticiones idénticas. |
| `loadStationsPage` | `pageNumber` | Carga una página de resultados (cercanas o búsqueda). Evita cargas repetidas con la clave de petición, deja como máximo una pendiente, muestra estado y refresca lista y mapa. |
| `updatePaginationControls` | — | Habilita o deshabilita Anterior y Siguiente y escribe «Página x de y». |
| `fuelPriceLabel` | `station, fuelSlug` | Precio de un carburante en una gasolinera, formateado con tendencia, o nulo si no lo vende. |
| `readMapHidden` | — | Lee si el usuario ocultó el mapa (`gp_map_hidden`). |
| `applyMapVisibility` | — | Aplica la visibilidad del mapa y el texto del botón «Mostrar/Ocultar mapa». |
| `toggleMap` | — | Alterna y guarda la visibilidad del mapa. |
| `markSelectedCard` | — | Marca en la lista la tarjeta de la gasolinera seleccionada. |
| `resetSelection` | — | Deshace la selección de gasolinera y oculta «Ver todas». |
| `clearSelection` | — | Quita la selección y vuelve a pintar todos los puntos. |
| `selectStation` | `station` | Selecciona una gasolinera: la resalta en lista y mapa (sin desplazar la pantalla); pulsarla otra vez la deselecciona. |
| `bindStationPopup` | `marker, station, priceLabel` | Asocia a un punto del mapa una burbuja con nombre, precio y botón «Ver ficha», y la selección al tocarlo. |
| `renderList` | `stations` | Dibuja las tarjetas de resultados, el aviso de «sin resultados» con su ayuda de radio y la nota de lugar geocodificado. |
| `escapeHtml` | `text` | Escapa un texto para insertarlo como HTML sin riesgo. |
| `stationHeaderCell` | `d` | Celda de cabecera del comparador con rótulo, dirección y municipio. |
| `ensureMap` | — | Crea el mapa de precios una sola vez: centrado en tu ubicación (zoom 13) o en Madrid (zoom 6), capas base, agrupación de puntos y carga al mover el mapa. |
| `scheduleBboxLoad` | — | Aplaza 300 ms la carga de puntos al mover el mapa. |
| `priceColor` | `precio, min, max` | Color de un punto según su precio entre el mínimo y el máximo visibles (verde barato a rojo caro, gris sin precio). |
| `loadBboxForMap` | — | Pide los puntos de la zona visible (cancelando la petición anterior) y los dibuja; avisa si se muestrean por haber demasiados. |
| `renderMapStations` | `stations` | Pinta los puntos en el mapa, con agrupación, y el mapa de calor si está activo. |
| `renderHeatLayer` | `stationsWithPrice, min, max` | Pinta la capa de calor con la intensidad según el precio relativo. |
| `refreshMapMarkers` | — | Actualiza el mapa: si hay resultados de lista los pinta; si no, carga la zona visible. No hace nada con el mapa oculto. |
| `toggleHeatmap` | — | Activa o desactiva el mapa de calor. |
| `locateOnMap` | — | Centra el mapa en la posición del usuario o la pide. |
| `visibleViews` | `view` | Qué secciones se ven a la vez para una vista (lista y mapa juntas). |
| `switchView` | `view` | Cambia de vista: muestra la sección, marca el botón activo, emite `gp:view` y carga las estadísticas la primera vez. |
| `periodLabel` | `periodo, group = state.statsGroup` | Etiqueta de un periodo en los ejes: mes «mmm aaaa» o día `MM-DD`. |
| `variationText` | `serie, valueKey, group = state.statsGroup` | Texto de variación entre el primer y el último punto de una serie (importe y porcentaje). |
| `renderStatsNationalChart` | — | Envuelve la carga del gráfico nacional con el aviso «Cargando…» de la sección. |
| `renderStatsNationalChartNow` | — | Descarga la serie nacional del rango elegido y dibuja el gráfico con su texto de variación. |
| `searchStatsStation` | `query` | Busca gasolineras por texto para elegir una en Estadísticas. |
| `selectStatsStation` | `ideess, rotulo` | Elige la gasolinera cuyo histórico se va a ver y dibuja su gráfico. |
| `renderStatsStationChart` | — | Envuelve el gráfico de gasolinera con el aviso de carga. |
| `renderStatsStationChartNow` | — | Dibuja el histórico de precios de la gasolinera elegida en el rango disponible. |
| `isoToEs` | `iso` | Convierte `AAAA-MM-DD` a `DD/MM/AAAA`. |
| `loadStatsAvailability` | `fuel` | Consulta y guarda el rango de fechas con datos para ajustar los selectores de fecha. |
| `updateStatsRangeNote` | `effectiveFrom, effectiveTo` | Escribe la nota «Hay datos de … a …» y corrige el rango pedido si excede lo disponible. |
| `renderStatsByFuelChart` | — | Envuelve el gráfico por carburante con el aviso de carga. |
| `renderStatsByFuelChartNow` | — | Dibuja las medias nacionales de los carburantes principales en el rango. |
| `renderStatsProvinceChart` | — | Envuelve el gráfico por provincia con el aviso de carga. |
| `renderStatsProvinceChartNow` | — | Dibuja las provincias de más barata a más cara para el carburante elegido. |
| `renderStatsDistributionChart` | — | Envuelve el histograma con el aviso de carga. |
| `renderStatsDistributionChartNow` | — | Dibuja el histograma de distribución de precios actuales. |
| `setStatsGroup` | `group` | Cambia la agrupación (día o mes) y repinta las series. |
| `openStationModal` | `ideess` | Abre la ficha: pide la gasolinera, rellena datos, precios y botones, espera al gráfico y a la comparación con la zona (con «Cargando…») y entonces muestra el diálogo. Ignora pulsaciones repetidas. |
| `loadZoneComparison` | `ideess, fuel` | Escribe la comparación con la media de la zona (municipio) en la ficha. |
| `loadHistoryChart` | `ideess, fuel` | Dibuja el gráfico de precios de los últimos 14 días en la ficha. |
| `openComparePanel` | — | Pinta y abre el comparador. |
| `renderComparePanel` | — | Pide la ficha de cada gasolinera guardada y dibuja la tabla lado a lado con botones «Quitar». |
| `syncOfflineBanner` | — | Muestra u oculta el aviso de sin conexión y alterna la clase `is-offline` de la página. |
| `showAlertsNote` | `message` | Muestra un mensaje bajo el interruptor de avisos de precio. |
| `enableNativeAlerts` | — | Activa los avisos en la app: pide permiso de notificaciones, guarda el estado y sincroniza las favoritas con el ejecutor en segundo plano. |
| `enableAlerts` | — | Activa los avisos: en app usa el ejecutor nativo; en web pide permiso y registra una sincronización periódica (solo Chrome en Android con la app instalada). |
| `checkAndNotifyDrops` | — | Comprueba bajadas de precio de favoritas ahora y muestra notificaciones. |
| `disableAlerts` | — | Desactiva los avisos y anula la sincronización periódica. |
| `restoreFuelPreference` | — | Restaura el carburante guardado en el selector al arrancar. |
| `handleDeepLink` | — | Interpreta `?station=` y `?view=` de la URL para abrir una ficha o una vista. |
| `showUpdateBanner` | `version, url` | Muestra el aviso de versión nueva con su enlace de descarga. |
| `useVehicleFuel` | `fuel` | Cambia el filtro de carburante al del coche activo y relanza la búsqueda. |

### `js/api.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `loadData` | — | Carga las gasolineras locales (descargadas o empaquetadas) una sola vez. |
| `haversine` | `lat1, lon1, lat2, lon2` | Distancia en km entre dos puntos. |
| `normalize` | `text` | Minúsculas y sin tildes. |
| `isOpen24h` | `station` | Indica si una gasolinera abre 24 horas. |
| `applyFilters` | `stations, fuel, open` | Filtra por carburante y 24 horas. |
| `priceOrMax` | `station, fuel` | Precio de un carburante o 999 si falta (para ordenar al final). |
| `trendsOf` | `station` | Traduce la tendencia `u/d/s` a `up/down/same`. |
| `capForMap` | `stations` | Limita a 4000 puntos con muestreo uniforme. |
| `listItem` | `station, distanciaKm` | Da forma de respuesta de API a una gasolinera local. |
| `page` | `items, offset, limit` | Corta una página de resultados y calcula `hasMore`. |
| `relevance` | `s` | Relevancia de una gasolinera para un texto (0 a 5), igual que el servidor. |
| `request` | `path, signal` | Petición a la API con manejo de errores; marca `status = 0` sin red. |
| `isOffline` | `error` | Indica si un error es de falta de red. |
| `roundCoord` | `value` | Redondea coordenadas a 3 decimales. |
| `snapDown` | `value` | Redondea hacia abajo a 0,01°. |
| `snapUp` | `value` | Redondea hacia arriba a 0,01°. |
| `canUseLocal` | `params` | En la app, usa datos locales salvo `open=now`. |
| `localResult` | `data` | Marca un resultado local como no «offline». |
| `exactDistances` | `stations, lat, lon, sort` | Recalcula distancias exactas y reordena si el orden es por distancia. |

### `js/native.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `isNative` | — | Indica si se ejecuta dentro de la app. |
| `accentColor` | — | Color de acento del tema. |
| `platform` | — | `android`, `ios` o `web`. |
| `plugin` | `name` | Devuelve un plugin de Capacitor por nombre o nulo. |
| `remoteBase` | — | URL del servidor para datos remotos. |
| `apiBase` | — | URL base de la API: producción en la app, vacía en la web. |
| `publicUrl` | `path` | URL pública de una ruta (para compartir). |
| `share` | `{ title, text, path }` | Comparte texto y enlace con el menú del sistema. |
| `canShare` | — | Indica si el dispositivo puede compartir. |
| `openExternal` | `url` | Abre un enlace en el navegador o la app externa. |
| `readPosition` | `options` | Lee la posición con el plugin o el navegador. |
| `getPosition` | `options` | Lee la posición con permiso previo. |
| `locationPermission` | — | Estado del permiso de ubicación (`granted`, `denied`, `prompt`). |
| `hasGeolocation` | — | Indica si hay forma de obtener ubicación. |
| `onBack` | `handler` | Registra un manejador para el botón atrás. |
| `handleBack` | — | Ejecuta los manejadores del botón atrás. |
| `closeTopDialog` | — | Cierra el diálogo abierto más reciente. |
| `versionNumber` | `tag` | Convierte una etiqueta de versión en lista de números. |
| `isNewer` | `remote, local` | Compara versiones. |
| `checkForUpdate` | `notify` | Consulta la última release de GitHub y avisa si hay APK nuevo (solo Android). |
| `refreshOfflineData` | — | Descarga `stations-lite.json` como máximo cada 20 horas y lo guarda para uso sin servidor. |
| `cachedOfflineStations` | — | Lee las gasolineras descargadas o nulo. |
| `setupGetApp` | — | Muestra los botones de instalación en web según el sistema. |
| `setupNativeShell` | — | Ajusta la app nativa: clases del `<html>`, enlaces externos, botón atrás y enlaces de la app. |

### `js/splash.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `hide` | — | Oculta la pantalla de carga y resuelve las esperas. |
| `whenHidden` | — | Promesa que se cumple cuando la pantalla de carga ya no se ve. |
| `show` | — | Muestra la pantalla de carga (salvo con reducción de movimiento). |
| `begin` | — | Marca el inicio de una carga de página. |
| `end` | — | Marca el fin y oculta tras un giro del +. |
| `banner` | `view, create` | Crea u obtiene el aviso «Cargando…» de una vista. |
| `begin` | `view` | Empieza a contar una carga de una vista; a los 200 ms muestra el aviso. |
| `end` | `view` | Termina una carga de una vista y oculta el aviso si no quedan más. |
| `track` | `view, promise` | Envuelve una promesa con `begin`/`end` de la vista. |

### `js/map-guard.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `createShield` | `wrap` | Crea el botón «Toca para mover el mapa». |
| `guardTouch` | `wrap` | Activa el escudo en pantallas táctiles. |
| `sync` | — | Muestra el escudo solo con puntero táctil. |
| `guardWheel` | `map, container` | El zoom con rueda exige Ctrl o Cmd. |
| `install` | `map` | Instala el escudo y el control de rueda en un mapa. |

### `js/offline-maps.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `readRegistry` | — | Lee las regiones instaladas de `localStorage`. |
| `saveRegistry` | — | Guarda las regiones instaladas. |
| `filesystem` | — | Plugin `Filesystem` o nulo. |
| `directory` | — | Directorio de descarga. |
| `available` | — | Indica si se pueden usar mapas sin conexión (app con `Filesystem`). |
| `fileUrl` | `file` | URL local de un fichero descargado. |
| `canReadRanges` | `url` | Comprueba que el dispositivo lee rangos de bytes de un PMTiles. |
| `regionBounds` | `entry` | Límites de una región en formato Leaflet. |
| `layerFor` | `entry` | Crea la capa de teselas vectoriales de una región. |
| `addRegionLayers` | `map, layers` | Añade al mapa las regiones instaladas. |
| `addBaseLayers` | `map` | Capa de OpenStreetMap, protección de scroll y regiones sin conexión. |
| `refreshMaps` | — | Añade o quita regiones en todos los mapas abiertos. |
| `exists` | `file` | Comprueba si un fichero existe. |
| `verifyInstalled` | — | Elimina del registro las regiones cuyo fichero desapareció. |
| `loadIndex` | — | Descarga la lista de regiones disponibles. |
| `removeFile` | `file` | Borra un fichero de mapa. |
| `install` | `entry, onProgress` | Descarga una región con progreso, la valida, la registra y borra la versión anterior. |
| `uninstall` | `entry` | Borra una región. |
| `megabytes` | `bytes` | Formatea bytes como MB o GB. |
| `initCard` | — | Construye la tarjeta de mapas sin conexión de la pantalla Coche. |
| `say` | `text` | Muestra un mensaje en la tarjeta. |
| `render` | — | Dibuja la lista de regiones con Descargar, Actualizar o Borrar. |
| `act` | `entry, isInstalled, button` | Ejecuta la acción del botón de una región. |
| `firstRunHint` | — | En la app y con Wi-Fi, sin ningún mapa, ofrece una vez descargar el de la zona. |

### `js/alerts-store.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `unitFor` | `slug` | Unidad de un carburante (`L` o `kg`). |
| `labelFor` | `slug` | Nombre legible de un carburante. |
| `priceText` | `value, slug` | Precio con su unidad. |
| `notificationFor` | `drop` | Título y opciones de la notificación de una bajada de precio. |
| `openDb` | — | Abre el almacén de avisos en IndexedDB. |
| `get` | `key` | Lee un valor guardado. |
| `set` | `key, value` | Guarda un valor. |
| `checkPrices` | `apiBase` | Compara precios de favoritas con los anteriores y devuelve las bajadas de al menos 0,002 €. |

### `js/background.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `runner` | — | Plugin `BackgroundRunner` o nulo. |
| `syncAlerts` | `favorites, enabled` | Envía al ejecutor las favoritas y el estado de los avisos. |
| `checkNow` | — | Pide una comprobación inmediata de precios. |

## Cliente · garaje, cálculos y viajes

### `js/fuel-math.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `madridDate` | `iso` | Fecha `AAAA-MM-DD` en zona de Madrid. |
| `madridMonth` | `iso` | Mes `AAAA-MM` en zona de Madrid. |
| `sorted` | `refuels` | Repostajes ordenados por km y fecha. |
| `intervals` | `refuels` | Tramos lleno a lleno con consumo y coste. |
| `monthlySpend` | `refuels` | Gasto por mes. |
| `savingsBy` | `items, referenceOf` | Ahorro total frente a una referencia calculada por elemento. |
| `savings` | `refuels, nationalByDate` | Ahorro frente a la media nacional por fecha. |
| `estimateTank` | `vehicle, list, consumption` | Litros estimados en el depósito. |
| `summary` | `vehicle, refuels` | Consumo, coste por km, totales, depósito, autonomía y gasto mensual. |

### `js/price-index-core.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `cellKey` | `lat, lon` | Clave de la celda de 0,1° de un punto. |
| `haversineKm` | `lat1, lon1, lat2, lon2` | Distancia en km. |
| `cellsAround` | `lat, lon, radiusKm` | Celdas cuyo centro está dentro del radio de un punto. |
| `parseDate` | `iso` | Fecha `AAAA-MM-DD` a milisegundos UTC. |
| `formatDate` | `ms` | Milisegundos UTC a `AAAA-MM-DD`. |
| `addDays` | `iso, days` | Suma días a una fecha. |
| `datesBetween` | `from, to` | Lista de fechas entre dos límites. |
| `periodOf` | `iso, kind` | Semana (lunes-domingo, numeración por el jueves) o mes de una fecha. |
| `bucketFor` | `day, scope` | Cubos del índice de un día para un ámbito nacional, provincial o de celdas. |
| `average` | `months, fuelSlug, dates, scope` | Media ponderada del índice para un carburante, fechas y ámbito. |
| `nearestDay` | `months, iso, maxBackDays` | Día con datos más cercano hacia atrás. |

### `js/price-index.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `filesystem` | — | Plugin `Filesystem` o nulo. |
| `available` | — | Indica si el índice local se puede usar (solo app). |
| `readSyncInfo` | — | Lee el estado de sincronización guardado. |
| `writeSyncInfo` | `info` | Guarda el estado de sincronización. |
| `download` | `name` | Descarga un fichero de la release del índice. |
| `readJson` | `name` | Lee un fichero JSON guardado. |
| `seed` | — | La primera vez copia el índice empaquetado en la app al almacenamiento local. |
| `doSync` | `force` | Descarga el manifiesto y los meses que hayan cambiado (como máximo cada 6 horas). |
| `sync` | `force` | Ejecuta una sola sincronización a la vez. |
| `ensureMonth` | `key` | Carga en memoria un mes si está guardado. |
| `ensure` | `from, to` | Carga los meses de un rango de fechas. |
| `dayReference` | `{ fuel, date, lat, lon }` | Medias nacional y de zona de un día, con hasta 3 días de retroceso. |
| `periodReference` | `{ fuel, from, to, points }` | Media nacional y medias de zona de un periodo. |

### `js/garage-store.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `migrate` | `db, oldVersion` | Crea o actualiza los almacenes de IndexedDB según la versión. |
| `open` | — | Abre la base una sola vez. |
| `requestPersistence` | — | Pide almacenamiento persistente. |
| `wrap` | `request` | Convierte una petición de IndexedDB en promesa. |
| `all` | `store` | Todos los registros de un almacén. |
| `byIndex` | `store, index, value` | Registros por índice. |
| `get` | `store, key` | Un registro por clave. |
| `put` | `store, value` | Guarda o reemplaza un registro. |
| `remove` | `store, key` | Borra un registro. |
| `newId` | — | Identificador único. |
| `setting` | `key, fallback` | Lee un ajuste con valor por defecto. |
| `saveSetting` | `key, value` | Guarda un ajuste. |
| `deleteVehicle` | `id` | Borra coche, repostajes y viajes en una transacción. |
| `exportAll` | `includeTrips, extra` | Vuelca todo a un objeto de copia de seguridad. |
| `importAll` | `payload` | Importa una copia (añade y reemplaza por clave). |

### `js/backup.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `readLocalList` | `key` | Lee una lista de `localStorage`. |
| `mergeLocalList` | `key, incoming` | Fusiona una lista importada sin duplicar por gasolinera. |
| `fileName` | — | Nombre del fichero de copia con la fecha. |
| `exportBackup` | `includeTrips` | Genera y entrega la copia. |
| `importBackup` | `file` | Lee, valida e importa una copia. |

### `js/recap.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `fmt` | `value, digits` | Formatea números en español. |
| `periodPrefix` | `period` | Prefijo de fecha del periodo (`AAAA-MM`, `AAAA` o vacío). |
| `periodLabel` | `period` | Texto del periodo («septiembre 2026», «2026», «desde el principio»). |
| `compute` | `vehicle, refuels, period` | Calcula las cifras del resumen de un coche y un periodo. |
| `fitText` | `ctx, text, maxWidth` | Recorta un texto con puntos suspensivos para que quepa en el lienzo. |
| `rowsOf` | `stats` | Filas de datos que aparecen en la imagen. |
| `draw` | `stats` | Dibuja el resumen en un lienzo de 1080×1920. |
| `bytesOf` | `text` | Convierte texto en bytes. |
| `pdfFromJpeg` | `dataUrl, width, height` | Construye un PDF de una página con una imagen JPEG. |
| `push` | `chunk` | Añade un trozo de datos al PDF y suma su tamaño. |
| `object` | `number, body` | Escribe un objeto del PDF y anota su posición. |
| `canvasBlob` | `canvas, type` | Convierte un lienzo en `Blob`. |
| `isNative` | — | Indica si es la app. |
| `deliver` | `blob, name, share` | Comparte el fichero o lo descarga. |
| `exportImage` | `stats, share` | Genera y entrega la imagen PNG. |
| `exportPdf` | `stats, share` | Genera y entrega el PDF. |

### `js/garage.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `number` | `value, digits` | Formatea un número con formato español y los decimales indicados. |
| `money` | `value` | Formatea un importe en euros con dos decimales. |
| `setMetric` | `element, value, unit` | Escribe una cifra y su unidad en pequeño dentro de una tarjeta de datos. |
| `unitOf` | `fuel` | Unidad de un carburante (`L` o `kg`). |
| `monthLabel` | `key` | Convierte `AAAA-MM` en «mes aaaa» abreviado. |
| `shortDate` | `iso` | Fecha `DD/MM/AAAA` de un instante en zona de Madrid. |
| `localInputValue` | `date` | Formato `AAAA-MM-DDTHH:mm` que necesita un campo de fecha y hora. |
| `activeVehicle` | — | Coche activo o nulo. |
| `announceActive` | — | Emite `gp:vehicle-active` con el coche activo (la pestaña de precios adapta su carburante). |
| `load` | — | Lee coches, decide el activo y carga sus repostajes. |
| `refresh` | — | Recarga los datos y repinta la pantalla. |
| `summary` | — | Resumen de consumo, depósito y gasto del coche activo (`GPFuel.summary`). |
| `render` | — | Muestra el estado vacío o la ficha del coche con chips, resumen, repostajes y gráficos. |
| `renderChips` | — | Dibuja los botones de coches y el de añadir otro. |
| `renderSummary` | `vehicle, s` | Rellena nombre, carburante, barra de depósito, autonomía, consumo, coste por km, gasto mensual y cuentakilómetros. |
| `renderRefuels` | `vehicle` | Lista de repostajes con fecha, importe, litros, precio, km, tipo (lleno o parcial), consumo del tramo y gasolinera. |
| `replaceChart` | `key, canvas, config` | Destruye el gráfico previo de una clave y crea uno nuevo (Chart.js). |
| `nationalByDate` | `fuel, from` | Serie nacional del servidor como mapa fecha → media, con caché. |
| `renderCharts` | `vehicle` | Envuelve el dibujo de gráficos del garaje con el aviso de carga. |
| `renderChartsNow` | `vehicle` | Dibuja consumo, gasto mensual y comparación con la media; muestra el estado vacío si no hay repostajes. |
| `hasCoords` | `refuel` | Indica si un repostaje guarda las coordenadas de su gasolinera. |
| `refuelReferences` | `vehicle, refuel, nationalMap` | Obtiene las medias nacional y de zona de un repostaje: guardadas, del índice local o del servidor. |
| `dayRows` | `vehicle, sortedRefuels` | Filas de la comparación «por repostaje». |
| `groupByPeriod` | `sortedRefuels, kind` | Agrupa repostajes por semana o mes y se queda con los 12 últimos periodos. |
| `periodRows` | `vehicle, sortedRefuels, kind` | Filas de la comparación por semana o mes: precio medio ponderado por litros frente a la media del periodo. |
| `chartLabel` | `label` | Etiqueta corta de un periodo para el eje del gráfico. |
| `savingsText` | `saving, reference, noun, hook` | Texto de ahorro o sobrecoste frente a una referencia. |
| `differenceText` | `paid, reference, unit` | Texto «X € por debajo/por encima» de una referencia. |
| `renderCompareList` | `vehicle, rows` | Lista de detalle por periodo con lo pagado y la diferencia con España y con la zona. |
| `drawComparison` | `vehicle, rows` | Dibuja la gráfica y los textos de ahorro para las filas calculadas. |
| `updateCompareButtons` | — | Marca el botón de comparación activo (repostaje, semana, mes). |
| `renderComparison` | `vehicle, sortedRefuels` | Elige el cálculo de comparación según el modo; semana y mes exigen el índice local de la app. |
| `withTimeout` | `promise, ms` | Rechaza una promesa si no termina en el tiempo indicado. |
| `loadReferences` | `refuel, fuel` | Obtiene y guarda en el repostaje las medias del día (índice local, servidor nacional y de zona). |
| `attachReferences` | `refuel, fuel` | Llama a `loadReferences` con 5 s de tope; si falla deja las medias a nulo. |
| `applyStation` | `refuel, station` | Copia en el repostaje los datos de la gasolinera elegida (id, nombre, coordenadas) o los pone a nulo. |
| `setActive` | `id` | Cambia el coche activo, lo guarda y recarga. |
| `fillFuelOptions` | — | Rellena el selector de carburante del coche copiando el del filtro, sin AdBlue. |
| `updateVehicleUnits` | — | Actualiza las etiquetas de depósito y consumo con la unidad del carburante. |
| `showError` | `node, message` | Muestra u oculta el mensaje de error de un formulario. |
| `openVehicleDialog` | `vehicle` | Abre el diálogo de coche en modo alta o edición. |
| `saveVehicle` | `event` | Valida y guarda el coche (nombre, depósito 5–300, consumo 1–40, km ≥ 0) y lo activa. |
| `deleteVehicle` | — | Tras confirmar, borra el coche con sus repostajes y viajes. |
| `stationPrice` | `station, fuel` | Precio de un carburante de una gasolinera desde su ficha o su lista de precios; nulo si no existe. |
| `showRefuelStation` | — | Muestra la gasolinera elegida y el botón para quitarla. |
| `renderStationResults` | `stations` | Dibuja la lista de gasolineras sugeridas (con ★ en favoritas y distancia). |
| `searchStations` | — | Busca gasolineras por texto para el repostaje (hasta 25, por cercanía si hay ubicación). |
| `currentLocation` | — | Ubicación del usuario: la de la app, la guardada o una nueva pedida al dispositivo (4 s de espera). |
| `favoriteStations` | — | Lee las favoritas de `localStorage`. |
| `showStationSuggestions` | — | Sugerencias sin texto: favoritas cercanas, otras favoritas y cercanas hasta 25 km. |
| `onStationInput` | — | Con menos de 3 letras muestra sugerencias; con 3 o más busca por texto (con espera de 250 ms). |
| `clearRefuelStation` | — | Quita la gasolinera elegida del asistente. |
| `checkFullTank` | — | Desmarca «depósito lleno» si los litros son menos del 25 % de la capacidad y avisa. |
| `unitWord` | `unit` | «litros» o «kilos» según la unidad. |
| `refuelsOfActive` | `vehicle, excludeId` | Repostajes del coche, excluyendo opcionalmente uno. |
| `usualKmPerDay` | `vehicle` | Ritmo habitual de km al día entre el primer y el último repostaje (mínimo 2 repostajes y 7 días). |
| `odometerBase` | `vehicle, iso, excludeId` | Última lectura de km conocida antes de una fecha: repostaje anterior o actualización del odómetro. |
| `expectedKm` | `vehicle, iso, excludeId` | Km esperados para una fecha a partir de la base y el ritmo diario. |
| `kmWarning` | `vehicle, odometer, iso, excludeId` | Texto de aviso si unos km no cuadran (menos que antes, más que el siguiente o salto excesivo); vacío si todo va bien. |
| `prepareOdometerStep` | — | Rellena el paso de km con la cifra estimada y su nota, si el usuario no la escribió. |
| `setStep` | `step` | Muestra un paso del asistente y ajusta botones, progreso y preparaciones de cada paso. |
| `prepareLitersStep` | — | Escribe la pregunta de confirmación de litros con su valor y su origen. |
| `recomputeLitersFromTotal` | — | Calcula litros = total / precio. |
| `updateMissedHint` | — | Decide si falta un repostaje comparando los km desde el anterior con 1,25 veces la autonomía; marca la casilla y explica con cifras. |
| `renderReview` | — | Dibuja el resumen del paso final. |
| `stepError` | — | Mensaje de error del paso actual o texto vacío. |
| `nextStep` | — | Valida y avanza; recalcula litros al salir del paso 3 y abre la revisión de km si hace falta. |
| `backStep` | — | Retrocede un paso. |
| `updateDayPrice` | — | Propone el precio del día: actual de la gasolinera si es hoy, media de la zona o de España del índice si no. |
| `chooseStationOnMap` | — | Cierra el asistente y lleva al mapa para elegir gasolinera (sin uso desde la interfaz). |
| `exportRecap` | `kind, share` | Genera el resumen del periodo y lo guarda como imagen o PDF, o lo comparte. |
| `setRecapPeriod` | `period` | Cambia el periodo del resumen (mes, año, todo). |
| `pickStation` | `station` | Elige una gasolinera: rellena el precio, avanza al paso 2 y propone el precio del día. |
| `openRefuelDialog` | `refuel, station` | Abre el asistente para un repostaje nuevo (opcionalmente con gasolinera) o edita uno existente. |
| `recomputeTotal` | — | Recalcula total = litros × precio. |
| `recomputeLiters` | — | Recalcula litros = total / precio. |
| `saveRefuel` | `event` | Valida y guarda el repostaje (ver documento 07), sube el odómetro y muestra el panel de guardado. |
| `deleteRefuel` | — | Borra el repostaje abierto tras confirmar. |
| `openOdometerDialog` | — | Abre el diálogo de km con el valor actual. |
| `saveOdometer` | `event` | Guarda la lectura del cuentakilómetros y la hora. |
| `showBackupNote` | `message` | Muestra un mensaje bajo la copia de seguridad. |
| `exportBackup` | — | Exporta la copia de seguridad (con o sin viajes). |
| `importBackup` | — | Importa una copia y resume lo añadido. |

### `js/trip-metrics.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `distance` | `a, b` | Distancia Haversine en metros. |
| `bearing` | `a, b` | Rumbo entre dos puntos. |
| `angleBetween` | `a, b` | Diferencia entre dos rumbos (0–180). |
| `clean` | `raw` | Ordena y filtra puntos por tiempo, precisión y saltos. |
| `speeds` | `points` | Velocidad de cada punto (GPS o calculada). |
| `smooth` | `values` | Media móvil de la velocidad. |
| `emptyResult` | `raw, total, lowQuality` | Resultado vacío para viajes sin datos suficientes. |
| `weightedSpeedFactor` | `bandMeters, meters` | Factor de consumo por velocidad ponderado por metros. |
| `estimateFuel` | `distanceKm, speedFactor, options` | Litros estimados de un viaje. |
| `compute` | `raw, options = {}` | Todas las métricas de un viaje. |
| `thin` | `raw` | Aligera el recorrido conservando giros, cambios de velocidad y un punto cada 5 s. |

### `js/trips.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `recorder` | — | Plugin nativo `TripRecorder` o nulo en la web. |
| `number` | `value, digits` | Formatea un número en español. |
| `clock` | `seconds` | Formatea segundos como `m:ss` o `h:mm:ss`. |
| `minutesText` | `seconds` | Formatea segundos como «N min» o «H h M min». |
| `note` | `text` | Escribe un mensaje en la zona de avisos de viajes. |
| `speedLevel` | `kmh` | Nivel de la velocidad (normal, aviso desde 100 km/h, exceso desde 120) para el color. |
| `driveHintText` | — | Texto de ayuda de la pantalla de viaje según el estado. |
| `averageKmh` | `live` | Velocidad media en directo (distancia / tiempo). |
| `paintDrive` | `live` | Actualiza la pantalla de viaje: velocidad, tiempo, distancia, máxima y barra. |
| `paintLiveCard` | `live` | Actualiza la tarjeta del viaje en la pantalla Coche. |
| `showDrive` | `recording` | Muestra u oculta la pantalla de viaje y el chip «EN CURSO». |
| `renderLive` | — | Refleja el estado de grabación en botones, tarjeta, pantalla y temporizador. |
| `minimizeDrive` | `minimized` | Minimiza o restaura la pantalla de viaje. |
| `referenceFactorFor` | `vehicleId` | Factor de velocidad medio de los viajes anteriores del coche (mínimo 3 viajes y 30 km); nulo si no hay datos suficientes. |
| `vehicleOptions` | `referenceFactor` | Opciones para calcular consumo y coste de un viaje: consumo medio, último precio y factor de referencia. |
| `saveTrip` | `points, info` | Calcula métricas de los puntos, descarta viajes automáticos de menos de 0,5 km, guarda el viaje aligerado y suma sus km al cuentakilómetros. |
| `pointsFromNative` | `rows` | Convierte las filas del plugin al formato de puntos de `GPTripMetrics`. |
| `importPending` | — | Importa a IndexedDB los viajes terminados del plugin nativo y los borra del almacén nativo. |
| `refreshStatus` | — | Lee el estado del plugin y actualiza casilla de detección, tarjeta, permisos y Bluetooth. |
| `renderPermissions` | `status` | Calcula y muestra los avisos de permisos y batería. |
| `start` | — | Empieza un viaje: en app pide permisos y llama al plugin; en web usa el GPS del navegador. |
| `stop` | — | Termina el viaje y lo importa. |
| `requestWakeLock` | — | Pide al navegador mantener la pantalla encendida durante un viaje web. |
| `onVisibility` | — | Vuelve a pedir el bloqueo de pantalla cuando la pestaña vuelve a verse. |
| `onWebPosition` | `position` | Procesa una posición del GPS del navegador: acumula puntos, distancia y velocidad y guarda copia de seguridad cada 10 puntos. |
| `startWeb` | — | Empieza a grabar con `watchPosition` y bloqueo de pantalla. |
| `stopWeb` | — | Termina la grabación web y guarda el viaje si hay al menos 2 puntos. |
| `recoverWebTrip` | — | Recupera un viaje web que quedó a medias al cerrar el navegador. |
| `renderBluetooth` | `status` | Muestra u oculta el bloque de Bluetooth (solo Android) y su selector. |
| `fillBluetoothDevices` | `saved` | Rellena el selector con los dispositivos emparejados y marca el guardado. |
| `setBluetooth` | `enabled` | Activa o desactiva el arranque por Bluetooth: pide permisos, explica lo necesario y muestra el selector. |
| `chooseBluetoothDevice` | — | Guarda el dispositivo elegido como coche. |
| `setAuto` | `enabled` | Activa o desactiva la detección automática pidiendo los permisos necesarios. |
| `speedColor` | `kmh` | Color HSL de un tramo del recorrido según su velocidad. |
| `renderList` | — | Lista de viajes guardados con fecha, distancia, duración y coche. |
| `tile` | `label, value` | Crea una tarjeta de cifra (etiqueta y valor). |
| `shiftOdometer` | `vehicleId, km` | Suma kilómetros al odómetro del coche. |
| `summaryTiles` | `metrics` | Tarjetas de cifras de un viaje (distancia, duración, medias, máxima, eco, consumo, coste). |
| `reassignTrip` | `trip, vehicle` | Reasigna un viaje a otro coche. |
| `renderSummaryCars` | `trip` | Dibuja los botones para reasignar el viaje a otros coches. |
| `openSummary` | `trip` | Abre el resumen de un viaje recién guardado. |
| `replaceChart` | `key, canvas, config` | Destruye y crea de nuevo un gráfico de viaje. |
| `openTrip` | `trip` | Abre el detalle de un viaje: mapa coloreado por velocidad, cifras y gráficos de franjas. |
| `deleteOpenTrip` | — | Borra el viaje abierto, restando sus km del coche, tras confirmar. |
| `sync` | — | Importa viajes pendientes y refresca el estado. |

## Cliente · ruta

### `js/router-core.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `metersBetween` | `lat1, lon1, lat2, lon2` | Distancia en metros entre dos puntos con aproximación plana (rápida). |
| `constructor` | `capacity` | Heap: crea la cola con arrays tipados de la capacidad dada. |
| `clear` | — | Vacía la cola. |
| `push` | `key, value` | Heap: inserta un valor con su prioridad; duplica la capacidad si hace falta. |
| `pop` | — | Heap: extrae el valor de menor prioridad y guarda su clave en `topKey`. |
| `parseMain` | `buffer` | Interpreta el fichero principal del grafo (`GPRG`) en vistas de arrays tipados. |
| `take` | `Type, count` | Corta un array tipado del búfer y avanza alineado a 4 bytes. |
| `parseTile` | `buffer` | Interpreta una tesela (`GPRT`). |
| `take` | `Type, count` | Igual que `take`, dentro de `parseTile`. |
| `constructor` | `manifest, mainBuffer, loadTile` | Router: prepara coordenadas globales, marcas de búsqueda y estructuras de detalle. |
| `tileKeysAround` | `lat, lon` | Claves de las teselas existentes alrededor de un punto. |
| `ensureTiles` | `points` | Descarga y carga las teselas que faltan para los puntos de la ruta. |
| `addTile` | `key, tile` | Registra una tesela y crea sus aristas de detalle. |
| `addDetailEdge` | `from, to, time, ref, reversed` | Añade una arista de detalle al mapa de adyacencias. |
| `segmentPoints` | `ref` | Puntos de la polilínea de un tramo. |
| `segmentInfo` | `ref` | Extremos, longitud, tiempo, sentido único y peaje de un tramo. |
| `findMainEdge` | `node, s, reversed` | Busca el arco de un tramo principal en un cruce y sentido. |
| `projectOnSegment` | `ref, lat, lon` | Proyecta un punto sobre un tramo y devuelve distancia, posición y trozo. |
| `snap` | `lat, lon` | Engancha un punto al tramo más cercano en 2,5 km, con penalización de 40 m para autopistas. |
| `endpointCosts` | `snapped, leaving` | Coste de salir o llegar por cada extremo de un tramo según el sentido. |
| `heuristic` | `node, targetLat, targetLon` | Estimación optimista del tiempo restante en línea recta. |
| `search` | `origin, destination` | A* de mínimo tiempo entre dos puntos enganchados. |
| `detailEdgeId` | `edge` | Identificador numérico de una arista de detalle. |
| `orientedPoints` | `ref, reversed` | Puntos de un tramo en el sentido de la marcha. |
| `partial` | `snapped, fromStart, reversedDirection` | Fragmento de un tramo enganchado desde o hasta el punto proyectado. |
| `leg` | `origin, destination` | Reconstruye un tramo de ruta: geometría, metros, segundos y peaje. |
| `directOnSegment` | `origin, destination` | Ruta directa cuando origen y destino están en el mismo tramo. |
| `route` | `points` | Encadena tramos entre todos los puntos y devuelve el resultado o el error (`no-road`, `no-connection`). |

### `js/router-worker.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `readBuffer` | `url, onProgress` | Descarga un fichero con progreso y lo descomprime si es gzip. |
| `load` | `id` | Carga el manifiesto y el fichero principal una sola vez y crea el motor. |

### `js/route.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `number` | `value, digits` | Formatea un número en español. |
| `durationText` | `seconds` | Formatea segundos como minutos u horas y minutos. |
| `setStatus` | `text` | Muestra un mensaje de estado bajo el formulario. |
| `worker` | — | Crea (una vez) el trabajador de cálculo de rutas y enruta sus mensajes. |
| `computeRoute` | `points` | Envía puntos al trabajador y devuelve el resultado, mostrando el progreso de descarga del mapa. |
| `loadPlaces` | — | Carga y prepara `places.json` (lugares con nombre normalizado). |
| `searchPlaces` | `text` | Busca lugares por texto: exacto, empieza por, contiene; ordena por relevancia y tipo. |
| `placeLabel` | `place` | Nombre de un lugar con su alternativo entre paréntesis. |
| `renderSuggestions` | `list, input, places, onPick` | Dibuja las sugerencias de un campo de origen o destino. |
| `wireSuggestions` | `input, list, key` | Conecta un campo con su lista de sugerencias (espera de 150 ms). |
| `resolveInput` | `input, key` | Convierte el texto del campo en coordenadas: punto elegido, lugar exacto, geocodificador o lugar aproximado. |
| `useMyLocation` | — | Pone la ubicación actual como origen. |
| `ensureMap` | — | Crea el mapa de la ruta y permite fijar el destino tocando. |
| `updatePointMarkers` | — | Dibuja los marcadores de origen y destino y ajusta la vista. |
| `buildCorridor` | `coords, maxKm, stations, fuel, only24h` | Gasolineras cerca de la ruta: distancia perpendicular mínima y posición a lo largo del camino. |
| `vehicleContext` | — | Coche activo y su resumen, o nulo. |
| `planStops` | `routeKm, corridor, context, levelPercent` | Plan voraz de paradas según depósito, consumo y reserva de 30 km. |
| `renderAdvice` | — | Calcula coste, nivel de depósito y consejo de repostaje. |
| `priceColor` | `price, min, max` | Color de un precio entre el mínimo y el máximo del corredor. |
| `renderStations` | — | Lista y puntos de las gasolineras del corredor (hasta 150), con «Parar aquí». |
| `drawRoute` | — | Dibuja la ruta y la parada en el mapa. |
| `refreshCorridor` | — | Recalcula el corredor con el desvío y los filtros actuales. |
| `renderSummary` | — | Muestra distancia, duración, peaje y extra de la parada. |
| `run` | `points` | Ejecuta un cálculo de ruta con estados y mensajes de error legibles. |
| `calculate` | `event` | Evita cálculos simultáneos y envuelve el cálculo con el aviso de carga. |
| `calculateNow` | `event` | Resuelve origen y destino, calcula la ruta, la dibuja y busca gasolineras. |
| `setStop` | `entry` | Recalcula la ruta pasando por una gasolinera y muestra el sobrecoste. |
| `clearStop` | — | Quita la parada y restaura la ruta directa. |
| `navigate` | — | Abre Google Maps con origen, destino y parada. |
| `swap` | — | Intercambia origen y destino. |
| `onShow` | — | Prepara el mapa y el origen al entrar en la pestaña. |

## Ejecución en segundo plano y Service Worker

### `runners/alerts.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `readJson` | `key, fallback` | Lee un valor JSON del almacén del ejecutor. |
| `writeJson` | `key, value` | Guarda un valor JSON. |
| `priceText` | `value, slug` | Precio con su unidad. |
| `labelFor` | `slug` | Nombre legible de un carburante. |
| `checkPrices` | — | Comprueba bajadas y programa notificaciones locales. |

### `sw.js`

| Función | Parámetros | Qué hace |
|---|---|---|
| `notifyPriceDrops` | — | Comprueba bajadas de precio de favoritas y muestra notificaciones desde el Service Worker. |

## Servidor PHP

### `api/Core/Request.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `__construct` | — | Lee método, ruta (sin `/api`) y parámetros de la petición. |
| `query` | `string $key, ?string $default = null` | Parámetro de texto o valor por defecto. |
| `queryInt` | `string $key, ?int $default = null` | Parámetro entero o valor por defecto. |

### `api/Core/Response.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `json` | `mixed $data, int $status = 200` | Responde JSON con `Cache-Control` (público para 2xx, `no-store` para errores) y CORS abierto. |
| `error` | `string $message, int $status = 400` | Responde `{ error }` con un código. |
| `internalError` | `\Throwable $e` | Registra la excepción y responde 500. |

### `api/Core/Router.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `get` | `string $pattern, callable $handler` | Registra una ruta GET convirtiendo `{parámetros}` en expresión regular. |
| `dispatch` | `Request $request` | Busca la ruta coincidente, extrae parámetros y llama al manejador; devuelve 404 o 405 si no. |

### `api/Core/Config.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `current` | — | Configuración de `Config/config.php`, leída una vez. |

### `api/Core/Database.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `connection` | — | Conexión PDO única a `gasolinera.sqlite` en solo lectura (`mode=ro&immutable=1`, con respaldo a apertura normal). |

### `api/Core/Cache.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `remember` | `string $key, int $ttlSeconds, callable $producer` | Devuelve un valor guardado en un fichero temporal si no ha caducado; si no, lo calcula con el productor y lo guarda. |

### `api/Core/Http.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `get` | `string $url, int $timeoutSeconds = 8, array $headers = []` | Descarga una URL con cURL (tiempo máximo y cabeceras opcionales) y devuelve el cuerpo o lanza una excepción. |

### `api/Core/RateLimit.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `clientIp` | — | IP del cliente desde las cabeceras de Vercel o proxy. |
| `allow` | `string $ip, int $limit, int $windowSeconds, ?string $directory = null` | Cuenta la petición en la ventana actual de esa IP y devuelve si sigue por debajo del límite. |
| `removeOld` | `string $dir, int $window` | Borra los ficheros de contadores de ventanas antiguas. |

### `api/Controllers/StationsController.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `near` | `Request $request` | `GET /stations/near`. |
| `search` | `Request $request` | `GET /stations/search`. |
| `suggestPlaces` | `Request $request` | `GET /stations/suggest-places`. |
| `bbox` | `Request $request` | `GET /stations/bbox`. |
| `show` | `Request $request, array $params` | `GET /stations/{ideess}`. |
| `history` | `Request $request, array $params` | `GET /stations/{ideess}/history`. |
| `nationalStats` | `Request $request` | `GET /stats/national`. |
| `statsByFuel` | `Request $request` | `GET /stats/by-fuel`. |
| `statsByProvince` | `Request $request` | `GET /stats/by-province`. |
| `priceDistribution` | `Request $request` | `GET /stats/price-distribution`. |
| `resolvePlace` | `Request $request` | `GET /places/resolve`. |
| `zoneAverage` | `Request $request` | `GET /stats/zone-average`. |
| `zoneComparison` | `Request $request, array $params` | `GET /stations/{ideess}/zone-comparison`. |
| `normalizeFuel` | `?string $fuel` | Carburante válido o nulo. |
| `isInvalidFuel` | `?string $fuel` | Verdadero si se envió un carburante que no existe. |
| `parseCoordinates` | `?string $lat, ?string $lon` | Coordenadas válidas o nulo. |
| `normalizeGroup` | `?string $group` | `day` o `month`. |
| `parseDateRange` | `Request $request, int $defaultDays, int $maxDays` | Rango de fechas válido, recortado a lo permitido. |
| `nationalSeriesStatement` | `\PDO $pdo, string $group` | Consulta SQL de la serie nacional por día o mes. |
| `normalizeSort` | `?string $sort` | `price` o `distance`. |
| `parseOpenParam` | `?string $open` | Interpreta `open` como (solo 24 h, abierta ahora). |
| `parsePageParams` | `Request $request` | `offset` y `limit` (máximo 100). |

### `api/Models/Search.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `normalize` | `string $text` | Pasa a minúsculas, quita tildes y colapsa espacios. |

### `api/Models/Station.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `__construct` | `private \PDO $pdo` | Recibe la conexión PDO. |
| `near` | — | Gasolineras en un radio: caja envolvente, distancia exacta, filtros, orden y paginación. |
| `search` | — | Búsqueda por texto con palabras, relevancia, radio opcional y mezcla con las cercanas a un lugar. |
| `suggestPlaces` | `string $query, int $limit` | Hasta N municipios y localidades cuyo nombre empieza por el texto. |
| `looksLikePlaceQuery` | `string $query` | Indica si el texto coincide con el inicio de algún municipio o localidad. |
| `relevanceScore` | `array $row, string $normalizedQuery, string $rawQuery` | Relevancia de una fila para el texto buscado (0 a 5). |
| `withinBounds` | — | Puntos del mapa dentro de una caja, con tope y muestreo. |
| `batchFuelPrices` | `array $ideessList, string $fuel` | Precios de un carburante para una lista de gasolineras. |
| `find` | `string $ideess` | Ficha completa de una gasolinera con todos sus precios, tendencias y horario. |
| `batchAllPrices` | `array $ideessList` | Todos los precios de una lista de gasolineras. |
| `batchTrends` | `array $ideessList, array $fuels, array $pricesById` | Tendencia (`up`, `down`, `same`) de cada precio frente al día anterior. |
| `zoneComparison` | `string $ideess, string $fuel` | Precio propio frente a la media del municipio. |
| `zoneAverage` | `float $lat, float $lon, float $radiusKm, string $fuel, ?string $date, int $staleStationDays` | Media, mínimo y máximo de una zona circular para una fecha. |
| `boundingBox` | `float $lat, float $lon, float $radiusKm` | Caja envolvente de un círculo. |
| `haversineKm` | `float $lat1, float $lon1, float $lat2, float $lon2` | Distancia en km entre dos puntos. |
| `fetchInBoundingBox` | `array $bbox, ?string $fuel, bool $open24h, int $staleStationDays` | Gasolineras vigentes dentro de una caja con filtros. |
| `staleClause` | `int $staleStationDays` | Condición SQL para excluir gasolineras que no aparecen en el feed hace más de N días. |
| `buildListItem` | `array $row, ?float $distanceKm, array $showFuels, array $pricesById, array $trends` | Convierte una fila en el elemento de la lista de la API. |
| `relevanceOf` | `array $candidate` | Relevancia guardada de un candidato (0 si no tiene). |
| `isOpenNow` | `string $horarioRaw` | Indica si está abierta ahora según su horario. |
| `sortPaginateAndBuild` | `array $candidates, string $sort, ?string $fuel, int $offset, int $limit` | Filtra por carburante, ordena por relevancia y distancia o precio, pagina y construye los elementos con precios y tendencias. |
| `batchHasFuel` | `array $ideessList, string $fuel` | Indica qué gasolineras tienen un carburante. |
| `batchSortPrices` | `array $ideessList, string $sortFuel` | Precio de ordenación de cada gasolinera. |

### `api/Services/OpeningHours.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `isAlwaysOpen` | `string $horarioRaw` | Indica si abre 24 horas. |
| `isOpenAt` | `string $horarioRaw, \DateTime $when` | Indica si está abierta en un instante (`null` si el horario no se entiende). |
| `describe` | `string $horarioRaw, \DateTime $when` | Estado (`abierto`, `cerrado`, `desconocido`) y texto legible. |
| `normalize` | `string $raw` | Normaliza el texto del horario. |
| `parseRanges` | `string $normalized` | Interpreta días y franjas horarias. |
| `dayRange` | `string $fromCode, string $toCode` | Expande un rango de días. |
| `openRangeAt` | `array $ranges, \DateTime $when` | Franja abierta en un instante o nulo. |
| `nextOpening` | `array $ranges, \DateTime $when` | Próxima apertura. |
| `formatMinutes` | `int $minutes` | Formatea minutos desde medianoche como `HH:MM`. |

### `api/Services/PlaceGeocoder.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `resolve` | `string $query` | Convierte un texto en coordenadas con Nominatim (solo España) y cachea 30 días. |

## Procesos de datos y compilación

### `scripts/build-database.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `fieldStr` | `array $row, string $key` | Valor de un campo del feed como texto. |
| `main` | `array $argv` | Punto de entrada: elige modo `daily`, `backfill` o `lite`. |
| `parseArgs` | `array $argv` | Lee `--mode`, `--source`, `--output` y `--days`. |
| `openDatabase` | `string $path` | Abre SQLite en modo WAL. |
| `ensureSchema` | `\PDO $pdo` | Crea tablas e índices si no existen. |
| `parseSpanishDecimal` | `string $value` | Convierte «1,459» en 1.459. |
| `feedDateToIso` | `string $fecha` | Convierte `DD/MM/AAAA` en `AAAA-MM-DD`. |
| `isoDateToHistParam` | `string $isoDate` | Convierte `AAAA-MM-DD` en `DD-MM-AAAA`. |
| `fetchSnapshot` | `string $url` | Descarga y valida un snapshot del Ministerio. |
| `loadFuelPrices` | `array $row` | Extrae los precios de una gasolinera por carburante. |
| `detectIs24h` | `string $horario` | Indica si un horario es de 24 horas. |
| `runDaily` | `\PDO $pdo, ?string $source` | Proceso diario: snapshot actual, media nacional, recorte y JSON offline. |
| `updateNationalPriceHistory` | `\PDO $pdo, string $fechaIso` | Guarda la media nacional del día por carburante. |
| `pruneOldPriceHistory` | `\PDO $pdo, string $snapshotDate` | Borra histórico más antiguo de 10 días y compacta. |
| `runBackfill` | `\PDO $pdo, int $days` | Rellena el histórico de los últimos N días. |
| `applySnapshot` | `\PDO $pdo, array $estaciones, string $fechaIso, bool $updateCurrentAndStations` | Guarda gasolineras y precios de un día en una transacción. |
| `fetchLocalOrRemote` | `string $source` | Lee un snapshot de fichero local o de URL. |
| `trendCodes` | `array $today, array $previous` | Códigos `u/d/s` de tendencia. |
| `generateLiteJson` | `string $dbPath` | Genera `stations-lite.json`. |

### `scripts/build-price-index.php`

| Función | Parámetros | Qué hace |
|---|---|---|
| `indexCellKey` | `float $lat, float $lon` | Clave de celda de 0,1° para una coordenada. |
| `emptyBucket` | — | Cubo vacío con dos números por carburante. |
| `addSample` | `array &$bucket, int $fuelIndex, int $millis` | Suma un precio en milésimas y una muestra. |
| `aggregateSnapshot` | `array $estaciones` | Agrega un snapshot en cubos nacional, provincial y por celdas. |
| `newMonthFile` | `string $month` | Estructura vacía de un mes. |
| `readMonthFile` | `string $path, string $month` | Lee un mes existente o crea uno nuevo si es de otra versión. |
| `writeMonthFile` | `string $path, array $month` | Escribe un mes con los días ordenados. |
| `writeManifest` | `string $dir` | Genera `index.json` con los meses disponibles. |
| `parseIndexArgs` | `array $argv` | Lee `--out`, `--from`, `--to` y `--days`. |
| `fetchDaySnapshot` | `string $isoDate, string $today` | Descarga un día y comprueba que la fecha devuelta es la pedida. |
| `indexMain` | `array $argv` | Proceso principal del índice de precios. |

### `scripts/build-www.mjs`

| Función | Parámetros | Qué hace |
|---|---|---|
| `findPhp` | — | Localiza el ejecutable de PHP para generar el HTML. |

### `tools/price-index/fetch-index.mjs`

| Función | Parámetros | Qué hace |
|---|---|---|
| `download` | `name` | Descarga un fichero de la release del índice de precios. |

### `tools/graph/build-graph.mjs`

| Función | Parámetros | Qué hace |
|---|---|---|
| `log` | `message` | Escribe un mensaje con la hora. |
| `constructor` | `Type, initial = 1 << 20` | GrowArray: crea un array tipado que crece al llenarse. |
| `push` | `value` | GrowArray: añade un valor. |
| `view` | — | GrowArray: vista de los valores usados. |
| `parseMaxspeed` | `value` | Convierte la etiqueta `maxspeed` de OpenStreetMap a km/h. |
| `isDrivable` | `tags` | Indica si una vía admite coches. |
| `onewayOf` | `tags` | Sentido único de una vía: 1, −1 o 0. |
| `speedOf` | `tags` | Velocidad de cálculo de una vía en km/h. |
| `haversine` | `lat1, lon1, lat2, lon2` | Distancia en metros. |
| `lowerBound` | `id` | Búsqueda binaria de un identificador en la lista de referencias. |
| `indexOfId` | `id` | Índice de un identificador de nodo o −1. |
| `perpendicularMeters` | `lat, lon, aLat, aLon, bLat, bLon` | Distancia de un punto a un segmento. |
| `simplify` | `points` | Simplifica una polilínea con tolerancia de 8 m. |
| `find` | `x` | Raíz de un grupo en la unión de componentes conexas. |
| `provinceLookup` | — | Asocia lugares a su provincia a partir de las gasolineras. |

### `tools/graph/pbf.mjs`

| Función | Parámetros | Qué hace |
|---|---|---|
| `constructor` | `data, start = 0, end = data.length` | Lector de mensajes protobuf sobre un búfer. |
| `varint` | — | Lee un entero de longitud variable. |
| `svarint` | — | Lee un entero con signo (zigzag). |
| `key` | — | Lee la clave de un campo (número y tipo). |
| `bytesRange` | — | Lee un bloque de bytes con su longitud. |
| `skip` | `wire` | Salta un campo de tipo desconocido. |
| `packedVarints` | `start, end, out` | Lee una lista empaquetada de enteros. |
| `packedDelta` | `start, end` | Lee una lista empaquetada codificada por diferencias. |
| `parseBlobHeader` | `buffer` | Lee la cabecera de un bloque del fichero `.pbf`. |
| `decodeBlob` | `buffer` | Descomprime y lee un bloque. |
| `parseHeaderBlock` | `data` | Lee la cabecera del fichero. |
| `parsePrimitiveBlock` | `data, handlers` | Recorre un bloque de datos llamando a los manejadores de vías y nodos. |
| `decodeDense` | `data, start, end, granularity, latOffset, lonOffset, strings, tagKey` | Decodifica nodos en formato denso. |
| `decodeWay` | `data, start, end, strings, requiredKey` | Decodifica una vía y sus etiquetas. |

### `tools/graph/write-graph.mjs`

| Función | Parámetros | Qué hace |
|---|---|---|
| `constructor` | — | Writer: acumulador de trozos binarios. |
| `u32` | `values` | Añade enteros de 32 bits. |
| `push` | `typed` | Añade un array tipado alineado a 4 bytes. |
| `bytes` | — | Junta todo en un único búfer. |
| `magic` | `text` | Bytes de la firma de un fichero. |
| `speedMs` | `graph, way` | Velocidad de una vía en m/s. |
| `writeGraph` | `graph, outDir` | Escribe `main.bin`, las teselas y el manifiesto, comprimidos. |
| `directions` | `s` | Sentidos permitidos de un tramo. |
| `timeDs` | `s` | Tiempo de un tramo en décimas de segundo. |

### `tools/maps/build-maps.mjs`

| Función | Parámetros | Qué hace |
|---|---|---|
| `log` | `message` | Escribe un mensaje con la hora. |
| `isoDate` | `build` | Fecha de una compilación de Protomaps. |
| `reachable` | `url` | Comprueba que una URL responde. |
| `pickBuild` | `wanted` | Elige la compilación más reciente disponible. |
| `run` | `argsList` | Ejecuta la herramienta `pmtiles`. |
| `extract` | `url, target, bbox, maxzoom` | Extrae una región de la compilación con su caja y zoom. |

## Android (Java)

### `android/app/src/main/java/app/vercel/gasolineraplus/MainActivity.java`

| Función | Parámetros | Qué hace |
|---|---|---|
| `onCreate` | `Bundle savedInstanceState` | Registra el plugin `TripRecorder` antes de arrancar Capacitor. |

### `android/app/src/main/java/app/vercel/gasolineraplus/trips/TripRecorderPlugin.java`

| Función | Parámetros | Qué hace |
|---|---|---|
| `load` | — | Enlaza el servicio con los eventos hacia JavaScript. |
| `handleOnDestroy` | — | Quita el enlace. |
| `granted` | `String permission` | Indica si un permiso está concedido. |
| `permissionsJson` | — | Estado de todos los permisos y del ahorro de batería. |
| `snapshotJson` | `TripService.Snapshot snapshot` | Instantánea del viaje en formato JSON. |
| `status` | `PluginCall call` | Método `status`. |
| `start` | `PluginCall call` | Método `start`. |
| `stop` | `PluginCall call` | Método `stop`. |
| `listTrips` | `PluginCall call` | Método `listTrips`. |
| `readTrip` | `PluginCall call` | Método `readTrip`. |
| `deleteTrip` | `PluginCall call` | Método `deleteTrip`. |
| `setAutoDetect` | `PluginCall call` | Método `setAutoDetect`. |
| `requestBluetooth` | `PluginCall call` | Método `requestBluetooth`. |
| `bluetoothDevices` | `PluginCall call` | Método `bluetoothDevices`. |
| `setBluetoothDevice` | `PluginCall call` | Método `setBluetoothDevice`. |
| `requestForeground` | `PluginCall call` | Método `requestForeground`. |
| `requestActivity` | `PluginCall call` | Método `requestActivity`. |
| `requestBackground` | `PluginCall call` | Método `requestBackground`. |
| `afterPermissions` | `PluginCall call` | Responde con los permisos tras pedirlos. |
| `openAppSettings` | `PluginCall call` | Método `openAppSettings`. |
| `openBatterySettings` | `PluginCall call` | Método `openBatterySettings`. |

### `android/app/src/main/java/app/vercel/gasolineraplus/trips/TripService.java`

| Función | Parámetros | Qué hace |
|---|---|---|
| `setListener` | `Listener value` | Registra quien recibe las actualizaciones del viaje. |
| `snapshot` | — | Última instantánea del viaje. |
| `start` | `Context context, boolean auto, String vehicleId` | Arranca el servicio en primer plano. |
| `sendAction` | `Context context, String action` | Envía una acción al servicio. |
| `onBind` | `Intent intent` | No admite enlace. |
| `onStartCommand` | `Intent intent, int flags, int startId` | Gestiona parar, salida del coche y arrancar. |
| `hasLocationPermission` | — | Comprueba la ubicación precisa. |
| `startForegroundCompat` | `Notification notification` | Arranca en primer plano con el tipo `location`. |
| `requestUpdates` | — | Pide ubicaciones cada segundo con máxima precisión. |
| `onLocationResult` | `LocationResult result` | Recibe un lote de ubicaciones y las procesa. |
| `handle` | `List<Location> locations` | Guarda, calcula distancia y velocidad, actualiza la notificación y decide si parar. |
| `publish` | `boolean recording` | Publica una instantánea para la interfaz. |
| `stopRecording` | `boolean discard` | Cierra el viaje, detiene ubicaciones y servicio. |
| `onDestroy` | — | Cierra el viaje si el sistema mata el servicio. |
| `buildNotification` | `String text` | Crea la notificación del viaje. |

### `android/app/src/main/java/app/vercel/gasolineraplus/trips/TripStore.java`

| Función | Parámetros | Qué hace |
|---|---|---|
| `currentTripId` | `Context context` | Identificador del viaje en curso o nulo. |
| `isAutoDetectEnabled` | `Context context` | Indica si la detección automática está activa. |
| `setAutoDetectEnabled` | `Context context, boolean enabled` | Guarda ese estado. |
| `bluetoothAddress` | `Context context` | Dirección del Bluetooth del coche elegido. |
| `bluetoothName` | `Context context` | Nombre del Bluetooth del coche elegido. |
| `setBluetoothDevice` | `Context context, String address, String name` | Guarda o borra el Bluetooth del coche. |
| `listFinished` | `Context context` | Metadatos de los viajes terminados pendientes de importar. |
| `readPoints` | `Context context, String id` | Puntos de un viaje. |
| `delete` | `Context context, String id` | Borra los ficheros de un viaje. |
| `readText` | `File file` | Lee un fichero de texto. |
| `writeText` | `File file, String text` | Escribe un fichero de texto. |
| `begin` | — | Crea el viaje y sus ficheros y lo marca como en curso. |
| `append` | — | Añade ubicaciones al fichero de puntos. |
| `finish` | — | Marca el viaje como terminado con fin y distancia, o lo borra si se descarta. |
| `readMeta` | — | Lee los metadatos de un viaje. |
| `prefs` | — | Preferencias del grabador. |
| `dir` | — | Carpeta de viajes. |
| `pointsFile` | — | Fichero de puntos de un viaje. |
| `metaFile` | — | Fichero de metadatos de un viaje. |

### `android/app/src/main/java/app/vercel/gasolineraplus/trips/AutoDetect.java`

| Función | Parámetros | Qué hace |
|---|---|---|
| `hasPermissions` | `Context context` | Comprueba ubicación precisa, en segundo plano y actividad física. |
| `enable` | `Context context` | Registra las transiciones de entrar y salir de un vehículo. |
| `disable` | `Context context` | Anula el registro de transiciones. |
| `pendingIntent` | — | Intento que recibe las transiciones. |

### `android/app/src/main/java/app/vercel/gasolineraplus/trips/ActivityTransitionReceiver.java`

| Función | Parámetros | Qué hace |
|---|---|---|
| `onReceive` | `Context context, Intent intent` | Recibe transiciones de actividad y arranca o para el servicio. |
| `onEnterVehicle` | — | Arranca un viaje automático si no hay uno y hay permisos. |
| `onExitVehicle` | — | Avisa al servicio de que el usuario ya no va en coche. |

### `android/app/src/main/java/app/vercel/gasolineraplus/trips/BootReceiver.java`

| Función | Parámetros | Qué hace |
|---|---|---|
| `onReceive` | `Context context, Intent intent` | Reactiva la detección automática tras reiniciar o actualizar la app. |

### `android/app/src/main/java/app/vercel/gasolineraplus/trips/BluetoothReceiver.java`

| Función | Parámetros | Qué hace |
|---|---|---|
| `onReceive` | `Context context, Intent intent` | Reacciona a conexión y desconexión del Bluetooth del coche elegido. |
| `onCarConnected` | `Context context` | Arranca un viaje automático si no hay otro en curso y hay ubicación. |

## iPhone (Swift)

### `ios/App/App/TripRecorderPlugin.swift`

| Función | Parámetros | Qué hace |
|---|---|---|
| `metaURL` | `_ id: String` | Ruta del fichero de metadatos de un viaje. |
| `pointsURL` | `_ id: String` | Ruta del fichero de puntos. |
| `writeMeta` | `_ id: String, _ meta: [String: Any]` | Guarda los metadatos. |
| `readMeta` | `_ id: String` | Lee los metadatos. |
| `readPoints` | `_ id: String` | Lee los puntos. |
| `listFinished` | — | Lista de viajes terminados. |
| `deleteTrip` | `_ id: String` | Borra un viaje. |
| `permissions` | — | Estado de los permisos. |
| `requestForeground` | `_ done: @escaping (` | Pide ubicación con la app abierta. |
| `requestBackground` | `_ done: @escaping (` | Pide ubicación siempre. |
| `requestActivity` | `_ done: @escaping (` | Pide movimiento y actividad física. |
| `flushAuthCallbacks` | — | Resuelve las peticiones de permiso pendientes. |
| `locationManagerDidChangeAuthorization` | `_ manager: CLLocationManager` | Reacciona a un cambio de permiso. |
| `snapshot` | — | Instantánea del viaje en curso. |
| `publish` | — | Envía la instantánea a JavaScript. |
| `start` | `auto: Bool, vehicleId: String?` | Motor: empieza un viaje. |
| `begin` | `id: String, startedAt: Int64, auto: Bool, distance: Double, points: Int` | Motor: crea ficheros y activa la ubicación en segundo plano. |
| `stop` | `discard: Bool = false` | Motor: termina o descarta el viaje. |
| `checkIdle` | — | Motor: para el viaje por inactividad. |
| `locationManager` | `_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]` | Motor: procesa nuevas ubicaciones, guarda puntos y calcula distancia y velocidad. |
| `locationManager` | `_ manager: CLLocationManager, didFailWithError error: Error` | Motor: ignora un fallo puntual de GPS. |
| `setAutoDetect` | `_ enabled: Bool` | Motor: activa o desactiva la detección. |
| `autoDetectPermissionsOk` | — | Motor: comprueba permisos de la detección. |
| `startMonitoring` | — | Motor: escucha la actividad del sistema. |
| `stopMonitoring` | — | Motor: deja de escucharla. |
| `handle` | `activity: CMMotionActivity` | Motor: reacciona a conducir o andar. |
| `considerAutoStart` | — | Motor: mira los últimos minutos por si ya se conduce. |
| `resumeAtLaunch` | — | Motor: retoma un viaje abierto al arrancar. |
| `status` | `_ call: CAPPluginCall` | Plugin: método `status`. |
| `start` | `_ call: CAPPluginCall` | Plugin: método `start`. |
| `stop` | `_ call: CAPPluginCall` | Plugin: método `stop`. |
| `listTrips` | `_ call: CAPPluginCall` | Plugin: método `listTrips`. |
| `readTrip` | `_ call: CAPPluginCall` | Plugin: método `readTrip`. |
| `deleteTrip` | `_ call: CAPPluginCall` | Plugin: método `deleteTrip`. |
| `setAutoDetect` | `_ call: CAPPluginCall` | Plugin: método `setAutoDetect`. |
| `requestForeground` | `_ call: CAPPluginCall` | Plugin: método `requestForeground`. |
| `requestActivity` | `_ call: CAPPluginCall` | Plugin: método `requestActivity`. |
| `requestBackground` | `_ call: CAPPluginCall` | Plugin: método `requestBackground`. |
| `openAppSettings` | `_ call: CAPPluginCall` | Plugin: abre los ajustes de la app. |
| `openBatterySettings` | `_ call: CAPPluginCall` | Plugin: no hace nada en iOS (no existe un ajuste de batería equivalente); solo resuelve la llamada. |

### `ios/App/App/AppDelegate.swift`

| Función | Parámetros | Qué hace |
|---|---|---|
| `application` | `_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?` | Punto de arranque de la app (estándar de Capacitor). |
| `applicationWillResignActive` | `_ application: UIApplication` | Estándar de Capacitor. |
| `applicationDidEnterBackground` | `_ application: UIApplication` | Estándar de Capacitor. |
| `applicationWillEnterForeground` | `_ application: UIApplication` | Estándar de Capacitor. |
| `applicationDidBecomeActive` | `_ application: UIApplication` | Estándar de Capacitor. |
| `applicationWillTerminate` | `_ application: UIApplication` | Estándar de Capacitor. |

### `ios/App/App/SceneDelegate.swift`

| Función | Parámetros | Qué hace |
|---|---|---|
| `scene` | `_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions` | Conexión de la escena (estándar de Capacitor). |
| `scene` | `_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>` | Apertura de enlaces. |
| `scene` | `_ scene: UIScene, continue userActivity: NSUserActivity` | Continuación de actividades. |

## Interfaz pública de los módulos JavaScript

Objetos globales y lo que exponen (lo que devuelve el módulo).

| Global | Fichero | Expone |
|---|---|---|
| `GPNative` | `native.js` | `SITE_URL`, `APK_URL`, `isNative`, `platform`, `accentColor`, `plugin`, `apiBase`, `publicUrl`, `share`, `canShare`, `getPosition`, `hasGeolocation`, `locationPermission`, `openExternal`, `onBack`, `checkForUpdate`, `refreshOfflineData`, `cachedOfflineStations` |
| `GPSplash` | `splash.js` | `begin`, `end`, `whenHidden` |
| `GPSectionLoading` | `splash.js` | `begin(vista)`, `end(vista)`, `track(vista, promesa)` |
| `GPMapGuard` | `map-guard.js` | `install(mapa)` |
| `GPMaps` | `offline-maps.js` | `addBaseLayers(mapa)`, `available()` |
| `OfflineEngine` | `api.js` | `haversine`, `normalize`, `loadData`, `near`, `bbox`, `search`, `station`, `suggestPlaces` (motor local) |
| `Api` | `api.js` | `near`, `search`, `suggestPlaces`, `bbox`, `station`, `history`, `resolvePlace`, `zoneAverage`, `zoneComparison`, `nationalStats`, `statsByFuel`, `statsByProvince`, `priceDistribution` (ver [03](03-api.md) y [04](04-busqueda-y-paridad.md)) |
| `AlertsStore` | `alerts-store.js` | `FUEL_LABELS`, `labelFor`, `unitFor`, `priceText`, `notificationFor`, `get`, `set`, `checkPrices` |
| `GPBackground` | `background.js` | `syncAlerts`, `checkNow` |
| `window.GP` | `app.js` | `showToast`, `switchView`, `currentView`, `openStationModal`, `userPosition`, `ensureMap`, `showMap` |
| `GPPriceIndexCore` | `price-index-core.js` | `cellKey`, `cellsAround`, `haversineKm`, `datesBetween`, `addDays`, `periodOf`, `average`, `nearestDay` |
| `GPPriceIndex` | `price-index.js` | `available`, `sync`, `dayReference`, `periodReference`, `ZONE_RADIUS_KM` |
| `GPFuel` | `fuel-math.js` | `intervals`, `summary`, `monthlySpend`, `savings`, `savingsBy`, `madridDate`, `madridMonth` |
| `GarageStore` | `garage-store.js` | `newId`, `vehicles{list,get,save,remove}`, `refuels{forVehicle,save,remove}`, `trips{forVehicle,all,get,save,remove}`, `setting`, `saveSetting`, `exportAll`, `importAll` |
| `GPBackup` | `backup.js` | `exportBackup`, `importBackup` |
| `GPRecap` | `recap.js` | `compute`, `draw`, `exportImage`, `exportPdf` |
| `GPGarage` | `garage.js` | `refresh`, `activeVehicle`, `summary`, `reload` |
| `GPTripMetrics` | `trip-metrics.js` | `compute`, `thin`, `distance` |
| `GPTrips` | `trips.js` | `importPending`, `saveTrip`, `state` |
| `GPRouter` | `router-core.js` | `Router`, `parseMain`, `parseTile`, `metersBetween` |
| `GPRoute` | `route.js` | `calculate`, `state` |

### Eventos entre módulos (`document`)

| Evento | Emite | Detalle | Escucha |
|---|---|---|---|
| `gp:view` | `switchView` | nombre de la vista | Garaje, viajes, ruta, mapas sin conexión |
| `gp:location` | `requestGeolocation` | `{ lat, lon }` | Ruta (rellena el origen) |
| `gp:vehicle-active` | `announceActive` | `{ id, fuel }` del coche activo | `app.js` (`useVehicleFuel`) |
| `gp:refuel-here` | Ficha de gasolinera | la gasolinera | Garaje (abre el asistente en la pestaña Coche) |
