# 01 · Arquitectura

## Capas

```
                    Ministerio (feed JSON)
                            │  cada día, GitHub Actions
                            ▼
              scripts/build-database.php
              ├─ data/gasolinera.sqlite   (servidor PHP)
              └─ data/stations-lite.json  (web y app, uso local)

  Navegador / WebView (Capacitor)
  ├─ api/shell.php  → HTML de una sola página
  ├─ js/*.js        → lógica de cliente (sin framework, sin bundler)
  ├─ IndexedDB      → coches, repostajes, viajes (solo en el dispositivo)
  ├─ localStorage   → favoritas, comparador, preferencias
  └─ Filesystem     → (app) índice de precios, mapas sin conexión

  Servidor (Vercel + PHP)
  └─ api/index.php  → API JSON sobre SQLite (solo lectura)
```

No hay base de datos de usuarios ni cuentas. El servidor solo sirve datos públicos de gasolineras.

## Carpetas

| Ruta | Contenido |
|---|---|
| `api/` | Servidor PHP: `index.php` (entrada de la API), `shell.php` (HTML de la web), `Core/` (peticiones, respuestas, caché, límite), `Controllers/`, `Models/`, `Services/`, `Config/` |
| `js/` | Cliente. Un fichero por módulo, cada uno es una función que se ejecuta al cargar y expone un objeto global (`GPFuel`, `GPRoute`…) |
| `runners/` | `alerts.js`, código que el sistema ejecuta en segundo plano para los avisos de precio |
| `scripts/` | Procesos de datos y compilación: `build-database.php`, `build-price-index.php`, `build-www.mjs`, `vercel-build.mjs` |
| `tools/` | Herramientas de generación pesada: grafo de carreteras (`graph/`), mapas (`maps/`), descarga del índice (`price-index/`) |
| `data/` | Datos generados: base SQLite, JSON offline. El grafo y el índice no se guardan en git |
| `android/`, `ios/` | Proyectos nativos de Capacitor con el plugin propio de viajes |
| `tests/` | Pruebas de PHP, de JavaScript y de la interfaz |
| `vendor/` | Librerías de terceros incluidas tal cual (Leaflet, Chart.js, protomaps…) |
| `docs/` | Esta documentación |
| `.github/workflows/` | Procesos automáticos |

## Cómo se conectan los módulos JS

Todos los ficheros se cargan como `<script>` clásicos, en el orden de `api/shell.php`. Cada módulo es una función autoejecutada que devuelve su interfaz pública:

```js
const GPFuel = (() => { ...; return { intervals, summary, ... }; })();
```

Por eso el orden importa: un módulo solo puede usar los que se cargan antes o los que sean llamados después de que todo esté cargado (dentro de funciones).

| Módulo | Responsabilidad |
|---|---|
| `native.js` (`GPNative`) | Detecta si es app nativa, URL base del servidor, plugins, compartir, ubicación, actualizaciones |
| `splash.js` (`GPSplash`, `GPSectionLoading`) | Pantalla de carga inicial y aviso «Cargando…» por sección |
| `map-guard.js` (`GPMapGuard`) | Evita que el mapa atrape el scroll de la página en pantallas táctiles |
| `offline-maps.js` (`GPMaps`) | Mapas de teselas sin conexión |
| `api.js` (`OfflineEngine`, `Api`) | Motor local de búsqueda y capa de peticiones al servidor con caída a local |
| `alerts-store.js` (`AlertsStore`) | Etiquetas de carburantes y comprobación de bajadas de precio |
| `background.js` (`GPBackground`) | Sincroniza favoritas con el ejecutor en segundo plano |
| `app.js` | Pantalla de precios, mapa, estadísticas, ficha de gasolinera, favoritas, comparador, avisos |
| `price-index-core.js`, `price-index.js` | Medias históricas: cálculo puro y sincronización del índice |
| `fuel-math.js` (`GPFuel`) | Consumo, depósito, autonomía, gasto mensual, ahorro |
| `garage-store.js` (`GarageStore`), `backup.js` | IndexedDB y copias de seguridad |
| `recap.js` (`GPRecap`) | Resumen exportable en imagen y PDF |
| `garage.js` (`GPGarage`) | Pantalla Coche, asistente de repostaje, comparaciones |
| `trip-metrics.js`, `trips.js` | Métricas de un viaje y pantalla de viajes |
| `router-core.js`, `router-worker.js`, `route.js` | Cálculo de ruta y pantalla Ruta |

## Flujo de una búsqueda de gasolineras

1. El usuario pulsa **Buscar gasolineras** (`stations-search-btn`) o cambia un filtro.
2. `loadStationsPage` construye una clave de petición (modo, texto, ubicación, filtros, página). Si ya hay una carga en curso con esa misma clave, se ignora el clic; si es distinta, se encola una sola.
3. `Api.near` o `Api.search` decide dónde resolver:
   - **`near` (cerca de ti) y `bbox` (puntos del mapa) en la app nativa:** siempre el motor local `OfflineEngine` sobre el lite JSON descargado en el móvil. No hay petición.
   - **`near` y `bbox` en la web:** petición a `/api/...`; si no hay red, cae a `OfflineEngine`.
   - **`search` (búsqueda por texto), en web y en app:** petición al servidor; si no hay red, cae a `OfflineEngine`. El servidor la cachea.
4. `renderList` pinta las tarjetas y `refreshMapMarkers` los puntos del mapa.

Los detalles están en [04 · Búsqueda y paridad](04-busqueda-y-paridad.md).

## Dónde vive cada dato

| Dato | Dónde | Cómo se pierde |
|---|---|---|
| Gasolineras y precios de hoy | SQLite (servidor) y lite JSON (web y móvil) | Se regeneran cada día |
| Histórico por gasolinera | SQLite, 10 días de retención | Se recorta solo |
| Medias históricas (índice) | Ficheros mensuales JSON publicados en una release de GitHub; el móvil los guarda en `Filesystem` | Se vuelven a descargar |
| Coches, repostajes, viajes, ajustes | IndexedDB `gasolinera-garage` | Solo si se borran los datos de la app; hay copia de seguridad manual |
| Favoritas, comparador, preferencias | `localStorage` | Igual |
| Viajes grabados por el plugin nativo | Ficheros en el almacenamiento privado de la app hasta que la interfaz los importa a IndexedDB | Se borran al importarlos |
| Mapas sin conexión | `Filesystem` (app) | El usuario los borra |

## Decisiones de arquitectura

- **Sin framework ni bundler.** La aplicación se entiende leyendo los ficheros y no depende de una cadena de compilación. Coste: los módulos usan globales y el orden de carga importa.
- **Local primero.** Con 10.000 usuarios, si cada consulta llamara al servidor, la carga sería enorme. En la app, la lista de gasolineras cercanas y los puntos del mapa se resuelven en el móvil, igual que las rutas y las comparaciones históricas (índice de precios). El servidor atiende la búsqueda por texto, la ficha de una gasolinera y las estadísticas, con caché.
- **Caché agresiva en el servidor.** Las respuestas correctas llevan `Cache-Control: public, max-age=300, s-maxage=3600, stale-while-revalidate=3600` y las coordenadas de la petición se redondean, de modo que muchos usuarios comparten la misma respuesta cacheada.
- **Datos personales solo en el dispositivo.** No hay cuentas ni servidor de usuarios: menos coste, menos superficie de privacidad. La contrapartida es que la copia de seguridad es manual.
- **Un solo código para web y app.** La app es la misma web empaquetada con Capacitor; solo cambian la URL base de la API y los plugins nativos.
