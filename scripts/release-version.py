"""Stamp current production labels from package-099-suite.py's VERSION.

Historical release notes, persisted schemas and shadow preparation stay independent.
"""
from pathlib import Path
import ast
import json
import re

ROOT = Path(__file__).resolve().parents[1]
LABEL = re.compile(r'\d+\.\d+\.\d+[a-z]')


def current_version(root=ROOT):
    tree = ast.parse((root / 'scripts/package-099-suite.py').read_text())
    values = [n.value.value for n in tree.body if isinstance(n, ast.Assign)
              and any(isinstance(t, ast.Name) and t.id == 'VERSION' for t in n.targets)]
    assert len(values) == 1 and LABEL.fullmatch(values[0]), 'Use a full release label such as 0.9.9b'
    return values[0]


def write_changed(path, text):
    if path.read_text() != text:
        path.write_text(text)


def stamp(root=ROOT):
    version = current_version(root)
    family = version[:-1]
    # Change only current release pins, never other releases or workbook schema labels.
    pattern = re.compile(r'(?<![\d.])' + re.escape(family) + r'[a-z]?(?![\d.a-z])')
    metadata = json.loads((root / 'package.json').read_text())
    metadata['gsisRelease'] = version
    metadata['gsisComponentVersions'] = {key: version for key in metadata['gsisComponentVersions']}
    write_changed(root / 'package.json', json.dumps(metadata, indent=2) + '\n')
    spec = json.loads((root / 'release-installation-manifest.json').read_text())
    targets = ['backend/Code.gs', 'backend/Roster.gs', 'Contacts_Code.gs',
               'calendar-backend/Code.gs', 'venues-backend/Code.gs', 'shared/venues.js',
               'notification-worker/index.js', 'operations-worker/index.js', 'calendar-job-worker/worker.mjs']
    for folder in spec['frontends'].values():
        targets += [p.relative_to(root).as_posix() for p in (root / folder).glob('*.js')]
        targets += [p.relative_to(root).as_posix() for p in (root / folder).rglob('*.html')]
    # LORD pins its own public protocol labels and generated first-install templates.
    lord_bump = __import__('runpy').run_path(str(root / 'lord-suite/tools/bump_suite_version.py'))
    lord_bump['bump'](version)
    notice = (root / 'shared/release-notice.js').read_bytes()
    for folder in spec['frontends'].values():
        (root / folder / 'gsis-version.js').write_bytes(notice)
    for name in sorted(set(targets)):
        path = root / name
        if not path.is_file(): continue
        text = ''.join(line if line.lstrip().startswith('//') else pattern.sub(version, line) for line in path.read_text().splitlines(keepends=True))
        if path.suffix == '.html':
            text = re.sub(r'<meta name="gsis-version" content="[^"]*">', '', text)
            text = re.sub(r'<script src="[^"]*gsis-version\.js[^\"]*"></script>', '', text)
            folder = next(root / f for f in spec['frontends'].values() if path.is_relative_to(root / f))
            import os
            notice_path = os.path.relpath(folder / 'gsis-version.js', path.parent).replace('\\', '/')
            text = re.sub(r'(<head\b[^>]*>)', lambda m: m[1] + '<meta name="gsis-version" content="' + version + '">', text, count=1, flags=re.I)
            # Referrer and CSP meta policies must be parsed before this request.
            text = text.replace('</head>', '<script src="' + notice_path + '?v=' + version + '"></script></head>', 1)
            def asset(m):
                value = m[2]
                if re.match(r'^(?:[a-z]+:|//|#|data:)', value, re.I): return m[0]
                if not re.search(r'\.(?:js|css|ico|png|webp|svg|woff2?)(?:[?#]|$)', value, re.I): return m[0]
                from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
                p = urlsplit(value)
                query = [(k, v) for k, v in parse_qsl(p.query) if k != 'v'] + [('v', version)]
                return m[1] + urlunsplit((p.scheme, p.netloc, p.path, urlencode(query), p.fragment)) + m[3]
            text = re.sub(r'((?:src|href)=["\'])([^"\']+)(["\'])', asset, text)
            if path.name == 'index.html' and not re.search(r'data-gsis-release', text):
                # Reuse an existing short visible label where possible.
                text, n = re.subn(r'(<(?:span|small)\b[^>]*)(>[^<]*v' + re.escape(version) + r'</(?:span|small)>)', r'\1 data-gsis-release\2', text, count=1)
                if not n:
                    text = text.replace('</header>', '<small data-gsis-release>v' + version + '</small></header>', 1)
        write_changed(path, text)
    import subprocess, sys
    subprocess.run([sys.executable, str(root / 'lord-suite/tools/prepare_first_time.py')], cwd=root, check=True)
    return version


def release_document(data, version):
    """Keep source history intact while installation copies name current artifacts."""
    text = data.decode('utf-8')
    family = re.sub(r'[a-z]$', '', version)
    names = r'(?:Contacts|Deploy|Roster|Calendar|LORD|OVERLORD|STARLORD|Layout|Venues)_(?:Frontend|Backend)|Roster_Notification_Worker|GSiS_Operations_Worker|GSiS_Calendar_Job_Worker'
    text = re.sub(r'\b(' + names + r')_v' + re.escape(family) + r'[a-z]?(?=\.(?:gs|zip|txt)\b)', lambda m: m[1] + '_v' + version, text)
    return text.encode('utf-8')


def check_frontend(folder, version):
    text = (folder / 'index.html').read_text()
    assert '<meta name="gsis-version" content="' + version + '">' in text, str(folder) + ' page label'
    labels = re.findall(r'<(?:span|small)\b[^>]*data-gsis-release[^>]*>([^<]+)</', text)
    assert labels and all(re.search(r'\bv' + re.escape(version) + r'$', label) for label in labels), str(folder) + ' header label differs'


def check_bundle_version(root, version):
    assert LABEL.fullmatch(version), 'Use a full bundle label'
    previous = (root / 'release/LAST_BUNDLE_VERSION').read_text().strip()
    assert previous != version, 'This bundle label was already used; advance VERSION before packaging'
    assert not previous.endswith('z'), 'After z, ask the owner for the next release label'
    if LABEL.fullmatch(previous) and previous[:-1] == version[:-1]:
        assert ord(version[-1]) == ord(previous[-1]) + 1, 'Advance the bundle letter by one'
    else:
        assert version.endswith('b'), 'Start a new bundle series at b'


def record_bundle_version(root, version):
    check_bundle_version(root, version)
    path = root / 'release/LAST_BUNDLE_VERSION'
    temporary = path.with_suffix('.tmp')
    temporary.write_text(version + '\n')
    temporary.replace(path)


if __name__ == '__main__':
    import sys
    if '--check' in sys.argv:
        version = current_version()
        for folder in json.loads((ROOT / 'release-installation-manifest.json').read_text())['frontends'].values():
            check_frontend(ROOT / folder, version)
        print('Verified production page labels: ' + version)
    else:
        print('Stamped current production release: ' + stamp())
