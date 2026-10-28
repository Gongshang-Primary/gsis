"""Verify the surgical deployment package against its committed source."""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[1]
version = '0.8.00a'
out = root.parent / ('v' + version)

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)

with ZipFile(out / f'GSiS_v{version}_Changed_Items.zip') as package:
    assert package.testzip() is None
    release = json.loads(package.read('RELEASE.json'))
    commit = git('rev-parse', 'HEAD').decode().strip()
    assert release['commit'] == commit == git('rev-parse', f'v{version}^{{commit}}').decode().strip()
    assert release['mergeIntoNextFullRelease'] is True
    assert set(release['components']) == {'Roster frontend'}
    for row in package.read('SHA256SUMS.txt').decode().splitlines():
        checksum, name = row.split('  ', 1)
        assert hashlib.sha256(package.read(name)).hexdigest() == checksum, name
    assert not any(name.endswith('.gs') for name in package.namelist())
    assert release['requiredBackendVersion'] == '0.8.0'
    with ZipFile(BytesIO(package.read(f'Roster_Frontend_v{version}.zip'))) as frontend:
        assert frontend.testzip() is None
        assert b"version:'0.8.0'" in frontend.read('_worker.js')
        assert b'v0.8.00a</span>' in frontend.read('index.html')
        folder = root / 'roster-update/public'
        expected = {str(p.relative_to(folder)) for p in folder.rglob('*') if p.is_file()}
        assert set(frontend.namelist()) == expected
        for name in expected:
            assert frontend.read(name) == (folder / name).read_bytes(), name
        baseline = release['baselineCommit']
        changed = {p.removeprefix('roster-update/public/') for p in release['changedFiles'] if p.startswith('roster-update/public/')}
        assert changed == {'index.html', 'roster-operations-ui.js'}
        assert frontend.read('_worker.js') == git('show', baseline + ':roster-update/public/_worker.js'), 'Worker remains unchanged'
        assert b'roster-operations-ui.js?v=0.8.00a' in frontend.read('index.html')
        for name in expected - changed:
            assert frontend.read(name) == git('show', baseline + ':roster-update/public/' + name), name
    with ZipFile(BytesIO(package.read(f'GSiS_v{version}_Changed_Source.zip'))) as source:
        assert set(source.namelist()) == set(release['changedFiles'])
        for name in source.namelist():
            assert source.read(name) == git('show', commit + ':' + name), name
    assert package.read(f'GSiS_v{version}.patch') == git('diff', '--binary', release['baselineCommit'], 'HEAD')
    assert not any(p.startswith(('backend/', 'shared/', 'contacts-backend/', 'calendar-backend/', 'contacts-update/', 'calendar-update/', 'layout-update/', 'notification-worker/', 'public/')) for p in release['changedFiles'])
    assert git('show', 'HEAD:package.json') == git('show', release['baselineCommit'] + ':package.json'), 'Full-suite version remains unchanged'
subprocess.run(['git', 'bundle', 'verify', str(out / f'GSiS_v{version}_Incremental.bundle')], cwd=root, check=True, stdout=subprocess.DEVNULL)
assert not git('status', '--porcelain').strip()
print('PASS v0.8.00a package: one frontend deployment item, preserved backend/other components/assets, committed source, tag, incremental history and checksums')
