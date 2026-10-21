import json
import re
import sys
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8099'
JS_FILES = ['app', 'api', 'garage', 'trips', 'route', 'history', 'recap', 'permissions', 'feedback', 'offline-maps', 'native', 'alerts-store', 'backup', 'garage-store', 'splash', 'map-guard', 'price-index']
ATTRS = {'placeholder', 'aria-label', 'title', 'alt'}
LETTER = re.compile(r'[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}')


def looks_human(text):
    if not LETTER.search(text):
        return False
    if re.fullmatch(r'[a-z0-9_\-]+', text):
        return False
    if re.fullmatch(r'[A-Z0-9_\-]+', text) and len(text) < 4:
        return False
    if text.startswith(('#', '.', '/', 'http', 'data:', 'M', 'gasolinera_', '[')) and ' ' not in text:
        return False
    if re.search(r'[;{}=<>]|=>|\bfunction\b|\bconst\b|\.js\b|\.json\b|px\b|rgba?\(', text):
        return False
    if re.fullmatch(r'[\w\-]+(\s[\w\-]+)*', text) and text == text.lower() and not re.search('[áéíóúñ]', text) and ' ' not in text:
        return False
    return True


class Collector(HTMLParser):
    def __init__(self):
        super().__init__()
        self.skip = 0
        self.found = set()

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.skip += 1
        for name, value in attrs:
            if name in ATTRS and value and looks_human(value.strip()):
                self.found.add(value.strip())

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.skip -= 1

    def handle_data(self, data):
        text = data.strip()
        if self.skip == 0 and text and looks_human(text):
            self.found.add(re.sub(r'\s+', ' ', text))


def page_texts():
    html = urllib.request.urlopen(BASE + '/').read().decode('utf-8')
    collector = Collector()
    collector.feed(html)
    return collector.found


def js_texts():
    texts, patterns = set(), set()
    literal = re.compile(r"`((?:\\.|[^`\\])*)`|'((?:\\.|[^'\\])*)'|\"((?:\\.|[^\"\\])*)\"")
    for name in JS_FILES:
        source = (ROOT / 'js' / (name + '.js')).read_text(encoding='utf-8')
        source = re.sub(r'^\s*//.*$', '', source, flags=re.M)
        for match in literal.finditer(source):
            raw = match.group(1)
            if raw is None:
                raw = match.group(2) if match.group(2) is not None else match.group(3)
                chunks = [raw]
            else:
                counter = iter(range(100))
                raw = re.sub(r'\$\{(?:[^{}]|\{[^{}]*\})*\}', lambda m: '{' + str(next(counter)) + '}', raw)
                chunks = re.split(r'<[^>]+>', raw)
            for chunk in chunks:
                chunk = re.sub(r'\s+', ' ', chunk.replace('\\n', ' ')).strip(' ·:')
                chunk = chunk.strip()
                if not chunk or not looks_human(re.sub(r'\{\d+\}', '', chunk)):
                    continue
                if re.fullmatch(r'(\{\d+\}\s*)+', chunk):
                    continue
                if re.search(r'\{\d+\}', chunk):
                    patterns.add(chunk)
                else:
                    texts.add(chunk)
    return texts, patterns


page = page_texts()
code_texts, code_patterns = js_texts()
out = {'texts': sorted(page | code_texts), 'patterns': sorted(code_patterns)}
target = ROOT / 'tools' / 'i18n' / 'sources.json'
target.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding='utf-8')
print(len(out['texts']), 'textos,', len(out['patterns']), 'patrones ->', target)
