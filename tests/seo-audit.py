import json
import os
import re
import sys
import urllib.error
import urllib.request
from html.parser import HTMLParser

BASE = os.environ.get('BASE_URL', 'http://localhost:8021').rstrip('/')
PAGES = os.environ.get('SEO_PAGES', '').split()


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ''
        self.in_title = False
        self.meta = {}
        self.links = []
        self.alternates = []
        self.canonical = ''
        self.lang = ''
        self.headings = []
        self.current_heading = None
        self.images = []
        self.jsonld = []
        self.in_jsonld = False
        self.anchors = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'html':
            self.lang = a.get('lang', '')
        if tag == 'title':
            self.in_title = True
        if tag == 'meta':
            key = a.get('name') or a.get('property')
            if key:
                self.meta[key] = a.get('content', '')
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a.get('href', '')
        if tag == 'link' and a.get('rel') == 'alternate' and a.get('hreflang'):
            self.alternates.append((a['hreflang'], a.get('href', '')))
        if re.fullmatch(r'h[1-6]', tag):
            self.current_heading = [tag, '']
        if tag == 'img':
            self.images.append(a)
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.in_jsonld = True
            self.jsonld.append('')
        if tag == 'a' and a.get('href'):
            self.anchors.append(a['href'])

    def handle_endtag(self, tag):
        if tag == 'title':
            self.in_title = False
        if self.current_heading and tag == self.current_heading[0]:
            self.headings.append((tag, self.current_heading[1].strip()))
            self.current_heading = None
        if tag == 'script':
            self.in_jsonld = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        if self.current_heading is not None:
            self.current_heading[1] += data
        if self.in_jsonld:
            self.jsonld[-1] += data


def fetch(path):
    request = urllib.request.Request(BASE + path, headers={'User-Agent': 'GasolineraPlus-seo-audit'})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return response.status, dict(response.headers), response.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read().decode('utf-8', 'replace')


critical, warnings, passing = [], [], []


def audit(path, expect_lang=None):
    status, headers, body = fetch(path)
    if status != 200:
        critical.append(f'{path}: HTTP {status}')
        return None
    page = Page()
    page.feed(body)
    title = page.title.strip()
    description = page.meta.get('description', '')
    robots = page.meta.get('robots', '') + ' ' + headers.get('X-Robots-Tag', '')
    if not title:
        critical.append(f'{path}: sin <title>')
    elif not 25 <= len(title) <= 70:
        warnings.append(f'{path}: título de {len(title)} caracteres (ideal 50-60): {title}')
    if not description:
        critical.append(f'{path}: sin meta description')
    elif not 70 <= len(description) <= 170:
        warnings.append(f'{path}: description de {len(description)} caracteres (ideal 150-160)')
    if not page.canonical:
        critical.append(f'{path}: sin canonical')
    if 'noindex' in robots:
        warnings.append(f'{path}: noindex')
    for key in ('og:title', 'og:description', 'og:image', 'og:url', 'twitter:card'):
        if key not in page.meta:
            warnings.append(f'{path}: falta {key}')
    for key in ('twitter:title', 'twitter:description'):
        if key not in page.meta:
            warnings.append(f'{path}: falta {key}')
    if 'viewport' not in page.meta:
        critical.append(f'{path}: sin viewport')
    h1 = [h for h in page.headings if h[0] == 'h1']
    if len(h1) != 1:
        critical.append(f'{path}: {len(h1)} h1')
    levels = [int(h[0][1]) for h in page.headings]
    for previous, current in zip(levels, levels[1:]):
        if current > previous + 1:
            warnings.append(f'{path}: salto de encabezado h{previous} → h{current}')
            break
    empty = [h for h in page.headings if not h[1]]
    if empty:
        warnings.append(f'{path}: {len(empty)} encabezados vacíos en el HTML ({", ".join(sorted(set(h[0] for h in empty)))})')
    no_alt = [img.get('src', '?') for img in page.images if 'alt' not in img]
    if no_alt:
        warnings.append(f'{path}: {len(no_alt)} imágenes sin alt')
    if not page.jsonld:
        warnings.append(f'{path}: sin JSON-LD')
    for block in page.jsonld:
        try:
            json.loads(block)
        except ValueError:
            critical.append(f'{path}: JSON-LD inválido')
    if expect_lang and not page.lang.startswith(expect_lang):
        critical.append(f'{path}: lang="{page.lang}" y se esperaba {expect_lang}')
    if len(page.anchors) > 150:
        warnings.append(f'{path}: {len(page.anchors)} enlaces')
    passing.append(f'{path}: {title} ({len(title)}) · h1 "{h1[0][1] if h1 else ""}" · {len(page.alternates)} hreflang · {len(page.jsonld)} JSON-LD')
    return page


def main():
    status, _, robots = fetch('/robots.txt')
    if status != 200 or 'Sitemap:' not in robots:
        critical.append('robots.txt sin sitemap')
    else:
        passing.append('robots.txt con sitemap')
    status, _, sitemap = fetch('/sitemap.xml')
    locs = re.findall(r'<loc>([^<]+)</loc>', sitemap)
    if status != 200 or not locs:
        critical.append('sitemap.xml vacío o con error')
    else:
        passing.append(f'sitemap.xml con {len(locs)} entradas')
    for path in PAGES:
        lang = None
        if path.startswith('/pt'):
            lang = 'pt'
        elif path.startswith('/fr'):
            lang = 'fr'
        else:
            lang = 'es'
        audit(path, lang)
    print('CRÍTICOS')
    print('\n'.join(' - ' + c for c in critical) or ' (ninguno)')
    print('AVISOS')
    print('\n'.join(' - ' + w for w in warnings) or ' (ninguno)')
    print('BIEN')
    print('\n'.join(' - ' + p for p in passing))
    score = max(0, 100 - 10 * len(critical) - 2 * len(warnings))
    print(f'PUNTUACIÓN {score}/100')
    if critical:
        sys.exit(1)


main()
