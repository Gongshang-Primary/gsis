"""Rebuild a new non-Git source tree from a Q review archive and run selected gates.

Uses an existing locked node_modules to avoid network dependency; this is not a
fresh dependency-install proof. It sends no live requests and never mutates the
original source or deployment archives. Destination must not already exist.
"""
from pathlib import Path
import argparse
import importlib.util
import json
import os
import subprocess
import time
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('package098q', ROOT / 'scripts/package-098q-calendar.py')
q = importlib.util.module_from_spec(spec); spec.loader.exec_module(q)

def run(review, patch, destination, modules, preview=False):
    assert not destination.exists(), 'Choose a new recovery destination'
    assert modules.is_dir(), 'Existing locked node_modules required'
    q.p.verify_archive(review); q.p.verify_archive(patch)
    destination.mkdir(parents=True)
    source = destination / 'source'; source.mkdir()
    with zipfile.ZipFile(review) as archive:
        index = json.loads(archive.read('SOURCE_INDEX.json'))
        for name, item in index['included'].items():
            q.p.safe_path(name)
            data = archive.read('source/' + name)
            assert q.p.digest(data) == item['sha256'] and len(data) == item['bytes'], 'Recovery source hash differs'
            path = source / name; path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    (source / 'node_modules').symlink_to(modules, target_is_directory=True)
    commands = [
        ['python3', 'scripts/package-098q-calendar.py', '--build-only'],
        ['node', 'tests/release098q-metadata.cjs'],
        ['node', 'tests/calendar098q-sync-transport-ui.cjs'],
        ['node', 'tests/calendar098q-status-native-cost.cjs'],
        ['python3', 'tests/release098p-packaging.py'],
        ['python3', 'tests/release098q-packaging.py'],
        ['node', 'lord-suite/tests/run_gsis_contract_checks.cjs'],
        ['python3', 'scripts/verify-098q-calendar.py', str(patch), str(review), '--source-root', str(source), *(['--preview'] if preview else [])]
    ]
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'LANG', 'TMPDIR'] if key in os.environ}
    env['TZ'] = 'Asia/Singapore'
    results = []
    for number, command in enumerate(commands, 1):
        started = time.monotonic()
        completed = subprocess.run(command, cwd=source, env=env, capture_output=True, text=True)
        output = completed.stdout + completed.stderr
        (destination / f'recovery-{number}.log').write_text(output)
        results.append({'command': command, 'exitCode': completed.returncode, 'elapsedSeconds': round(time.monotonic()-started, 3)})
        print(f'{number}/{len(commands)} ' + ('PASS ' if completed.returncode == 0 else 'FAIL ') + ' '.join(command), flush=True)
        if completed.returncode: break
    result = {'source': str(source), 'reviewSha256': q.p.digest(review.read_bytes()), 'patchSha256': q.p.digest(patch.read_bytes()),
              'sourceFiles': len(index['included']), 'commands': results, 'passed': sum(item['exitCode'] == 0 for item in results),
              'expectedCommands': len(commands), 'nodeModulesReused': True, 'freshDependencyInstallVerified': False,
              'gitHistoryAvailable': False, 'productionDeployed': False, 'liveRequestsMade': False}
    (destination / 'recovery-results.json').write_text(json.dumps(result, indent=2)+'\n')
    assert result['passed'] == len(commands), 'Recovery check failed; see per-command evidence'
    return result

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review', type=Path, required=True); parser.add_argument('--patch', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True); parser.add_argument('--node-modules', type=Path, required=True)
    parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    print(json.dumps(run(args.review.resolve(), args.patch.resolve(), args.destination.resolve(), args.node_modules.resolve(), args.preview), indent=2))
