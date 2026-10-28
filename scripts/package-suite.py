"""Package the verified installation archive with committed source and history."""
from pathlib import Path
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile

root = Path(__file__).resolve().parents[1]
settings = json.loads((root / 'package.json').read_text())
release = settings['gsisRelease']
source_base = settings.get('gsisSourceBase')
full_recovery = settings.get('gsisSourceRecoveryKind') == 'full-reachable-history'
incremental_history = bool(source_base) and not full_recovery
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tag', help='Existing Git tag for the committed source; defaults to the visible release tag')
parser.add_argument('--label', help='Distinct filename label for a correction, such as Correction')
args = parser.parse_args()
tag = args.tag or 'v' + release
if args.label and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,39}', args.label):
    parser.error('--label must contain 1–40 letters, digits, underscores or hyphens and start with a letter or digit')
if tag != 'v' + release and not args.label:
    parser.error('An alternate --tag requires --label to preserve the original suite archive')
subprocess.run(['git', 'check-ref-format', 'refs/tags/' + tag], cwd=root, check=True)
suffix = '_' + args.label if args.label else ''
stem = f'GSiS_v{release}{suffix}'
commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
assert subprocess.check_output(['git', 'rev-parse', '--verify', 'refs/tags/' + tag + '^{commit}'], cwd=root, text=True).strip() == commit, 'Selected tag does not identify HEAD'
assert not subprocess.check_output(['git', 'diff', 'HEAD', '--name-only'], cwd=root, text=True).strip(), 'Commit source changes first'
assert not subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=root, text=True).strip(), 'Commit or remove untracked source before packaging'
component_patch = settings.get('gsisPackageKind') == 'component-patch'
verifier = 'verify-component-patch.py' if component_patch else 'verify-full-package.py'
subprocess.run(['python3', 'scripts/' + verifier], cwd=root, check=True)
deployment = (root.parent / 'deliverables' / f'GSiS_v{release}_Updated_Deployments.zip'
              if component_patch else root / f'GSiS_v{release}_Deployment.zip')
with zipfile.ZipFile(deployment) as archive:
    assert len(archive.namelist()) == len(set(archive.namelist())), 'Duplicate deployment archive entries'
    if component_patch:
        metadata = json.loads(archive.comment)['manifest'] if settings.get('gsisPatchClean') else json.loads(archive.read('PATCH.json'))
    else:
        metadata = json.loads(archive.comment)
    assert metadata['sourceCommit'] == commit and metadata['sourceState'] == 'committed'
destination = root.parent / 'deliverables'
destination.mkdir(exist_ok=True)
output = destination / f'{stem}_Suite.zip'
with tempfile.TemporaryDirectory(prefix='gsis-suite-') as directory:
    staging = Path(directory)
    source = staging / f'{stem}_Source.zip'
    history = staging / (f'{stem}_Source_Changes.bundle' if incremental_history else f'{stem}_Source_History.bundle')
    subprocess.run(['git', 'archive', '--format=zip', '-o', str(source), commit], cwd=root, check=True)
    if incremental_history:
        subprocess.run(['git', 'merge-base', '--is-ancestor', source_base, commit], cwd=root, check=True)
        subprocess.run(['git', 'bundle', 'create', str(history), tag, '^' + source_base], cwd=root, check=True)
    elif full_recovery:
        # Include all ancestors of this release without importing unrelated refs.
        subprocess.run(['git', 'bundle', 'create', str(history), 'HEAD', 'refs/tags/' + tag], cwd=root, check=True)
    else:
        subprocess.run(['git', 'bundle', 'create', str(history), '--all'], cwd=root, check=True)
    subprocess.run(['git', 'bundle', 'verify', str(history)], cwd=root, check=True, capture_output=True)
    files = {path.name: path.read_bytes() for path in (deployment, source, history)}
    separate_packages = metadata.get('separatePackages', [])
    for item in separate_packages:
        preparation = destination / item['name']
        data = preparation.read_bytes()
        assert item['productionInstallation'] is False
        assert hashlib.sha256(data).hexdigest() == item['sha256'], preparation.name
        files[preparation.name] = data
    files['README.md'] = (root / 'README.md').read_bytes()
    setup_guide = None
    if settings.get('gsisPatchSetupGuide'):
        setup_guide = f'SETUP_v{release}.md'
        for name in (setup_guide, f'SETUP_v{release}.html', f'HOTFIX_v{release}.md', f'VALIDATION_v{release}.md'):
            files[name] = (root / name).read_bytes()
    if incremental_history:
        files['SOURCE_RECOVERY.txt'] = (f'The current Source ZIP is the complete authoritative source for v{release}.\n'
            f'The incremental Source_Changes.bundle requires baseline commit {source_base}.\n'
            'Use the Source ZIP directly when that baseline repository is unavailable.\n'
            'Earlier Git history is deliberately excluded because it may contain retired configuration values.\n').encode()
    elif full_recovery:
        files['SOURCE_RECOVERY.txt'] = (f'The Source ZIP is the complete tracked source for v{release}.\n'
            f'The Source_History.bundle contains the reachable history of release commit {commit}.\n'
            f'It includes Git tag {tag} and needs no prerequisite baseline repository.\n'
            'Clone the bundle into an empty directory and verify the tag and commit before recovery.\n'
            'Missing older historical objects are not reconstructed or claimed by this bundle.\n'
            'Source and history files are maintenance material, not Pages uploads.\n').encode()
    files['START_HERE.txt'] = (
        f'GSiS Suite v{release}{" " + args.label if args.label else ""}\nSource commit: {commit}\nGit tag: {tag}\n\n' +
        (f'Read {setup_guide} and HOTFIX_v{release}.md first, then README.md.\n' if setup_guide else 'Read README.md first.\n') +
        f'Extract {deployment.name} and follow its matched installation inventory.\n' +
        ('Included components: ' + ', '.join(metadata.get('components', [])) + '.\n'
         if component_patch else 'Use the archive\'s declared installation inventory.\n') +
        'Preserve existing deployment and data authority settings.\n'
        + ('The optional production Calendar job Worker and its schema/settings guide are also included.\n'
           'Keep direct Calendar mode until its dedicated D1, Worker, cron and service binding are configured.\n'
           if 'calendarJobWorker' in settings.get('gsisPatchComponents', []) else '') +
        'For a component patch, use Operations only where already deployed; do not activate infrastructure.\n'
        + (''.join(f'Keep {item["name"]} separate. It is an optional admin rehearsal, not part of production installation.\n'
                   'Extract it separately and read REHEARSAL_SETUP.md before creating its isolated resources.\n'
                   for item in separate_packages)) +
        'Save existing values in Apps Script Properties\n'
        'and Cloudflare Pages bindings before saving or uploading the clean runtime code.\n'
        'Keep the private settings ledger outside source and deployment archives.\n'
        'Preserve existing data IDs, secrets, booking peppers, URLs and sole-writer ownership.\n'
        'The Source ZIP and Git bundle are for maintenance and recovery, not Pages uploads.\n'
        'Keep existing Venues Apps Script source connections and Roster coordination settings.\n'
        'No live deployment, publication, production setting change or message send was performed.\n'
    ).encode()
    files['SHA256SUMS.txt'] = ''.join(hashlib.sha256(data).hexdigest() + '  ' + name + '\n'
        for name, data in sorted(files.items())).encode()
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
        archive.comment = json.dumps({'version': release, 'sourceCommit': commit, 'tag': tag, 'packageLabel': args.label,
            'productionDeployed': False, 'sourceBase': source_base, 'historyKind': 'incremental' if incremental_history else 'full',
            'separatePackages': separate_packages}).encode()
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
print(json.dumps({'path': str(output), 'bytes': output.stat().st_size, 'commit': commit, 'tag': tag}))
