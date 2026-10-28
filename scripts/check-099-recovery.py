"""Rebuild 0.9.9 in a fresh non-Git tree and verify source/component recovery.

Reuses existing locked node_modules, so it proves source recovery rather than a
fresh dependency download. No network, deployment, data migration or messaging.
Destination must not exist. Run from trusted source after verifying ZIP hashes.
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
spec = importlib.util.spec_from_file_location('package099', ROOT / 'scripts/package-099-suite.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


def run(review, suite, destination, modules, preview=False, full_tests=False):
    assert not destination.exists(), 'Choose a new recovery destination'
    assert modules.is_dir(), 'Existing locked node_modules required'
    p.verify_archive(review)
    p.verify_archive(suite)
    destination.mkdir(parents=True)
    source = destination / 'source'
    source.mkdir()
    with zipfile.ZipFile(review) as archive:
        index = json.loads(archive.read('SOURCE_INDEX.json'))
        for name, item in index['included'].items():
            p.safe_path(name)
            data = archive.read('source/' + name)
            assert p.digest(data) == item['sha256'] and len(data) == item['bytes'], 'Recovery source hash differs'
            path = source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    (source / 'node_modules').symlink_to(modules, target_is_directory=True)
    commands = [
        ['python3', 'scripts/package-099-suite.py', '--build-only'],
        ['node', 'tests/release099-metadata.cjs'],
        ['python3', 'tests/release099-packaging.py'],
        ['node', 'tests/calendar098q-sync-transport-ui.cjs'],
        ['node', 'tests/calendar098q-status-native-cost.cjs'],
        ['node', 'tests/calendar-stable-view-browser.cjs'],
        ['node', 'tests/calendar099-changes.mjs'],
        ['node', 'tests/calendar099-change-gateway.mjs'],
        ['node', 'tests/calendar099-delta.cjs'],
        ['node', 'tests/calendar099-change-ui.cjs'],
        ['node', 'tests/calendar099-change-browser.cjs'],
        ['node', 'tests/calendar099-venue-diagnostics.cjs'],
        ['node', 'lord-suite/tests/run_gsis_contract_checks.cjs'],
    ]
    if full_tests: commands.append(['npm', 'test'])
    commands.append(['python3', 'scripts/verify-099-suite.py', str(suite), str(review), '--source-root', str(source), *(['--preview'] if preview else [])])
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'LANG', 'TMPDIR', 'PLAYWRIGHT_CHROMIUM_EXECUTABLE', 'LORD_TEST_CHROMIUM', 'ROSTER_TEST_CHROMIUM', 'PLAYWRIGHT_BROWSERS_PATH'] if key in os.environ}
    env['TZ'] = 'Asia/Singapore'
    if Path('/tmp/chromium').is_file():
        env.setdefault('LORD_TEST_CHROMIUM', '/tmp/chromium')
        env.setdefault('ROSTER_TEST_CHROMIUM', '/tmp/chromium')
    env['GSIS_RECOVERY_SUITE'] = str(suite)
    env['GSIS_RECOVERY_REVIEW'] = str(review)
    env['GSIS_RECOVERY_PREVIEW'] = 'true' if preview else 'false'
    results = []
    for number, command in enumerate(commands, 1):
        started = time.monotonic()
        completed = subprocess.run(command, cwd=source, env=env, capture_output=True, text=True)
        (destination / f'recovery-{number}.log').write_text(completed.stdout + completed.stderr)
        results.append({'command': command, 'exitCode': completed.returncode, 'elapsedSeconds': round(time.monotonic()-started, 3)})
        print(f'{number}/{len(commands)} ' + ('PASS ' if completed.returncode == 0 else 'FAIL ') + ' '.join(command), flush=True)
        if completed.returncode: break
    result = {'source': str(source), 'reviewSha256': p.digest(review.read_bytes()), 'suiteSha256': p.digest(suite.read_bytes()),
              'sourceFiles': len(index['included']), 'commands': results, 'passed': sum(item['exitCode'] == 0 for item in results),
              'expectedCommands': len(commands), 'nodeModulesReused': True, 'freshDependencyInstallVerified': False,
              'gitHistoryAvailable': False, 'fullTestSuiteRequested': full_tests,
              'productionDeployed': False, 'liveRequestsMade': False}
    (destination / 'recovery-results.json').write_text(json.dumps(result, indent=2)+'\n')
    assert result['passed'] == len(commands), 'Recovery check failed; see per-command evidence'
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--review', type=Path, required=True)
    parser.add_argument('--suite', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    parser.add_argument('--node-modules', type=Path, required=True)
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--full-tests', action='store_true')
    args = parser.parse_args()
    print(json.dumps(run(args.review.resolve(), args.suite.resolve(), args.destination.resolve(), args.node_modules.resolve(), args.preview, args.full_tests), indent=2))
