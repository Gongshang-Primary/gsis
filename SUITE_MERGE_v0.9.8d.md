# Incorporate 098d

Install the four deployment components in INSTALL.txt onto the 098c recovery installation. Retain all other component versions and configuration.

Source provenance: recovered the Library 097 source, applied the cumulative 098b source patch and incremental 098c source patch cleanly, then committed that reconstructed baseline as `703d3975e05d64acc512511ae2d09b0942cc900c`. The original 098c commit objects were unavailable. SOURCE.patch is the content delta against this reconstructed 098c baseline; apply with `git apply --check` to a matching tree before applying. The accompanying full source archive is independently recoverable and includes tests, build scripts and release notes.

Do not enable edge authority, run import/cutover scripts, delete queues, replace bindings or introduce a new Operations Worker for this patch. No migration is included.
