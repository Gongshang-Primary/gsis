import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
const dom = new JSDOM("<main></main>", {
    url: "https://synthetic.test/overlord/",
    runScripts: "outside-only",
  }),
  { window } = dom;
window.structuredClone = structuredClone;
const writes = [],
  adapters = new Map();
window.GSISCoreTables = {
  refresh() {},
  register(selector, contract) {
    adapters.set(selector, contract);
  },
};
const resource = {
  id: "cart",
  name: "Trolley",
  capacity: 10,
  type: "tablet",
  cart: "North",
  stylusOption: true,
  headphoneOption: false,
  active: true,
  exclusive: true,
  bufferPeriods: 0,
  revision: 1,
};
const api = {
  getSession: async () => ({ schoolId: "synthetic-school" }),
  request: async (owner, path, options) => {
    if (options?.method === "POST") {
      writes.push({ path, body: options.body });
      return {
        receipt: { state: "committed" },
        resources: options.body.resources?.map((r) => ({
          resourceId: r.resourceId,
          revision: r.revision + 1,
        })),
        revision: 2,
      };
    }
    if (path.startsWith("/resources")) return { resources: [resource] };
    return {
      settings: [
        {
          setting_key: "referenceLists",
          revision: 1,
          value_json: JSON.stringify({ classes: ["1A"], subjects: ["Art"] }),
        },
        {
          setting_key: "periodTimings",
          revision: 1,
          value_json: JSON.stringify({
            periods: [{ code: "1", start: "07:30", end: "08:00" }],
          }),
        },
      ],
    };
  },
};
try {
  window.eval(
    await readFile(
      new URL("../v1/web/shared/lord-reference-tables.js", import.meta.url),
      "utf8",
    ),
  );
  window.GSISV1LordReferenceTables.install(
    window.document.querySelector("main"),
    api,
  );
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(
    window.document.querySelectorAll("table[data-core-table]").length,
    4,
  );
  assert.equal(window.document.querySelectorAll("textarea").length, 0);
  const table = window.document.querySelector(
    "table[data-lord-reference=resources]",
  );
  assert.equal(table.tBodies[0].rows[0].querySelector("input").readOnly, true);
  const inputs = table.tBodies[0].rows[0].querySelectorAll("input");
  inputs[1].value = "Updated trolley";
  inputs[6].checked = true;
  const save = [...table.parentElement.querySelectorAll("button")].find((b) =>
    b.textContent.startsWith("Save"),
  );
  await save.onclick();
  assert.equal(writes.length, 1);
  assert.equal(writes[0].path, "/resources/batch");
  assert.equal(writes[0].body.resources[0].name, "Updated trolley");
  assert.equal(writes[0].body.resources[0].metadata.headphoneOption, true);
  assert.equal(writes[0].body.resources[0].metadata.cart, "North");
  const classes = window.document.querySelector(
    "table[data-lord-reference=classes]",
  );
  classes.querySelector("tbody input").value = "1B";
  const subject = window.document.querySelector(
    "table[data-lord-reference=subjects]",
  );
  subject.querySelector("tbody input").value = "Unsaved subject";
  await [...classes.parentElement.querySelectorAll("button")]
    .find((b) => b.textContent.startsWith("Save"))
    .onclick();
  assert.deepEqual(
    JSON.parse(JSON.stringify(writes[1].body.value)),
    { classes: ["1B"], subjects: ["Art"] },
    "saving classes must not silently include unsaved subject edits",
  );
  assert.equal(adapters.size, 4);
  assert.equal(
    typeof adapters.get('table[data-lord-reference="resources"]').importAll,
    "function",
  );
  console.log(
    "LORD reference UI: typed editable tables, permanent IDs, atomic resource request and separate unsaved lists passed",
  );
} finally {
  window.close();
}
