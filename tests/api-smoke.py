import json
import math
import os
import sqlite3
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get('BASE_URL', 'http://localhost:8021').rstrip('/')
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DB = sqlite3.connect(os.path.join(ROOT, 'data', 'gasolinera.sqlite'))
STALE_DAYS = 10
fails = []
skips = []
count = 0


def fetch(path, headers=None):
    global count
    count += 1
    request = urllib.request.Request(BASE + path, headers=headers or {})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, dict(response.headers), response.read().decode('utf-8')
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read().decode('utf-8')


def get(path, expect=200):
    try:
        code, headers, body = fetch(path)
    except Exception as error:
        fails.append(f'{path}: {error}')
        return None
    try:
        data = json.loads(body)
    except Exception:
        fails.append(f'{path}: respuesta no JSON ({code})')
        return None
    if code != expect:
        fails.append(f'{path}: esperaba {expect}, dio {code} {str(data)[:100]}')
    return data


def check(condition, message):
    if not condition:
        fails.append(message)


def haversine(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 12742 * math.asin(math.sqrt(a))


BILBAO = (43.2630, -2.9350)

near = get(f'/api/stations/near?lat={BILBAO[0]}&lon={BILBAO[1]}&radius=5&sort=price&fuel=gasoleo_a&limit=30') or {}
stations = near.get('stations', [])
check(len(stations) > 0, 'near: sin estaciones en Bilbao')
prices = [s['precios'].get('gasoleo_a') for s in stations]
check(None not in prices, 'near: alguna estacion sin precio del combustible filtrado')
check(prices == sorted(prices), f'near: no ordenado por precio {prices[:6]}')
check(all(s['distanciaKm'] <= 5 for s in stations), 'near: estaciones fuera del radio')
check(near.get('total', 0) >= len(stations), 'near: total menor que la pagina')

by_distance = (get(f'/api/stations/near?lat={BILBAO[0]}&lon={BILBAO[1]}&radius=10&sort=distance&limit=30') or {}).get('stations', [])
distances = [s['distanciaKm'] for s in by_distance]
check(distances == sorted(distances), f'near distance: no ordenado {distances[:6]}')

get('/api/stations/near', expect=422)
get('/api/stations/near?lat=abc&lon=-2.9', expect=422)
get('/api/stations/near?lat=95&lon=-2.9', expect=422)
get('/api/stations/near?lat=43.2&lon=-2.9&fuel=queroseno', expect=422)

empty = get('/api/stations/search?q=') or {}
check(empty.get('stations') == [] and empty.get('total') == 0 and empty.get('hasMore') is False, f'search vacia: forma incorrecta {empty}')

plain = (get('/api/stations/search?q=bilbao&limit=5') or {}).get('stations', [])
check(len(plain) > 0, 'search bilbao: sin resultados')
check(all(s['distanciaKm'] is None for s in plain), 'search sin ubicacion: distanciaKm deberia ser null (no medida desde el pueblo)')

user = (43.3183, -1.9812)
located = (get(f'/api/stations/search?q=bilbao&lat={user[0]}&lon={user[1]}&limit=5') or {}).get('stations', [])
for s in located:
    expected = haversine(user[0], user[1], s['lat'], s['lon'])
    check(abs(expected - s['distanciaKm']) < 0.05, f"search con ubicacion: distancia {s['distanciaKm']} no medida desde el usuario ({expected:.2f})")

query = 'ca'
fuel = 'glp'
like = f'%{query}%'
expected_total = DB.execute(
    f'''SELECT COUNT(*) FROM stations s
        WHERE (municipio_normalizado LIKE ? OR direccion_normalizada LIKE ? OR rotulo_normalizado LIKE ? OR cp LIKE ? OR localidad_normalizada LIKE ?)
        AND last_seen_date >= date('now', '-{STALE_DAYS} days')
        AND EXISTS (SELECT 1 FROM current_prices cp WHERE cp.ideess = s.ideess AND cp.carburante = ?)''',
    (like, like, like, query + '%', like, fuel)).fetchone()[0]
broad = get(f'/api/stations/search?q={query}&fuel={fuel}&limit=10') or {}
check(broad.get('total') == expected_total, f"search amplia: total {broad.get('total')} y la base tiene {expected_total} (truncado antes de filtrar)")

village = get('/api/stations/search?q=Elantxobe&limit=5') or {}
if village.get('geocodedFrom'):
    check(village.get('total', 0) > 5, 'fallback geocodificado: deberia haber mas de una pagina')
    page2 = get('/api/stations/search?q=Elantxobe&limit=5&offset=5') or {}
    check(len(page2.get('stations', [])) > 0, 'fallback geocodificado: la pagina 2 viene vacia')
    check(page2.get('geocodedFrom') == 'Elantxobe', 'fallback geocodificado: la pagina 2 pierde geocodedFrom')
else:
    skips.append('fallback geocodificado (Nominatim no respondio)')

places = (get('/api/stations/suggest-places?q=bilb') or {}).get('places', [])
check(any(p['label'].lower().startswith('bilb') for p in places), 'suggest-places: no sugiere Bilbao')

get('/api/stations/bbox?north=43.3', expect=422)
box = (get('/api/stations/bbox?north=43.30&south=43.22&east=-2.88&west=-2.98&fuel=gasoleo_a') or {}).get('stations', [])
check(len(box) > 0 and all(s['precio'] is not None for s in box), 'bbox: sin estaciones o sin precio')
stale = (get('/api/stations/bbox?north=38.73&south=38.70&east=-5.53&west=-5.56') or {}).get('stations', [])
check(all(s['ideess'] != '13403' for s in stale), 'bbox: incluye estaciones obsoletas (13403)')
spain = get('/api/stations/bbox?north=44&south=36&east=4&west=-10') or {}
check(len(spain.get('stations', [])) <= 5000, f"bbox: sin limite de filas ({len(spain.get('stations', []))})")

if stations:
    ideess = stations[0]['ideess']
    detail = get(f'/api/stations/{ideess}') or {}
    for key in ('rotulo', 'direccion', 'horario', 'combustibles', 'lat', 'lon'):
        check(key in detail, f'station: falta {key}')
    check('texto' in (detail.get('horario') or {}), 'station: horario sin texto')
    history = get(f'/api/stations/{ideess}/history?fuel=gasoleo_a') or {}
    check(isinstance(history.get('serie'), list), 'history: sin serie')
    get(f'/api/stations/{ideess}/zone-comparison?fuel=gasoleo_a')
get('/api/stations/99999999', expect=404)

national = get('/api/stats/national?fuel=gasoleo_a') or {}
check(national.get('hoy') is not None, 'stats national: sin dato de hoy')
by_fuel = get('/api/stats/by-fuel') or {}
check('gasoleo_a' in by_fuel.get('series', {}), 'stats by-fuel: sin gasoleo_a')
provinces = (get('/api/stats/by-province?fuel=gasoleo_a') or {}).get('provincias', [])
check(len(provinces) > 40, f'stats by-province: solo {len(provinces)} provincias')
buckets = (get('/api/stats/price-distribution?fuel=gasoleo_a') or {}).get('buckets', [])
check(len(buckets) > 3, 'stats distribution: sin tramos')

get('/api/nope', expect=404)

code, headers, _ = fetch(f'/api/stations/near?lat={BILBAO[0]}&lon={BILBAO[1]}')
cache_control = headers.get('Cache-Control') or headers.get('cache-control') or ''
check('max-age' in cache_control, f'near: sin Cache-Control ({cache_control!r})')

print(f'{count} peticiones, {len(fails)} fallos, {len(skips)} omitidas')
for skipped in skips:
    print(' SKIP', skipped)
for failure in fails:
    print(' -', failure)
if fails:
    sys.exit(1)
