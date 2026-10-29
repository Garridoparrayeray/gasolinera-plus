# Cambios

## 1.9.3

### Cambios
- Los precios se actualizan varias veces al día. Antes se guardaba una sola foto de los precios al día, hacia las 5 de la mañana, y se enseñaba hasta el día siguiente: si una gasolinera bajaba el precio después, la app seguía con el antiguo. Ahora se descargan de nuevo cuatro veces al día (a las 3, 9, 15 y 21 h) y el historial guarda el último precio de cada día.
- La app del móvil vuelve a descargar los precios cuando han pasado 3 horas desde la última vez, en lugar de 20.
- La web ya no guarda los precios en el navegador más de unos minutos (antes podía enseñar los de ayer hasta 25 horas).

## 1.9.2

### Cambios
- La cabecera muestra «GASOLINERA+» siempre en una línea y el selector de país flota sobre el contenido en escritorio, sin cortarse.
- Se traducen las notas de estadísticas y los textos «desde ayer» en portugués y francés.

## 1.9.1

### Novedades
- Cada país ofrece todos sus carburantes. Portugal suma la gasolina especial 98, la gasolina de mezcla para motores de 2 tiempos y el GNC en €/m³; Francia pone el SP95-E10 como segunda opción y su gráfica por carburante usa un color distinto para cada uno.
- El coche puede usar cualquier carburante de los tres países.
- En la ficha de cada gasolinera aparece el horario escrito día por día, en el idioma del país.
- Más horarios: Portugal llega al 85 % de las gasolineras y Francia al 67 %. Donde la fuente oficial no trae horario se completa con OpenStreetMap, y nunca se contradice un dato oficial.

### Cambios
- «Abierto ahora» usa la hora local de cada gasolinera: en Portugal y en Canarias salía una hora desfasada.
- Arreglado: en Portugal, elegir «Gasolina especial 98» daba un error de carburante no válido.
- La lista de resultados y las estadísticas de cada país usan sus propios carburantes principales.
- El histórico de 400 días de Francia incluye el SP95-E10 y el E85.

## 1.9.0

### Novedades
- Histórico de 400 días para España, Portugal y Francia: el garaje compara cada repostaje frente a la media oficial de su país.
- Horarios de Portugal: regla de apertura 24 h en autopistas y rescate de horarios desde observaciones.

## 1.2.0

### Novedades
- Gasolinera+ Portugal y Gasolinera+ France. Toca el logo para cambiar de país: cada uno tiene sus precios oficiales del día (DGEG en Portugal, prix-carburants.gouv.fr en Francia), su mapa, sus estadísticas y sus favoritas.
- La app está en español, portugués y francés. Cada país abre en su idioma y se puede cambiar desde el mismo menú.
- Rutas entre países: Bilbao–Lisboa o Madrid–Burdeos con las gasolineras más baratas del camino a ambos lados de la frontera. España viene en la app; los mapas de carreteras de Portugal (14 MB) y Francia (87 MB) se descargan la primera vez que una ruta pasa por allí y se quedan en el móvil.
- Mapas sin conexión de las regiones de Portugal y Francia, agrupados por país.
- Una sola tipografía en toda la app.

### Cambios
- Si abres un país estando fuera de él, la app te enseña sus gasolineras más baratas en vez de buscar cerca de ti.
- Los avisos de bajada de precio vigilan las favoritas de los tres países y llegan en el idioma de la app.
- La copia de seguridad incluye las favoritas de Portugal y Francia.

## 1.1.1

### Cambios
- Consumo medio: con dos repostajes completos a veces no salía la media. Al anotar el segundo, la app comparaba los km recorridos con la autonomía que quedaba en el depósito y no con la de un depósito entero; si pasabas de ese margen (por ejemplo 434 km con un coche de 7 L/100 km), marcaba «falta algún repostaje por anotar» y no contaba el tramo. Ahora compara con lo que da un depósito entero (el del consumo medido o, si aún no hay, el homologado).
- Las marcas de «falta algún repostaje» que se pusieron mal se quitan solas al abrir Coche, y la media se calcula en cuanto se quitan. Si de verdad faltaba un repostaje (muchos más km de los que da un depósito), la marca se queda.

## 1.1.0

### Cambios
- Mapas sin conexión: en Android salía «No se pudo cargar la lista de mapas» y no se podía descargar ninguno. La descarga no crea la carpeta donde guarda el fichero y fallaba la primera vez; ahora la app crea la carpeta antes de descargar. Se ha comprobado con una prueba que imita ese comportamiento de Android.
- Comparación por semanas y por meses (Coche): tenía el mismo fallo al descargar el histórico de precios si la carpeta no existía; arreglado igual.

## 1.0.15

### Cambios
- Resumen: los «Kilómetros recorridos» del mes son ahora los kilómetros hechos de verdad ese mes. Se parte del cuentakilómetros al empezar el mes, calculado entre el último repostaje del mes anterior y el primero del mes (según los días), y se llega al cuentakilómetros actual. Así ya no importa que repostes a primeros de mes o que solo repostes una vez, y cuentan los km que llevas desde el último repostaje.
- Resumen: el consumo medio y el coste por km usan los depósitos completos que se cierran dentro del periodo, aunque el depósito anterior se llenara el mes pasado. Se recalculan con cada repostaje, como en la pestaña Coche.

## 1.0.14

### Cambios
- Resumen: los «Kilómetros recorridos» ya no se contradicen con «Viajes grabados». Los repostajes solo dan los km desde el primero anotado y los viajes solo los que la app ha grabado, así que cada cifra es un mínimo; ahora el resumen enseña el mayor de los dos.
- Historial de viajes y repostajes: las fechas «Desde» y «Hasta» ya no se salen por la derecha en móviles estrechos, la ventana queda centrada y los botones de periodo (30 días, 3 meses, 1 año, Todo) tienen el mismo ancho.
- Avisos de precio de las favoritas: antes avisaban con cualquier bajada de 0,2 céntimos, y por eso saltaban tanto. Ahora se elige la variación mínima (1, 2, 3, 5 o 10 céntimos; por defecto 3) y se puede marcar «Avisarme también cuando suban». El precio de referencia solo cambia cuando se llega al mínimo, así que varias variaciones pequeñas seguidas acaban avisando cuando suman lo bastante.

## 1.0.13

### Cambios
- Resumen: al pulsar «Guardar imagen», «Guardar PDF» o «Compartir imagen», el botón pasa a «Generando…» con un círculo girando mientras se prepara el archivo, y los otros dos botones se bloquean. Así se ve que está trabajando y no se pulsa varias veces.

## 1.0.12

### Cambios
- Resumen (imagen y PDF): los «Kilómetros recorridos» solo contaban hasta el último repostaje del periodo y no sumaban lo conducido después. Ahora van desde el último repostaje anterior al periodo (o el primero del periodo, si no hay anterior) hasta el cuentakilómetros actual, que incluye los viajes grabados. Y ya salen con un solo repostaje.

## 1.0.11

### Cambios
- Viajes: algunos viajes salían sin el coste en € (y sin el consumo estimado). Pasaba cuando el viaje grabado con la app cerrada se guardaba antes de que el garaje estuviera cargado, y no se sabía ni el consumo ni el precio del último repostaje. Ahora se carga el garaje antes de calcular, y los viajes que ya se quedaron sin coste lo recuperan al abrir la lista de viajes.

## 1.0.10

### Cambios
- Coche → «Lo que pagas frente a la media»: los botones «Por semana» y «Por mes» no hacían nada y solo se veía «Por repostaje». Ahora cambian el gráfico y los ahorros a semanas y a meses (la app usa el histórico que descarga en el móvil).

## 1.0.9

### Cambios
- Gasolineras favoritas en modo oscuro: los nombres salían en negro sobre fondo oscuro y no se leían; ahora salen en blanco.
- Ficha de un viaje: cuando es más larga que la pantalla, el título y la X de cerrar se quedan fijos arriba al bajar, en vez de cortarse.

## 1.0.8

### Cambios
- La imagen y el PDF del resumen ya no salen apretados: cada dato tiene su espacio y la imagen se alarga lo necesario, de modo que la última línea («Velocidad máxima») ya no se pisa con «Hecho con Gasolinera+».

## 1.0.7

### Cambios
- Las sugerencias del buscador («Getxo», etc.) se ven por encima del mapa y ya no quedan tapadas por él.
- Se quita la flechita ▲ que aparecía junto al carburante en la cabecera de la tabla al ordenar por precio: no aportaba nada.
- Web en el ordenador: la barra superior (logo y precios medios) se ve siempre, en todas las pestañas, y no solo en Buscar. El mapa de Ruta se ajusta a la altura que queda.
- Android: el resumen en foto y en PDF, y el botón de compartir, funcionan en la app: se abre el menú de Android para guardar el archivo o enviarlo. Antes no hacía nada porque el sistema de la app no permite descargar ni compartir ficheros de la otra forma.

## 1.0.6

### Cambios
- Buscar un lugar y ordenar por «Más barata»: primero salen todas las gasolineras que caen dentro del radio que has elegido, de más barata a más cara, y después las que quedan fuera del radio. Antes las del propio municipio salían todas primero, aunque fueran más caras que las de alrededor (en «Getxo» salían primero tres a 1,888 € y 1,889 €, y después otras a 1,669 €). Además, al buscar un lugar el radio elegido se aplica de verdad alrededor de ese lugar (antes se usaban siempre 10 km).
- Web en el ordenador: la opción seleccionada del menú lateral ocupa todo el ancho y sin redondeo, y la banda de precios medios va de borde a borde, pegada arriba y sin esquinas redondeadas, y el logo de Gasolinera+ forma una sola barra superior con ella; el menú (Buscar, Ruta, Coche…) empieza debajo de esa barra.

## 1.0.5

### Cambios
- Aviso de ahorro de batería: la app solo puede leer el ajuste estándar de Android, no el que tienen algunos móviles por su cuenta, así que decía «Con ahorro de batería» aunque ya lo hubieras quitado. Ahora no afirma nada del estado: es un recordatorio fijo («desactiva el ahorro de batería para Gasolinera+ para que los viajes se graben con la app cerrada») con un botón que abre los ajustes de batería. Sale en Coche cuando usas la detección automática, el Bluetooth o estás grabando, y en Info → Permisos.

## 1.0.4

### Cambios
- Arreglo: al abrir la app podía empezar un viaje solo. Al abrirla se volvía a registrar la detección automática y Google devolvía al instante la última actividad que recordaba, aunque fuera vieja, y se tomaba como «acabas de subir al coche». Ahora se ignora lo que llegue en los 30 segundos siguientes a abrir la app y las lecturas de más de 3 minutos. La detección se sigue recuperando sola al abrir la app si Android la había olvidado.
- Si la detección automática arranca un viaje y en 3 minutos no te has movido, se descarta sin guardarlo ni dejar el aviso de grabación (en Android y en iPhone).

## 1.0.3

### Cambios
- Bluetooth del coche: ves todos tus dispositivos Bluetooth (los conectados ahora y los que parecen un coche salen primero) y eliges tú cuál es el coche con «Añadir». Puedes tener varios coches y quitar cada uno con «Quitar». Ya no elige nada por su cuenta.
- Si falta el permiso de dispositivos cercanos lo pide y reintenta, y si el Bluetooth está apagado o no hay permiso lo dice en vez de dejar la lista vacía.
- El viaje empezado por Bluetooth termina un minuto después de desconectarte, en cuanto ya no te mueves (antes esperaba dos). Si el Bluetooth se corta con el coche en marcha o vuelves a conectarte, el viaje sigue.
- El texto de ayuda explica cuándo termina el viaje.

## 1.0.2

### Novedades
- Web en el ordenador rediseñada: menú lateral, buscador en una fila, resultados en tabla con el mapa y la ficha de la gasolinera al lado, y paneles nuevos en Coche y Estadísticas.
- Estadísticas: cifras clave del día y las provincias más baratas y más caras, con el gráfico completo a un clic.
- Información: tarjeta «Gasolinera+ en tu móvil» con las funciones que solo están en el móvil, la descarga para Android y cómo instalarla en iPhone.
- Cifras del día en una banda destacada con acceso directo a Estadísticas.
- Pie de página con secciones, la app y enlaces del proyecto.
- Favoritas y Comparar se abren en un panel lateral derecho; el comparador resalta el precio más bajo de cada carburante.
- Pausa en los viajes: botón «Pausar» junto a «Terminar viaje» (también en la notificación de Android). El tiempo y los kilómetros en pausa no cuentan y la detección automática no corta el viaje mientras está en pausa.
- Historial de viajes y repostajes: en Coche salen los 10 últimos y «Ver todo el historial» abre el resto con filtro de fechas y carga por páginas.
- Viajes por el Bluetooth del coche: eliges tu coche y el viaje empieza al conectarte y termina al desconectarte. Si lo habías pausado para repostar, se reanuda al volver a conectarte. En Android funciona con la app cerrada; en iPhone se detecta también CarPlay, al abrir la app o cuando la detección automática la despierta.

### Cambios
- En el ordenador ya no aparecen las funciones del móvil: grabar viajes, «Repostar aquí», «Actualizar km», mapas sin conexión, avisos en segundo plano ni la ventana de ubicación al entrar.
- Detección automática de viajes: ahora también arranca si la activas con el viaje ya empezado o si el móvil se pierde el aviso de «has subido al coche» (Android comprueba la actividad cada minuto; iPhone mira la actividad reciente al activarla).
- Las copias de seguridad conservan las pausas de cada viaje, y la lista de viajes se actualiza al importar una copia o al abrir la app directamente en Coche.
- Aviso de actualización: «Hay un parche nuevo» lleva a la página de versiones de GitHub con las novedades y se puede cerrar (no vuelve a salir para esa versión).
- Carga más rápida: el mapa añade las gasolineras por tandas, los scripts se cargan en diferido y la web ya no descarga la librería de mapas sin conexión.

## 1.0.1

### Novedades
- Instalación en el ordenador: botón «Instalar en el ordenador» en la pestaña Info.
- Nivel del depósito: punto de partida al crear o editar el coche y nivel estimado al terminar cada repostaje.
- Consumo real entre llenados completos, con margen de error y aviso para llenar hasta el primer clic cuando llevas varios repostajes parciales.
- Resumen mensual con comparación del precio medio frente al mes anterior.
- Sugerencias y errores con un diseño nuevo, y textos más grandes en pantallas de ordenador.

### Cambios
- Viajes: los tramos sin señal GPS (túneles) se miden con su velocidad media real y se indican en la ficha del viaje.
- Viajes automáticos: esperan 20 minutos parados antes de cortar, para no partir un atasco largo.
- Se eliminan los acelerones, los frenazos y la puntuación de conducción.
- El enlace de descarga de Android abre la página de la última versión.

## 1.0.0

Primera versión pública de Gasolinera+.

### Precios y búsqueda
- Gasolineras cercanas con precios oficiales del Ministerio, actualizados a diario, con filtros de carburante, radio, orden y horario.
- Búsqueda por pueblo, calle, código postal o marca, también con varias palabras («repsol amorebieta»).
- Mapa con agrupación de puntos y mapa de calor de precios.
- Sin ubicación, la portada muestra las gasolineras más baratas de España.
- Ficha de gasolinera con tendencias, horario, comparación con la zona y gráfico de 14 días.
- Favoritas, comparador (hasta 5) y avisos de bajada de precio.
- Estadísticas: media nacional, carburantes, provincias, distribución de precios e histórico por gasolinera.

### Ruta
- Ruta calculada en el propio dispositivo, sin servicios externos.
- Opción «Evitar peajes», como en Google Maps.
- Gasolineras del camino, plan de paradas según el depósito y coste estimado del trayecto.

### Tu coche
- Garaje con varios coches, consumo real (lleno a lleno), coste por kilómetro y depósito estimado.
- Asistente de repostaje por pasos, con precio del día, confirmación de litros y comprobación de kilómetros.
- Comparación de lo que pagas con la media de España y de tu zona, por repostaje, semana y mes.
- Resumen exportable en imagen y PDF, con datos de repostajes y viajes.
- Copia de seguridad: exportar e importar (también desde el garaje vacío).

### Viajes
- Grabación manual con la pantalla apagada y detección automática de viajes (Android e iPhone).
- Notificación «Viaje en curso» que abre la pantalla del viaje.
- Métricas: distancia, velocidades (también en túneles y tramos sin señal) y consumo estimado.

### Aplicación y datos
- Android e iPhone con la misma base que la web.
- Datos de gasolineras, mapa de carreteras e índice de precios incluidos en la app; funciona sin conexión con aviso visible.
- Mapas sin conexión descargables por comunidad (con Wi-Fi).
- Sección «Permisos y privacidad», guía de uso en la app y en PDF.
- Todo lo personal se guarda solo en el dispositivo.

### No incluido todavía
- Viaje automático al conectar el Bluetooth del coche (código presente pero desactivado).
