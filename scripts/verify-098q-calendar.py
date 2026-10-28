"""Verify Calendar Q deployment bytes, canonical inventory and lean source provenance.

No archive code executes. In a recovered non-Git tree, verify after --build-only;
source completeness is explicitly limited to the supplied manifest.
"""
from pathlib import Path
import argparse
import importlib.util
import json
import zipfile
ROOT = Path(__file__).resolve().parents[1]

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec); spec.loader.exec_module(result); return result
q = module('package098q', ROOT / 'scripts/package-098q-calendar.py')
p = q.p
v = module('verify098p', ROOT / 'scripts/verify-098p-suite.py')


def verify(patch_path, review_path, root, preview=False):
    patch_meta, review_meta = p.verify_archive(patch_path), p.verify_archive(review_path)
    for key in ['release', 'baseline', 'baselineCommit', 'sourceCommit', 'sourceState', 'tag',
                'productionDeployed', 'authorityCutoverPerformed', 'productionAuthorities',
                'componentVersions', 'components', 'separatePreparationRelease']:
        assert patch_meta[key] == review_meta[key], 'Patch/review provenance differs: ' + key
    assert patch_meta['release'] == q.VERSION and patch_meta['baselineCommit'] == q.BASELINE
    assert patch_meta['baseline'] == '0.9.8p' and patch_meta['components'] == q.COMPONENTS
    assert patch_meta['installationFiles'] == q.ARTIFACTS
    assert patch_meta['productionAuthorities'] == p.PRODUCTION_AUTHORITIES
    assert patch_meta['separatePreparationRelease'] == '0.9.8o'
    assert patch_meta['productionDeployed'] is False and patch_meta['authorityCutoverPerformed'] is False
    assert preview or (patch_meta['sourceState'] == 'committed' and patch_meta['tag'] == 'v' + q.VERSION), 'Preview cannot verify as committed'
    settings = json.loads(p.read_required(root, 'package.json')); q.validate_settings(settings)
    assert patch_meta['componentVersions'] == settings['gsisComponentVersions']
    with zipfile.ZipFile(review_path) as review:
        index = json.loads(review.read('SOURCE_INDEX.json'))
        completeness = v.verify_source_inventory(root, index, preview)
        if completeness == 'complete-trusted-git-inventory':
            assert p.git(root, 'rev-parse', 'HEAD').decode().strip() == patch_meta['sourceCommit'], 'Manifest commit differs from trusted checkout'
            if not preview:
                assert not p.git(root, 'status', '--porcelain').strip(), 'Committed release requires clean trusted checkout'
                assert p.git(root, 'rev-parse', 'refs/tags/v' + q.VERSION + '^{commit}').decode().strip() == patch_meta['sourceCommit'], 'Q tag differs from release commit'
            expected_diff = p.git(root, 'diff', '--binary', q.BASELINE, *([] if preview else [patch_meta['sourceCommit']]))
            assert review.read('CHANGES_FROM_0.9.8p.patch') == expected_diff, 'Review diff differs from trusted source'
            changed = p.git(root, 'diff', '--name-only', q.BASELINE, '--', *q.UNCHANGED_RUNTIME_PATHS).decode().splitlines()
            additions = [name for name in index['included'] if name in q.TEST_ONLY_EXCEPTIONS]
            q.validate_unchanged_runtime(changed, additions)
        source_names = {name[7:] for name in review.namelist() if name.startswith('source/')}
        assert source_names == set(index['included']), 'Review source inventory differs'
        assert not set(index['included']) & set(index['omitted']), 'Ambiguous included/omitted source'
        for name, item in index['included'].items():
            data = review.read('source/' + name)
            assert p.digest(data) == item['sha256'] and len(data) == item['bytes'], 'Source index mismatch: ' + name
            assert q.source_exclusion_reason(name) is None, 'Unexpected retained source: ' + name
            assert data == p.read_required(root, name, 'trusted source'), 'Source differs from trusted checkout: ' + name
        for name, item in index['omitted'].items():
            assert q.source_exclusion_reason(name) == item['reason'], 'Unexplained source omission: ' + name
        required = {'package.json', 'package-lock.json', 'scripts/build-release.py', 'scripts/package-098q-calendar.py',
                    'scripts/verify-098q-calendar.py', 'scripts/package-098p-suite.py', 'scripts/verify-098p-suite.py',
                    'tests/release098q-packaging.py', 'tests/release098p-packaging.py', 'docs/v098q/SOURCE_REVIEW.md',
                    'docs/v098o/TIMETABLE_EXPORT_CONTRACT.md', 'docs/v098o/TIMETABLE_PREPARATION_SETUP.html'}
        assert required <= source_names, 'Review lacks verification/build/contract dependencies'
        for folder in ['backend', 'shared', 'tests', 'public', 'calendar-backend', 'calendar-update', 'roster-update',
                       'contacts-update', 'layout-update', 'lord-suite', 'venues-backend', 'venues-viewport',
                       'notification-worker', 'operations-worker', 'calendar-job-worker', 'timetable-prep-worker']:
            assert any(name.startswith(folder + '/') for name in source_names), 'Review misses subsystem: ' + folder
        assert {'CHANGES_FROM_0.9.8p.patch', 'RECENT_COMMITS.txt', 'README_REVIEW.md'} <= set(review.namelist())
    with zipfile.ZipFile(patch_path) as patch:
        actual = {name for name in patch.namelist() if name.endswith(('.gs', '.zip', '.txt'))}
        assert actual == set(q.ARTIFACTS), 'Calendar patch includes missing/unexpected deployment components'
        for name, data in q.installation_files(root).items():
            v.verify_installation_bytes(name, patch.read(name), data, recovered=completeness != 'complete-trusted-git-inventory')
        q.verify_frontend(patch.read(q.ARTIFACTS[0]), root)
        assert patch.read(q.ARTIFACTS[1]) == p.read_required(root, 'calendar-backend/Code.gs'), 'Canonical backend mismatch'
        assert json.loads(patch.read('PATCH.json')) == {key: value for key, value in patch_meta.items() if key not in {'files', 'kind', 'installationFiles'}}, 'PATCH metadata differs'
        reference = json.loads(patch.read('REVIEW_SOURCE.json'))
        assert reference['file'] == review_path.name and reference['sha256'] == p.digest(review_path.read_bytes()), 'Wrong review companion'
        for name in ['SETUP.html', 'SETUP.md', 'Docs/CHANGELOG.md', 'Docs/VALIDATION.md', 'RELEASE_SUMMARY.json']:
            assert name in patch.namelist(), 'Missing current guide/evidence: ' + name
        assert patch.read('SETUP.html') == p.read_required(root, 'SETUP_v' + q.VERSION + '.html')
        assert patch.read('SETUP.md') == p.read_required(root, 'SETUP_v' + q.VERSION + '.md')
    return {'verified': True, 'sourceCommit': patch_meta['sourceCommit'], 'productionComponents': 2,
            'sourceFiles': len(index['included']), 'omittedFiles': len(index['omitted']),
            'sourceCompleteness': completeness, 'otherComponentsRelease': '0.9.8p',
            'separatePreparationRelease': '0.9.8o', 'productionDeployed': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('patch', type=Path); parser.add_argument('review', type=Path)
    parser.add_argument('--source-root', type=Path, default=ROOT); parser.add_argument('--preview', action='store_true')
    args = parser.parse_args()
    print(json.dumps(verify(args.patch.resolve(), args.review.resolve(), args.source_root.resolve(), args.preview), indent=2))
