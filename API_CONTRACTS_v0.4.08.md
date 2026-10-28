# v0.4.08 API and data contracts

Deploy write protocol: **408**. Install matching frontend and backend, then reload. Authentication, Admin/KP permissions, publication checks, field journal and receipt recovery are retained.

## Workload settings

`saveDraft` → `setWorkload` accepts:

```
{operation: "setWorkload", expected, value: {
  categories: {[subject]: "FTT" | "Teaching" | "Non-teaching" | "Unclassified"},
  specialists?: [{subject, pool: "modifier" | "assignment", modifier, demand: "classes" | "groups"}],
  noFTT?: [teacherId]
}}
```

Settings now use a stale-state check; mismatch returns 409 before mutation. Known teacher IDs are required for `noFTT`. Omitted means no explicit exemptions. PD and TTT resolve to canonical non-teaching PD, even when an older saved category says otherwise. PD cannot be a specialist reference. Subject Load itself is not rewritten. TL retains assignment-pool/group-demand semantics. Backend persistence writes changed flattened fields and journal metadata, not a replacement business-data snapshot.

## TG reassociation

`updateTG` retains `{groupId, name, subject, levelWide, assignments, expected}` and accepts `anchorRef` for reconnecting to a form class. When `levelWide: false` follows whole-level scope, `anchorRef` must identify an existing same-level class. The group keeps its ID and subject (unless an explicit remap is requested), takes the class anchor/form/source and its current venue, and updates only that TG's assignment venue references. Empty venue stays empty and class-anchored. Teacher records are untouched.

For a reconnect, `expected` includes canonical TG/assignments plus the selected class's ref, level, form and venue. Concurrent changes reject with 409. Subject remaps still require `assignments: "retain" | "clear"`. Multiple structural edits to a TG remain ordered in the local queue, avoiding incorrect coalescing of detach/move/reattach operations. Exact receipt replay remains idempotent.

## Derived workload

There is no new calculation API and no persisted derived total. Browser-local `GSISWorkload.analyse()` reads the loaded deployment, including drafts:

- PD = two per distinct PLT ID whose member slots contain the teacher; duplicate slots and matched TTT/PD aliases do not duplicate it. Unmatched legacy aliases are flagged and excluded pending matching PLT membership.
- Duty = one per distinct assigned weekday occurrence in each duty record.
- F = highest modal per-level total of configured FTT-category subjects. Missing levels invalidate F. Values within floating-point tolerance are grouped; no class-count weighting.
- S = assigned teaching periods / active eligible teachers + F.
- Teacher FTT target allowance = F, or zero for explicit `noFTT`. Q = allowance + retained fraction × (S − F).
- Green = floor(0.9Q) through ceil(1.1Q), inclusive. Floating-point integer noise is removed only at final boundaries. Actual FTT + teaching and hard caps are not rounded or discounted.
- Class-based specialist demand = applicable form classes plus distinct subject TGs, at level loads. Group-based demand, including TL, counts defined TGs once. Unstaffed groups affect demand, not assigned totals.
- Art + EL retains full Art capacity after offload, with advisory warnings in IP Deploy, Summary and Workload. Other unresolved overlaps retain review treatment.

Contacts APIs and published snapshot semantics are unchanged.
