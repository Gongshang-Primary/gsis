// Core central direct-Drive-API backup orchestrator (CENTRAL_GOOGLE_BACKUP_PLAN package 2).
// Real built Workers/D1/R2 with a synthetic in-memory Google Drive. No live Google access.
import assert from "node:assert/strict";
import { productSuite } from "./v1-product/suite.mjs";
import {
  runCentralBackupCycle,
  centralBackupHealth,
  centralFileName,
} from "../v1/services/core/drive-backup-orchestrator.mjs";
import { scheduled as coreScheduled } from "../v1/services/core/service.mjs";

const ROOT = "synthetic-backup-root";
const DRIVE = "synthetic-shared-drive";
const FOLDER = { calendar: "synthetic-calendar-folder", contacts: "synthetic-contacts-folder" };
const TOKEN = "synthetic-central-backup-token";
const DAY = 86400000;

// 1. Default-disabled safety: no switches -> no DB, provider or owner access at all.
{
  const untouched = new Proxy({}, { get() { throw Error("disabled cycle must not touch storage"); } });
  assert.deepEqual(
    await runCentralBackupCycle({ DB: untouched }, Date.now()),
    { enabled: false, state: "disabled", processed: 0, results: [] },
  );
  assert.equal(
    (await runCentralBackupCycle({ DB: untouched, DRIVE_BACKUP_ENABLED: "true" }, Date.now())).state,
    "disabled",
    "the shared backup switch alone does not activate the central writer",
  );
  assert.equal((await coreScheduled({ env: { DB: untouched }, now: Date.now() })).state, "disabled");
  assert.equal(centralFileName("2026-11-16", "contacts", "Staff"), "2026 11Nov 16 — Contacts — Staff.xlsx");
  assert.equal(centralFileName("2026-11-16", "core", "Accounts report"), "2026 11Nov 16 — Core — Accounts report.xlsx");
  assert.throws(() => centralFileName("2026-11-16", "core", "../escape"), /DRIVE_BACKUP_NAME/);
}

function syntheticDrive() {
  const files = new Map();
  const controls = { generateIds: 0, creates: 0, patches: 0, mediaReads: 0, loseNextUploadResponse: false, serial: 0, requests: [] };
  const json = (value, init = {}) => Response.json(value, init);
  async function fetcher(request) {
    const url = new URL(request.url);
    const method = request.method;
    if (url.host !== "www.googleapis.com") throw Error("Unexpected provider host " + url.host);
    assert.equal(request.headers.get("authorization"), "Bearer " + TOKEN);
    controls.requests.push(method + " " + url.pathname);
    if (url.pathname === "/drive/v3/files/generateIds") {
      controls.generateIds++;
      return json({ ids: ["synthetic-file-" + ++controls.serial] });
    }
    if (url.pathname === "/drive/v3/files/" + ROOT)
      return json({ id: ROOT, driveId: DRIVE, mimeType: "application/vnd.google-apps.folder", trashed: false, capabilities: { canAddChildren: true } });
    for (const folder of Object.values(FOLDER))
      if (url.pathname === "/drive/v3/files/" + folder)
        return json({ id: folder, mimeType: "application/vnd.google-apps.folder", parents: [ROOT], trashed: false });
    const fileMatch = url.pathname.match(/^\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/);
    if (fileMatch && method === "GET") {
      const file = files.get(fileMatch[1]);
      if (!file) return new Response("", { status: 404 });
      if (url.searchParams.get("alt") === "media") {
        controls.mediaReads++;
        return new Response(file.bytes);
      }
      return json({ id: file.id, name: file.name, size: String(file.bytes.length), parents: file.parents, trashed: false }, { headers: { etag: '"v' + file.version + '"' } });
    }
    const uploadMatch = url.pathname.match(/^\/upload\/drive\/v3\/files(?:\/([A-Za-z0-9_-]+))?$/);
    if (uploadMatch) {
      assert.equal(url.searchParams.get("supportsAllDrives"), "true");
      const raw = new Uint8Array(await request.arrayBuffer());
      const boundary = request.headers.get("content-type").split("boundary=")[1];
      const text = Buffer.from(raw).toString("latin1");
      const first = text.indexOf("\r\n\r\n") + 4;
      const metaEnd = text.indexOf("\r\n--" + boundary, first);
      const metadata = JSON.parse(Buffer.from(raw.slice(first, metaEnd)).toString("utf8"));
      const second = text.indexOf("\r\n\r\n", metaEnd) + 4;
      const tail = text.lastIndexOf("\r\n--" + boundary + "--");
      const bytes = raw.slice(second, tail);
      let file;
      if (method === "POST") {
        assert(!files.has(metadata.id), "create never targets an existing file id");
        controls.creates++;
        file = { id: metadata.id, name: metadata.name, parents: metadata.parents, bytes, version: 1 };
      } else {
        assert.equal(method, "PATCH");
        const existing = files.get(uploadMatch[1]);
        assert(existing, "replacement targets the persisted file id");
        assert.equal(request.headers.get("if-match"), '"v' + existing.version + '"', "conditional same-day replacement");
        controls.patches++;
        file = { ...existing, name: metadata.name, bytes, version: existing.version + 1 };
      }
      files.set(file.id, file);
      if (controls.loseNextUploadResponse) {
        controls.loseNextUploadResponse = false;
        return new Response("", { status: 503 }); // stored remotely, response lost
      }
      return json({ id: file.id });
    }
    throw Error("Unexpected synthetic Drive route: " + method + " " + url.pathname);
  }
  return { files, controls, fetcher };
}

const drive = syntheticDrive();
const suite = await productSuite({
  bindings: {
    DRIVE_BACKUP_ENABLED: "true",
    CENTRAL_DRIVE_BACKUP_ENABLED: "true",
    GOOGLE_HELPER_ENABLED: "false",
    GOOGLE_ACCESS_TOKEN: TOKEN,
  },
  providerFetch: drive.fetcher,
});
try {
  const admin = await suite.seedAccount("synthetic-backup-admin");
  const staff = await suite.seedAccount("synthetic-backup-staff", { capabilities: [] });
  const core = await suite.db("core");
  const calendar = await suite.db("calendar");
  const school = "synthetic-school";
  const setLanes = async (labels) => {
    await calendar.prepare("DELETE FROM calendar_metadata WHERE school_id=? AND kind='lanes'").bind(school).run();
    for (const [i, label] of labels.entries())
      await calendar.prepare("INSERT INTO calendar_metadata VALUES(?,'lanes',?,0,1,?)")
        .bind(school, "lane-" + i, JSON.stringify({ LaneID: "lane-" + i, Name: label, Active: "Yes" })).run();
  };
  await setLanes(["Synthetic day lane"]);

  const register = (body, user = admin) => suite.request(user, "core", "/admin/backups/datasets", { method: "POST", body: {
    rootId: ROOT, driveId: DRIVE, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ...body,
  } });
  const cycle = (now, extra = {}, user = admin) => suite.request(user, "core", "/admin/backups/run-cycle", { method: "POST", body: {
    operationId: "synthetic-cycle-" + crypto.randomUUID(), now, ...extra,
  } });
  const health = (now, user = admin) => suite.request(user, "core", "/admin/backups/health?now=" + now);

  // 2. Global Admin only.
  assert.equal((await register({ operationId: "deny-reg", owner: "calendar", dataset: "lanes", name: "Lanes", folderId: FOLDER.calendar }, staff)).status, 403);
  assert.equal((await cycle(Date.now(), {}, staff)).status, 403);
  assert.equal((await health(Date.now(), staff)).status, 403);
  assert.equal((await suite.request(null, "core", "/admin/backups/health")).status, 401);
  assert.equal((await register({ operationId: "bad-owner", owner: "elsewhere", dataset: "lanes", name: "Lanes", folderId: FOLDER.calendar })).status, 400);
  assert.equal((await register({ operationId: "bad-folder", owner: "calendar", dataset: "lanes", name: "Lanes", folderId: "../root" })).status, 400);
  assert.equal(drive.controls.requests.length, 0, "denied and invalid requests make no provider calls");

  for (const [operationId, owner, dataset, name] of [
    ["reg-cal-lanes", "calendar", "lanes", "Lanes"],
    ["reg-cal-tags", "calendar", "tags", "Tags"],
    ["reg-contacts-staff", "contacts", "staff", "Staff"],
  ]) {
    const r = await register({ operationId, owner, dataset, name, folderId: FOLDER[owner], importable: true });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  const replayed = await register({ operationId: "reg-cal-lanes", owner: "calendar", dataset: "lanes", name: "Lanes", folderId: FOLDER.calendar, importable: true });
  assert.equal(replayed.status, 200, "registration replays its original receipt");
  assert.equal((await core.prepare("SELECT count(*) AS n FROM core_backup_datasets").first()).n, 3);

  const before = await health(Date.now());
  assert.equal(before.status, 200);
  assert.equal(before.body.data.enabled, true);
  assert.equal(before.body.data.counts.neverBackedUp, 3);
  assert.equal(before.body.data.automaticDeletion, false);

  // 3. Fair cursor: two actions per cycle, rotated across owners rather than two from one owner.
  const t0 = Date.parse("2026-11-16T02:00:00Z"); // 10:00 SGT
  const first = await cycle(t0);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.data.processed, 2);
  assert.deepEqual(new Set(first.body.data.results.map((r) => r.owner)), new Set(["calendar", "contacts"]), JSON.stringify(first.body.data));
  for (const r of first.body.data.results) assert.equal(r.state, "verified", JSON.stringify(r));
  const second = await cycle(t0 + 60000);
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert(second.body.data.results.some((r) => r.owner === "calendar" && r.dataset === "tags" && r.state === "verified"), JSON.stringify(second.body.data));

  const lanesJob = async () => core.prepare("SELECT * FROM core_backup_jobs WHERE owner='calendar' AND dataset='lanes' ORDER BY day DESC").all();
  let jobs = (await lanesJob()).results;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].day, "2026-11-16");
  assert.equal(jobs[0].state, "verified");
  assert.equal(jobs[0].file_name, "2026 11Nov 16 — Calendar — Lanes.xlsx");
  const firstFileId = jobs[0].file_id;
  assert(drive.files.has(firstFileId));
  assert.equal(drive.controls.generateIds, 3, "exactly one file id per (owner, dataset, day)");
  assert.equal(drive.controls.creates, 3);

  // 4. Unchanged content same day: no rewrite and no new id.
  const ids = drive.controls.generateIds, creates = drive.controls.creates;
  for (let i = 0; i < 2; i++) await cycle(t0 + 120000 + i * 60000);
  assert.equal(drive.controls.generateIds, ids);
  assert.equal(drive.controls.creates, creates);
  assert.equal(drive.controls.patches, 0);

  // 5. Same-day changed content replaces the SAME file id conditionally.
  await setLanes(["Synthetic day lane", "Synthetic second lane"]);
  let changed;
  for (let i = 0; i < 3 && !changed; i++) {
    const r = await cycle(t0 + 600000 + i * 60000);
    changed = r.body.data.results.find((x) => x.owner === "calendar" && x.dataset === "lanes");
  }
  assert.equal(changed?.action, "replaced-verified", JSON.stringify(changed));
  assert.equal(changed.fileId, firstFileId);
  assert.equal(drive.controls.generateIds, ids, "same-day change reserves no new id");
  assert.equal(drive.controls.patches, 1);
  jobs = (await lanesJob()).results;
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].generation, 2);

  // 6. Months-old unchanged file stays current after the 23:50 SGT re-verification; no rewrite.
  const later = t0 + 90 * DAY;
  const monthsLater = [];
  for (let i = 0; i < 3; i++) monthsLater.push(...(await cycle(later + i * 60000)).body.data.results);
  const lanesLater = monthsLater.find((x) => x.owner === "calendar" && x.dataset === "lanes");
  assert.equal(lanesLater?.action, "verified-unchanged", JSON.stringify(monthsLater));
  assert.equal(lanesLater.state, "current");
  assert.equal(drive.controls.generateIds, ids, "age alone never forces a new file");
  assert.equal(drive.controls.patches, 1);
  const lanesHealth = (await health(later + 180000)).body.data.datasets.find((d) => d.owner === "calendar" && d.dataset === "lanes");
  assert.equal(lanesHealth.status, "current");
  assert.equal(lanesHealth.checkDue, false);
  // The following day's 23:50 SGT boundary makes the same evidence due again (stale, not rewritten).
  const nextBoundary = (await health(later + DAY)).body.data.datasets.find((d) => d.owner === "calendar" && d.dataset === "lanes");
  assert.equal(nextBoundary.status, "stale");
  assert.equal(nextBoundary.checkDue, true);

  // 7. Next-day change with lost upload response: one new id, reconciled without a duplicate upload.
  await setLanes(["Synthetic day lane", "Synthetic second lane", "Synthetic third lane"]);
  drive.controls.loseNextUploadResponse = true;
  const nextDay = later + DAY + 3600000;
  let lost;
  for (let i = 0; i < 3 && !lost; i++) {
    const r = await cycle(nextDay + i * 60000);
    lost = r.body.data.results.find((x) => x.owner === "calendar" && x.dataset === "lanes");
  }
  assert.equal(lost?.state, "unknown", JSON.stringify(lost));
  assert.equal(drive.controls.generateIds, ids + 1, "new day reserves exactly one new id");
  const createsAfterLoss = drive.controls.creates;
  const pending = (await core.prepare("SELECT * FROM core_backup_jobs WHERE owner='calendar' AND dataset='lanes' AND state='unknown'").first());
  assert(pending?.file_id && pending.next_retry_at > nextDay, "uncertain write keeps its persisted id with capped backoff");
  // Inside backoff: deferred, no provider write.
  let deferred;
  for (let i = 0; i < 3 && !deferred; i++) {
    const r = await cycle(nextDay + 3 * 60000 + i * 1000);
    deferred = r.body.data.results.find((x) => x.owner === "calendar" && x.dataset === "lanes");
  }
  assert.equal(deferred?.action, "backoff-deferred", JSON.stringify(deferred));
  // After backoff: reconcile the same id; remote bytes already match, so no new upload.
  let reconciled;
  for (let i = 0; i < 3 && !reconciled; i++) {
    const r = await cycle(pending.next_retry_at + 1000 + i * 60000);
    reconciled = r.body.data.results.find((x) => x.owner === "calendar" && x.dataset === "lanes");
  }
  assert.equal(reconciled?.action, "reconciled-verified", JSON.stringify(reconciled));
  assert.equal(reconciled.fileId, pending.file_id);
  assert.equal(drive.controls.creates, createsAfterLoss, "no duplicate upload after lost response");
  assert.equal(drive.controls.generateIds, ids + 1);
  jobs = (await lanesJob()).results;
  assert.equal(jobs.length, 2, "one job/file per day");
  assert.notEqual(jobs[0].file_id, jobs[1].file_id);

  // 8. Remote file deleted/corrupted with unchanged source is not current.
  drive.files.delete(pending.file_id);
  const afterDelete = nextDay + 2 * DAY;
  const deletedResults = [];
  for (let i = 0; i < 3; i++) deletedResults.push(...(await cycle(afterDelete + i * 60000)).body.data.results);
  const lanesDeleted = deletedResults.find((x) => x.owner === "calendar" && x.dataset === "lanes");
  assert.equal(lanesDeleted?.state, "missing", JSON.stringify(deletedResults));
  assert.equal(drive.controls.generateIds, ids + 1, "a deleted backup is never silently recreated");
  const finalHealth = (await health(afterDelete + 180000)).body.data;
  assert.equal(finalHealth.state, "missing");
  assert(JSON.stringify(finalHealth).indexOf(TOKEN) === -1, "health never exposes credentials");
  const stored = JSON.stringify(await Promise.all(["core_backup_jobs", "core_backup_datasets", "core_backup_cursor", "product_operations", "product_audit"]
    .map((t) => core.prepare("SELECT * FROM " + t).all())));
  assert(!stored.includes(TOKEN), "access token never persisted");
} finally {
  await suite.close();
}

// 9. Unconfigured/revoked authorization -> blocked backups; ordinary native saves still commit.
const blockedSuite = await productSuite({
  bindings: { DRIVE_BACKUP_ENABLED: "true", CENTRAL_DRIVE_BACKUP_ENABLED: "true", GOOGLE_HELPER_ENABLED: "false" },
  providerFetch: async (request) => { throw Error("blocked backups must not reach the provider: " + request.url); },
});
try {
  const admin = await blockedSuite.seedAccount("synthetic-blocked-admin");
  const r = await blockedSuite.request(admin, "core", "/admin/backups/datasets", { method: "POST", body: {
    operationId: "blocked-reg", owner: "calendar", dataset: "lanes", name: "Lanes", folderId: FOLDER.calendar, rootId: ROOT, driveId: DRIVE,
  } });
  assert.equal(r.status, 200, "native Core save commits while Drive authorization is unavailable");
  const c = await blockedSuite.request(admin, "core", "/admin/backups/run-cycle", { method: "POST", body: { operationId: "blocked-cycle" } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.data.state, "blocked", JSON.stringify(c.body.data));
  const h = (await blockedSuite.request(admin, "core", "/admin/backups/health")).body.data;
  assert.equal(h.state, "blocked");
  assert.equal(h.datasets[0].lastError, "GOOGLE_NOT_CONFIGURED");
} finally {
  await blockedSuite.close();
}

console.log("PASS v1 Core central Drive backup orchestrator: default-disabled two-switch cutover, Global Admin-only health/register/run-cycle, fair owner cursor, one file id per owner/dataset/day, unchanged same-day and months-old files not rewritten, conditional same-day replacement on the same id, lost upload response reconciled without duplicate, missing remote file reported, unconfigured authorization blocked while native saves commit. Synthetic Drive only; live helper OAuth, Shared Drive ACLs and quotas not tested.");
