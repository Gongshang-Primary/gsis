/** Roster contactCreate handler (F03): validates relief-contact inputs, checks
 * current Contacts projection for exact/similar duplicates, and delegates
 * permanent Staff ID registration to Contacts /internal/register-provisional.
 */
import { requireValue, ApiError } from "../../runtime/errors.mjs";
import { digest } from "../../runtime/store.mjs";
import { serviceCall } from "../../runtime/security.mjs";
import { previewTTb } from "../../contacts/direct-fields.mjs";

const ALLOWED_TAGS = new Set([
  "BT",
  "UT",
  "SRE",
  "FAJT",
  "4/5",
  "Full-time",
  "MTL",
  "PE",
  "Art",
  "Music",
]);

function normalizeMobile(raw) {
  let digits = String(raw ?? "").replace(/[\s()+.-]/g, "");
  if (/^0065\d{8}$/.test(digits)) digits = digits.slice(4);
  else if (/^65\d{8}$/.test(digits)) digits = digits.slice(2);
  return digits;
}

function normText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function nameSimilarity(a, b) {
  const x = normText(a),
    y = normText(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const xs = new Set(x.split(" ")),
    ys = new Set(y.split(" "));
  let overlap = 0;
  for (const token of xs) if (ys.has(token)) overlap++;
  return (2 * overlap) / (xs.size + ys.size);
}

export async function createRosterContact(ctx, { revision, date }) {
  const { env, principal, body } = ctx;
  const schoolId = principal.schoolId;
  const operationId = String(body.operationId || body.requestId || "").trim();
  requireValue(
    /^[A-Za-z0-9][A-Za-z0-9_.:@-]{0,127}$/.test(operationId),
    "INVALID_INPUT",
    400,
    "An operation ID is required.",
  );
  const basicName = String(body.basicName ?? body.name ?? "").trim();
  requireValue(
    basicName.length > 0 && basicName.length <= 120,
    "INVALID_INPUT",
    400,
    "Enter the teacher's basic name.",
  );
  const mobile = normalizeMobile(body.mobile);
  requireValue(
    /^[89]\d{7}$/.test(mobile),
    "INVALID_INPUT",
    400,
    "Enter an eight-digit Singapore mobile number starting with 8 or 9.",
  );
  const rawModifier = String(body.modifier ?? body.employment ?? "SRE").trim() || "SRE";
  const tokens = rawModifier
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const tags = tokens.filter((t) => ALLOWED_TAGS.has(t));
  const employmentTags = tags.filter((t) =>
    ["BT", "UT", "SRE", "FAJT", "4/5", "Full-time"].includes(t),
  );
  const subjectTags = tags.filter((t) =>
    ["MTL", "PE", "Art", "Music"].includes(t),
  );
  const preview = previewTTb({ basicName, employmentTags, subjectTags });
  requireValue(
    preview.available,
    preview.reason || "INVALID_INPUT",
    400,
    "Shorten the Basic Name or modifiers so the derived TTb Name fits.",
  );

  // Compute deterministic Staff ID for this exact operationId so retries do not
  // falsely report their own already-committed record as a duplicate.
  const contactsOpId = `provisional-${await digest(["roster", operationId])}`;
  const expectedStaffId = `staff-${await digest([schoolId, contactsOpId])}`;

  const projection = await serviceCall(env, "contacts", "/internal/projection", {
    schoolId,
    decisionId: principal.decisionId,
    purpose: "roster",
    date,
  });
  const people = projection.people || projection.staff || [];
  const alreadyCommitted = people.find(
    (p) => (p.staffId || p.id) === expectedStaffId,
  );

  if (!alreadyCommitted) {
    const targetName = preview.name.toLowerCase();
    const duplicates = [];
    for (const p of people) {
      const pid = p.staffId || p.id;
      const pTtb = String(p.ttbName || p.name || "");
      const pBase = String(p.basicName || p.name || pTtb)
        .replace(/\s*\([^)]*\)/g, "")
        .trim();
      const pMobile = normalizeMobile(p.mobile);
      let match = null;
      if (pMobile && pMobile === mobile) match = "mobile";
      else if (pTtb.toLowerCase() === targetName) match = "ttbName";
      else if (nameSimilarity(basicName, pBase || pTtb) >= 0.7) match = "similar";
      if (match) {
        duplicates.push({
          id: pid,
          staffId: pid,
          name: pTtb,
          mobile: p.mobile || "",
          active: p.active === true,
          match,
        });
      }
    }
    const blocked = duplicates.some((d) => d.match !== "similar");
    if (blocked || (duplicates.length > 0 && body.confirmDistinct !== true)) {
      return {
        saved: false,
        blocked,
        duplicates,
        revision,
        message: blocked
          ? "This identity already exists. Select the existing contact in Known relief teacher."
          : "Check the similar names before adding.",
      };
    }
  }

  try {
    const created = await serviceCall(
      env,
      "contacts",
      "/internal/register-provisional",
      {
        schoolId,
        decisionId: principal.decisionId,
        operationId,
        basicName,
        mobile,
        ...(tags.length ? { tags } : {}),
      },
    );
    const staffId = created.staffId || expectedStaffId;
    const displayName = created.ttbName || created.name || preview.name;
    return {
      saved: true,
      person: {
        id: staffId,
        staffId,
        name: displayName,
        timetableName: displayName,
        basicName,
        mobile,
        active: false,
        employment: rawModifier,
      },
      revision,
      receipt: created.receipt || null,
    };
  } catch (error) {
    if (error instanceof ApiError && error.code === "IDENTITY_SELECTION_REQUIRED") {
      return {
        saved: false,
        blocked: true,
        duplicates: [],
        revision,
        message: "This identity already exists. Select the existing contact in Known relief teacher.",
      };
    }
    throw error;
  }
}
