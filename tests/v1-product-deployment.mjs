import assert from "node:assert/strict";
import { verifyResources } from "../scripts/v1/verify-resources.mjs";
const config = {
    name: "gsis-v1-test-core",
    d1_databases: [
      {
        binding: "DB",
        database_name: "gsis-v1-test-core",
        database_id: "11111111-1111-1111-1111-111111111111",
      },
    ],
    r2_buckets: [
      { binding: "ARTIFACTS", bucket_name: "gsis-v1-test-core-artifacts" },
    ],
  },
  env = {
    CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
    CLOUDFLARE_API_TOKEN: "synthetic-only",
  };
let calls = [];
const request = async (url, init) => {
  assert.equal(init.method, undefined, "verification is GET only");
  calls.push(url);
  return Response.json({
    success: true,
    result: url.endsWith("/domains/managed")
      ? { enabled: false }
      : url.endsWith("/domains/custom")
        ? { domains: [] }
        : url.includes("/d1/")
          ? { name: config.name, uuid: config.d1_databases[0].database_id }
          : { name: config.r2_buckets[0].bucket_name },
  });
};
assert.deepEqual(await verifyResources([config], env, request), {
  owners: 1,
  databases: 1,
  buckets: 1,
  verified: true,
});
assert.equal(calls.length, 4);
await assert.rejects(
  verifyResources([config], env, async () =>
    Response.json({
      success: true,
      result: {
        name: "existing-production",
        uuid: config.d1_databases[0].database_id,
      },
    }),
  ),
  /Actual D1 identity/,
);
await assert.rejects(
  verifyResources([config], env, async (url, init) =>
    url.endsWith("/domains/managed")
      ? Response.json({ success: true, result: { enabled: true } })
      : request(url, init),
  ),
  /public access/,
);
await assert.rejects(
  verifyResources([config, config], env, request),
  /distinct/,
);
await assert.rejects(
  verifyResources([config], env, async () => new Response("", { status: 403 })),
  /could not be verified/,
);
console.log(
  "PASS deployment preflight actual identity contract, production-ID substitution, duplicate owner stores and unreadable resource denial; all provider responses synthetic, zero cloud changes",
);
