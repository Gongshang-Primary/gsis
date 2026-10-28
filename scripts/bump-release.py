"""Synchronize current product labels; leave historical releases and fixtures intact.

Run after feature edits, before build-release.py. Repeating the same command is safe.
"""
from pathlib import Path
import argparse
import json
import re
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("version", help="Suite label, for example 0.6.09")
parser.add_argument("--from-version", required=True, help="Previous suite label")
parser.add_argument("--from-component-version", action="append", default=[],
                    help="Additional component patch label to normalise, for example 0.7.14a")
args = parser.parse_args()
for value in (args.version, args.from_version):
    if not re.fullmatch(r"\d+\.\d+(?:\.\d+)?", value):
        parser.error("Suite versions must contain two or three numeric components")
for value in args.from_component_version:
    if not re.fullmatch(re.escape(args.from_version) + r"[a-z]+", value):
        parser.error("Component versions must extend the previous suite label with a letter suffix")

package_path = root / "package.json"
package = json.loads(package_path.read_text())
if package["gsisRelease"] not in (args.from_version, args.version, *args.from_component_version):
    parser.error("package.json does not match the requested release transition")

runtime = [
    "Contacts_Code.gs", "backend/Code.gs", "backend/Roster.gs",
    "public/edge-deploy-runtime.js", "public/edge-setup.js", "public/edge-setup.html",
    "roster-update/public/edge-setup.js", "roster-update/public/edge-setup.html", "roster-update/public/edge-roster.js",
    "calendar-backend/Code.gs", "calendar-update/public/app.js",
    "layout-update/public/landmark.html", "roster-update/public/external.html",
    "venues-backend/Code.gs", "shared/venues.js", "venues-backend/Domain.gs",
]
for folder in ("public", "contacts-update/public", "layout-update/public",
               "roster-update/public", "calendar-update/public", "venues-viewport/public"):
    runtime.extend((folder + "/index.html", folder + "/_worker.js"))

# These tests exercise the current client handshake/diagnostics. Other versioned
# fixture names describe their regression's origin and must not be rewritten.
current_test_pins = [
    "tests/calendar608-publication-ui.cjs",
    "tests/roster607-diagnostics.cjs",
    "tests/roster608-diagnostic-detail.cjs",
]
changed = []
labels = sorted([args.from_version, *args.from_component_version], key=len, reverse=True)
label_pattern = re.compile(r"(?<![\d.])(?:" + "|".join(map(re.escape, labels)) + r")(?![\d.a-z])")
for relative in runtime + current_test_pins:
    path = root / relative
    if not path.exists():
        continue
    original = path.read_text()
    updated = label_pattern.sub(args.version, original)
    if updated != original:
        path.write_text(updated)
        changed.append(relative)

numeric_parts = [str(int(part)) for part in args.version.split(".")]
package["version"] = ".".join(numeric_parts + ["0"] * (3 - len(numeric_parts)))
package["gsisRelease"] = args.version
package["gsisBaseline"] = args.from_version
if "gsisComponentVersions" in package:
    package["gsisComponentVersions"] = {
        component: args.version for component in package["gsisComponentVersions"]
    }
for path, value in ((package_path, package),):
    updated = json.dumps(value, indent=2) + "\n"
    if path.read_text() != updated:
        path.write_text(updated)
        changed.append(str(path.relative_to(root)))
lock_path = root / "package-lock.json"
lock = json.loads(lock_path.read_text())
lock["version"] = package["version"]
lock["packages"][""]["version"] = package["version"]
updated = json.dumps(lock, indent=2) + "\n"
if lock_path.read_text() != updated:
    lock_path.write_text(updated)
    changed.append("package-lock.json")

lord_bump = root / 'lord-suite/tools/bump_suite_version.py'
if lord_bump.exists():
    subprocess.run([sys.executable, str(lord_bump), args.version], cwd=root, check=True)

print("Synchronized suite " + args.version + ": " + str(len(changed)) + " files")
for relative in changed:
    print(relative)
