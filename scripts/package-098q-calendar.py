"""Build/package the Calendar-only Q pair and a lean current-source review archive.

No deployment, credentials, live data or migration is performed. --build-only
regenerates only Calendar's deployable pair; it works in a recovered non-Git tree.
Final packaging requires clean committed source tagged v0.9.8q.
"""
from pathlib import Path
import argparse
import importlib.util
import io
import json
import re
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package098p', ROOT / 'scripts/package-098p-suite.py')
p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
VERSION = '0.9.8q'
BASELINE = 'a8ce50ef47afe5a57270d440c2cd18b34121c59a'
COMPONENTS = ['calendarFrontend', 'calendarBackend']
ARTIFACTS = [f'Calendar_Frontend_v{VERSION}.zip', f'Calendar_Backend_v{VERSION}.gs']
UNCHANGED_RUNTIME_PATHS = ['backend', 'shared', 'data', 'migrations', 'Contacts_Code.gs', 'public',
                           'roster-update', 'contacts-update', 'layout-update', 'lord-suite',
                           'venues-backend', 'venues-viewport', 'notification-worker',
                           'operations-worker', 'calendar-job-worker', 'timetable-prep-worker']
TEST_ONLY_EXCEPTIONS = {'lord-suite/tests/run_gsis_contract_checks.cjs', 'lord-suite/tests/fixtures/gsis-catalogue-synthetic.json'}
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
EXPECTED_COMPONENTS = {name.lower() + 'Frontend' for name in p.FRONTENDS} | {name.lower() + 'Backend' for name in p.BACKENDS} | {'notificationWorker', 'operationsWorker', 'calendarJobWorker'}


def validate_settings(settings):
    assert settings['version'] == settings['gsisRelease'] == VERSION, 'Q release metadata required'
    assert settings['gsisPackageKind'] == 'component-patch' and settings['gsisPatchComponents'] == COMPONENTS, 'Only the Calendar pair belongs in Q'
    assert settings['gsisPatchBaseline'] == settings['gsisBaseline'] == '0.9.8p'
    assert settings['gsisPatchSourceBase'] == settings['gsisSourceBase'] == BASELINE
    assert settings['gsisComponentVersions'] == {key: VERSION if key in COMPONENTS else '0.9.8p' for key in EXPECTED_COMPONENTS}, 'Unexpected component versions'
    assert settings['gsisSeparatePackages'][0]['name'] == 'GSiS_v0.9.8o_Timetable_Preparation.zip'
    assert settings['gsisSeparatePackages'][0]['productionInstallation'] is False


def source_exclusion_reason(name):
    p.safe_path(name)
    path = Path(name)
    if name in EXCLUDED_LIVE_EVIDENCE: return 'Historical live observation omitted; current contract test uses a synthetic catalogue fixture'
    if len(path.parts) == 1 and re.fullmatch(r'[A-Za-z]+_Backend_v\d[^/]+\.gs', name):
        if name.endswith(('_v0.9.8p.gs', '_v0.9.8q.gs')): return None
        return 'Superseded generated backend; canonical modules, P parent and Q output retained'
    if name.startswith('docs/') and VERSION in name and path.suffix in {'.html', '.drawio', '.svg', '.pdf'}: return None
    return p.source_exclusion_reason(name)


def source_files(root, names):
    assert len(names) == len(set(names)), 'Duplicate source path'
    files, included, omitted = {}, {}, {}
    for name in sorted(names):
        data = p.read_required(root, name, 'source file')
        item = {'sha256': p.digest(data), 'bytes': len(data)}
        reason = source_exclusion_reason(name)
        if reason: omitted[name] = {**item, 'reason': reason}
        else: included[name] = item; files['source/' + name] = data
    return files, {'schema': 1, 'included': included, 'omitted': omitted,
                   'includedBytes': sum(item['bytes'] for item in included.values()),
                   'omittedBytes': sum(item['bytes'] for item in omitted.values()),
                   'policy': 'Current source with P-to-Q diff, not full Git history; each original source path accounted for.'}


def frontend_bytes(root):
    folder = root / 'calendar-update/public'
    result = io.BytesIO()
    with zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(folder.rglob('*')):
            assert not path.is_symlink(), 'Frontend symlink refused'
            if path.is_file():
                name = str(path.relative_to(folder)); p.safe_path(name)
                assert source_exclusion_reason(name) is None, 'Private/generated frontend file refused: ' + name
                info = zipfile.ZipInfo(name, p.STAMP); info.compress_type = zipfile.ZIP_DEFLATED; info.external_attr = 0o100644 << 16
                archive.writestr(info, path.read_bytes())
    return result.getvalue()


def verify_frontend(data, root):
    folder = root / 'calendar-update/public'
    expected = {str(path.relative_to(folder)) for path in folder.rglob('*') if path.is_file()}
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        names = archive.namelist()
        assert len(names) == len(set(names)), 'Duplicate frontend entries'
        assert archive.testzip() is None, 'Frontend CRC failed'
        assert set(names) == expected, 'Frontend canonical inventory differs'
        assert {'index.html', 'app.js', '_worker.js'} <= expected, 'Incomplete Calendar frontend'
        for name in names:
            p.safe_path(name)
            assert source_exclusion_reason(name) is None, 'Private frontend file refused'
            assert archive.read(name) == p.read_required(folder, name, 'canonical frontend'), 'Frontend canonical content differs: ' + name
        assert 'v' + VERSION in archive.read('index.html').decode(), 'Calendar visible label differs'
        for name, marker in [('app.js', 'FRONTEND_VERSION'), ('_worker.js', 'WORKER_VERSION')]:
            assert re.findall(r'const\s+' + marker + r"\s*=\s*['\"]([^'\"]+)['\"]", archive.read(name).decode()) == [VERSION], 'Calendar runtime label differs: ' + name


def installation_files(root):
    frontend = p.read_required(root, ARTIFACTS[0])
    verify_frontend(frontend, root)
    backend = p.read_required(root, ARTIFACTS[1])
    assert backend == p.read_required(root, 'calendar-backend/Code.gs'), 'Backend canonical derivation differs'
    assert re.findall(rb"\bRELEASE_VERSION\s*:\s*['\"]([^'\"]+)['\"]", backend) == [VERSION.encode()], 'Calendar backend label differs'
    return dict(zip(ARTIFACTS, [frontend, backend]))


def build(root):
    validate_settings(json.loads(p.read_required(root, 'package.json')))
    subprocess.run(['python3', 'scripts/build-release.py', '--sync-only'], cwd=root, check=True)
    data = frontend_bytes(root); verify_frontend(data, root)
    (root / ARTIFACTS[0]).write_bytes(data)
    installation_files(root)
    return {'built': ARTIFACTS, 'otherComponentsRebuilt': False, 'liveDeploymentPerformed': False}


def review_evidence(root, directory):
    if directory is None: return {}
    directory = directory.resolve()
    assert directory.is_dir() and directory.is_relative_to(root.resolve() / 'verification'), 'Evidence must be in source verification directory'
    result = {}
    for path in sorted(directory.rglob('*')):
        name = str(path.relative_to(directory))
        if name.split('/')[0] == 'package-candidate': continue  # Regenerable test ZIPs, not validation evidence.
        if path.is_dir(): continue
        assert not path.is_symlink(), 'Evidence symlink refused'
        p.safe_path(name)
        assert source_exclusion_reason(name) is None, 'Unsafe evidence file: ' + name
        assert path.suffix in {'.json', '.md', '.txt', '.log', '.patch', '.cjs', '.mjs', '.py'}, 'Unsupported evidence type: ' + name
        assert path.stat().st_size <= 20 * 1024 * 1024, 'Evidence needs summarising: ' + name
        result['Validation/' + name] = path.read_bytes()
    return result


def validate_unchanged_runtime(changed, additions):
    unexpected = (set(changed) | set(additions)) - TEST_ONLY_EXCEPTIONS
    assert not unexpected, 'Q must not change another component runtime: ' + ', '.join(sorted(unexpected))


def package(root, output, preview=False, evidence_dir=None):
    settings = json.loads(p.read_required(root, 'package.json')); validate_settings(settings)
    commit = p.git(root, 'rev-parse', 'HEAD').decode().strip()
    p.git(root, 'merge-base', '--is-ancestor', BASELINE, commit)
    tracked = p.git(root, 'ls-files', '-z').decode().split('\0')[:-1]
    untracked = p.git(root, 'ls-files', '--others', '--exclude-standard', '-z').decode().split('\0')[:-1]
    dirty = bool(p.git(root, 'status', '--porcelain').strip())
    changed = p.git(root, 'diff', '--name-only', BASELINE, '--', *UNCHANGED_RUNTIME_PATHS).decode().splitlines()
    additions = [name for name in untracked if any(name == path or name.startswith(path + '/') for path in UNCHANGED_RUNTIME_PATHS)]
    validate_unchanged_runtime(changed, additions)
    if not preview:
        assert not dirty, 'Commit every source change before final packaging'
        assert p.git(root, 'rev-parse', 'refs/tags/v' + VERSION + '^{commit}').decode().strip() == commit, 'Q tag must identify HEAD'
    names = sorted(set(tracked + (untracked if preview else [])))
    review, index = source_files(root, names)
    metadata = {'schema': 1, 'release': VERSION, 'baseline': '0.9.8p', 'baselineCommit': BASELINE,
                'sourceCommit': commit, 'sourceState': 'working-tree-preview' if preview or dirty else 'committed',
                'tag': None if preview or dirty else 'v' + VERSION,
                'productionDeployed': False, 'authorityCutoverPerformed': False,
                'productionAuthorities': p.PRODUCTION_AUTHORITIES,
                'componentVersions': settings['gsisComponentVersions'],
                'components': COMPONENTS, 'separatePreparationRelease': '0.9.8o'}
    review['SOURCE_INDEX.json'] = p.json_bytes(index)
    review['CHANGES_FROM_0.9.8p.patch'] = p.git(root, 'diff', '--binary', BASELINE, *([] if preview else [commit]))
    review['RECENT_COMMITS.txt'] = p.git(root, 'log', '--format=fuller', BASELINE + '..' + commit)
    review['README_REVIEW.md'] = p.read_required(root, 'docs/v098q/SOURCE_REVIEW.md')
    review.update(review_evidence(root, evidence_dir))
    review_path = output / f'GSiS_v{VERSION}_Calendar_Review_Source.zip'
    p.write_archive(review_path, review, {**metadata, 'kind': 'review-source', 'sourceIncludedCount': len(index['included']), 'sourceOmittedCount': len(index['omitted'])})
    install = installation_files(root)
    for suffix in ('html', 'md'): install['SETUP.' + suffix] = p.read_required(root, 'SETUP_v' + VERSION + '.' + suffix)
    install['PATCH.json'] = p.json_bytes(metadata)
    for path in sorted((root / 'docs/v098q').rglob('*')):
        if path.is_file():
            assert not path.is_symlink(), 'Documentation symlink refused'
            install['Docs/' + str(path.relative_to(root / 'docs/v098q'))] = path.read_bytes()
    for name in ['CHANGELOG', 'VALIDATION']:
        install['Docs/' + name + '.md'] = p.read_required(root, name + '_v' + VERSION + '.md')
    install['RELEASE_SUMMARY.json'] = p.read_required(root, 'RELEASE_SUMMARY.json')
    install['REVIEW_SOURCE.json'] = p.json_bytes({'file': review_path.name, 'sha256': p.digest(review_path.read_bytes()), 'description': 'Current source, P-to-Q changes, tests and selected evidence; separate from the two deployment files.'})
    patch_path = output / f'GSiS_v{VERSION}_Calendar_Patch.zip'
    p.write_archive(patch_path, install, {**metadata, 'kind': 'component-patch', 'installationFiles': ARTIFACTS})
    return {'patch': str(patch_path), 'review': str(review_path), 'sourceCommit': commit,
            'sourceFiles': len(index['included']), 'omittedFiles': len(index['omitted']),
            'omittedBytes': index['omittedBytes'], 'productionDeployed': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT.parent / 'deliverables')
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--evidence-dir', type=Path)
    parser.add_argument('--build-only', action='store_true')
    args = parser.parse_args()
    print(json.dumps(build(ROOT) if args.build_only else package(ROOT, args.output.resolve(), args.preview, args.evidence_dir), indent=2))
