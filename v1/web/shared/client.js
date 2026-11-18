/* Explicit transport used by copied v1 browser modules. Native fetch is not replaced. */
(function (global) {
  "use strict";
  const nativeFetch = global.fetch.bind(global),
    module =
      document.querySelector('meta[name="gsis-module"]')?.content || "home";
  const service = { overlord: "lord", starlord: "lord" }[module] || module;
  const pending = new Map(),
    revisions = new Map(),
    moduleCapabilities = new Map(),
    lordPrepared = new Map(),
    readFlights = new Map();
  let session = null,
    sessionRead = null,
    config = null,
    challenge = null,
    logoutOperationId = null,
    securityEpoch = 0,
    lastSaveStatus = null;
  const suiteDomains = new Set([
    "core",
    "contacts",
    "deploy",
    "roster",
    "calendar",
    "lord",
    "venues",
    "layout",
  ]);
  const authPaths = new Set([
    "/api/config",
    "/api/client-config",
    "/api/auth/config",
    "/api/session",
    "/api/auth/session",
    "/api/auth/identity",
    "/api/logout",
    "/api/auth/logout",
    "/api/auth/google",
  ]);
  function canonical(value) {
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    if (value && typeof value === "object")
      return (
        "{" +
        Object.keys(value)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
          .join(",") +
        "}"
      );
    return JSON.stringify(value);
  }
  function response(value, status = 200, headers = {}) {
    return new Response(JSON.stringify(value), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        ...headers,
      },
    });
  }
  function nextLocation() {
    const url = new URL(location.href);
    return url.pathname + url.search;
  }
  async function signedOut() {
    session = null;
    sessionRead = null;
    pending.clear();
    revisions.clear();
    moduleCapabilities.clear();
    lordPrepared.clear();
    await clearProtectedState();
    if (module !== "home" && module !== "admin")
      location.assign(
        "/?next=" + encodeURIComponent(nextLocation()) + location.hash,
      );
    global.dispatchEvent(new CustomEvent("gsis:session-ended"));
  }
  async function clearProtectedState() {
    securityEpoch++;
    notifySaveStatus();
    loadedRecoveryContext = null;
    recoveryStorageError = null;
    readFlights.clear();
    lordGroups.clear();
    lordSelections.clear();
    lordVisibleGroups.clear();
    lordGrid = null;
    for (const store of [global.localStorage, global.sessionStorage]) {
      try {
        for (const key of Object.keys(store))
          if (/(?:gsis|gspscal|lord|deploy\.|roster|venues)/i.test(key))
            store.removeItem(key);
      } catch {}
    }
    try {
      const names = global.indexedDB?.databases
        ? await global.indexedDB.databases()
        : [{ name: "gsis-roster-baselines" }, { name: "lord_drafts_v1_4" }];
      for (const db of names)
        if (db.name && /gsis|roster|lord|venues/i.test(db.name))
          global.indexedDB.deleteDatabase(db.name);
    } catch {}
    global.dispatchEvent(new CustomEvent("gsis:clear-protected-state"));
  }
  async function getSession(force = false) {
    if (session && !force) return session;
    if (sessionRead && !force) return sessionRead;
    const readEpoch = securityEpoch;
    sessionRead = (async () => {
      const r = await nativeFetch("/api/core/session", {
          credentials: "same-origin",
          cache: "no-store",
          headers:
            module === "deploy" &&
            sessionStorage.getItem("gsis-preview-account")
              ? {
                  "X-GSiS-Preview-Account": sessionStorage.getItem(
                    "gsis-preview-account",
                  ),
                }
              : {},
        }),
        data = await r.json();
      if (readEpoch !== securityEpoch) return null;
      if (!r.ok || data.ok === false) {
        if (r.status === 401) {
          session = null;
          notifySaveStatus();
          return null;
        }
        throw Object.assign(
          Error(
            data.error?.message ||
              data.error ||
              "Sign-in could not be verified.",
          ),
          { status: r.status, code: data.error?.code || data.code },
        );
      }
      const next = data.data ?? data;
      if (!next.schoolId || !next.user || !Array.isArray(next.capabilities))
        throw Error("Sign-in returned an incomplete session.");
      if (
        session &&
        (session.schoolId !== next.schoolId ||
          session.user.accountId !== next.user.accountId ||
          session.user.email !== next.user.email ||
          session.impersonating !== next.impersonating)
      ) {
        pending.clear();
        revisions.clear();
        moduleCapabilities.clear();
        lordPrepared.clear();
        await clearProtectedState();
      }
      session = next;
      loadRecoveryReferences();
      notifySaveStatus();
      global.dispatchEvent(new CustomEvent("gsis:session", { detail: next }));
      return next;
    })().finally(() => {
      sessionRead = null;
    });
    return sessionRead;
  }
  async function getConfig() {
    if (config) return config;
    const r = await nativeFetch("/api/core/config", {
        credentials: "same-origin",
        cache: "no-store",
      }),
      data = await r.json();
    if (!r.ok || data.ok === false)
      throw Error(data.error || "School sign-in configuration is unavailable.");
    config = data.data ?? data;
    api.config = config;
    return config;
  }
  async function beginLogin() {
    const r = await nativeFetch("/api/core/login/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        credentials: "same-origin",
        cache: "no-store",
      }),
      data = await r.json();
    if (!r.ok || !data.ok)
      throw Error(data.error || "Could not start sign-in.");
    challenge = data.data;
    return challenge;
  }
  async function login(credential) {
    if (!challenge) throw Error("Restart sign-in to obtain a fresh challenge.");
    const r = await nativeFetch("/api/core/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          credential,
          challengeId: challenge.challengeId,
        }),
      }),
      body = await r.json();
    challenge = null;
    if (!r.ok || !body.ok)
      throw Object.assign(Error(body.error || "Sign-in was not accepted."), {
        code: body.code,
        status: r.status,
      });
    session = null;
    await clearProtectedState();
    const verified = await getSession(true);
    if (!verified)
      throw Error("Sign-in finished, but the session could not be verified.");
    return verified;
  }
  async function logout() {
    const current = await getSession();
    if (!current) {
      await signedOut();
      return;
    }
    logoutOperationId ??= crypto.randomUUID();
    const r = await nativeFetch("/api/core/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": current.csrfToken,
      },
      credentials: "same-origin",
      body: JSON.stringify({ operationId: logoutOperationId }),
    });
    const envelope = await r.json().catch(() => null),
      result = envelope?.data;
    if (
      !r.ok ||
      envelope?.ok !== true ||
      (result?.state !== "committed" &&
        result?.receipt?.state !== "committed" &&
        result?.signedOut !== true)
    )
      throw Error("Sign-out could not be confirmed. Retry the same request.");
    logoutOperationId = null;
    await clearProtectedState();
    session = null;
    pending.clear();
    revisions.clear();
    moduleCapabilities.clear();
    lordPrepared.clear();
    global.dispatchEvent(new CustomEvent("gsis:session-ended"));
  }
  function legacySession(s) {
    const admin =
      s.capabilities.includes("admin") || s.capabilities.includes("core.admin");
    return {
      email: s.user.email,
      sub: s.user.accountId,
      staffId: s.user.staffId,
      accountId: s.user.accountId,
      ttbName: s.user.ttbName || s.user.name || s.user.email,
      roles: admin ? ["Admin"] : s.user.roles || [],
      admin,
      isAdmin: admin,
      identityType: "GOOGLE",
      authenticated: true,
      expiresAt: s.expiresAt,
    };
  }
  async function authRequest(url, init) {
    const route = url.pathname;
    if (route.includes("config")) {
      const cfg = await getConfig();
      return response({
        ...cfg,
        googleClientId: cfg.clientId,
        calendarJobsEnabled: false,
        calendarChangePushEnabled: false,
      });
    }
    if (route.endsWith("logout")) {
      await logout();
      await signedOut();
      return response({ ok: true, data: { signedOut: true } });
    }
    if (
      (init.method || "GET").toUpperCase() === "POST" &&
      !route.endsWith("/identity")
    )
      return response(
        {
          ok: false,
          error: "Use the shared GSiS sign-in page.",
          code: "SIGN_IN_REQUIRED",
        },
        401,
      );
    const s = await getSession(true);
    if (!s) {
      await signedOut();
      return response(
        {
          ok: false,
          authenticated: false,
          error: "Sign in with your school account.",
          code: "SESSION_REQUIRED",
        },
        401,
      );
    }
    return response({
      ok: true,
      data: s,
      authenticated: true,
      session: legacySession(s),
    });
  }
  function routeUrl(input) {
    const url = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    );
    if (url.origin !== location.origin) return url;
    if (url.pathname === "/api" && module === "calendar")
      url.pathname = "/api/calendar/action";
    else if (
      url.pathname.startsWith("/api/") &&
      !suiteDomains.has(url.pathname.split("/")[2])
    )
      url.pathname = "/api/" + service + url.pathname.slice(4);
    return url;
  }
  function readOnlyRequest(path, body) {
    if (!body) return true;
    const name = body.operation || body.action || path.split("/").at(-1);
    return new Set([
      "bootstrap",
      "sync",
      "delta",
      "receipt",
      "receiptStatus",
      "publication-status",
      "save-receipt",
      "recovery-status",
      "recover-save",
      "withdraw",
      "publishReview",
      "auditPage",
      "versionNote",
      "profile",
      "read",
      "data",
      "deployment",
      "directory",
      "candidates",
      "availability",
      "history",
      "statistics",
      "statisticsCalendar",
      "timetableDay",
      "dailyTimetable",
      "stapler",
      "staplerDates",
      "dutyRoster",
      "openingBalances",
      "systemConfig",
      "allocationVersion",
      "currentDuty",
      "nextSchoolDay",
      "inboxList",
      "inboxThread",
      "inboxTemplates",
      "readiness",
      "preview",
      "export",
      "calendarPreflight",
      "mutationReceipts",
      "eventMutationStatus",
      "calendarSyncStatus",
      "calendarWipePreview",
    ]).has(name);
  }
  function captureRevision(url, body, data) {
    const domain = url.pathname.split("/")[2];
    const remember = (id, revision) => {
      if (!id || !Number.isSafeInteger(revision)) return;
      const key = domain + ":" + id;
      revisions.set(key, Math.max(revisions.get(key) ?? -1, revision));
    };
    // A Deploy Versions row can be edited while a different version is loaded.
    if (domain === "deploy" && Array.isArray(data?.versions)) {
      for (const version of data.versions) {
        if (typeof version?.id === "string") remember(version.id, version.revision);
      }
    }
    remember(
      data?.versionId || data?.currentId || data?.current?.id || body?.versionId,
      data?.current?.revision ?? data?.workingRevision ?? data?.revision,
    );
  }
  // The existing pending map owns preparation, dispatch and receipt recovery.
  // Persistent references contain identities/hashes only, never save payloads.
  const recoveryPrefix = "gsis-operation-references:v1:";
  let loadedRecoveryContext = null,
    recoveryStorageError = null;
  const unsentOperations = new WeakMap();
  function markUnsentOperation(
    error,
    domain,
    operationId,
    epoch,
    freshAttempt,
  ) {
    if (
      freshAttempt !== true ||
      !operationId ||
      recoveryStorageError ||
      epoch !== securityEpoch
    )
      return error;
    const proof = {
      ...operationContext(),
      service: domain,
      operationId,
      epoch,
    };
    if (!pending.has(operationKey(proof))) unsentOperations.set(error, proof);
    return error;
  }
  function isUnsentOperation(error, domain, operationId) {
    const proof =
      error && typeof error === "object" ? unsentOperations.get(error) : null;
    return (
      !!proof &&
      proof.service === domain &&
      proof.operationId === operationId &&
      proof.epoch === securityEpoch &&
      contextMatches(proof) &&
      !pending.has(operationKey(proof))
    );
  }
  const recoveryError = (message, code = "RECOVERY_UNAVAILABLE") =>
    Object.assign(Error(message), { code, status: 409 });
  const textHash = async (value) =>
    [
      ...new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      ),
    ]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("");
  const hash = (value) => textHash(canonical(value));
  function operationContext() {
    if (!session?.schoolId || !session.user?.accountId)
      throw recoveryError(
        "Sign in before preparing a request.",
        "SESSION_REQUIRED",
      );
    return {
      schoolId: session.schoolId,
      accountId: session.user.accountId,
      previewAccountId: session.impersonating
        ? session.previewAccountId || session.user.accountId
        : null,
    };
  }
  function contextMatches(value) {
    if (!session) return false;
    const current = operationContext();
    return ["schoolId", "accountId", "previewAccountId"].every(
      (k) => (value[k] ?? null) === current[k],
    );
  }
  function saveStatus() {
    return {
      contextEpoch: securityEpoch,
      uncertainCount: [...pending.values()].filter(
        (entry) =>
          entry.uncertain &&
          !entry.terminal &&
          entry.epoch === securityEpoch &&
          contextMatches(entry),
      ).length,
    };
  }
  function notifySaveStatus() {
    const signature = securityEpoch + ":" + saveStatus().uncertainCount;
    if (signature === lastSaveStatus) return;
    lastSaveStatus = signature;
    global.dispatchEvent(new CustomEvent("gsis:save-status"));
  }
  function markWriteUncertain(entry, epoch) {
    if (
      !entry ||
      !entry.dispatched ||
      entry.terminal ||
      epoch !== securityEpoch ||
      entry.epoch !== epoch ||
      !contextMatches(entry) ||
      pending.get(entry.key) !== entry
    )
      return;
    entry.uncertain = true;
    notifySaveStatus();
    global.dispatchEvent(new CustomEvent("gsis:uncertain", { detail: entry }));
  }
  function operationKey(value) {
    return canonical([
      value.schoolId,
      value.accountId,
      value.previewAccountId ?? null,
      value.service,
      value.operationId,
    ]);
  }
  function pendingCapacity() {
    const entries = [...pending.values()].filter((entry) => !entry.terminal);
    return (
      entries.length +
      entries.filter(
        (entry) =>
          entry.requiresLease &&
          !pending.has(
            operationKey({
              ...entry,
              operationId: entry.operationId + ":lease",
            }),
          ),
      ).length
    );
  }
  function isDeploySave(path, body) {
    return (
      path === "/api/deploy/change" &&
      typeof body?.versionId === "string" &&
      !isDeploySettingsImport(path, body) &&
      ![
        "publish",
        "retryContactsSync",
        "refreshVenueRegistry",
        "create",
        "createVersion",
        "clone",
      ].includes(body.operation)
    );
  }
  function isStaplerSave(path, body) {
    return path === "/api/roster/operations" && [
      "saveStapler", "confirmStapler", "publishStapler", "resetStapler",
      "renameStapler", "moveStapler", "deleteStapler", "restoreStapler",
    ].includes(body?.operation);
  }
  function isDeployCreation(path, body) {
    return (
      path === "/api/deploy/versions/create" ||
      (path === "/api/deploy/change" &&
        ["create", "createVersion", "clone"].includes(body?.operation))
    );
  }
  function isDeploySettingsImport(path, body) {
    return (
      path === "/api/deploy/change" &&
      body?.clientId === "v1-settings-import" &&
      body.scope === "meta" &&
      !Object.hasOwn(body, "operation") &&
      Array.isArray(body.edits)
    );
  }
  function isDeployPublish(path, body) {
    return (
      path === "/api/deploy/publish" ||
      (path === "/api/deploy/change" && body?.operation === "publish")
    );
  }
  function isDeployDeliveryRetry(path, body) {
    return (
      path === "/api/deploy/change" && body?.operation === "retryContactsSync"
    );
  }
  function calendarCommitInput(path, body) {
    if (!path.startsWith("/api/calendar/")) return null;
    const action = body.action || path.slice("/api/calendar/".length);
    if (!["savePdf", "archiveYearsCommit", "tableImportApply"].includes(action))
      return null;
    return {
      action,
      payload: body.action
        ? {
            ...(body.payload || {}),
            operationId: body.operationId || body.payload?.operationId,
          }
        : structuredClone(body),
    };
  }
  function operationReference(entry) {
    return {
      schemaVersion: 1,
      schoolId: entry.schoolId,
      accountId: entry.accountId,
      previewAccountId: entry.previewAccountId ?? null,
      service: entry.service,
      operationId: entry.operationId,
      versionId: entry.versionId || null,
      phase: entry.phase,
      preparationOperationId:
        entry.preparation?.operationId || entry.preparationOperationId || null,
      requestDigest: entry.requestDigest || null,
      digest: entry.ownerDigest || null,
      ...(entry.binding ? { originalFence: entry.binding.originalFence } : {}),
    };
  }
  function validReference(ref) {
    return (
      ref?.schemaVersion === 1 &&
      ref.service === "deploy" &&
      [ref.schoolId, ref.accountId, ref.operationId, ref.versionId].every(
        (x) => typeof x === "string" && x.length > 0 && x.length <= 256,
      ) &&
      [ref.requestDigest, ref.digest].every(
        (x) => x == null || /^[a-f0-9]{64}$/.test(x),
      )
    );
  }
  function loadRecoveryReferences() {
    if (module !== "deploy" || !session) return;
    const owner = canonical(operationContext());
    if (loadedRecoveryContext === owner) return;
    loadedRecoveryContext = owner;
    recoveryStorageError = null;
    try {
      const raw = sessionStorage.getItem(recoveryPrefix + owner);
      if (raw && raw.length > 131072) throw Error("Reference bound exceeded");
      const refs = raw ? JSON.parse(raw) : [];
      if (
        !Array.isArray(refs) ||
        refs.length > 128 ||
        refs.some((r) => !validReference(r) || !contextMatches(r)) ||
        new Set(refs.map(operationKey)).size !== refs.length
      )
        throw Error("Invalid references");
      const additions = refs.filter((ref) => !pending.has(operationKey(ref)));
      if (pendingCapacity() + additions.length > 128)
        throw Error("Reference bound exceeded");
      for (const ref of additions)
        pending.set(operationKey(ref), {
          ...ref,
          key: operationKey(ref),
          recoverable: true,
          phase: "reference-only",
          body: null,
          wire: null,
          ownerDigest: ref.digest,
          epoch: securityEpoch,
        });
    } catch {
      recoveryStorageError =
        "Saved operation references cannot be read. Keep this tab open and restore storage access before another save.";
    }
  }
  function persistRecoveryReferences() {
    if (module !== "deploy" || !session) return;
    if (recoveryStorageError)
      throw recoveryError(recoveryStorageError, "RECOVERY_STORAGE_UNAVAILABLE");
    const refs = [...pending.values()]
      .filter((x) => x.recoverable && contextMatches(x) && !x.terminal)
      .map(operationReference);
    if (refs.length > 128)
      throw recoveryError(
        "Resolve existing operations before starting another save.",
        "PENDING_BOUNDS",
      );
    try {
      sessionStorage.setItem(
        recoveryPrefix + canonical(operationContext()),
        JSON.stringify(refs),
      );
    } catch {
      throw recoveryError(
        "The original save reference could not be stored. No new request was sent; keep the draft and restore storage access.",
        "RECOVERY_STORAGE_UNAVAILABLE",
      );
    }
  }
  function snapshot(entry) {
    if (!entry) return null;
    return {
      ...operationReference(entry),
      preparationState: entry.preparationState || null,
      canRetry: !!entry.wire && !entry.terminal && contextMatches(entry),
      canRetryPreparation:
        entry.phase === "preparing" &&
        !!entry.preparation &&
        !!entry.initialBody &&
        contextMatches(entry),
      canWithdraw:
        !!entry.binding &&
        !entry.terminal &&
        entry.binding.action === "deploy.edit",
      storageError: entry.storageError || recoveryStorageError || null,
      ...(entry.terminal
        ? { state: entry.terminal.state, verified: true }
        : {}),
    };
  }
  function operationState(
    domain,
    operationId,
    { versionId, referenceOnly = false } = {},
  ) {
    loadRecoveryReferences();
    if (!session) return null;
    const ref = {
        schemaVersion: 1,
        ...operationContext(),
        service: domain,
        operationId,
        versionId,
      },
      key = operationKey(ref);
    if (!pending.has(key) && referenceOnly) {
      if (!validReference(ref) || session.impersonating)
        throw recoveryError(
          "The old save reference is invalid.",
          "RECOVERY_REFERENCE_INVALID",
        );
      if (pendingCapacity() >= 128)
        throw recoveryError(
          "Resolve existing operations before restoring another reference.",
          "PENDING_BOUNDS",
        );
      const entry = {
        ...ref,
        key,
        epoch: securityEpoch,
        recoverable: true,
        phase: "reference-only",
        wire: null,
      };
      pending.set(key, entry);
      try {
        persistRecoveryReferences();
      } catch (error) {
        pending.delete(key);
        throw error;
      }
    }
    return snapshot(pending.get(key));
  }
  function operationStates(domain) {
    loadRecoveryReferences();
    if (recoveryStorageError)
      throw recoveryError(recoveryStorageError, "RECOVERY_STORAGE_UNAVAILABLE");
    return [...pending.values()]
      .filter(
        (x) =>
          x.service === domain &&
          contextMatches(x) &&
          x.recoverable &&
          !x.terminal,
      )
      .map(snapshot);
  }
  function trimTerminalEntries() {
    const terminal = [...pending.entries()].filter(([, v]) => v.terminal);
    for (const [key] of terminal.slice(0, Math.max(0, terminal.length - 32)))
      pending.delete(key);
  }
  async function freezeEntry(entry, body) {
    const copy = structuredClone(body),
      intent = structuredClone(copy);
    delete intent.requestId;
    const requestDigest = await hash(intent);
    let ownerDigest = entry.ownerDigest || null;
    if (
      entry.recoverable ||
      isDeploySettingsImport(entry.path, copy) ||
      isDeployPublish(entry.path, copy) ||
      isDeployDeliveryRetry(entry.path, copy) ||
      ["/api/deploy/lease", "/api/deploy/imports/apply"].includes(entry.path) ||
      (entry.path === "/api/deploy/change" &&
        copy.operation === "refreshVenueRegistry") ||
      isDeployCreation(entry.path, copy)
    ) {
      const clean = structuredClone(copy);
      for (const k of [
        "requestId",
        "operationId",
        "protocol",
        "authority",
        "auditPaged",
        "reliefResults",
        "returnDelta",
        "since",
        "knownCatalogueHash",
      ])
        delete clean[k];
      ownerDigest = await hash({
        schoolId: entry.schoolId,
        actorId: entry.accountId,
        action:
          isDeployPublish(entry.path, copy) ||
          isDeployDeliveryRetry(entry.path, copy)
            ? "deploy.publish"
            : "deploy.edit",
        intent: clean,
      });
    } else if (
      ["/api/contacts/save-data", "/api/contacts/save-diy"].includes(
        entry.path,
      ) &&
      Array.isArray(copy.changes)
    ) {
      ownerDigest = await hash({
        schoolId: entry.schoolId,
        actorId: entry.accountId,
        action: entry.path.endsWith("save-diy")
          ? "contacts.self"
          : "contacts.manage",
        intent: { changes: copy.changes, additions: copy.additions || [] },
      });
    }
    const calendar = calendarCommitInput(entry.path, copy);
    if (calendar) {
      const payload = { ...calendar.payload };
      delete payload.requestId;
      ownerDigest = await hash({
        schoolId: entry.schoolId,
        actorId: entry.accountId,
        action: "calendar." + calendar.action,
        intent: { action: calendar.action, payload },
      });
      if (calendar.action === "savePdf" && typeof payload.base64 === "string")
        entry.pdfDigest = await textHash(payload.base64);
    }
    if (isDeployPublish(entry.path, copy))
      entry.createdPublicationId =
        "pub-" +
        (
          await hash({ school: entry.schoolId, operationId: entry.operationId })
        ).slice(0, 24);
    if (isDeployCreation(entry.path, copy))
      entry.createdVersionId =
        "version-" +
        (
          await hash({ school: entry.schoolId, operationId: entry.operationId })
        ).slice(0, 24);
    if (
      entry.epoch !== securityEpoch ||
      !contextMatches(entry) ||
      pending.get(entry.key) !== entry
    )
      throw recoveryError(
        "The account or original request changed during preparation.",
        "SESSION_CHANGED",
      );
    entry.body = copy;
    entry.wire = JSON.stringify(copy);
    entry.requestDigest = requestDigest;
    entry.ownerDigest = ownerDigest;
    entry.phase = "ready";
    if (entry.recoverable) persistRecoveryReferences();
  }
  function receiptFor(data) {
    return data?.receipt || data;
  }
  function settleMatchingReceipt(domain, data, epoch, dispatchedEntry = null) {
    if (epoch !== securityEpoch || !session) return;
    const receipt = receiptFor(data);
    if (
      !receipt?.operationId ||
      !["committed", "terminal-not-committed"].includes(receipt.state) ||
      !/^[a-f0-9]{64}$/.test(receipt.digest || "")
    )
      return;
    const key = operationKey({
        ...operationContext(),
        service: domain,
        operationId: receipt.operationId,
      }),
      entry = pending.get(key);
    if (!entry || !contextMatches(entry) || entry.recoverable) return;
    if (
      (data?.schoolId && data.schoolId !== entry.schoolId) ||
      (data?.actorId && data.actorId !== entry.accountId) ||
      (entry.ownerDigest && receipt.digest !== entry.ownerDigest)
    )
      return;
    const exactRequestBinding =
      data?.requestDigest === entry.requestDigest &&
      data?.schoolId === entry.schoolId &&
      data?.actorId === entry.accountId;
    // A direct terminal reply is tied to this exact dispatched request. A
    // different endpoint needs a known owner digest or complete request binding;
    // matching an ID alone cannot prove that an older same-ID intent is ours.
    if (!entry.ownerDigest && !exactRequestBinding && dispatchedEntry !== entry)
      return;
    pending.delete(key);
  }
  function settleDirectLease(entry, data, epoch) {
    if (
      !entry ||
      entry.path !== "/api/deploy/lease" ||
      !entry.dispatched ||
      epoch !== securityEpoch ||
      !contextMatches(entry) ||
      pending.get(entry.key) !== entry
    )
      return;
    const body = entry.body,
      scope = body.scope || body.key || "meta";
    if (
      entry.versionId !== body.versionId ||
      typeof body.versionId !== "string"
    )
      return;
    // This endpoint returns only finish()'s committed result. This narrow direct
    // response contract settles the lease itself, never the save it prepares.
    const valid = body.release
      ? data?.released === true
      : Number.isSafeInteger(data?.fence) &&
        data.fence > 0 &&
        data.token === data.fence &&
        Number.isSafeInteger(data.until) &&
        data.until > 0 &&
        data.scope === scope &&
        data.key === scope &&
        Number.isSafeInteger(data.revision) &&
        data.revision >= 0;
    if (valid) pending.delete(entry.key);
  }
  function settleDirectCreation(entry, data, epoch) {
    if (
      !entry ||
      !isDeployCreation(entry.path, entry.body) ||
      !entry.dispatched ||
      epoch !== securityEpoch ||
      !contextMatches(entry) ||
      pending.get(entry.key) !== entry
    )
      return;
    // Creation/clone shares create(): the version identity derives from the
    // owning school and operation, and finish() returns its committed result.
    if (
      data?.saved === true &&
      data.revision === 0 &&
      data.versionId === entry.createdVersionId &&
      data.requestId === (entry.body.requestId || entry.operationId)
    )
      pending.delete(entry.key);
  }
  function settleDirectImport(entry, data, epoch) {
    if (
      !entry ||
      (entry.path !== "/api/deploy/imports/apply" &&
        !isDeploySettingsImport(entry.path, entry.body)) ||
      !entry.dispatched ||
      epoch !== securityEpoch ||
      !contextMatches(entry) ||
      pending.get(entry.key) !== entry
    )
      return;
    // applyImport() delegates to save()/finish(); this direct acknowledgment is
    // its existing committed result, not an ordinary native save response.
    if (
      data?.saved === true &&
      data.versionId === entry.body.versionId &&
      data.requestId === (entry.body.requestId || entry.operationId) &&
      Number.isSafeInteger(data.changedRows) &&
      data.changedRows >= 0
    )
      pending.delete(entry.key);
  }
  function settleDirectPublication(entry, data, epoch) {
    if (
      !entry ||
      !entry.dispatched ||
      epoch !== securityEpoch ||
      !contextMatches(entry) ||
      pending.get(entry.key) !== entry ||
      data?.saved !== true ||
      data.versionId !== entry.body.versionId
    )
      return;
    const body = entry.body;
    let valid = false;
    if (isDeployPublish(entry.path, body)) {
      valid =
        data.state === "committed" &&
        data.requestId === (body.requestId || entry.operationId) &&
        data.publicationId === entry.createdPublicationId &&
        Number.isSafeInteger(body.expectedPointerSequence) &&
        data.sequence === body.expectedPointerSequence + 1 &&
        Number.isSafeInteger(data.workingRevision) &&
        data.workingRevision === (body.revision ?? body.expectedRevision);
    } else if (isDeployDeliveryRetry(entry.path, body)) {
      valid =
        typeof body.publicationCommit === "string" &&
        data.publicationId === body.publicationCommit &&
        data.contactsSync?.publicationCommit === body.publicationCommit &&
        ["updated", "pending"].includes(data.contactsSync.status);
    }
    // Publication and local requeue finish independently of recipient delivery.
    // Never settle an ordinary save from these independently managed responses.
    if (valid) pending.delete(entry.key);
  }
  function settleDirectCalendar(entry, data, epoch) {
    if (
      !entry ||
      !entry.dispatched ||
      epoch !== securityEpoch ||
      !contextMatches(entry) ||
      pending.get(entry.key) !== entry
    )
      return;
    const calendar = calendarCommitInput(entry.path, entry.body);
    if (!calendar) return;
    let valid = false;
    if (calendar.action === "savePdf") {
      valid =
        !!entry.pdfDigest &&
        data?.saved === true &&
        data.digest === entry.pdfDigest &&
        data.key ===
          entry.schoolId + "/calendar/pdf/" + entry.pdfDigest + ".pdf";
    } else if (calendar.action === "tableImportApply") {
      const book = calendar.payload.workbook;
      valid =
        data?.saved === true &&
        ["lanes", "tags"].includes(book?.kind) &&
        data.kind === book.kind &&
        /^[a-f0-9]{64}$/.test(book.sourceRevision || "") &&
        data.sourceRevision === book.sourceRevision &&
        Number.isSafeInteger(data.changedRecords) &&
        data.changedRecords >= 0 &&
        data.changedRecords <= 12;
    } else if (calendar.action === "archiveYearsCommit") {
      const prefix = entry.schoolId + "/calendar/archive/",
        key = data?.artifactKey;
      valid =
        data?.state === "committed" &&
        data.archived === true &&
        data.historyRetained === true &&
        data.driveExport === "queued" &&
        typeof data.fileName === "string" &&
        data.fileName.length > 0 &&
        typeof key === "string" &&
        key.startsWith(prefix) &&
        /^[a-f0-9]{64}\.json$/.test(key.slice(prefix.length)) &&
        data.downloadUrl ===
          "/api/calendar/archive-download?key=" + encodeURIComponent(key) &&
        [data.counts?.years, data.counts?.events, data.counts?.Events].every(
          (n) => Number.isSafeInteger(n) && n >= 0,
        ) &&
        data.counts.events === data.counts.Events;
    }
    // These existing routes return finish() only after the owner-local
    // commit. Queued Drive work is not delivery success or a cross-owner commit.
    if (valid) pending.delete(entry.key);
  }
  function verifyDeployRecovery(entry, data) {
    if (data?.state === "unknown" && !data.receipt)
      return {
        state: "unknown",
        verified: false,
        result: data,
        reference: snapshot(entry),
      };
    const expected = {
      schoolId: entry.schoolId,
      actorId: entry.accountId,
      service: "deploy",
      operationId: entry.operationId,
      action: "deploy.edit",
      versionId: entry.versionId,
    };
    if (
      data?.bindingVerified !== true ||
      Object.entries(expected).some(([k, v]) => data[k] !== v) ||
      !/^[a-f0-9]{64}$/.test(data.digest || "") ||
      !/^[a-f0-9]{64}$/.test(data.requestDigest || "") ||
      !Number.isSafeInteger(data.originalFence) ||
      data.originalFence < 1 ||
      !Number.isSafeInteger(data.currentFence) ||
      (entry.ownerDigest && entry.ownerDigest !== data.digest) ||
      (entry.requestDigest && entry.requestDigest !== data.requestDigest)
    )
      throw recoveryError(
        "The response does not prove the original save binding.",
        "RECEIPT_MISMATCH",
      );
    const receipt = data.receipt,
      terminal = ["committed", "aborted"].includes(data.state);
    if (
      terminal &&
      (!receipt ||
        receipt.operationId !== entry.operationId ||
        receipt.digest !== data.digest ||
        (data.state === "committed"
          ? receipt.state !== "committed" ||
            receipt.fence !== data.originalFence ||
            data.currentFence !== data.originalFence
          : receipt.state !== "terminal-not-committed" ||
            data.currentFence !== data.originalFence + 1))
    )
      throw recoveryError(
        "The terminal receipt does not match the original save.",
        "RECEIPT_MISMATCH",
      );
    if (
      !terminal &&
      (data.state !== "prepared" || data.currentFence !== data.originalFence)
    )
      throw recoveryError(
        "The original save state could not be verified.",
        "RECEIPT_MISMATCH",
      );
    entry.binding = structuredClone(data);
    entry.ownerDigest = data.digest;
    entry.requestDigest = data.requestDigest;
    const outcome = {
      state: data.state,
      verified: true,
      result: data,
      reference: snapshot(entry),
    };
    if (terminal) {
      entry.terminal = outcome;
      entry.phase = data.state;
      try {
        persistRecoveryReferences();
      } catch (error) {
        entry.storageError = error.message;
      }
      trimTerminalEntries();
      notifySaveStatus();
    }
    outcome.reference = snapshot(entry);
    outcome.canRetry = outcome.reference.canRetry;
    outcome.canWithdraw = outcome.reference.canWithdraw;
    return outcome;
  }
  async function recoverOperation(reference, mode = "check") {
    if (
      !["check", "retry", "withdraw"].includes(mode) ||
      !validReference(reference)
    )
      throw recoveryError(
        "Use the original protected save reference.",
        "RECOVERY_REFERENCE_INVALID",
      );
    await getSession(true);
    if (!contextMatches(reference) || session.impersonating)
      throw recoveryError(
        "This save belongs to another account or permission context.",
        "SESSION_CHANGED",
      );
    const epoch = securityEpoch,
      key = operationKey(reference);
    let entry = pending.get(key);
    if (!entry) {
      if (pendingCapacity() >= 128)
        throw recoveryError(
          "Resolve existing operations before restoring another reference.",
          "PENDING_BOUNDS",
        );
      entry = {
        ...reference,
        key,
        epoch,
        recoverable: true,
        phase: "reference-only",
        ownerDigest: reference.digest,
        wire: null,
      };
      pending.set(key, entry);
      try {
        persistRecoveryReferences();
      } catch (error) {
        pending.delete(key);
        throw error;
      }
    }
    if (entry.versionId !== reference.versionId)
      throw recoveryError(
        "The save belongs to another version.",
        "RECOVERY_REFERENCE_INVALID",
      );
    // A retained terminal result is UI history, not current permission. Even a
    // repeated check reauthorizes at the owner; never replay a terminal write.
    if (entry.terminal) mode = "check";
    if (mode === "retry") {
      if (
        !entry.wire &&
        !(entry.phase === "preparing" && entry.preparation && entry.initialBody)
      )
        throw recoveryError(
          "The complete original request is unavailable. Check its receipt; do not reconstruct it.",
          "ORIGINAL_REQUEST_UNAVAILABLE",
        );
      await request("deploy", "/change", {
        method: "POST",
        body: structuredClone(entry.body || entry.initialBody),
        retainedEntry: entry,
      });
    }
    const data = await request("deploy", "/receipt", {
      method: "POST",
      body: {
        operationId: entry.operationId,
        versionId: entry.versionId,
        recovery: true,
      },
    });
    if (
      epoch !== securityEpoch ||
      !contextMatches(entry) ||
      pending.get(key) !== entry
    )
      throw recoveryError(
        "The active request context changed.",
        "SESSION_CHANGED",
      );
    let outcome = verifyDeployRecovery(entry, data);
    if (mode === "check" && entry.phase === "preparing" && entry.preparation) {
      const status = await request("deploy", "/receipt", {
        method: "POST",
        body: {
          operationId: entry.preparation.operationId,
          versionId: entry.versionId,
        },
      });
      if (epoch !== securityEpoch || !contextMatches(entry))
        throw recoveryError(
          "The active request context changed.",
          "SESSION_CHANGED",
        );
      entry.preparationState = status?.state || "unknown";
      outcome.reference = snapshot(entry);
    }
    if (
      mode === "withdraw" &&
      outcome.verified &&
      outcome.state === "prepared"
    ) {
      entry.withdrawalId ||= crypto.randomUUID();
      const stopped = await request("deploy", "/operations/withdraw", {
        method: "POST",
        body: {
          operationId: entry.withdrawalId,
          targetOperationId: entry.operationId,
          versionId: entry.versionId,
          expectedDigest: data.digest,
          expectedRequestDigest: data.requestDigest,
          expectedFence: data.originalFence,
        },
      });
      if (
        epoch !== securityEpoch ||
        !contextMatches(entry) ||
        pending.get(key) !== entry
      )
        throw recoveryError(
          "The active request context changed.",
          "SESSION_CHANGED",
        );
      outcome = verifyDeployRecovery(entry, stopped);
    }
    return outcome;
  }
  function contactsProjection(path, data) {
    if (!data) return data;
    // Contacts owns formatting and privacy. Completed grid values and directory
    // people pass through unchanged; capability adaptation is still local.
    if (path.endsWith("/bootstrap")) {
      const caps = data.user?.capabilities ?? [],
        admin = data.user?.admin === true || caps.includes("admin"),
        manager =
          data.user?.powerUser === true || caps.includes("contacts.manage");
      return {
        ...data,
        user: {
          ...data.user,
          roles: admin ? ["Admin"] : manager ? ["ContactsPowerUser"] : [],
        },
        people: Array.isArray(data.people) ? data.people : [],
        access: Array.isArray(data.access) ? data.access : [],
        groups: data.groups || [],
        signatureSettings: data.signatureSettings || {},
      };
    }
    if (path.endsWith("/data") || path.endsWith("/diy")) {
      return {
        ...data,
        editable:
          data.editable ?? data.access?.write ?? data.user?.powerUser ?? false,
        lists: { ...(data.lists || {}), Active: ["Y", "N"] },
      };
    }
    return data;
  }
  const lordGroups = new Map(),
    lordSelections = new Map();
  let lordGrid = null,
    lordVisibleGroups = new Map();
  const groupStoragePrefix = "gsis-lord-group-bindings:v1:";
  function groupError(message, code = "GROUP_SELECTION_REQUIRED") {
    return Object.assign(Error(message), { code, status: 409 });
  }
  function checkedGroup(value) {
    if (
      !value ||
      typeof value.cart !== "string" ||
      !value.cart.trim() ||
      value.cart.length > 160 ||
      !/^[a-f0-9]{64}$/.test(value.revision || "") ||
      !Array.isArray(value.members) ||
      !value.members.length ||
      value.members.length > 20 ||
      new Set(value.members.map((x) => x?.resourceId)).size !==
        value.members.length ||
      value.members.some(
        (x) =>
          !x ||
          typeof x.resourceId !== "string" ||
          !x.resourceId ||
          x.resourceId.length > 160 ||
          !Number.isSafeInteger(x.revision) ||
          x.revision < 1 ||
          !Number.isSafeInteger(x.capacity) ||
          x.capacity < 1 ||
          x.capacity > 200,
      )
    )
      throw groupError(
        "The cart selection is incomplete. Refresh LORD booking choices before trying again.",
        "GROUP_SELECTION_INVALID",
      );
    return {
      cart: value.cart,
      revision: value.revision,
      members: value.members.map(({ resourceId, revision, capacity }) => ({
        resourceId,
        revision,
        capacity,
      })),
    };
  }
  function observeLordGroups(data) {
    if (!Array.isArray(data?.bookingResources)) return;
    lordGroups.clear();
    for (const row of data.bookingResources) {
      const matches = lordGroups.get(row.resource) || [];
      matches.push(row.bookingGroup ? structuredClone(row.bookingGroup) : null);
      lordGroups.set(row.resource, matches);
    }
  }
  function viewedLordGroup(resource) {
    const matches =
      lordSelections.get(resource) ||
      lordVisibleGroups.get(resource) ||
      lordGroups.get(resource);
    if (!matches)
      throw groupError(
        "Refresh LORD booking choices before booking this cart.",
      );
    if (matches.length !== 1)
      throw groupError(
        "This cart label is ambiguous. Ask an administrator to correct the inventory.",
        "GROUP_SELECTION_AMBIGUOUS",
      );
    return matches[0] ? checkedGroup(matches[0]) : null;
  }
  // The native grid captures its reference rows when rendered. Keep the same
  // evidence if a background refresh happens before the selected range is sent.
  if (module === "lord") {
    const bindGrid = () => {
      const grid = document.querySelector(".resource-timetable");
      if (!grid || grid === lordGrid) return;
      lordGrid = grid;
      lordVisibleGroups = new Map(
        [...lordGroups].map(([name, values]) => [
          name,
          structuredClone(values),
        ]),
      );
      const retained = new Set(
        [
          ...grid.querySelectorAll(
            ".timetable-cell.selected,.timetable-cell.start-selected",
          ),
        ].map((cell) => cell.dataset.resource),
      );
      for (const name of lordSelections.keys())
        if (!retained.has(name)) lordSelections.delete(name);
    };
    new MutationObserver(bindGrid).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    document.addEventListener(
      "click",
      (event) => {
        const cell = event.target.closest?.(".timetable-cell:not(.occupied)");
        if (!cell) return;
        bindGrid();
        if (!lordSelections.has(cell.dataset.resource)) {
          const selected = lordVisibleGroups.get(cell.dataset.resource);
          if (selected)
            lordSelections.set(
              cell.dataset.resource,
              structuredClone(selected),
            );
        }
      },
      true,
    );
  }
  function groupBindings() {
    if (!session?.schoolId || !session.user?.accountId)
      throw groupError("Sign in before preparing a cart booking.");
    const key =
      groupStoragePrefix +
      JSON.stringify([session.schoolId, session.user.accountId]);
    const raw = sessionStorage.getItem(key);
    if (raw && raw.length > 262144)
      throw groupError(
        "Stored cart confirmations exceed the supported bound. Resolve the original requests first.",
      );
    let values;
    try {
      values = raw ? JSON.parse(raw) : [];
    } catch {
      throw groupError(
        "Stored cart confirmation evidence is unreadable. Do not resend this booking with a new cart selection.",
        "GROUP_SELECTION_INVALID",
      );
    }
    if (
      !Array.isArray(values) ||
      values.length > 128 ||
      new Set(values.map((x) => x?.operationId)).size !== values.length ||
      values.some(
        (x) =>
          !x ||
          typeof x.operationId !== "string" ||
          !/^[a-f0-9]{64}$/.test(x.intentHash || "") ||
          !/^[a-f0-9]{64}$/.test(x.ownerDigest || "") ||
          !Array.isArray(x.selections) ||
          x.selections.length > 20 ||
          new Set(x.selections.map((s) => s?.index)).size !==
            x.selections.length ||
          typeof x.terminal !== "boolean",
      )
    )
      throw groupError(
        "Stored cart confirmation evidence is invalid. Resolve the original booking before continuing.",
        "GROUP_SELECTION_INVALID",
      );
    for (const item of values)
      for (const selection of item.selections) {
        if (
          !selection ||
          !Number.isSafeInteger(selection.index) ||
          selection.index < 0 ||
          selection.index >= 20
        )
          throw groupError(
            "Stored cart confirmation evidence is invalid.",
            "GROUP_SELECTION_INVALID",
          );
        checkedGroup(selection.group);
      }
    return { key, values };
  }
  function saveGroupBindings(store) {
    let text = JSON.stringify(store.values);
    while (store.values.length > 128 || text.length > 262144) {
      const index = store.values.findIndex((x) => x.terminal);
      if (index < 0)
        throw groupError(
          "Resolve the existing unconfirmed cart bookings before starting another.",
        );
      store.values.splice(index, 1);
      text = JSON.stringify(store.values);
    }
    sessionStorage.setItem(store.key, text);
  }
  function matchingLordGroupReceipt(operationId, receipt) {
    const entry = groupBindings().values.find(
      (x) => x.operationId === operationId,
    );
    return (
      !!entry &&
      receipt?.operationId === operationId &&
      receipt.digest === entry.ownerDigest &&
      ["committed", "terminal-not-committed"].includes(receipt.state)
    );
  }
  function completeStandaloneBooking(body) {
    const lines = Array.isArray(body?.bookings) ? body.bookings : [body];
    return (
      lines.length > 0 &&
      lines.length <= 20 &&
      lines.every(
        (line) =>
          !line?.resource &&
          !line?.bookingGroup &&
          Array.isArray(line?.items) &&
          line.items.length > 0 &&
          line.items.every(
            (item) =>
              typeof item?.resourceId === "string" &&
              item.resourceId.length > 0 &&
              Number.isSafeInteger(item.quantity) &&
              item.quantity > 0,
          ),
      )
    );
  }
  async function checkLordBookingReceipt(
    input,
    { path = "/api/lord/transaction" } = {},
  ) {
    if (
      ![
        "/api/lord/transaction",
        "/api/lord/bookings",
        "/api/lord/bookings/batch",
        "/api/lord/bookings/update",
      ].includes(path)
    )
      throw recoveryError(
        "The original booking endpoint is invalid.",
        "RECOVERY_REFERENCE_INVALID",
      );
    await getSession(true);
    if (service !== "lord" || session?.impersonating)
      throw recoveryError(
        "Sign in to check the original booking.",
        "SESSION_REQUIRED",
      );
    const epoch = securityEpoch,
      owner = operationContext(),
      body = structuredClone(input);
    const operationId =
      body?.operationId || body?.clientRequestId || body?.requestId;
    if (
      typeof operationId !== "string" ||
      !operationId ||
      operationId.length > 256
    )
      throw recoveryError(
        "The original booking reference is missing.",
        "RECOVERY_REFERENCE_INVALID",
      );
    let expected = null;
    const lines = Array.isArray(body.bookings) ? body.bookings : [body];
    const completeGroups =
      lines.length > 0 &&
      lines.length <= 20 &&
      lines.every((line) => {
        if (!line?.bookingGroup) return false;
        try {
          checkedGroup(line.bookingGroup);
          return true;
        } catch {
          return false;
        }
      });
    // An enriched final wire is immutable evidence. Never derive missing cart
    // membership from today's inventory or write replacement binding storage.
    if (
      body.operationId === operationId &&
      (completeGroups || completeStandaloneBooking(body))
    ) {
      const action =
        path.endsWith("/update") ||
        String(body.action || "").toLowerCase() === "bookingupdate" ||
        (!Array.isArray(body.bookings) && typeof body.bookingId === "string")
          ? "bookingupdate"
          : Array.isArray(body.bookings)
            ? "bookingcreatebatch"
            : "bookingcreate";
      const intent = structuredClone(body);
      delete intent.requestId;
      expected = await hash({
        schoolId: owner.schoolId,
        actorId: owner.accountId,
        action: "lord." + action,
        intent,
      });
    }
    if (!expected) {
      // Historical native/editor drafts may predate the enriched-wire format.
      // The original scoped binding can prove that exact raw request and path;
      // another body with the same ID cannot borrow its stored owner digest.
      let binding = null;
      try {
        binding = groupBindings().values.find(
          (value) => value.operationId === operationId,
        );
      } catch {}
      if (binding) {
        const raw = structuredClone(body);
        raw.operationId = operationId;
        delete raw.authority;
        if ((await hash([path, raw])) === binding.intentHash)
          expected = binding.ownerDigest;
      }
    }
    if (epoch !== securityEpoch || !contextMatches(owner))
      throw recoveryError("The active account changed.", "SESSION_CHANGED");
    const result = await requestUnshared(
      "lord",
      "/receipt?operationId=" + encodeURIComponent(operationId),
      { readOnlyLordReceipt: true },
    );
    if (epoch !== securityEpoch || !contextMatches(owner))
      throw recoveryError("The active account changed.", "SESSION_CHANGED");
    const receipt = receiptFor(result),
      verified =
        !!expected &&
        receipt?.operationId === operationId &&
        receipt.digest === expected &&
        ["committed", "terminal-not-committed"].includes(receipt.state);
    if (verified) {
      const key = operationKey({ ...owner, service: "lord", operationId }),
        entry = pending.get(key);
      if (entry && contextMatches(entry) && entry.ownerDigest === expected) {
        pending.delete(key);
        notifySaveStatus();
      }
    }
    return {
      state: verified
        ? receipt.state === "committed"
          ? "committed"
          : "aborted"
        : "unknown",
      verified,
      result,
    };
  }
  async function prepareLordBooking(
    body,
    path,
    expectedEpoch,
    { retained = false } = {},
  ) {
    if (expectedEpoch !== securityEpoch)
      throw groupError(
        "Your account changed. Reopen LORD before continuing.",
        "SESSION_CHANGED",
      );
    const initial = groupBindings(),
      epoch = securityEpoch,
      owner = JSON.stringify([session.schoolId, session.user.accountId]);
    const first = initial.values.find(
      (x) => x.operationId === body.operationId,
    );
    if (retained && !first && !completeStandaloneBooking(body))
      throw groupError(
        "The original cart binding is unavailable. Check the original receipt; do not rebuild this request from current inventory.",
        "ORIGINAL_REQUEST_UNAVAILABLE",
      );
    const copy = structuredClone(body),
      lines = Array.isArray(copy.bookings) ? copy.bookings : [copy];
    if (lines.length > 20)
      throw groupError(
        "Submit no more than twenty bookings.",
        "GROUP_SELECTION_INVALID",
      );
    // Capture the displayed evidence before either hash yields control.
    const candidates = first?.selections
      ? structuredClone(first.selections)
      : [];
    if (!first)
      for (const [index, line] of lines.entries()) {
        const group = line.bookingGroup
          ? checkedGroup(line.bookingGroup)
          : !line.items && line.resource
            ? viewedLordGroup(line.resource)
            : null;
        if (group) candidates.push({ index, group });
      }
    const apply = (selections) => {
      for (const { index, group } of selections) {
        if (!lines[index])
          throw groupError(
            "The retained cart selection does not match this request.",
            "GROUP_SELECTION_INVALID",
          );
        lines[index].bookingGroup = structuredClone(group);
      }
    };
    if (first)
      for (const { index, group } of candidates) {
        if (
          lines[index]?.bookingGroup &&
          canonical(checkedGroup(lines[index].bookingGroup)) !==
            canonical(group)
        )
          throw groupError(
            "This operation belongs to different cart evidence.",
            "OPERATION_ID_REUSED",
          );
      }
    apply(candidates);
    const action =
      path.endsWith("/update") ||
      String(copy.action || "").toLowerCase() === "bookingupdate"
        ? "bookingupdate"
        : Array.isArray(copy.bookings)
          ? "bookingcreatebatch"
          : "bookingcreate";
    const intent = structuredClone(copy);
    delete intent.requestId;
    const ownerIntent = {
      schoolId: session.schoolId,
      actorId: session.user.accountId,
      action: "lord." + action,
      intent,
    };
    const hashes = await Promise.all(
      [canonical([path, body]), canonical(ownerIntent)].map((value) =>
        crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      ),
    );
    if (
      epoch !== securityEpoch ||
      owner !== JSON.stringify([session?.schoolId, session?.user?.accountId])
    )
      throw groupError(
        "Your account changed. Reopen LORD before continuing.",
        "SESSION_CHANGED",
      );
    const [intentHash, candidateDigest] = hashes.map((value) =>
      [...new Uint8Array(value)]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join(""),
    );
    // No await between this fresh read, merge and persist: overlapping writes
    // and matching receipts cannot overwrite each other's retained evidence.
    const store = groupBindings(),
      prior = store.values.find((x) => x.operationId === body.operationId);
    if (
      prior &&
      prior.intentHash !== intentHash &&
      prior.ownerDigest !== candidateDigest
    )
      throw groupError(
        "This operation already belongs to different booking details. Check its original receipt.",
        "OPERATION_ID_REUSED",
      );
    const selections = prior?.selections || candidates,
      ownerDigest = prior?.ownerDigest || candidateDigest;
    apply(selections);
    if (!prior && selections.length) {
      store.values.push({
        operationId: body.operationId,
        intentHash,
        ownerDigest,
        selections,
        terminal: false,
      });
      saveGroupBindings(store);
    }
    return {
      body: copy,
      ownerDigest,
      grouped: selections.length > 0,
      created: !prior && selections.length > 0,
    };
  }
  function settleLordGroupBinding(operationId, receipt) {
    if (!matchingLordGroupReceipt(operationId, receipt)) return;
    const store = groupBindings(),
      prior = store.values.find((x) => x.operationId === operationId);
    if (prior) {
      prior.terminal = true;
      saveGroupBindings(store);
    }
  }

  async function lordMovement(body) {
    const id = body.operationId;
    if (lordPrepared.has(id)) return lordPrepared.get(id);
    const phase = body.action === "loan" ? "collection" : "return";
    if (!body.bookingId && !body.sessionId)
      throw Error("Choose a current booking before recording collection.");
    const value = await request(
        "lord",
        "/transaction?action=session&sessionId=" +
          encodeURIComponent(body.bookingId || body.sessionId),
      ),
      booking = value.session;
    if (
      !booking ||
      !Number.isSafeInteger(body.revision) ||
      body.revision !== booking.revision
    )
      throw Error(
        "The booking changed. Reload its current collection or return preview.",
      );
    const upload = async (item, index) => {
      if (!item.photoData) return [];
      const match =
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
          item.photoData,
        );
      if (!match)
        throw Error("Choose a supported photograph before continuing.");
      const result = await request("lord", "/photos", {
        method: "POST",
        body: {
          operationId: id + ":photo:" + index,
          bookingId: booking.bookingId,
          mime: match[1],
          base64: match[2],
          phase,
        },
      });
      const photoId = result.photoId ?? result.result?.photoId;
      if (!photoId)
        throw Error(
          "Photograph storage is not yet confirmed. Retry the same operation.",
        );
      return [photoId];
    };
    const items = [],
      photoIds = [];
    for (const [index, item] of body.trolleys.entries()) {
      const matches = (booking.trolleys || []).filter((r) =>
        item.resourceId
          ? r.resourceId === item.resourceId
          : item.trolleyRecordId
            ? r.trolleyRecordId === item.trolleyRecordId
            : r.name === item.name,
      );
      if (matches.length !== 1)
        throw Error(
          "Choose the exact booked trolley again; its identity could not be confirmed.",
        );
      const ids = await upload(item, index);
      photoIds.push(...ids);
      items.push({
        resourceId: matches[0].resourceId,
        quantity: Number(item.quantity),
        photoIds: ids,
        ...(item.issue
          ? {
              issueQuantity: Number(item.quantity),
              issueDescription: item.notes || body.issueNotes || "",
            }
          : {}),
      });
    }
    const accessories = {};
    for (const [kind, item] of Object.entries(body.accessories || {}))
      accessories[kind] = {
        quantity: Number(item.quantity || 0),
        photoIds: await upload(item, kind),
      };
    const prepared = {
      action: body.action,
      operationId: id,
      bookingId: booking.bookingId,
      sessionId: booking.bookingId,
      revision: body.revision,
      items,
      photoIds,
      accessories,
      comments: body.comments || "",
    };
    lordPrepared.set(id, prepared);
    return prepared;
  }
  function reserveWrite(
    url,
    body,
    epoch,
    retainedEntry = null,
    freshAttempt = false,
  ) {
    const owner = operationContext(),
      domain = url.pathname.split("/")[2],
      inputKey = url.pathname + url.search + "|" + canonical(body);
    const suppliedId =
      body.operationId ||
      body.requestId ||
      body.clientRequestId ||
      body.payload?.operationId ||
      body.payload?.requestId ||
      body.mutationId;
    let entry = suppliedId
      ? pending.get(
          operationKey({ ...owner, service: domain, operationId: suppliedId }),
        )
      : [...pending.values()].find(
          (x) =>
            !x.terminal &&
            contextMatches(x) &&
            x.service === domain &&
            x.inputKey === inputKey,
        );
    if (
      retainedEntry &&
      (entry !== retainedEntry || !contextMatches(retainedEntry))
    )
      throw recoveryError(
        "The original request is no longer available in this context.",
        "ORIGINAL_REQUEST_UNAVAILABLE",
      );
    if (entry) {
      if (
        !retainedEntry &&
        entry.inputKey !== inputKey &&
        canonical(body) !== canonical(entry.initialBody) &&
        canonical(body) !== canonical(entry.body)
      )
        throw recoveryError(
          "This operation already belongs to different request details.",
          "OPERATION_ID_REUSED",
        );
      return {
        entry,
        fresh: false,
        body: structuredClone(entry.body || entry.initialBody || body),
      };
    }
    const requiresLease =
      ((domain === "deploy" &&
      url.pathname === "/api/deploy/change" &&
      body.versionId &&
      !["create", "createVersion", "clone"].includes(body.operation)) ||
        isStaplerSave(url.pathname, body)) &&
      !body.leaseFence &&
      !body.token &&
      !(Number.isSafeInteger(body.fence) && body.fence > 0);
    const needsLease =
      requiresLease &&
      !(
        suppliedId &&
        pending.has(
          operationKey({
            ...owner,
            service: domain,
            operationId: suppliedId + ":lease",
          }),
        )
      );
    const consumesReservation =
      ((domain === "deploy" && url.pathname === "/api/deploy/lease") ||
        (url.pathname === "/api/roster/operations" && body.operation === "acquireStaplerLock")) &&
      [...pending.values()].some(
        (parent) =>
          !parent.terminal &&
          parent.requiresLease &&
          contextMatches(parent) &&
          parent.preparation?.operationId === suppliedId &&
          canonical(parent.preparation) === canonical(body),
      );
    // The live main entry reserves its missing prerequisite across every await;
    // only that exact child consumes the reserved slot, so unrelated writes
    // cannot steal it between the capacity check and lease dispatch.
    if (
      pendingCapacity() + (consumesReservation ? 0 : needsLease ? 2 : 1) >
      128
    )
      throw markUnsentOperation(
        recoveryError(
          "Resolve the existing unconfirmed operations before starting another save.",
          "PENDING_BOUNDS",
        ),
        domain,
        suppliedId,
        epoch,
        freshAttempt,
      );
    const copy = structuredClone(body);
    copy.operationId = suppliedId || crypto.randomUUID();
    delete copy.authority;
    if (
      copy.revision === undefined &&
      copy.versionId &&
      revisions.has(domain + ":" + copy.versionId)
    )
      copy.revision = revisions.get(domain + ":" + copy.versionId);
    if (copy.leaseFence === undefined && Number.isSafeInteger(copy.fence))
      copy.leaseFence = copy.fence;
    entry = {
      ...owner,
      service: domain,
      operationId: copy.operationId,
      versionId: copy.versionId || null,
      path: url.pathname,
      search: url.search,
      inputKey,
      epoch,
      phase: "preparing",
      requiresLease: !!requiresLease,
      recoverable: isDeploySave(url.pathname, copy),
      initialBody: structuredClone(copy),
      body: null,
      wire: null,
      dispatched: false,
    };
    entry.key = operationKey(entry);
    pending.set(entry.key, entry);
    try {
      if (entry.recoverable) persistRecoveryReferences();
    } catch (error) {
      if (pending.get(entry.key) === entry) pending.delete(entry.key);
      throw markUnsentOperation(error, domain, suppliedId, epoch, freshAttempt);
    }
    return { entry, fresh: true, body: copy };
  }
  async function prepareLordBookingRequest(
    path,
    input,
    { fresh = false } = {},
  ) {
    if (service !== "lord" || fresh !== true)
      throw recoveryError(
        "Only a new local booking may use preflight.",
        "RETAINED_OPERATION",
      );
    await getSession();
    const epoch = securityEpoch,
      url = routeUrl(path),
      body = structuredClone(input);
    if (!url.pathname.startsWith("/api/lord/"))
      throw recoveryError("Invalid LORD booking endpoint.");
    const slot = reserveWrite(url, body, epoch);
    if (!slot.fresh)
      throw Object.assign(
        recoveryError(
          "This is an earlier request. Check its original receipt.",
          "RETAINED_OPERATION",
        ),
        { reference: snapshot(slot.entry) },
      );
    const entry = slot.entry;
    try {
      const prior = groupBindings().values.find(
        (x) => x.operationId === entry.operationId,
      );
      if (prior)
        throw recoveryError(
          "This operation already has retained booking evidence.",
          "RETAINED_OPERATION",
        );
      const prepared = await prepareLordBooking(slot.body, url.pathname, epoch);
      entry.ownerDigest = prepared.ownerDigest;
      entry.grouped = prepared.grouped;
      entry.groupBindingCreated = prepared.created;
      entry.freshPreparation = true;
      entry.preparedBody = structuredClone(prepared.body);
      await freezeEntry(entry, prepared.body);
      const handle = Object.freeze({
        body: structuredClone(entry.body),
        reference: Object.freeze(snapshot(entry)),
      });
      entry.handle = handle;
      return handle;
    } catch (error) {
      if (pending.get(entry.key) === entry && !entry.dispatched) {
        if (entry.groupBindingCreated && contextMatches(entry)) {
          try {
            const store = groupBindings();
            store.values = store.values.filter(
              (x) =>
                !(
                  x.operationId === entry.operationId &&
                  x.ownerDigest === entry.ownerDigest &&
                  !x.terminal
                ),
            );
            saveGroupBindings(store);
          } catch (cleanup) {
            entry.cleanupRequired = true;
            entry.handle ||= Object.freeze({
              body: structuredClone(entry.body || entry.preparedBody),
              reference: Object.freeze(snapshot(entry)),
            });
            throw Object.assign(
              recoveryError(
                "The new request was not sent, but its local preparation could not be cleared. Restore browser storage and retry cleanup.",
                "PREPARATION_CLEANUP_REQUIRED",
              ),
              { prepared: entry.handle, cause: cleanup },
            );
          }
        }
        pending.delete(entry.key);
      }
      throw error;
    }
  }
  function releasePrepared(handle) {
    const entry = handle?.reference
      ? pending.get(operationKey(handle.reference))
      : null;
    if (
      !entry ||
      entry.handle !== handle ||
      !entry.freshPreparation ||
      entry.dispatched ||
      entry.epoch !== securityEpoch ||
      !contextMatches(entry) ||
      pending.get(entry.key) !== entry
    )
      return false;
    if (entry.grouped) {
      const store = groupBindings(),
        index = store.values.findIndex(
          (x) =>
            x.operationId === entry.operationId &&
            x.ownerDigest === entry.ownerDigest &&
            !x.terminal,
        );
      if (index >= 0) {
        store.values.splice(index, 1);
        saveGroupBindings(store);
      }
    }
    pending.delete(entry.key);
    return true;
  }
  async function suiteFetch(input, options = {}) {
    const requestEpoch = securityEpoch;
    const originalUrl = new URL(
      typeof input === "string" ? input : input.url,
      location.href,
    );
    if (originalUrl.origin !== location.origin) {
      if (
        /(?:^|\.)script\.google(?:usercontent)?\.com$/.test(
          originalUrl.hostname,
        )
      )
        throw Error("Apps Script is not a v1 runtime dependency.");
      return nativeFetch(input, options);
    }
    if (authPaths.has(originalUrl.pathname))
      return authRequest(originalUrl, options);
    const url = routeUrl(input);
    if (!url.pathname.startsWith("/api/")) return nativeFetch(input, options);
    const headers = new Headers(options.headers || {});
    headers.delete("X-GSiS-Actor");
    headers.delete("X-GSiS-Roles");
    headers.delete("X-GSiS-School");
    if (
      module === "deploy" &&
      url.pathname.startsWith("/api/deploy/") &&
      sessionStorage.getItem("gsis-preview-account")
    )
      headers.set(
        "X-GSiS-Preview-Account",
        sessionStorage.getItem("gsis-preview-account"),
      );
    if (module === "starlord" && url.pathname === "/api/lord/board") {
      const token = sessionStorage.getItem("gsis-signage-device");
      if (token) headers.set("X-GSiS-Device-Token", token);
      else {
        const current = await getSession();
        if (
          current?.capabilities.some((c) =>
            ["admin", "lord.signage"].includes(c),
          )
        )
          url.pathname = "/api/lord/signage";
      }
    }
    if (
      service === "lord" &&
      (url.pathname.endsWith("/bookings/availability") ||
        url.searchParams.get("action")?.toLowerCase() ===
          "bookingavailability") &&
      url.searchParams.has("resource") &&
      !url.searchParams.has("bookingGroup")
    ) {
      const selected = viewedLordGroup(url.searchParams.get("resource"));
      if (selected)
        url.searchParams.set("bookingGroup", JSON.stringify(selected));
    }
    const method = (options.method || "GET").toUpperCase();
    let body =
        typeof options.body === "string" ? JSON.parse(options.body) : null,
      key = null,
      freshPendingEntry = null,
      activeEntry = null,
      lordGroupAttempt = false;
    if (method !== "GET" && method !== "HEAD") {
      const current = await getSession();
      if (!current) {
        await signedOut();
        return response(
          { ok: false, error: "Sign in again.", code: "SESSION_REQUIRED" },
          401,
        );
      }
      headers.set("X-CSRF-Token", current.csrfToken);
      headers.delete("Authorization");
      if (
        body &&
        typeof body === "object" &&
        !Array.isArray(body) &&
        !readOnlyRequest(url.pathname, body)
      ) {
        const handle = options.prepared;
        if (handle) {
          const entry = handle.reference
            ? pending.get(operationKey(handle.reference))
            : null;
          if (
            !entry ||
            entry.cleanupRequired ||
            entry.handle !== handle ||
            pending.get(entry.key) !== entry ||
            !contextMatches(entry) ||
            entry.epoch !== requestEpoch ||
            entry.path !== url.pathname ||
            entry.search !== url.search ||
            canonical(body) !== canonical(entry.body)
          )
            throw recoveryError(
              "The prepared request no longer matches this form or account.",
              "PREPARATION_CHANGED",
            );
          activeEntry = entry;
          body = structuredClone(entry.body);
          key = entry.key;
          lordGroupAttempt = !!entry.grouped;
        } else {
          const slot = reserveWrite(
            url,
            body,
            requestEpoch,
            options.retainedEntry,
            options.freshAttempt,
          );
          activeEntry = slot.entry;
          body = slot.body;
          key = activeEntry.key;
          if (slot.fresh) freshPendingEntry = activeEntry;
        }
      }
    }
    if (
      service === "lord" &&
      body &&
      !options.prepared &&
      (["bookingcreate", "bookingcreatebatch", "bookingupdate"].includes(
        String(body.action || "").toLowerCase(),
      ) ||
        [
          "/api/lord/bookings",
          "/api/lord/bookings/batch",
          "/api/lord/bookings/update",
        ].includes(url.pathname))
    ) {
      let prepared;
      try {
        prepared = await prepareLordBooking(body, url.pathname, requestEpoch, {
          retained:
            options.retainedAttempt === true || !!activeEntry?.dispatched,
        });
      } catch (error) {
        // This invocation has not sent a request. Remove only its own new slot;
        // an earlier unknown operation or a concurrent replacement must remain.
        if (freshPendingEntry && pending.get(key) === freshPendingEntry)
          pending.delete(key);
        throw error;
      }
      lordGroupAttempt = prepared.grouped;
      if (activeEntry) {
        activeEntry.grouped = prepared.grouped;
        activeEntry.ownerDigest = prepared.ownerDigest;
      }
      body = prepared.body;
      if (requestEpoch !== securityEpoch)
        throw groupError(
          "Your account changed. Reopen LORD before continuing.",
          "SESSION_CHANGED",
        );
    }
    if (
      service === "lord" &&
      body &&
      ["loan", "return"].includes(body.action) &&
      Array.isArray(body.trolleys)
    )
      body = await lordMovement(body);
    if (
      service === "deploy" &&
      url.pathname === "/api/deploy/change" &&
      body?.versionId &&
      !["create", "createVersion", "clone"].includes(body.operation) &&
      !body.leaseFence &&
      !body.token
    ) {
      const leaseBody = activeEntry?.preparation || {
        operationId: body.operationId + ":lease",
        versionId: body.versionId,
        scope: body.scope || body.key || "meta",
        clientId: body.clientId || "v1-draft",
        ...((body.revision ?? body.expectedRevision) !== undefined
          ? { revision: body.revision ?? body.expectedRevision }
          : {}),
      };
      if (activeEntry) {
        activeEntry.preparation = structuredClone(leaseBody);
        persistRecoveryReferences();
      }
      const grantResponse = await suiteFetch("/api/deploy/lease", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leaseBody),
      });
      if (!grantResponse.ok) return grantResponse;
      const grant = (await grantResponse.json()).data;
      if (
        !Number.isSafeInteger(grant?.fence) ||
        grant.fence < 1 ||
        grant.token !== grant.fence ||
        !Number.isSafeInteger(grant.until) ||
        grant.until < 1 ||
        grant.scope !== leaseBody.scope ||
        grant.key !== leaseBody.scope ||
        !Number.isSafeInteger(grant.revision) ||
        grant.revision < 0
      )
        throw recoveryError(
          "The original lease result could not be confirmed. Check its receipt before retrying.",
          "LEASE_RESULT_UNCONFIRMED",
        );
      if (activeEntry) activeEntry.requiresLease = false;
      body = {
        ...body,
        clientId: body.clientId || "v1-draft",
        scope: body.scope || body.key || "meta",
        leaseFence: grant.fence,
      };
    }
    if (isStaplerSave(url.pathname, body) && !body.leaseFence && !body.fence) {
      // Derive the preparation from the retained request ID. After reload, the
      // native draft replays the same lease receipt, never a replacement fence.
      const leaseBody = activeEntry?.preparation || {
        operation: "acquireStaplerLock", operationId: body.operationId + ":lease",
        date: body.date, leaseSessionId: "save-" + await hash(body.operationId),
        ...(body.staplerRevision !== undefined ? { staplerRevision: body.staplerRevision } : {}),
      };
      if (activeEntry) activeEntry.preparation = structuredClone(leaseBody);
      const grantResponse = await suiteFetch("/api/roster/operations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leaseBody),
      });
      if (!grantResponse.ok) return grantResponse;
      const grant = (await grantResponse.json()).data;
      if (!Number.isSafeInteger(grant?.fence) || grant.fence < 1 ||
          grant.date !== body.date || grant.receipt?.operationId !== leaseBody.operationId ||
          grant.receipt?.state !== "committed")
        throw recoveryError("The original editing lock could not be confirmed. Retry the same save.", "LEASE_RESULT_UNCONFIRMED");
      if (activeEntry) activeEntry.requiresLease = false;
      body = { ...body, leaseSessionId: leaseBody.leaseSessionId, leaseFence: grant.fence };
    }
    if (activeEntry) {
      if (!activeEntry.wire) await freezeEntry(activeEntry, body);
      if (
        activeEntry.epoch !== securityEpoch ||
        !contextMatches(activeEntry) ||
        pending.get(activeEntry.key) !== activeEntry
      )
        throw recoveryError(
          "The active account changed before dispatch.",
          "SESSION_CHANGED",
        );
      body = structuredClone(activeEntry.body);
      lordGroupAttempt = !!activeEntry.grouped;
      activeEntry.dispatched = true;
      activeEntry.phase = "dispatched";
      if (activeEntry.recoverable) persistRecoveryReferences();
    }
    const {
      prepared: _prepared,
      retainedEntry: _retained,
      retainedAttempt: _retainedAttempt,
      readOnlyLordReceipt: _readOnlyLordReceipt,
      freshAttempt: _freshAttempt,
      ...fetchOptions
    } = options;
    let result;
    try {
      result = await nativeFetch(url, {
        ...fetchOptions,
        headers,
        credentials: "same-origin",
        cache: "no-store",
        ...(body ? { body: activeEntry?.wire || JSON.stringify(body) } : {}),
      });
    } catch (error) {
      markWriteUncertain(activeEntry, requestEpoch);
      throw error;
    }
    if (requestEpoch !== securityEpoch)
      return response(
        {
          ok: false,
          error:
            "The active account or permission context changed. Reload before continuing.",
          code: "SESSION_CHANGED",
        },
        401,
      );
    if (result.headers.get("Content-Type")?.includes("application/json")) {
      const failure = await result.clone().json();
      if (requestEpoch !== securityEpoch)
        return response(
          {
            ok: false,
            error:
              "The account changed while LORD was reading the response. Reload before continuing.",
            code: "SESSION_CHANGED",
          },
          401,
        );
      if (
        failure.ok === false &&
        failure.error &&
        typeof failure.error === "object"
      )
        result = response(
          {
            ...failure,
            error: failure.error.message || "The request was not accepted.",
            code: failure.error.code,
            retryable: failure.error.retryable,
            ...(failure.error.details || {}),
          },
          result.status,
        );
    }
    if (result.status === 401) {
      const denial = await result
        .clone()
        .json()
        .catch(() => ({}));
      if (!String(denial.code || "").startsWith("DEVICE_SESSION_"))
        await signedOut();
      return result;
    }
    if (result.status === 403) {
      const rejection = await result
        .clone()
        .json()
        .catch(() => ({}));
      if (
        [
          "CAPABILITY_DENIED",
          "ACCOUNT_SUSPENDED",
          "AUTHORITY_EVIDENCE_MISSING",
          "IMPERSONATION_DENIED",
        ].includes(rejection.code)
      ) {
        moduleCapabilities.clear();
        await clearProtectedState();
        global.dispatchEvent(new CustomEvent("gsis:denied"));
      }
    }
    if (!result.headers.get("Content-Type")?.includes("application/json"))
      return result;
    const envelope = await result.clone().json();
    if (requestEpoch !== securityEpoch)
      return response(
        {
          ok: false,
          error:
            "The account changed while LORD was reading the response. Reload before continuing.",
          code: "SESSION_CHANGED",
        },
        401,
      );
    if (envelope.ok === false) return result;
    const data = envelope.data;
    if (service === "roster" && Array.isArray(data?.entries))
      global.dispatchEvent(new CustomEvent("gsis:roster-baselines", { detail: data.entries }));
    if (service === "roster" && data?.workloadEvidence)
      global.dispatchEvent(new CustomEvent("gsis:roster-workload", { detail: {
        evidence: data.workloadEvidence, operation: body?.operation, view: body?.view,
        date: data.date || body?.date,
      } }));
    const capabilities = data?.user?.capabilities ?? data?.capabilities;
    if (
      Array.isArray(capabilities) &&
      capabilities.every((x) => typeof x === "string")
    ) {
      moduleCapabilities.set(url.pathname.split("/")[2], new Set(capabilities));
      global.dispatchEvent(new CustomEvent("gsis:capabilities"));
    }
    captureRevision(url, body, data);
    const receipt = data?.receipt || data;
    if (isStaplerSave(url.pathname, body) && receipt?.state === "committed" &&
        receipt.operationId === body.operationId && body.leaseSessionId && body.leaseFence) {
      // A confirmed save releases only its exact fence. A failed release cannot
      // undo the saved result; the bounded lease expires without another write.
      try {
        await suiteFetch("/api/roster/operations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ operation: "releaseStaplerLock",
            operationId: body.operationId + ":release", date: body.date,
            leaseSessionId: body.leaseSessionId, leaseFence: body.leaseFence }),
        });
      } catch { /* Saved receipt remains authoritative; no automatic retry. */ }
    }
    if (
      lordGroupAttempt &&
      ["committed", "terminal-not-committed"].includes(receipt?.state) &&
      !matchingLordGroupReceipt(body.operationId, receipt)
    )
      return response(
        {
          ok: false,
          error:
            "The receipt does not confirm the original cart booking. Check the original request before retrying.",
          code: "RECEIPT_MISMATCH",
          retryable: true,
        },
        202,
      );
    if (service === "lord" && !options.readOnlyLordReceipt) {
      if (
        url.pathname.endsWith("/reference") ||
        url.searchParams.get("action")?.toLowerCase() === "reference"
      )
        observeLordGroups(data);
      const groupOperation =
        body?.operationId || url.searchParams.get("operationId");
      if (
        session &&
        groupOperation &&
        (lordGroupAttempt || url.pathname.endsWith("/receipt"))
      ) {
        if (
          url.pathname.endsWith("/receipt") &&
          ["committed", "terminal-not-committed"].includes(receipt?.state) &&
          groupBindings().values.some(
            (x) => x.operationId === groupOperation,
          ) &&
          !matchingLordGroupReceipt(groupOperation, receipt)
        )
          return response(
            {
              ok: false,
              error:
                "The receipt does not match the original cart booking details.",
              code: "RECEIPT_MISMATCH",
              retryable: true,
            },
            202,
          );
        // Cleanup failure cannot overturn a correctly bound owner receipt.
        try {
          settleLordGroupBinding(groupOperation, receipt);
        } catch {}
      }
    }
    if (!options.readOnlyLordReceipt)
      settleMatchingReceipt(
        url.pathname.split("/")[2],
        data,
        requestEpoch,
        activeEntry,
      );
    settleDirectLease(activeEntry, data, requestEpoch);
    settleDirectCreation(activeEntry, data, requestEpoch);
    settleDirectImport(activeEntry, data, requestEpoch);
    settleDirectPublication(activeEntry, data, requestEpoch);
    settleDirectCalendar(activeEntry, data, requestEpoch);
    notifySaveStatus();
    if (
      key &&
      ["pending", "prepared", "unknown"].includes(receipt?.state) &&
      ((service === "lord" && url.pathname.endsWith("/transaction")) ||
        (service === "venues" && url.pathname.endsWith("/command")))
    )
      return response(
        {
          ok: false,
          error:
            "The operation is not yet confirmed. Retry the original operation to check or complete it.",
          code: "OPERATION_PENDING",
          retryable: true,
          operationId: body.operationId,
        },
        202,
      );
    if (module === "contacts" && data !== undefined) {
      const projected = contactsProjection(url.pathname, data);
      if (projected !== data)
        return response({ ...envelope, data: projected }, result.status);
    }
    if (module === "calendar" && data !== undefined)
      return response({ ...envelope, result: data }, result.status);
    if (
      ["lord", "overlord", "starlord"].includes(module) &&
      data !== undefined
    ) {
      if (url.pathname.endsWith("/transaction"))
        return response(
          {
            ...envelope,
            ...data,
            ...(Array.isArray(data.bookings)
              ? {
                  bookings: data.bookings.map((b) => ({
                    ...b,
                    requestedQuantity: b.requestedQuantity ?? "Not recorded",
                  })),
                }
              : {}),
            ...(data.booking
              ? {
                  booking: {
                    ...data.booking,
                    requestedQuantity:
                      data.booking.requestedQuantity ?? "Not recorded",
                  },
                }
              : {}),
            result: data.result ?? data,
          },
          result.status,
        );
      if (url.pathname.endsWith("/board") || url.pathname.endsWith("/signage"))
        return response({ ...envelope, ...data }, result.status);
    }
    return result;
  }
  async function requestUnshared(
    domain,
    path,
    {
      method = "GET",
      body,
      signal,
      headers: providedHeaders,
      prepared,
      retainedEntry,
      retainedAttempt,
      readOnlyLordReceipt,
      freshAttempt,
    } = {},
  ) {
    const epoch = securityEpoch;
    const headers = new Headers(providedHeaders || {});
    if (body) headers.set("Content-Type", "application/json");
    const result = await suiteFetch("/api/" + domain + path, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
      prepared,
      retainedEntry,
      retainedAttempt,
      readOnlyLordReceipt,
      freshAttempt,
    });
    let value;
    try {
      value = await result.json();
    } catch {
      throw Error(
        "The result could not be confirmed. Check its receipt before retrying.",
      );
    }
    if (epoch !== securityEpoch)
      throw recoveryError(
        "The active account changed while reading the response.",
        "SESSION_CHANGED",
      );
    if (!result.ok || value.ok === false)
      throw Object.assign(
        Error(value.error || "The request was not accepted."),
        {
          status: result.status,
          code: value.code,
          retryable: value.retryable,
          current: value.current,
        },
      );
    return value.data ?? value;
  }
  function request(domain, path, options = {}) {
    if (
      (options.method || "GET") !== "GET" ||
      options.body ||
      options.signal ||
      options.headers
    )
      return requestUnshared(domain, path, options);
    const key = securityEpoch + ":" + domain + ":" + path;
    let flight = readFlights.get(key);
    if (!flight) {
      flight = requestUnshared(domain, path, options).finally(() => {
        if (readFlights.get(key) === flight) readFlights.delete(key);
      });
      readFlights.set(key, flight);
    }
    return flight.then((value) => structuredClone(value));
  }
  async function preview(accountId) {
    await clearProtectedState();
    pending.clear();
    revisions.clear();
    moduleCapabilities.clear();
    lordPrepared.clear();
    if (accountId) sessionStorage.setItem("gsis-preview-account", accountId);
    else sessionStorage.removeItem("gsis-preview-account");
    session = null;
    sessionRead = null;
    location.assign("/deploy/");
  }
  const api = {
    preview,
    fetch: suiteFetch,
    request,
    getSession,
    getConfig,
    beginLogin,
    login,
    logout,
    clearProtectedState,
    module,
    service,
    config: null,
    capable: (cap) =>
      !!session &&
      !session.impersonating &&
      (session.capabilities.includes(cap) ||
        session.capabilities.includes("admin") ||
        moduleCapabilities.get(service)?.has(cap)),
    pending: () =>
      [...pending.values()]
        .filter((x) => !x.terminal)
        .map((x) => ({
          operationId: x.operationId,
          body: structuredClone(x.body || x.initialBody),
          path: x.path,
        })),
    operationState,
    operationStates,
    saveStatus,
    recoverOperation,
    isUnsentOperation,
    prepareLordBookingRequest,
    releasePrepared,
    checkLordBookingReceipt,
    canonical,
    verifyLordBookingReceipt: matchingLordGroupReceipt,
  };
  global.GSISV1 = api;
})(window);
