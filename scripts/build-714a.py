"""Build only the two deployment items changed by the v0.7.14a patch."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
meta = json.loads((root / 'HOTFIX_v0.7.14a.json').read_text())
version = meta['version']
backend = root / 'backend/Code.gs'
code = backend.read_text()
for owner, marker, browser in [
    ('shared/roster-stapler.js', 'GSIS_ROSTER_STAPLER', 'roster-stapler-model.js'),
    ('shared/roster-operations.js', 'GSIS_ROSTER_OPERATIONS_MODEL', 'roster-operations-model.js'),
]:
    source = (root / owner).read_text()
    pattern = r'/\* ' + marker + r'_BEGIN \*/[\s\S]*?/\* ' + marker + r'_END \*/'
    block = '/* ' + marker + '_BEGIN */\n' + source + '\n/* ' + marker + '_END */'
    code, count = re.subn(pattern, lambda _: block, code)
    assert count == 1, marker
    shutil.copyfile(root / owner, root / 'roster-update/public' / browser)
backend.write_text(code)
complete = code + '\n' + (root / 'backend/Seed.gs').read_text()
backend_name = f'Deploy_Backend_v{version}.gs'
(root / backend_name).write_text(complete.replace('DEPLOY_SEED', 'GSIS_DEPLOY_EMBEDDED_SEED_04'))
if '--sync-only' in sys.argv:
    print('Synced the two changed shared models and the v0.7.14a backend')
    sys.exit(0)

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)

assert not git('status', '--porcelain').strip(), 'Commit the reviewed patch before packaging'
commit = git('rev-parse', 'HEAD').decode().strip()
changed = git('diff', '--name-only', meta['baselineCommit'], 'HEAD').decode().splitlines()
out = root.parent / 'v0.7.14a'
out.mkdir(exist_ok=True)
frontend_name = f'Roster_Frontend_v{version}.zip'
with zipfile.ZipFile(out / frontend_name, 'w', zipfile.ZIP_DEFLATED) as archive:
    folder = root / 'roster-update/public'
    for path in sorted(folder.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(folder))
shutil.copyfile(root / backend_name, out / backend_name)
source_name = f'GSiS_v{version}_Changed_Source.zip'
with zipfile.ZipFile(out / source_name, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in changed:
        if (root / name).is_file():
            archive.write(root / name, name)
patch_name = f'GSiS_v{version}.patch'
(out / patch_name).write_bytes(git('diff', '--binary', meta['baselineCommit'], 'HEAD'))
bundle_name = f'GSiS_v{version}_Incremental.bundle'
subprocess.run(['git', 'bundle', 'create', str(out / bundle_name), 'HEAD', 'refs/tags/v0.7.14a', '^' + meta['baselineCommit']], cwd=root, check=True)
files = {name: (out / name).read_bytes() for name in [frontend_name, backend_name, source_name, patch_name, bundle_name]}
files['README.md'] = (root / 'HOTFIX_v0.7.14a.md').read_bytes()
files['RELEASE.json'] = (json.dumps({**meta, 'commit': commit, 'changedFiles': changed}, indent=2) + '\n').encode()
files['VALIDATION.md'] = (root / 'VALIDATION_v0.7.14a.md').read_bytes()
for path in sorted((root / 'verification').glob('714a-*.json')):
    files['verification/' + path.name] = path.read_bytes()
files['SHA256SUMS.txt'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(files.items())).encode()
package = out / f'GSiS_v{version}_Changed_Items.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in files.items():
        archive.writestr(name, data)
print(str(package), package.stat().st_size, 'bytes')
