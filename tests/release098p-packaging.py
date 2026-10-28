"""Behavioral checks for complete installation and deliberately lean source archives."""
from pathlib import Path
import importlib.util
import io
import json
import subprocess
import tempfile
import unittest
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PACKAGER = ROOT / 'scripts/package-098p-suite.py'


def module():
    if not PACKAGER.exists():
        raise AssertionError('Revision P full-suite and lean-source packager is not implemented')
    spec = importlib.util.spec_from_file_location('package098p', PACKAGER)
    item = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(item)
    return item


def verifier():
    spec = importlib.util.spec_from_file_location('verify098p', ROOT / 'scripts/verify-098p-suite.py')
    item = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(item)
    return item


class PackagingTests(unittest.TestCase):
    def test_prunes_duplicate_manuals_but_keeps_runtime_and_contract(self):
        p = module()
        for name in ['docs/GSiS-Deploy-User-Manual-v0.8.5.html',
                     'docs/GSiS-v0.9.7-User-Manual.html',
                     'docs/architecture/GSiS_v0.9.7_Architecture.drawio',
                     'docs/.GSiS-Deploy-User-Manual-v0.7.11.html.vdNEUa',
                     'Roster_Backend_v0.9.8j.gs', 'Deploy_Backend_v0.8.5.gs']:
            self.assertIsNotNone(p.source_exclusion_reason(name))
        for name in ['docs/GSiS-v0.9.8p-User-Manual.html',
                     'docs/architecture/GSiS_v0.9.8p_Architecture.html',
                     'docs/v098o/TIMETABLE_PREPARATION_SETUP.html',
                     'docs/v098o/TIMETABLE_EXPORT_CONTRACT.md',
                     'backend/Code.gs', 'tests/roster098o-timetable-worker.mjs',
                     'Roster_Backend_v0.9.8o.gs', 'Calendar_Backend_v0.9.8p.gs',
                     'notification-worker/.dev.vars.example',
                     'lord-suite/First_Time_Setup/templates/lord/_worker.js',
                     'package-lock.json']:
            self.assertIsNone(p.source_exclusion_reason(name), name)

    def test_private_and_generated_archives_never_enter_review(self):
        p = module()
        for name in ['.env', 'public/.dev.vars', 'docs/token.secret',
                     'GSiS_v0.9.8o_Source_History.bundle', 'old.zip',
                     'node_modules/lib/index.js', 'upload/private-export.json']:
            self.assertIsNotNone(p.source_exclusion_reason(name), name)

    def test_manifest_detects_tamper_unlisted_and_duplicate_files(self):
        p = module()
        with tempfile.TemporaryDirectory() as td:
            archive = Path(td) / 'suite.zip'
            p.write_archive(archive, {'Production/Roster.txt': b'current'}, {'schema': 1})
            self.assertEqual(p.verify_archive(archive)['files']['Production/Roster.txt'], p.digest(b'current'))
            with zipfile.ZipFile(archive, 'a') as z:
                z.writestr('unlisted.txt', b'not in manifest')
            with self.assertRaisesRegex(AssertionError, 'inventory'):
                p.verify_archive(archive)
            p.write_archive(archive, {'Production/Roster.txt': b'current'}, {'schema': 1})
            with zipfile.ZipFile(archive) as z:
                files = {name: z.read(name) for name in z.namelist()}
            files['Production/Roster.txt'] = b'changed'
            with zipfile.ZipFile(archive, 'w') as z:
                for name, data in files.items():
                    z.writestr(name, data)
            with self.assertRaisesRegex(AssertionError, 'Hash'):
                p.verify_archive(archive)
            p.write_archive(archive, {'Production/Roster.txt': b'current'}, {'schema': 1})
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                with zipfile.ZipFile(archive, 'a') as z:
                    z.writestr('Production/Roster.txt', b'current')
            with self.assertRaisesRegex(AssertionError, 'Duplicate'):
                p.verify_archive(archive)

    def test_missing_installation_component_is_refused(self):
        p = module()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with self.assertRaisesRegex(AssertionError, 'Missing installation component'):
                p.installation_files(root)

    def test_source_index_accounts_for_every_file_and_refuses_symlink(self):
        p = module()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / 'backend').mkdir()
            (root / 'docs').mkdir()
            (root / 'backend/Code.gs').write_text('current')
            (root / 'docs/GSiS-v0.9.7-User-Manual.html').write_text('old manual')
            names = ['backend/Code.gs', 'docs/GSiS-v0.9.7-User-Manual.html']
            files, index = p.source_files(root, names)
            self.assertEqual(set(files), {'source/backend/Code.gs'})
            self.assertEqual(set(index['included']) | set(index['omitted']), set(names))
            self.assertEqual(index['included']['backend/Code.gs']['sha256'], p.digest(b'current'))
            (root / 'backend/symlink.gs').symlink_to('/etc/passwd')
            with self.assertRaisesRegex(AssertionError, 'Symlink'):
                p.source_files(root, ['backend/symlink.gs'])

    def test_paths_are_rejected_instead_of_normalized(self):
        p = module()
        for name in ['/absolute', '../outside', 'a/../outside', 'a\\outside', 'a//b', 'a\x00b']:
            with self.assertRaises(AssertionError):
                p.safe_path(name)

    def test_all_eighteen_components_are_present_without_historical_backends(self):
        p = module()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            for app in p.FRONTENDS:
                with zipfile.ZipFile(root / f'{app}_Frontend_v{p.VERSION}.zip', 'w') as z:
                    z.writestr('index.html', '<title>Current frontend</title>')
                    z.writestr('_worker.js', 'export default {fetch(){}};')
            for app in p.BACKENDS:
                (root / f'{app}_Backend_v{p.VERSION}.gs').write_text('current backend')
            for path in p.WORKERS.values():
                (root / path).parent.mkdir(parents=True, exist_ok=True)
                (root / path).write_text('export default {fetch(){}};')
            (root / 'Roster_Backend_v0.9.8j.gs').write_text('old excluded')
            files = p.installation_files(root)
            self.assertEqual(len(files), 18)
            self.assertFalse(any('0.9.8j' in name for name in files))
            (root / 'LORD_Backend_v0.9.8p.gs').unlink()
            with self.assertRaisesRegex(AssertionError, 'Missing installation component'):
                p.installation_files(root)

    def test_rehashed_omission_cannot_hide_missing_source_from_trusted_checkout(self):
        p, v = module(), verifier()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            subprocess.run(['git', 'init', '-q', str(root)], check=True)
            (root / 'important.js').write_text('current logic')
            (root / 'Roster_Backend_v0.9.8j.gs').write_text('old release')
            subprocess.run(['git', 'add', '.'], cwd=root, check=True)
            _, index = p.source_files(root, ['important.js', 'Roster_Backend_v0.9.8j.gs'])
            self.assertEqual(v.verify_source_inventory(root, index, False), 'complete-trusted-git-inventory')
            missing = json.loads(json.dumps(index))
            del missing['included']['important.js']
            with self.assertRaisesRegex(AssertionError, 'trusted Git inventory'):
                v.verify_source_inventory(root, missing, False)
            index['omitted']['Roster_Backend_v0.9.8j.gs']['sha256'] = '0' * 64
            with self.assertRaisesRegex(AssertionError, 'Omitted source index mismatch'):
                v.verify_source_inventory(root, index, False)
        with tempfile.TemporaryDirectory() as td:
            self.assertIn('supplied-manifest-only', v.verify_source_inventory(Path(td), {}, False))

    def test_recovered_frontend_ignores_only_zip_container_metadata(self):
        v = verifier()
        self.assertTrue(callable(getattr(v, 'verify_installation_bytes', None)), 'Recovery must compare installed ZIP entries while retaining strict checkout bytes')
        def packed(year, entries):
            buffer = io.BytesIO()
            with warnings.catch_warnings():
                warnings.simplefilter('ignore', UserWarning)
                with zipfile.ZipFile(buffer, 'w') as archive:
                    for name, content in entries:
                        archive.writestr(zipfile.ZipInfo(name, (year, 10, 28, 0, 0, 0)), content)
            return buffer.getvalue()
        name = 'Production/Contacts_Frontend_v0.9.8p.zip'
        entries = [('index.html', 'current page'), ('_worker.js', 'current Worker')]
        installed, rebuilt = packed(2025, entries), packed(2026, entries)
        self.assertNotEqual(installed, rebuilt, 'Fixture must have different archive bytes')
        v.verify_installation_bytes(name, installed, rebuilt, recovered=True)
        with self.assertRaisesRegex(AssertionError, 'Packaged installation differs'):
            v.verify_installation_bytes(name, installed, rebuilt, recovered=False)
        for changed in [[('index.html', 'changed page'), entries[1]], entries[:-1],
                        entries + [('_worker.js', 'duplicate')], entries + [('../unsafe', 'outside')]]:
            with self.subTest(changed=changed):
                with self.assertRaises(AssertionError):
                    v.verify_installation_bytes(name, installed, packed(2026, changed), recovered=True)
        with self.assertRaisesRegex(AssertionError, 'Packaged installation differs'):
            v.verify_installation_bytes('Production/Contacts_Backend_v0.9.8p.gs', b'current', b'changed', recovered=True)


if __name__ == '__main__':
    unittest.main()
