# Funcionalidades por versión

Gasolinera+ muestra los precios oficiales de **España, Portugal y Francia** (versión 1.9.2) y existe en cuatro formas. Este documento dice qué hace cada una y qué necesita.

| Versión | Cómo se usa | Datos de gasolineras |
|---|---|---|
| **Web** | Navegador, `gasolineraplus.vercel.app` (España), `/pt` (Portugal) y `/fr` (Francia) | Servidor (API PHP) y, si están descargados, copia local |
| **Web instalable (PWA)** | "Añadir a pantalla de inicio" | Igual que la web, con caché del navegador |
| **Android** | APK (prueba: enlace en la pestaña Info) | Copia local descargada; el servidor solo si falta |
| **iPhone** | Compilación de iOS (Capacitor) | Igual que Android |

## Países e idiomas

| | España | Portugal | Francia |
|---|---|---|---|
| Dirección web | `/` | `/pt` | `/fr` |
| Idioma con el que abre | Español | Portugués | Francés |
| Fuente oficial de precios | Ministerio para la Transición Ecológica | DGEG | prix-carburants.gouv.fr |
| Carburantes destacados en listas | Gasóleo A y Gasolina 95 | Gasóleo simples y Gasolina simples 95 | Gazole y SP95-E10 |
| Carburantes del selector (principales) | Gasóleo A, Gasolina 95, Gasóleo Premium, Gasolina 98, AdBlue, GLP | Gasóleo simples, Gasolina simples 95, Gasóleo especial, Gasolina 98, GPL Auto | Gazole, SP95-E10, SP95, SP98, E85, GPLc |
| Otros carburantes | Gasolinas E10, E25, E85 y premium, gasóleo B, GNC, GNL, hidrógeno, biocarburantes… | Gasolina especial 95 y 98, gasóleo colorido, gasolina de mistura, GNC (en €/m³ y en kg), GNL, biodiésel | Ninguno más: la fuente francesa solo trae esos seis |
| Hora de «abierto ahora» | Hora peninsular y de Canarias | Hora de Portugal continental y de Azores | Hora de París |
| Histórico oficial de precios | 400 días | 400 días | 400 días |

- **Cambiar de país o de idioma.** Se toca el logo y aparece el selector. El país y el idioma son independientes: se puede ver Portugal en español. La app recuerda la última elección y cada país guarda sus propias favoritas, comparador, carburante elegido y copia de precios sin conexión.
- **Idiomas.** Toda la app (menús, avisos, resumen, ficha, horarios) está en español, portugués y francés. Los avisos de bajada de precio llegan en el idioma de la app.
- **Coche.** El coche puede usar cualquier carburante de los tres países, para viajar con él sin cambiar su configuración.
- **Si estás fuera del país elegido.** La app no busca «cerca de ti»: enseña las gasolineras más baratas de ese país y lo avisa.
- **Garaje.** Cada repostaje se compara con la media oficial de su país.

## Matriz de funciones

| Función | Web / PWA | Android | iPhone |
|---|---|---|---|
| Elegir país (España, Portugal, Francia) e idioma (es, pt, fr) | Sí | Sí | Sí |
| Buscar gasolineras cerca, por radio, combustible, horario y orden | Sí | Sí | Sí |
| «Abierto ahora» con la hora local de la gasolinera y horario escrito día por día en la ficha | Sí | Sí (sin red, la ficha enseña el horario sin interpretar) | Sí (igual) |
| Estadísticas y mapa de calor de cada país con sus propios carburantes principales | Sí | Sí | Sí |
| Búsqueda por nombre, calle, municipio, CP o varias palabras ("repsol amorebieta") | Sí | Sí | Sí |
| Mapa con agrupación de puntos y mapa de calor de precios | Sí | Sí | Sí |
| Mapas y datos sin conexión | Parcial (caché) | Sí | Sí |
| Mapas sin conexión por regiones, agrupadas por país (España, Portugal, Francia) | No | Sí | Sí |
| Ruta con desvío y gasolineras en el camino | Sí | Sí | Sí |
| Ruta entre países (Bilbao–Lisboa, Madrid–Burdeos) con las gasolineras más baratas a ambos lados de la frontera | Sí | Sí | Sí |
| Favoritas y comparador | Sí | Sí | Sí |
| Garaje: coches, repostajes, consumo, coste por km | Sí | Sí | Sí |
| Asistente de repostaje por pasos | Sí | Sí | Sí |
| Comparación con la media oficial del país y de la zona (día, semana, mes), con histórico de 400 días | Sí | Sí | Sí |
| Resumen tipo recap en imagen o PDF | Sí | Sí | Sí |
| Grabar viaje manualmente | Solo con la pantalla encendida | Sí, con la pantalla apagada | Sí, con la pantalla apagada |
| Detección automática de viajes (actividad física) | No | Sí | Sí |
| Viaje automático al conectar el Bluetooth del coche | No | No incluido en la 1.0 (desactivado) | No (iOS no lo permite) |
| Avisos de precio de favoritas | Se pueden activar, pero en el navegador puede que no lleguen con la web cerrada (funcionan en Chrome de Android con la web instalada) | Sí | Sí |
| Copia de seguridad del garaje (exportar e importar), con las favoritas de los tres países | Sí | Sí | Sí |

## Rutas entre países

El mapa de carreteras de España viene dentro de la app. Los de Portugal (unos 14 MB) y Francia (unos 87 MB) se descargan la primera vez que una ruta pasa por allí y se quedan en el móvil; sin ellos, la ruta no se puede calcular fuera de España. Para buscar gasolineras a lo largo de la ruta, la app carga también las gasolineras de cada país que atraviesa. El origen y el destino se pueden escribir en cualquiera de los tres países.

## Dónde se guardan tus datos

Coches, repostajes y viajes se guardan **solo en tu dispositivo**. No se envían al servidor. Cambiar de móvil o borrar los datos del navegador los pierde: usa "Exportar copia" en el garaje.

## Anotar un repostaje

El asistente tiene 6 pasos y se puede cancelar en cualquiera:

1. **Gasolinera.** Al abrir salen tus favoritas y las cercanas (hasta 25 km), de cerca a lejos. Se puede buscar por nombre, calle o municipio, o seguir sin nombre. Con nombre, el resumen sabrá dónde repostas más y a qué precio.
2. **Fecha y precio.** El precio se rellena con el de hoy en esa gasolinera o, si la fecha es anterior, con la media de ese día en la zona o en España (según el histórico local). Se puede cambiar.
3. **Total pagado.**
4. **Litros.** Se calculan a partir del total y el precio. Se confirma con "Sí, es correcto" o se edita en una pantalla propia con OK y Atrás.
5. **Kilómetros.** Se proponen según tu ritmo de km al día. Si la cifra no cuadra (menos que la anterior, un salto muy grande o más que el repostaje siguiente), se pide confirmación, no se bloquea.
6. **Comprobación.** Resumen y casilla de depósito lleno. Si los litros son menos del 25 % del depósito, se desmarca "lleno" solo. Si faltan muchos km respecto a lo que da un depósito, se marca automáticamente "falta un repostaje" y ese tramo no cuenta para el consumo.

Al editar un repostaje ya guardado se ve el formulario completo en una sola pantalla.

## Cómo se calcula

- **Consumo medio:** entre dos repostajes con depósito lleno, litros ÷ km × 100. Hasta tener dos llenos se usa el consumo homologado.
- **Repostaje saltado:** el tramo se descarta del consumo y del coste por km.
- **Frente a la media:** se compara tu precio con la media nacional y con la de tu zona (radio de 10 km alrededor de la gasolinera) del mismo día, del histórico guardado en el dispositivo.
- **Km estimados al día:** (km del último repostaje − km del primero) ÷ días. Necesita al menos 2 repostajes con 7 días entre ellos.

## Grabar viajes

Hay tres formas, de menos a más automática. Se pueden combinar.

1. **Manual.** Botón "Empezar viaje". En web solo graba con la pantalla encendida; en la app nativa sigue con la pantalla apagada.
2. **Detección automática por actividad** (Android e iPhone). El sistema detecta que vas en coche y la app empieza y termina sola. Necesita ubicación "Permitir todo el tiempo" y permiso de actividad física.
3. **Bluetooth del coche** (solo Android). **No está disponible en la versión 1.0**: el código existe pero está desactivado hasta probarlo bien. Empezaría al conectarse a un Bluetooth concreto y terminaría al desconectarse.
   - Hay que emparejar antes el móvil con el coche en los ajustes de Bluetooth del sistema.
   - Necesita ubicación "Permitir todo el tiempo", permiso de Bluetooth y quitar el ahorro de batería a Gasolinera+. Sin eso, Android puede negar arrancar la grabación con la app cerrada.
   - Si no quieres emparejar nada, usa la opción 1 o la 2.

Todo el recorrido se guarda en el móvil. Los viajes automáticos de menos de 500 m se descartan.

## Permisos por función

| Función | Permisos |
|---|---|
| Gasolineras cerca de ti | Ubicación mientras se usa la app |
| Viaje manual | Ubicación precisa y notificaciones |
| Detección automática | Ubicación siempre, actividad física, notificaciones |
| Bluetooth del coche | Ubicación siempre, Bluetooth (Android 12+), sin ahorro de batería |
| Avisos de precio | Notificaciones |

## Rendimiento y límites

- En la app, la lista de gasolineras cercanas y el mapa se resuelven con los datos guardados en el móvil de cada país, sin cargar el servidor. La búsqueda por texto sí consulta el servidor (con caché) y usa los datos locales cuando no hay red.
- Las respuestas del servidor se guardan en caché y las coordenadas se redondean para que muchas personas compartan la misma respuesta. Hay un límite de peticiones por usuario.
- El radio de la búsqueda por texto solo descarta marcas y calles lejanas; un municipio o código postal se busca sin límite de distancia.
- Cualquier sección que tarde más de 0,2 s muestra "Cargando…" hasta terminar.

## Cosas que aún no están

- Compilación firmada de Android (Play Store) y distribución de iOS.
- Viajes por Bluetooth en iPhone (no es posible con las API públicas de iOS).
- Lectura del cuentakilómetros con la cámara (foto).
- Adaptador OBD-II.
