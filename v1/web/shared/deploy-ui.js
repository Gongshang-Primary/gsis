/* Empty-data navigation mirrors the v0.9 taxonomy without pretending a draft exists. */
(function () {
  "use strict";
  const labels = [
    "IP Deploy",
    "Dept",
    "Committees",
    "CCAs",
    "PLT",
    "Events",
    "Duty",
    "Workload",
    "Stats",
    "Ledger",
    "Duty Cards",
    "Classes & TGs",
    "Layout",
    "Program Settings",
    "Relief Settings",
    "HR Settings",
    "Workload Settings",
    "Versions",
    "ASC Export",
    "Audit",
  ];
  let fallback = false,
    create = null,
    selected = "Versions";
  function renderEmpty(next) {
    selected = next;
    const content = document.getElementById("content"),
      nav = document.getElementById("nav");
    if (!content || !nav) return;
    content.dataset.view = next;
    content.replaceChildren();
    const h = document.createElement("h2");
    h.textContent = next;
    const p = document.createElement("p");
    p.textContent =
      next === "Versions"
        ? "No planning version exists yet. Create the initial baseline to begin."
        : "This view becomes available after a planning version is created. Open Versions to begin.";
    content.append(h, p);
    if (next === "Versions" && create) content.append(create);
    else {
      const b = document.createElement("button");
      b.textContent = "Open Versions";
      b.onclick = () => renderEmpty("Versions");
      content.append(b);
    }
    nav.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("selected", b.dataset.tab === next);
      b.setAttribute("aria-current", b.dataset.tab === next ? "page" : "false");
    });
    dispatchEvent(new Event("gsis:navigation"));
  }
  function sync() {
    const nav = document.getElementById("nav"),
      content = document.getElementById("content"),
      version = document.getElementById("version");
    if (!nav || !content || !version) return;
    const exists = !!version.value;
    if (exists) {
      fallback = false;
      return;
    }
    if (
      !content.textContent.includes("No deployment version is available.") &&
      !fallback
    )
      return;
    const initial = [...content.querySelectorAll("button")].find(
      (b) => b.textContent === "Create initial baseline",
    );
    if (initial) create = initial;
    if (nav.hidden) nav.hidden = false;
    if (fallback && nav.querySelector("[data-empty-version]")) return;
    fallback = true;
    nav.replaceChildren();
    for (const label of labels) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = label;
      b.dataset.tab = label;
      b.dataset.emptyVersion = "";
      b.onclick = () => renderEmpty(label);
      nav.append(b);
    }
    renderEmpty(selected);
  }
  new MutationObserver((records) => {
    if (
      records.some(
        (r) =>
          r.target.id === "nav" ||
          r.target.id === "content" ||
          r.target.id === "version",
      )
    )
      sync();
  }).observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });
  sync();
})();
