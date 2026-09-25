import glob
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..')).replace('\\', '/') + '/'
PHP = os.environ.get('PHP_PATH') or shutil.which('php') or 'C:/xampp/php/php.exe'
SKIP_DIRS = ('/vendor/', '/node_modules/', '/android/', '/ios/', '/www/')
failures = []


def read(path):
    with open(ROOT + path, encoding='utf-8') as handle:
        return handle.read()


def own_files(pattern):
    found = []
    for path in glob.glob(ROOT + pattern, recursive=True):
        normalized = path.replace('\\', '/')
        if any(part in normalized for part in SKIP_DIRS):
            continue
        found.append(normalized)
    return sorted(found)


js_sources = ''
for path in own_files('js/*.js'):
    with open(path, encoding='utf-8') as handle:
        js_sources += handle.read()
ids_js = set(re.findall(r"(?:getElementById|\$)\('([^'#.\s]+)'\)", js_sources))
shell = read('api/shell.php')
ids_html = set(re.findall(r'id="([^"]+)"', shell))
missing_ids = sorted(ids_js - ids_html)
print('ids que el JS busca y no existen en shell.php:', missing_ids or 'ninguno')
if missing_ids:
    failures.append('ids del JS sin elemento')

css = read('style.css')
css_ids = set(re.findall(r'#([a-zA-Z][\w-]*)', re.sub(r'#[0-9a-fA-F]{3,8}\b(?![\w-])', '', css)))
orphan_css = sorted(i for i in css_ids if i not in ids_html and i not in ids_js)
print('ids en CSS sin elemento:', orphan_css or 'ninguno')
if orphan_css:
    failures.append('ids de style.css sin elemento')

php_bad = 0
php_files = own_files('**/*.php')
for path in php_files:
    result = subprocess.run([PHP, '-l', path], capture_output=True, text=True)
    if 'No syntax errors' not in result.stdout:
        php_bad += 1
        print('LINT', path, result.stdout, result.stderr)
print(f'php lint: {len(php_files)} archivos, {php_bad} con error')
if php_bad:
    failures.append('errores de sintaxis PHP')

js_files = own_files('js/*.js') + own_files('runners/*.js') + own_files('scripts/*.mjs') + own_files('tools/**/*.mjs') + own_files('tests/*.mjs') + [ROOT + 'sw.js']
for path in js_files:
    result = subprocess.run(['node', '--check', path], capture_output=True, text=True)
    if result.returncode == 0:
        print('js', os.path.basename(path), 'OK')
    else:
        print('js', os.path.basename(path), result.stderr[:200])
        failures.append('sintaxis JS ' + os.path.basename(path))

ternary = re.compile(r'(?:^|\s)\?\s|\?:')
literal = re.compile(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"|`(?:\\.|[^`\\])*`|/\*.*?\*/|//[^\n]*", re.S)


def blank_keep_lines(match):
    return '""' + '\n' * match.group(0).count('\n')


for path in own_files('js/*.js') + own_files('runners/*.js') + own_files('api/**/*.php') + own_files('scripts/*.php') + own_files('scripts/*.mjs') + own_files('tools/**/*.mjs') + own_files('tests/*.mjs') + [ROOT + 'sw.js']:
    with open(path, encoding='utf-8') as handle:
        source = handle.read()
    interpolations = ' '.join(re.findall(r'\$\{([^{}]*)\}', source))
    if ternary.search(interpolations):
        print(f'TERNARIO dentro de una plantilla en {path.replace(ROOT, "")}')
        failures.append('operador ternario en ' + os.path.basename(path))
    code = literal.sub(blank_keep_lines, source)
    original_lines = source.split('\n')
    for number, line in enumerate(code.split('\n'), 1):
        if ternary.search(line.strip()):
            print(f'TERNARIO {path.replace(ROOT, "")}:{number}: {original_lines[number - 1].strip()[:120]}')
            failures.append('operador ternario en ' + os.path.basename(path))

sw = read('sw.js')
shell_files = re.findall(r"'(/[^']+)'", sw.split('SHELL_FILES = [')[1].split('];')[0])
missing_files = [f for f in shell_files if f != '/' and not os.path.exists(ROOT + f.lstrip('/'))]
print('archivos del precache que no existen:', missing_files or 'ninguno')
if missing_files:
    failures.append('precache con archivos inexistentes')

for unit in own_files('tests/*-test.php'):
    result = subprocess.run([PHP, unit], capture_output=True, text=True)
    print(os.path.basename(unit), result.stdout.strip()[-300:])
    if result.returncode != 0:
        failures.append('test unitario ' + os.path.basename(unit))

for unit in own_files('tests/*.test.mjs'):
    result = subprocess.run(['node', unit], capture_output=True, text=True)
    print(os.path.basename(unit), (result.stdout + result.stderr).strip()[-300:])
    if result.returncode != 0:
        failures.append('test unitario ' + os.path.basename(unit))

if failures:
    print('RESULTADO estatico: FALLA -> ' + '; '.join(sorted(set(failures))))
    sys.exit(1)
print('RESULTADO estatico: OK')
