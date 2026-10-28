# Recovering the v0.9.1c source patch

This patch builds on f8cbb01d85d50de18939ddcb4f12eb560e5b6942, tag v0.9.1b. Recover that baseline from the existing full suite and its incremental patches first.

PATCH.json records the exact v0.9.1c source commit and its three deployment components. SOURCE.patch contains the complete difference from the baseline. GSiS_v0.9.1c_Incremental.bundle contains the new commits and annotated tag. Verify its prerequisite, archive hashes and source parity before integrating it into a clean isolated branch.

The source includes the reviewed Venues design; it does not include Venues runtime. The product backlog remains outside Git. No remote push or deployment is implied.
