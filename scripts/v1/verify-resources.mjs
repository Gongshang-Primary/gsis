/** Read-only remote identity checks, invoked only inside the approved deployment job. */
export async function verifyResources(configs, env, request = fetch) {
  if (
    !/^[a-f0-9]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? "") ||
    !env.CLOUDFLARE_API_TOKEN
  )
    throw Error("Cloudflare account configuration is required.");
  const account = env.CLOUDFLARE_ACCOUNT_ID,
    ids = new Set(),
    buckets = new Set();
  async function read(path) {
    const response = await request(
      "https://api.cloudflare.com/client/v4/accounts/" + account + path,
      {
        headers: { authorization: "Bearer " + env.CLOUDFLARE_API_TOKEN },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw Error(
        "Isolated resource identity could not be verified. No deployment was started.",
      );
    const result = await response.json();
    if (result.success !== true || !result.result)
      throw Error("Cloudflare resource identity response was invalid.");
    return result.result;
  }
  for (const config of configs) {
    if (!/^gsis-v1-[a-z0-9-]+$/.test(config.name))
      throw Error("Worker is not in the isolated v1 namespace.");
    const db = config.d1_databases?.[0],
      bucket = config.r2_buckets?.[0];
    if (
      config.d1_databases?.length !== 1 ||
      config.r2_buckets?.length !== 1 ||
      !db ||
      !bucket ||
      ids.has(db.database_id) ||
      buckets.has(bucket.bucket_name)
    )
      throw Error("Each owner requires a distinct isolated D1 and R2 bucket.");
    ids.add(db.database_id);
    buckets.add(bucket.bucket_name);
    if (
      db.database_name !== config.name ||
      !bucket.bucket_name.startsWith(config.name.replace(/-[^-]+$/, "") + "-")
    )
      throw Error("Configured resource names do not match the isolated owner.");
    const actual = await read(
      "/d1/database/" + encodeURIComponent(db.database_id),
    );
    if (
      actual.name !== db.database_name ||
      (actual.uuid ?? actual.id) !== db.database_id
    )
      throw Error(
        "Actual D1 identity differs from the approved isolated owner mapping.",
      );
    const actualBucket = await read(
      "/r2/buckets/" + encodeURIComponent(bucket.bucket_name),
    );
    if (actualBucket.name !== bucket.bucket_name)
      throw Error(
        "Actual R2 identity differs from the approved isolated owner mapping.",
      );
    const managed = await read(
        "/r2/buckets/" +
          encodeURIComponent(bucket.bucket_name) +
          "/domains/managed",
      ),
      custom = await read(
        "/r2/buckets/" +
          encodeURIComponent(bucket.bucket_name) +
          "/domains/custom",
      );
    if (
      managed.enabled !== false ||
      !Array.isArray(custom.domains) ||
      custom.domains.some((domain) => domain.enabled !== false)
    )
      throw Error(
        "Owner R2 buckets must have managed and custom public access disabled.",
      );
  }
  return {
    owners: configs.length,
    databases: ids.size,
    buckets: buckets.size,
    verified: true,
  };
}
