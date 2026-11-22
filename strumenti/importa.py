"""Prepara public/ con la versione giocabile di Cubo Corse, servita su https://cubocorse.gabrielesalvi.com

Uso: ~/.openclaw/.venv/bin/python3 strumenti/importa.py              → la versione principale in public/
     ~/.openclaw/.venv/bin/python3 strumenti/importa.py --sotto mobile → una copia di prova in public/mobile/
       (22-11, Gabriele: prove dal telefono senza Tailscale su https://cubocorse.gabrielesalvi.com/mobile/; la versione
       principale resta quella pubblicata, la copia di prova non va sui motori di ricerca)
La versione principale ricostruisce public/ ma lascia stare le copie di prova (SOTTO).
Prende il gioco dall'ULTIMO COMMIT del repo privato (workspace/projects/cubo-corse), non dai file non committati.
Si porta solo quello che serve per giocare: index.html, style.css, src/, vendor/, data/monza.json, data/versioni-piste.json,
CHANGELOG.md e, dal gioco unito
(fase 0, 20-11-2026), cs/ = costruttori e pacchetti dei circuiti di Circuit Studio (Roncadelle e Nenni, ~15 MB).
Restano fuori test, strumenti, documenti e tessere satellitari. I font Google sono locali (risorse/).
"""
import io
import sys
import shutil
import subprocess
import tarfile
from pathlib import Path

RADICE = Path(__file__).resolve().parent.parent
ORIGINE = Path.home() / '.openclaw/workspace/projects/cubo-corse'
PUBBLICO = RADICE / 'public'
SOTTO = ('mobile',)                       # copie di prova in sottocartelle: la versione principale non le cancella
sotto = sys.argv[sys.argv.index('--sotto') + 1] if '--sotto' in sys.argv else None
if sotto and sotto not in SOTTO: raise SystemExit(f'--sotto: solo {SOTTO}')
DEST = PUBBLICO / sotto if sotto else PUBBLICO
RISORSE = RADICE / 'risorse'
DOMINIO = 'cubocorse.gabrielesalvi.com'
# 22-11 (fase 2d): anche manifest.webmanifest, sw.js e icone/ (app sulla schermata Home, gioco tenuto sul telefono)
# 22-11 (fase 1): anche data/nomi-vietati.json (filtro dei nomi dei record)
# 21-11 (Cubo Corse 1.0): anche CHANGELOG.md (pannello «Novità») e data/versioni-piste.json (record per versione della pista)
PRENDI = ('index.html', 'style.css', 'src/', 'vendor/', 'data/monza.json', 'data/versioni-piste.json', 'data/nomi-vietati.json', 'CHANGELOG.md', 'cs/viewer/', 'cs/pacchetti/',
          'manifest.webmanifest', 'sw.js', 'icone/')
GOOGLE = '''  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,800;1,700;1,800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
'''
TESTA = '''  <meta name="description" content="Cubo Corse: gioco di corse GT nel browser, con Monza 1:1 in voxel e il circuito cittadino di Roncadelle. Un progetto di Gabriele Salvi." />
  <link rel="icon" href="favicon.svg" type="image/svg+xml" />
  <link rel="stylesheet" href="fonts/fonts.css" />
'''

commit = subprocess.run(['git', '-C', str(ORIGINE), 'rev-parse', '--short', 'HEAD'],
                        check=True, capture_output=True, text=True).stdout.strip()
archivio = subprocess.run(['git', '-C', str(ORIGINE), 'archive', '--format=tar', 'HEAD'],
                          check=True, capture_output=True).stdout

if sotto:
    if DEST.exists(): shutil.rmtree(DEST)
    DEST.mkdir(parents=True)
else:
    DEST.mkdir(exist_ok=True)
    for p in DEST.iterdir():              # tutto da capo, tranne le copie di prova
        if p.name in SOTTO: continue
        shutil.rmtree(p) if p.is_dir() else p.unlink()
with tarfile.open(fileobj=io.BytesIO(archivio)) as tar:
    scelti = [m for m in tar.getmembers()
              if m.isfile() and any(m.name == p or (p.endswith('/') and m.name.startswith(p)) for p in PRENDI)
              and not m.name.endswith('.map')]
    tar.extractall(DEST, members=scelti, filter='data')

(DEST / 'fonts').mkdir()
for f in RISORSE.glob('*.woff2'):
    shutil.copy(f, DEST / 'fonts' / f.name)
shutil.copy(RISORSE / 'fonts.css', DEST / 'fonts' / 'fonts.css')
shutil.copy(RISORSE / 'favicon.svg', DEST / 'favicon.svg')

html = (DEST / 'index.html').read_text(encoding='utf-8')
if GOOGLE not in html:
    raise SystemExit('index.html del gioco è cambiato: aggiorna il blocco GOOGLE in questo script')
html = html.replace(GOOGLE, TESTA)
if sotto: html = html.replace('<title>Cubo Corse</title>', '<title>Cubo Corse · prova</title>\n  <meta name="robots" content="noindex" />', 1)
(DEST / 'index.html').write_text(html, encoding='utf-8')
if not sotto: (DEST / 'CNAME').write_text(DOMINIO + '\n')
# 21-11: numero di versione del gioco (src/versione.js, lo imposta tools/rilascio.py) + commit
import re
ver = re.search(r"VERSIONE = '([^']+)'", (DEST / 'src' / 'versione.js').read_text(encoding='utf-8'))
(DEST / 'VERSIONE.txt').write_text(f'cubo-corse {ver.group(1) if ver else "?"} ({commit}){" · copia di prova " + sotto if sotto else ""}\n')

n = sum(1 for p in DEST.rglob('*') if p.is_file())
mb = sum(p.stat().st_size for p in DEST.rglob('*') if p.is_file()) / 1e6
print(f'ok → {DEST}  ·  cubo-corse {commit}  ·  {n} file, {mb:.1f} MB')
