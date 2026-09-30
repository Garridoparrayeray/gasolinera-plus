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
| Histórico de gasolineras de solo 10 días en el servidor | Limita el tamaño de SQLite (~50 MB) en Vercel | Histórico completo |
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

## Trampas conocidas

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

## Cosas pendientes o mejorables

- **Base de datos en git:** el proceso diario hace commit de `gasolinera.sqlite` (~50 MB). El historial crece cada día. Conviene publicarla como asset de una release.
- **Release `price-index`:** hasta que el proceso `price-index.yml` complete su primera ejecución (400 días, puede tardar horas), la comparación por semana y por mes no tiene datos y el APK no lleva índice inicial.
- **Pruebas de la interfaz del asistente nuevo:** el test de garaje recorre los pasos, pero no cubre el paso de edición de litros ni el de revisión de km.
- **Código sin uso:** `chooseStationOnMap` (`garage.js`) ya no se llama desde ningún botón.
- **Limpieza de estilos:** `style.css` acumula bloques; unificar reglas repetidas reduciría su tamaño.
- **Bluetooth del coche:** implementado pero desactivado en la 1.0 (ver [08](08-viajes-y-nativo.md)); falta probarlo en móviles reales y volver a declarar el receptor y los permisos en el manifiesto.
- **Firma y distribución:** falta el APK firmado para Google Play y la cuenta de Apple para iOS.
- **Lectura del cuentakilómetros con la cámara** y **adaptador OBD-II** no están hechos.
- **Detección de repostaje saltado por litros:** hoy se decide por kilómetros contra autonomía; comparar litros repostados con litros esperados sería más exacto pero necesita historial de consumo fiable.
- **Notificación de estado de la red:** el modo sin conexión bloquea Estadísticas y avisa en Ruta y en la ficha; el resto sigue funcionando con datos locales.
