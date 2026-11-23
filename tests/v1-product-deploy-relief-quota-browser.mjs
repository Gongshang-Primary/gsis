import assert from "node:assert/strict";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const f = await fixture();
try {
  const created = await f.call(f.admin, "contacts", "/save-data", {
    operationId: "synthetic-quota-staff",
    changes: [],
    additions: ["A", "B"].map(letter => ({
      id: "quota-" + letter,
      values: {
        "Basic Name": "Synthetic quota " + letter,
        "Statutory Name": "Synthetic quota " + letter,
        Active: "Y",
        "School Section": "Primary",
        "Employment Arrangement": "Full-time",
        "Appointment Status": "Confirmed",
      },
    })),
  });
  const staff = ["A", "B"].map(letter => created.mapping["quota-" + letter]);
  const acceptEo = staffId => f.call(f.admin, "contacts", "/staff/" + staffId + "/accept", {
    operationId: "synthetic-quota-eo-" + staffId,
    field: "eo",
    value: true,
    revision: 0,
    ownerReviewReference: "Synthetic quota review",
  });
  await acceptEo(staff[0]);
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-quota-version",
    name: "Synthetic relief quota",
    year: 2027,
  });
  // Seed synthetic saved teaching assignments to isolate the relief read path.
  const db = await f.db("deploy");
  const loaded = await loadVersion(db, schoolId, versionId);
  const doc = structuredClone(loaded.doc);
  doc.classes = [{ ref: "quota-class", name: "Synthetic class", shortName: "A", level: "1" }];
  doc.groups = [];
  doc.loads = { "1": { Assembly: 0, FTGP: 0, FTT: 0, EL: 6, Math: 36 } };
  doc.assignments = ["EL", "Math"].map((subject, index) => ({
    id: "quota-assignment-" + index,
    teacher: staff[index],
    target: "1A",
    targetRef: "quota-class",
    level: "1",
    subject,
  }));
  doc.organisations = { dept: [], comm: [], cca: [], plt: [], events: [] };
  doc.duties = [];
  const delta = changesFor(schoolId, versionId, loaded.rows, doc);
  await db.batch(delta.writes.map(write => statement(db, write.sql, write.args)));
  const before = await loadVersion(db, schoolId, versionId);

  const readQuotaRows = async () => {
    const shown = await f.call(f.admin, "deploy", "/bootstrap", { versionId });
    return staff.map(staffId => shown.current.reliefResults.teachers.find(row => row.teacherId === staffId));
  };
  const initial = await readQuotaRows();
  assert.equal(initial[0].R, 47);
  assert.equal(initial[1].R, null);

  const page = await f.pageFor();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  const go = name => page.getByRole("button", { name, exact: true }).first().click();
  const diagnostics = page.locator("[data-relief-quota-diagnostics]");
  const ledgerQuota = async name => {
    const header = page.locator('.workload-ledger thead th[aria-label^="R: Deploy relief quota"]');
    const index = await header.evaluate(cell => cell.cellIndex);
    return page.locator(".workload-ledger tbody tr").filter({ hasText: name }).locator("td").nth(index);
  };
  const statsAverage = () => page.locator(".workload-stats-table tbody tr")
    .filter({ hasText: "R (average)" }).locator("td").first();
  const expectMissingEvidence = async () => {
    await diagnostics.waitFor();
    await diagnostics.locator("summary").click();
    const text = await diagnostics.innerText();
    assert.match(text, /Synthetic quota B.*accepted EO/i);
    assert.doesNotMatch(text, /Synthetic quota A/);
  };

  await go("Ledger");
  assert.equal(await (await ledgerQuota("Synthetic quota A")).innerText(), "47");
  assert.equal(await (await ledgerQuota("Synthetic quota B")).innerText(), "Unavailable");
  await expectMissingEvidence();
  await go("Stats");
  assert.equal(await statsAverage().innerText(), "Unavailable");
  await expectMissingEvidence();

  for (const [flag, message] of [
    ["pending", /Save changes to update relief quotas/i],
    ["stale", /Refresh to update relief quotas/i],
  ]) {
    await page.evaluate(flag => {
      delete v().reliefResults.pending;
      delete v().reliefResults.stale;
      v().reliefResults[flag] = true;
      render(true);
    }, flag);
    assert.match(await diagnostics.innerText(), message);
  }

  await acceptEo(staff[1]);
  const restored = await readQuotaRows();
  assert.deepEqual(restored.map(row => row.R), [47, 0]);
  await page.reload();
  await go("Ledger");
  assert.equal(await (await ledgerQuota("Synthetic quota A")).innerText(), "47");
  assert.equal(await (await ledgerQuota("Synthetic quota B")).innerText(), "0");
  assert.equal(await diagnostics.count(), 0);
  await go("Stats");
  assert.equal(await statsAverage().innerText(), "23.5");
  assert.equal(await diagnostics.count(), 0);
  await go("Relief Settings");
  const reliefRows = page.locator(".relief-table tbody tr");
  assert.equal(await reliefRows.filter({ hasText: "Synthetic quota B" }).locator('[data-relief-value="quota"]').innerText(), "0");
  assert.deepEqual((await loadVersion(db, schoolId, versionId)).doc, before.doc);
  assert.deepEqual(errors, []);
  console.log("PASS Deploy quota explanations and complete R via browser, Contacts, Deploy Worker and D1");
} finally {
  await f.close();
}
