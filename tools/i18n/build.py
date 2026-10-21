import csv
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'tools' / 'i18n'


def read(name):
    rows = {}
    with open(HERE / name, encoding='utf-8', newline='') as handle:
        for line in handle.read().splitlines():
            if not line.strip():
                continue
            source, pt, fr = line.split('\t')
            rows[source] = {'pt': pt, 'fr': fr}
    return rows


texts = read('texts.tsv')
patterns = read('patterns.tsv')
for lang in ('pt', 'fr'):
    path = ROOT / 'config' / 'i18n' / (lang + '.json')
    data = json.loads(path.read_text(encoding='utf-8'))
    data['texts'] = {source: row[lang] for source, row in texts.items()}
    data['patterns'] = {source: row[lang] for source, row in patterns.items()}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(lang, len(data['texts']), 'textos,', len(data['patterns']), 'patrones')
