"""Run the release checks from an extracted package; no historical Git repository needed."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
for manifest in (ROOT/'tests/baselines').glob('*/PROVENANCE.json'):
    for name, expected in json.loads(manifest.read_text())['files'].items():
        assert hashlib.sha256((manifest.parent/name).read_bytes()).hexdigest() == expected, 'Baseline changed: '+name

commands = [[sys.executable, 'tests/run_static_checks.py'], [sys.executable, 'tests/run_setup_checks.py']]
commands += [['node', 'tests/'+name+'.cjs'] for name in [
    'queued-writes', 'run_behavior_checks', 'run_image_checks', 'run_reload_checks', 'run_admin_whatsapp_checks',
    'run_backend_settings_checks', 'gsis098g-shared-secret', 'run_worker_config_checks', 'run_backend_131_checks', 'run_backend_14_checks', 'run_property_policy_checks','run_maintenance_status_checks','gsis098h-background-work','gsis098h-background-ui','run_booking_speed_checks','run_evidence_upload_checks',
    'run_frontend_14_checks', 'run_frontend_141_checks', 'starlord-refresh', 'run_refactor_checks',
    'run_v18_checks','run_v18_frontend_checks','run_school_agreement_checks','run_school_frontend_checks', 'run_v17_checks', 'run_v17_operations', 'review_compatibility', 'run_reload_browser_checks','run_gsis_bridge_checks','gsis098d-sync-contention','run_gsis_contract_checks','gsis-independent-identity-review','gsis-reference-ui-browser','gsis-direct-entry','booking-remarks-return-browser','booking-open-checks','lord-admin-booking-recovery',
]]
env = os.environ.copy()
if env.get('CODEX_PRIMARY_RUNTIME_NODE_MODULES') and not env.get('NODE_PATH'):
    env['NODE_PATH'] = env['CODEX_PRIMARY_RUNTIME_NODE_MODULES']
for command in commands:
    subprocess.run(command, cwd=ROOT, env=env, check=True)
report = {'releaseVersion': json.loads((ROOT.parent/'package.json').read_text())['gsisComponentVersions']['lordBackend'], 'passedPrograms': len(commands), 'failedPrograms': 0, 'commands': commands, 'sourceSha256': {str(p.relative_to(ROOT)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted((ROOT/'Source').rglob('*')) if p.is_file()}}
(ROOT/'tests/all_checks_results.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps({'releaseVersion': report['releaseVersion'], 'passedPrograms': len(commands), 'failedPrograms': 0}))
