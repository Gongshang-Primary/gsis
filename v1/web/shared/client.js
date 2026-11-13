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
    securityEpoch = 0;
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
    readFlights.clear();
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
    const id =
      data?.versionId ||
      data?.currentId ||
      data?.current?.id ||
      body?.versionId;
    if (
      id &&
      Number.isSafeInteger(
        data?.current?.revision ?? data?.workingRevision ?? data?.revision,
      )
    )
      revisions.set(
        url.pathname.split("/")[2] + ":" + id,
        data.current?.revision ?? data.workingRevision ?? data.revision,
      );
  }
  function contactsProjection(path, data) {
    if (
      !data ||
      !Array.isArray(data.rows) ||
      data.rows.some((r) => Array.isArray(r.values))
    )
      return data;
    const fields = [
      "Basic Name",
      "TTb Name",
      "Statutory Name",
      "Mobile No",
      "EXT",
      "Role",
      "EO Appt Level",
      "Appointment Status",
      "Active",
      "Employment Modifier",
      "Subject Modifier",
      "MK Modifier",
      "Day of Birth",
      "Month of birth",
      "GSPS Alias (@gsps.edu.sg)",
      "iCON Alias (@moe.edu.sg)",
      "CES Alias (@schools.gov.sg)",
    ];
    const effective = (r, key) => {
      const f = r.fields?.[key];
      return f?.state === "accepted" && f.effective === true
        ? f.value
        : undefined;
    };
    const label = (value) =>
      Array.isArray(value)
        ? value.map(label).join(", ")
        : value && typeof value === "object"
          ? (value.label ?? value.code ?? "")
          : (value ?? "");
    const people = data.rows.map((r) => {
      const value = (k) => effective(r, k),
        email = value("email") || "",
        birthday = value("birthday") || "",
        parts = birthday.split("-"),
        aliases = value("aliases") || [],
        emails = { gsps: "", icon: "", ces: "" };
      for (const address of [email, ...aliases])
        for (const [key, domain] of [
          ["gsps", "gsps.edu.sg"],
          ["icon", "moe.edu.sg"],
          ["ces", "schools.gov.sg"],
        ])
          if (
            typeof address === "string" &&
            address.toLowerCase().endsWith("@" + domain)
          )
            emails[key] = address;
      return {
        ...r,
        id: r.staffId ?? r.id,
        name: r.ttbName ?? r.basicName ?? r.name,
        basicName: r.basicName ?? r.name,
        statutoryName: value("statutoryName") ?? "",
        mobile: value("mobile") ?? "",
        ext: value("extension") ?? "",
        role: label(value("role")),
        appointmentLevel:
          label(value("eoAppointmentLevel")) ||
          (value("eo") === true ? "EO" : value("eo") === false ? "Non-EO" : ""),
        appointmentStatus: label(value("appointmentStatus")),
        active: r.active === true ? "Y" : r.active === false ? "N" : "",
        employment: label(value("employmentTags")),
        subject: label(value("subjectTags")),
        mk: label(value("mkTags")),
        dayOfBirth: parts.length >= 2 ? parts.at(-1) : "",
        monthOfBirth: parts.length >= 2 ? parts.at(-2) : "",
        emails,
        groups: (value("memberships") || []).map(label),
      };
    });
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
        people,
        access: Array.isArray(data.access) ? data.access : [],
        groups: data.groups || [],
        signatureSettings: data.signatureSettings || {},
      };
    }
    if (path.endsWith("/data") || path.endsWith("/diy")) {
      const values = (p) => [
        p.basicName,
        p.name,
        p.statutoryName,
        p.mobile,
        p.ext,
        p.role,
        p.appointmentLevel,
        p.appointmentStatus,
        p.active,
        p.employment,
        p.subject,
        p.mk,
        p.dayOfBirth,
        p.monthOfBirth,
        p.emails.gsps,
        p.emails.icon,
        p.emails.ces,
      ];
      return {
        ...data,
        fields,
        editable:
          data.editable ?? data.access?.write ?? data.user?.powerUser ?? false,
        rows: people.map((p) => ({
          id: p.id,
          revision: p.revision,
          values: values(p),
          computed: fields.map(
            (f) =>
              ![
                "Basic Name",
                "Statutory Name",
                "Mobile No",
                "Active",
                "GSPS Alias (@gsps.edu.sg)",
                "iCON Alias (@moe.edu.sg)",
                "CES Alias (@schools.gov.sg)",
              ].includes(f),
          ),
        })),
        lists: { ...(data.lists || {}), Active: ["Y", "N"] },
      };
    }
    return data;
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
    const method = (options.method || "GET").toUpperCase();
    let body =
        typeof options.body === "string" ? JSON.parse(options.body) : null,
      key = null;
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
        delete body.authority;
        key = url.pathname + "?" + url.search + "|" + canonical(body);
        const existing = pending.get(key);
        if (!existing && pending.size >= 128)
          throw Error(
            "Resolve the existing unconfirmed operations before starting another save.",
          );
        body.operationId =
          body.operationId ||
          body.requestId ||
          body.clientRequestId ||
          body.payload?.operationId ||
          body.payload?.requestId ||
          body.mutationId ||
          existing?.operationId ||
          crypto.randomUUID();
        if (
          body.revision === undefined &&
          body.versionId &&
          revisions.has(service + ":" + body.versionId)
        )
          body.revision = revisions.get(service + ":" + body.versionId);
        if (body.leaseFence === undefined && Number.isSafeInteger(body.fence))
          body.leaseFence = body.fence;
        pending.set(key, {
          operationId: body.operationId,
          body: structuredClone(body),
          path: url.pathname,
        });
      }
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
      const grantResponse = await suiteFetch("/api/deploy/lease", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationId: body.operationId + ":lease",
          versionId: body.versionId,
          scope: body.scope || body.key || "meta",
          clientId: body.clientId || "v1-draft",
          revision: body.revision ?? body.expectedRevision,
        }),
      });
      if (!grantResponse.ok) return grantResponse;
      const grant = (await grantResponse.json()).data;
      body = {
        ...body,
        clientId: body.clientId || "v1-draft",
        scope: body.scope || body.key || "meta",
        leaseFence: grant.fence,
      };
    }
    let result;
    try {
      result = await nativeFetch(url, {
        ...options,
        headers,
        credentials: "same-origin",
        cache: "no-store",
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    } catch (error) {
      if (key)
        global.dispatchEvent(
          new CustomEvent("gsis:uncertain", { detail: pending.get(key) }),
        );
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
    if (envelope.ok === false) return result;
    const data = envelope.data;
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
    if (
      key &&
      (receipt?.state === "committed" ||
        receipt?.status === "committed" ||
        receipt?.saved === true ||
        receipt?.state === "terminal-not-committed")
    )
      pending.delete(key);
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
          { ...envelope, ...data, result: data.result ?? data },
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
    { method = "GET", body, signal, headers: providedHeaders } = {},
  ) {
    const headers = new Headers(providedHeaders || {});
    if (body) headers.set("Content-Type", "application/json");
    const result = await suiteFetch("/api/" + domain + path, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal,
    });
    let value;
    try {
      value = await result.json();
    } catch {
      throw Error(
        "The result could not be confirmed. Check its receipt before retrying.",
      );
    }
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
    pending: () => [...pending.values()],
    canonical,
  };
  global.GSISV1 = api;
})(window);
