"""Release gating tests use temporary synthetic roots and never create a real delivery."""
from pathlib import Path
import importlib.util
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import types
import unittest
import zipfile
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('phase2_packager', ROOT / 'scripts/package-099-suite.py')
p = importlib.util.module_from_spec(spec)
spec.loader.exec_module(p)


class BundleLabels(unittest.TestCase):
    def fixture(self, root, label='0.9.9g'):
        subprocess.run(['git', 'init', '-q', str(root)], check=True)
        (root / 'release').mkdir()
        (root / 'release/LAST_BUNDLE_VERSION').write_text('0.9.9f\n')
        (root / 'package.json').write_text(json.dumps({'gsisRelease': '0.9.9', 'gsisBuildLabel': label}))

    def synthetic_package(self, _root, output, _preview, _evidence):
        output.mkdir(parents=True, exist_ok=True)
        p.write_archive(output / 'synthetic-suite.zip', {'test.txt': b'synthetic'}, {'buildLabel': '0.9.9g'})
        return {'sourceCommit': 'a' * 40, 'suite': {'path': str(output / 'synthetic-suite.zip')}}

    def test_concurrent_different_output_dirs_allow_at_most_one_same_label(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root)
            # Independent subprocesses work on Windows as well as POSIX; no fork.
            script = '''import importlib.util,json,sys,time
from pathlib import Path
spec=importlib.util.spec_from_file_location('child_packager',sys.argv[1]);p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
root=Path(sys.argv[2]);first=sys.argv[3]=='output-one'
def create(_root,output,_preview,_evidence):
 if first:(root/'entered').write_text('ready')
 deadline=time.monotonic()+5
 while not (root/'release-transaction').exists():
  if time.monotonic()>deadline:raise RuntimeError('synthetic release timed out')
  time.sleep(.01)
 output.mkdir(parents=True,exist_ok=True);p.write_archive(output/'synthetic-suite.zip',{'test.txt':b'synthetic'},{'buildLabel':'0.9.9g'})
 return {'sourceCommit':'a'*40,'suite':{'path':str(output/'synthetic-suite.zip')}}
p._package=create
if not first:(root/'attempted').write_text('ready')
try:p.package(root,root/sys.argv[3]);print(json.dumps(['success',sys.argv[3]]))
except Exception as error:print(json.dumps(['failure',str(error)]))
'''
            def child(name):
                return subprocess.Popen([sys.executable, '-c', script, str(ROOT / 'scripts/package-099-suite.py'), str(root), name], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            def await_file(name):
                deadline = time.monotonic() + 5
                while not (root / name).exists() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue((root / name).exists(), name)
            first = child('output-one')
            await_file('entered')
            second = child('output-two')
            await_file('attempted')
            try:
                second.wait(timeout=.4)
            except subprocess.TimeoutExpired:
                pass
            (root / 'release-transaction').write_text('ready')
            outcomes = []
            for process in [first, second]:
                stdout, stderr = process.communicate(timeout=5)
                self.assertEqual(process.returncode, 0, stderr)
                outcomes.append(json.loads(stdout))
            self.assertEqual(sum(status == 'success' for status, _ in outcomes), 1, outcomes)
            self.assertTrue(any(status == 'failure' and ('in progress' in message or 'already has a bundle' in message) for status, message in outcomes), outcomes)
            self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9g\n')

    def test_import_build_and_preview_need_no_native_lock_module(self):
        with patch.dict(sys.modules, {'fcntl': None, 'msvcrt': None}):
            fresh_spec = importlib.util.spec_from_file_location('portable_packager', ROOT / 'scripts/package-099-suite.py')
            portable = importlib.util.module_from_spec(fresh_spec)
            fresh_spec.loader.exec_module(portable)
            with tempfile.TemporaryDirectory() as td:
                root = Path(td)
                self.fixture(root, '0.9.9f')
                settings = json.loads((root / 'package.json').read_text())
                settings.update({'gsisPackageKind': 'full-suite', 'gsisComponentVersions': {'synthetic': '0.9.9'}})
                (root / 'package.json').write_text(json.dumps(settings))
                with patch.object(portable.subprocess, 'run'), patch.object(portable, 'installation_files', return_value={'synthetic': b'component'}):
                    self.assertEqual(portable.build(root)['builtProductionComponents'], 1)
                with patch.object(portable, '_package', return_value={'preview': True}):
                    self.assertEqual(portable.package(root, root / 'preview', preview=True), {'preview': True})
                self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9f\n')

    def test_windows_byte_lock_releases_after_failure_and_allows_retry(self):
        events, held = [], False
        def locking(fd, mode, size):
            nonlocal held
            self.assertEqual(os.lseek(fd, 0, os.SEEK_CUR), 0)
            self.assertGreaterEqual(os.fstat(fd).st_size, 1)
            self.assertEqual(size, 1)
            if mode == 1:
                if held:
                    raise OSError('busy')
                held = True
                events.append('lock')
            else:
                self.assertEqual(mode, 2)
                held = False
                events.append('unlock')
        native = types.SimpleNamespace(LK_NBLCK=1, LK_UNLCK=2, locking=locking)
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root)
            with patch.object(sys, 'platform', 'win32'), patch.dict(sys.modules, {'msvcrt': native, 'fcntl': None}):
                with patch.object(p, '_package', side_effect=AssertionError('synthetic failure')):
                    with self.assertRaisesRegex(AssertionError, 'synthetic failure'):
                        p.package(root, root / 'output')
                self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9f\n')
                with patch.object(p, '_package', side_effect=self.synthetic_package):
                    self.assertEqual(p.package(root, root / 'output')['buildLabel'], '0.9.9g')
            self.assertFalse(held)
            self.assertEqual(events, ['lock', 'unlock', 'lock', 'unlock'])

    def test_windows_busy_byte_lock_refuses_without_consuming_label(self):
        def busy(fd, mode, size):
            self.assertEqual(mode, 1)
            self.assertEqual(os.lseek(fd, 0, os.SEEK_CUR), 0)
            self.assertEqual(size, 1)
            raise OSError('busy')
        native = types.SimpleNamespace(LK_NBLCK=1, LK_UNLCK=2, locking=busy)
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root)
            with patch.object(sys, 'platform', 'win32'), patch.dict(sys.modules, {'msvcrt': native, 'fcntl': None}), patch.object(p, '_package', side_effect=self.synthetic_package):
                with self.assertRaisesRegex(AssertionError, 'in progress'):
                    p.package(root, root / 'output')
            self.assertFalse((root / 'output').exists())
            self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9f\n')

    def test_failed_ledger_write_rolls_back_own_output_and_allows_retry(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root)
            replace = Path.replace
            def fail_record(path, target):
                if Path(target).name == 'LAST_BUNDLE_VERSION':
                    raise OSError('synthetic ledger write failure')
                return replace(path, target)
            with patch.object(p, '_package', side_effect=self.synthetic_package):
                with patch.object(Path, 'replace', fail_record):
                    with self.assertRaisesRegex(OSError, 'synthetic ledger'):
                        p.package(root, root / 'output')
                self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9f\n')
                self.assertFalse((root / 'output/GSiS_v0.9.9g').exists(), 'failed transaction must not strand a promoted bundle')
                result = p.package(root, root / 'output')
            self.assertEqual(result['buildLabel'], '0.9.9g')
            self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9g\n')

    def test_final_package_refuses_repeated_label_before_any_outputs(self):
        self.assertTrue(callable(getattr(p, '_package', None)), 'Final bundle wrapper is not implemented')
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root, '0.9.9f')
            with self.assertRaisesRegex(AssertionError, 'already.*bundle|repeated|advance'):
                p.package(root, root / 'output')
            self.assertFalse((root / 'output').exists())
            self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9f\n')

    def test_final_success_names_full_label_and_only_then_records_it(self):
        self.assertTrue(callable(getattr(p, '_package', None)), 'Final bundle wrapper is not implemented')
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root)
            def create(_root, output, _preview, _evidence):
                output.mkdir(parents=True, exist_ok=True)
                p.write_archive(output / 'synthetic-suite.zip', {'test.txt': b'synthetic'}, {'buildLabel': '0.9.9g'})
                self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9f\n', 'unverified work cannot consume a label')
                return {'sourceCommit': 'a' * 40, 'suite': {'path': str(output / 'synthetic-suite.zip')}}
            with patch.object(p, '_package', side_effect=create):
                result = p.package(root, root / 'output')
            folder = root / 'output/GSiS_v0.9.9g'
            self.assertEqual(result['buildLabel'], '0.9.9g')
            self.assertTrue((folder / 'synthetic-suite.zip').is_file())
            self.assertIn('GSiS v0.9.9g', (folder / 'DEPLOY_STEPS.md').read_text())
            self.assertIn('0.9.9g', (folder / 'COMMIT.txt').read_text())
            self.assertIn('a' * 40, (folder / 'COMMIT.txt').read_text())
            self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9g\n')
            with self.assertRaisesRegex(AssertionError, 'already.*bundle|repeated|advance'):
                p.package(root, root / 'another-output')

    def test_failed_packaging_never_consumes_label(self):
        self.assertTrue(callable(getattr(p, '_package', None)), 'Final bundle wrapper is not implemented')
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root)
            with patch.object(p, '_package', side_effect=AssertionError('Synthetic archive verification failure')):
                with self.assertRaisesRegex(AssertionError, 'Synthetic archive'):
                    p.package(root, root / 'output')
            self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9f\n')

    def test_preview_is_repeatable_with_used_label(self):
        self.assertTrue(callable(getattr(p, '_package', None)), 'Final bundle wrapper is not implemented')
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root, '0.9.9f')
            with patch.object(p, '_package', return_value={'preview': True}):
                self.assertEqual(p.package(root, root / 'preview', preview=True), {'preview': True})
                self.assertEqual(p.package(root, root / 'preview', preview=True), {'preview': True})
            self.assertEqual((root / 'release/LAST_BUNDLE_VERSION').read_text(), '0.9.9f\n')

    def test_new_archives_do_not_guess_current_roster_authority(self):
        with tempfile.TemporaryDirectory() as td:
            root, output = Path(td) / 'source', Path(td) / 'output'
            root.mkdir()
            output.mkdir()
            self.fixture(root)
            settings = json.loads((root / 'package.json').read_text())
            keys = {name.lower() + 'Frontend' for name in p.FRONTENDS} | {name.lower() + 'Backend' for name in p.BACKENDS} | {'notificationWorker', 'operationsWorker', 'calendarJobWorker'}
            settings.update({'gsisComponentVersions': dict.fromkeys(keys, '0.9.9'), 'gsisSeparatePackages': [{'name': p.PREPARATION_NAME, 'productionInstallation': False}]})
            (root / 'package.json').write_text(json.dumps(settings))
            (root / 'docs/v099').mkdir(parents=True)
            (root / 'docs/v099/RECOVERY_HISTORY.md').write_text('Synthetic historical baseline')
            (root / 'docs/v099/SOURCE_REVIEW.md').write_text('Synthetic current review guide')
            subprocess.run(['git', 'add', '.'], cwd=root, check=True)
            subprocess.run(['git', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic source'], cwd=root, check=True)
            head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root).decode().strip()
            worker = b'export default {};'
            preparation = {'release': '0.9.9', 'productionInstallation': False, 'productionCutover': False, 'deployed': False, 'mode': 'shadow-only', 'workerName': 'gsis-roster-rehearsal', 'existingBindings': ['REHEARSAL_LEDGER', 'REHEARSAL_TIMETABLES'], 'files': {'worker.mjs': p.digest(worker)}}
            with zipfile.ZipFile(output / p.PREPARATION_NAME, 'w') as z:
                z.writestr('worker.mjs', worker)
                z.writestr('MANIFEST.json', json.dumps(preparation))
            real_run = subprocess.run
            def optional_companion_verify(command, *args, **kwargs):
                if command[:2] == ['python3', 'scripts/verify-timetable-preparation.py']:
                    return subprocess.CompletedProcess(command, 0)
                return real_run(command, *args, **kwargs)
            with patch.object(p, 'BASELINE', head), patch.object(p, 'installation_files', return_value={'Production/synthetic.txt': b'synthetic'}), patch.object(p, 'support_files', return_value={}), patch.object(p.subprocess, 'run', optional_companion_verify):
                result = p._package(root, output, preview=True)
            for kind in ['suite', 'review']:
                metadata = p.verify_archive(Path(result[kind]['path']))
                self.assertEqual(metadata['buildLabel'], '0.9.9g')
                self.assertEqual(metadata['productionAuthorities'], {'roster': 'unchanged configured authority', 'calendar': 'Google', 'deploy': 'unchanged configured authority', 'preparation': 'shadow-only'})

    def test_authority_verifier_preserves_legacy_google_and_rejects_guesses(self):
        verifier_spec = importlib.util.spec_from_file_location('phase2_authority_verifier', ROOT / 'scripts/verify-099-suite.py')
        v = importlib.util.module_from_spec(verifier_spec)
        verifier_spec.loader.exec_module(v)
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root)
            (root / 'docs/v099').mkdir(parents=True)
            (root / 'docs/v099/SOURCE_REVIEW.md').write_text('Synthetic review')
            (root / 'docs/v099/RECOVERY_HISTORY.md').write_text('Synthetic baseline')
            keys = {name.lower() + 'Frontend' for name in p.FRONTENDS} | {name.lower() + 'Backend' for name in p.BACKENDS} | {'notificationWorker', 'operationsWorker', 'calendarJobWorker'}
            for current, roster in [(True, 'unchanged configured authority'), (False, 'Google')]:
                metadata = {'release': '0.9.9', 'sourceCommit': 'a' * 40, 'sourceState': 'working-tree-preview', 'baselineCommit': p.BASELINE, 'baseline': p.BASELINE_LABEL, 'componentVersions': dict.fromkeys(keys, '0.9.9'), 'tag': None, 'productionDeployed': False, 'authorityCutoverPerformed': False, 'productionAuthorities': {'roster': roster, 'calendar': 'Google', 'deploy': 'unchanged configured authority', 'preparation': 'shadow-only'}, 'frontends': list(p.FRONTENDS), 'backends': list(p.BACKENDS), 'optionalWorkers': list(p.WORKERS)}
                if current:
                    metadata['buildLabel'] = '0.9.9g'
                contents = {'SOURCE_INDEX.json': b'{"included":{},"omitted":{}}', 'README_REVIEW.md': b'Synthetic review', 'RECOVERY_HISTORY.md': b'Synthetic baseline'}
                suite, review = root / 'synthetic-suite.zip', root / 'synthetic-review.zip'
                def verify(value):
                    p.write_archive(suite, {}, value)
                    p.write_archive(review, contents, value)
                    return v.verify(suite, review, root, preview=True)
                with patch.object(v, 'verify_source_inventory', side_effect=RuntimeError('passed authority gate')):
                    with self.subTest(current=current), self.assertRaisesRegex(RuntimeError, 'passed authority gate'):
                        verify(metadata)
                    for wrong in ['D1', 'Google' if current else 'unchanged configured authority']:
                        with self.subTest(current=current, wrong=wrong), self.assertRaises(AssertionError):
                            verify({**metadata, 'productionAuthorities': {**metadata['productionAuthorities'], 'roster': wrong}})

    def test_full_label_provenance_requires_exact_source_label_tag_and_commit(self):
        verifier_spec = importlib.util.spec_from_file_location('phase2_verifier', ROOT / 'scripts/verify-099-suite.py')
        v = importlib.util.module_from_spec(verifier_spec)
        verifier_spec.loader.exec_module(v)
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            self.fixture(root)
            run = lambda *args: subprocess.check_output(['git', *args], cwd=root)
            run('init', '-q')
            run('add', '.')
            run('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'synthetic')
            head = run('rev-parse', 'HEAD').decode().strip()
            run('tag', 'v0.9.9g')
            metadata = {'sourceCommit': head, 'sourceState': 'committed', 'buildLabel': '0.9.9g', 'tag': 'v0.9.9g'}
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, 'w') as z:
                z.writestr('CHANGES_FROM_0.9.9_BASELINE.patch', b'')
                z.writestr('RECENT_COMMITS.txt', b'')
            with patch.object(v.p, 'BASELINE', head), zipfile.ZipFile(buffer) as z:
                self.assertEqual(v.verify_source_provenance(root, metadata, z), 'trusted-git-commit-tag-and-parent-diff')
                for updates in [{'buildLabel': '0.9.9e', 'tag': 'v0.9.9e'}, {'tag': 'v0.9.9f'}, {'buildLabel': '../../x', 'tag': 'v../../x'}]:
                    with self.subTest(updates=updates), self.assertRaises(AssertionError):
                        v.verify_source_provenance(root, {**metadata, **updates}, z)
                (root / 'current.js').write_text('new source')
                run('add', '.')
                run('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'another source')
                with self.assertRaisesRegex(AssertionError, 'tag differs'):
                    v.verify_source_provenance(root, {**metadata, 'sourceCommit': run('rev-parse', 'HEAD').decode().strip()}, z)


if __name__ == '__main__':
    unittest.main()
