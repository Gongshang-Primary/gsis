# GSiS: Gongshang Info System

School operations suite: Roster (absences, relief, Stapler), Calendar, Contacts, Deploy, Layout, LORD/OVERLORD/STARLORD, Venues and supporting Cloudflare Workers.

Baseline: release 0.9.9, as deployed on 28 Oct 2026. The production bundles rebuild byte-identically from this source.

## Build and test
```bash
npm ci
npm run build
TZ=Asia/Singapore npm test
```

## Rules
1. Never commit secrets, `.dev.vars` files or school data exports.
2. No production deploys on school days between 06:00 and the last period.
3. Every change goes through staging before production.

Start with `docs/` (HANDOVER, REQUIREMENTS_STATUS, ROSTER_WORKER_ROADMAP) for history and open work.
