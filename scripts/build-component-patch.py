"""Build only the deployment components declared by the current patch."""
from pathlib import Path
import hashlib
import io
import json
import os
import subprocess
import sys
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
settings = json.loads((root / 'package.json').read_text())
assert settings['gsisPackageKind'] == 'component-patch'
version = settings['gsisRelease']
clean = settings.get('gsisPatchClean', False)
if '--no-sync' not in sys.argv:
    subprocess.run([sys.executable, 'scripts/build-release.py', '--sync-only'], cwd=root, check=True)
output = root.parent / 'deliverables'
output.mkdir(exist_ok=True)
separate_packages = []
for item in settings.get('gsisSeparatePackages', []):
    name = item['name']
    assert Path(name).name == name and name.endswith('.zip'), 'Separate package must be a sibling ZIP'
    assert item['productionInstallation'] is False, 'Preparation must not become a production component'
    path = output / name
    assert path.is_file(), f'Build the separate preparation package first: {name}'
    with zipfile.ZipFile(path) as archive:
        assert len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate separate archive entries: ' + name
        assert archive.testzip() is None, name
    if name.endswith('_Timetable_Preparation.zip'):
        subprocess.run([sys.executable, 'scripts/verify-timetable-preparation.py', str(path)], cwd=root, check=True)
    if name.endswith('_Rehearsal.zip'):
        # Reject a forged sibling before replacing any previous valid output.
        subprocess.run([sys.executable, 'scripts/verify-rehearsal-package.py', str(path)], cwd=root, check=True)
    separate_packages.append({**item, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
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
manifest = {
    'version': version,
    'baseline': settings['gsisPatchBaseline'],
    'components': [components[key] for key in included],
    'componentVersions': settings['gsisComponentVersions'],
    'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'sourceState': 'working-tree' if subprocess.check_output(['git', 'status', '--porcelain'], cwd=root, text=True).strip() else 'committed',
    'liveDeploymentPerformed': False,
}
optional = settings.get('gsisOptionalProductionComponents', [])
assert len(optional) == len(set(optional)) and set(optional) <= set(included), 'Optional production components must be included'
if optional:
    manifest['optionalComponents'] = [components[key] for key in optional]
if separate_packages:
    # The production inventory references preparation without deploying it.
    # Keep the preparation ZIP beside this archive, never inside it.
    manifest['separatePackages'] = separate_packages
files = {} if clean else {
    'INSTALL.txt': (root / f'HOTFIX_v{version}.md').read_bytes(),
    'CHANGELOG.md': (root / f'CHANGELOG_v{version}.md').read_bytes(),
    'VALIDATION.md': (root / f'VALIDATION_v{version}.md').read_bytes(),
    'RELEASE_SUMMARY.json': (root / f'RELEASE_SUMMARY_v{version}.json').read_bytes(),
    'SUITE_MERGE.md': (root / f'SUITE_MERGE_v{version}.md').read_bytes(),
    'PATCH.json': (json.dumps(manifest, indent=2) + '\n').encode(),
}
if not clean and settings.get('gsisPatchSetupGuide'):
    for suffix in ('md', 'html'):
        files[f'SETUP.{suffix}'] = (root / f'SETUP_v{version}.{suffix}').read_bytes()
for name, source in settings.get('gsisPatchDocuments', {}).items():
    assert Path(name).name == name and name not in files, 'Invalid extra patch document'
    path = (root / source).resolve()
    assert path.is_relative_to(root.resolve()) and path.is_file(), 'Patch document must be a repository file'
    files[name] = path.read_bytes()
if not clean and settings.get('gsisPatchSourceBase'):
    files['SOURCE.patch'] = subprocess.check_output(
        ['git', 'diff', '--binary', settings['gsisPatchSourceBase'], '--', '.'], cwd=root)
for key in included:
    if key not in frontends:
        continue
    public = root / frontends[key][1]
    frontend_bytes = io.BytesIO()
    with zipfile.ZipFile(frontend_bytes, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(public.rglob('*')):
            if path.is_file():
                assert path.name not in {'.env', '.dev.vars'}, 'Do not package private environment files'
                if path.name == '_worker.js' and key in {'rosterFrontend', 'deployFrontend'}:
                    # Dashboard direct upload needs the same self-contained entry
                    # point as a full release, not uncompiled sibling imports.
                    with tempfile.TemporaryDirectory(prefix='gsis-patch-worker-') as bundled:
                        worker = Path(bundled) / '_worker.js'
                        subprocess.run(['node', str(root / 'scripts/bundle-worker.cjs'),
                                        str(path.relative_to(root)), str(worker)], cwd=root, check=True)
                        archive.writestr('_worker.js', worker.read_bytes())
                else:
                    archive.write(path, path.relative_to(public))
    files[components[key]] = frontend_bytes.getvalue()
if 'deployBackend' in included:
    files[backend_name] = (root / backend_name).read_bytes()
if 'rosterBackend' in included:
    files[roster_backend_name] = (root / roster_backend_name).read_bytes()
for key in ('contactsBackend', 'calendarBackend', 'venuesBackend'):
    if key in included:
        files[components[key]] = (root / components[key]).read_bytes()
if 'lordBackend' in included:
    files[lord_backend_name] = (root / 'lord-suite/Source/backend/Code.gs').read_bytes()
    files['PHOTO_UPLOAD_RELIABILITY.md'] = (root / 'lord-suite/docs/PHOTO_UPLOAD_RELIABILITY.md').read_bytes()
    files['appsscript.services.fragment.json'] = (root / 'lord-suite/Source/backend/appsscript.services.fragment.json').read_bytes()
if 'notificationWorker' in included:
    files[worker_name] = (root / 'notification-worker/dashboard-worker.txt').read_bytes()
if 'operationsWorker' in included:
    files[components['operationsWorker']] = (root / 'operations-worker/dashboard-worker.txt').read_bytes()
if 'calendarJobWorker' in included:
    files[components['calendarJobWorker']] = (root / 'calendar-job-worker/dashboard-worker.txt').read_bytes()
    for name, source in {
        'Calendar_Jobs_schema.sql': 'calendar-job-worker/schema.sql',
        'Calendar_Jobs_wrangler.example.jsonc': 'calendar-job-worker/wrangler.example.jsonc',
        'Calendar_Jobs_README.md': 'calendar-job-worker/README.md',
    }.items():
        files[name] = (root / source).read_bytes()
files = {name: data for name, data in files.items() if name not in components.values() or name in manifest['components']}
if not clean and settings.get('gsisPatchRepositoryBundle') and manifest['sourceState'] == 'committed':
    tag = f'refs/tags/v{version}'
    tagged = subprocess.check_output(['git', 'rev-parse', tag + '^{}'], cwd=root, text=True).strip()
    assert tagged == manifest['sourceCommit'], 'Release tag must match the committed source'
    bundle_name = f'GSiS_v{version}_Incremental.bundle'
    bundle = output / bundle_name
    subprocess.run(['git', 'bundle', 'create', str(bundle), 'HEAD', tag,
                    '^' + settings['gsisPatchSourceBase']], cwd=root, check=True)
    subprocess.run(['git', 'bundle', 'verify', str(bundle)], cwd=root, check=True)
    files[bundle_name] = bundle.read_bytes()
    manifest['repositoryBundle'] = bundle_name
    files['PATCH.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
if not clean: files['SHA256SUMS.txt'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n' for name, data in sorted(files.items())).encode()
package = output / f'GSiS_v{version}_Updated_Deployments.zip'
descriptor, temporary = tempfile.mkstemp(prefix='gsis-component-patch-', suffix='.zip', dir=output)
os.close(descriptor)
try:
    with zipfile.ZipFile(temporary, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
        if clean:
            archive.comment = json.dumps({'manifest': manifest, 'sha256': {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())}}, separators=(',', ':')).encode()
    with open(temporary, 'rb') as handle:
        os.fsync(handle.fileno())
    os.replace(temporary, package)
finally:
    Path(temporary).unlink(missing_ok=True)
subprocess.run([sys.executable, 'scripts/verify-component-patch.py'], cwd=root, check=True)
print(json.dumps({'package': str(package), 'bytes': package.stat().st_size, 'components': manifest['components']}))
