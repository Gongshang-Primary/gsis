(function () {
  "use strict";
  const suite = window.GSISV1;
  if (!suite || suite.module === "home") return;
  document.documentElement.dataset.gsisModule = suite.module;
  const bar = document.createElement("nav");
  bar.className = "gsis-suitebar";
  bar.setAttribute("aria-label", "Breadcrumb");
  const home = document.createElement("a");
  home.href = "/";
  home.textContent = "GSiS";
  bar.append(home);
  const separator = () => {
    const span = document.createElement("span");
    span.textContent = "›";
    span.setAttribute("aria-hidden", "true");
    return span;
  };
  const names = {contacts:"Contacts",deploy:"Deploy",roster:"Roster",calendar:"Calendar",layout:"Layout",venues:"Venues",lord:"LORD",overlord:"OVERLORD",starlord:"STARLORD",admin:"Global Admin Toolbox"};
  const appHome = document.createElement("a");
  appHome.textContent = names[suite.module] || suite.module;
  appHome.href = "/" + suite.module + "/";
  const current = document.createElement("span");
  current.setAttribute("aria-current", "page");
  const sectionSeparator = separator();
  sectionSeparator.hidden = true;
  current.hidden = true;
  bar.append(separator(), appHome, sectionSeparator, current);
  function nativeHome() {
    if(suite.module === "contacts") return document.querySelector('.navbar [data-page="contacts"]');
    if(suite.module === "roster") return document.querySelector('#nav [data-page="Home"]');
    if(suite.module === "deploy") return document.querySelector('#nav [data-tab="IP Deploy"]');
    if(suite.module === "calendar") return document.querySelector('#nav [data-page="events"], #nav [data-view="events"], #nav button');
    if(suite.module === "layout") return document.getElementById("layoutTab");
    if(suite.module === "venues") return document.querySelector('.main-nav [data-view="book"]');
    return null;
  }
  appHome.onclick = event => {
    if(event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = nativeHome();
    if(target) {
      event.preventDefault();
      // Use the application's own handler so pending-edit/lease guards still run.
      target.click();
      window.scrollTo({top:0,behavior:"smooth"});
    }
  };
  function sectionName() {
    if(suite.module === "admin") return document.querySelector('[data-section][aria-current="page"]')?.textContent.trim() || "";
    if(suite.module === "venues") return document.querySelector('.main-nav [aria-current="page"]')?.textContent.trim() || "";
    if(suite.module === "lord") return document.querySelector("#main > .card h2")?.textContent.trim() || "";
    if(suite.module === "deploy") return document.getElementById("content")?.dataset.view || document.querySelector("#settingsSubnav .selected, #nav .selected")?.textContent.trim() || "";
    const selected = suite.module === "roster"
      ? document.querySelector('#nav [aria-current="page"]')
      : suite.module === "contacts"
        ? document.querySelector('.navbar .nav-button.active')
        : suite.module === "layout"
          ? document.querySelector('nav[aria-label="Campus views"] .active')
          : document.querySelector('#nav .active, #nav [aria-current="page"], .navbar .active');
    return selected?.textContent.trim() || "";
  }
  // Panels keep their original event handlers and capability checks. Parking a
  // panel during another view never turns a hidden/denied panel into an allowed one.
  const parked = document.createElement("div");
  parked.hidden = true;
  parked.dataset.gsisPanelParking = "";
  const panels = new Map();
  let lordUser = null;
  const panelKinds = {
    "Accepted authority records and readiness":"contacts-authority",
    "Allocation layers and duties done":"roster-policy",
    "Relief duties done":"roster-policy",
    "Continuity exports and offline return":"roster-continuity",
    "Canonical Excel and publication receipts":"deploy-publication",
    "Layout-owned data":"layout-data",
    "LORD setup and inventory":"lord-settings",
    "Signage access":"signage",
  };
  function hostFor(kind) {
    const explicit = document.querySelector('[data-gsis-panel-host="'+kind+'"]');
    if(explicit) return explicit;
    const section=sectionName();
    if(kind === "contacts-authority") return document.getElementById(suite.capable("contacts.manage") || suite.capable("contacts.accept") ? "admin" : "diy");
    if(kind === "roster-policy" && /System Config|My Relief Duties/.test(section)) return document.querySelector('#content [data-settings-body]') || document.getElementById("content");
    if(kind === "roster-continuity" && section === "System Config") return document.querySelector('#content [data-settings-body]') || document.getElementById("content");
    if(kind === "deploy-publication" && section === "Versions") return document.getElementById("content");
    if(kind === "layout-data") return document.getElementById("tgView");
    if((kind === "lord-settings" || kind === "signage") && suite.module === "overlord") return document.getElementById("settingsBody");
    return null;
  }
  const fittedTables = new WeakMap();
  const scrollFrames = ".gsis-core-scroll,.gsis-scroll,.table-scroll,.data-table-wrap";
  const scheduleGrids = ".weekly-grid,.timetable-grid,.booking-grid,[data-schedule-matrix]";
  let pointerDown = false;
  function fitLoadedTables() {
    if (pointerDown) return;
    for (const table of document.querySelectorAll("table")) {
      if (!table.getClientRects().length || table.matches(scheduleGrids)) continue;
      if (table.matches(".gsis-compact") && typeof window.GSISTableFit === "function") {
        // Sorting moves the same nodes. New data or controls need measuring
        // once the owner has rendered them and wired its native table.
        const inputs = table.querySelectorAll("input,select,textarea");
        const content = new Set([...table.rows, ...inputs]);
        const before = fittedTables.get(table);
        if (before?.size === content.size && [...content].every(node => before.has(node))) continue;
        const focused = document.activeElement;
        if (table.contains(focused) && focused.matches("input,select,textarea,[contenteditable],[data-core-resize],.member-resize")) continue;
        window.GSISTableFit(table);
        fittedTables.set(table, content);
      } else if (
        !table.classList.contains("gsis-fit-content") &&
        table.parentElement?.matches(scrollFrames) &&
        !table.querySelector(":scope > colgroup") &&
        getComputedStyle(table).tableLayout === "auto"
      ) {
        table.classList.add("gsis-fit-content");
      }
    }
  }
  let queued = false;
  function reconcile() {
    queued = false;
    const section = sectionName();
    const modal = document.querySelector('dialog[open] h2, dialog[open] h1');
    const label = modal?.textContent.trim() || (section === "Home" || section === names[suite.module] ? "" : section);
    if(current.textContent !== label) current.textContent = label;
    if(current.hidden !== !label) current.hidden = !label;
    if(sectionSeparator.hidden !== !label) sectionSeparator.hidden = !label;
    if(!parked.isConnected) document.body.append(parked);
    for(const panel of document.querySelectorAll('details.gsis-panel')) {
      const summary=panel.querySelector(':scope > summary')?.textContent.trim();
      const kind=panel.dataset.panelId || panelKinds[summary];
      if(kind && !panels.has(kind)) panels.set(kind,panel);
    }
    for(const [kind,panel] of panels) {
      const host=hostFor(kind) || parked;
      if(panel.parentNode !== host) {
        host.append(panel);
        if(host !== parked && !panel.open) panel.open=true;
      }
      if(kind === "roster-policy" && host !== parked) {
        const view = /My Relief Duties/.test(section) ? "ledger" : "policy";
        if(panel.dataset.gsisMountedView !== view) {
          panel.dataset.gsisMountedView=view;
          panel.querySelector('[data-view="'+view+'"]')?.click();
        }
      }
    }
    lordUser ||= document.getElementById("gsisLordUser");
    if(lordUser) {
      const bookings = [...document.querySelectorAll('#main .card')].find(card => card.querySelector('h2')?.textContent.trim() === 'Manage Bookings');
      const host = document.querySelector('[data-gsis-panel-host="lord-user"]') || bookings?.querySelector('.action-grid') || document.querySelector('#main .menu-card .section-book') || parked;
      if(lordUser.parentNode !== host) host.append(lordUser);
      // The existing booking actions and recovery dialogs remain intact. Only
      // their entry points join the native Book group / Manage Bookings actions.
      if(lordUser.className !== 'gsis-lord-actions') lordUser.className = 'gsis-lord-actions';
    }
    fitLoadedTables();
  }
  function schedule() { if(!queued) { queued=true; requestAnimationFrame(reconcile); } }
  new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["class","hidden","aria-current","open"]});
  document.addEventListener("click",schedule);
  document.addEventListener("focusout",schedule);
  document.addEventListener("pointerdown",event => { if (event.isPrimary) pointerDown = true; },true);
  for (const event of ["pointerup","pointercancel"])
    window.addEventListener(event,() => { pointerDown = false; schedule(); },true);
  window.addEventListener("hashchange",schedule);
  window.addEventListener("gsis:navigation",schedule);
  window.GSISV1Navigation = {refresh:schedule};
  schedule();
  const identity = document.createElement("span");
  identity.className = "gsis-identity";
  bar.append(identity);
  const status = document.createElement("span");
  status.setAttribute("role", "status");
  bar.append(status);
  let statusOwner = null,
    statusEpoch = suite.saveStatus?.().contextEpoch ?? 0;
  function showStatus(text, owner) {
    status.textContent = text;
    statusOwner = owner;
  }
  function renderSaveStatus() {
    const saved = suite.saveStatus?.();
    if (
      Number.isSafeInteger(saved?.contextEpoch) &&
      saved.contextEpoch !== statusEpoch
    ) {
      statusEpoch = saved.contextEpoch;
      showStatus("", null);
    }
    const count = saved?.uncertainCount;
    if (count > 0 && (!statusOwner || statusOwner === "uncertainty"))
      showStatus(
        "Save outcome unknown. Check the original receipt before retrying.",
        "uncertainty",
      );
    else if (count === 0 && statusOwner === "uncertainty")
      showStatus("", null);
  }
  const signout = document.createElement("button");
  signout.textContent = "Sign out";
  signout.onclick = async () => {
    signout.disabled = true;
    const epoch = statusEpoch;
    try {
      await suite.logout();
      location.assign("/");
    } catch (error) {
      if (epoch === statusEpoch) showStatus(error.message, "other");
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
  const initialStatusEpoch = statusEpoch;
  suite
    .getSession()
    .then((session) => {
      if (session) { show(session); schedule(); }
    })
    .catch((error) => {
      if (initialStatusEpoch === statusEpoch) showStatus(error.message, "other");
    });
  window.addEventListener("gsis:clear-protected-state", () => {
    if (Number.isSafeInteger(suite.saveStatus?.().contextEpoch)) renderSaveStatus();
    else {
      statusEpoch++;
      showStatus("", null);
    }
    panels.clear();
    lordUser = null;
    document
      .querySelectorAll("details.gsis-panel")
      .forEach((panel) => panel.remove());
    if (suite.module === "admin")
      document.querySelector("#adminContent")?.replaceChildren();
  });
  window.addEventListener("gsis:save-status", renderSaveStatus);
  window.addEventListener("gsis:uncertain", renderSaveStatus);
  window.addEventListener("gsis:denied", () => {
    showStatus(
      "Permission could not be confirmed. Protected saved drafts have been cleared.",
      "denied",
    );
  });
  renderSaveStatus();
})();
