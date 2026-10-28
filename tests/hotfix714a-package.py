"""Verify the surgical archive against its full v0.7.14 baseline."""
from pathlib import Path
from io import BytesIO
from zipfile import ZipFile
import hashlib
import json
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
package, baseline = map(Path, sys.argv[1:3])
with ZipFile(package) as z, ZipFile(baseline) as base:
    meta = json.loads(z.read('RELEASE.json'))
    assert meta['commit'] == subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    assert meta['version'] == '0.7.14a'
    assert not any(name.startswith(('Contacts_Frontend', 'Deploy_Frontend', 'Layout_Frontend', 'Calendar_Frontend', 'Contacts_Backend', 'Calendar_Backend')) for name in z.namelist())
    for line in z.read('SHA256SUMS.txt').decode().splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256(z.read(name)).hexdigest() == digest, name
    assert z.read('Deploy_Backend_v0.7.14a.gs') == (root / 'Deploy_Backend_v0.7.14a.gs').read_bytes()
    with ZipFile(BytesIO(z.read('Roster_Frontend_v0.7.14a.zip'))) as new, ZipFile(BytesIO(base.read('Roster_Frontend_v0.7.14.zip'))) as old:
        assert set(new.namelist()) == set(old.namelist()), 'Preserve the complete existing frontend asset set'
        changed = {name for name in new.namelist() if new.read(name) != old.read(name)}
        assert changed == {'index.html', '_worker.js', 'roster-stapler-ui.js', 'roster-stapler-model.js', 'roster-operations-model.js'}, changed
        for name in new.namelist():
            assert new.read(name) == (root / 'roster-update/public' / name).read_bytes(), name
    with ZipFile(BytesIO(z.read('GSiS_v0.7.14a_Changed_Source.zip'))) as source:
        assert set(source.namelist()) == set(meta['changedFiles'])
        for name in source.namelist():
            assert source.read(name) == (root / name).read_bytes(), name
    assert not any(name.startswith(('public/', 'contacts-update/', 'layout-update/', 'calendar-update/', 'calendar-backend/', 'notification-worker/')) for name in meta['changedFiles'])
print('PASS 0.7.14a package: two deployment items, unchanged other components and assets, exact committed source, all checksums')
