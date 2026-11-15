import assert from "node:assert/strict";
import { fixture, futureDate, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";

const f = await fixture(), date = futureDate();
let serial = 0;
const command = (user, operation, fields = {}) => f.request(user, "roster", "/operations", {
  method: "POST", body: { operation, date, operationId: "synthetic-lease-" + ++serial,
    leaseSessionId: "synthetic-tab-one", ...fields },
});
const value = response => { assert.equal(response.status, 200, JSON.stringify(response.body)); return response.body.data; };
try {
  const original = { operationId: "synthetic-lease-original", staplerRevision: 0 };
  const first = value(await command(f.admin, "acquireStaplerLock", original));
  assert.equal(first.lock.mine, true);
  for (const [actor, tab] of [[f.other, "synthetic-tab-one"], [f.admin, "synthetic-tab-two"]]) {
    const denied = await command(actor, "acquireStaplerLock", { leaseSessionId: tab });
    assert.equal(denied.status, 409);
    assert.equal(denied.body.error.code, "LEASE_CONFLICT");
  }
  assert.equal((await command(f.ordinary, "acquireStaplerLock")).status, 403);
  assert.equal((await command(null, "acquireStaplerLock")).status, 401);
  const replay = value(await command(f.admin, "acquireStaplerLock", original));
  assert.equal(replay.fence, first.fence, "same operation replays its original fence");
  assert.equal((await command(f.admin, "acquireStaplerLock", { ...original, staplerRevision: 99 })).status, 409,
    "reused operation cannot change intent");
  assert.equal((await command(f.admin, "renewStaplerLock", { leaseFence: first.fence + 1 })).status, 409);
  const renewed = value(await command(f.admin, "renewStaplerLock", { leaseFence: first.fence }));
  assert.equal(renewed.fence, first.fence);
  assert(renewed.expiresAt >= first.expiresAt);
  const released = value(await command(f.admin, "releaseStaplerLock", { leaseFence: first.fence }));
  assert.equal(released.lock.active, false);
  assert.equal((await command(f.admin, "renewStaplerLock", { leaseFence: first.fence })).status, 409,
    "a released lease cannot be resurrected by renewal");
  const second = value(await command(f.other, "acquireStaplerLock"));
  assert.equal(second.fence, first.fence + 1);
  assert.equal((await command(f.admin, "releaseStaplerLock", { leaseFence: first.fence })).status, 409);
  const db = await f.db("roster");
  await db.prepare("UPDATE roster_leases SET expires_at=0 WHERE school_id=? AND service_date=?")
    .bind(schoolId, date).run();
  const third = value(await command(f.admin, "acquireStaplerLock"));
  assert.equal(third.fence, second.fence + 1, "expired owner is replaced with a new fence");
  assert.equal((await command(f.other, "releaseStaplerLock", { leaseFence: second.fence })).status, 409);
  assert.equal((await db.prepare("SELECT fence FROM roster_leases WHERE school_id=? AND service_date=?")
    .bind(schoolId, date).first()).fence, third.fence);
  const oldRoute = await f.request(f.admin, "roster", "/lease", { method: "POST", body: {
    operationId: "synthetic-legacy-lease", date: futureDate(5), action: "acquire",
  } });
  assert.equal(value(oldRoute).fence, 1, "existing direct lease contract remains usable");
  console.log("PASS real nine-Worker/D1 leases: replay, competing actors/tabs, permission, stale fences, renewal, release and expiry");
} finally { await f.close(); }
