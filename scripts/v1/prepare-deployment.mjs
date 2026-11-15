import { writeFile } from "node:fs/promises";
const text = process.env.GSIS_V1_SCHOOL_CONFIG;
if (!text)
  throw Error(
    "Set the environment variable GSIS_V1_SCHOOL_CONFIG in GitHub to the approved isolated configuration.",
  );
const config = JSON.parse(text),
  domains = [
    "core",
    "contacts",
    "deploy",
    "roster",
    "calendar",
    "lord",
    "venues",
    "layout",
  ];
if (
  config.schemaVersion !== 1 ||
  !config.resourcePrefix?.startsWith("gsis-v1-") ||
  config.schoolId === "synthetic-school"
)
  throw Error(
    "Use a separately named v1 resource prefix and real approved school configuration.",
  );
for (const d of domains)
  if (
    !/^[a-f0-9-]{36}$/i.test(config.databases?.[d] ?? "") ||
    !config.buckets?.[d]?.startsWith(config.resourcePrefix)
  )
    throw Error(
      "Configure every isolated owner database ID and private R2 bucket before deployment.",
    );
if (
  new Set(Object.values(config.databases)).size !== 8 ||
  new Set(Object.values(config.buckets)).size !== 8
)
  throw Error("Owners require eight distinct databases and buckets.");
if (
  !/^https:\/\//.test(config.publicOrigin) ||
  !config.googleClientId ||
  !config.hostedDomain
)
  throw Error(
    "Configure the preview HTTPS origin, Google client and school domain.",
  );
// Initial deployment never transfers sender, webhook, cron or production route ownership.
if (
  config.senderOwner === "v1" ||
  config.schedulerOwner === "v1" ||
  config.webhookOwner === "v1"
)
  throw Error(
    "Initial deployment keeps active integrations under existing ownership; cutover is a separate approved configuration action.",
  );
await writeFile("/tmp/gsis-v1-school.json", JSON.stringify(config), {
  mode: 0o600,
});
console.log(
  "Validated isolated resource configuration; no provisioning or live operation performed.",
);
