import { readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync, execFileSync } from "node:child_process";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
const files = readdirSync(resolve(root, "tests"))
  .filter((x) => /^v1-product-.*\.mjs$/.test(x))
  .sort();
if (process.argv.includes("--list")) console.log(JSON.stringify(files));
else {
  const evidence = {
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    workingTreeDirty: !!execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    startedAt: new Date().toISOString(),
    timezone: "Asia/Singapore",
    programs: [],
  };
  let failures = 0;
  for (const file of files) {
    const start = Date.now(),
      r = spawnSync(process.execPath, ["tests/" + file], {
        cwd: root,
        env: { ...process.env, TZ: "Asia/Singapore" },
        stdio: "inherit",
        timeout: 45000,
      });
    const result = {
      file,
      milliseconds: Date.now() - start,
      status: r.status === 0 ? "pass" : "fail",
      exitCode: r.status,
      signal: r.signal,
      error: r.error?.code ?? null,
    };
    evidence.programs.push(result);
    if (r.status !== 0) failures++;
    console.log(JSON.stringify(result));
  }
  evidence.finishedAt = new Date().toISOString();
  evidence.passed = files.length - failures;
  evidence.total = files.length;
  mkdirSync(resolve(root, "deliverables/v1/evidence"), { recursive: true });
  writeFileSync(
    resolve(root, "deliverables/v1/evidence/product-tests.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(`${evidence.passed}/${files.length} product programs passed`);
  process.exitCode = failures ? 1 : 0;
}
