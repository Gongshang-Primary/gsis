"""Release stamp and final bundle regression checks."""
from pathlib import Path
import runpy
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class ReleaseVersionTests(unittest.TestCase):
    def test_release_helper_is_available(self):
        self.assertTrue((ROOT / 'scripts/release-version.py').is_file(), 'central release stamping is missing')

    def test_comment_history_is_not_a_release_pin(self):
        helper = runpy.run_path(str(ROOT / 'scripts/release-version.py'))
        text = "const V='0.9.9'; /* 0.9.9a history */ // 0.9.9 history\n"
        self.assertEqual(helper['stamp_script'](text, '0.9.9b'), "const V='0.9.9b'; /* 0.9.9a history */ // 0.9.9 history\n")

    def test_header_drift_is_detected(self):
        if not (ROOT / 'scripts/release-version.py').is_file(): self.skipTest('helper not implemented')
        helper = runpy.run_path(str(ROOT / 'scripts/release-version.py'))
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            folder = root / 'public'
            folder.mkdir()
            (folder / 'index.html').write_text('<meta name="gsis-version" content="0.9.9b"><span data-gsis-release>v0.9.9c</span>')
            with self.assertRaisesRegex(AssertionError, 'header'):
                helper['check_frontend'](folder, '0.9.9b')

    def test_installation_copies_name_full_label_but_preserve_shadow_version(self):
        helper = runpy.run_path(str(ROOT / 'scripts/release-version.py'))
        text = b'Roster_Backend_v0.9.9.gs GSiS_Operations_Worker_v0.9.9.txt GSiS_v0.9.9_Timetable_Preparation.zip'
        self.assertEqual(helper['release_document'](text, '0.9.9b'), b'Roster_Backend_v0.9.9b.gs GSiS_Operations_Worker_v0.9.9b.txt GSiS_v0.9.9_Timetable_Preparation.zip')

    def test_final_bundle_ledger_advance_preserves_tagged_source_verification(self):
        import subprocess
        import io
        import zipfile
        v = runpy.run_path(str(ROOT / 'scripts/verify-099-suite.py'))
        p = v['p']
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'release').mkdir()
            (root / 'release/LAST_BUNDLE_VERSION').write_text('0.9.9a\n')
            (root / 'current.js').write_text('current')
            def git(*args):
                return subprocess.check_output(['git', *args], cwd=root).decode().strip()
            git('init', '-q')
            git('add', '.')
            git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')
            head = git('rev-parse', 'HEAD')
            git('tag', 'v' + p.VERSION)
            p.BASELINE = head
            metadata = {'sourceCommit': head, 'sourceState': 'committed', 'tag': 'v' + p.VERSION}
            data = io.BytesIO()
            with zipfile.ZipFile(data, 'w') as z:
                z.writestr('CHANGES_FROM_0.9.9_BASELINE.patch', b'')
                z.writestr('RECENT_COMMITS.txt', b'')
            with zipfile.ZipFile(io.BytesIO(data.getvalue())) as z:
                p.release_labels['record_bundle_version'](root, p.VERSION)
                self.assertEqual(v['verify_source_provenance'](root, metadata, z), 'trusted-git-commit-tag-and-parent-diff')
                self.assertEqual(v['trusted_source_bytes'](root, 'release/LAST_BUNDLE_VERSION', metadata), b'0.9.9a\n')
                self.assertEqual(git('rev-parse', 'HEAD'), head)
                (root / 'current.js').write_text('tampered')
                with self.assertRaises(AssertionError): v['verify_source_provenance'](root, metadata, z)
                (root / 'current.js').write_text('current')
                (root / 'release/LAST_BUNDLE_VERSION').write_text('0.9.9z\n')
                with self.assertRaises(AssertionError): v['verify_source_provenance'](root, metadata, z)

    def test_repeat_and_skipped_letter_are_refused(self):
        if not (ROOT / 'scripts/release-version.py').is_file(): self.skipTest('helper not implemented')
        helper = runpy.run_path(str(ROOT / 'scripts/release-version.py'))
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'release').mkdir()
            record = root / 'release/LAST_BUNDLE_VERSION'
            record.write_text('0.9.9b\n')
            for version in ['0.9.9b', '0.9.9d']:
                with self.assertRaisesRegex(AssertionError, 'bundle'):
                    helper['check_bundle_version'](root, version)
                self.assertEqual(record.read_text(), '0.9.9b\n')
            helper['check_bundle_version'](root, '0.9.9c')
            self.assertEqual(record.read_text(), '0.9.9b\n', 'preflight never advances the record')
            helper['record_bundle_version'](root, '0.9.9c')
            self.assertEqual(record.read_text(), '0.9.9c\n')
            record.write_text('0.9.9z\n')
            with self.assertRaisesRegex(AssertionError, 'owner'):
                helper['check_bundle_version'](root, '0.9.10b')

if __name__ == '__main__': unittest.main()
