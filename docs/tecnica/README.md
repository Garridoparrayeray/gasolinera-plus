# Gasolinera+ · Documentación técnica

Esta documentación explica cómo está construida la aplicación, por qué se decidió así y cómo funciona cada cálculo, cada pantalla y cada botón. Está escrita para que otra persona pueda continuar el proyecto, por ejemplo rehacer el cálculo de ruta, cambiar la comparación de precios o añadir un carburante.

Los ejemplos de código y los nombres de funciones son literales del repositorio. Los números de línea no se citan porque cambian; usa la búsqueda por nombre.

## Índice

| Documento | Contenido |
|---|---|
| [01 · Arquitectura](01-arquitectura.md) | Capas, núcleo multipaís (países, carburantes, idiomas), carpetas, flujo de una petición, dónde vive cada dato |
| [02 · Datos y procesos automáticos](02-datos-y-procesos.md) | Feed oficial, base SQLite, JSON offline, índice de precios, grafo de carreteras, mapas, flujos de GitHub |
| [03 · API](03-api.md) | Todos los endpoints, parámetro `pais`, carburantes por país, respuestas, caché, límite de peticiones y errores |
| [04 · Búsqueda y paridad](04-busqueda-y-paridad.md) | Normalización, palabras, relevancia, radio, un lite por país y por qué el servidor y el móvil dan lo mismo |
| [05 · Cálculo de ruta](05-ruta.md) | Formato del grafo, snap, A*, corredor de gasolineras, plan de paradas |
| [06 · Cálculos](06-calculos.md) | Consumo, depósito, autonomía, km al día, comparaciones con la media, ahorro, resumen tipo recap, métricas de viaje |
| [07 · Garaje y repostajes](07-garaje-y-repostajes.md) | Almacenamiento local, modelo de datos, asistente por pasos, copias de seguridad |
| [08 · Viajes y parte nativa](08-viajes-y-nativo.md) | Grabación en Android e iPhone, detección automática, Bluetooth, avisos de precio, mapas sin conexión |
| [09 · Interfaz](09-interfaz.md) | Pantallas, diálogos y una fila por cada botón y campo |
| [10 · Referencia de funciones](10-referencia-funciones.md) | Todas las funciones y métodos por fichero |
| [11 · Compilación, despliegue y pruebas](11-compilacion-y-pruebas.md) | Vercel, Capacitor, Android, iOS, GitHub Actions, tests |
| [12 · Convenciones y decisiones](12-convenciones-y-decisiones.md) | Reglas de código, decisiones de diseño, trampas conocidas y pendientes |
| [13 · SEO](13-seo.md) | SEO, indexación y comprobación de producción |

## En una frase

Gasolinera+ muestra los precios oficiales de carburantes de **España, Portugal y Francia** (versión 1.9.2), en español, portugués y francés. Cada país tiene su propia base de datos, sus carburantes, su idioma por defecto y sus rutas (`/pt`, `/fr`), y se puede trazar una ruta entre países. Una **web** (PHP + JavaScript sin framework) y una **app** para Android e iPhone (la misma web dentro de Capacitor, más un plugin nativo para grabar viajes) comparten casi todo el código. Los datos de gasolineras se calculan una vez al día en un proceso automático; el móvil los usa **en local** siempre que puede, para no cargar el servidor. Todo lo personal (coches, repostajes, viajes) se guarda solo en el dispositivo.

## Glosario

| Término | Significado |
|---|---|
| **País** | Entrada de `config/countries.json` (`es`, `pt`, `fr`) con su fuente oficial, base SQLite, lite JSON, carburantes principales, zona horaria, idioma y textos. España es el país por defecto |
| **`?pais=`** | Parámetro que elige el país en la API (`/api/stations/near?...&pais=pt`) y en la web (`/?pais=pt`). Sin él, o con un valor desconocido, se usa `es`. Las rutas `/pt` y `/fr` equivalen a `?pais=pt` y `?pais=fr` |
| **Feed** | Fuente oficial de precios de cada país: Ministerio para la Transición Ecológica (España), DGEG (Portugal) y prix-carburants.gouv.fr (Francia) |
| **IDEESS** | Identificador de una gasolinera en el feed. En Portugal y Francia es el identificador de su fuente; en el cliente se guarda con prefijo de país fuera de España (`GPCountry.stationKey`, por ejemplo `pt:123`) |
| **Lite JSON** | `data/stations-lite.json` (España), `data/stations-lite-pt.json` y `data/stations-lite-fr.json`: todas las gasolineras de un país con sus precios de hoy, para usar sin servidor |
| **Release de datos** | Release de GitHub `data-es`, `data-pt` o `data-fr` donde el proceso diario publica la base comprimida (`gasolinera-<país>.sqlite.gz`) y el lite JSON de cada país. El despliegue y el proceso del día siguiente parten de la última |
| **Slim** | `scripts/slim-database.py`: reduce cada base SQLite (histórico como tabla sin rowid) para que quepa dentro de la función de Vercel |
| **Catálogo de carburantes** | `config/fuels.json`: todos los carburantes (slug, unidad, etiquetas por idioma, nombre en la fuente de cada país, color y grupo). Cada país usa solo los que tienen fuente en su entrada `sources` |
| **Carburante principal / destacado** | `mainFuels` de un país: los que salen primero y en las estadísticas. `headline`: los dos que muestran las listas (por ejemplo `gasoleo_a` y `gasolina_95_e5`; en Francia `gasolina_95_e10`) |
| **Textos de idioma** | `config/i18n/{es,pt,fr}.json`, generados con `tools/i18n/build.py` a partir de los TSV de `tools/i18n/` |
| **Índice de precios** | Medias diarias por país, provincia y cuadrícula de 0,1°, un fichero por mes |
| **Histórico oficial** | Serie de 400 días de precios medios de cada país (España, Portugal, Francia) que usa el garaje para comparar cada repostaje con la media oficial de su país |
| **Grafo de carreteras** | Red de carreteras de España, Portugal y Francia en formato binario propio, para calcular rutas en el móvil. España va incluida; Portugal y Francia se descargan al usarlas |
| **Corredor** | Franja alrededor de una ruta dentro de la cual se buscan gasolineras |
| **Paridad** | Garantía de que el motor local (JS) y el servidor (PHP) devuelven los mismos resultados |
| **Lleno a lleno** | Método para medir el consumo entre dos repostajes con depósito lleno |
| **Repostaje saltado** | Repostaje que no se anotó; corta el tramo de cálculo de consumo |
| **Capacitor** | Envoltorio que empaqueta la web como app nativa y da acceso a plugins |
