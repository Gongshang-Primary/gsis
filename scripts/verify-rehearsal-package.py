"""Verify the isolated rehearsal ZIP against canonical source without running its contents."""
from pathlib import Path
import argparse
import hashlib
import json
import io
import os
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def verify(package):
    # This unchanged preparation package retains I identity when the production
    # release advances. Validate its canonical source and manifest, not the host release.
    release = '0.9.8i'
    settings = json.loads((ROOT / 'package.json').read_text())
    with tempfile.TemporaryDirectory(prefix='gsis-verify-rehearsal-') as directory:
        canonical = ROOT
        baseline = settings.get('gsisRehearsalSourceBase')
        if baseline:
            # I imported shared domain helpers. Rebuilding against later production
            # helpers would change the preserved rehearsal despite unchanged entry code.
            canonical = Path(directory) / 'canonical'
            canonical.mkdir()
            data = subprocess.check_output(['git', 'archive', '--format=zip', baseline,
                'rehearsal-worker', 'shared', 'scripts/build-rehearsal-worker.cjs',
                'scripts/setup-rehearsal.py', 'docs/v098i'], cwd=ROOT)
            with zipfile.ZipFile(io.BytesIO(data)) as source:
                for name in source.namelist():
                    assert not Path(name).is_absolute() and '..' not in Path(name).parts
                source.extractall(canonical)
        worker = Path(directory) / 'worker.mjs'
        # Only repository-owned source is bundled. No code from the supplied
        # package or setup script is executed; generated source files do not change.
        subprocess.run(['node', 'scripts/build-rehearsal-worker.cjs', '--output', str(worker)],
                       cwd=canonical, check=True, capture_output=True, text=True,
                       env={**os.environ, 'NODE_PATH': str(ROOT / 'node_modules') + os.pathsep + os.environ.get('NODE_PATH', '')})
        sources = {
            'worker.mjs': worker,
            'schema.sql': canonical / 'rehearsal-worker/schema.sql',
            'wrangler.example.toml': canonical / 'rehearsal-worker/wrangler.example.toml',
            'setup-rehearsal.py': canonical / 'scripts/setup-rehearsal.py',
            'REHEARSAL_SETUP.md': canonical / 'docs/v098i/REHEARSAL_SETUP.md',
            'SNAPSHOT_SCHEMA.md': canonical / 'docs/v098i/REHEARSAL_SNAPSHOT_SCHEMA.md',
        }
        expected = {name: path.read_bytes() for name, path in sources.items()}
        expected_manifest = {
            'release': release,
            'workerName': 'gsis-roster-rehearsal',
            'productionInstallation': False,
            'deployed': False,
            'schema': 'gsis.rehearsal.snapshot',
            'schemaVersion': 1,
            'files': {name: hashlib.sha256(data).hexdigest() for name, data in expected.items()},
        }
        with zipfile.ZipFile(package) as archive:
            names = archive.namelist()
            assert len(names) == len(set(names)), 'Duplicate rehearsal archive entries'
            assert set(names) == {*expected, 'MANIFEST.json'}, 'Unexpected rehearsal archive inventory'
            for name, data in expected.items():
                assert archive.getinfo(name).file_size == len(data), 'Rehearsal source parity: ' + name
                assert archive.read(name) == data, 'Rehearsal source parity: ' + name
            assert archive.getinfo('MANIFEST.json').file_size < 16384, 'Rehearsal manifest is too large'
            manifest = json.loads(archive.read('MANIFEST.json'))
            assert manifest['productionInstallation'] is False and manifest['deployed'] is False
            assert type(manifest['schemaVersion']) is int
            assert manifest == expected_manifest, 'Rehearsal manifest must match canonical identity and hashes'
            assert archive.testzip() is None, 'Corrupt rehearsal ZIP'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    args = parser.parse_args()
    verify(args.package)
    print('PASS separate rehearsal package: canonical Worker/assets parity and manifest identity')
