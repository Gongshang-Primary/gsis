# GSiS v0.3.13

Start with **DEPLOYMENT.md**. Update both Apps Script deployments, then upload each viewport’s frontend ZIP to its existing Cloudflare Pages project.

Use **GSiS_v0.3.13_Source.zip** for maintenance. Edit canonical files, run `python3 scripts/build-release.py`, then `GSIS_TEST_JSDOM=/path/to/jsdom node tests/run.cjs`.

Canonical source: `backend/Code.gs`, `backend/Seed.gs`, `Contacts_Code.gs`, `public/`, `contacts-update/public/`, `layout-update/public/`, and `shared/`. Generated backend files and frontend ZIPs are outputs, not the source of truth.

No live deployment was made while building this package.
