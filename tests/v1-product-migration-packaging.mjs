import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
// Initial migration hashes from deployed f1a5d32; independent of shallow CI Git history.
const baselineHashes = {
  core: "430f3b7f63936e2a36aedf0fdf97a8109722617828080f2702524645c0cdbe0b",
  contacts: "5d88a56f6d2ac96620a47499da0835d7361fdf1b567ba907567019f5913aa0a2",
  deploy: "8014374c594468da5f2a4d97039b21d4851f0d21c040ed19c1b7aa3b72469fb1",
  roster: "1970a05ade96c70ff7455d1a274dd141272220ef5edd05ba63351c5f8a5b214d",
  calendar: "4c13928f87031ca2f3c91135093253994c6368e8cb6715bfaab63b6ea382deda",
  lord: "5c984cbb0dbdd170e47fef6ebbf185052739ffc0c1729c04173b9f89b2fd6d22",
  venues: "997a139d3c396270021841c0979ec5e2775b62368899c25250bbb1d5b34708fa",
  layout: "17fae64f01dccd343fbccc733be891f7ba46a99bcc7bc973ef340b95aeb28063",
};
import { buildProduct, domains, root } from "../scripts/v1/build.mjs";
const out = await mkdtemp(join(tmpdir(), "gsis-migrations-"));
try {
  await buildProduct({ output: out });
  for (const domain of domains) {
    assert.equal(
      createHash("sha256")
        .update(await readFile(join(out, domain, "migrations/0001_owner.sql")))
        .digest("hex"),
      baselineHashes[domain],
      "deployed initial migration unchanged " + domain,
    );
    for (const file of await readdir(join(root, "v1/migrations", domain)))
      if (
        file.endsWith(".sql") &&
        file !== (domain === "roster" ? "001_roster.sql" : "0001.sql")
      )
        assert.equal(
          await readFile(join(out, domain, "migrations", file), "utf8"),
          await readFile(join(root, "v1/migrations", domain, file), "utf8"),
          "separate upgrade " + domain + "/" + file,
        );
  }
  console.log(
    "PASS deployed 0001 migrations byte-identical; subsequent migrations separately packaged for existing installs",
  );
} finally {
  await rm(out, { recursive: true, force: true });
}
