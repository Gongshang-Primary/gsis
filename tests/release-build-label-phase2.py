"""Build label ledger and post-package source-integrity checks."""
from pathlib import Path
import io
import runpy
import subprocess
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
h = runpy.run_path(str(ROOT / 'scripts/build-label.py'))

class BuildLabelTests(unittest.TestCase):
    def test_next_letter_only_and_no_preflight_write(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'release').mkdir()
            ledger = root / h['LEDGER']
            ledger.write_text('0.9.9b\n')
            for value in ['0.9.9b', '0.9.9d', '0.9.9']:
                with self.assertRaises(AssertionError): h['check_bundle_label'](root, value)
            h['check_bundle_label'](root, '0.9.9c')
            self.assertEqual(ledger.read_text(), '0.9.9b\n')
            h['record_bundle_label'](root, '0.9.9c')
            self.assertEqual(ledger.read_text(), '0.9.9c\n')
            ledger.write_text('broken\n')
            with self.assertRaisesRegex(AssertionError, 'Invalid prior'): h['check_bundle_label'](root, '0.9.9b')
            ledger.write_text('0.9.9z\n')
            with self.assertRaisesRegex(AssertionError, 'owner'): h['check_bundle_label'](root, '0.9.10b')

    def test_only_expected_ledger_change_allowed_after_final_package(self):
        v = runpy.run_path(str(ROOT / 'scripts/verify-099-suite.py'))
        p = v['p']
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'release').mkdir()
            ledger = root / h['LEDGER']
            ledger.write_text('0.9.9a\n')
            (root / 'current.js').write_text('current')
            def git(*args): return subprocess.check_output(['git', *args], cwd=root).decode().strip()
            git('init', '-q');git('add', '.')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')
            head = git('rev-parse', 'HEAD');git('tag', 'v0.9.9b');p.BASELINE=head
            metadata={'sourceCommit':head,'sourceState':'committed','tag':'v0.9.9b','buildLabel':'0.9.9b'}
            data=io.BytesIO()
            with zipfile.ZipFile(data,'w') as z:
                z.writestr('CHANGES_FROM_0.9.9_BASELINE.patch',b'')
                z.writestr('RECENT_COMMITS.txt',b'')
            with zipfile.ZipFile(io.BytesIO(data.getvalue())) as z:
                h['record_bundle_label'](root,'0.9.9b')
                self.assertEqual(v['verify_source_provenance'](root,metadata,z),'trusted-git-commit-tag-and-parent-diff')
                self.assertEqual(v['trusted_source_bytes'](root,h['LEDGER'],metadata),b'0.9.9a\n')
                (root/'current.js').write_text('changed')
                with self.assertRaises(AssertionError): v['verify_source_provenance'](root,metadata,z)
                (root/'current.js').write_text('current');ledger.write_text('0.9.9z\n')
                with self.assertRaises(AssertionError): v['verify_source_provenance'](root,metadata,z)

if __name__ == '__main__': unittest.main()
