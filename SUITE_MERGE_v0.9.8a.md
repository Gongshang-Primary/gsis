# Source provenance

Deployment baseline: v0.9.8 recovery. This patch ships only Roster_Frontend_v0.9.8a.zip.

SOURCE.patch is cumulative from committed v0.9.7 source 319337e5aa060932a91d3fa7930f3eb0a55b458c. It includes the prepared v0.9.8 recovery work and this frontend change. Apply it to that source commit, not to an already patched working tree. No v0.9.8a source commit or production deployment is implied.

Build with python3 scripts/build-component-patch.py. Verify with python3 scripts/verify-component-patch.py. Focused test evidence is in VALIDATION.md.
