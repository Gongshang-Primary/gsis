"""Q-specific gates reuse P archive integrity and recovery regression coverage."""
from pathlib import Path
import importlib.util
import io
import json
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def load():
    spec = importlib.util.spec_from_file_location('package098q', ROOT / 'scripts/package-098q-calendar.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

class CalendarPackagingTests(unittest.TestCase):
    def test_only_calendar_pair_changes_component_versions(self):
        p = load()
        settings = json.loads((ROOT / 'package.json').read_text())
        p.validate_settings(settings)
        for component in ['rosterFrontend', 'calendarJobWorker', 'notificationWorker']:
            changed = json.loads(json.dumps(settings))
            changed['gsisComponentVersions'][component] = p.VERSION
            with self.assertRaisesRegex(AssertionError, 'component versions'):
                p.validate_settings(changed)
        settings['gsisPatchComponents'].append('rosterFrontend')
        with self.assertRaisesRegex(AssertionError, 'Calendar pair'):
            p.validate_settings(settings)

    def test_pruning_keeps_parent_current_and_preparation_contract(self):
        p = load()
        for name in ['Calendar_Backend_v0.9.8p.gs', 'Calendar_Backend_v0.9.8q.gs',
                     'Roster_Backend_v0.9.8p.gs', 'docs/v098o/TIMETABLE_EXPORT_CONTRACT.md',
                     'docs/v098o/TIMETABLE_PREPARATION_SETUP.html', 'tests/release098p-packaging.py',
                     'docs/GSiS-v0.9.8p-User-Manual.html']:
            self.assertIsNone(p.source_exclusion_reason(name), name)
        for name in ['Roster_Backend_v0.9.8o.gs', 'docs/GSiS-v0.9.7-User-Manual.html',
                     '.env', 'upload/timetable.json', 'history.bundle', 'older.zip']:
            self.assertIsNotNone(p.source_exclusion_reason(name), name)

    def test_synthetic_fixture_exception_never_allows_lord_runtime_change(self):
        p = load()
        p.validate_unchanged_runtime(['lord-suite/tests/run_gsis_contract_checks.cjs'], ['lord-suite/tests/fixtures/gsis-catalogue-synthetic.json'])
        for name in ['lord-suite/Source/backend/Code.gs', 'lord-suite/Source/lord/_worker.js', 'backend/Roster.gs']:
            with self.assertRaisesRegex(AssertionError, 'another component runtime'):
                p.validate_unchanged_runtime([name], [])
        for name in p.EXCLUDED_LIVE_EVIDENCE:
            self.assertIsNotNone(p.source_exclusion_reason(name))
        self.assertIsNone(p.source_exclusion_reason('lord-suite/tests/fixtures/gsis-catalogue-synthetic.json'))

    def test_frontend_inventory_and_bytes_match_canonical_source(self):
        p = load()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            folder = root / 'calendar-update/public'
            folder.mkdir(parents=True)
            contents = {'index.html': '<b>v0.9.8q</b>', 'app.js': "const FRONTEND_VERSION = '0.9.8q';",
                        '_worker.js': "const WORKER_VERSION = '0.9.8q';", 'styles.css': 'body{}'}
            for name, data in contents.items():
                (folder / name).write_text(data)
            data = p.frontend_bytes(root)
            p.verify_frontend(data, root)
            self.assertEqual(data, p.frontend_bytes(root), 'Build must be deterministic')
            def altered(entries):
                output = io.BytesIO()
                with zipfile.ZipFile(output, 'w') as z:
                    for name, content in entries.items(): z.writestr(name, content)
                return output.getvalue()
            for entries in [dict(contents, **{'styles.css': 'changed'}),
                            {k: v for k, v in contents.items() if k != 'styles.css'},
                            dict(contents, **{'unexpected.js': 'extra'})]:
                with self.assertRaises(AssertionError): p.verify_frontend(altered(entries), root)
            (folder / '.env').write_text('private')
            with self.assertRaisesRegex(AssertionError, 'Private'):
                p.frontend_bytes(root)

    def test_installation_excludes_unrelated_products_and_refuses_backend_drift(self):
        p = load()
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            folder = root / 'calendar-update/public'; folder.mkdir(parents=True)
            for name, data in {'index.html': 'v0.9.8q', 'app.js': "const FRONTEND_VERSION = '0.9.8q';",
                               '_worker.js': "const WORKER_VERSION = '0.9.8q';"}.items(): (folder / name).write_text(data)
            (root / 'calendar-backend').mkdir()
            backend = "const CALV2={RELEASE_VERSION: '0.9.8q'};"
            (root / 'calendar-backend/Code.gs').write_text(backend)
            (root / 'Calendar_Backend_v0.9.8q.gs').write_text(backend)
            (root / 'Calendar_Frontend_v0.9.8q.zip').write_bytes(p.frontend_bytes(root))
            (root / 'Roster_Backend_v0.9.8q.gs').write_text('must never ship')
            self.assertEqual(set(p.installation_files(root)), {'Calendar_Frontend_v0.9.8q.zip', 'Calendar_Backend_v0.9.8q.gs'})
            (root / 'Calendar_Backend_v0.9.8q.gs').write_text(backend + '// drift')
            with self.assertRaisesRegex(AssertionError, 'Backend canonical'):
                p.installation_files(root)

if __name__ == '__main__': unittest.main()
