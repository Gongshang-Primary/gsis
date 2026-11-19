import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fixture, schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
import { changesFor, loadVersion } from "../v1/services/deploy/service.mjs";
import { statement } from "../v1/runtime/store.mjs";

const f = await fixture();
try {
  const name = "Synthetic Layout map";
  const { versionId } = await f.call(f.admin, "deploy", "/versions/create", {
    operationId: "synthetic-campus-map-version", name, year: 2026,
  });
  const db = await f.db("deploy");
  const loaded = await loadVersion(db, schoolId, versionId);
  const doc = structuredClone(loaded.doc);
  doc.classes = [{ ref: "synthetic-campus-class", name: "Synthetic class", shortName: "1Z", level: "1" }];
  doc.venues = [{ id: "B3-01", name: "Classroom", shortName: "Synthetic map area", form: "1Z", forms: ["1Z"] }];
  const delta = changesFor(schoolId, versionId, loaded.rows, doc);
  await db.batch(delta.writes.map(write => statement(db, write.sql, write.args)));
  const before = (await loadVersion(db, schoolId, versionId)).doc;

  const assetURL = origin + "/deploy/campus-base.svg";
  const raw = await readFile(new URL("../public/campus-base.svg", import.meta.url));
  const asset = await f.mf.dispatchFetch(assetURL);
  assert.equal(asset.status, 200, "the pre-existing static asset remains available without a session");
  assert.match(asset.headers.get("content-type"), /^image\/svg\+xml/i);
  assert(Buffer.from(await asset.arrayBuffer()).equals(raw), "the static drawing carries no version-specific overlay");
  const denied = await f.request(null, "deploy", "/sync", { method: "POST", body: { versionId, full: true } });
  assert([401, 403].includes(denied.status), "the version projection still requires sign-in");

  const page = await f.pageFor();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin + "/deploy/");
  const attempts = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.endsWith("/campus-map")) attempts.push(request.url());
  });
  const changes = () => f.requests.filter(request => request.url.endsWith("/api/deploy/change")).length;
  const writesBefore = changes();
  const drawn = page.waitForResponse(response => response.url() === assetURL);
  await page.locator("#nav").getByRole("button", { name: "Layout", exact: true }).click();
  const response = await drawn;
  assert.equal(response.status(), 200);
  assert.equal(response.request().method(), "GET");
  const headers = await response.request().allHeaders();
  assert.equal(headers.authorization, undefined);
  assert.equal(headers.cookie, undefined);
  assert((await response.body()).equals(raw), "the browser uses the same existing SVG bytes");
  assert.deepEqual(attempts, [], "opening Layout makes no retired campus-map API call");

  const map = page.getByRole("img", { name: "Campus layout for " + name, exact: true });
  await map.waitFor();
  const room = map.locator('g[data-unit="B3-01"] title');
  assert.match(await room.textContent(), /B3-01 .*Synthetic map area, 1Z/);
  await page.locator(".layout-tools").getByRole("button", { name: "+", exact: true }).click();
  const drawingWidth = () => page.locator(".campus-map").evaluate(element => element.style.width);
  assert.equal(await drawingWidth(), "125%");
  await page.locator(".layout-tools").getByRole("button", { name: "Fit", exact: true }).click();
  assert.equal(await drawingWidth(), "100%");
  assert.equal(changes(), writesBefore, "display and zoom send no version write");
  assert.deepEqual((await loadVersion(db, schoolId, versionId)).doc, before, "display preserves the saved version");
  assert.deepEqual(errors, []);
  console.log("PASS Deploy Layout loads the existing anonymous SVG and renders the protected saved allocation with native zoom and no writes");
} finally {
  await f.close();
}
