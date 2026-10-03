# Cambios

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
