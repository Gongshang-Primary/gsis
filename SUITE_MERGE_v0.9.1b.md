# Recovering the v0.9.1b source patch

This component patch builds on commit 306be4b2cfd76dbb6a4555b07703707f5ac0b1da, tag v0.9.1a. The existing full v0.9.1 source plus its v0.9.1a incremental bundle recovers that baseline.

PATCH.json records the exact final v0.9.1b source commit and package scope. GSiS_v0.9.1b_Incremental.bundle includes commits and tag v0.9.1b after the baseline. SOURCE.patch is the complete source difference. Verify the bundle and SHA256SUMS before integrating into a recovered repository.

Use a clean isolated branch based on v0.9.1a to review the patch or fetch its incremental bundle. Preserve local settings and unrelated work; do not force-reset a working installation. The source recovery files are maintainer files and are not Cloudflare Pages uploads.

Only the listed seven deployment components are replaced. The separate product backlog and Venues design are maintained outside this commit/package. No remote push or live deployment is implied.
