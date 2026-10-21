import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'tools' / 'i18n'
LANGS = ('es', 'pt', 'fr')


def rows(name, columns):
    out = []
    for line in (HERE / name).read_text(encoding='utf-8').splitlines():
        if line.strip():
            parts = line.split('\t')
            assert len(parts) == columns, (name, line)
            out.append(parts)
    return out


seo = {key: dict(zip(LANGS, values)) for key, *values in rows('seo.tsv', 4)}
texts = {source: {'pt': pt, 'fr': fr} for source, pt, fr in rows('texts.tsv', 3)}
patterns = {source: {'pt': pt, 'fr': fr} for source, pt, fr in rows('patterns.tsv', 3)}

for lang in LANGS:
    path = ROOT / 'config' / 'i18n' / (lang + '.json')
    data = json.loads(path.read_text(encoding='utf-8'))
    for key, values in seo.items():
        data[key] = values[lang]
    if lang != 'es':
        data['texts'] = {source: row[lang] for source, row in texts.items()}
        data['patterns'] = {source: row[lang] for source, row in patterns.items()}
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(lang, len(data.get('texts', {})), 'textos,', len(data.get('patterns', {})), 'patrones,', len(seo), 'claves seo')
