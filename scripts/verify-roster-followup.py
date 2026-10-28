"""Verify the Roster-only follow-up against the supplied completed release.

Usage: python3 scripts/verify-roster-followup.py OLD_READY.zip NEW_READY.zip
"""
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile
import json
import sys


def members(archive):
    assert archive.testzip() is None, "ZIP CRC failure"
    return {name: archive.read(name) for name in archive.namelist() if not name.endswith("/")}


def verify(old_path, new_path):
    with ZipFile(old_path) as archive:
        old = members(archive)
    with ZipFile(new_path) as archive:
        new = members(archive)
    for line in new["SHA256SUMS.txt"].decode().splitlines():
        digest, name = line.split("  ", 1)
        assert sha256(new[name]).hexdigest() == digest, name
    for app in ["Contacts", "Deploy", "Layout", "Calendar"]:
        name = f"{app}_Frontend_v0.7.01.zip"
        with ZipFile(BytesIO(old[name])) as before, ZipFile(BytesIO(new[name])) as after:
            assert members(before) == members(after), f"Unrelated {app} runtime changed"
    for name in ["Contacts_Backend_v0.7.01.gs", "Calendar_Backend_v0.7.01.gs"]:
        assert old[name] == new[name], name
    for name, value in old.items():
        if name.startswith("notification-worker/"):
            assert new[name] == value, name
    manifest = json.loads(new["vendor-assets-manifest.json"])
    with ZipFile(BytesIO(new["GSiS_v0.7.01_Source.zip"])) as source:
        for asset in manifest["assets"]:
            name = f"{asset['frontend']}_Frontend_v0.7.01.zip"
            with ZipFile(BytesIO(old[name])) as before, ZipFile(BytesIO(new[name])) as after:
                value = after.read(asset["path"])
                assert value == before.read(asset["path"]), asset["path"]
                assert sha256(value).hexdigest() == asset["sha256"], asset["path"]
                assert source.read(asset["sourcePath"]) == value, asset["sourcePath"]
    print(json.dumps({"status": "passed", "untouchedFrontends": 4,
                      "untouchedBackends": 2, "verifiedAssets": len(manifest["assets"]),
                      "archiveBytes": Path(new_path).stat().st_size}))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    verify(sys.argv[1], sys.argv[2])
