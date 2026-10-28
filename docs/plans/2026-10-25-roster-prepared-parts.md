# Roster prepared timetable parts

Goal: prepare compressed baseline and upcoming suspended content when its owning source is saved, then reuse those bytes in authenticated 31-day preload responses.

The owning immutable model file or operations document contains the optional prepared content. The existing source commit and pending/ready marker therefore remain the single publication boundary. No second mutable head, trigger, setting or Drive write is introduced. Existing gzip/json consumers keep their current contract; capable clients request `gzip-parts-v1` and hydrate complete validated pieces locally. Missing, obsolete or oversized derived pieces fall back to the current authoritative projection. They never certify a stale package.

Implementation steps:

- [x] Test first: save-time preparation, cold read reuse, unchanged writes, authority redaction, pending/source races, corruption and legacy fallback.
- [x] Prepare a compressed model within each new immutable baseline file and read it without repacking.
- [x] Prepare both privileged and confirmed read-only suspended rows within the owning packed operations record, keyed to plan and publication inputs. Reuse matching rows on unrelated writes.
- [x] Add a bounded multipart response and browser decoder preserving existing hydrated payloads, delta keys and atomic IndexedDB promotion.
- [x] Exercise existing batch/source/browser tests and focused failure tests; commit implementation only.

Constraints: no model/operations schema replacement; no contact data or raw operational document in wire responses; no new service bindings; no live deployment; no migration of old saved sources during unrelated writes; compression/storage limits fall back to the established reader. Teacher authority remains checked before parts are selected. Prepared parts are derived acceleration, not another authority.


Verification: prepared source/transport tests pass, including stored checksums and validation proof binding, legacy period mismatch, changed/deleted dates, authority revocation, competing source writes, before/after primary write faults, the12MB primary-document limit, compression failure, old-backend negotiation, and corrupted/missing/oversized browser pieces. Native Chromium hydration and the existing25client,27backend and10worker durability cases pass. Baseline upload, primary Roster domain, STAPLER date authority and save recovery regressions also pass. Full integrated suite verification remains the release integrator’s responsibility.

Prepared STAPLER metadata is capped at2MB of the existing operations document; derived fields are dropped before rejecting a primary save at its existing12MB bound. This trades occasional legacy read fallback for guaranteed primary-data capacity. New baseline entries retain an immutable model-file-bound period digest; old entries check model timing through the original reader. No source/read operation gains permission from a prepared part.
