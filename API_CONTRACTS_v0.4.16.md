# GSiS v0.4.16 API contracts

No API, authentication, permission, storage or write-protocol change. Deploy protocol 415 remains compatible with v0.4.15 backends. See API_CONTRACTS_v0.4.15.md for retained behavior.

Showcase and graphics settings operate locally in the Layout-owned 3D model. `GSIS.showcase` exposes start, pause and state for inspection; `GSIS.setVisualQuality` switches Balanced/Lighter. The local preference uses `gsis-visual-quality`. No tour endpoint, allocation save or school-data write is introduced. Existing model/venue lookup schema and geometry revision remain unchanged.

Q100 and Q103 signature changes are deferred from this release.
