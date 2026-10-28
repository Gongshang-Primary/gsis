from pathlib import Path
import importlib.util
import json
import stat
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('configure_instance', ROOT/'First_Time_Setup/configure_instance.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
results = []


def check(name, fn):
    try:
        fn()
        results.append({'name': name, 'ok': True})
    except Exception as error:
        # Test fixtures are synthetic; still avoid recording configuration values.
        results.append({'name': name, 'ok': False, 'error': type(error).__name__})


def require(condition):
    assert condition


def rejected(config, target):
    try:
        module.configure(config, target)
    except ValueError:
        return
    raise AssertionError('Invalid configuration accepted')


def ledger(output):
    return json.loads((output/'deployment-settings.json').read_text())


def session(output):
    return ledger(output)['cloudflarePages']['LORD']['secrets'].get('LORD_SESSION_SECRET')


def clean_runtime(output, config):
    private = [str(config[key]).encode() for key in config if key.startswith('LORD_') and isinstance(config[key], str) and config[key]]
    private.append(session(output).encode() if session(output) else b'no-session-generated')
    for app in ['backend', 'lord', 'overlord', 'starlord']:
        if not (output/app).exists():
            continue
        for file in (ROOT/'First_Time_Setup/templates'/app).rglob('*'):
            if file.is_file():
                data = (output/app/file.relative_to(ROOT/'First_Time_Setup/templates'/app)).read_bytes()
                assert data == file.read_bytes()
                assert not any(value in data for value in private)
    for file in output.glob('*.zip'):
        app = file.name.split('_')[0].lower()
        with zipfile.ZipFile(file) as archive:
            expected = {str(p.relative_to(ROOT/'First_Time_Setup/templates'/app)): p.read_bytes()
                        for p in (ROOT/'First_Time_Setup/templates'/app).rglob('*') if p.is_file()}
            assert set(archive.namelist()) == set(expected)
            assert {'_worker.js', 'index.html', 'assets/app.js'}.issubset(expected)
            for name, data in expected.items():
                assert archive.read(name) == data
                assert not any(value in data for value in private)


backend = (ROOT/'Source/backend/Code.gs').read_text()
workers = [(ROOT/'Source'/app/'_worker.js').read_text() for app in ['lord', 'overlord', 'starlord']]
check('Runtime source requires external properties and bindings', lambda: module.assert_external_configuration(backend, workers))
for app in ['backend', 'lord', 'overlord', 'starlord']:
    def parity(app=app):
        for source in (ROOT/'Source'/app).rglob('*'):
            if source.is_file():
                assert (ROOT/'First_Time_Setup/templates'/source.relative_to(ROOT/'Source')).read_bytes() == source.read_bytes()
    check(app+' templates preserve exact clean source bytes', parity)

config = {'LORD_'+key: 'synthetic_'+key.lower() for key in module.KEYS}
config.update(LORD_PROXY_SECRET='synthetic-proxy-'+'a'*40,
              LORD_BOOKING_TOKEN_PEPPER='synthetic-token-'+'b'*40,
              LORD_BOOKING_CODE_PEPPER='synthetic-code-'+'c'*40, LORD_BACKEND_URL='')
with tempfile.TemporaryDirectory() as folder:
    output = Path(folder)/'prepared'
    def first_phase():
        module.configure(config, output)
        assert (output/'backend/Code.gs').exists() and not list(output.glob('*.zip'))
        assert ledger(output)['appsScript']['LORD'] == {key: value for key, value in config.items() if key != 'LORD_BACKEND_URL'}
        assert stat.S_IMODE((output/'deployment-settings.json').stat().st_mode) == 0o600
        assert stat.S_IMODE(output.stat().st_mode) == 0o700
        clean_runtime(output, config)
    check('Backend phase keeps settings in a separate private ledger', first_phase)
    first_session = session(output) if output.exists() else None
    config['LORD_BACKEND_URL'] = 'https://script.google.com/macros/s/synthetic-deployment/exec'
    def second_phase():
        module.configure(config, output)
        assert len(list(output.glob('*.zip'))) == 3
        assert session(output) == first_session
        for app in ['LORD', 'OVERLORD', 'STARLORD']:
            item = ledger(output)['cloudflarePages'][app]
            assert item['variables']['LORD_BACKEND_URL'] == config['LORD_BACKEND_URL']
            assert item['secrets']['LORD_PROXY_SECRET'] == config['LORD_PROXY_SECRET']
            if app != 'STARLORD':
                assert item['secrets']['LORD_SESSION_SECRET'] == first_session
                assert item['preserveExisting'] == ['GOOGLE_CLIENT_ID']
        clean_runtime(output, config)
    check('Frontend ZIPs contain only exact clean runtime bytes', second_phase)
    check('Clean backend parses as JavaScript', lambda: subprocess.run(['node', '--check', '-'], input=(output/'backend/Code.gs').read_text(), text=True, capture_output=True, check=True))
    check('Rerun reuses the existing session secret', lambda: (module.configure(config, output), require(session(output) == first_session)))
    def no_rotation():
        previous = (output/'deployment-settings.json').read_bytes()
        rejected({**config, 'LORD_SESSION_SECRET': 'different-session-'+'z'*40}, output)
        assert (output/'deployment-settings.json').read_bytes() == previous
    check('A conflicting supplied session cannot rotate an existing session', no_rotation)
    def invalid():
        for index, change in enumerate([
            {'LORD_SPREADSHEET_ID': 'REPLACE_ID'}, {'LORD_BACKEND_URL': 'https://example.test/exec'},
            {'LORD_BACKEND_URL': config['LORD_BACKEND_URL']+'?x=1'}, {'LORD_PROXY_SECRET': 'short'},
            {'LORD_BOOKING_TOKEN_PEPPER': config['LORD_PROXY_SECRET']}, {'existingInstallation': 'yes'},
            {'LORD_TELEGRAM_CHAT_ID': ''}, {'LORD_PROXY_SECRET': 'private\nvalue'},
            {'LORD_REFERENCE_SPREADSHEET_ID': config['LORD_SPREADSHEET_ID']}]):
            target = Path(folder)/('invalid-'+str(index))
            rejected({**config, **change}, target)
            assert not target.exists()
    check('Invalid new configuration fails before creating output', invalid)
    def existing():
        target = Path(folder)/'existing'
        values = {**config, 'existingInstallation': True, 'LORD_PROXY_SECRET': ' legacy-proxy ',
                  'LORD_BOOKING_TOKEN_PEPPER': ' shared-old-pepper ', 'LORD_BOOKING_CODE_PEPPER': ' shared-old-pepper ',
                  'LORD_SESSION_SECRET': ' old-session ', 'LORD_TELEGRAM_BOT_TOKEN': '', 'LORD_TELEGRAM_CHAT_ID': ''}
        module.configure(values, target)
        for key in ['LORD_PROXY_SECRET', 'LORD_BOOKING_TOKEN_PEPPER', 'LORD_BOOKING_CODE_PEPPER']:
            assert ledger(target)['appsScript']['LORD'][key] == values[key]
        assert session(target) == values['LORD_SESSION_SECRET']
        clean_runtime(target, values)
    check('Existing legacy peppers and sessions preserve exact bytes without new-secret rules', existing)
    def unknown_session():
        target = Path(folder)/'unknown-session'
        values = {**config, 'existingInstallation': True}
        module.configure(values, target)
        assert session(target) is None
        for app in ['LORD', 'OVERLORD']:
            assert 'LORD_SESSION_SECRET' in ledger(target)['cloudflarePages'][app]['preserveExisting']
        clean_runtime(target, values)
    check('Existing installation never generates an unknown session secret', unknown_session)
    def preserve_legacy_ledger():
        target = Path(folder)/'legacy-ledger'
        target.mkdir()
        (target/'deployment-settings.json').write_text(json.dumps({'LORD_SESSION_SECRET': 'legacy-session'}))
        module.configure({**config, 'existingInstallation': True}, target)
        assert session(target) == 'legacy-session'
    check('Previous private ledger session is retained during migration', preserve_legacy_ledger)
    def unsafe_output():
        for target in [ROOT, ROOT/'Source', ROOT/'Source/lord/generated', ROOT/'First_Time_Setup/generated', ROOT/'tests/generated']:
            rejected(config, target)
    check('Configurator cannot write into maintained runtime or setup source', unsafe_output)
    def private_runtime_files():
        target = Path(folder)/'contaminated-output'
        (target/'lord').mkdir(parents=True)
        (target/'lord/.dev.vars').write_text('SYNTHETIC_PRIVATE_SETTING=synthetic-only')
        rejected(config, target)
        assert not (target/'deployment-settings.json').exists()
    check('Private binding files cannot enter prepared runtime folders', private_runtime_files)
    def embedded_config_rejected():
        modified = backend.replace("get PROXY_SECRET() { return lordGSiSSecret_('LORD_PROXY_SECRET'); }", "PROXY_SECRET: 'synthetic-embedded'")
        for candidate, candidate_workers in [(modified, workers), (backend, [workers[0]+"\nconst LORD_PROXY_SECRET = 'synthetic-embedded';", *workers[1:]])]:
            try:
                module.assert_external_configuration(candidate, candidate_workers)
            except ValueError:
                continue
            raise AssertionError('Embedded credentials accepted')
    check('Packaging refuses backend or Worker credential-in-code regressions', embedded_config_rejected)

report = {'passed': sum(x['ok'] for x in results), 'failed': sum(not x['ok'] for x in results), 'results': results}
(ROOT/'tests/setup_results.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
raise SystemExit(bool(report['failed']))
