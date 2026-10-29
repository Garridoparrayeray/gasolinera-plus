# 12 · Convenciones y decisiones

## Reglas de código

| Regla | Detalle | Cómo se comprueba |
|---|---|---|
| **Sin operador ternario** (ni `?:` en PHP) | Se usa `if`/`else`. Vale para JS, PHP, scripts y tests | `tests/static-checks.py` falla en CI |
| **Sin comentarios de código** | El código debe explicarse con nombres claros; el porqué de las decisiones vive en esta documentación | Revisión |
| **Sin frameworks ni bundler** | JavaScript clásico, módulos autoejecutados, orden de carga en `shell.php` | — |
| **Español** | Textos de interfaz, mensajes, documentación. Los identificadores de código mezclan inglés (técnico) y español (dominio: `gasolinera`, `repostaje`) | — |
| Sangría de 4 espacios, comillas simples en JS, `const`/`let` | Como el resto del código | — |
| Errores esperables no rompen la pantalla | `try/catch` con caída a otra fuente o a un estado vacío; nunca un fallo en blanco | — |
| Cada `id` del JS debe existir en `shell.php`; cada `id` del CSS, en `shell.php` o en el JS | | `static-checks.py` |
| Todo fichero nuevo del cliente entra en `SHELL_FILES` de `sw.js` | Si no, la app no arranca sin conexión | `static-checks.py` verifica que existan |
| Sin `Co-Authored-By` en los commits | Decisión del autor | — |

Patrón de módulo:

```js
const GPAlgo = (() => {
    const CONSTANTE = 10;
    const state = {};

    function interna() {}

    return { publica };
})();
```

Patrón de carga con estado: funciones que lanzan trabajo asíncrono devuelven la promesa y usan un candado o una clave (`stationsLoading`, `calculating`, `savingRefuel`, `modalLoadingId`) para que pulsar varias veces no lance varias cargas.

Patrón de «Cargando…»: `GPSectionLoading.track(vista, promesa)`. Cualquier sección que pueda tardar más de 200 ms debe envolver su trabajo con él.

## Estilos (CSS)

- Un único `style.css`. Los colores son variables en `:root` con una redefinición para el modo oscuro (`prefers-color-scheme: dark`). Nunca un color suelto que no exista en ambos modos.
- Paleta: negro y naranja. `--accent-bg` (naranja) y `--btn-ink` (negro) para botones; `--header-bg` para la cabecera.
- Esquemas de espacio y tamaño pensados para móvil primero; cambios de diseño de ordenador a partir de 1024 px.
- Esquinas rectas: existe una regla global `* { border-radius: 0 !important }` con excepciones puntuales (puntos del mapa, indicadores redondos).
- **Trampa conocida:** una regla `display` de una clase anula el atributo `hidden`. Por eso hay reglas como `.refuel-step[hidden]`, `.garage-check[hidden]` o `#offline-banner[hidden]`. Si un elemento con `display: flex/grid/block` en su clase debe poder ocultarse con `hidden`, añade su regla `[hidden] { display: none }`.
- **Trampa conocida:** el CSS se añade por bloques al final del fichero con un encabezado de tema; las últimas reglas ganan. Antes de añadir una regla nueva, busca si ya hay otra para el mismo selector.

## Decisiones de diseño y sus razones

| Decisión | Razón | Alternativa descartada |
|---|---|---|
| Datos personales solo en el dispositivo | Privacidad, coste cero de servidor, sin cuentas | Servidor de usuarios |
| Índice de medias agregado en meses y celdas | Comparar «tu precio frente a la media del día y de tu zona» sin guardar cada precio de cada gasolinera de cada día (serían gigabytes) | Guardar todo el histórico por gasolinera |
| Histórico de gasolineras de solo 10 días en el servidor | Limita el tamaño de SQLite en Vercel (la de España pesa unos 80 MB con esos 10 días y las tres bases juntas rozan el límite de la función; ver [11](11-compilacion-y-pruebas.md)) | Histórico completo |
| Serie nacional sin recorte | Es pequeña (una fila por día y carburante) y sirve a Estadísticas | Recortarla también |
| Ruta calculada en el dispositivo | Sin servicio externo, sin coste, funciona sin conexión, privacidad | API de rutas de pago |
| Grafo en formato binario propio con teselas | Carga rápida y poca memoria en el móvil | GeoJSON o servicio remoto |
| «Desvío» como distancia perpendicular a la ruta | Cálculo instantáneo para miles de gasolineras | Calcular un desvío en tiempo para cada gasolinera |
| Mapas vectoriales sin conexión (PMTiles) por comunidad, descarga opcional | Pesan cientos de MB; Google Play limita el tamaño de instalación | Meterlos en el APK |
| Consumo «lleno a lleno» | Es el único método fiable sin lector del coche | Estimar por velocidad |
| Los avisos de km y de depósito no bloquean: piden confirmar | El usuario manda; pero los datos dudosos se señalan | Rechazar entradas |
| Consumo de un viaje relativo al estilo del conductor | Con pocos datos, una cifra absoluta por velocidad es poco fiable | Constantes universales |
| Sin seguimiento de usuarios: la web usa solo Vercel Web Analytics (agregada, anónima y sin cookies) y la app no lleva analítica | Privacidad | Herramientas de analítica con perfiles |
| Un solo HTML generado por PHP | El mismo servidor sirve la web y genera el paquete de la app | Fichero estático |
| Los precios diarios se publican en releases de GitHub (`data-es`, `data-pt`, `data-fr`) y no como commits | Una base de ~80 MB commiteada cada día hacía crecer el historial de git sin límite. La release se sobrescribe y conserva solo la de hoy y la anterior (`gasolinera-<país>-anterior.sqlite.gz`) | `git commit` diario de `data/gasolinera.sqlite` (lo que se hacía hasta la 1.1.1; el último `chore: snapshot diario` es del 20/10/2026) |
| Una base SQLite y un lite JSON por país (`config/countries.json`) | Cada país se importa, se valida y se publica por separado: si falla la fuente de uno, los otros siguen y la app muestra el que falla como próximamente. Cada consulta abre una sola base y el esquema no necesita columna de país | Una base única con todos los países |
| Adelgazar solo la copia que se despliega (`scripts/slim-database.py`) | La función de Vercel no admite más de ~110 MB de bases. Adelgazar `price_history` no cambia el contenido y deja intactas las bases de las releases, que sirven de partida del día siguiente | Adelgazar la base original (cambiaría el proceso diario) o quitar histórico |
| Ninguna rama despliega a producción: una rama solo da una vista previa (con `road-graph-test`) | Probar un cambio sin tocar la web de la que depende la app instalada. `vercel deploy --prod` exige `github.ref == 'refs/heads/main'` | Dejar que Vercel despliegue ramas y `main` solos (`git.deploymentEnabled.main = false`) |
| Tras desplegar a producción se comprueba que responde (`Check that production answers`), y `check-production.yml` mira lo que ve Google | Un despliegue puede salir «bien» y dar 500 en la API (pasó con el peso de las bases) | Esperar a que alguien lo note |
| Las fusiones a `main` son por *squash* | El repositorio no admite commits de fusión; cada pull request queda como un solo commit en `main` (el último `Merge pull request` es el #28; después, cada cambio es un commit) | Fusión con commit de fusión o *rebase* |
| El favicon tiene direcciones propias: `/favicon.ico` e `/icons/favicon-48.png`, `-96.png` y `-192.png`, declarados en todas las páginas (`api/shell.php` y `api/seo.php`) | Google guarda el favicon por URL y no vuelve a leer una dirección que ya conoce, así que cambiar el logo sin cambiar la dirección no actualizaba el icono en los resultados | Sustituir el contenido de `icons/icon-192.png` |
| Precios de los tres países cuatro veces al día (03:00, 09:00, 15:00 y 21:00), con el último precio del día en el historial | Los precios cambian durante el día; con una sola foto hacia las 05:00 la app enseñaba precios de hasta 30 horas (foto del día anterior más 20 h de caché en el móvil y hasta 25 h de caché del fichero en la web) | Pedir el feed al Ministerio en cada consulta (carga y rompe el límite del servicio) o actualizar cada hora o cada 3 horas (más despliegues de Vercel, con 127 MB cada uno, y poca mejora) |

## Trampas conocidas

- **Las ejecuciones programadas de GitHub llegan tarde:** las programadas a las 03:17, 05:41 y 07:13 UTC se ejecutaban entre las 08:00 y las 14:15 UTC (hasta unas 5 horas de retraso). La hora fiable la da el servicio externo que llama a `workflow_dispatch`; la programación de GitHub es solo un respaldo. Si se añaden franjas de actualización, hay que añadirlas en ese servicio externo, no solo en el `cron` del workflow.
- **Orden de los `<script>`:** importa. Un módulo que use otro en la fase de carga (no dentro de una función) debe ir después.
- **`search` y `near` deben coincidir** entre PHP y JavaScript (ver [04](04-busqueda-y-paridad.md)).
- **Fechas:** siempre pasar a hora de Madrid para agrupar por día o mes. No usar `toISOString().slice(0, 10)` para eso.
- **Coordenadas:** en el grafo van en millonésimas de grado (enteros). En el resto, en grados con decimales.
- **IndexedDB:** las escrituras piden persistencia. Los datos se pierden si el usuario borra los datos de la app; por eso existe la copia de seguridad.
- **Vercel:** la función PHP tiene lista de exclusión de ficheros; si se añade una carpeta grande, hay que excluirla o el despliegue falla por tamaño.
- **Nominatim (OpenStreetMap):** exige identificarse en el `User-Agent` y limita el uso. La geocodificación se cachea 30 días; no la uses en bucle.
- **Android en segundo plano:** para que el Bluetooth del coche arranque un viaje con la app cerrada, el móvil debe permitir a la app ignorar el ahorro de batería. Algunos fabricantes son más agresivos.
- **iOS:** sin Bluetooth de coche. La detección automática usa movimiento y ubicación «Siempre».
- **Índice de precios:** solo cinco carburantes. Un coche con otro no tendrá comparación histórica.
- **Vercel, peso de la función:** las bases SQLite se empaquetan dentro de la función y el total no puede pasar de ~110 MB. Con las tres sin adelgazar (117 MB) toda la API daba `500 FUNCTION_INVOCATION_FAILED`; con 107 MB funcionaba. Si crece una base o se añade un país, mide el total desplegado antes de dar por bueno el despliegue (ver [11](11-compilacion-y-pruebas.md)).
- **WAL en una función de solo lectura:** `build-database.php` abre las bases con `journal_mode = WAL`, que deja ficheros `-wal` y `-shm` junto a la base. La función las abre con `mode=ro&immutable=1` (`Core\Database`) y la función de Vercel no escribe junto a la base, por eso `slim-database.py` pasa la copia desplegada a `journal_mode = DELETE`. Una base con WAL no debe llegar sola a producción.
- **Las bases adelgazadas no son las de las releases:** no subas a una release la base ya adelgazada ni la uses como partida del día siguiente sin saber que `price_history` cambió de forma; el flujo actual solo adelgaza dentro del job `deploy`.
- **Google guarda el favicon por URL:** para que cambie el icono o el logo en los resultados hay que cambiar la dirección del fichero (por eso `favicon-48/96/192.png`) y declararla en todas las páginas.
- **Sitemaps leídos durante una caída:** si la API da 500, `sitemap-<país>.xml` también (lo genera la función). Search Console guarda esa lectura como error y tarda en volver a leerlos; no hace falta tocar nada, pero conviene comprobarlos con `check-production.yml` tras arreglar el fallo y volver a enviarlos.
- **Un sitemap no debe incluir páginas de zona sin nombre:** cuatro gasolineras francesas con la provincia vacía generaban `/fr/stations-service/`, que es el índice de zonas; `Seo` las excluye.
- **La vista previa de una rama usa el grafo `road-graph-test`:** las bases son las mismas releases `data-<país>` que en producción, pero el grafo puede ser de otra versión que el de `road-graph`.
- **Pull requests y pruebas:** `tests.yml` solo corre en push a `main`, en pull requests y a mano. Una rama sin pull request no pasa pruebas hasta que se abre uno.

## Cosas pendientes o mejorables

- **Base de datos en git:** los datos diarios ya van a releases y no hay commits diarios, pero `data/gasolinera.sqlite` (unos 80 MB, de octubre de 2026) y `data/stations-lite.json` siguen versionados como base de partida; cualquier commit que los cambie vuelve a engordar el historial. Convendría sacarlos de git y que la primera ejecución parta solo de la release `data-es`.
- **Margen del peso de la función:** con las bases adelgazadas el total queda en torno a 107 MB y el límite está cerca de 110 MB. No hay una comprobación automática del peso: solo se detecta por el paso de comprobación de producción tras fallar. Convendría medirlo en el flujo y avisar antes de desplegar.
- **Dominio propio:** la web y la API viven en `gasolineraplus.vercel.app` (así lo usan la app nativa, los sitemaps y `check-production.yml`). Un dominio propio permitiría separar la identidad del alojamiento y mantener las direcciones aunque cambie de proveedor; exigiría cambiar `SITE_URL` en `js/native.js`, la dirección base de `Seo.php`, las URL de los flujos y volver a enviar los sitemaps a Search Console.
- **Comprobación de producción solo manual:** `check-production.yml` no se lanza solo; si un sitemap o una página vuelven a fallar, nada avisa hasta que alguien lo ejecuta (el paso del despliegue solo mira seis direcciones).
- **Pruebas de países sin cobertura en CI móvil:** `android-countries.mjs`, `android-e2e.mjs` y `android-trip.mjs` son manuales y necesitan emulador; `tests.yml` no las ejecuta.
- **Horarios:** parte de las gasolineras de Portugal (15 %) y Francia (33 %) sigue sin horario porque ni la fuente oficial ni OpenStreetMap lo traen.
- **Release `price-index`:** hasta que el proceso `price-index.yml` complete su primera ejecución (400 días, puede tardar horas), la comparación por semana y por mes no tiene datos y el APK no lleva índice inicial.
- **Pruebas de la interfaz del asistente nuevo:** el test de garaje recorre los pasos, pero no cubre el paso de edición de litros ni el de revisión de km.
- **Código sin uso:** `chooseStationOnMap` (`garage.js`) ya no se llama desde ningún botón.
- **Limpieza de estilos:** `style.css` acumula bloques; unificar reglas repetidas reduciría su tamaño.
- **Bluetooth del coche:** implementado pero desactivado en la 1.0 (ver [08](08-viajes-y-nativo.md)); falta probarlo en móviles reales y volver a declarar el receptor y los permisos en el manifiesto.
- **Firma y distribución:** falta el APK firmado para Google Play y la cuenta de Apple para iOS.
- **Lectura del cuentakilómetros con la cámara** y **adaptador OBD-II** no están hechos.
- **Detección de repostaje saltado por litros:** hoy se decide por kilómetros contra autonomía; comparar litros repostados con litros esperados sería más exacto pero necesita historial de consumo fiable.
- **Notificación de estado de la red:** el modo sin conexión bloquea Estadísticas y avisa en Ruta y en la ficha; el resto sigue funcionando con datos locales.
