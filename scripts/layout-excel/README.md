# Editable layout reference

The compiled browser asset is based on the user-supplied `Layout Example.xlsx`, selected on 29 September 2026. The reference is a formatting source, not a source of current allocations. Its broken formulas, cached allocations and historical footer data are excluded from the export.

The template was imported and edited using `@oai/artifact-tool`. `build-template.mjs` takes the reference workbook and an output path. Run it in a temporary directory using the Codex primary Node runtime and installed artifact-tool dependency. `compile-template.py TEMPLATE.xlsx ../../shared/layout-excel-template.json` packages that authored file and its placement sidecar as browser data. Release builds copy the shared asset to frontend packages.

`design.json` records room ranges aligned to the supplied spatial layout and current campus map. The A-block office and C-block HOD subrooms use distinct reference cells because some original PDF rectangles overlap. The room registry is never modified by export. Unmapped or ambiguous geometry is retained below the map, on the same worksheet. Renamed units resolve through their stable geometry code.

The runtime supplies the displayed snapshot, replaces labels with literal values, derives level colours from that snapshot, expands rows for wrapped labels, and writes a self-contained workbook. Original static room colours and architectural details remain. Export has no backend reads or writes and no import/sync-back capability.
