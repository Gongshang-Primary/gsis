"""Verify the 0.9.9 installation and lean source against the current trusted checkout.

This does not execute code from the supplied archives or contact any live service.
Run source regeneration separately before using --source-root on a recovered tree.
"""
from pathlib import Path
import argparse
import ast
import importlib.util
import io
import json
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package099', ROOT / 'scripts/package-099-suite.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)

FRONTEND_FOLDERS = {'Contacts': 'contacts-update/public', 'Deploy': 'public',
                   'Layout': 'layout-update/public', 'Roster': 'roster-update/public',
                   'Calendar': 'calendar-update/public', 'LORD': 'lord-suite/Source/lord',
                   'OVERLORD': 'lord-suite/Source/overlord', 'STARLORD': 'lord-suite/Source/starlord',
                   'Venues': 'venues-viewport/public'}


def verify_source_inventory(root, index, preview):
    """A checkout proves completeness; a pruned recovery can prove only its index."""
    probe = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=root, capture_output=True, text=True)
    if probe.returncode or Path(probe.stdout.strip()).resolve() != root.resolve():
        return 'supplied-manifest-only; original omitted files and Git inventory unavailable'
    names = set(p.git(root, 'ls-files', '-z').decode().split('\0')[:-1])
    if preview:
        names.update(p.git(root, 'ls-files', '--others', '--exclude-standard', '-z').decode().split('\0')[:-1])
    assert names == set(index['included']) | set(index['omitted']), 'Review source inventory differs from trusted Git inventory'
    for name, item in index['omitted'].items():
        data = p.read_required(root, name, 'omitted comparison source')
        assert len(data) == item['bytes'] and p.digest(data) == item['sha256'], 'Omitted source index mismatch: ' + name
    return 'complete-trusted-git-inventory'


def verify_source_provenance(root, metadata, review):
    """A trusted checkout can establish commit/tag/diff claims; extracted source cannot."""
    probe = subprocess.run(['git', 'rev-parse', '--show-toplevel'], cwd=root, capture_output=True, text=True)
    if probe.returncode or Path(probe.stdout.strip()).resolve() != root.resolve():
        return 'supplied-provenance-only; Git commit/tag/parent diff unavailable'
    head = p.git(root, 'rev-parse', 'HEAD').decode().strip()
    assert metadata['sourceCommit'] == head, 'Claimed source commit differs from trusted HEAD'
    p.git(root, 'merge-base', '--is-ancestor', p.BASELINE, head)
    committed = metadata['sourceState'] == 'committed'
    if committed:
        assert not p.git(root, 'status', '--porcelain').strip(), 'Committed source claim has a dirty checkout'
        assert metadata['tag'] == 'v' + p.VERSION, 'Committed release tag claim differs'
        assert p.git(root, 'rev-parse', 'refs/tags/v' + p.VERSION + '^{commit}').decode().strip() == head, 'Release tag differs from trusted HEAD'
    else:
        assert metadata['sourceState'] == 'working-tree-preview' and metadata['tag'] is None, 'Unexpected preview provenance'
    expected = p.git(root, 'diff', '--binary', p.BASELINE, *([head] if committed else []))
    assert review.read('CHANGES_FROM_0.9.9_BASELINE.patch') == expected, 'Parent diff differs from trusted source'
    expected_log = p.git(root, 'log', '--format=fuller', p.BASELINE + '..' + head)
    assert review.read('RECENT_COMMITS.txt') == expected_log, 'Recent commit history differs from trusted source'
    return 'trusted-git-commit-tag-and-parent-diff'


def verify_installation_bytes(name, installed, rebuilt, recovered=False):
    """Recovered builds can change ZIP timestamps, never installed paths or bytes."""
    if not recovered or not name.endswith('.zip'):
        assert installed == rebuilt, 'Packaged installation differs from trusted output: ' + name
        return
    with zipfile.ZipFile(io.BytesIO(installed)) as packaged, zipfile.ZipFile(io.BytesIO(rebuilt)) as generated:
        for archive in (packaged, generated):
            names = archive.namelist()
            assert len(names) == len(set(names)), 'Duplicate frontend archive entries: ' + name
            assert archive.testzip() is None, 'Frontend CRC failed: ' + name
            for entry in names:
                p.safe_path(entry)
        assert set(packaged.namelist()) == set(generated.namelist()), 'Rebuilt frontend inventory differs: ' + name
        for entry in packaged.namelist():
            assert packaged.read(entry) == generated.read(entry), 'Rebuilt frontend content differs: ' + name + '/' + entry


def canonical_backends(root):
    """Derive combined outputs from trusted canonical modules, not prior output files."""
    builder = ast.parse((root / 'scripts/build-release.py').read_text())
    functions = [node for node in builder.body if isinstance(node, ast.FunctionDef) and node.name == 'roster_backend_source']
    assert len(functions) == 1, 'Roster backend derivation is ambiguous'
    scope = {'re': re}
    exec(compile(ast.Module(body=functions, type_ignores=[]), 'canonical-roster-builder', 'exec'), scope)
    deploy = (root / 'backend/Code.gs').read_text() + '\n' + (root / 'backend/Seed.gs').read_text()
    roster = scope['roster_backend_source'](deploy, p.VERSION)
    venues = '// Generated by scripts/build-release.py from venues-backend sources.\n' + '\n\n'.join(
        (root / 'venues-backend' / name).read_text() for name in ['Domain.gs', 'Code.gs', 'Sources.gs', 'Register.gs', 'Notifications.gs'])
    return {'Deploy': deploy.replace('DEPLOY_SEED', 'GSIS_DEPLOY_EMBEDDED_SEED_04').encode(),
            'Roster': roster.replace('DEPLOY_SEED', 'GSIS_DEPLOY_EMBEDDED_SEED_04').encode(),
            'Contacts': (root / 'Contacts_Code.gs').read_bytes(),
            'Calendar': (root / 'calendar-backend/Code.gs').read_bytes(),
            'LORD': (root / 'lord-suite/Source/backend/Code.gs').read_bytes(),
            'Venues': venues.encode()}


def verify_runtime(suite, root):
    """Rebuild bundles from canonical modules and compare every installed file."""
    with tempfile.TemporaryDirectory(prefix='gsis-099-parity-') as td:
        temporary = Path(td)
        for app, folder in FRONTEND_FOLDERS.items():
            with zipfile.ZipFile(io.BytesIO(suite.read(f'Production/{app}_Frontend_v{p.VERSION}.zip'))) as frontend:
                expected = {str(path.relative_to(root / folder)) for path in (root / folder).rglob('*') if path.is_file()}
                assert set(frontend.namelist()) == expected, 'Frontend canonical inventory differs: ' + app
                html = frontend.read('index.html').decode()
                assert 'v' + p.VERSION in html, 'Frontend label differs: ' + app
                for name in expected:
                    source = root / folder / name
                    assert not source.is_symlink(), 'Frontend symlink refused'
                    canonical = source.read_bytes()
                    if name == '_worker.js' and app in {'Deploy', 'Roster'}:
                        output = temporary / (app + '-worker.js')
                        subprocess.run(['node', 'scripts/bundle-worker.cjs', folder + '/_worker.js', str(output)], cwd=root, check=True, capture_output=True)
                        canonical = output.read_bytes()
                    assert frontend.read(name) == canonical, 'Frontend canonical content differs: ' + app + '/' + name
                worker = frontend.read('_worker.js').decode()
                if app == 'Venues':
                    labels = re.findall(r"const\s+VERSION\s*=\s*['\"]([^'\"]+)['\"]", worker)
                elif app == 'Calendar':
                    labels = re.findall(r"const\s+WORKER_VERSION\s*=\s*['\"]([^'\"]+)['\"]", worker)
                elif app in {'LORD', 'OVERLORD', 'STARLORD'}:
                    labels = re.findall(r"['\"]X-LORD-Worker-Version['\"]\s*[:,]\s*['\"]([^'\"]+)['\"]", worker)
                else:
                    labels = re.findall(r"\bversion\s*:\s*['\"]([^'\"]+)['\"]", worker)
                assert labels and set(labels) == {p.VERSION}, 'Frontend Worker label differs: ' + app

        for app, canonical in canonical_backends(root).items():
            content = suite.read(f'Production/{app}_Backend_v{p.VERSION}.gs')
            assert content == canonical, 'Backend canonical derivation differs: ' + app
            text = content.decode()
            if app in {'Deploy', 'Roster'}:
                assert text.count("const GSIS_BACKEND_KIND='" + app.lower() + "';") == 1, 'Backend role differs: ' + app
                assert "const GSIS_DEPLOY_VERSION='" + p.VERSION + "';" in text
            elif app == 'Contacts':
                assert re.findall(r"const\s+GSIS_CONTACTS_VERSION\s*=\s*['\"]([^'\"]+)['\"]", text) == [p.VERSION]
            elif app == 'Calendar':
                assert re.findall(r"\bRELEASE_VERSION\s*:\s*['\"]([^'\"]+)['\"]", text) == [p.VERSION]
            elif app == 'LORD':
                assert re.findall(r"\bVERSION\s*:\s*['\"]([^'\"]+)['\"]", text) == [p.VERSION]
            else:
                assert re.findall(r"\bVENUES_VERSION\s*=\s*['\"]([^'\"]+)['\"]", text) == [p.VERSION]

        for name, entry in {'Roster_Notification_Worker_v0.9.9.txt': 'notification-worker/dashboard-entry.js',
                            'GSiS_Operations_Worker_v0.9.9.txt': 'operations-worker/index.js'}.items():
            output = temporary / name
            subprocess.run(['node', 'scripts/bundle-worker.cjs', entry, str(output)], cwd=root, check=True, capture_output=True)
            data = suite.read('Optional_Workers/' + name)
            assert data == output.read_bytes(), 'Optional Worker canonical derivation differs: ' + name
            labels = re.findall(rb"\bversion\s*:\s*['\"]([^'\"]+)['\"]", data)
            assert labels and set(labels) == {p.VERSION.encode()}, 'Optional Worker label differs: ' + name
        calendar = suite.read('Optional_Workers/GSiS_Calendar_Job_Worker_v0.9.9.txt')
        assert calendar == (root / 'calendar-job-worker/worker.mjs').read_bytes(), 'Calendar jobs Worker canonical derivation differs'
        assert p.VERSION.encode() in calendar, 'Calendar jobs Worker label differs'


def verify_support_files(suite, root, component_names):
    support = p.support_files(root)
    for name, data in support.items():
        assert suite.read(name) == data, 'Installation guidance/configuration differs from trusted source: ' + name
    expected_inventory = set(component_names) | set(support) | {'REVIEW_SOURCE.json', 'MANIFEST.json', 'Timetable_Preparation/' + p.PREPARATION_NAME}
    assert set(suite.namelist()) == expected_inventory, 'Installation/support inventory differs'


def verify(suite_path, review_path, source_root, preview=False):
    suite_meta = p.verify_archive(suite_path)
    review_meta = p.verify_archive(review_path)
    for field in ['release', 'sourceCommit', 'sourceState', 'baselineCommit', 'productionDeployed', 'productionAuthorities', 'authorityCutoverPerformed', 'componentVersions', 'tag', 'baseline']:
        assert suite_meta[field] == review_meta[field], 'Suite/review provenance differs: ' + field
    assert suite_meta['release'] == p.VERSION and suite_meta['baselineCommit'] == p.BASELINE
    assert suite_meta['productionAuthorities'] == p.PRODUCTION_AUTHORITIES
    expected_keys = {name.lower() + 'Frontend' for name in p.FRONTENDS} | {name.lower() + 'Backend' for name in p.BACKENDS} | {'notificationWorker', 'operationsWorker', 'calendarJobWorker'}
    assert suite_meta['componentVersions'] == dict.fromkeys(expected_keys, p.VERSION), 'Eighteen component versions must match'
    assert suite_meta['productionDeployed'] is False and suite_meta['authorityCutoverPerformed'] is False
    assert preview or suite_meta['sourceState'] == 'committed', 'Preview cannot verify as a committed release'
    assert suite_meta['frontends'] == list(p.FRONTENDS) and suite_meta['backends'] == list(p.BACKENDS)
    assert suite_meta['optionalWorkers'] == list(p.WORKERS)

    with zipfile.ZipFile(review_path) as review:
        index = json.loads(review.read('SOURCE_INDEX.json'))
        for alias, source in {'README_REVIEW.md': 'docs/v099/SOURCE_REVIEW.md', 'RECOVERY_HISTORY.md': 'docs/v099/RECOVERY_HISTORY.md'}.items():
            assert review.read(alias) == p.read_required(source_root, source), 'Review guide differs from trusted source: ' + alias
        completeness = verify_source_inventory(source_root, index, preview)
        provenance = verify_source_provenance(source_root, suite_meta, review)
        source_names = {n[7:] for n in review.namelist() if n.startswith('source/')}
        assert source_names == set(index['included']), 'Review source inventory differs'
        assert not set(index['included']) & set(index['omitted']), 'Source both included and omitted'
        for name, item in index['included'].items():
            data = review.read('source/' + name)
            assert len(data) == item['bytes'] and p.digest(data) == item['sha256'], 'Source index mismatch: ' + name
            assert p.source_exclusion_reason(name) is None, 'Private or obsolete content was included: ' + name
            assert data == p.read_required(source_root, name, 'trusted source'), 'Source differs from checkout: ' + name
        for name, item in index['omitted'].items():
            assert p.source_exclusion_reason(name) == item['reason'], 'Unexplained source omission: ' + name
        required = {'package.json', 'package-lock.json', 'scripts/build-release.py',
                    'scripts/package-099-suite.py', 'scripts/verify-099-suite.py',
                    'docs/v099/SOURCE_REVIEW.md', 'docs/v099/RECOVERY_HISTORY.md', 'scripts/check-099-recovery.py', 'docs/v098o/TIMETABLE_EXPORT_CONTRACT.md',
                    'docs/v098o/TIMETABLE_PREPARATION_SETUP.html'}
        assert required <= source_names, 'Review lacks build/contract dependencies'
        for folder in ['backend', 'shared', 'tests', 'public', 'calendar-backend', 'calendar-update',
                       'roster-update', 'contacts-update', 'layout-update', 'lord-suite',
                       'venues-backend', 'venues-viewport', 'notification-worker',
                       'operations-worker', 'calendar-job-worker', 'timetable-prep-worker']:
            assert any(n.startswith(folder + '/') for n in source_names), 'Review misses source subsystem: ' + folder
        assert not any(n.endswith('.bundle') for n in review.namelist()), 'Full Git history was not requested'
        assert {'CHANGES_FROM_0.9.9_BASELINE.patch', 'RECENT_COMMITS.txt', 'README_REVIEW.md', 'RECOVERY_HISTORY.md'} <= set(review.namelist())

    with zipfile.ZipFile(suite_path) as suite:
        expected_components = p.installation_files(source_root)
        component_names = {n for n in suite.namelist() if n.startswith('Production/') or n.startswith('Optional_Workers/') and n.endswith('.txt') and n.split('/')[-1] in p.WORKERS}
        assert component_names == set(expected_components), 'Full installation inventory differs'
        for name, data in expected_components.items():
            verify_installation_bytes(name, suite.read(name), data,
                                      recovered=completeness != 'complete-trusted-git-inventory')
        verify_runtime(suite, source_root)
        verify_support_files(suite, source_root, expected_components)
        reference = json.loads(suite.read('REVIEW_SOURCE.json'))
        assert reference['file'] == review_path.name and reference['sha256'] == p.digest(review_path.read_bytes()), 'Wrong companion review source'
        for name in ['START_HERE.html', 'START_HERE.md', 'Optional_Workers/Calendar_Jobs_schema.sql',
                     'Optional_Workers/Calendar_Jobs_wrangler.example.jsonc', 'Optional_Workers/Calendar_Jobs_Setup.md',
                     'Optional_Workers/WORKERS_README.md', 'Docs/LORD_appsscript.services.fragment.json']:
            assert name in suite.namelist(), 'Missing setup dependency: ' + name
        separate = suite_meta['separatePackages']
        assert len(separate) == 1 and separate[0]['name'] == p.PREPARATION_NAME
        assert separate[0]['productionInstallation'] is False
        data = suite.read('Timetable_Preparation/' + separate[0]['name'])
        assert p.digest(data) == separate[0]['sha256'] and len(data) == separate[0]['bytes']
        p.verify_preparation_bytes(data)
        with tempfile.TemporaryDirectory(prefix='gsis-099-preparation-') as td:
            preparation = Path(td) / p.PREPARATION_NAME
            preparation.write_bytes(data)
            subprocess.run(['python3', 'scripts/verify-timetable-preparation.py', str(preparation)], cwd=source_root, check=True, capture_output=True)
    return {'verified': True, 'sourceCommit': suite_meta['sourceCommit'], 'productionComponents': 18,
            'sourceFiles': len(index['included']), 'omittedHistoricalOrPrivateFiles': len(index['omitted']),
            'sourceCompleteness': completeness, 'sourceProvenance': provenance,
            'separatePreparationRelease': p.VERSION, 'productionDeployed': False}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('suite', type=Path)
    parser.add_argument('review', type=Path)
    parser.add_argument('--source-root', type=Path, default=ROOT)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    print(json.dumps(verify(args.suite.resolve(), args.review.resolve(), args.source_root.resolve(), args.preview), indent=2))
