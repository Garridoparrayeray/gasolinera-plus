# 11 · Compilación, despliegue y pruebas

## Entorno local

Requisitos: PHP 8.3 con `sqlite3`, `pdo_sqlite`, `curl` y `mbstring`; Node 22 (las pruebas usan el WebSocket nativo); Python 3 para las comprobaciones estáticas; Edge o Chrome para las pruebas de interfaz; JDK 21 y Android SDK para la app de Android; macOS y Xcode para iOS.

```
php scripts/build-database.php --mode=backfill --days=14   # una vez: histórico real
php scripts/build-database.php --mode=daily                # snapshot de hoy (y genera el lite JSON)
php -S localhost:8021 dev-router.php                       # servidor local
```

`dev-router.php` imita el enrutado de Vercel: `/api/*` a `api/index.php`; `/` y `/stations/*` a `api/shell.php`; ficheros estáticos tal cual; oculta `/api/shell.php` directo.

Datos opcionales para probar todo en local:
- Grafo de carreteras (ruta): `node tools/graph/fetch-graph.mjs` lo baja de la release a `data/road-graph/`.
- Índice de precios semilla: `node tools/price-index/fetch-index.mjs` lo baja a `data/price-index-seed/`.

## Producción (Vercel)

`vercel.json`:
- `installCommand: "true"` (no hay `npm install`), `buildCommand: node scripts/vercel-build.mjs`, `outputDirectory: public`.
- `scripts/vercel-build.mjs` baja el grafo de carreteras (si no hay, avisa y sigue) y copia a `public/` los ficheros estáticos: `js`, `vendor`, `icons`, `style.css`, `sw.js`, `manifest.json`, `privacidad.html`, `data/stations-lite.json` y `data/road-graph`.
- La función PHP es `api/*.php` con el runtime `vercel-php@0.9.0` y una lista de exclusiones (`excludeFiles`) para que no se empaqueten datos grandes ni código de cliente (`public/**`, lite JSON, grafo, `js/**`, `vendor/**`, `tests/**`, etc.). Es imprescindible: sin ella el tamaño supera el límite de la función.
- Reescrituras: `/api/(.*)` → `api/index.php`; `/` y `/stations/(.*)` → `api/shell.php`. Redirecciones: la base SQLite, `scripts/`, `tests/`, `tools/` y `dev-router.php` redirigen a `/`.
- Región `cdg1` (París).
- `git.deploymentEnabled.main = false`: **Vercel no despliega solo desde `main`**. El despliegue lo lanza el flujo `rebuild-schedule.yml` con Vercel CLI (`vercel deploy --prod`). Necesita los secretos `TOKEN_GASOLINERA`, `TEAM_ID` y `PROJECT_ID`.

Regla aprendida: `api/shell.php` debe existir físicamente dentro de `api/` para que Vercel la reconozca como función.

## App nativa

```
npm ci
npm run sync:android      # genera www/ y lo copia a android/
npm run sync:ios          # ídem para ios/
cd android && ./gradlew assembleDebug
```

- `scripts/build-www.mjs` genera `www/`: el HTML sale de `php api/shell.php` con `GP_NATIVE=1` (sin analítica ni Service Worker) y se copian los recursos.
- La versión sale de `package.json`: `versionName = version` y `versionCode = mayor·10000 + menor·100 + parche`.
- **Firma:** el APK de release se firma con `android/keystore.properties` (fuera de git) o, en CI, con `ANDROID_KEYSTORE_BASE64` y `ANDROID_KEYSTORE_PASSWORD` (alias `gasolinera`). **Si se pierde la clave, los usuarios no podrán actualizar encima de su instalación y perderían los datos locales.** Sin clave, `assembleRelease` genera un APK sin firmar.
- **APK de prueba:** en cada push a `feat/**`, `build-apps.yml` compila un APK de depuración (instalable sin clave) y lo publica en la release `android-debug`, que sirve para probar. **Desde la 1.0, la pestaña Info enlaza la página de la última release firmada** (`releases/latest`, donde se descarga `gasolinera-plus.apk`; el enlace directo al fichero se quedaba al 100 % en algunos navegadores), que publica el mismo flujo al subir una etiqueta `vX.Y.Z` con los secretos `ANDROID_KEYSTORE_BASE64` y `ANDROID_KEYSTORE_PASSWORD`. El APK de prueba y el de release tienen firmas distintas: no se pueden instalar uno encima del otro.
- **iOS:** proyecto con Swift Package Manager; en CI compila para el simulador sin firmar. Distribuirlo exige cuenta de Apple Developer.
- **Plugins:** los oficiales de Capacitor están en `package.json`; el propio está en `android/.../trips` y `ios/App/App/TripRecorderPlugin.swift`. El manifiesto de Android declara permisos de ubicación (también en segundo plano), actividad física, notificaciones, servicio en primer plano de tipo ubicación, arranque, Bluetooth y el receptor Bluetooth.

## Pruebas

| Prueba | Dónde | Qué comprueba |
|---|---|---|
| `tests/static-checks.py` | CI y local | `id` que busca el JS y no existen en `shell.php`; `id` de CSS sin elemento; sintaxis de PHP (`php -l`) y de JS (`node --check`); **ausencia de ternarios**; ejecuta los tests unitarios |
| `tests/api-smoke.py` | CI | La API contra datos reales |
| `tests/api-parity.mjs` + `tests/parity-lib.js` | CI | Que `OfflineEngine` y la API PHP devuelven lo mismo (mismas gasolineras, orden y distancias con tolerancia de 0,02 km) para cuatro centros (Bilbao, Madrid, Sevilla, Soria), consultas de marca y lugar, y los dos carburantes principales |
| `tests/fuel-math.test.mjs` | Estáticas | Consumo lleno a lleno, depósito, ahorros |
| `tests/price-index-core.test.mjs`, `price-index-test.php` | Estáticas | Medias del índice, celdas, periodos y la generación del índice |
| `tests/trip-metrics.test.mjs` | Estáticas | Limpieza, franjas, eco, consumo |
| `tests/router.test.mjs` | Flujo del grafo | Rutas de referencia sobre el grafo |
| `tests/opening-hours-test.php`, `rate-limit-test.php`, `trend-test.php` | Estáticas | Horarios, límite de peticiones, tendencias |
| `tests/ui-battery.mjs`, `ui-garage.mjs`, `ui-route.mjs` | CI | La interfaz en móvil y escritorio con un navegador sin cabeza, incluido el modo sin conexión |
| `tests/ui-trips.mjs` | Manual | Interfaz de viajes |
| `tests/android-e2e.mjs`, `android-trip.mjs` | Manual | Prueba en emulador de Android con GPS simulado |
| `tests/cdp.mjs`, `android-helpers.mjs` | Utilidades | Control del navegador por protocolo DevTools sin dependencias |

Ejecución local:

```
python tests/static-checks.py
python tests/api-smoke.py
node tests/api-parity.mjs
node tests/ui-battery.mjs
```

El flujo `tests.yml` se ejecuta en cada push a una rama distinta de `main`, y en pull requests. En él, antes de las pruebas de paridad se regenera el lite JSON de la base con `--mode=lite`.

### Lo que hay que tocar en pares

- **Cambio en la búsqueda:** `Station.php` **y** `OfflineEngine` en `api.js`. Ejecuta la paridad.
- **Fichero JS nuevo:** añadirlo a `api/shell.php` (orden de carga), a `SHELL_FILES` de `sw.js` y, si es un módulo con ID nuevos, a las comprobaciones estáticas (ya recorren `js/*.js` solas).
- **Nuevo control en la interfaz:** su `id` debe existir en `shell.php` y en el CSS si se estiliza por `id`; la comprobación estática lo verifica.
- **Cambio de esquema en IndexedDB:** subir `DB_VERSION` y añadir la migración.
- **Nuevo carburante:** `FUEL_FIELD_MAP` (`build-database.php`), `KNOWN_FUELS` (controlador), `FUEL_LABELS` (`alerts-store.js`) y las opciones de `filter-fuel`. Para que tenga comparación histórica, `INDEX_FUELS` (`build-price-index.php`).
