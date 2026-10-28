"""Package timetable-only shadow preparation separately from production deployments."""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RELEASE = '0.9.9'
PROTOCOL_RELEASE = '0.9.8o'
STAMP = (2026, 10, 28, 0, 0, 0)


def canonical_files(build_dir):
    worker = Path(build_dir) / 'worker.mjs'
    subprocess.run(['node', 'scripts/build-timetable-prep-worker.cjs', '--output', str(worker)],
                   cwd=ROOT, check=True, capture_output=True, text=True)
    provenance = json.loads(worker.with_name('provenance.json').read_text())
    sources = {
        'worker.mjs': worker,
        'provenance.json': worker.with_name('provenance.json'),
        'schema.sql': ROOT / 'timetable-prep-worker/schema.sql',
        'wrangler.example.toml': ROOT / 'timetable-prep-worker/wrangler.example.toml',
        'TIMETABLE_PREPARATION_SETUP.html': ROOT / 'docs/v099/TIMETABLE_PREPARATION_SETUP.html',
        'PREPARATION_VALIDATION.md': ROOT / 'docs/v099/PREPARATION_VALIDATION.md',
        'TIMETABLE_EXPORT_CONTRACT.md': ROOT / 'docs/v098o/TIMETABLE_EXPORT_CONTRACT.md',
    }
    source_names = set(provenance['inputs'])
    source_names.update(str(p.relative_to(ROOT)) for p in (ROOT / 'timetable-prep-worker').glob('*') if p.is_file())
    source_names.update(['scripts/build-timetable-prep-worker.cjs', 'scripts/package-timetable-preparation.py',
                         'scripts/verify-timetable-preparation.py', 'backend/RosterTimetablePreparation.gs',
                         'docs/v098o/TIMETABLE_EXPORT_CONTRACT.md'])
    source_names.update(['shared/roster-operations.js', 'rehearsal-worker/schema.sql', 'tests/roster098o-timetable-export.cjs',
                         'tests/roster098o-timetable-worker.mjs', 'tests/roster098o-preparation-package.cjs',
                         'tests/helpers/timetable-preparation-source.cjs',
                         'docs/v099/TIMETABLE_PREPARATION_SETUP.html', 'docs/v099/PREPARATION_VALIDATION.md'])
    for name in sorted(source_names):
        sources['source/' + name] = ROOT / name
    files = {name: p.read_bytes() for name, p in sources.items()}
    files['source/package.json'] = (json.dumps({'name': 'gsis-timetable-preparation-source', 'version': RELEASE,
        'private': True, 'description': 'Timetable-only shadow preparation, no production authority',
        'scripts': {'build': 'node scripts/build-timetable-prep-worker.cjs'},
        'devDependencies': {'esbuild': provenance['buildToolVersion'],
                            'jsdom': json.loads((ROOT / 'package.json').read_text())['devDependencies']['jsdom']}}, indent=2) + '\n').encode()
    files['source/README.md'] = b'''# Timetable preparation source\n\nThis is the preparation component, not the production Roster deployment.\nRuntime 0.9.9 preserves the native O (0.9.8o) version 1 wire contract.\nUse Node 24.22.1 or a compatible Node version with node:sqlite for storage tests.\n\nFrom this source directory:\n\n```sh\nnpm install\nnode scripts/build-timetable-prep-worker.cjs\nnode tests/roster098o-timetable-worker.mjs\nTIMETABLE_PREP_TEST_BUNDLE=1 node tests/roster098o-timetable-worker.mjs\nnode tests/roster098o-timetable-export.cjs\nnode tests/roster098o-preparation-package.cjs\npython3 scripts/verify-timetable-preparation.py /path/to/GSiS_v0.9.9_Timetable_Preparation.zip\n```\n\nThe verifier only runs repository-owned build code. It compares a package with\nthis source; it does not establish that a source copy from an untrusted package\nis authentic. Compare the published archive SHA256 using a trusted channel.\nThe Node tests do not replace a live Cloudflare runtime and school-scale check.\n\nrehearsal-worker/schema.sql is the original I schema used by the tests\nto emulate existing storage. Do not execute it against your initialized\nlive database. Only the top-level schema.sql adds O preparation tables.\n'''
    return files, provenance


def manifest(files, provenance):
    return {'release': RELEASE, 'protocolRelease': PROTOCOL_RELEASE, 'workerName': 'gsis-roster-rehearsal', 'mode': 'shadow-only',
            'productionInstallation': False, 'productionCutover': False, 'deployed': False,
            'existingBindings': ['REHEARSAL_LEDGER', 'REHEARSAL_TIMETABLES'],
            'sourceSha256': provenance['sourceSha256'], 'bundleSha256': provenance['bundleSha256'],
            'files': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}


def write_zip(destination):
    with tempfile.TemporaryDirectory(prefix='gsis-ttprep-package-') as directory:
        files, provenance = canonical_files(directory)
        files['MANIFEST.json'] = (json.dumps(manifest(files, provenance), indent=2) + '\n').encode()
        destination.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(name, STAMP)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
    print('Created separate timetable preparation package:', destination)
    print('SHA256:', hashlib.sha256(destination.read_bytes()).hexdigest())


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zip', type=Path, default=ROOT.parent / 'deliverables/GSiS_v0.9.9_Timetable_Preparation.zip')
    args = parser.parse_args()
    write_zip(args.zip.resolve())
