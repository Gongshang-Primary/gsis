/** Verify obsolete/replaced Contacts, OVERLORD and Calendar legacy callers are
 * absent from built v1 assets while native v1 flows remain intact.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { productSuite } from "./v1-product/suite.mjs";
import {
  removeContactsLegacyRoleCaller,
  removeOverlordLegacyBackgroundCallers,
  removeCalendarLegacyQueueAndPushCallers,
} from "../scripts/v1/remove-obsolete-callers.mjs";

// Unit checks on line-count preservation and fail-closed anchors.
assert.throws(
  () => removeContactsLegacyRoleCaller("function unrelated(){}"),
  /Obsolete caller baseline changed/,
);
assert.throws(
  () => removeOverlordLegacyBackgroundCallers("function unrelated(){}"),
  /Obsolete caller baseline changed/,
);
assert.throws(
  () => removeCalendarLegacyQueueAndPushCallers("function unrelated(){}"),
  /Obsolete caller baseline changed/,
);

const suite = await productSuite();
try {
  const assets = join(suite.path, "product/web/assets");
  const contacts = await readFile(join(assets, "contacts/app.js"), "utf8");
  const overlord = await readFile(join(assets, "overlord/assets/app.js"), "utf8");
  const calendar = await readFile(join(assets, "calendar/app.js"), "utf8");

  assert.doesNotMatch(contacts, /api\(\s*['"]kp['"]/);
  assert.match(contacts, /\$\('roleForm'\)\.onsubmit=e=>\{e\.preventDefault\(\);location\.assign\('\/admin\/'\);\};/);

  assert.doesNotMatch(overlord, /['"]background(?:preview|apply|ack)['"]/);
  assert.match(overlord, /window\.GSISV1LordBackground\?\.open\?\.\(\)/);

  assert.doesNotMatch(calendar, /\/api\/calendar-(?:jobs|changes)\b/);
  assert.match(calendar, /Calendar v1 saves directly without the legacy job queue/);

  // Confirm each removal helper preserves exact line counts on unmodified v0.9 sources.
  const origContacts = await readFile("contacts-update/public/app.js", "utf8");
  const origOverlord = await readFile("lord-suite/Source/overlord/assets/app.js", "utf8");
  const origCalendar = await readFile("calendar-update/public/app.js", "utf8");
  assert.equal(
    removeContactsLegacyRoleCaller(origContacts).split("\n").length,
    origContacts.split("\n").length,
    "Contacts removal preserves exact line count",
  );
  assert.equal(
    removeOverlordLegacyBackgroundCallers(origOverlord).split("\n").length,
    origOverlord.split("\n").length,
    "OVERLORD removal preserves exact line count",
  );
  assert.equal(
    removeCalendarLegacyQueueAndPushCallers(origCalendar).split("\n").length,
    origCalendar.split("\n").length,
    "Calendar removal preserves exact line count",
  );
  assert.ok(
    calendar.includes("startCalendarChangeStream(){}"),
    "Calendar change-stream stub present",
  );
  assert.ok(
    origCalendar.includes("/api/calendar-jobs"),
    "Original v0.9 Calendar source remains untouched",
  );

  // Confirm native v1 Calendar direct save still works cleanly.
  const admin = await suite.seedAccount("obsolete-callers-admin");
  const yearOp = crypto.randomUUID();
  const yearRes = await suite.call(admin, "calendar", "/action", {
    action: "saveYear",
    operationId: yearOp,
    payload: {
      operationId: yearOp,
      Year: 2026,
      Status: "ACTIVE",
      ReleasedToTeachers: "No",
      expectedMetadataRevision: "missing",
    },
  });
  assert.equal(Number(yearRes?.Year ?? yearRes?.year?.Year ?? yearRes?.result?.Year), 2026);
  const eventOp = crypto.randomUUID();
  const saved = await suite.call(admin, "calendar", "/action", {
    action: "saveEvent",
    operationId: eventOp,
    payload: {
      operationId: eventOp,
      event: {
        Year: 2026,
        StaffTitle: "Synthetic Direct Save",
        StartDate: "2026-04-06",
        EndDate: "2026-04-06",
        StartTime: "08:00",
        EndTime: "09:00",
        OwnerTag: "ALL",
        LaneID: "L1",
      },
    },
  });
  assert.equal(saved?.StaffTitle ?? saved?.event?.StaffTitle ?? saved?.result?.StaffTitle, "Synthetic Direct Save");
  console.log("v1-product-obsolete-callers: PASS");
} finally {
  await suite.close();
}
