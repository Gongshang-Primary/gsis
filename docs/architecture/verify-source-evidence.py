#!/usr/bin/env python3
"""Check pinned local Git source ranges without inventing a hosted origin.

The checks establish byte identity and valid line ranges. Semantic claims still
require source inspection. No source contents, settings values or snippets are
copied into the receipt.
"""
import hashlib
import json
import pathlib
import subprocess

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parent.parent
source = json.loads((HERE / "architecture-source.json").read_text())
model = json.loads((HERE / "architecture.drawio-model.json").read_text())
repository = source["meta"]["repository"]
revision = repository["revision"]


def git(*args):
    return subprocess.check_output(["git", "--no-replace-objects", "-C", str(ROOT), *args])


assert git("rev-parse", f"{revision}^{{commit}}").decode().strip() == revision
assert git("remote", "get-url", "origin").decode().strip() == repository["url"]
assert model["metadata"]["repository"] == repository
records = []
items = [("overview", c["id"], c["label"], c.get("sources", [])) for c in source["components"]]
items += [("drawio", n["id"], n["label"], [n["provenance"]]) for n in model["nodes"]]
for surface, identifier, claim, references in items:
    assert references, identifier
    for ref in references:
        path = pathlib.PurePosixPath(ref["path"])
        assert not path.is_absolute() and ".." not in path.parts
        blob = git("show", f"{revision}:{path}")
        lines = blob.decode().splitlines(keepends=True)
        first, last = ref.get("line", 1), ref.get("end_line", len(lines))
        assert 1 <= first <= last <= len(lines), (identifier, ref, len(lines))
        records.append({
            "surface": surface, "component": identifier, "claim": claim,
            "evidenceKind": "contract-or-inventory" if path.suffix in {".md", ".json"} else "implementation",
            "path": str(path), "line": first, "end_line": last,
            "fileSha256": hashlib.sha256(blob).hexdigest(),
            "rangeSha256": hashlib.sha256("".join(lines[first-1:last]).encode()).hexdigest(),
        })
receipt = {
    "schema": "gsis-architecture-evidence-v1", "ok": True,
    "repository": repository, "sourceRangeChecks": len(records), "sources": records,
    "scope": "Inspected source architecture, not a live configuration inventory.",
    "limitation": "Archify rejects local bundle origins. This separate Git-object check proves byte identity and range validity, not semantic entailment or live behavior.",
}
(HERE / "architecture-evidence.json").write_text(json.dumps(receipt, indent=2) + "\n")
print(json.dumps({"ok": True, "revision": revision, "sourceRangeChecks": len(records)}))
