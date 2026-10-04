# 08 · Viajes y parte nativa

## Capacitor

La app es la web dentro de un `WebView` con Capacitor 8 (`capacitor.config.json`, `appId app.vercel.gasolineraplus`).

- **Contenido:** `npm run sync` ejecuta `scripts/build-www.mjs`, que genera `www/` (el HTML lo produce PHP: `php api/shell.php` con `GP_NATIVE=1`) y copia `js`, `vendor`, `icons`, `runners`, `style.css`, `manifest.json`, `privacidad.html`, `data/stations-lite.json`, `data/road-graph` y `data/price-index-seed`. Después `cap sync` lo lleva a `android/` e `ios/`.
- **Esquema:** `androidScheme: https` (la app se sirve como `https://localhost`).
- **Llamadas a la API:** `GPNative.apiBase()` devuelve la URL de producción (`https://gasolineraplus.vercel.app`) en la app, cadena vacía en la web. Se puede forzar otra con `window.GP_API_BASE` (solo para pruebas).
- **Plugins oficiales usados:** `App` (botón atrás, enlaces, versión), `Filesystem` (descargas y ficheros), `Share`, `LocalNotifications`, `BackgroundRunner`, `Geolocation`, `App Launcher`.
- **Plugin propio:** `TripRecorder`, en `android/.../trips/` (Java) y `ios/App/App/TripRecorderPlugin.swift`.

`GPNative` (`native.js`) concentra las diferencias: `isNative`, `platform`, `plugin(nombre)`, `apiBase`, `publicUrl`, `share`, `openExternal`, `getPosition` (usa `Geolocation` en app y `navigator.geolocation` en web), botón atrás (`onBack`, `closeTopDialog`: cierra primero el diálogo abierto y, si no hay, retrocede en el historial o minimiza la app), `checkForUpdate` y datos sin conexión.

### Enlaces y navegación

- Los enlaces externos se abren fuera de la app (`openExternal`).
- `appUrlOpen`: enlaces `https://gasolineraplus.vercel.app/stations/<id>` abren esa ficha (Android `assetlinks`/`autoVerify` en `AndroidManifest.xml`).
- Web: `handleDeepLink` lee `?station=` y `?view=`; la ficha empuja `/stations/<id>` al historial (`history.pushState`) para que el botón atrás la cierre.

### Actualizaciones (solo Android)

`checkForUpdate` consulta la última release de GitHub, compara versiones (`isNewer`) y muestra el aviso «Hay una versión nueva» con el enlace del APK.

## Grabación de viajes

### Reparto de trabajo

| Capa | Responsabilidad |
|---|---|
| Nativa (Java/Swift) | Pedir permisos, grabar GPS en segundo plano con la pantalla apagada, guardar cada punto en un fichero, detectar automáticamente cuándo empieza y termina un viaje |
| JavaScript (`trips.js`) | Interfaz, importar los viajes acabados a IndexedDB y calcular métricas (`GPTripMetrics`) |

Los puntos se guardan en ficheros privados de la app hasta que el JS los importa; así un viaje no se pierde aunque la interfaz esté cerrada.

### API del plugin `TripRecorder`

| Método | Descripción |
|---|---|
| `status()` | Estado: `trip` (en directo), `recording`, `autoDetect`, `permissions` (`location`, `background`, `activity`, `notifications`, `bluetooth`, `unrestrictedBattery`), `bluetooth{address,name}`, `sdk` |
| `start({vehicleId})` | Empieza a grabar en manual. Rechaza si falta ubicación precisa |
| `stop()` | Termina y deja el viaje listo para importar |
| `listTrips()` / `readTrip({id})` / `deleteTrip({id})` | Viajes acabados pendientes de importar: lista, puntos (`[t, lat, lon, acc, velocidad, precisiónVel, rumbo, altitud]`) y borrado. No se puede borrar el viaje en curso |
| `setAutoDetect({enabled})` | Activa o desactiva la detección automática. Al activar exige permisos completos |
| `requestForeground()`, `requestActivity()`, `requestBackground()` | Piden ubicación (y notificaciones), actividad física y ubicación «todo el tiempo». Devuelven los permisos |
| `requestBluetooth()`, `bluetoothDevices()`, `setBluetoothDevice({address,name})` | Permiso, dispositivos (Android: emparejados; iPhone: salida de audio actual del coche o CarPlay) y coche elegido (dirección vacía = desactivar) |
| `openAppSettings()`, `openBatterySettings()` | Abre los ajustes del sistema |
| Evento `tripUpdate` | Instantánea del viaje en curso (`recording`, `tripId`, `startedAt`, `distanceM`, `speedMs`, `maxSpeedMs`, `points`, `auto`) |

### Android

**Servicio (`TripService`)**: servicio en primer plano de tipo `location` con una notificación «Viajes». Constantes: precisión máxima 25 m (`MAX_ACCURACY_M`), en movimiento a partir de 2 m/s (`MOVING_MS`), parada automática tras 20 min sin moverse en viajes automáticos (`AUTO_STOP_IDLE_MS`; así un atasco largo no corta el viaje), 2 min tras bajarse del coche (`AFTER_EXIT_IDLE_MS`), 60 min en manuales (`MANUAL_STOP_IDLE_MS`) y descarte de viajes automáticos de menos de 500 m.

Funcionamiento:
1. `onStartCommand` con `ACTION_START` crea el viaje (`TripStore.begin`), arranca el servicio en primer plano y pide actualizaciones cada segundo a `FusedLocationProviderClient` con máxima precisión.
2. `handle` recibe lotes de ubicaciones: los guarda (`TripStore.append`, una línea CSV por punto), ignora los de precisión peor de 25 m, calcula la velocidad (la del GPS o distancia/tiempo), suma distancia solo si hay movimiento y el salto es coherente (< 70 m/s), actualiza la notificación cada 5 s y notifica a la interfaz.
3. Comprueba el criterio de parada según el tipo de viaje.
4. `stopRecording` cierra la escucha, `TripStore.finish` marca el viaje como terminado (o lo borra si se descarta) y detiene el servicio.

**Almacén (`TripStore`)**: directorio `trips/` en `filesDir`. Por viaje, `<id>.csv` (puntos) y `<id>.json` (metadatos: `id`, `startedAt`, `endedAt`, `auto`, `vehicleId`, `finished`, `distanceM`). Guarda también en preferencias (`trip_recorder`) el viaje en curso, el estado de la detección automática y el Bluetooth elegido.

**Detección automática (`AutoDetect`)**: usa la API de transiciones de actividad de Google Play Services (`ActivityRecognition`): entrar o salir de `IN_VEHICLE`. `ActivityTransitionReceiver` recibe la transición: al entrar en el coche arranca `TripService` en modo automático; al salir, `ACTION_VEHICLE_EXIT` para empezar la cuenta de 2 min. `BootReceiver` reactiva la detección tras reiniciar el móvil o actualizar la app. Permisos: ubicación precisa, ubicación en segundo plano y actividad física (`AutoDetect.hasPermissions`).

**Bluetooth del coche (`BluetoothReceiver`).** Receptor declarado en el manifiesto para `ACTION_ACL_CONNECTED` y `ACTION_ACL_DISCONNECTED` (son difusiones protegidas, exentas de las restricciones de Android 8), con los permisos `BLUETOOTH` (hasta Android 11) y `BLUETOOTH_CONNECT`. Si el dispositivo coincide con la dirección elegida (`TripStore.bluetoothAddress`): al conectarse, arranca un viaje automático si no hay otro en curso y hay ubicación; si ya hay uno, envía `ACTION_VEHICLE_ENTER`, que lo reanuda si estaba en pausa y anula la salida pendiente. Al desconectarse llama a `onExitVehicle(context, true)`: el servicio recibe `ACTION_VEHICLE_EXIT` con `quickExit` y termina el viaje a los 60 s de la desconexión si ya no hay movimiento (con la detección por actividad la espera es de 2 min). Si el Bluetooth vuelve antes, `ACTION_VEHICLE_ENTER` anula la salida. `bluetoothDevices()` marca con `car` los dispositivos de clase manos libres o audio de coche (`BluetoothClass`), y la interfaz elige sola el coche si solo hay uno. Requiere emparejar antes el móvil con el coche. Como Android restringe arrancar servicios en primer plano desde segundo plano, la app debe estar excluida del ahorro de batería; si el sistema lo niega se captura la excepción y no se graba.

### iPhone

`TripRecorderPlugin.swift` implementa el mismo contrato. El motor (`TripEngine`) usa `CLLocationManager` (ubicación en segundo plano con `allowsBackgroundLocationUpdates`) y `CMMotionActivityManager` para detectar automóvil:
- Si la actividad es `automotive` con confianza no baja y la detección está activa, arranca un viaje automático.
- Si hay un viaje automático y la actividad pasa a andar, correr o bici, marca la salida del coche.
- `considerAutoStart` mira los últimos 3 minutos de actividad al despertar la app, y `resumeAtLaunch` retoma un viaje que quedó abierto.
- Mismas constantes de precisión (25 m), movimiento (2 m/s), paradas (20 min, 2 min, 60 min) y mínimo de 500 m.
- Los ficheros van a `Application Support/trips`.
- **Coche por Bluetooth o CarPlay.** iOS no avisa a apps de terceros de las conexiones Bluetooth con la app cerrada, así que se usa la salida de audio: `bluetoothDevices()` devuelve las salidas actuales de tipo Bluetooth (A2DP, HFP, LE) o CarPlay (`uid` como `address`), y `setBluetoothDevice` guarda la elegida. `checkCarAudio` se ejecuta al cambiar la salida (`AVAudioSession.routeChangeNotification`), al arrancar y en cada aviso de ubicación (cambios significativos, que siguen activos mientras haya coche elegido). Solo actúa al conectarse de nuevo: arranca un viaje automático o reanuda el pausado. Al desconectarse marca la salida del coche (60 s de espera) en cualquier viaje que no esté en pausa. `carOutputs()` marca con `car` las salidas de CarPlay.

### Web

Sin plugin (`recorder()` es nulo), `startWeb` usa `navigator.geolocation.watchPosition` con alta precisión y pide un **bloqueo de pantalla** (`Wake Lock`) para que no se apague. Si la pestaña vuelve a estar visible, lo vuelve a pedir. Cada 10 puntos guarda el viaje en curso en `settings` (`webTripInProgress`); si el navegador se cierra, `recoverWebTrip` lo recupera y guarda al abrir de nuevo. Al parar, si hay al menos 2 puntos, calcula métricas y guarda; si no, avisa de que el GPS no envió posiciones.

### Importación (`importPending`)

Al abrir la sección Coche o volver a primer plano la app, y cada vez que llega `tripUpdate` con `recording = false`: lista los viajes pendientes, los lee, los guarda con `saveTrip` (que calcula métricas y aligera el recorrido) y los borra del almacén nativo. Después muestra un resumen del último viaje.

### Ajustes y permisos en la interfaz

`renderPermissions` calcula los avisos: la detección automática exige ubicación «todo el tiempo» y actividad física; sin notificaciones no se ve el aviso durante la grabación; sin quitar el ahorro de batería «algunos móviles cortan el GPS». Los botones «Dar permisos» y «Quitar el ahorro de batería» abren los ajustes correspondientes.

## Avisos de bajada de precio

- El usuario activa los avisos en el panel de favoritas (`alerts-toggle`).
- En la app: `enableNativeAlerts` pide permiso de notificaciones y sincroniza las favoritas con el ejecutor en segundo plano (`GPBackground.syncAlerts` → evento `syncFavorites` del `BackgroundRunner`).
- `runners/alerts.js` corre cada 720 minutos (`capacitor.config.json`, `BackgroundRunner`, `autoStart`): por cada favorita pide la ficha, compara con los precios guardados y programa una notificación local si baja al menos 0,002 €.
- En la web, `enableAlerts` pide permiso de notificaciones y registra una sincronización periódica (`periodicSync`, cada 12 h como mínimo). Si el navegador no admite `periodicSync` (o no se puede registrar), los avisos **se activan igualmente** con la advertencia «en este navegador puede que las notificaciones no funcionen con la web cerrada»: se comprueban las bajadas al abrir la app y se muestran con el permiso de notificaciones del navegador. La advertencia sale en el panel de favoritas y en la tarjeta de permisos. Funciona en segundo plano solo con la web instalada desde Chrome en Android. Además `checkAndNotifyDrops` comprueba al abrir la app y el Service Worker emite los avisos (`sw.js`, `notifyPriceDrops`).
- Estado guardado en IndexedDB con `AlertsStore.get/set`: `favorites`, `enabled`, `lastPrices`.

## Mapas sin conexión (`GPMaps`)

- Se descargan de la release `offline-maps` a `Filesystem` (directorio de datos), con progreso, y se comprueba que el dispositivo puede leer rangos de bytes (`canReadRanges`: cabecera «PMTiles» con una petición `Range`), imprescindible para PMTiles.
- La capa base sigue siendo OpenStreetMap; encima se añaden las regiones instaladas con `protomapsL.leafletLayer` (zoom 12–15). Las regiones instaladas se recuerdan en `localStorage` (`gp_offline_maps`) y se validan al abrir la pantalla Coche (`verifyInstalled`).
- Si hay una versión más nueva del mapa, el botón pasa a «Actualizar» y se borra el fichero antiguo al terminar.
- Al abrir la app con Wi-Fi y sin ningún mapa instalado se ofrece descargar el de tu zona una vez (`firstRunHint`).
- Los mapas **no** viajan dentro del APK por tamaño (cientos de MB).

## Protección del scroll con mapas (`GPMapGuard`)

En pantallas táctiles un mapa ocupa gran parte de la pantalla y atrapa el desplazamiento de la página. `install(map)` envuelve el mapa en un contenedor y le pone encima un botón «Toca para mover el mapa» (`createShield`): mientras esté visible, los gestos atraviesan el mapa y la página se desplaza. Al tocarlo, el botón se oculta y el mapa responde. Vuelve a aparecer al tocar cualquier sitio fuera del mapa. Con ratón la rueda no hace zoom salvo que se mantenga Ctrl (o Cmd), con un intervalo mínimo de 250 ms entre pasos.

## Pantalla de carga (`GPSplash`, `GPSectionLoading`)

- `GPSplash`: la página nace con la clase `is-loading` en `<html>`, así que la pantalla «GASOLINERA+» se ve desde el primer instante. Al cargar la página se pide `end()`, que espera a que el + complete un giro (`animationiteration`, o 1,6 s como máximo) antes de ocultarla. Seguros: 8 s en JavaScript (`MAX_MS`) y 10 s en CSS por si el script no llega a ejecutarse. `whenHidden()` devuelve una promesa para retrasar diálogos hasta que se oculte. Con «reducir movimiento» activado la pantalla no se muestra.
- `GPSectionLoading.track(vista, promesa)`: si una sección tarda más de 200 ms, muestra «Cargando…» al inicio de esa vista hasta que termina. Contadores por vista para varias cargas simultáneas. Para la ficha de gasolinera (sin vista propia) el aviso es flotante.
- **Modo sin conexión:** `syncOfflineBanner` alterna la clase `is-offline` en `<html>`. Los elementos `.offline-only` se muestran solo entonces; en Estadísticas se atenúa y bloquea el contenido.

## Service Worker (`sw.js`)

Estrategia **primero red, con caída a caché**, para que las actualizaciones lleguen sin cambiar versiones:
- `/api/*`: intenta la red, guarda la respuesta correcta en `gasolinera-api-v14`; sin red devuelve la última guardada.
- Resto del mismo origen y teselas de OpenStreetMap: igual, en `gasolinera-shell-v14`.
- Al instalarse precachea el «shell» (`SHELL_FILES`): HTML, CSS, scripts, fuentes, Leaflet, Chart.js, iconos y `stations-lite.json`. Al activarse borra cachés de versiones anteriores.
- Si se añade un fichero JS nuevo a la aplicación, debe añadirse también a `SHELL_FILES` para que funcione sin conexión.
