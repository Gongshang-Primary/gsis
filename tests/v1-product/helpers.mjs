import { Miniflare } from "miniflare";
import { readFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
export async function migrate(db, files) {
  for (const file of files) {
    const sql = await readFile(file, "utf8");
    // Owner migrations contain ordinary statements; triggers must use an explicit migration batch.
    const statements = sql
      .replace(/^\s*--.*$/gm, "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
    for (const s of statements) await db.prepare(s).run();
  }
}
export async function createDatabase(
  owner = "test",
  { persistPath, extraSchema = "" } = {},
) {
  const temp = persistPath ?? (await mkdtemp(join(tmpdir(), "gsis-v1-d1-")));
  let mf, db, bucket;
  const start = async () => {
    mf = new Miniflare({
      modules: true,
      script:
        'export default {fetch(){return new Response("isolated test runtime")}}',
      compatibilityDate: "2026-08-06",
      d1Databases: { DB: `gsis-v1-${owner}` },
      d1Persist: join(temp, "d1"),
      r2Buckets: { ARTIFACTS: `gsis-v1-${owner}-artifacts` },
      r2Persist: join(temp, "r2"),
    });
    db = await mf.getD1Database("DB");
    bucket = await mf.getR2Bucket("ARTIFACTS");
  };
  await start();
  const migrations = [join(root, "v1/migrations/common.sql")];
  try {
    for (const f of (
      await readdir(join(root, "v1/migrations", owner))
    ).sort()) {
      if (f.endsWith(".sql"))
        migrations.push(join(root, "v1/migrations", owner, f));
    }
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  await migrate(db, migrations);
  if (extraSchema)
    for (const sql of extraSchema
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean))
      await db.prepare(sql).run();
  return {
    get mf() {
      return mf;
    },
    get db() {
      return db;
    },
    get bucket() {
      return bucket;
    },
    persistPath: temp,
    async restart() {
      await mf.dispose();
      await start();
    },
    async close() {
      await mf.dispose();
      if (!persistPath) await rm(temp, { recursive: true, force: true });
    },
  };
}
/** Synthetic storage evidence only; integrated tests must obtain admission from Core. */
export async function syntheticAdmission(
  db,
  op,
  {
    decisionId = "synthetic-decision",
    validUntil = op.validUntil,
    pins = [],
  } = {},
) {
  await db
    .prepare(
      `INSERT OR REPLACE INTO product_admissions(school_id,operation_id,fence,digest,decision_id,valid_until,pins_json,state) VALUES(?,?,?,?,?,?,?,'ready')`,
    )
    .bind(
      op.schoolId,
      op.operationId,
      op.fence,
      op.digest,
      decisionId,
      validUntil,
      JSON.stringify(pins),
    )
    .run();
  return { decisionId, validUntil, pins };
}
