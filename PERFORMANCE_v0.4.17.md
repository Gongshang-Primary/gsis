# GSiS v0.4.17 performance and resilience

Signature generation uses the supplied 1000 × 200 PNG with no artwork resampling or sharpening. Personal text is drawn directly at final resolution. Fonts and the template are loaded once per page; failures reset the asset promise so the existing preview retry can recover. The template URL changes with this release to avoid stale older artwork. Download is enabled only after successful rendering.

The 19 guide screenshots use lazy loading and reserved source proportions. Wide single-column display and full-size links preserve screenshot readability, while responsive sections avoid guide overflow on narrower screens. Opening or reading the guide performs no backend write.

No server performance, storage, API or camera behavior changes. v0.4.16 instancing, selective shadows, pixel budgets, on-demand rendering and Showcase takeover are retained. Earlier production latency, multi-user recovery and physical Intel/mobile/Apple device checks remain operational follow-ups; no new live performance result is claimed.
