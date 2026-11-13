(function () {
  "use strict";
  const suite = window.GSISV1;
  if (!suite || suite.module === "home") return;
  const bar = document.createElement("nav");
  bar.className = "gsis-suitebar";
  bar.setAttribute("aria-label", "GSiS suite");
  const home = document.createElement("a");
  home.href = "/";
  home.textContent = "GSiS Home";
  bar.append(home);
  const name = document.createElement("strong");
  name.textContent = suite.module.toUpperCase();
  bar.append(name);
  const shortcuts = {
    contacts: [
      ["Authority & readiness", "Accepted authority"],
      ["Catalogues & staff", "Staff classifications"],
    ],
    deploy: [["Excel & publication", "Canonical Excel"]],
    roster: [
      ["Layers & duties", ["Allocation layers", "Relief duties done"]],
      ["Continuity", "Continuity exports"],
    ],
    layout: [["Owned data", "Layout-owned"]],
    overlord: [["Inventory", "LORD setup"]],
    starlord: [["Display access", "Signage access"]],
  };
  for (const [label, summary] of shortcuts[suite.module] || []) {
    const button = document.createElement("button");
    button.textContent = label;
    button.onclick = () => {
      const target = [...document.querySelectorAll("details")].find((node) =>
        (Array.isArray(summary) ? summary : [summary]).some((text) =>
          node.querySelector("summary")?.textContent.includes(text),
        ),
      );
      if (target) {
        target.open = true;
        target.scrollIntoView({ block: "start", behavior: "smooth" });
        target.querySelector("summary")?.focus();
      }
    };
    bar.append(button);
  }
  const identity = document.createElement("span");
  identity.className = "gsis-identity";
  bar.append(identity);
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  bar.append(status);
  const signout = document.createElement("button");
  signout.textContent = "Sign out";
  signout.onclick = async () => {
    signout.disabled = true;
    try {
      await suite.logout();
      location.assign("/");
    } catch (error) {
      status.textContent = error.message;
      signout.disabled = false;
    }
  };
  bar.append(signout);
  document.body.prepend(bar);
  function show(session) {
    identity.textContent = session.user.email;
    if (session.impersonating) {
      const preview = document.createElement("span");
      preview.className = "gsis-preview";
      preview.textContent = "Read-only impersonation";
      bar.append(preview);
      const stop = document.createElement("button");
      stop.textContent = "End preview";
      stop.onclick = () => suite.preview(null);
      bar.append(stop);
    }
    document.documentElement.dataset.gsisSchool = session.schoolId;
    document.documentElement.dataset.gsisActor = session.user.accountId;
  }
  suite
    .getSession()
    .then((session) => {
      if (session) show(session);
    })
    .catch((error) => {
      status.textContent = error.message;
    });
  window.addEventListener("gsis:clear-protected-state", () => {
    document
      .querySelectorAll("details.gsis-panel")
      .forEach((panel) => panel.remove());
    if (suite.module === "admin")
      document.querySelector("#adminContent")?.replaceChildren();
  });
  window.addEventListener("gsis:uncertain", () => {
    status.textContent =
      "Save outcome unknown. Check the original receipt before retrying.";
  });
  window.addEventListener("gsis:denied", () => {
    status.textContent =
      "Permission could not be confirmed. Protected saved drafts have been cleared.";
  });
})();
