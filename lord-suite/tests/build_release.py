"""Build clean LORD component packages for GSiS Suite v0.9.7 after current tests pass."""
from pathlib import Path
import hashlib
import json
import importlib.util
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.9.7'
DIST = ROOT/'dist'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked_zip(target, entries):
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, path in sorted(entries.items()):
            archive.write(path, name)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == set(entries)
        for name, path in entries.items():
            assert archive.read(name) == path.read_bytes(), name


def main():
    result = json.loads((ROOT/'tests/all_checks_results.json').read_text())
    source = {str(p.relative_to(ROOT)): sha(p) for p in sorted((ROOT/'Source').rglob('*')) if p.is_file()}
    assert result['releaseVersion'] == VERSION and result['passedPrograms'] == len(result['commands']) and result['passedPrograms'] >= 25 and result['failedPrograms'] == 0
    assert result['sourceSha256'] == source, 'Run all checks for current source before packaging.'
    browser = json.loads((ROOT/'tests/reload_browser_results.json').read_text())
    assert browser['status'] == 'passed', 'Rendered browser checks are required.'
    templates = ROOT/'First_Time_Setup/templates'
    spec = importlib.util.spec_from_file_location('configure_instance', ROOT/'First_Time_Setup/configure_instance.py')
    config = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(config)
    config.assert_runtime_tree(ROOT/'Source')
    config.assert_runtime_tree(templates)
    expected_names = {p.relative_to(ROOT/'Source') for p in (ROOT/'Source').rglob('*') if p.is_file()}
    assert {p.relative_to(templates) for p in templates.rglob('*') if p.is_file()} == expected_names | {Path('backend/appsscript.json')}
    config.assert_external_configuration((ROOT/'Source/backend/Code.gs').read_text(),
        [(ROOT/'Source'/app/'_worker.js').read_text() for app in ['lord','overlord','starlord']])
    for relative in expected_names:
        data = (ROOT/'Source'/relative).read_bytes()
        assert (templates/relative).read_bytes() == data, 'Rebuild clean template: '+str(relative)
    manifest = json.loads((templates/'backend/appsscript.json').read_text())
    assert manifest == {'timeZone': 'Asia/Singapore', 'dependencies': {'enabledAdvancedServices': [{'userSymbol': 'Sheets', 'version': 'v4', 'serviceId': 'sheets'}]}, 'exceptionLogging': 'STACKDRIVER', 'runtimeVersion': 'V8'}
    DIST.mkdir(exist_ok=True)
    artifacts = []
    for component in ['backend', 'lord', 'overlord', 'starlord']:
        entries = {str(p.relative_to(templates/component)): p for p in (templates/component).rglob('*') if p.is_file()}
        package = DIST/(component.upper()+'_v'+VERSION+'_GSiS_Suite.zip')
        checked_zip(package, entries)
        artifacts.append(package)
    try:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, stderr=subprocess.DEVNULL, text=True).strip()
    except subprocess.CalledProcessError:
        commit = None
    manifest = {'suiteVersion': VERSION, 'sourceCommit': commit, 'configuration': 'Apps Script Properties and Cloudflare bindings; no embedded values',
                'deployed': False, 'passedPrograms': result['passedPrograms'], 'browser': browser['status'],
                'sourceSha256': source, 'artifacts': {p.name: sha(p) for p in artifacts}}
    (DIST/'LORD_RELEASE_v0.9.7.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({'suiteVersion': VERSION, 'artifacts': [str(p) for p in artifacts], 'configured': False}))


if __name__ == '__main__':
    main()
