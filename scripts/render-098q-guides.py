"""Render Q's offline setup using the maintained P Markdown renderer."""
from pathlib import Path
import importlib.util
ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('guides098p', ROOT / 'scripts/render-098p-guides.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
setup = (ROOT / 'docs/v098q/SETUP.md').read_text()
html = p.page('Calendar 0.9.8q setup', setup)
for path, content in [('SETUP_v0.9.8q.md', setup), ('SETUP_v0.9.8q.html', html), ('docs/v098q/SETUP.html', html)]:
    (ROOT / path).write_text(content)
for name in ['CHANGELOG', 'VALIDATION']:
    path = ROOT / (name + '_v0.9.8q.md')
    if path.exists(): (ROOT / 'docs/v098q' / (name + '.md')).write_text(path.read_text())
print('Rendered Q setup and current document aliases.')
