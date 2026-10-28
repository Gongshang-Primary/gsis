# Source recovery and next full suite

Base commit: `664462ff520cdb8d7f4f1c2accc0db405009f0a2` (`v0.9.1`). The committed patch is tagged `v0.9.1a`; its exact commit is recorded in `PATCH.json`.

Retain the existing `GSiS_v0.9.1_Suite.zip` for the full source and history. In a clean repository recovered from that package, fetch the incremental bundle and check out its release tag:

```sh
git bundle verify GSiS_v0.9.1a_Incremental.bundle
git fetch GSiS_v0.9.1a_Incremental.bundle refs/tags/v0.9.1a:refs/tags/v0.9.1a
git switch -c release/v0.9.1a v0.9.1a
```

Alternatively, `SOURCE.patch` contains the binary-capable diff from the exact base. Use it only on that base and retain the bundle to preserve commit history. Do not apply both methods to the same checkout.

The next full GSiS release must retain these LORD source and regression changes, regenerate the first-time templates, harmonise component version labels, and run the complete suite and package gates. The current patch intentionally ships four LORD components only. It preserves all other v0.9.1 application source and runtime versions.
