# Gasolinera+ · Documentación técnica

Esta documentación explica cómo está construida la aplicación, por qué se decidió así y cómo funciona cada cálculo, cada pantalla y cada botón. Está escrita para que otra persona pueda continuar el proyecto, por ejemplo rehacer el cálculo de ruta, cambiar la comparación de precios o añadir un carburante.

Los ejemplos de código y los nombres de funciones son literales del repositorio. Los números de línea no se citan porque cambian; usa la búsqueda por nombre.

## Índice

| Documento | Contenido |
|---|---|
| [01 · Arquitectura](01-arquitectura.md) | Capas, carpetas, flujo de una petición, dónde vive cada dato |
| [02 · Datos y procesos automáticos](02-datos-y-procesos.md) | Feed oficial, base SQLite, JSON offline, índice de precios, grafo de carreteras, mapas, flujos de GitHub |
| [03 · API](03-api.md) | Todos los endpoints, parámetros, respuestas, caché y límite de peticiones |
| [04 · Búsqueda y paridad](04-busqueda-y-paridad.md) | Normalización, palabras, relevancia, radio y por qué el servidor y el móvil dan lo mismo |
| [05 · Cálculo de ruta](05-ruta.md) | Formato del grafo, snap, A*, corredor de gasolineras, plan de paradas |
| [06 · Cálculos](06-calculos.md) | Consumo, depósito, autonomía, km al día, comparaciones con la media, ahorro, resumen tipo recap, métricas de viaje |
| [07 · Garaje y repostajes](07-garaje-y-repostajes.md) | Almacenamiento local, modelo de datos, asistente por pasos, copias de seguridad |
| [08 · Viajes y parte nativa](08-viajes-y-nativo.md) | Grabación en Android e iPhone, detección automática, Bluetooth, avisos de precio, mapas sin conexión |
| [09 · Interfaz](09-interfaz.md) | Pantallas, diálogos y una fila por cada botón y campo |
| [10 · Referencia de funciones](10-referencia-funciones.md) | Todas las funciones y métodos por fichero |
| [11 · Compilación, despliegue y pruebas](11-compilacion-y-pruebas.md) | Vercel, Capacitor, Android, iOS, GitHub Actions, tests |
| [12 · Convenciones y decisiones](12-convenciones-y-decisiones.md) | Reglas de código, decisiones de diseño, trampas conocidas y pendientes |

## En una frase

Gasolinera+ muestra los precios oficiales de carburantes de España. Una **web** (PHP + JavaScript sin framework) y una **app** para Android e iPhone (la misma web dentro de Capacitor, más un plugin nativo para grabar viajes) comparten casi todo el código. Los datos de gasolineras se calculan una vez al día en un proceso automático; el móvil los usa **en local** siempre que puede, para no cargar el servidor. Todo lo personal (coches, repostajes, viajes) se guarda solo en el dispositivo.

## Glosario

| Término | Significado |
|---|---|
| **Feed** | API pública del Ministerio para la Transición Ecológica con precios de todas las gasolineras |
| **IDEESS** | Identificador de una gasolinera en el feed |
| **Lite JSON** | `data/stations-lite.json`: todas las gasolineras con sus precios de hoy, para usar sin servidor |
| **Índice de precios** | Medias diarias por país, provincia y cuadrícula de 0,1°, un fichero por mes |
| **Grafo de carreteras** | Red de carreteras de España en formato binario propio, para calcular rutas en el móvil |
| **Corredor** | Franja alrededor de una ruta dentro de la cual se buscan gasolineras |
| **Paridad** | Garantía de que el motor local (JS) y el servidor (PHP) devuelven los mismos resultados |
| **Lleno a lleno** | Método para medir el consumo entre dos repostajes con depósito lleno |
| **Repostaje saltado** | Repostaje que no se anotó; corta el tramo de cálculo de consumo |
| **Capacitor** | Envoltorio que empaqueta la web como app nativa y da acceso a plugins |
