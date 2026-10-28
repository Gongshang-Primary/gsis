"""Verify the surgical deployment package against its committed source."""
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import hashlib
import json
import subprocess

root = Path(__file__).resolve().parents[1]
version = '0.7.018b'
out = root.parent / ('v' + version)

def git(*args):
    return subprocess.check_output(['git', *args], cwd=root)

with ZipFile(out / f'GSiS_v{version}_Changed_Items.zip') as package:
    assert package.testzip() is None
    release = json.loads(package.read('RELEASE.json'))
    commit = git('rev-parse', 'HEAD').decode().strip()
    assert release['commit'] == commit == git('rev-parse', f'v{version}^{{commit}}').decode().strip()
    assert release['nextFullRelease'] == '0.7.19'
    assert set(release['components']) == {'Roster frontend', 'Deploy backend (shared by Roster)'}
    for row in package.read('SHA256SUMS.txt').decode().splitlines():
        checksum, name = row.split('  ', 1)
        assert hashlib.sha256(package.read(name)).hexdigest() == checksum, name
    assert package.read(f'Deploy_Backend_v{version}.gs') == (root / f'Deploy_Backend_v{version}.gs').read_bytes()
    generated = ((root / 'backend/Code.gs').read_text() + '\n' + (root / 'backend/Seed.gs').read_text()).replace('DEPLOY_SEED', 'GSIS_DEPLOY_EMBEDDED_SEED_04')
    assert package.read(f'Deploy_Backend_v{version}.gs').decode() == generated
    with ZipFile(BytesIO(package.read(f'Roster_Frontend_v{version}.zip'))) as frontend:
        assert frontend.testzip() is None
        assert b"version:'0.7.018b'" in frontend.read('_worker.js')
        assert b'v0.7.018b</span>' in frontend.read('index.html')
        folder = root / 'roster-update/public'
        expected = {str(p.relative_to(folder)) for p in folder.rglob('*') if p.is_file()}
        assert set(frontend.namelist()) == expected
        for name in expected:
            assert frontend.read(name) == (folder / name).read_bytes(), name
        baseline = release['baselineCommit']
        changed = {p.removeprefix('roster-update/public/') for p in release['changedFiles'] if p.startswith('roster-update/public/')}
        assert changed == {'index.html', '_worker.js'}
        for name in expected - changed:
            assert frontend.read(name) == git('show', baseline + ':roster-update/public/' + name), name
    with ZipFile(BytesIO(package.read(f'GSiS_v{version}_Changed_Source.zip'))) as source:
        assert set(source.namelist()) == set(release['changedFiles'])
        for name in source.namelist():
            assert source.read(name) == git('show', commit + ':' + name), name
    assert package.read(f'GSiS_v{version}.patch') == git('diff', '--binary', release['baselineCommit'], 'HEAD')
    assert not any(p.startswith(('contacts-update/', 'calendar-update/', 'layout-update/', 'public/')) for p in release['changedFiles'])
subprocess.run(['git', 'bundle', 'verify', str(out / f'GSiS_v{version}_Incremental.bundle')], cwd=root, check=True, stdout=subprocess.DEVNULL)
assert not git('status', '--porcelain').strip()
print('PASS v0.7.018b package: two deployment items, preserved other components/assets, committed source, tag, incremental history and checksums')
