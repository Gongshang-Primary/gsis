"""Verify the clean full release: deployment files and the explicit documentation/Worker inventory."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import zipfile
import runpy
import tempfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--version')
args = parser.parse_args()
settings = json.loads((root / 'package.json').read_text())
version = args.version or settings['gsisRelease']
installation_manifest = runpy.run_path(str(root / 'scripts/installation-manifest.py'))['installation_manifest']
spec, sources = installation_manifest(root, version)
apps = spec['frontends']
workers = [name.format(version=version) for name in spec['workers']]
assert re.fullmatch(r'\d+\.\d+(?:\.\d+)?', version), 'Invalid suite release label'
numeric_parts = [str(int(part)) for part in version.split('.')]
semver = '.'.join(numeric_parts + ['0'] * (3 - len(numeric_parts)))
assert settings['version'] == semver, 'npm version differs from suite release'
lock = json.loads((root / 'package-lock.json').read_text())
assert lock['version'] == lock['packages']['']['version'] == semver, 'npm lock version differs from suite release'
component_versions = settings['gsisComponentVersions']
required_components = {name.lower() + 'Frontend' for name in apps} | {name.lower() + 'Backend' for name in spec['backends']} | {'notificationWorker', 'operationsWorker'}
assert set(component_versions) == required_components, 'Component version inventory differs from installation inventory'
assert set(component_versions.values()) == {version}, 'Every component must use the suite release label'
guide = 'README.md'
manual = f'docs/GSiS-v{version}-User-Manual.html'
architecture = f'docs/architecture/GSiS_v{version}_Architecture.html'

with zipfile.ZipFile(root / f'GSiS_v{version}_Deployment.zip') as archive:
    assert archive.testzip() is None, 'Corrupt full package'
    assert len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate archive paths'
    assert set(archive.namelist()) == set(sources), 'Full package differs from the declared installation manifest; extras=' + str(sorted(set(archive.namelist()) - set(sources)))
    metadata = json.loads(archive.comment)
    assert metadata['version'] == version
    assert set(metadata['sha256']) == set(sources)
    for name, path in sources.items():
        data = archive.read(name)
        assert data == path.read_bytes(), 'Source parity: ' + name
        assert hashlib.sha256(data).hexdigest() == metadata['sha256'][name], name
    html = archive.read(manual).decode()
    assert '<title>' in html and version in html
    assert all(name.lower() in html.lower() for name in apps), 'Manual must cover every packaged viewport'
    assert not re.search(r'<(?:script|link|img)\b[^>]*(?:src|href)=["\'](?:https?:|//)', html), 'Manual requires external assets'
    ids = re.findall(r'\bid=["\']([^"\']+)', html)
    assert len(ids) == len(set(ids)), 'Duplicate manual anchors'
    assert set(re.findall(r'href=["\']#([^"\']+)', html)) <= set(ids), 'Broken manual anchors'
    guide_text = archive.read(guide).decode()
    assert 'Venues' in guide_text and 'six' in guide_text and 'nine' in guide_text
    assert not re.search(r'Venues booking system is a logged future|future venues.gsps.edu.sg application is not part', guide_text)
    for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', guide_text):
        if not target.startswith(('http:', 'https:', '#')):
            assert target.split('#', 1)[0] in sources, 'README link is absent from deployment: ' + target
    assert all(word in guide_text.lower() for word in ('cloudflare', 'apps script', 'cold', 'backup', 'contacts', 'calendar', 'lord', 'overlord', 'starlord'))
    for worker in workers:
        module = archive.read(worker).decode()
        assert re.search(r'export\s+default\s|export\s*\{[^}]*\bas\s+default\b', module), 'Worker is not module code: ' + worker
        assert not re.search(r'(?:import\s+(?:[^;]*?\s+from\s*)?|export\s+[^;]*?from\s*)[\"\']\.', module), 'Worker has unresolved local imports: ' + worker
        worker_versions = re.findall(r"\bversion\s*:\s*['\"]([^'\"]+)['\"]", module)
        assert worker_versions and set(worker_versions) == {version}, 'Notification Worker release label'
    architecture_html = archive.read(architecture).decode()
    assert '<title>' in architecture_html and version in architecture_html
    assert not re.search(r'<(?:script|link|img)\b[^>]*(?:src|href)=[\"\'](?:https?:|//)', architecture_html), 'Architecture requires external assets'
    assert Path(architecture).name in html, 'Manual must link to the standalone architecture guide'
    assert '<iframe' not in html.lower(), 'Manual must not duplicate architecture runtime'


for app, folder in apps.items():
    with zipfile.ZipFile(root / f'{app}_Frontend_v{version}.zip') as frontend:
        assert frontend.testzip() is None
        assert not any(Path(name).name == 'deployment-settings.json' or Path(name).name.startswith(('.env', '.dev.vars')) for name in frontend.namelist()), app + ' contains private settings'
        assert {'index.html', '_worker.js'} <= set(frontend.namelist()), app
        assert 'v' + version in frontend.read('index.html').decode(), app + ' version'
        worker = frontend.read('_worker.js').decode()
        if app == 'Venues':
            worker_versions = re.findall(r"const\s+VERSION\s*=\s*['\"]([^'\"]+)['\"]", worker)
        elif app == 'Calendar':
            worker_versions = re.findall(r"const\s+WORKER_VERSION\s*=\s*['\"]([^'\"]+)['\"]", worker)
        elif app in ('LORD', 'OVERLORD', 'STARLORD'):
            worker_versions = re.findall(r"['\"]X-LORD-Worker-Version['\"]\s*[:,]\s*['\"]([^'\"]+)['\"]", worker)
        else:
            worker_versions = re.findall(r"\bversion\s*:\s*['\"]([^'\"]+)['\"]", worker)
        assert worker_versions and set(worker_versions) == {version}, app + ' Worker release label'
        expected = {str(path.relative_to(root / folder)) for path in (root / folder).rglob('*') if path.is_file()}
        assert set(frontend.namelist()) == expected, app + ' complete runtime'
        for name in frontend.namelist():
            if name == '_worker.js' and app in ('Roster','Deploy'):
                with tempfile.TemporaryDirectory(prefix='gsis-verify-worker-') as directory:
                    output=Path(directory)/'_worker.js'
                    subprocess.run(['node','scripts/bundle-worker.cjs',folder+'/_worker.js',str(output)],cwd=root,check=True,capture_output=True)
                    assert frontend.read(name)==output.read_bytes(), app+' bundled Worker parity'
            else:
                assert frontend.read(name) == (root / folder / name).read_bytes(), app + '/' + name
        if app == 'Roster':
            privacy = frontend.read('privacy.html').decode()
            assert 'GSiS Privacy Policy' in privacy
            assert json.loads(frontend.read('_routes.json'))['include'] == ['/api/*']
            for page in ('index.html', 'external.html'):
                assert 'href="/privacy.html"' in frontend.read(page).decode()

for asset in json.loads((root / 'vendor-assets-manifest.json').read_text())['assets']:
    with zipfile.ZipFile(root / f"{asset['frontend']}_Frontend_v{version}.zip") as frontend:
        assert hashlib.sha256(frontend.read(asset['path'])).hexdigest() == asset['sha256'], asset['path']

for name, kind in [('Deploy', 'deploy'), ('Roster', 'roster')]:
    code = (root / f'{name}_Backend_v{version}.gs').read_text()
    assert code.count("const GSIS_BACKEND_KIND='" + kind + "';") == 1
    assert "const GSIS_DEPLOY_VERSION='" + version + "';" in code
contacts = (root / f'Contacts_Backend_v{version}.gs').read_text()
assert re.findall(r"const\s+GSIS_CONTACTS_VERSION\s*=\s*['\"]([^'\"]+)['\"]", contacts) == [version], 'Contacts backend release label'
calendar = (root / f'Calendar_Backend_v{version}.gs').read_text()
assert re.findall(r"\bRELEASE_VERSION\s*:\s*['\"]([^'\"]+)['\"]", calendar) == [version], 'Calendar backend release label'

# The three LORD viewports share one separately owned Apps Script backend.
# Verify the packaged dependency boundary, not only filenames and visible labels.
lord = (root / f'LORD_Backend_v{version}.gs').read_text()
assert lord == (root / 'lord-suite/Source/backend/Code.gs').read_text(), 'LORD backend source parity'
assert re.findall(r"\bVERSION\s*:\s*['\"]([^'\"]+)['\"]", lord) == [version], 'LORD backend release label'
for source, handler in [('Contacts', 'lordContactsService_'), ('Deploy', 'lordDeployService_')]:
    code = (root / f'{source}_Backend_v{version}.gs').read_text()
    assert 'function ' + handler + '(' in code, source + ' is missing its LORD source endpoint'
    assert 'function lordSourceAuthenticate_(' in code and 'LORD_BRIDGE_SECRET' in code, source + ' is missing source authentication'
for required in ['LORD_BRIDGE_SECRET', 'LORD_CONTACTS_APPS_SCRIPT_URL', 'LORD_DEPLOY_APPS_SCRIPT_URL',
                 'LORD_GSIS_SNAPSHOT_FOLDER_ID', 'enableLORDGSiSBridge', 'syncLORDGSiSReferences']:
    assert required in lord and required in guide_text, 'Missing LORD integration dependency: ' + required
for app in ('LORD', 'OVERLORD', 'STARLORD'):
    worker = (root / apps[app] / '_worker.js').read_text()
    assert 'LORD_BACKEND_URL' in worker and 'LORD_PROXY_SECRET' in worker, app + ' backend connection contract'
    assert 'env.LORD_BACKEND_URL' in worker and 'env.LORD_PROXY_SECRET' in worker, app + ' must read external connection bindings'
    assert not re.search(r'const\s+LORD_(?:BACKEND_URL|PROXY_SECRET)\s*=\s*[\x27\x22]', worker), app + ' must not embed connection values'
    assert 'REPLACE_DEPLOYMENT_ID' not in worker and 'REPLACE_PROXY_SECRET' not in worker, app + ' must not require code configuration'
    if app != 'STARLORD':
        assert 'env.GOOGLE_CLIENT_ID' in worker and 'env.LORD_SESSION_SECRET' in worker, app + ' identity binding contract'
dependency = spec['dependencies']['LORD']
assert not dependency.get('workerConstants'), 'LORD deployment settings must not be listed as code constants'
assert {'GOOGLE_CLIENT_ID','LORD_SESSION_SECRET','LORD_BACKEND_URL','LORD_PROXY_SECRET'} <= set(dependency['workerBindings']), 'LORD Worker binding inventory is incomplete'
assert 'getScriptProperties' in lord and 'LORD_PROXY_SECRET' in lord, 'LORD backend must read external Script Properties'
for field in ['SPREADSHEET_ID','REFERENCE_SPREADSHEET_ID','PHOTO_FOLDER_ID','REIGN_ARCHIVE_FOLDER_ID','PROXY_SECRET','BOOKING_TOKEN_PEPPER','BOOKING_CODE_PEPPER','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID']:
    assert 'LORD_'+field in dependency['scriptProperties'], 'LORD Script Properties inventory is incomplete: '+field
    assert 'LORD_'+field in lord and not re.search(r'^\s*'+field+r':\s*[\x27\x22]', lord, re.M), 'LORD configuration must stay outside code: '+field

venues = (root / f'Venues_Backend_v{version}.gs').read_text()
expected_venues = '// Generated by scripts/build-release.py from venues-backend sources.\n' + '\n\n'.join((root / 'venues-backend' / name).read_text() for name in ['Domain.gs', 'Code.gs', 'Sources.gs', 'Register.gs', 'Notifications.gs'])
assert venues == expected_venues, 'Venues backend source parity'
assert re.findall(r"\bVENUES_VERSION\s*=\s*['\"]([^'\"]+)['\"]", venues) == [version], 'Venues backend release label'
assert (root / 'venues-backend/Domain.gs').read_bytes() == (root / 'shared/venues.js').read_bytes(), 'Venues domain parity'
for field in spec['dependencies']['Venues']['scriptProperties']:
    source_setting = field in venues or (field.endswith('_APPS_SCRIPT_URL') and "'VENUES_'+source.toUpperCase()+'_APPS_SCRIPT_URL'" in venues)
    assert source_setting and field in guide_text, 'Venues setting missing from source or README: ' + field
venue_worker = (root / apps['Venues'] / '_worker.js').read_text()
for field in spec['dependencies']['Venues']['workerBindings']:
    assert field in venue_worker and field in guide_text, 'Venues Worker setting missing: ' + field
for field in ('VENUES_PROXY_SECRET', 'VENUES_BRIDGE_SECRET'):
    assert not re.search(field + r"\s*[:=]\s*['\"][^'\"]+['\"]", venues + venue_worker), 'Embedded Venues credential: ' + field

if not args.version:
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    assert metadata['sourceCommit'] == commit, 'Archive commit metadata is stale'
print('PASS clean full package:', len(sources), 'declared files, source parity, hashes, runtime assets and offline guides.')
