"""Build the frontend deployment item changed by the v0.8.00a Roster patch."""
from pathlib import Path
import hashlib
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
meta = json.loads((root / 'HOTFIX_v0.8.00a.json').read_text())
version = meta['version']

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)

assert not git('status', '--porcelain').strip(), 'Commit the reviewed patch before packaging'
commit = git('rev-parse', 'HEAD').decode().strip()
assert git('rev-parse', f'v{version}^{{commit}}').decode().strip() == commit
changed = git('diff', '--name-only', meta['baselineCommit'], 'HEAD').decode().splitlines()
out = root.parent / f'v{version}'
out.mkdir(exist_ok=True)
frontend_name = f'Roster_Frontend_v{version}.zip'
with zipfile.ZipFile(out / frontend_name, 'w', zipfile.ZIP_DEFLATED) as archive:
    folder = root / 'roster-update/public'
    for path in sorted(folder.rglob('*')):
        if path.is_file():
            archive.write(path, path.relative_to(folder))
source_name = f'GSiS_v{version}_Changed_Source.zip'
with zipfile.ZipFile(out / source_name, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name in changed:
        if (root / name).is_file():
            archive.write(root / name, name)
patch_name = f'GSiS_v{version}.patch'
(out / patch_name).write_bytes(git('diff', '--binary', meta['baselineCommit'], 'HEAD'))
bundle_name = f'GSiS_v{version}_Incremental.bundle'
subprocess.run(['git', 'bundle', 'create', str(out / bundle_name), 'HEAD', f'refs/tags/v{version}', '^' + meta['baselineCommit']], cwd=root, check=True)
files = {name: (out / name).read_bytes() for name in [frontend_name, source_name, patch_name, bundle_name]}
files['README.md'] = (root / f'HOTFIX_v{version}.md').read_bytes()
files['RELEASE.json'] = (json.dumps({**meta, 'commit': commit, 'changedFiles': changed}, indent=2) + '\n').encode()
files['VALIDATION.md'] = (root / f'VALIDATION_v{version}.md').read_bytes()
files['SHA256SUMS.txt'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(files.items())).encode()
package = out / f'GSiS_v{version}_Changed_Items.zip'
with zipfile.ZipFile(package, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, data in files.items():
        archive.writestr(name, data)
print(str(package), package.stat().st_size, 'bytes')
