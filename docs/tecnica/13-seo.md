# 13 · SEO e indexación

Este documento explica cómo se generan las páginas que ven los buscadores, qué entra en los mapas de sitio, cuándo una página se indexa, cómo se comprueba que producción responde y cómo se opera en Google Search Console y Bing Webmaster Tools. Se desarrolló después de la versión 1.1.1 (14/10/2026).

Resumen: la aplicación es una página de una sola pantalla que se pinta con JavaScript, así que lo que leen los buscadores es HTML que genera PHP en el servidor. Hay dos generadores: `api/shell.php` (portada y fichas de gasolinera, que además son la propia aplicación) y `api/seo.php` (páginas de zona y de municipio, mapas de sitio, `robots.txt`, `llms.txt`, 404 y redirecciones). Los dos comparten `api/Services/Seo.php`.

## Páginas que existen y quién las genera

| URL (España) | Equivalente en Portugal y Francia | Generador | Qué es |
|---|---|---|---|
| `/` | `/pt`, `/fr` | `api/shell.php` | Portada: la aplicación completa con cabecera SEO y JSON-LD de `WebSite` y `WebApplication` |
| `/stations/{ideess}` | `/pt/stations/{id}`, `/fr/stations/{id}` | `api/shell.php` | Ficha de una gasolinera: la misma aplicación abierta en la ficha, con cabecera SEO propia |
| `/gasolineras` | `/pt/postos`, `/fr/stations-service` | `api/seo.php` (`seoIndexPage`) | Índice de zonas del país con medias nacionales |
| `/gasolineras/{zona}` | `/pt/postos/{zona}`, `/fr/stations-service/{zona}` | `api/seo.php` (`seoAreaPage`) | Zona (provincia, distrito o departamento): precios medios, más baratas y lista de municipios |
| `/gasolineras/{zona}/{municipio}` | ídem con su prefijo | `api/seo.php` (`seoAreaPage`) | Municipio: medias, ranking y tabla de hasta 100 gasolineras |
| `/sitemap.xml` | — | `api/seo.php` (`seoSitemapIndex`) | Índice de mapas de sitio |
| `/sitemap-es.xml`, `/sitemap-pt.xml`, `/sitemap-fr.xml` | — | `api/seo.php` (`seoSitemap`) | Mapa de sitio de cada país |
| `/robots.txt` | — | `api/seo.php` (`seoRobots`) | Reglas para rastreadores y dirección del mapa de sitio |
| `/llms.txt` | — | `api/seo.php` (`seoLlms`) | Resumen del sitio y de la estructura de URLs para asistentes de IA que lo consulten |

Los textos (títulos, descripciones, frases de introducción) salen de `config/i18n/{es,pt,fr}.json`, claves `seo.*`, mediante `Seo::t`. La lengua la fija el perfil del país.

### Reglas de `vercel.json`

Las URLs no existen como ficheros: son `rewrites` hacia una función PHP. El país lo decide `Core\Country::code()` por el prefijo de la ruta (`/pt`, `/fr`); sin prefijo es España. Dentro de `api/seo.php`, el prefijo se quita de `$path` y se guarda en `$_GET['pais']`.

| Regla (`source`) | Destino |
|---|---|
| `/` | `api/shell.php` |
| `/(pt|fr)` y `/(pt|fr)/` | `api/shell.php` |
| `/stations/(.*)` | `api/shell.php` |
| `/(pt|fr)/stations/(.*)` | `api/shell.php` |
| `/robots.txt`, `/sitemap.xml`, `/llms.txt` | `api/seo.php` |
| `/sitemap-(es|pt|fr).xml` | `api/seo.php` |
| `/gasolineras` y `/gasolineras/(.*)` | `api/seo.php` |
| `/pt/postos` y `/pt/postos/(.*)` | `api/seo.php` |
| `/fr/stations-service` y `/fr/stations-service/(.*)` | `api/seo.php` |
| `/api/(.*)` | `api/index.php` (la API, ver [03 · API](03-api.md)) |

Al ser un `rewrite` y no una redirección, la URL del navegador no cambia. `favicon.ico` y `/icons/*` son ficheros estáticos y no pasan por PHP.

## `api/Services/Seo.php`

| Elemento | Qué hace |
|---|---|
| `Seo::PROFILES` | Un perfil por país: `section` (la palabra de la ruta: `gasolineras`, `postos`, `stations-service`), `lang`, `locale`, `iso` y los cuatro carburantes que se muestran en las tablas |
| `Seo::profile($code)` | Devuelve el perfil del país actual (o del indicado) con el campo `headline`, los dos carburantes titulares que vienen de `config/countries.json` |
| `Seo::sectionUrl()` | Ruta del índice de zonas con prefijo: `/gasolineras`, `/pt/postos`, `/fr/stations-service` |
| `Seo::stationPath($ideess)` | Ruta de una ficha: `/stations/{id}`, `/pt/stations/{id}`, `/fr/stations/{id}` |
| `Seo::siteUrl()` | Dirección base del sitio, sin barra final. Lee la variable de entorno `GP_SITE_URL`; si no existe, `https://gasolineraplus.vercel.app`. Todas las URLs absolutas (canonical, hreflang, sitemaps, JSON-LD, `og:image`) cuelgan de ella |
| `Seo::base()` | `siteUrl()` más el prefijo del país |
| `Seo::verificationToken()` | Valor de la metaetiqueta `google-site-verification`; viene de `GP_GSC_VERIFICATION` o, si no está, de un valor fijo en el código |
| `Seo::slug($texto)` | Minúsculas, sin tildes ni diacríticos, todo lo no alfanumérico pasa a `-`. Es la clave de las URLs de zona y de municipio |
| `Seo::display($nombre)` | Nombre legible: pasa `ALICANTE/ALACANT` o `Coruña (A)` a `A Coruña`, y convierte a tipo título lo que venga en mayúsculas |
| `Seo::provinces($pdo)` | Zonas del país con su `slug`, nombre y número de gasolineras. **Descarta las zonas cuyo `slug` sale vacío** |
| `Seo::municipalities($pdo, $zona)` | Municipios de una zona. Si dos nombres distintos dan el mismo `slug` los agrupa en una sola entrada (`raws`) |
| `Seo::freshClause()` | Condición SQL de «vigente»: `last_seen_date` de la gasolinera dentro de los 10 días anteriores a la última fecha vista en la tabla. Se usa en medias, rankings, tabla de municipio y sitemap |
| `Seo::averages`, `Seo::cheapest` | Medias/mínimo/máximo por carburante y gasolineras más baratas, siempre con `freshClause()` |
| `Seo::nationalHeadline` | Precio medio nacional de los dos carburantes titulares con su variación; lo usa la portada |
| `Seo::stationJsonLd` | JSON-LD `GasStation` con dirección, coordenadas, horario (`OpeningHours::specification`, o `Mo-Su 00:00-23:59` si es 24 h) y un `Offer` por carburante con precio |
| `Seo::breadcrumb` | JSON-LD `BreadcrumbList` |
| `Seo::jsonLd` | Serializa a `<script type="application/ld+json">` escapando etiquetas y `&` |

Datos estructurados que emite el sitio:

| Página | JSON-LD |
|---|---|
| Portada | `WebSite` y `WebApplication` (gratuita: `Offer` con precio 0) |
| Ficha de gasolinera | `GasStation` y `BreadcrumbList` (Gasolinera+ › sección › zona › gasolinera) |
| Índice de zonas | `BreadcrumbList` |
| Zona y municipio | `BreadcrumbList` e `ItemList` (`seoCheapestJsonLd`: las 10 más baratas del primer carburante titular, solo si hay datos) |

Las fichas de `api/shell.php` solo se generan si no es una compilación nativa (`GP_NATIVE=1`, que usa `scripts/build-www.mjs`); en ese caso no hay consulta a la base ni SEO.

## Mapas de sitio

`/sitemap.xml` (`seoSitemapIndex`) lista un `<sitemap>` por cada país que tenga base de datos (`Country::withData()`): `/sitemap-es.xml`, `/sitemap-pt.xml`, `/sitemap-fr.xml`. Su `lastmod` es la fecha de hoy.

`/sitemap-{pais}.xml` (`seoSitemap`) contiene, por este orden:

| Tipo de URL | Condición | `changefreq` | `priority` |
|---|---|---|---|
| Portada del país | siempre | daily | 1.0 |
| Índice de zonas | siempre | daily | 0.9 |
| Zona | `Seo::provinces`: tiene nombre | daily | 0.8 |
| Municipio | tiene **2 o más** gasolineras | daily | 0.6 |
| Ficha de gasolinera | pasa `freshClause()` y tiene al menos una fila en `current_prices` | daily | 0.5 |

Por qué no entran otras:

| URL que se queda fuera | Razón |
|---|---|
| Municipio con una sola gasolinera | La página sería prácticamente la ficha de esa gasolinera: contenido duplicado. Además lleva `noindex, follow` (ver más abajo) |
| Ficha de gasolinera sin precio vigente o no vista en los últimos 10 días | Una página sin precios o desactualizada aporta poco y es la que más probablemente se cierre o cambie |
| Zona sin nombre | Su `slug` sería vacío y la URL sería `/fr/stations-service/`, igual que el índice. Lo evita `Seo::provinces` con `continue` (cambio de la PR #37; afectaba a cuatro gasolineras francesas) |
| `/api/`, `/data/`, `/scripts/`, `/tests/` | `robots.txt` los desautoriza |

Todas las URLs del mismo fichero llevan como `lastmod` la fecha de la última actualización de precios del país (`Seo::lastUpdate`), no la de cada página.

### Límites de Google y tamaños actuales

Un mapa de sitio admite como máximo 50.000 URLs y 50 MB sin comprimir. Por eso hay un fichero por país bajo un índice. Tamaños aproximados actuales (octubre de 2026):

| Mapa | URLs aproximadas | Holgura frente a 50.000 |
|---|---|---|
| `/sitemap-es.xml` | 13.300 | Más de 3 veces |
| `/sitemap-pt.xml` | 3.500 | Más de 14 veces |
| `/sitemap-fr.xml` | 9.660 | Más de 5 veces |

Cada entrada ocupa unos 200 bytes, así que ninguno se acerca a los 50 MB (el mayor ronda los 3 MB; es una estimación, no una medida). Si un país superara las 50.000 URLs habría que partir su mapa en varios ficheros y listarlos en el índice.

## Reglas de indexación

| Página | `robots` | Canonical |
|---|---|---|
| Portada y portada de país | `index, follow` | La propia (`siteUrl` + prefijo + `/`) |
| Ficha de gasolinera existente | `index, follow` | `siteUrl` + `Seo::stationPath` |
| Ficha con identificador que no existe (`api/shell.php`) | `noindex, follow` | La portada del país; responde 200 con la aplicación |
| Índice de zonas | `index, follow` | `siteUrl` + `Seo::sectionUrl()` |
| Zona | `index, follow` | `siteUrl` + sección + `/{zona}` |
| Municipio con 2 o más gasolineras | `index, follow` | `.../{zona}/{municipio}` |
| Municipio con 1 gasolinera | `noindex, follow` | `.../{zona}/{municipio}` |
| 404 de `seo.php` (`seoNotFound`) | `noindex` en la metaetiqueta y en la cabecera `X-Robots-Tag` | Ninguno |

Detalles que conviene conocer:

- Una ficha existente es `index, follow` aunque su precio no sea vigente. La condición de «vigente» solo decide si entra en el mapa de sitio; la indexación depende de que la gasolinera exista.
- Las zonas y municipios usan el mismo `robots` aunque estén vacíos de precios: no hay una regla de `noindex` por falta de datos.
- Las URLs de zona y municipio solo aceptan `[a-z0-9-]`; cualquier otra cosa da 404.

### hreflang

| Página | Alternates emitidos |
|---|---|
| Portada de cada país | Uno por país con datos, con el formato `es-ES`, `pt-PT`, `fr-FR`, más `x-default` apuntando a España (`Country::DEFAULT`) |
| Índice de zonas (`seoAlternates`) | Lo mismo, con la ruta del índice de cada país |
| Zona, municipio y ficha | **Ninguno.** No hay equivalente en otro país que enlazar |

Los hreflang son completos entre los tres países: cada versión se enlaza a sí misma y a las otras, como exige Google.

### Caché

| Respuesta | `Cache-Control` |
|---|---|
| Zona, municipio e índice de zonas | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` |
| `sitemap.xml` y `sitemap-{pais}.xml` | `public, max-age=300, s-maxage=21600, stale-while-revalidate=86400` |
| `robots.txt` y `llms.txt` | `public, max-age=300, s-maxage=86400, stale-while-revalidate=86400` |
| Portada y fichas (`api/shell.php`) | No fija cabecera propia |
| 404 de `seo.php` | No fija cabecera de caché |

Lo fija la función `seoCache($segundos)` de `api/seo.php`: el navegador guarda 5 minutos y el CDN de Vercel el tiempo indicado, sirviendo versión antigua hasta un día mientras la regenera. Los precios se actualizan una vez al día, así que una hora de caché en las páginas de zona es suficiente. Un 500 de `seo.php` (`Error temporal`, texto plano) no lleva cabecera de caché.

## Redirección de rescate y 404

Cuando una zona no existe en el país de la URL, `seoAreaPage` prueba con los demás países que tengan datos (abre su base de datos y ejecuta `Seo::provinces`). Si la encuentra, responde **301** con `Location` absoluto hacia la misma zona (y el mismo municipio, si lo había) en el otro país:

| URL pedida | Resultado |
|---|---|
| `/gasolineras/bas-rhin` | 301 a `https://gasolineraplus.vercel.app/fr/stations-service/bas-rhin` |
| `/gasolineras/aveiro` | 301 a `.../pt/postos/aveiro` |
| `/gasolineras/no-existe` | 404 limpio |

Motivo: una zona de un país pedida con la sección de otro (por ejemplo, `/gasolineras/bas-rhin`) es la misma página que existe en el país correcto; redirigir de forma permanente conserva la señal y evita errores 404 en Search Console. Si la zona no existe en ninguno, o si el municipio no existe en una zona válida, `seoNotFound()` devuelve 404 con `noindex`, un título, un enlace al índice de zonas y otro a la portada.

La zona sin nombre (provincia vacía en la base) queda fuera de `Seo::provinces`, así que su URL da 404 en lugar de duplicar el índice. Las gasolineras afectadas (cuatro en Francia) siguen teniendo su ficha; en el JSON-LD de esa ficha el eslabón «zona» del `BreadcrumbList` apunta a la dirección del índice con una barra final (`/fr/stations-service/`); es un defecto menor conocido.

Si ocurre una excepción dentro de `seo.php` (por ejemplo, la base no se puede abrir), se registra con `error_log` y se responde 500 con el texto `Error temporal`.

## Favicon

`api/shell.php` y `seoHead` declaran cuatro iconos:

| Etiqueta | Fichero |
|---|---|
| `rel="icon" sizes="48x48"` | `/favicon.ico` |
| `rel="icon" type="image/png" sizes="48x48"` | `/icons/favicon-48.png` |
| `sizes="96x96"` | `/icons/favicon-96.png` |
| `sizes="192x192"` | `/icons/favicon-192.png` |

Los iconos tienen dirección propia (no se reutilizan los de la aplicación `icon-192.png`, etc.) porque Google guarda el favicon por URL: si se cambia la imagen manteniendo la dirección, Google sigue mostrando la antigua hasta que decide volver a descargarla, lo que puede tardar semanas y no se puede forzar. Al estrenar direcciones nuevas, el rastreador las trata como iconos nuevos. Cuando se cambie otra vez el logotipo, conviene usar nombres nuevos (por ejemplo `favicon-v2-48.png`) y actualizar las dos plantillas. Google exige además que el icono sea múltiplo de 48 px y que la página principal lo declare. Los ficheros se sirven con la regla de caché de `/icons/(.*)` (`max-age=604800`).

## Comprobación de producción

### Flujo manual `check-production.yml`

`.github/workflows/check-production.yml` se lanza a mano (`workflow_dispatch`), desde la pestaña *Actions* de GitHub o con `gh workflow run "Check production"`. Ejecuta un script de Python contra `https://gasolineraplus.vercel.app` (sin seguir redirecciones, para ver los 301 tal cual) y falla si algo no cumple:

| Comprobación | Condición para pasar |
|---|---|
| `/sitemap-es.xml`, `-pt`, `-fr` | 200, XML válido y más de 100 URLs; sin duplicados y todas bajo la dirección base |
| `/sitemap.xml` | 200 y exactamente 3 `<sitemap>` |
| `/favicon.ico`, `/icons/favicon-48.png`, `-96`, `-192` | 200 y tipo de contenido `image/*` |
| `/robots.txt` | 200 y contiene `Sitemap:` |
| `/`, `/gasolineras`, `/pt/postos`, `/fr/stations-service`, `/gasolineras/albacete`, `/fr/stations-service/bas-rhin`, `/fr/stations/67360002` | 200 y `robots` que empieza por `index`; imprime el canonical |
| `/gasolineras/bas-rhin` y `/gasolineras/aveiro` | 301 con el `Location` esperado |
| `/gasolineras/no-existe` | 404 |
| `/api/stats/national` (España, `?pais=pt`, `?pais=fr`) y `/api/stations/near?...` | 200 |

### Paso «Check that production answers»

Al final del despliegue de `.github/workflows/rebuild-schedule.yml` hay un paso `Check that production answers` que solo se ejecuta si hubo despliegue, no es una vista previa y la rama es `main`. Pide con `curl` seis rutas: `/api/stats/national`, `/api/stations/near?lat=43.33&lon=-3.0&radius=5&fuel=gasolina_95_e5`, las estadísticas de `pt` y `fr`, `/` y `/gasolineras`. Cada una se reintenta hasta 3 veces con 15 segundos de espera y debe dar 200; si alguna falla, el trabajo termina con el error «Produccion no responde tras el despliegue». Es una red de seguridad rápida: no valida sitemaps ni indexación, para eso está el flujo manual.

## Auditoría local `tests/seo-audit.py`

Script de Python sin dependencias que se ejecuta contra un servidor (por defecto `http://localhost:8021`, o el de `BASE_URL`) y revisa las rutas que se pasen en `SEO_PAGES`, separadas por espacios:

```
BASE_URL=http://localhost:8021 SEO_PAGES="/ /gasolineras /gasolineras/albacete /pt/postos /fr/stations-service" python3 tests/seo-audit.py
```

| Nivel | Comprobaciones |
|---|---|
| Crítico (termina con código 1) | HTTP distinto de 200; sin `title`; sin meta description; sin canonical; sin viewport; no hay exactamente un `h1`; JSON-LD con JSON inválido; `lang` del HTML distinto del esperado por el prefijo (`/pt`, `/fr`, resto `es`); `robots.txt` sin `Sitemap:`; `sitemap.xml` vacío o con error |
| Aviso | Título fuera de 25–70 caracteres; description fuera de 70–170; `noindex` en la página; faltan `og:title`, `og:description`, `og:image`, `og:url`, `twitter:card`, `twitter:title` o `twitter:description`; salto de encabezados; encabezados vacíos; imágenes sin `alt`; sin JSON-LD; más de 150 enlaces |

Al final imprime CRÍTICOS, AVISOS y BIEN, y una puntuación `100 - 10 por crítico - 2 por aviso`. No forma parte de la integración continua; es una ayuda para quien cambia plantillas SEO.

## Operación en Google Search Console y Bing Webmaster Tools

### Qué se envía

| Herramienta | Qué se hace |
|---|---|
| Google Search Console | Propiedad verificada con la metaetiqueta `google-site-verification` que emiten `api/shell.php` y `seoHead` (valor de `Seo::verificationToken()`). Se envía **solo** `https://gasolineraplus.vercel.app/sitemap.xml`; Google descubre los de cada país a partir del índice |
| Bing Webmaster Tools | Se envía la misma dirección, o se importa la propiedad desde Search Console |

Si se cambia de dominio, la propiedad y los envíos hay que rehacerlos (ver la última sección).

### Cómo leer los informes

| Informe | Qué mirar |
|---|---|
| Sitemaps | Estado «Correcto» en `sitemap.xml` y en los tres hijos, URLs descubiertas cercanas a 13.300 / 3.500 / 9.660 y fecha de última lectura reciente |
| Indexación de páginas | «Indexada» frente a «Descubierta, actualmente sin indexar» y «Rastreada, actualmente sin indexar». Es normal que muchas fichas queden en las dos últimas durante semanas |
| Motivos de exclusión | «Excluida por la etiqueta noindex» es lo esperado para municipios de una sola gasolinera. «No encontrada (404)» y «Página con redirección» son normales para direcciones antiguas; no deberían crecer |
| Inspección de URL | Para comprobar una dirección concreta: HTML rastreado, canonical elegido por Google y si es indexable |
| Datos estructurados / Resultados enriquecidos | Errores de `GasStation`, `BreadcrumbList` o `ItemList` |
| Rendimiento | Impresiones y clics por país y página; tarda en tener datos |

### Plazos normales

Para un sitio nuevo y de este tamaño, el rastreo y la indexación se miden en semanas, no en días. Google lee los mapas de sitio con rapidez, pero rastrea las URLs a un ritmo limitado; la indexación de decenas de miles de fichas puede tardar meses. No es un fallo, y reenviar el mapa no lo acelera. Los cambios de favicon, de título o de descripción también tardan semanas en reflejarse.

### Lección aprendida: la caída de la API del 21 al 26 de octubre de 2026

Entre el 21 y el 26 de octubre de 2026 la función de Vercel respondía 500 por exceso de peso de las bases de datos incluidas en la función. Durante esos días `seo.php` no podía abrir la base y los mapas de sitio devolvían error. Google leyó los de España y Portugal con error y hubo que **reenviarlos** a mano en Search Console. Consecuencias y prácticas derivadas:

- Tras cualquier incidencia de producción, revisar el informe *Sitemaps* y reenviar los que figuren con error; no esperar a que se corrija solo.
- Cada despliegue ejecuta ahora `Check that production answers`, y `check-production.yml` permite validar a mano los mapas de sitio y las páginas.
- El campo `excludeFiles` de `vercel.json` para `api/*.php` sirve para que la función no empaquete datos que no usa (`data/stations-lite*.json`, grafos de carreteras, `data/places.json`, `public`, `docs`, `tests`, `icons`, `vendor`, `js`...). Si se añade un fichero grande nuevo, hay que comprobar el peso antes de desplegar.

## Qué falta o se puede mejorar

| Tema | Situación |
|---|---|
| Dominio propio | El sitio vive en `gasolineraplus.vercel.app`. Las URLs absolutas salen de `GP_SITE_URL`, de modo que basta cambiar esa variable y redesplegar. Pero `js/native.js` tiene `SITE_URL` con la dirección fija (la usa la aplicación para llamar a la API y construir enlaces), y también aparece en `check-production.yml`, en `rebuild-schedule.yml`, en el enlace a la guía PDF de `api/shell.php`, en `Services/PlaceGeocoder.php` y en `appendUserAgent` de `capacitor.config.json`. Las aplicaciones ya instaladas seguirían usando la dirección antigua hasta actualizarse, y habría que mantener la redirección del dominio viejo. Hay también que verificar la propiedad nueva en Search Console y usar «Cambio de dirección» |
| `lastmod` | Todas las URLs de un mapa llevan la misma fecha (la última actualización de precios del país), no la fecha real de cambio de cada página. Google tiende a ignorar un `lastmod` que no distingue; sería mejor emitir una fecha por zona o por ficha cuando cambie el precio. `changefreq` y `priority` los ignora Google |
| Fichas casi idénticas | Las decenas de miles de fichas comparten plantilla y solo cambian nombre, dirección, precios y coordenadas. Google puede clasificar muchas como «Rastreada, actualmente sin indexar». Ayudaría un texto propio (zona, marca, comparativa con la media del municipio) o limitar el mapa a fichas con más señales |
| Zona y municipio sin hreflang | Solo la portada y el índice enlazan sus versiones por país |
| Ficha inexistente | `api/shell.php` responde 200 con `noindex`; un 404 real limpiaría antes el índice |
| Enlaces externos | El sitio apenas tiene enlaces entrantes de otras webs. Sin ellos Google rastrea poco. Conviene registrarse en directorios, publicar el proyecto y enlazar desde páginas con autoridad |
| Cabeceras de caché en portada y fichas | `api/shell.php` no fija `Cache-Control`; cada visita ejecuta PHP y abre la base |
| `seo.php` ante fallo | Un error de base devuelve 500 sin caché; durante una caída Google ve errores. Una copia estática del mapa de sitio generada en cada despliegue lo evitaría |
| Auditoría | `tests/seo-audit.py` no se ejecuta en CI |
