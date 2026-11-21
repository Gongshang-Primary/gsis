// Core central Google Drive backup Package 3:
// 1. Core safe readable dataset (Accounts, Grants, ServiceGrants, BackupDatasets; zero secrets/tokens/sessions/OAuth)
// 2. Single-writer cutover guard (per-service scheduled() yields when CENTRAL_DRIVE_BACKUP_ENABLED=true)
// 3. Owner dataset discovery + legacy verified fileId adoption (POST /admin/backups/discover)
// 4. Admin Health UI (#centralDriveBackupHealth) in real Chromium browser.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { productSuite, origin } from "./v1-product/suite.mjs";
import {
  listBackupDatasets,
  buildBackupDataset,
} from "../v1/runtime/drive-backup-data.mjs";

const ROOT = "synthetic-p3-root";
const DRIVE = "synthetic-p3-drive";
const FOLDER = {
  core: "synthetic-p3-core-folder",
  contacts: "synthetic-p3-contacts-folder",
};
const TOKEN = "synthetic-p3-token";

function syntheticDrive() {
  const files = new Map();
  const controls = { generateIds: 0, creates: 0, patches: 0, serial: 0 };
  const json = (value, init = {}) => Response.json(value, init);
  async function fetcher(request) {
    const url = new URL(request.url);
    const method = request.method;
    if (url.host !== "www.googleapis.com")
      throw Error("Unexpected provider host " + url.host);
    assert.equal(request.headers.get("authorization"), "Bearer " + TOKEN);
    if (url.pathname === "/drive/v3/files/generateIds") {
      controls.generateIds++;
      return json({ ids: ["synthetic-p3-file-" + ++controls.serial] });
    }
    if (url.pathname === "/drive/v3/files/" + ROOT)
      return json({
        id: ROOT,
        driveId: DRIVE,
        mimeType: "application/vnd.google-apps.folder",
        trashed: false,
        capabilities: { canAddChildren: true },
      });
    for (const folder of Object.values(FOLDER))
      if (url.pathname === "/drive/v3/files/" + folder)
        return json({
          id: folder,
          mimeType: "application/vnd.google-apps.folder",
          parents: [ROOT],
          trashed: false,
        });
    const fileMatch = url.pathname.match(/^\/drive\/v3\/files\/([A-Za-z0-9_-]+)$/);
    if (fileMatch && method === "GET") {
      const file = files.get(fileMatch[1]);
      if (!file) return new Response("", { status: 404 });
      if (url.searchParams.get("alt") === "media") return new Response(file.bytes);
      return json(
        {
          id: file.id,
          name: file.name,
          size: String(file.bytes.length),
          parents: file.parents,
          trashed: false,
        },
        { headers: { etag: '"v' + file.version + '"' } },
      );
    }
    const uploadMatch = url.pathname.match(
      /^\/upload\/drive\/v3\/files(?:\/([A-Za-z0-9_-]+))?$/,
    );
    if (uploadMatch) {
      const raw = new Uint8Array(await request.arrayBuffer());
      const boundary = request.headers.get("content-type").split("boundary=")[1];
      const text = Buffer.from(raw).toString("latin1");
      const first = text.indexOf("\r\n\r\n") + 4;
      const metaEnd = text.indexOf("\r\n--" + boundary, first);
      const metadata = JSON.parse(
        Buffer.from(raw.slice(first, metaEnd)).toString("utf8"),
      );
      const second = text.indexOf("\r\n\r\n", metaEnd) + 4;
      const tail = text.lastIndexOf("\r\n--" + boundary + "--");
      const bytes = raw.slice(second, tail);
      let file;
      if (method === "POST") {
        controls.creates++;
        file = {
          id: metadata.id,
          name: metadata.name,
          parents: metadata.parents,
          bytes,
          version: 1,
        };
      } else {
        controls.patches++;
        const existing = files.get(uploadMatch[1]);
        file = {
          ...existing,
          name: metadata.name,
          bytes,
          version: existing.version + 1,
        };
      }
      files.set(file.id, file);
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
  const school = "synthetic-school";
  const admin = await suite.seedAccount("synthetic-p3-admin");
  const staff = await suite.seedAccount("synthetic-p3-staff", {
    capabilities: [],
  });
  const core = await suite.db("core");
  const contacts = await suite.db("contacts");

  // Seed sensitive Core rows that MUST NEVER appear in Core backup dataset.
  const now = Date.parse("2026-11-16T02:00:00Z");
  await core
    .prepare(
      "INSERT OR REPLACE INTO core_google_connections(school_id,revision,state,subject,email,config_digest,credential_cipher,connected_by,connected_at,updated_at) VALUES(?,1,'connected','sub-1','helper@example.invalid','cfg-digest-1','TOP_SECRET_OAUTH_CIPHER_DO_NOT_EXPORT',?,?,?)",
    )
    .bind(school, admin.id, now, now)
    .run();
  await core
    .prepare(
      "INSERT OR REPLACE INTO core_google_flows(school_id,operation_id,actor_id,session_id,state_hash,config_digest,connection_revision,flow_cipher,status,expires_at) VALUES(?,'op-flow-1',?,'sess-1','state-hash-1','cfg-digest-1',1,'TOP_SECRET_PKCE_VERIFIER','pending',?)",
    )
    .bind(school, admin.id, now + 600000)
    .run();

  // 1. Core safe readable dataset excludes secrets, sessions, and OAuth state.
  const coreEnv = { SERVICE_NAME: "core", DB: core, SCHOOL_ID: school };
  const coreDatasets = await listBackupDatasets(coreEnv);
  assert.equal(coreDatasets.length, 1);
  assert.equal(coreDatasets[0].id, "access-and-backup-manifest");
  assert.equal(coreDatasets[0].importable, false);

  const built = await buildBackupDataset(coreEnv, coreDatasets[0], now);
  assert.deepEqual(Object.keys(built.book.sheets), [
    "Accounts",
    "Grants",
    "ServiceGrants",
    "BackupDatasets",
  ]);
  const serialized = JSON.stringify(built.book);
  assert(serialized.includes(admin.id), "safe accounts exported");
  assert(!serialized.includes("TOP_SECRET_OAUTH_CIPHER_DO_NOT_EXPORT"));
  assert(!serialized.includes("TOP_SECRET_PKCE_VERIFIER"));
  assert(!serialized.includes(admin.token));

  // 2. Single-writer cutover guard: per-service cron yields when CENTRAL_DRIVE_BACKUP_ENABLED=true.
  const beforeCtrl = (
    await contacts.prepare("SELECT count(*) AS n FROM drive_backup_control").first()
  ).n;
  await suite.trigger("contacts");
  const afterCtrl = (
    await contacts.prepare("SELECT count(*) AS n FROM drive_backup_control").first()
  ).n;
  assert.equal(
    afterCtrl,
    beforeCtrl,
    "per-service scheduled() must yield to central orchestrator without writing drive_backup_control",
  );
  assert.equal(drive.controls.creates, 0, "per-service cron made zero Drive writes");

  // 3. Discovery & legacy verified fileId adoption.
  const legacySha = "a".repeat(64);
  await contacts
    .prepare(
      "INSERT INTO drive_backup_files(school_id,dataset,day,file_id,folder_id,source_digest,artifact_key,sha256,bytes,state,verified_at,updated_at) VALUES(?,'staff','2026-11-15','legacy-contacts-file-1',?,'src-digest-1','schools/synthetic-school/backup/staff/legacy.xlsx',?,1234,'verified',?,?)",
    )
    .bind(school, FOLDER.contacts, legacySha, now - 86400000, now - 86400000)
    .run();

  const denied = await suite.request(staff, "core", "/admin/backups/discover", {
    method: "POST",
    body: {
      operationId: "p3-discover-deny",
      owners: ["core", "contacts"],
      register: false,
    },
  });
  assert.equal(denied.status, 403, "non-admin denied discovery");

  const discovered = await suite.request(admin, "core", "/admin/backups/discover", {
    method: "POST",
    body: {
      operationId: "p3-discover-1",
      owners: ["core", "contacts"],
      register: true,
      driveId: DRIVE,
      rootId: ROOT,
      folderByOwner: FOLDER,
    },
  });
  assert.equal(discovered.status, 200, JSON.stringify(discovered.body));
  assert.deepEqual(discovered.body.data.errors, []);
  const coreEntry = discovered.body.data.discovered.find(
    (d) => d.owner === "core" && d.dataset === "access-and-backup-manifest",
  );
  const contactsEntry = discovered.body.data.discovered.find(
    (d) => d.owner === "contacts" && d.dataset === "staff",
  );
  assert(coreEntry?.registered, JSON.stringify(discovered.body.data));
  assert.equal(coreEntry.adopted, false);
  assert(contactsEntry?.registered, JSON.stringify(discovered.body.data));
  assert.equal(contactsEntry.adopted, true);
  assert.equal(contactsEntry.adoptedFileId, "legacy-contacts-file-1");

  const adoptedJob = await core
    .prepare(
      "SELECT day,file_id,target_sha256,target_bytes,state FROM core_backup_jobs WHERE school_id=? AND owner='contacts' AND dataset='staff'",
    )
    .bind(school)
    .first();
  assert.equal(adoptedJob.file_id, "legacy-contacts-file-1");
  assert.equal(adoptedJob.day, "2026-11-15");
  assert.equal(adoptedJob.target_sha256, legacySha);
  assert.equal(adoptedJob.target_bytes, 1234);
  assert.equal(adoptedJob.state, "verified");

  // Verify central backup cycle can actually export & upload Core's safe dataset end-to-end.
  const cycleRes = await suite.request(admin, "core", "/admin/backups/run-cycle", {
    method: "POST",
    body: { operationId: "p3-cycle-1", now },
  });
  assert.equal(cycleRes.status, 200, JSON.stringify(cycleRes.body));
  const coreResult = cycleRes.body.data.results.find(
    (r) => r.owner === "core" && r.dataset === "access-and-backup-manifest",
  );
  assert.equal(coreResult?.state, "verified", JSON.stringify(cycleRes.body.data));
  assert(drive.files.has(coreResult.fileId), "core dataset uploaded to Drive");

  // 4. Real Chromium browser check on /admin/#health for #centralDriveBackupHealth.
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
    executablePath:
      process.env.GSIS_BROWSER_EXECUTABLE || process.env.ROSTER_TEST_CHROMIUM,
  });
  try {
    const context = await browser.newContext();
    await context.addCookies([
      {
        name: "__Host-gsis_session",
        value: admin.token,
        url: origin,
        secure: true,
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
    const errors = [];
    await context.route("**/*", async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (url.origin !== origin) return route.abort();
      const r = await suite.mf.dispatchFetch(req.url(), {
        method: req.method(),
        headers: await req.allHeaders(),
        body: req.postDataBuffer() || undefined,
      });
      const body = Buffer.from(await r.arrayBuffer());
      await route.fulfill({
        status: r.status,
        headers: Object.fromEntries(r.headers),
        body,
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(origin + "/admin/#health");
    const card = page.locator("#centralDriveBackupHealth");
    await card.waitFor();
    await page
      .locator("#centralDriveBackupHealth")
      .getByText("Access and backup manifest", { exact: false })
      .waitFor();
    await page
      .locator("#centralDriveBackupHealth")
      .getByText("legacy-contacts-file-1", { exact: false })
      .or(
        page
          .locator("#centralDriveBackupHealth")
          .getByText("Staff", { exact: false }),
      )
      .first()
      .waitFor();

    await page
      .locator("#centralDriveBackupHealth")
      .getByRole("button", { name: "Run backup cycle now", exact: true })
      .click();
    await page
      .locator("#centralDriveBackupHealth")
      .getByText("Cycle finished:", { exact: false })
      .waitFor();

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }

  console.log(
    "PASS Core central Drive backup Package 3 (safe Core dataset, single-writer cutover guard, owner discovery + fileId adoption, /admin/#health UI)",
  );
} finally {
  await suite.close();
}
