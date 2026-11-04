# Calendar bundle check (optional, read-only)

Before deploying Calendar row 9, check that the backend, frontend and
job Worker in a bundle folder come from the same build:

```
node scripts/check-calendar-bundle.mjs <bundle-folder>
```

`<bundle-folder>` is the `calendar-row9-together` folder of a deploy
bundle, or its parent `deploy-bundle` folder. It prints, for each
piece, its product version, build label (where present) and SHA-256,
the protocol markers the frontend and Worker expect from the backend,
and then `MATCH` or `MISMATCH` with the reason. Exit code is 0 for
MATCH, 1 for MISMATCH, 2 for a usage error.

This is an optional check only. It is not wired into any release
build script and it does not block a release. It never contacts
Google, Cloudflare or any network, and it never edits files.

Important: product version alone cannot prove the same build.
Product version is `0.9.9` in every 0.9.9 build, including 0.9.9f and
0.9.9i. The build identity is the release build label: the frontend
index.html release label and `?v=` asset versions, a backend or
Worker label if the file carries one, and the bundle `LABEL.txt`.
MATCH requires a build-label anchor (LABEL.txt in the folder or its
parent, or a label in another piece) and agreement among every
present build label. A frontend label with no other label to compare
against is a MISMATCH, not a MATCH. If a `SHA256SUMS.txt` is present
in the folder or its parent, each piece's SHA-256 must also match
its entry there. A bare copy of just the three files, without
LABEL.txt or SHA256SUMS.txt, cannot be proven to match and will
report MISMATCH with that reason.

Example that must fail: a v0.9.9i backend and job Worker with a
v0.9.9f frontend zip. Product version is 0.9.9 in all three, but the
frontend release label 0.9.9f does not match the bundle label
0.9.9i, and the frontend zip SHA-256 does not match the 0.9.9i
SHA256SUMS entry. The checker prints MISMATCH with both reasons.
