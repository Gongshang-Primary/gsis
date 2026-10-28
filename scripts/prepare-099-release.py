"""Harmonise the explicitly inventoried production labels after source freeze.

Dry-run by default. --apply changes release labels and package metadata only;
canonical build-release.py regenerates derived modules later. Persisted schemas,
cache keys, authorization, authority defaults and preparation contracts remain
owned by their canonical modules. No deployment, migration or live request.
"""
from pathlib import Path
import argparse
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
VERSION = '0.9.9'
BASELINE = '50c977d79c9756dfdbee91f2922f0cd89ab6e903'
FRONTEND_FOLDERS = ['public', 'contacts-update/public', 'layout-update/public',
                    'roster-update/public', 'calendar-update/public', 'venues-viewport/public']
LABEL_FILES = ['Contacts_Code.gs', 'backend/Code.gs', 'backend/Roster.gs',
               'calendar-backend/Code.gs', 'venues-backend/Code.gs',
               'shared/venues.js', 'shared/edge-recovery.js', 'calendar-job-worker/worker.mjs']
FRONTEND_LABEL_FILES = ['index.html', '_worker.js', 'app.js', 'external.html', 'landmark.html',
                        'edge-setup.html', 'edge-setup.js', 'edge-deploy-runtime.js', 'edge-roster.js']
# Only the current P/Q release identifiers are replaced, in explicitly named files.
# Historical module/protocol revisions are deliberately not swept into a new version.
CURRENT_LABEL = re.compile(r'(?<![\d.])0\.9\.8[pq](?![\d.a-z])')


def prepare(root, apply=False):
    paths = {root / name for name in LABEL_FILES}
    for folder in FRONTEND_FOLDERS:
        paths.update(root / folder / name for name in FRONTEND_LABEL_FILES if (root / folder / name).exists())
    changed = []
    for path in sorted(paths):
        before = path.read_text()
        after, substitutions = CURRENT_LABEL.subn(VERSION, before)
        if before != after:
            changed.append({'path': str(path.relative_to(root)), 'releaseLabelSubstitutions': substitutions})
            if apply: path.write_text(after)
    package = json.loads((root / 'package.json').read_text())
    component_versions = {key: VERSION for key in package['gsisComponentVersions']}
    changed_components = ['calendarFrontend', 'calendarBackend', 'calendarJobWorker']
    package.update(version=VERSION, gsisRelease=VERSION, gsisBaseline='0.9.8q',
        gsisPackageKind='full-suite', gsisPackageState='verification-pending',
        releaseScope='Full production suite: stable Calendar views, revision hints, recovery diagnostics and harmonised release labels; Google-first Roster and Calendar; separately versioned shadow timetable preparation',
        gsisSourceBase=BASELINE, gsisPatchSourceBase=BASELINE, gsisPatchBaseline='0.9.8q',
        gsisSourceRecoveryKind='current-source-with-parent-diff', gsisPatchSetupGuide=True,
        gsisComponentVersions=component_versions, gsisPatchComponents=list(component_versions),
        gsisProductionChangedComponents=changed_components,
        gsisVersionHarmonisedComponents=[key for key in component_versions if key not in changed_components],
        gsisOptionalProductionComponents=['operationsWorker', 'calendarJobWorker'],
        gsisSeparatePackages=[{'name': 'GSiS_v0.9.9_Timetable_Preparation.zip',
            'purpose': 'Separately versioned admin-only timetable shadow preparation; preserve existing rehearsal D1/R2 setup and Google production authority',
            'productionInstallation': False}], gsisPatchDocuments={})
    package['scripts'].update({
        'build': 'python3 scripts/package-099-suite.py --build-only',
        'package:suite': 'python3 scripts/package-099-suite.py --evidence-dir verification/v099',
        'test:release': 'python3 scripts/verify-099-suite.py ../deliverables/GSiS_v0.9.9_Full_Suite.zip ../deliverables/GSiS_v0.9.9_Review_Source.zip',
        'test:packaging': 'python3 tests/release098p-packaging.py && python3 tests/release098q-packaging.py && python3 tests/release099-packaging.py',
        'test:recovery': 'python3 scripts/check-099-recovery.py --help'})
    if apply:
        subprocess.run(['python3', 'lord-suite/tools/bump_suite_version.py', VERSION], cwd=root, check=True)
        (root / 'package.json').write_text(json.dumps(package, indent=2)+'\n')
        lock = json.loads((root / 'package-lock.json').read_text())
        lock['version'] = lock['packages']['']['version'] = VERSION
        (root / 'package-lock.json').write_text(json.dumps(lock, indent=2)+'\n')
        manifest = json.loads((root / 'release-installation-manifest.json').read_text())
        manifest['documents'] = [name.replace('docs/v098p/', 'docs/v099/') for name in manifest['documents']]
        manifest['migrations'] = []
        (root / 'release-installation-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
    return {'release': VERSION, 'applied': apply, 'files': changed,
            'productionComponentCount': len(component_versions), 'productionDeployed': False,
            'preparationLabelsOwnedBySeparatePreparationBuilder': True}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    print(json.dumps(prepare(ROOT, args.apply), indent=2))
