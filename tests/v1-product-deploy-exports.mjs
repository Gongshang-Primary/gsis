import assert from "node:assert/strict";
import { createDatabase } from "./v1-product/helpers.mjs";
import { defaults } from "../v1/services/deploy/model.mjs";
import {
  exportDrive,
  reconcileDrive,
  readablePublication,
} from "../v1/services/deploy/exports.mjs";
import { claimJobs, finishJob } from "../v1/runtime/jobs.mjs";
import { one, statement, canonical } from "../v1/runtime/store.mjs";
const h = await createDatabase("deploy");
const school = "synthetic-school",
  now = Date.now();
let generated = 0,
  sends = 0,
  uncertain = true,
  readback = "";
const publication = {
  publicationId: "pub-export",
  document: { ...defaults(), id: "version-a", teachers: [] },
  envelope: {
    publicationId: "pub-export",
    schoolId: school,
    publishedAt: now,
    workingRevision: 1,
    rows: [],
  },
};
const env = {
  SCHOOL_ID: school,
  SEND_OWNER: "v1",
  DEPLOY_DRIVE_FOLDER_ID: "synthetic-folder",
  GOOGLE_ACCESS_TOKEN: "synthetic-only",
  get DB() {
    return h.db;
  },
  PROVIDER_FETCH: async (url, init = {}) => {
    if (url.includes("generateIds")) {
      generated++;
      return Response.json({ ids: ["synthetic-file-id"] });
    }
    if (init.method === "POST") {
      sends++;
      const durable = await one(
        h.db,
        "SELECT * FROM deploy_exports WHERE school_id=? AND publication_id=?",
        [school, publication.publicationId],
      );
      assert.equal(
        durable.file_id,
        "synthetic-file-id",
        "The provider identity is durable before send.",
      );
      if (uncertain)
        throw new Error("Synthetic response lost after provider acceptance");
      return Response.json({ id: "synthetic-file-id" });
    }
    return readback === "missing"
      ? new Response("", { status: 404 })
      : new Response(readback, { headers: { "content-type": "text/csv" } });
  },
};
try {
  await statement(
    h.db,
    "INSERT INTO product_outbox(school_id,job_id,operation_id,type,payload_json,due_at,updated_at) VALUES(?,?,?,?,?,?,?)",
    [
      school,
      "pub-export.drive-export",
      "publish-original",
      "deploy.drive-export",
      canonical({ publicationId: "pub-export" }),
      now,
      now,
    ],
  ).run();
  const job = (await claimJobs(h.db, { schoolId: school, now }))[0];
  const result = await exportDrive(env, job, publication, now);
  assert.equal(result.state, "uncertain");
  await finishJob(h.db, job, result, Date.now());
  assert.equal(generated, 1);
  assert.equal(sends, 1);
  await h.restart();
  const persisted = await one(
    h.db,
    "SELECT * FROM deploy_exports WHERE school_id=? AND publication_id=?",
    [school, "pub-export"],
  );
  assert.equal(persisted.state, "uncertain");
  // A duplicate invocation retains uncertainty and never issues another provider create.
  assert.equal(
    (await exportDrive(env, job, publication, Date.now())).state,
    "uncertain",
  );
  assert.equal(sends, 1);
  assert.equal(generated, 1);
  readback = "missing";
  assert.equal((await reconcileDrive(env, "pub-export")).state, "uncertain");
  readback = "different bytes";
  await assert.rejects(
    reconcileDrive(env, "pub-export"),
    (e) => e.code === "EXPORT_INTEGRITY",
  );
  readback = readablePublication(publication.document, publication.envelope);
  const recovered = await reconcileDrive(env, "pub-export");
  assert.equal(recovered.state, "delivered");
  assert.equal(recovered.fileId, "synthetic-file-id");
  assert.equal(sends, 1);
  assert.equal(
    (
      await one(
        h.db,
        "SELECT state FROM deploy_exports WHERE school_id=? AND publication_id=?",
        [school, "pub-export"],
      )
    ).state,
    "uncertain",
    "Readback itself cannot bypass the protected administrator reconciliation commit.",
  );
  assert.equal(
    (
      await exportDrive(
        { ...env, SEND_OWNER: "legacy" },
        job,
        publication,
        Date.now(),
      )
    ).code,
    "SENDER_NOT_ACTIVE",
  );
  console.log(
    "PASS actual D1 restart with synthetic Drive: durable generated identity before send, unknown outcome without resend, bounded verified readback and protected reconciliation boundary. No provider was contacted.",
  );
} finally {
  await h.close();
}
