# GSiS-wide secret audit — 7 Nov 2026

Question: can every service secret be reduced to one `GSIS_SECRET`?
Method: repo-wide search of every `*_SECRET` read in Apps Script backends, Pages/Workers, and shared JS. Only names and read sites are recorded here; no values.

## 1. Inventory — transport secrets (server-to-server HMAC)

| Secret | Used for | Read by | Fallback |
|---|---|---|---|
| `GSIS_SECRET` | Shared transport secret, preferred everywhere | All Workers (`env`) and all backends (Script Properties) via `gsisApiSecret(legacy)` | — (it is the fallback target) |
| `BRIDGE_SECRET` | Roster/Deploy/Contacts entry: browser → Worker → backend | Workers via `gsisApiSecret(env,'BRIDGE_SECRET')`; backends via `gsisApiSecret_('BRIDGE_SECRET')` | GSIS_SECRET wins when set on that side |
| `ROSTER_SERVICE_SECRET` | Notification Worker → Deploy backend `rosterService`; Roster backend → Contacts `rosterServiceDirectory` | Both sides via `gsisApiSecret` | GSIS_SECRET wins when set |
| `CALENDAR_PROXY_SECRET` | Calendar Pages Worker ↔ Calendar backend; Calendar job Worker ↔ Calendar backend | Both sides via `gsisApiSecret` | GSIS_SECRET wins when set |
| `CALENDAR_SERVICE_SECRET` | Calendar sync wake (`gsis-calendar-sync-wake-v1`) | Both sides via `gsisApiSecret` | GSIS_SECRET wins when set |
| `CONTACTS_BRIDGE_SECRET` | Deploy/Roster/Calendar backends → Contacts backend | Callers via `gsisApiSecret` | GSIS_SECRET wins when set |
| `VENUES_BRIDGE_SECRET` | Venues source (Worker ↔ Venues/Calendar/Contacts backends) | **Mixed.** Workers read it via `gsisApiSecret` (GSIS_SECRET-first); Apps Script backends read it **directly** (`VenuesBridge.gs`, `Contacts_Code.gs:1373`, `backend/Code.gs:10007`, `calendar-backend`) with no GSIS_SECRET fallback | Inconsistent — trap |
| `LORD_BRIDGE_SECRET` | LORD source (Roster/Deploy/Contacts backends → LORD) | Read **directly** everywhere, no GSIS_SECRET fallback | None — trap |
| `DEPLOY_BRIDGE_SECRET` | Contacts backend → Deploy backend | Read **directly** (`Contacts_Code.gs:403`), no fallback | None — trap |
| `DEPLOY_EDGE_SECRET` | Deploy edge authority | Mixed: `gsisApiSecret_('DEPLOY_EDGE_SECRET')` in `backend/Code.gs:10714`, direct read in `backend/DeployEdge.gs:15` | Inconsistent — trap |
| `GSIS_BACKEND_SECRET` | Private backend-gateway credential (notification/operations Workers, `shared/backend-service.js`) | Read via `gsisApiSecret(env,'GSIS_BACKEND_SECRET')` | GSIS_SECRET wins when set |

Notes:
- `GSIS_API_SECRET` in the search results is only the `/* GSIS_API_SECRET_BEGIN */` marker comment around the shared helper, not a secret.
- The calendar-job-worker and lord-job-worker already **require** `GSIS_SECRET` (lord-job-worker refuses to run without it; calendar-job-worker uses it when set, else `CALENDAR_PROXY_SECRET`).

## 2. Secrets that must NOT become GSIS_SECRET

| Secret | Why it stays separate |
|---|---|
| `CALENDAR_SESSION_SECRET` | Signs Calendar session cookies. If the transport secret could forge sessions, anyone holding it can impersonate any user. Keep separate, or derive with a purpose string. |
| Browser session keys (`BRIDGE_SECRET + '\|gsis-browser-session-v1\|' + origin`) | Roster and Contacts Workers derive the session key from `BRIDGE_SECRET` directly (`roster-update/public/_worker.js:389`, `contacts-update/public/_worker.js:66`). After consolidation these derivations must move to `GSIS_SECRET` with the same purpose separator — the derivation, not the raw secret, is what isolates sessions. Note the current trap: transport already honours `GSIS_SECRET`, but sessions still require `BRIDGE_SECRET` to exist. |
| `EXTERNAL_LINK_SECRET` + `EXTERNAL_LINK_PREVIOUS_SECRET` | Signs private relief links, kept as a rotation pair. Collapsing to `GSIS_SECRET` would invalidate every outstanding link. |
| `WHATSAPP_APP_SECRET` | Meta's app secret for WhatsApp. Third-party; cannot be replaced. |

## 3. The traps (why Contacts broke)

1. **Precedence trap (Contacts, live 7 Nov):** both sides prefer `GSIS_SECRET` when set, else `BRIDGE_SECRET`. If `GSIS_SECRET` exists on one side only, or with different values, the two sides silently use different secrets and every signed call fails with 401 `Invalid service signature`. No rotation is needed to trigger it — adding the variable on one side during a deploy is enough.
2. **Mixed fallback (Venues, LORD, Deploy bridge, Deploy edge):** some readers honour `GSIS_SECRET`, others read the legacy name directly. Setting `GSIS_SECRET` flips only half of a call pair.
3. **Session/transport split:** transport honours `GSIS_SECRET`, but Roster/Contacts session keys are derived from `BRIDGE_SECRET` directly. A deploy that drops `BRIDGE_SECRET` in favour of `GSIS_SECRET` breaks sign-in even while API calls work.
4. **Two workers already require `GSIS_SECRET`:** lord-job-worker and calendar-job-worker refuse to run (or fall back) without it, while the backends they call still accept legacy names.

## 4. Consolidation plan — transport secrets → GSIS_SECRET

Scope: the 11 transport secrets in §1. Every `gsisApiSecret(legacy)` call and every direct legacy read in a transport path becomes a single `GSIS_SECRET` read. No per-service transport secret names remain in code.

What it does and does not fix:
- It removes the precedence trap and the mixed-fallback traps: there is one name, so there is nothing to disagree about.
- It does **not** remove the need for values to match: the Worker's `GSIS_SECRET` and its backend's `GSIS_SECRET` must still hold the same value in each pair (Cloudflare env ↔ Apps Script Script Properties). One name, same value on both ends of each call.
- Session keys, link secrets and the WhatsApp secret stay as §2 (session derivations move to `GSIS_SECRET` with their purpose separators intact).

Rollout:
1. **First, fix the live Contacts outage by config** (align the Contacts secrets; do not wait for this change).
2. Code change as a PR series (one app per PR: Contacts, Calendar, Roster/Deploy, Venues, LORD), each with: the secret reads replaced, the session derivations moved, tests proving a legacy name is no longer read in transport code, canonical build with no diff, full CI green, exact-head review.
3. Config change per app at deploy time: set `GSIS_SECRET` to the same value in the Worker's env and the backend's Script Properties; remove the legacy transport names only after the new code is live on both ends of that pair.
4. Verification: a CI test that fails if any transport code reads a legacy `*_SECRET` name (excluding §2 and the session derivations).

Effort: substantial and cross-cutting — touches live auth on every app. Per the owner's work-split rule this is Codex-codes / Muse-reviews work, with a task record first and the owner's go-ahead before coding.
