import {
  directPresentation,
  isDirectField,
} from "../../contacts/direct-fields.mjs";
import { pinnedDefinitions, resolvedField } from "./catalogues.mjs";
// Pinned non-personal presentation pairs: Run B 4c2c5eef, 59 rows. No authority meaning.
export const FORMAL_ROLE_PAIRS = Object.freeze(
  [
    ["AE", "Administrative Executive"],
    ["AM", "Administration Manager"],
    [
      "AM (ICT)",
      "Administration Manager (Information and Communication Technology)",
    ],
    ["AYH", "Assistant Year Head"],
    ["Counsellor", "School Counsellor"],
    ["CSO", "Corporate Support Officer"],
    ["DE", "Desktop Engineer"],
    ["HOD CCE", "Head of Department (Character & Citizenship Education)"],
    ["HOD MTL", "Head of Department (Mother Tongue Languages)"],
    ["HOD EL", "Head of Department (English Language)"],
    [
      "HOD ICT",
      "Head of Department (Information and Communication Technology)",
    ],
    ["HOD Math", "Head of Department (Mathematics)"],
    [
      "HOD PAM & CCA",
      "Head of Department (Physical Education, Aesthetics, Music & CCA)",
    ],
    ["HOD Sci", "Head of Department (Science)"],
    ["HOD SM", "Head of Department (Student Management)"],
    ["ICT M", "Information and Communication Technology Manager"],
    ["ICT A", "Information and Communication Technology Associate"],
    ["LH CL", "Level Head (Chinese Language)"],
    ["LH EL", "Level Head (English Language)"],
    ["LH Math", "Level Head (Mathematics)"],
    ["LH Sci", "Level Head (Science)"],
    ["MK Ctr Hd", "Centre Head"],
    ["MK Dy Ctr Hd", "Deputy Centre Head"],
    ["MK ST CL", "Senior Teacher (Chinese Language)"],
    ["MKE", "MK Educator"],
    ["OM", "Operations Manager"],
    ["OSO", "Operation Support Officer"],
    ["P", "Principal"],
    ["Recep", "Receptionist"],
    ["SENO", "Special Educational Needs Officer"],
    ["SH CCE", "Subject Head (Character & Citizenship Education)"],
    ["SH ICT", "Subject Head (Information and Communication Technology)"],
    ["SH ML", "Subject Head (Malay Language)"],
    ["SH P&E", "Subject Head (Partnership and Engagement)"],
    ["SH PE", "Subject Head (Physical Education)"],
    ["SH SL", "Subject Head (Student Leadership)"],
    ["SH SM", "Subject Head (Student Management)"],
    ["SH SWB", "Subject Head (Student Well-Being)"],
    ["Snr SENO", "Senior Special Educational Needs Officer"],
    ["SSD", "School Staff Developer"],
    ["ST Art", "Senior Teacher (Art)"],
    ["ST CCE", "Senior Teacher (Character & Citizenship Education)"],
    ["ST CL", "Senior Teacher (Chinese Language)"],
    ["ST EdSup", "Senior Teacher (Education Support)"],
    ["ST EL", "Senior Teacher (English Language)"],
    ["ST Math", "Senior Teacher (Mathematics)"],
    ["ST ML", "Senior Teacher (Malay Language)"],
    ["ST Sci", "Senior Teacher (Science)"],
    ["ST SS", "Senior Teacher (Social Studies)"],
    ["ST HAL", "Senior Teacher (High Ability Learners)"],
    ["TC", "Teacher Counsellor"],
    ["VP(A)", "Vice Principal (Administration)"],
    ["VP(EO)", "Vice Principal"],
    ["YH", "Year Head"],
    ["Dentist", "Dentist"],
    ["Library", "Library Assistant"],
    ["Sci Lab", "Science Lab Assistant"],
    ["Security", "Security Staff"],
    ["SC", "School Counsellor"],
  ].map((pair) => Object.freeze(pair)),
);
const formalRoles = new Map(FORMAL_ROLE_PAIRS);
const formalLabels = new Set(FORMAL_ROLE_PAIRS.map(([, label]) => label));
export function formalRole(value) {
  return typeof value === "string"
    ? (formalRoles.get(value.trim()) ??
        (formalLabels.has(value.trim()) ? value.trim() : ""))
    : "";
}
/** Input is already privacy-filtered. Missing definitions affect presentation, never grant authority. */
export async function decorateContacts(db, schoolId, people, now) {
  const definitions = await pinnedDefinitions(
    db,
    schoolId,
    people.map((p) => p.fields ?? {}),
  );
  return Promise.all(
    people.map(async (person) => {
      const presentation = {},
        resolved = {},
        failures = new Set();
      for (const [field, row] of Object.entries(person.fields ?? {})) {
        if (
          !isDirectField(field) ||
          row.state !== "accepted" ||
          row.effective !== true ||
          row.revoked
        )
          continue;
        try {
          const r = await resolvedField(field, row, definitions);
          resolved[field] = r;
          presentation[field] = directPresentation(field, r);
        } catch {
          failures.add(field);
        }
      }
      const role = resolved.role,
        roleValue = role?.value,
        roleLabel = presentation.role?.items?.[0]?.label;
      const boundary = Object.entries(person.fields ?? {})
        .filter(([field]) =>
          ["role", "subjectTags", "statutoryName"].includes(field),
        )
        .flatMap(([, row]) => [
          row.validFrom,
          row.validUntil,
          ...(row.timeline ?? []).flatMap((r) => [r.validFrom, r.validUntil]),
        ])
        .filter((t) => Number.isSafeInteger(t) && t > now);
      const available = !failures.has("role") && !failures.has("subjectTags");
      return {
        ...person,
        presentation,
        formalRole: available
          ? role?.legacy
            ? formalRole(roleLabel)
            : formalRole(roleValue)
          : "",
        signatureSource: {
          available,
          reason: available ? null : "PINNED_EVIDENCE_UNAVAILABLE",
          asOf: now,
          validUntil: boundary.length ? Math.min(...boundary) : null,
        },
      };
    }),
  );
}
