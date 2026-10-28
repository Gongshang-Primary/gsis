"""Harmonise production release labels; preserve the proven O preparation protocol."""
from pathlib import Path
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.9.8p'
BASE = 'edcb6b4c4d43b2d2af7eaa4f2d4f220e2adb7cfc'
folders = ['public', 'contacts-update/public', 'layout-update/public', 'roster-update/public',
           'calendar-update/public', 'venues-viewport/public']
paths = {ROOT / name for name in ['Contacts_Code.gs', 'backend/Code.gs', 'backend/Roster.gs',
    'calendar-backend/Code.gs', 'venues-backend/Code.gs', 'shared/venues.js', 'shared/edge-recovery.js']}
for folder in folders:
    for name in ['index.html', '_worker.js', 'app.js', 'external.html', 'landmark.html',
                 'edge-setup.html', 'edge-setup.js', 'edge-deploy-runtime.js', 'edge-roster.js']:
        if (ROOT / folder / name).exists():
            paths.add(ROOT / folder / name)
pattern = re.compile(r'(?<![\d.])0\.9\.8[jlmno](?![\d.a-z])')
for path in sorted(paths):
    before = path.read_text()
    after = pattern.sub(VERSION, before)
    # This generated protocol block is refreshed from its O-compatible canonical
    # source by build-release.py; do not change the native import contract.
    if path == ROOT / 'backend/Code.gs':
        marker = 'GSIS_ROSTER_TIMETABLE_PREPARATION'
        block = '/* ' + marker + '_BEGIN */\n' + (ROOT / 'backend/RosterTimetablePreparation.gs').read_text() + '\n/* ' + marker + '_END */'
        after = re.sub(r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/', lambda _: block, after)
    if before != after:
        path.write_text(after)
subprocess.run(['python3', 'lord-suite/tools/bump_suite_version.py', VERSION], cwd=ROOT, check=True)
package = json.loads((ROOT / 'package.json').read_text())
package.update(version=VERSION, gsisRelease=VERSION, gsisBaseline='0.9.8o', gsisPackageKind='full-suite',
    releaseScope='Full production suite: strict timetable export boundary and reliable Calendar bulk synchronization; Google Roster/Calendar, unchanged configured Deploy authority',
    gsisPatchBaseline='0.9.8o', gsisPatchSourceBase=BASE, gsisSourceBase=BASE,
    gsisSourceRecoveryKind='current-source-with-parent-diff', gsisPackageState='verification-pending')
package['gsisComponentVersions'] = {key: VERSION for key in package['gsisComponentVersions']}
package['gsisPatchComponents'] = list(package['gsisComponentVersions'])
package['gsisProductionChangedComponents'] = ['rosterFrontend','rosterBackend','calendarFrontend','calendarBackend']
package['gsisVersionHarmonisedComponents'] = [key for key in package['gsisComponentVersions'] if key not in package['gsisProductionChangedComponents']]
package['gsisOptionalProductionComponents'] = ['operationsWorker','calendarJobWorker']
package['gsisPatchDocuments'] = {}
package['scripts']['package:suite'] = 'python3 scripts/package-098p-suite.py --evidence-dir verification/v098p'
package['scripts']['test:release'] = 'python3 scripts/verify-098p-suite.py ../deliverables/GSiS_v0.9.8p_Full_Suite.zip ../deliverables/GSiS_v0.9.8p_Review_Source.zip'
(ROOT / 'package.json').write_text(json.dumps(package, indent=2)+'\n')
lock = json.loads((ROOT / 'package-lock.json').read_text())
lock['version'] = lock['packages']['']['version'] = VERSION
(ROOT / 'package-lock.json').write_text(json.dumps(lock, indent=2)+'\n')
manifest = json.loads((ROOT / 'release-installation-manifest.json').read_text())
manifest['workers']['GSiS_Calendar_Job_Worker_v{version}.txt'] = 'calendar-job-worker/dashboard-worker.txt'
manifest['documents'] = ['README.md', 'docs/architecture/GSiS_v{version}_Architecture.html',
    'docs/GSiS-v{version}-User-Manual.html', 'docs/asc-skill.md', 'docs/WHATSAPP_PARAMETERS.md',
    'docs/v098p/SETUP.html', 'docs/v098p/SETUP.md', 'docs/v098p/CHANGELOG.md',
    'docs/v098p/VALIDATION.md', 'docs/v098p/TIMETABLE_HANDOVER_STATUS.md']
# Operational migrations are retained in source for existing configured systems;
# they are not fresh-install instructions for the restored Google pipeline.
manifest['migrations'] = []
(ROOT / 'release-installation-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Production labels: '+VERSION+'; preparation schema/module remains 0.9.8o.')
