/** Verify Deploy /api/deploy/layout-reference PDF delivery behind Core auth
 * and removal of obsolete v0.9 /api/commands caller from built Deploy assets (F12).
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { productSuite, origin } from "./v1-product/suite.mjs";
import {
  LAYOUT_REFERENCE_FILENAME,
  layoutReferenceBytes,
} from "../v1/services/deploy/layout-reference.mjs";

const suite = await productSuite();
try {
  // 1. Unauthenticated request must fail closed (401).
  const anon = await suite.mf.dispatchFetch(
    `${origin}/api/deploy/layout-reference`,
    { method: "POST", headers: { "content-type": "application/json", origin }, body: "{}" },
  );
  assert.equal(anon.status, 401);

  // 2. Ordinary account without deploy.read or Contacts authority must fail closed (403/503) and never return PDF bytes.
  const teacher = await suite.seedAccount("layout-ref-teacher", {
    capabilities: [],
  });
  const denied = await suite.mf.dispatchFetch(
    `${origin}/api/deploy/layout-reference`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: `__Host-gsis_session=${teacher.token}`,
        "x-csrf-token": teacher.csrf,
      },
      body: "{}",
    },
  );
  assert.ok(
    [403, 503].includes(denied.status),
    `Expected 403 or fail-closed 503, got ${denied.status}`,
  );
  assert.notEqual(denied.headers.get("content-type"), "application/pdf");

  // 3. Authorised Deploy user receives exact Classroom-Layout-21-Sep-2026.pdf bytes.
  const admin = await suite.seedAccount("layout-ref-admin");
  const ok = await suite.mf.dispatchFetch(
    `${origin}/api/deploy/layout-reference`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin,
        cookie: `__Host-gsis_session=${admin.token}`,
        "x-csrf-token": admin.csrf,
      },
      body: "{}",
    },
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "application/pdf");
  assert.equal(
    ok.headers.get("content-disposition"),
    `attachment; filename="${LAYOUT_REFERENCE_FILENAME}"`,
  );
  assert.equal(ok.headers.get("cache-control"), "private, no-store");
  assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
  const body = new Uint8Array(await ok.arrayBuffer());
  assert.deepEqual(body, layoutReferenceBytes());
  assert.equal(new TextDecoder().decode(body.slice(0, 5)), "%PDF-");

  // Confirm byte-for-byte parity with v0.9 public/_worker.js embedded PDF.
  const v09Worker = await readFile("public/_worker.js", "utf8");
  const match = v09Worker.match(/const layoutReference='([^']+)'/);
  assert.ok(match, "v0.9 layoutReference intact");
  assert.deepEqual(body, new Uint8Array(Buffer.from(match[1], "base64")));

  // 4. Built Deploy app.js has no /api/commands caller while keeping /api/layout-reference.
  const builtDeploy = await readFile(
    join(suite.path, "product/web/assets/deploy/app.js"),
    "utf8",
  );
  assert.doesNotMatch(builtDeploy, /['"]\/api\/commands['"]/);
  assert.match(builtDeploy, /\/api\/layout-reference/);

  console.log("v1-product-deploy-layout-reference: PASS");
} finally {
  await suite.close();
}
