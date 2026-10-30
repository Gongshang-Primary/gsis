"""Package 0.9.9's full installation and a pruned, independently reviewable source tree.

This script reads local build outputs. It never deploys, sends, prunes school data,
changes Git history, or runs a migration. Default operation requires committed
source and the exact release tag. --preview creates explicitly uncommitted drafts.
"""
from pathlib import Path, PurePosixPath
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.9.9'
# The repository starts at the 0.9.9 release as deployed on 28 Oct 2026.
# Earlier history (0.9.8q, 50c977d) was not imported into GitHub.
BASELINE = '2efd6e003fa9ee3846cf590d07902a22309861ff'
BASELINE_LABEL = '0.9.9 (deployed 28 Oct 2026)'
PREPARATION_NAME = 'GSiS_v0.9.9_Timetable_Preparation.zip'
# Narrow historical fixtures are executable recovery-test dependencies, not duplicate deliveries.
HISTORICAL_TEST_FIXTURES = {
    'Contacts_Backend_v0.7.17.gs': 'tests/contacts718-roster-performance.cjs signed comparative regression',
    'Roster_Backend_v0.8.6a.gs': 'tests/roster087-notification-maintenance.cjs legacy maintenance safety',
}
STAMP = (2026, 10, 28, 0, 0, 0)
FRONTENDS = ('Contacts', 'Deploy', 'Layout', 'Roster', 'Calendar', 'LORD', 'OVERLORD', 'STARLORD', 'Venues')
BACKENDS = ('Contacts', 'Deploy', 'Roster', 'Calendar', 'LORD', 'Venues')
WORKERS = {
    'Roster_Notification_Worker_v0.9.9.txt': 'notification-worker/dashboard-worker.txt',
    'GSiS_Operations_Worker_v0.9.9.txt': 'operations-worker/dashboard-worker.txt',
    'GSiS_Calendar_Job_Worker_v0.9.9.txt': 'calendar-job-worker/dashboard-worker.txt',
}
PRODUCTION_AUTHORITIES = {'roster': 'Google', 'calendar': 'Google',
                         'deploy': 'unchanged configured authority', 'preparation': 'shadow-only'}

EXCLUDED_LIVE_EVIDENCE = {
    'docs/reviews/optimization-20261024/lord-deploy-live-catalogue-evidence.json',
    'lord-suite/docs/gsis-integration/lord-deploy-live-catalogue-evidence.json',
    'lord-suite/First_Time_Setup/gsis-integration/lord-deploy-live-catalogue-evidence.json',
    'lord-suite/tests/history_v1.3/live_reference_check.json',
    'lord-suite/tests/history_v1.3/live_health_check.json',
    'lord-suite/tests/history_v1.5/live_read_v15.json',
    'lord-suite/tests/history_v1.5/live_followup_v15.json',
    'lord-suite/tests/history_v1.5/live_endpoint_diagnosis_v15.json',
}

def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, indent=2, ensure_ascii=True, sort_keys=True) + '\n').encode()


def git(root, *args):
    return subprocess.check_output(['git', *args], cwd=root)


def safe_path(name):
    assert isinstance(name, str) and name and '\\' not in name and not any(ord(c) < 32 for c in name), 'Unsafe archive path'
    path = PurePosixPath(name)
    assert not path.is_absolute() and '..' not in path.parts and str(path) == name, 'Unsafe archive path'
    return name


def source_exclusion_reason(name):
    """Keep canonical code and tests; omit only redundant or non-source material."""
    safe_path(name)
    if name in HISTORICAL_TEST_FIXTURES:
        return None
    if name in EXCLUDED_LIVE_EVIDENCE:
        return 'Historical live observation omitted; current contract test uses a synthetic catalogue fixture'
    p = PurePosixPath(name)
    if any(part in {'.git', 'node_modules', '__pycache__', 'upload', 'uploads'} for part in p.parts):
        return 'Local tooling, repository internals or uploaded private material'
    if p.name in {'.env', '.dev.vars', 'deployment-settings.json'} or (p.name.startswith(('.env.', '.dev.vars.')) and not p.name.endswith('.example')) or p.suffix in {'.secret', '.pem', '.key'}:
        return 'Private configuration or credential material'
    if p.suffix.lower() in {'.zip', '.bundle', '.pyc'}:
        return 'Generated archive, prior full history or bytecode; current source is supplied directly'
    if len(p.parts) == 1 and re.fullmatch(r'[A-Za-z]+_Backend_v\d[^/]+\.gs', p.name) and not p.name.endswith(('_v0.9.8p.gs', '_v0.9.8q.gs', '_v0.9.9.gs')):
        return 'Superseded generated backend release; canonical modules, P/Q comparison and current output retained'
    if name.startswith('docs/.GSiS-') or name.startswith('docs/.archify-delivery-'):
        return 'Temporary historical document output; canonical current documentation retained'
    if name.startswith('docs/') and p.suffix in {'.html', '.drawio', '.svg', '.pdf'} and VERSION not in name:
        if re.search(r'(?:GSiS[-_]v\d|GSiS-.*-v\d)', name):
            return 'Superseded release manual or architecture copy; current 0.9.9 guide retained'
    # Tracked review notes and older contracts remain small and can explain why a
    # safety rule exists. The historical Git object store is not copied at all.
    return None


def source_files(root, names):
    files, included, omitted = {}, {}, {}
    assert len(names) == len(set(names)), 'Duplicate source path'
    for name in sorted(names):
        safe_path(name)
        path = root / name
        assert not path.is_symlink(), 'Symlink is not a source file: ' + name
        assert path.is_file(), 'Missing source file: ' + name
        data = path.read_bytes()
        item = {'sha256': digest(data), 'bytes': len(data)}
        reason = source_exclusion_reason(name)
        if reason:
            omitted[name] = {**item, 'reason': reason}
        else:
            included[name] = item
            files['source/' + name] = data
    return files, {'schema': 1, 'included': included, 'omitted': omitted,
                   'includedBytes': sum(x['bytes'] for x in included.values()),
                   'omittedBytes': sum(x['bytes'] for x in omitted.values()),
                   'retainedHistoricalTestDependencies': HISTORICAL_TEST_FIXTURES,
                   'policy': 'All listed source files are accounted for. This is a current source snapshot, not a full Git-history archive.'}


def read_required(root, name, kind='installation component'):
    safe_path(name)
    path = root / name
    assert path.is_file() and not path.is_symlink(), 'Missing ' + kind + ': ' + name
    return path.read_bytes()


def installation_files(root):
    files = {}
    for app in FRONTENDS:
        name = f'{app}_Frontend_v{VERSION}.zip'
        data = read_required(root, name)
        with zipfile.ZipFile(root / name) as archive:
            names = archive.namelist()
            assert len(names) == len(set(names)) and archive.testzip() is None, 'Corrupt frontend: ' + app
            assert {'index.html', '_worker.js'} <= set(names), 'Incomplete frontend: ' + app
            assert all(source_exclusion_reason(n) is None for n in names), 'Unsafe frontend contents: ' + app
        files['Production/' + name] = data
    for app in BACKENDS:
        name = f'{app}_Backend_v{VERSION}.gs'
        files['Production/' + name] = read_required(root, name)
    for name, path in WORKERS.items():
        data = read_required(root, path)
        assert re.search(rb'export\s+default\s|export\s*\{[^}]*\bas\s+default\b', data), 'Not a Worker module: ' + name
        assert not re.search(rb'(?:import\s+(?:[^;]*?\s+from\s*)?|export\s+[^;]*?from\s*)[\"\']\.', data), 'Unbundled Worker: ' + name
        files['Optional_Workers/' + name] = data
    return files


def write_archive(destination, files, metadata):
    assert 'MANIFEST.json' not in files, 'Manifest is generated by the packager'
    for name in files:
        safe_path(name)
    manifest = {**metadata, 'files': {name: digest(data) for name, data in sorted(files.items())}}
    payload = {**files, 'MANIFEST.json': json_bytes(manifest)}
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix='gsis-package-', suffix='.zip', dir=destination.parent, delete=False) as temp:
        temporary = Path(temp.name)
    try:
        with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
            for name, data in sorted(payload.items()):
                info = zipfile.ZipInfo(name, STAMP)
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
        verify_archive(temporary)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def verify_archive(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate archive inventory'
        assert archive.testzip() is None, 'Archive CRC failed'
        for name in names:
            safe_path(name)
        manifest = json.loads(archive.read('MANIFEST.json'))
        assert set(names) == set(manifest['files']) | {'MANIFEST.json'}, 'Archive inventory differs from manifest'
        for name, expected in manifest['files'].items():
            assert digest(archive.read(name)) == expected, 'Hash differs: ' + name
    return manifest


def evidence_files(root, evidence_dir):
    result = {}
    if evidence_dir is None:
        return result
    directory = evidence_dir.resolve()
    assert directory.is_dir() and directory.is_relative_to(root.resolve() / 'verification'), 'Evidence must be under this source verification directory'
    for path in sorted(directory.rglob('*')):
        if path.is_dir() or 'package-candidate' in path.parts or 'recovery' in path.parts:
            continue
        assert not path.is_symlink(), 'Evidence symlink refused'
        name = str(path.relative_to(directory))
        safe_path(name)
        assert source_exclusion_reason(name) is None, 'Unsafe evidence file: ' + name
        assert path.suffix in {'.json', '.md', '.txt', '.log', '.patch', '.cjs', '.mjs', '.py'}, 'Unsupported evidence type: ' + name
        assert path.stat().st_size <= 20 * 1024 * 1024, 'Evidence file needs summarising: ' + name
        result['Validation/' + name] = path.read_bytes()
    return result


def relocate_document_links(data, origin, destination, mapping):
    """Relocate links when current guides are flattened into the installation ZIP."""
    import posixpath
    if PurePosixPath(origin).suffix not in {'.md', '.html'}: return data
    text = data.decode()
    def target(link):
        if re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', link) or link.startswith(('#', '/')): return link
        path, separator, fragment = link.partition('#')
        source = posixpath.normpath(posixpath.join(posixpath.dirname(origin), path))
        resolved = mapping.get(source)
        if resolved is None: return link
        return posixpath.relpath(resolved, posixpath.dirname(destination) or '.') + (separator + fragment if separator else '')
    text = re.sub(r'(\]\()([^()]+)(\))', lambda m: m[1] + target(m[2]) + m[3], text)
    if PurePosixPath(origin).suffix == '.md':
        text = re.sub(r'`([^`\n]+)`', lambda m: '`' + target(m[1]) + '`', text)
    text = re.sub(r'(href=["\'])([^"\']+)(["\'])', lambda m: m[1] + target(m[2]) + m[3], text)
    return text.encode()


def support_files(root):
    """Canonical installation guidance/configuration is verified as rigorously as code."""
    origins = {'START_HERE.html': f'SETUP_v{VERSION}.html', 'START_HERE.md': f'SETUP_v{VERSION}.md'}
    for filename in [f'CHANGELOG_v{VERSION}.md', f'VALIDATION_v{VERSION}.md']:
        origins['Docs/' + filename] = filename
    for path in sorted((root / 'docs/v099').rglob('*')):
        if path.is_file():
            assert not path.is_symlink(), 'Documentation symlink refused'
            origins['Docs/' + str(path.relative_to(root / 'docs/v099'))] = str(path.relative_to(root))
    for path in [f'docs/GSiS-v{VERSION}-User-Manual.html', f'docs/architecture/GSiS_v{VERSION}_Architecture.html', f'docs/architecture/GSiS_v{VERSION}_Architecture.drawio']:
        if (root / path).is_file(): origins['Docs/' + Path(path).name] = path
    origins.update({
        'Optional_Workers/Calendar_Jobs_schema.sql': 'calendar-job-worker/schema.sql',
        'Optional_Workers/Calendar_Jobs_wrangler.example.jsonc': 'calendar-job-worker/wrangler.example.jsonc',
        'Optional_Workers/Calendar_Jobs_Setup.md': 'calendar-job-worker/README.md',
        'Optional_Workers/Calendar_Changes_schema.sql': 'calendar-job-worker/change-awareness.sql',
        'Optional_Workers/Calendar_Changes_wrangler.example.jsonc': 'calendar-job-worker/wrangler.change-push.example.jsonc',
        'Optional_Workers/WORKERS_README.md': 'docs/v099/WORKERS_INVENTORY.md',
        'Docs/LORD_appsscript.services.fragment.json': 'lord-suite/Source/backend/appsscript.services.fragment.json',
        'Docs/LORD_PHOTO_UPLOAD_RELIABILITY.md': 'lord-suite/docs/PHOTO_UPLOAD_RELIABILITY.md',
    })
    for destination, source in {
        'Docs/Context/Q_FAILURE_CLASSIFICATION.md': 'docs/v098q/FULL_SUITE_FAILURE_CLASSIFICATION.md',
    }.items():
        if (root / source).is_file(): origins[destination] = source
    mapping = {source: destination for destination, source in origins.items()}
    # Prefer the canonical Docs copy over its additional Worker-side alias.
    mapping['docs/v099/WORKERS_INVENTORY.md'] = 'Docs/WORKERS_INVENTORY.md'
    return {destination: relocate_document_links(read_required(root, source, 'setup dependency'), source, destination, mapping)
            for destination, source in origins.items()}


def verify_preparation_bytes(data):
    """Check the separately versioned shadow package without changing its setup."""
    import io
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)) and archive.testzip() is None, 'Invalid preparation archive'
        for name in names: safe_path(name)
        manifest = json.loads(archive.read('MANIFEST.json'))
        assert manifest['release'] == VERSION, 'Preparation release is not harmonised'
        assert manifest['productionInstallation'] is False and manifest['productionCutover'] is False
        assert manifest.get('deployed') is False and manifest['mode'] == 'shadow-only'
        assert manifest['workerName'] == 'gsis-roster-rehearsal'
        assert manifest['existingBindings'] == ['REHEARSAL_LEDGER', 'REHEARSAL_TIMETABLES']
        assert set(names) == set(manifest['files']) | {'MANIFEST.json'}, 'Preparation inventory differs'
        for name, expected in manifest['files'].items():
            assert digest(archive.read(name)) == expected, 'Preparation hash differs: ' + name
    return manifest


def build(root):
    settings = json.loads(read_required(root, 'package.json', 'release metadata'))
    assert settings['gsisRelease'] == VERSION and settings['gsisPackageKind'] == 'full-suite'
    assert set(settings['gsisComponentVersions'].values()) == {VERSION}
    subprocess.run(['python3', 'scripts/build-release.py'], cwd=root, check=True)
    files = installation_files(root)
    return {'release': VERSION, 'builtProductionComponents': len(files), 'productionDeployed': False}


def package(root, output, preview=False, evidence_dir=None):
    settings = json.loads(read_required(root, 'package.json', 'release metadata'))
    assert settings['gsisRelease'] == VERSION, 'Package release is not 0.9.9'
    assert set(settings['gsisComponentVersions'].values()) == {VERSION}, 'Production component labels are not harmonised'
    expected_keys = {n.lower() + 'Frontend' for n in FRONTENDS} | {n.lower() + 'Backend' for n in BACKENDS} | {'notificationWorker', 'operationsWorker', 'calendarJobWorker'}
    assert set(settings['gsisComponentVersions']) == expected_keys, 'Production component inventory must contain all eighteen components'
    commit = git(root, 'rev-parse', 'HEAD').decode().strip()
    git(root, 'merge-base', '--is-ancestor', BASELINE, commit)
    tracked = git(root, 'ls-files', '-z').decode().split('\0')[:-1]
    untracked = git(root, 'ls-files', '--others', '--exclude-standard', '-z').decode().split('\0')[:-1]
    dirty = bool(git(root, 'status', '--porcelain').strip())
    if not preview:
        assert not dirty, 'Commit every source change before final packaging'
        assert git(root, 'rev-parse', 'refs/tags/v' + VERSION + '^{commit}').decode().strip() == commit, '0.9.9 tag does not identify HEAD'
    names = sorted(set(tracked + (untracked if preview else [])))
    current = {name for name in names if (root / name).is_file()}
    assert not (set(tracked) - current), 'Tracked source deletion must be committed before packaging'
    review, index = source_files(root, sorted(current))
    metadata = {'schema': 1, 'release': VERSION, 'sourceCommit': commit,
                'sourceState': 'working-tree-preview' if dirty or preview else 'committed',
                'baseline': BASELINE_LABEL, 'baselineCommit': BASELINE, 'componentVersions': settings['gsisComponentVersions'], 'tag': None if dirty or preview else 'v' + VERSION,
                'productionDeployed': False, 'productionAuthorities': PRODUCTION_AUTHORITIES,
                'authorityCutoverPerformed': False, 'historyKind': 'current-source-with-baseline-diff'}
    review['SOURCE_INDEX.json'] = json_bytes(index)
    review['CHANGES_FROM_0.9.9_BASELINE.patch'] = git(root, 'diff', '--binary', BASELINE, *([] if preview else [commit]))
    review['RECOVERY_HISTORY.md'] = read_required(root, 'docs/v099/RECOVERY_HISTORY.md', 'concise recovery history')
    review['RECENT_COMMITS.txt'] = git(root, 'log', '--format=fuller', BASELINE + '..' + commit)
    review['README_REVIEW.md'] = read_required(root, 'docs/v099/SOURCE_REVIEW.md', 'review guide')
    review.update(evidence_files(root, evidence_dir))
    review_name = f'GSiS_v{VERSION}_Review_Source.zip'
    review_path = output / review_name
    write_archive(review_path, review, {**metadata, 'kind': 'review-source',
                                      'sourceIncludedCount': len(index['included']),
                                      'sourceOmittedCount': len(index['omitted'])})

    suite = installation_files(root)
    suite.update(support_files(root))
    separate = []
    for item in settings.get('gsisSeparatePackages', []):
        name = safe_path(item['name'])
        assert '/' not in name and item['productionInstallation'] is False, 'Preparation must remain separate'
        path = output / name
        assert path.is_file(), 'Missing separately verified preparation companion: ' + name
        data = path.read_bytes()
        verify_preparation_bytes(data)
        subprocess.run(['python3', 'scripts/verify-timetable-preparation.py', str(path)], cwd=root, check=True, capture_output=True)
        suite['Timetable_Preparation/' + name] = data
        separate.append({**item, 'sha256': digest(data), 'bytes': len(data)})
    assert len(separate) == 1 and separate[0]['name'] == PREPARATION_NAME, 'The separately versioned shadow preparation companion is required'
    suite['REVIEW_SOURCE.json'] = json_bytes({'file': review_name, 'sha256': digest(review_path.read_bytes()),
                                           'bytes': review_path.stat().st_size,
                                           'description': 'Separate lean source and second-opinion evidence; not a Pages upload'})
    suite_path = output / f'GSiS_v{VERSION}_Full_Suite.zip'
    write_archive(suite_path, suite, {**metadata, 'kind': 'full-suite',
                                    'frontends': list(FRONTENDS), 'backends': list(BACKENDS),
                                    'optionalWorkers': list(WORKERS), 'separatePackages': separate})
    return {'suite': {'path': str(suite_path), 'bytes': suite_path.stat().st_size, 'sha256': digest(suite_path.read_bytes())},
            'review': {'path': str(review_path), 'bytes': review_path.stat().st_size, 'sha256': digest(review_path.read_bytes())},
            'sourceIncludedCount': len(index['included']), 'sourceOmittedCount': len(index['omitted']),
            'sourceBytesOmitted': index['omittedBytes'], 'sourceCommit': commit, 'preview': preview}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT.parent / 'deliverables')
    parser.add_argument('--evidence-dir', type=Path)
    parser.add_argument('--build-only', action='store_true')
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    print(json.dumps(build(ROOT) if args.build_only else package(ROOT, args.output_dir.resolve(), args.preview, args.evidence_dir), indent=2))
