"""Verify the shipped components against the current source and archive hashes."""
from pathlib import Path
import hashlib
import io
import json
import re
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
settings = json.loads((root / 'package.json').read_text())
version = settings['gsisRelease']
clean = settings.get('gsisPatchClean', False)
directory = root.parent / 'deliverables'
package = directory / f'GSiS_v{version}_Updated_Deployments.zip'
backend_name = f'Deploy_Backend_v{version}.gs'
worker_name = f'Roster_Notification_Worker_v{version}.txt'
roster_backend_name = f'Roster_Backend_v{version}.gs'
lord_backend_name = f'LORD_Backend_v{version}.gs'
frontends = {'rosterFrontend': ('Roster', 'roster-update/public'), 'contactsFrontend': ('Contacts', 'contacts-update/public'), 'deployFrontend': ('Deploy', 'public'),
             'calendarFrontend': ('Calendar', 'calendar-update/public'), 'layoutFrontend': ('Layout', 'layout-update/public'), 'venuesFrontend': ('Venues', 'venues-viewport/public'),
             **{app+'Frontend': (app.upper(), 'lord-suite/Source/'+app) for app in ['lord', 'overlord', 'starlord']}}
components = {'deployBackend': backend_name, 'rosterBackend': roster_backend_name, 'lordBackend': lord_backend_name, 'notificationWorker': worker_name,
              'contactsBackend': f'Contacts_Backend_v{version}.gs', 'calendarBackend': f'Calendar_Backend_v{version}.gs', 'venuesBackend': f'Venues_Backend_v{version}.gs',
              'operationsWorker': f'GSiS_Operations_Worker_v{version}.txt',
              'calendarJobWorker': f'GSiS_Calendar_Job_Worker_v{version}.txt',
              **{key: f'{name}_Frontend_v{version}.zip' for key, (name, _) in frontends.items()}}
included = settings.get('gsisPatchComponents', ['deployBackend', 'notificationWorker', 'rosterFrontend'])
assert len(included) == len(set(included)) and set(included) <= set(components)
expected_components = [components[key] for key in included]
sources = {
    backend_name: root / backend_name,
    roster_backend_name: root / roster_backend_name,
    lord_backend_name: root / 'lord-suite/Source/backend/Code.gs',
    worker_name: root / 'notification-worker/dashboard-worker.txt',
    components['contactsBackend']: root / components['contactsBackend'],
    components['calendarBackend']: root / components['calendarBackend'],
    components['venuesBackend']: root / components['venuesBackend'],
    components['operationsWorker']: root / 'operations-worker/dashboard-worker.txt',
    components['calendarJobWorker']: root / 'calendar-job-worker/dashboard-worker.txt',
    'INSTALL.txt': root / f'HOTFIX_v{version}.md',
    'CHANGELOG.md': root / f'CHANGELOG_v{version}.md',
    'VALIDATION.md': root / f'VALIDATION_v{version}.md',
    'RELEASE_SUMMARY.json': root / f'RELEASE_SUMMARY_v{version}.json',
    'SUITE_MERGE.md': root / f'SUITE_MERGE_v{version}.md',
}
sources = {name: path for name, path in sources.items() if name in expected_components or not clean and name not in components.values()}
if not clean and settings.get('gsisPatchSetupGuide'):
    for suffix in ('md', 'html'):
        sources[f'SETUP.{suffix}'] = root / f'SETUP_v{version}.{suffix}'
for name, source in settings.get('gsisPatchDocuments', {}).items():
    assert Path(name).name == name and name not in sources, 'Invalid extra patch document'
    path = (root / source).resolve()
    assert path.is_relative_to(root.resolve()) and path.is_file(), 'Patch document must be a repository file'
    sources[name] = path
if 'lordBackend' in included:
    sources['PHOTO_UPLOAD_RELIABILITY.md'] = root / 'lord-suite/docs/PHOTO_UPLOAD_RELIABILITY.md'
    sources['appsscript.services.fragment.json'] = root / 'lord-suite/Source/backend/appsscript.services.fragment.json'
if 'calendarJobWorker' in included:
    sources.update({
        'Calendar_Jobs_schema.sql': root / 'calendar-job-worker/schema.sql',
        'Calendar_Jobs_wrangler.example.jsonc': root / 'calendar-job-worker/wrangler.example.jsonc',
        'Calendar_Jobs_README.md': root / 'calendar-job-worker/README.md',
    })
frontend_names = {components[key] for key in included if key in frontends}
source_patch = None
if not clean and settings.get('gsisPatchSourceBase'):
    source_patch = subprocess.check_output(
        ['git', 'diff', '--binary', settings['gsisPatchSourceBase'], '--', '.'], cwd=root)
with zipfile.ZipFile(package) as archive:
    assert len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate production archive entries'
    assert archive.testzip() is None
    manifest = json.loads(archive.comment)['manifest'] if clean else json.loads(archive.read('PATCH.json'))
    separate_packages = manifest.get('separatePackages', [])
    configured_separate = settings.get('gsisSeparatePackages', [])
    assert len(separate_packages) == len(configured_separate), 'Separate preparation inventory must match source'
    for item, configured in zip(separate_packages, configured_separate):
        name = configured['name']
        assert Path(name).name == name and name.endswith('.zip'), 'Separate package must be a sibling ZIP'
        assert configured['productionInstallation'] is False
        assert item == {**configured, 'sha256': hashlib.sha256((directory / name).read_bytes()).hexdigest()}, name
        assert name not in archive.namelist(), 'Preparation must not be nested in the production deployment archive'
        with zipfile.ZipFile(directory / name) as preparation:
            assert len(preparation.namelist()) == len(set(preparation.namelist())), 'Duplicate separate archive entries: ' + name
            assert preparation.testzip() is None, name
        if name.endswith('_Timetable_Preparation.zip'):
            subprocess.run([sys.executable, 'scripts/verify-timetable-preparation.py', str(directory / name)], cwd=root, check=True)
        if name.endswith('_Rehearsal.zip'):
            subprocess.run([sys.executable, 'scripts/verify-rehearsal-package.py', str(directory / name)], cwd=root, check=True)
    bundle_name = manifest.get('repositoryBundle')
    assert set(archive.namelist()) == {*sources, *frontend_names, *([] if clean else ['PATCH.json', 'SHA256SUMS.txt']), *(['SOURCE.patch'] if source_patch is not None else []), *([bundle_name] if bundle_name else [])}
    if bundle_name:
        assert settings.get('gsisPatchRepositoryBundle') and bundle_name == f'GSiS_v{version}_Incremental.bundle'
        assert archive.read(bundle_name) == (directory / bundle_name).read_bytes()
        assert manifest['sourceState'] == 'committed'
        assert subprocess.check_output(['git', 'rev-parse', f'v{version}^{{}}'], cwd=root, text=True).strip() == manifest['sourceCommit']
    elif not clean and settings.get('gsisPatchRepositoryBundle'):
        assert manifest['sourceState'] == 'working-tree', 'Committed patch must include its repository bundle'

    if source_patch is not None:
        assert archive.read('SOURCE.patch') == source_patch
    for name, path in sources.items():
        assert archive.read(name) == path.read_bytes(), name
    manifest = json.loads(archive.comment)['manifest'] if clean else json.loads(archive.read('PATCH.json'))
    assert manifest['version'] == version
    assert manifest['baseline'] == settings['gsisPatchBaseline']
    optional = settings.get('gsisOptionalProductionComponents', [])
    assert len(optional) == len(set(optional)) and set(optional) <= set(included)
    assert manifest.get('optionalComponents', []) == [components[key] for key in optional]
    assert manifest['components'] == expected_components
    assert manifest['componentVersions'] == settings['gsisComponentVersions']
    assert manifest['sourceCommit'] == subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    source_state = 'working-tree' if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip() else 'committed'
    assert manifest['sourceState'] == source_state, 'Archive source state must match the current source'
    assert manifest['liveDeploymentPerformed'] is False, 'Packaging must not claim a live deployment'
    checksums = json.loads(archive.comment)['sha256'] if clean else dict(line.split('  ', 1)[::-1] for line in archive.read('SHA256SUMS.txt').decode().splitlines())
    assert set(checksums) == set(archive.namelist()) - {'SHA256SUMS.txt'}
    for name, digest in checksums.items():
        assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
    for key in included:
        if key not in frontends:
            continue
        product, folder = frontends[key]
        with zipfile.ZipFile(io.BytesIO(archive.read(components[key]))) as frontend:
            assert len(frontend.namelist()) == len(set(frontend.namelist())), 'Duplicate frontend archive entries: ' + components[key]
            assert frontend.testzip() is None
            public = root / folder
            paths = {str(p.relative_to(public)): p for p in public.rglob('*') if p.is_file()}
            assert set(frontend.namelist()) == set(paths)
            for name, path in paths.items():
                assert path.name not in {'.env', '.dev.vars'}, name
                if name == '_worker.js' and key in {'rosterFrontend', 'deployFrontend'}:
                    with tempfile.TemporaryDirectory(prefix='gsis-verify-patch-worker-') as bundled:
                        worker = Path(bundled) / '_worker.js'
                        subprocess.run(['node', str(root / 'scripts/bundle-worker.cjs'),
                                        str(path.relative_to(root)), str(worker)], cwd=root, check=True)
                        assert frontend.read(name) == worker.read_bytes(), name + ' bundled source parity'
                else:
                    assert frontend.read(name) == path.read_bytes(), name
            assert f'v{version}' in frontend.read('index.html').decode()
            if key in {'lordFrontend', 'overlordFrontend', 'starlordFrontend'}:
                assert '_worker.js' in frontend.namelist(), 'LORD applications require their Pages worker'
            elif key in {'deployFrontend', 'rosterFrontend', 'contactsFrontend', 'layoutFrontend'}:
                assert json.loads(frontend.read('_routes.json'))['include'] == (['/api/*', '/campus-base.svg'] if key == 'deployFrontend' else ['/api/*'])
            if key == 'rosterFrontend':
                for name in ['external.html', 'external.js', 'external.css', 'privacy.html']:
                    assert name in frontend.namelist()
            if key == 'contactsFrontend':
                assert 'contact-vcard.js' in frontend.namelist()
                assert 'google-contacts.js' not in frontend.namelist()
            assets = json.loads((root / 'vendor-assets-manifest.json').read_text())['assets']
            for asset in assets:
                if asset['frontend'] == product:
                    assert hashlib.sha256(frontend.read(asset['path'])).hexdigest() == asset['sha256']
    if 'deployBackend' in included:
        assert archive.read(backend_name) == ((root / 'backend/Code.gs').read_text() + '\n' + (root / 'backend/Seed.gs').read_text()).replace('DEPLOY_SEED', 'GSIS_DEPLOY_EMBEDDED_SEED_04').encode()
    if 'rosterBackend' in included:
        expected = ((root / 'backend/Code.gs').read_text() + '\n' + (root / 'backend/Seed.gs').read_text())
        # Match build-release.py's Roster boundary: Layout and local aSc remain
        # in Deploy; shared live venue identities outside these blocks remain.
        for marker in ['GSIS_LAYOUT_DATA', 'GSIS_LAYOUT_REPOSITORY', 'GSIS_LAYOUT_DIAGNOSTICS', 'GSIS_LAYOUT_SEED', 'GSIS_ASC_EXPORT']:
            expected, count = re.subn(r'/\* ' + marker + r'_BEGIN \*/[\s\S]*?/\* ' + marker + r'_END \*/', '', expected)
            assert count == 1, 'Expected one audited Layout block: ' + marker
        assert expected.count("const GSIS_BACKEND_KIND='deploy';") == 1
        expected = expected.replace("const GSIS_BACKEND_KIND='deploy';", "const GSIS_BACKEND_KIND='roster';", 1).replace('DEPLOY_SEED', 'GSIS_DEPLOY_EMBEDDED_SEED_04')
        roster_version = settings['gsisComponentVersions']['rosterBackend']
        expected, count = re.subn(r"const GSIS_DEPLOY_VERSION='[^']+';", lambda _: f"const GSIS_DEPLOY_VERSION='{roster_version}';", expected)
        assert count == 1
        assert archive.read(roster_backend_name) == expected.encode()
    if 'notificationWorker' in included:
        assert archive.read(worker_name) == (root / 'notification-worker/dashboard-worker.mjs').read_bytes()
    if 'operationsWorker' in included:
        assert archive.read(components['operationsWorker']) == (root / 'operations-worker/dashboard-worker.mjs').read_bytes()
    if 'calendarJobWorker' in included:
        assert archive.read(components['calendarJobWorker']) == (root / 'calendar-job-worker/dashboard-worker.mjs').read_bytes()
        assert archive.read(components['calendarJobWorker']) == (root / 'calendar-job-worker/worker.mjs').read_bytes(), 'Canonical Calendar job Worker parity'
    for key, source in [('contactsBackend', 'Contacts_Code.gs'), ('calendarBackend', 'calendar-backend/Code.gs')]:
        if key in included:
            assert archive.read(components[key]) == (root / source).read_bytes(), 'Canonical backend parity: ' + key
    if 'venuesBackend' in included:
        expected = '// Generated by scripts/build-release.py from venues-backend sources.\n' + '\n\n'.join(
            (root / 'venues-backend' / name).read_text() for name in ['Domain.gs', 'Code.gs', 'Sources.gs', 'Register.gs', 'Notifications.gs'])
        assert archive.read(components['venuesBackend']) == expected.encode(), 'Canonical backend parity: venuesBackend'
# This smoke test exercises the bundled Roster/Deploy entry points only. Other
# component patches retain their own archive, source and asset checks above.
if {'rosterFrontend', 'deployFrontend'} & set(included):
    subprocess.run(['node', str(root / 'tests/pages096-packaged-worker.cjs'), str(package)], cwd=root, check=True)
print('PASS component patch: deployment scope, bundled source parity, standalone Worker smoke checks, assets and archive hashes')
