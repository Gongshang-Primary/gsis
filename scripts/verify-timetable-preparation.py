"""Compare a preparation ZIP with repository-owned source; never execute ZIP contents."""
from pathlib import Path
import argparse
import importlib.util
import json
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def verify(package):
    spec = importlib.util.spec_from_file_location('gsis_preparation_package', ROOT / 'scripts/package-timetable-preparation.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    with tempfile.TemporaryDirectory(prefix='gsis-ttprep-verify-') as directory:
        expected, provenance = module.canonical_files(directory)
        expected_manifest = module.manifest(expected, provenance)
        with zipfile.ZipFile(package) as archive:
            names = archive.namelist()
            assert len(names) == len(set(names)), 'Duplicate preparation archive entries'
            assert set(names) == {*expected, 'MANIFEST.json'}, 'Unexpected preparation archive inventory'
            for name, data in expected.items():
                assert archive.getinfo(name).file_size == len(data), 'Preparation source parity: ' + name
                assert archive.read(name) == data, 'Preparation source parity: ' + name
            assert archive.getinfo('MANIFEST.json').file_size < 65536, 'Oversized manifest'
            assert json.loads(archive.read('MANIFEST.json')) == expected_manifest, 'Preparation manifest identity and source hashes must match'
            assert archive.testzip() is None, 'Corrupt preparation ZIP'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('package', type=Path)
    verify(parser.parse_args().package)
    print('PASS separate timetable preparation package: canonical source, bundle, inventory and manifest')
