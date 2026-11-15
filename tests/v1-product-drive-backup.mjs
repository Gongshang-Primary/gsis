import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createDatabase } from "./v1-product/helpers.mjs";
import { canonical } from "../v1/runtime/store.mjs";
import {
  allocateDriveFileId,
  verifyDriveFile,
  putVerifiedDriveFile,
  sha256Bytes,
  dailyFileName,
  singaporeDay,
  freshnessStatus,
  driveBackupConfig,
} from "../v1/runtime/drive-backup.mjs";
import {
  runDriveBackups,
  driveBackupHealth,
  lastDailyCheck,
} from "../v1/runtime/drive-backup-jobs.mjs";
import {
  buildBackupDataset,
  listBackupDatasets,
  encodeBackupWorkbook,
} from "../v1/runtime/drive-backup-data.mjs";
import { decodeWorkbook } from "../v1/web/shared/workbooks.mjs";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
function provider() {
  const files = new Map(),
    calls = [];
  let next = 0,
    lost = false,
    deny = false;
  const fetch = async (url, init = {}) => {
    const u = new URL(url),
      method = init.method || "GET";
    calls.push({ path: u.pathname, method });
    assert.equal(u.hostname, "www.googleapis.com");
    assert.equal(init.headers.authorization, "Bearer synthetic-only");
    if (deny) return new Response("", { status: 503 });
    if (u.pathname.endsWith("/generateIds"))
      return Response.json({ ids: ["file_" + ++next] });
    const key = u.pathname.split("/").at(-1);
    if (key === "folder_contacts" || key === "folder_roster")
      return Response.json({
        id: key,
        mimeType: "application/vnd.google-apps.folder",
        parents: ["root"],
        trashed: false,
      });
    if (method === "GET") {
      const f = files.get(key);
      if (!f) return new Response("", { status: 404 });
      return u.searchParams.get("alt") === "media"
        ? new Response(f.bytes)
        : Response.json(
            {
              id: key,
              name: f.name,
              size: f.bytes.length,
              parents: [f.folderId],
              trashed: false,
            },
            { headers: { etag: '"' + f.version + '"' } },
          );
    }
    const body = Buffer.from(init.body),
      marker = Buffer.from("\r\n\r\n"),
      first = body.indexOf(marker) + 4,
      nextBoundary = body.indexOf(Buffer.from("\r\n--"), first),
      metadata = JSON.parse(body.subarray(first, nextBoundary));
    const start = body.indexOf(marker, nextBoundary) + 4,
      end = body.lastIndexOf(Buffer.from("\r\n--"));
    const id = method === "POST" ? metadata.id : key,
      old = files.get(id);
    if (method === "POST" && old) return new Response("", { status: 409 });
    if (
      method === "PATCH" &&
      (!old || init.headers["if-match"] !== '"' + old.version + '"')
    )
      return new Response("", { status: 412 });
    files.set(id, {
      name: metadata.name,
      folderId: metadata.parents?.[0] || old.folderId,
      bytes: new Uint8Array(body.subarray(start, end)),
      version: (old?.version || 0) + 1,
    });
    if (lost) {
      lost = false;
      throw Error("Synthetic lost acknowledgement");
    }
    return Response.json({ id }, { status: method === "POST" ? 201 : 200 });
  };
  return {
    fetch,
    files,
    calls,
    get writes() {
      return calls.filter((c) => ["POST", "PATCH"].includes(c.method));
    },
    lose() {
      lost = true;
    },
    deny(value) {
      deny = value;
    },
  };
}
const raw = provider(),
  transport = {
    GOOGLE_ACCESS_TOKEN: "synthetic-only",
    PROVIDER_FETCH: raw.fetch,
  };
const bytes = new TextEncoder().encode("immutable evidence"),
  id = await allocateDriveFileId(transport);
let proof = await putVerifiedDriveFile(transport, {
  fileId: id,
  folderId: "folder_contacts",
  name: "Evidence.json",
  mimeType: "application/json",
  bytes,
});
assert.equal(proof.sha256, await sha256Bytes(bytes));
assert.equal(raw.writes.length, 1);
await putVerifiedDriveFile(transport, {
  fileId: id,
  folderId: "folder_contacts",
  name: "Evidence.json",
  mimeType: "application/json",
  bytes,
});
assert.equal(
  raw.writes.length,
  1,
  "retry proves existing bytes without duplication",
);
await assert.rejects(
  verifyDriveFile(transport, {
    fileId: id,
    folderId: "wrong",
    sha256: proof.sha256,
    size: bytes.length,
  }),
  (e) => e.code === "DRIVE_BACKUP_SCOPE",
);
const newer = new TextEncoder().encode("revised evidence");
await assert.rejects(
  putVerifiedDriveFile(transport, {
    fileId: id,
    folderId: "folder_contacts",
    name: "Evidence.json",
    mimeType: "application/json",
    bytes: newer,
  }),
  (e) => e.code === "DRIVE_BACKUP_INTEGRITY",
);
await putVerifiedDriveFile(transport, {
  fileId: id,
  folderId: "folder_contacts",
  name: "Evidence.json",
  mimeType: "application/json",
  bytes: newer,
  replaceSha256: proof.sha256,
  replaceSize: bytes.length,
});
assert.equal(raw.writes.length, 2);
raw.files.get(id).bytes[0] ^= 1;
await assert.rejects(
  verifyDriveFile(transport, {
    fileId: id,
    folderId: "folder_contacts",
    sha256: await sha256Bytes(newer),
    size: newer.length,
  }),
  (e) => e.code === "DRIVE_BACKUP_INTEGRITY",
);
assert.equal(
  dailyFileName("2026-11-14", "contacts", "Staff"),
  "2026 11Nov 14 — contacts — Staff.xlsx",
);
assert.match(
  dailyFileName("2026-11-14", "deploy", "Version 2027:term1 IP"),
  /2027:term1/,
);
assert.equal(singaporeDay(Date.parse("2026-11-14T16:00:00Z")), "2026-11-15");
assert.equal(
  lastDailyCheck(Date.parse("2026-11-14T15:50:00Z")),
  Date.parse("2026-11-14T15:50:00Z"),
);
assert.equal(
  freshnessStatus({
    sourceDigest: "a",
    verifiedDigest: "a",
    remoteVerified: true,
  }),
  "current",
);
assert.equal(driveBackupConfig({ SERVICE_NAME: "contacts" }).enabled, false);
assert.equal(
  driveBackupConfig({
    SERVICE_NAME: "contacts",
    DRIVE_BACKUP_FOLDERS_JSON: "null",
  }).reason,
  "INVALID_FOLDER_CONFIGURATION",
);
console.log(
  "PASS Drive byte integrity, immutable retries, explicit ETag replacement, scope isolation, Singapore naming and revision freshness",
);

const realTimeout = globalThis.setTimeout;
try {
  globalThis.setTimeout = (callback) => realTimeout(callback, 1);
  await assert.rejects(
    allocateDriveFileId({
      ...transport,
      PROVIDER_FETCH: () => new Promise(() => {}),
    }),
    (error) => error.code === "DRIVE_BACKUP_TIMEOUT",
    "uncooperative provider cannot bypass bounded deadline",
  );
} finally {
  globalThis.setTimeout = realTimeout;
}
await assert.rejects(
  putVerifiedDriveFile(transport, {
    fileId: "too-big",
    folderId: "folder_contacts",
    name: "Too big.json",
    mimeType: "application/json",
    bytes: new Uint8Array(8 * 1024 * 1024 + 1),
  }),
  (error) => error.code === "DRIVE_BACKUP_BOUNDS",
);

const h = await createDatabase("contacts"),
  cloud = provider();
const env = () => ({
  DB: h.db,
  ARTIFACTS: h.bucket,
  SERVICE_NAME: "contacts",
  SCHOOL_ID: "school",
  HOSTED_DOMAIN: "example.invalid",
  GOOGLE_ACCESS_TOKEN: "synthetic-only",
  PROVIDER_FETCH: cloud.fetch,
  DRIVE_BACKUP_ENABLED: "true",
  DRIVE_BACKUP_ROOT_ID: "root",
  DRIVE_BACKUP_FOLDERS_JSON: '{"contacts":"folder_contacts"}',
});
const now = Date.now();
try {
  await h.db
    .prepare(
      "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,revision,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind("school", "staff-1", "Teacher", "Teacher", 1, 1, now)
    .run();
  await h.db
    .prepare(
      "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,revision,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind("other", "staff-other", "Other", "Other", 1, 1, now)
    .run();
  // Storage fixtures exercise the export boundary independently of the Contacts
  // writer integration in v1-product-contacts-projection.mjs. General aliases
  // must never fill a dedicated email cell or a blank appointment field.
  for (const [field, value] of Object.entries({
    statutoryName: "=Synthetic literal text",
    mobile: "90000000",
    ext: "123",
    email: "Mixed@EXAMPLE.invalid",
    iconEmail: "IconCase@MOE.EDU.SG",
    cesEmail: "CesCase@schools.gov.sg",
    aliases: ["obsolete@example.invalid", "obsolete@moe.edu.sg"],
    birthday: "02-09",
    employmentActive: true,
    role: { catalogueId: "roles", revision: "1", code: "T" },
    employmentTags: [{ catalogueId: "employment", revision: "1", code: "BT" }],
    subjectTags: [{ catalogueId: "subjects", revision: "1", code: "PE" }],
    eo: true,
  }))
    await h.db
      .prepare(
        "INSERT INTO contacts_fields(school_id,staff_id,field,revision,state,value_json,valid_from,valid_until,revoked,proposer,accepter,accepted_at,operation_id) VALUES('school','staff-1',?,1,'accepted',?,0,NULL,0,'synthetic-proposer','synthetic-accepter',?,'fixture')",
      )
      .bind(field, JSON.stringify(value), now)
      .run();
  const initial = await buildBackupDataset(env(), { id: "staff" }, now);
  assert.equal(initial.book.sheets.Contacts.rows.length, 1);
  assert.equal(initial.book.metadata.Schema, "gsis.contacts.grid.v1");
  const expectedContact = [
    "staff-1",
    "Teacher",
    "Teacher",
    "=Synthetic literal text",
    "90000000",
    "123",
    "T",
    "",
    "",
    "Y",
    "BT",
    "PE",
    "",
    "9",
    "2",
    "Mixed",
    "IconCase",
    "CesCase",
  ];
  assert.deepEqual(initial.book.sheets.Contacts.rows[0], expectedContact);
  assert.deepEqual(initial.book.sheets.Baseline.rows[0], expectedContact);
  const encoded = await encodeBackupWorkbook(initial.book),
    dom = new JSDOM("");
  globalThis.DOMParser = dom.window.DOMParser;
  const decoded = await decodeWorkbook(encoded.buffer, { Zip: JSZip });
  delete globalThis.DOMParser;
  dom.window.close();
  assert.equal(decoded.sheets.Contacts.rows[0][0], "staff-1");
  assert.deepEqual(decoded.sheets.Contacts.rows[0], expectedContact);
  assert.deepEqual(decoded.sheets.Baseline.rows[0], expectedContact);
  const zip = await JSZip.loadAsync(encoded);
  for (const path of Object.keys(zip.files).filter((p) =>
    /^xl\/worksheets\/sheet\d+\.xml$/.test(p),
  ))
    assert.doesNotMatch(
      await zip.file(path).async("string"),
      /<f(?:\s|>)/,
      "formula-looking contact text is a literal cell",
    );
  await h.db
    .prepare(
      "UPDATE contacts_fields SET state='superseded',value_json=NULL,revision=2 WHERE school_id='school' AND staff_id='staff-1' AND field='iconEmail'",
    )
    .run();
  const cleared = await buildBackupDataset(env(), { id: "staff" }, now);
  assert.equal(
    cleared.book.sheets.Contacts.rows[0][16],
    "",
    "cleared dedicated email does not resurrect general aliases",
  );
  await h.db
    .prepare(
      "UPDATE contacts_fields SET value_json=?,revision=2 WHERE school_id='school' AND staff_id='staff-1' AND field='email'",
    )
    .bind(JSON.stringify("Visible@other.invalid"))
    .run();
  const foreignDomain = await buildBackupDataset(env(), { id: "staff" }, now);
  assert.equal(
    foreignDomain.book.sheets.Contacts.rows[0][15],
    "Visible@other.invalid",
    "wrong-domain addresses stay visible rather than being rewritten",
  );
  const contactUi = new JSDOM("<!doctype html><body></body>", {
    runScripts: "dangerously",
  });
  contactUi.window.GSISV1 = { capable: () => true };
  contactUi.window.eval(
    await readFile(
      new URL("../v1/web/shared/contacts-ui.js", import.meta.url),
      "utf8",
    ),
  );
  const currentGrid = {
    editable: true,
    fields: initial.book.sheets.Contacts.columns.slice(1),
    rows: initial.book.sheets.Contacts.rows.map((row) => ({
      id: row[0],
      values: row.slice(1),
      computed: row
        .slice(1)
        .map((_, i) => ![0, 2, 3, 8, 14, 15, 16].includes(i)),
    })),
  };
  const editable = structuredClone(decoded);
  editable.sheets.Contacts.rows[0][1] = "Edited";
  const validImport = contactUi.window.GSISContactsTables.validate(
    editable,
    currentGrid,
    "school",
  );
  assert.equal(validImport.errors.length, 0);
  assert.equal(validImport.changes.length, 1);
  const authority = structuredClone(decoded);
  authority.sheets.Contacts.rows[0][7] = "EO";
  assert.equal(
    contactUi.window.GSISContactsTables.validate(
      authority,
      currentGrid,
      "school",
    ).changes.length,
    0,
  );
  assert.ok(
    contactUi.window.GSISContactsTables.validate(
      authority,
      currentGrid,
      "school",
    ).errors.length > 0,
    "backup cannot grant EO through Contacts grid import",
  );
  contactUi.window.close();
  cloud.lose();
  await runDriveBackups(env(), now);
  let pending = await h.db
    .prepare("SELECT * FROM drive_backup_files WHERE dataset='staff'")
    .first();
  assert.equal(pending.state, "pending");
  const originalId = pending.file_id;
  await h.restart();
  await runDriveBackups(env(), now + 1000);
  let status = await driveBackupHealth(env(), now + 1000);
  assert.equal(status.state, "current");
  assert.equal(
    (
      await h.db
        .prepare("SELECT file_id FROM drive_backup_files WHERE dataset='staff'")
        .first()
    ).file_id,
    originalId,
    "restart retains original identity after lost acknowledgement",
  );
  const writes = cloud.writes.length;
  await h.db
    .prepare(
      "UPDATE contacts_staff SET basic_name='Changed',revision=2 WHERE school_id='school'",
    )
    .run();
  await runDriveBackups(env(), now + 2000);
  assert.equal(
    (
      await h.db
        .prepare(
          "SELECT COUNT(*) n FROM drive_backup_files WHERE dataset='staff'",
        )
        .first()
    ).n,
    1,
    "one file per SGT day",
  );
  assert.equal(
    (
      await h.db
        .prepare("SELECT file_id FROM drive_backup_files WHERE dataset='staff'")
        .first()
    ).file_id,
    originalId,
  );
  assert.ok(cloud.writes.slice(writes).every((w) => w.method === "PATCH"));
  const months = now + 90 * 86400000,
    count = cloud.writes.length;
  await runDriveBackups(env(), months);
  status = await driveBackupHealth(env(), months);
  assert.equal(status.state, "current");
  assert.equal(
    cloud.writes.length,
    count,
    "unchanged old bytes need no new dated file",
  );
  await runDriveBackups(
    { ...env(), DRIVE_BACKUP_FOLDERS_JSON: '{"contacts":"folder_roster"}' },
    months + 1000,
  );
  const moved = await driveBackupHealth(
    { ...env(), DRIVE_BACKUP_FOLDERS_JSON: '{"contacts":"folder_roster"}' },
    months + 1000,
  );
  assert.equal(
    moved.datasets.find((d) => d.dataset === "staff").lastError,
    "DRIVE_BACKUP_FOLDER_CHANGED",
  );
  await runDriveBackups(env(), months + 2000);
  cloud.files.delete(originalId);
  await runDriveBackups(env(), months + 86400000);
  status = await driveBackupHealth(env(), months + 86400000);
  assert.equal(
    status.datasets.find((d) => d.dataset === "staff").status,
    "missing",
  );
  assert.equal(
    cloud.writes.length,
    count,
    "deleted historical file not recreated",
  );
  cloud.deny(true);
  await runDriveBackups(env(), months + 86400000 + 1000);
  assert.equal(
    (await driveBackupHealth(env(), months + 86400000 + 1000)).state,
    "failed",
  );
  cloud.deny(false);
  console.log(
    "PASS actual isolated D1/R2 receipts across restart, uncertain acknowledgement, same-day overwrite, multi-month unchanged freshness, manual deletion and provider outage",
  );
} finally {
  await h.close();
}

// Real D1 race: pause A after its lease read, let B acquire and publish a new
// revision, then resume A at its original receipt mutation. The transaction
// assertion, not an in-memory guard, must preserve B's receipt and status.
const race = await createDatabase("contacts"),
  raceCloud = provider();
try {
  const rEnv = () => ({
    DB: race.db,
    ARTIFACTS: race.bucket,
    SERVICE_NAME: "contacts",
    SCHOOL_ID: "school",
    GOOGLE_ACCESS_TOKEN: "synthetic-only",
    PROVIDER_FETCH: raceCloud.fetch,
    DRIVE_BACKUP_ENABLED: "true",
    DRIVE_BACKUP_ROOT_ID: "root",
    DRIVE_BACKUP_FOLDERS_JSON: '{"contacts":"folder_contacts"}',
  });
  await race.db
    .prepare(
      "INSERT INTO contacts_staff(school_id,staff_id,basic_name,ttb_name,active,revision,created_at) VALUES(?,?,?,?,?,?,?)",
    )
    .bind("school", "staff-1", "Before", "Before", 1, 1, Date.now())
    .run();
  let release,
    pausedResolve,
    paused = false;
  const pause = new Promise((r) => (pausedResolve = r)),
    gate = new Promise((r) => (release = r));
  const wrapped = {
    prepare: (sql) => race.db.prepare(sql),
    batch: async (statements) => {
      // D1 proxy does not expose SQL publicly; record statements at prepare instead.
      if (!paused && statements.some((s) => receiptStatements.has(s))) {
        paused = true;
        pausedResolve();
        await gate;
      }
      return race.db.batch(statements);
    },
  };
  const receiptStatements = new WeakSet();
  wrapped.prepare = (sql) => {
    const base = race.db.prepare(sql);
    return {
      bind(...args) {
        const stmt = base.bind(...args);
        if (sql.startsWith("UPDATE drive_backup_files SET state='verified'"))
          receiptStatements.add(stmt);
        return stmt;
      },
    };
  };
  const first = runDriveBackups({ ...rEnv(), DB: wrapped }, Date.now());
  await pause;
  await race.db
    .prepare(
      "UPDATE drive_backup_control SET lease_until=0 WHERE school_id='school'",
    )
    .run();
  await race.db
    .prepare(
      "UPDATE contacts_staff SET basic_name='Successor',revision=2 WHERE school_id='school'",
    )
    .run();
  await runDriveBackups(rEnv(), Date.now());
  const before = await race.db
      .prepare("SELECT * FROM drive_backup_files WHERE dataset='staff'")
      .first(),
    beforeStatus = await race.db
      .prepare("SELECT * FROM drive_backup_status WHERE dataset='staff'")
      .first();
  assert.equal(before.state, "verified");
  assert.equal(beforeStatus.status, "current");
  release();
  await first;
  assert.deepEqual(
    await race.db
      .prepare("SELECT * FROM drive_backup_files WHERE dataset='staff'")
      .first(),
    before,
  );
  assert.deepEqual(
    await race.db
      .prepare("SELECT * FROM drive_backup_status WHERE dataset='staff'")
      .first(),
    beforeStatus,
  );
  console.log(
    "PASS expired paused worker cannot overwrite successor receipt, artifact identity or current status",
  );
} finally {
  await race.close();
}
