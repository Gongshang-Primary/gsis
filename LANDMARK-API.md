# Landmark integration

All routes use authenticated same-origin POST requests through Deploy’s Cloudflare gateway. They accept the HttpOnly browser session, or a server-verified Google bearer credential; public query-string URLs do not bypass sign-in.

| Route | Input | Output |
| --- | --- | --- |
| `/api/landmark/search` | `{ "query": "1P" }` | Current active version ID/revision and matching classes/TGs with venue unit numbers; an empty list means unassigned. |
| `/api/landmark/unit` | `{ "versionId": "…", "unitNumber": "F1-16", "activeOnly": true }` | Schema 2, model 1.1.0, one venue, registry revision and that unit’s current allocations. |
| `/api/landmark/unit` | Same, omit `activeOnly` | Selected-version lookup; non-active versions require KP or Admin. |

The built-in 3D view always uses active-only search and unit lookups. A version change between search and selection produces a review/retry response instead of stale allocation data. Empty venue allocations are valid. Unknown capacity is null, not zero.

`setupLandmarkDeploy` configures the existing venue register `1rea9YQxeEHqCORQz-lzaS8puIr6Dt24fsu6CkyyeHwc`, tab `Venues`, and validates its eight value-only columns. **Versions → Refresh venue metadata** snapshots that register into the selected deployment version. The registry hash ignores row order. It does not change existing allocations or create geometry. It adds newly approved units to the available venue list, and imports aliases recorded by the unit-renaming workflow. Existing links to older unit codes remain for planner review.

The viewer lives at `/landmark.html` as a unit-only model. The host supplies `GSIS_LANDMARK.connect({lookupUnit, versionId})`; it never passes the session cookie into the iframe. `selectUnit`, `setVersion`, `refreshUnit`, and `disconnect` follow the supplied v1.1 adapter. Unit selection returns events to the host. Superseded unit requests are aborted/ignored. Sign-out disconnects the viewer and clears displayed data.

The original HTML model is approximate and includes extra glass for visualization. Its geometry cannot establish exact physical locations for unlocated units. D1-06B’s old duplicated Pump Room record is presented as D1-06C for lookup only; ambiguous allocation references fail explicitly. No destructive identifier migration is performed.

## Standalone public Layout gateway

The new Layout Pages project uses the same Deploy Apps Script backend. Its public `GET /api/public/campus` route exposes only the currently active version’s unit metadata and class/TG location links. It does not accept a version selector. It permits cross-origin public reads; private routes do not. The response is not cached by the gateway.

```json
{
  "ok": true,
  "data": {
    "schemaVersion": 2,
    "modelVersion": "1.1.0",
    "deploymentVersionId": "active-version-id",
    "deploymentRevision": 12,
    "registryRevision": "sha256:...",
    "venues": [{
      "unitNumber": "F1-99", "geometryUnit": "F1-16",
      "name": "Classroom", "shortName": "", "block": "F", "level": 1,
      "capacity": null, "allocations": []
    }],
    "classes": [{"id":"1P","level":"1","name":"Perseverance","shortName":"P","units":[]}],
    "groups": []
  }
}
```

`geometryUnit` binds a current unit label to the original model room. Public venue data omits registry notes and capacity rationale, in addition to all teacher/Contacts/private deployment information. Group data contains only ID, name, subject, level and unit numbers. Empty `units` means unassigned, not missing data. No active version produces empty collections.

`POST /api/profile` checks the signed-in user’s current application roles. `POST /api/unit/rename` requires Admin or KP, a same-origin request, an unexpired identity/session and a unique request ID. Inputs: `requestId`, `versionId`, `unitNumber`, `newUnitNumber`, `expectedRevision`, `expectedRegistryRevision`. It validates the active revision and unique unit number before writing. The register’s Unit number/Block/Level fields change; other fields are preserved. Current class/TG venue links are cleared; assignments remain. Planning versions are untouched.

A durable intent record in the active deployment precedes writes to the register. Each write is idempotent; retrying the same request resumes it. Unexpected edits to the register row or headers stop recovery for review. The privileged profile returns a pending request for resumption after browser closure. Public campus reads return a retryable error during an incomplete rename; other Deploy mutations pause. The source register should be edited only through this workflow during a pending rename.

The 3D adapter adds `setUnits(venues)` to apply `geometryUnit` bindings before `connect`. It rebuilds labels without accumulating old label elements. Model coordinates remain the supplied approximation; unlocated units stay unlocated.
