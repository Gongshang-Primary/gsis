# Calendar bundle check (optional, read-only)

Before deploying Calendar row 9, check that the backend, frontend and
job Worker in a bundle folder come from the same build:

```
node scripts/check-calendar-bundle.mjs <bundle-folder>
```

`<bundle-folder>` is the `calendar-row9-together` folder of a deploy
bundle, or its parent `deploy-bundle` folder. It prints, for each
piece, its product version and SHA-256, the protocol markers the
frontend and Worker expect from the backend, and then `MATCH` or
`MISMATCH` with the reason. Exit code is 0 for MATCH, 1 for MISMATCH,
2 for a usage error.

This is an optional check only. It is not wired into any release
build script and it does not block a release. It never contacts
Google, Cloudflare or any network, and it never edits files.

Product version is `0.9.9` in all three pieces of the
`deploy/2026-11-03-v0.9.9i` bundle. The `0.9.9i` label is a deploy
iteration (package.json `gsisBuildLabel`, bundle `LABEL.txt`, frontend
release label), not a different product version, so it does not by
itself make a bundle a mismatch.
