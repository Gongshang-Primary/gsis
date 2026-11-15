import assert from "node:assert/strict";
import { createDatabase, syntheticAdmission } from "./v1-product/helpers.mjs";
import {
  prepareOperation,
  renewPreparedOperation,
  commitOperation,
  abortOperation,
  operationStatus,
  query,
  one,
} from "../v1/runtime/store.mjs";
const h = await createDatabase("store", {
  extraSchema:
    "CREATE TABLE records(school_id TEXT,id TEXT,revision INTEGER,value TEXT,PRIMARY KEY(school_id,id));",
});
try {
  const now = Date.now();
  const prep = (id, intent = { v: 1 }) =>
    prepareOperation(h.db, {
      schoolId: "s",
      actorId: "a",
      operationId: id,
      action: "contacts.edit",
      intent,
      now,
      validUntil: now + 60000,
    });
  await h.db
    .prepare(
      "INSERT INTO records VALUES('s','one',0,'original'),('s','two',0,'original')",
    )
    .run();
  const a = await prep("a"),
    b = await prep("b");
  await syntheticAdmission(h.db, a);
  await syntheticAdmission(h.db, b);
  const write = (op, id, value) =>
    commitOperation(h.db, op, {
      now,
      guards: [
        {
          sql: "SELECT revision=0 AS ok FROM records WHERE school_id=? AND id=?",
          args: ["s", id],
        },
      ],
      writes: [
        {
          sql: "UPDATE records SET value=?,revision=revision+1 WHERE school_id=? AND id=?",
          args: [value, "s", id],
        },
      ],
      result: { value },
      outbox: [
        { id: op.operationId, type: "test.send", payload: { id }, dueAt: now },
      ],
    });
  const race = await Promise.allSettled([
    write(a, "one", "A"),
    write(b, "one", "B"),
  ]);
  assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal((await query(h.db, "SELECT * FROM product_audit")).length, 1);
  assert.equal((await query(h.db, "SELECT * FROM product_outbox")).length, 1);
  assert.equal(
    (await one(h.db, "SELECT revision FROM records WHERE id='one'")).revision,
    1,
  );
  const loser = race[0].status === "rejected" ? a : b;
  assert.equal(
    (await operationStatus(h.db, "s", loser.operationId)).state,
    "prepared",
  );
  const winner = race[0].status === "fulfilled" ? a : b;
  const receipt = (await operationStatus(h.db, "s", winner.operationId))
    .receipt;
  assert.deepEqual(await write(winner, "one", "SHOULD-NOT-WRITE"), receipt);
  assert.equal(
    (await one(h.db, "SELECT revision FROM records WHERE id='one'")).revision,
    1,
  );
  await assert.rejects(
    prep(winner.operationId, { different: true }),
    (e) => e.code === "OPERATION_INTENT_CONFLICT",
  );
  await abortOperation(h.db, loser, "cancelled", now);
  await assert.rejects(
    write(loser, "two", "late"),
    (e) => e.code === "OPERATION_ABORTED",
  );
  const unadmitted = await prep("unadmitted");
  await assert.rejects(write(unadmitted, "two", "unsafe"));
  assert.equal(
    (await one(h.db, "SELECT value FROM records WHERE id='two'")).value,
    "original",
  );
  const retryMetadata = await prep("metadata", {
    value: "same",
    requestId: "first",
  });
  assert.equal(
    (await prep("metadata", { value: "same", requestId: "second" })).digest,
    retryMetadata.digest,
  );
  await assert.rejects(
    prep("metadata", { value: "changed", requestId: "third" }),
    (e) => e.code === "OPERATION_INTENT_CONFLICT",
  );
  const authority = {
    schoolId: "s",
    actorId: "a",
    action: "contacts.edit",
    requestDigest: "same-request",
    decisionId: "first",
    validUntil: now + 60000,
  };
  const renewable = await prepareOperation(h.db, {
    schoolId: "s",
    actorId: "a",
    operationId: "renew",
    action: "contacts.edit",
    intent: { v: 1 },
    now,
    validUntil: now + 30000,
    authorization: authority,
  });
  const renewed = await renewPreparedOperation(
    h.db,
    renewable,
    { ...authority, decisionId: "fresh" },
    now + 10,
  );
  assert.equal(renewed.validUntil, authority.validUntil);
  await assert.rejects(
    renewPreparedOperation(
      h.db,
      renewed,
      { ...authority, actorId: "foreign" },
      now + 20,
    ),
    (e) => e.code === "AUTHORITY_CHANGED",
  );
  await syntheticAdmission(h.db, renewed);
  await assert.rejects(
    renewPreparedOperation(
      h.db,
      renewed,
      { ...authority, decisionId: "later" },
      now + 30,
    ),
    (e) => e.code === "OPERATION_NOT_RENEWABLE",
  );
  const fail = await prep("fail");
  await syntheticAdmission(h.db, fail);
  await assert.rejects(
    commitOperation(h.db, fail, {
      now,
      writes: [
        { sql: "UPDATE records SET value='half' WHERE id='two'" },
        { sql: "INSERT INTO records VALUES('s','two',1,'duplicate')" },
      ],
      result: {},
    }),
  );
  assert.equal(
    (await one(h.db, "SELECT value FROM records WHERE id='two'")).value,
    "original",
  );
  await h.restart();
  assert.deepEqual(
    (await operationStatus(h.db, "s", winner.operationId)).receipt,
    receipt,
  );
  assert.equal(
    (await query(h.db, "SELECT * FROM product_assertions")).length,
    0,
  );
  console.log(
    "PASS actual Workers D1: CAS loser has no side effects, original retry receipt, intent conflict, fenced abort, durable admission, batch rollback, restart",
  );
} finally {
  await h.close();
}
