#!/usr/bin/env python3
"""Prepare clean LORD code and a separate private settings ledger. No network calls."""
from pathlib import Path
import argparse
import json
import os
import re
import secrets
import shutil
import tempfile
import zipfile
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
KEYS = ['SPREADSHEET_ID', 'REFERENCE_SPREADSHEET_ID', 'PHOTO_FOLDER_ID',
        'REIGN_ARCHIVE_FOLDER_ID', 'PROXY_SECRET', 'BOOKING_TOKEN_PEPPER',
        'BOOKING_CODE_PEPPER', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']
PROPERTIES = {key: 'LORD_' + key for key in KEYS}


def assert_external_configuration(backend, workers):
    """Reject the old credential-in-code format before creating any output."""
    if 'getScriptProperties' not in backend:
        raise ValueError('Backend must read Script Properties.')
    for key, prop in PROPERTIES.items():
        resolver = 'lordGSiSSecret_' if key == 'PROXY_SECRET' else 'lordSetting_'
        getter = r'get\s+'+key+r'\s*\(\)\s*\{\s*return\s+'+resolver+r'\([\x27\x22]'+prop+r'[\x27\x22](?:,\s*true)?\);\s*\}'
        if not re.search(getter, backend) or re.search(r'^\s*'+key+r':\s*[\x27\x22]', backend, re.M):
            raise ValueError('Backend configuration must use Script Properties: ' + prop)
    if not all(fragment in backend for fragment in [
            'function lordGSiSSecret_(legacyKey, optional)',
            "getScriptProperties().getProperty('GSIS_SECRET')",
            'return lordSetting_(legacyKey, optional);']):
        raise ValueError('Shared backend credentials must retain external configuration and legacy fallback.')
    for worker in workers:
        if not re.search(r'env(?:\?\.)?\.?LORD_BACKEND_URL\b', worker) or not all(fragment in worker for fragment in [
                "gsisApiSecret(env,'LORD_PROXY_SECRET')", 'function gsisApiSecret(env,legacyName)',
                'env?.GSIS_SECRET', 'return env?.[legacyName];']):
            raise ValueError('Workers must read their deployment bindings.')
        if re.search(r'\b(?:const|let|var)\s+LORD_(?:BACKEND_URL|PROXY_SECRET)\s*=\s*[\x27\x22]', worker):
            raise ValueError('Workers must not embed deployment values.')


def assert_runtime_tree(path):
    for file in path.rglob('*'):
        if file.is_file() and (file.name == 'deployment-settings.json' or file.name.startswith(('.env', '.dev.vars'))):
            raise ValueError('Private settings must stay outside runtime folders.')


def write_private_json(path, data):
    fd, temporary = tempfile.mkstemp(prefix='lord-settings-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            json.dump(data, output, indent=2)
            output.write('\n')
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def configure(config, output):
    output = Path(output).resolve()
    if output == ROOT or output in ROOT.parents or ROOT in output.parents:
        raise ValueError('Choose a separate output folder outside setup source.')
    for protected in ['Source', 'tests', 'tools']:
        source = ROOT.parent/protected
        if output == source or source in output.parents:
            raise ValueError('Do not overwrite maintained source.')
    existing = config.get('existingInstallation', False)
    if not isinstance(existing, bool):
        raise ValueError('existingInstallation must be true or false.')
    values = {}
    for key in KEYS:
        value = config.get(PROPERTIES[key], config.get(key, ''))
        optional = key in ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']
        if not isinstance(value, str) or (not value.strip() and not optional) or 'REPLACE_' in value or any(c in value for c in '\r\n'):
            raise ValueError('Fill the configuration field: ' + PROPERTIES[key])
        values[key] = value
    if bool(values['TELEGRAM_BOT_TOKEN']) != bool(values['TELEGRAM_CHAT_ID']):
        raise ValueError('Configure both Telegram settings or leave both empty.')
    for key in KEYS[:4]:
        if not re.fullmatch(r'[A-Za-z0-9_-]{10,}', values[key]):
            raise ValueError('Use an ID, not a URL, for ' + PROPERTIES[key])
    secret_keys = ['PROXY_SECRET', 'BOOKING_TOKEN_PEPPER', 'BOOKING_CODE_PEPPER']
    if not existing:
        for key in secret_keys:
            if len(values[key]) < 32:
                raise ValueError(PROPERTIES[key] + ' needs at least 32 characters for a new instance.')
        if len({values[key] for key in secret_keys}) != len(secret_keys):
            raise ValueError('Use different new proxy and booking secrets.')
    if values['SPREADSHEET_ID'] == values['REFERENCE_SPREADSHEET_ID']:
        raise ValueError('Transaction and reference workbook IDs must differ.')
    url = config.get('LORD_BACKEND_URL', config.get('backendUrl', ''))
    if not isinstance(url, str):
        raise ValueError('LORD_BACKEND_URL must be a URL string.')
    url = url.strip()
    if url:
        parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.netloc != 'script.google.com' or not re.fullmatch(r'/macros/s/[A-Za-z0-9_-]+/exec', parsed.path) or parsed.query or parsed.fragment:
            raise ValueError('Use the deployed Google Apps Script /exec URL.')
    templates = ROOT/'templates'
    assert_runtime_tree(templates)
    backend = (templates/'backend/Code.gs').read_text()
    workers = [(templates/app/'_worker.js').read_text() for app in ['lord', 'overlord', 'starlord']]
    assert_external_configuration(backend, workers)
    for app in ['backend', 'lord', 'overlord', 'starlord']:
        assert_runtime_tree(output/app)
    settings_path = output/'deployment-settings.json'
    previous = json.loads(settings_path.read_text()) if settings_path.exists() else {}
    prior_session = previous.get('cloudflarePages', {}).get('LORD', {}).get('secrets', {}).get('LORD_SESSION_SECRET', previous.get('LORD_SESSION_SECRET'))
    supplied_session = config.get('LORD_SESSION_SECRET')
    if supplied_session is not None and prior_session and supplied_session != prior_session:
        raise ValueError('Do not replace an existing session secret during configuration.')
    session = supplied_session if supplied_session is not None else prior_session
    if session is not None and (not isinstance(session, str) or not session or 'REPLACE_' in session or any(c in session for c in '\r\n') or (not existing and len(session) < 32)):
        raise ValueError('Keep a valid existing session secret or supply a strong new one.')
    if session is None and not existing:
        session = secrets.token_urlsafe(48)
    settings = {'schema': 1, 'installationMode': 'existing' if existing else 'new',
                'appsScript': {'LORD': {PROPERTIES[key]: value for key, value in values.items()}},
                'cloudflarePages': {},
                'note': 'Private settings only. Enter them in platform settings; never upload this ledger with runtime files.'}
    for app in ['LORD', 'OVERLORD', 'STARLORD']:
        item = {'variables': {'LORD_BACKEND_URL': url}, 'secrets': {'LORD_PROXY_SECRET': values['PROXY_SECRET']}}
        if app != 'STARLORD':
            item['preserveExisting'] = ['GOOGLE_CLIENT_ID']
            if session is None: item['preserveExisting'].append('LORD_SESSION_SECRET')
            else: item['secrets']['LORD_SESSION_SECRET'] = session
        settings['cloudflarePages'][app] = item
    output.mkdir(parents=True, exist_ok=True)
    output.chmod(0o700)
    write_private_json(settings_path, settings)
    shutil.copytree(templates/'backend', output/'backend', dirs_exist_ok=True)
    if not url:
        return 'Clean backend and private settings ledger prepared. Add the deployment URL before preparing frontend ZIPs.'
    for app in ['lord', 'overlord', 'starlord']:
        shutil.copytree(templates/app, output/app, dirs_exist_ok=True)
        with zipfile.ZipFile(output/(app.upper()+'_v0.9.7_Cloudflare.zip'), 'w', zipfile.ZIP_DEFLATED) as archive:
            for file in sorted((templates/app).rglob('*')):
                if file.is_file(): archive.write(file, file.relative_to(templates/app))
    return 'Clean backend and frontend ZIPs prepared. Enter values from the separate private settings ledger before deployment.'


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('config', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        message = configure(json.loads(args.config.read_text()), args.output)
    except (ValueError, OSError):
        raise SystemExit('Configuration failed. Check field names, IDs, backend URL, installation mode and output permissions. Private values were not printed.')
    print(message)
