"""Update current LORD suite release pins while retaining persisted schema and cache keys."""
from pathlib import Path
import argparse
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def bump(version):
    if not re.fullmatch(r'\d+\.\d+(?:\.\d+)?[a-z]?', version):
        raise ValueError('Use a release version such as 0.9 or 0.9.1.')
    source = (ROOT/'Source/backend/Code.gs').read_text()
    old = re.search(r"\bVERSION:\s*['\"]([^'\"]+)['\"]", source)[1]
    if old == version:
        return
    pins = list((ROOT/'Source').rglob('*.html')) + [ROOT/'Source/backend/Code.gs']
    pins += [ROOT/'Source'/app/name for app in ['lord','overlord','starlord'] for name in ['_worker.js','assets/app.js']]
    pins += [ROOT/'tests'/name for name in ['run_static_checks.py','run_backend_settings_checks.cjs','run_backend_131_checks.cjs',
             'run_frontend_141_checks.cjs','run_v18_checks.cjs','run_v18_frontend_checks.cjs',
             'run_all_checks.py','build_release.py']]
    pins += [ROOT/'First_Time_Setup/configure_instance.py', ROOT/'README.md']
    for file in pins:
        text = file.read_text()
        for prefix in ['v', '?v=', "'", '"']:
            suffix = r"(?![0-9A-Za-z]|\.\d)" if prefix in ['v','?v='] else "(?=['\"])"
            text = re.sub(re.escape(prefix+old)+suffix, lambda _: prefix+version, text)
        file.write_text(text)
    subprocess.run([sys.executable, str(ROOT/'tools/prepare_first_time.py')], cwd=ROOT, check=True)
    print('Updated LORD components from '+old+' to '+version+'. Run the suite checks before packaging.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('version')
    bump(parser.parse_args().version)
