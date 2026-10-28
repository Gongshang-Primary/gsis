"""Export repository-safe LORD source and fixtures without installation credentials."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'First_Time_Setup'))
from configure_instance import KEYS, assert_external_configuration


def export(output):
    output = Path(output).resolve()
    if output == ROOT or output in ROOT.parents:
        raise ValueError('Choose a separate output folder.')
    for protected in ['Source', 'tests', 'tools', 'First_Time_Setup', 'docs']:
        source = ROOT/protected
        if output == source or source in output.parents:
            raise ValueError('Do not export into maintained source.')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Choose an empty export folder to avoid retaining old settings.')
    assert_external_configuration((ROOT/'Source/backend/Code.gs').read_text(),
        [(ROOT/'Source'/app/'_worker.js').read_text() for app in ['lord','overlord','starlord']])
    # Historical fixtures retain their recorded hashes. Refuse unsanitised input
    # rather than silently changing the comparison baseline during an export.
    for file in (ROOT/'tests/baselines').rglob('*'):
        if not file.is_file() or file.name not in ['Code.gs', '_worker.js']: continue
        text = file.read_text()
        fields = KEYS if file.name == 'Code.gs' else ['LORD_BACKEND_URL', 'LORD_PROXY_SECRET']
        for key in fields:
            pattern = (r'^\s*'+key+r':\s*' if file.name == 'Code.gs' else r'const '+key+r'\s*=\s*')
            match = re.search(pattern + r'([\x27\x22])(.*?)\1', text, re.M)
            if match and 'REPLACE_' not in match[2]:
                raise ValueError('Historical fixture needs a separate reviewed sanitisation: '+str(file.relative_to(ROOT)))
    items = []
    for folder in ['Source', 'tests', 'tools', 'First_Time_Setup']:
        items += [p for p in (ROOT/folder).rglob('*') if p.is_file()
                  and not any(x in p.parts for x in ['__pycache__', 'screenshots', 'Review'])
                  and not p.name.endswith('_results.json') and p.name not in ['release_review.json','deployment-settings.json']
                  and not p.name.startswith(('.env', '.dev.vars'))]
    for name in ['README.md', '.gitignore', 'DESIGN.md', 'UX-CONTRACT.md', 'premium-ui.json']:
        if (ROOT/name).exists(): items.append(ROOT/name)
    for name in ['FIRST_TIME_SETUP.md', 'BACKEND_USER_MANUAL.md', 'UPGRADE.md', 'VALIDATION.md',
                 'WHATSAPP_SETUP.md', 'SCHOOL_WHATSAPP_AGREEMENT.md', 'V18_UAT_GUIDE.md',
                 'CHANGELOG_V1.8_UAT.md', 'CHANGELOG_v0.9.md']:
        if (ROOT/'docs'/name).exists(): items.append(ROOT/'docs'/name)
    items += [p for p in (ROOT/'docs/gsis-integration').rglob('*') if p.is_file()]
    output.mkdir(parents=True, exist_ok=True)
    for file in items:
        relative = file.relative_to(ROOT)
        target = output/relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(file.read_bytes())
    for manifest in (output/'tests/baselines').glob('*/PROVENANCE.json'):
        for name, expected in json.loads(manifest.read_text())['files'].items():
            assert hashlib.sha256((manifest.parent/name).read_bytes()).hexdigest() == expected, 'Baseline provenance differs: '+name
    print(json.dumps({'output': str(output), 'files': len(items), 'configuration': 'external properties and bindings'}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    export(parser.parse_args().output)
