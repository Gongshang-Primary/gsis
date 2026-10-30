"""Keep the display build label separate from stored schemas and protocol versions."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
LABEL = re.compile(r"\d+\.\d+\.\d+[a-z]")
LEDGER = "release/LAST_BUNDLE_VERSION"

def current_label(root=ROOT):
    metadata = json.loads((root / "package.json").read_text())
    label = metadata.get("gsisBuildLabel", metadata["gsisRelease"])
    assert re.fullmatch(re.escape(metadata["gsisRelease"]) + r"[a-z]?", label), "Invalid gsisBuildLabel"
    return label

def write_changed(path, text):
    if path.exists() and path.read_text() == text:
        return
    path.write_text(text)

def stamp(root=ROOT):
    label = current_label(root)
    spec = json.loads((root / "release-installation-manifest.json").read_text())
    notice = (root / "shared/release-notice.js").read_text()
    for folder in spec["frontends"].values():
        directory = root / folder
        write_changed(directory / "gsis-version.js", notice)
        for page in sorted(directory.rglob("*.html")):
            text = page.read_text()
            text = re.sub(r'<meta name="gsis-build-label" content="[^"]*">', "", text)
            text = re.sub(r'<script src="[^"]*gsis-version\.js[^"]*"></script>', "", text)
            text = re.sub(r"(<head\b[^>]*>)", lambda m: m[1] + '<meta name="gsis-build-label" content="' + label + '">', text, count=1, flags=re.I)
            tag = '<script src="/gsis-version.js?v=' + label + '"></script>'
            if page.name == "external.html":
                text = re.sub(r'''(<link\b[^>]*rel=["']stylesheet["'][^>]*>)''', lambda m: tag + m[1], text, count=1)
            else:
                end = "</body>" if page.name == "landmark.html" else "</head>"
                text = text.replace(end, tag + end, 1)
            write_changed(page, text)
    backend = "/* GSIS_BUILD_LABEL_BEGIN */\nvar GSIS_BUILD_LABEL = " + json.dumps(label) + ";\nfunction gsisBuildLabelPayload_(value){return value&&typeof value==='object'&&!Array.isArray(value)?Object.assign({},value,{buildLabel:GSIS_BUILD_LABEL}):value;}\n/* GSIS_BUILD_LABEL_END */"
    for name in ["backend/Code.gs", "Contacts_Code.gs", "calendar-backend/Code.gs", "venues-backend/Code.gs", "lord-suite/Source/backend/Code.gs"]:
        path = root / name
        text = path.read_text()
        pattern = r"/\* GSIS_BUILD_LABEL_BEGIN \*/[\s\S]*?/\* GSIS_BUILD_LABEL_END \*/"
        assert len(re.findall(pattern, text)) <= 1, "Duplicate build label"
        write_changed(path, re.sub(pattern, lambda _: backend, text) if re.search(pattern, text) else text.rstrip() + "\n" + backend + "\n")
    worker = "/* GSIS_BUILD_LABEL_BEGIN */\nconst GSIS_BUILD_LABEL = " + json.dumps(label) + ";\n/* GSIS_BUILD_LABEL_END */"
    for name in ["notification-worker/index.js", "operations-worker/index.js", "calendar-job-worker/worker.mjs"]:
        path = root / name
        text = path.read_text()
        pattern = r"/\* GSIS_BUILD_LABEL_BEGIN \*/[\s\S]*?/\* GSIS_BUILD_LABEL_END \*/"
        write_changed(path, re.sub(pattern, lambda _: worker, text) if re.search(pattern, text) else text.rstrip() + "\n" + worker + "\n")
    return label

def check_bundle_label(root, label):
    assert LABEL.fullmatch(label), "Final bundles need a release letter"
    previous = (root / LEDGER).read_text().strip()
    assert LABEL.fullmatch(previous), 'Invalid prior bundle label; restore the ledger'
    assert previous != label, "This bundle label was already used; advance gsisBuildLabel"
    assert not previous.endswith("z"), "After z, ask the owner for the next release"
    if LABEL.fullmatch(previous) and previous[:-1] == label[:-1]:
        assert ord(label[-1]) == ord(previous[-1]) + 1, "Advance the bundle letter by one"
    else:
        assert label.endswith("b"), "Start a new bundle series at b"

def record_bundle_label(root, label):
    check_bundle_label(root, label)
    path = root / LEDGER
    temporary = path.with_suffix(".tmp")
    temporary.write_text(label + "\n")
    temporary.replace(path)

if __name__ == "__main__":
    print(stamp())
