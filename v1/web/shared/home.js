(async function () {
  "use strict";
  const api = window.GSISV1,
    $ = (id) => document.getElementById(id);
  let busy = false;
  const next = new URLSearchParams(location.search).get("next"),
    continuationFragment = location.hash;
  function safeNext(value) {
    return typeof value === "string" &&
      /^\/(?!\/|\\)/.test(value) &&
      !value.includes("\\") &&
      !/^\/(?:api)(?:\/|$)/.test(value)
      ? value
      : null;
  }
  async function show(session) {
    $("login").hidden = true;
    $("workspace").hidden = false;
    $("status").textContent = "Choose an application.";
    $("identity").textContent = session.user.email;
    $("impersonation").hidden = !session.impersonating;
    $("adminLink").hidden = !session.capabilities.includes("core.admin");
    const response = await fetch("/v1/modules.json");
    if (!response.ok)
      throw Error("Application list could not load. Reload to retry.");
    const modules = await response.json();
    $("modules").replaceChildren();
    for (const module of modules) {
      const link = document.createElement("a");
      link.className = "module";
      link.href = "/" + module.id + "/";
      const title = document.createElement("h2");
      title.textContent = module.name;
      const detail = document.createElement("p");
      detail.textContent = module.description;
      const icon = document.createElement("span");
      icon.className = "module-icon";
      icon.setAttribute("aria-hidden", "true");
      if (module.icon) {
        const image = document.createElement("img");
        image.src = module.icon;
        image.alt = "";
        icon.append(image);
      } else {
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 48 48");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2.5");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        const path = document.createElementNS(svg.namespaceURI, "path");
        const paths = {
          venues: "M10 40V8h28v32M10 16h28M17 40V23h14v17M26 30h1",
          layout: "m7 12 11-5 12 5 11-5v29l-11 5-12-5-11 5ZM18 7v29M30 12v29",
          deploy: "M7 9h34v30H7ZM7 18h34M18 18v21M29 18v21M7 28h34",
          lord: "M7 9h34v24H7ZM17 40h14M24 33v7M16 20h16m-5-5 5 5-5 5",
          starlord: "M6 8h36v27H6ZM16 41h16M24 35v6m0-22 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z",
          overlord: "M10 7h28v34H10ZM17 15h3m5 0h7M17 24h3m5 0h7M17 33h3m5 0h7",
        };
        path.setAttribute("d", paths[module.id] || paths.deploy);
        svg.append(path);
        icon.append(svg);
      }
      link.append(icon, title, detail);
      $("modules").append(link);
    }
    const target = safeNext(next);
    if (target) {
      const destination = new URL(target, location.origin);
      if (continuationFragment) destination.hash = continuationFragment;
      location.replace(
        destination.pathname + destination.search + destination.hash,
      );
    }
  }
  async function signIn() {
    if (busy) return;
    busy = true;
    $("retryLogin").hidden = true;
    $("login").hidden = false;
    $("status").textContent = "Sign in to continue.";
    $("loginStatus").textContent = "Preparing secure sign-in…";
    try {
      const [config, challenge] = await Promise.all([
        api.getConfig(),
        api.beginLogin(),
      ]);
      $("schoolName").textContent = config.schoolName || "Staff workspace";
      if (!config.configured || !config.clientId)
        throw Error(
          "School sign-in is not configured. An administrator must complete the installation settings.",
        );
      if (!window.google?.accounts?.id)
        await new Promise((resolve, reject) => {
          const existing = document.querySelector("script[data-gsis-login]");
          if (existing) existing.remove();
          const script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.dataset.gsisLogin = "true";
          const timer = setTimeout(
            () =>
              reject(
                Error("Google sign-in did not load. Retry when connected."),
              ),
            12000,
          );
          script.onload = () => {
            clearTimeout(timer);
            resolve();
          };
          script.onerror = () => {
            clearTimeout(timer);
            reject(Error("Google sign-in did not load."));
          };
          document.head.append(script);
        });
      google.accounts.id.initialize({
        client_id: config.clientId,
        hd: config.hostedDomain,
        nonce: challenge.nonce,
        auto_select: false,
        callback: async (value) => {
          $("loginStatus").textContent = "Checking your account…";
          try {
            await show(await api.login(value.credential));
          } catch (error) {
            $("loginStatus").textContent = error.message;
            $("retryLogin").hidden = false;
          }
        },
      });
      $("googleButton").replaceChildren();
      google.accounts.id.renderButton($("googleButton"), {
        theme: "outline",
        size: "large",
        text: "signin_with",
      });
      $("loginStatus").textContent = "";
    } catch (error) {
      $("loginStatus").textContent = error.message;
      $("retryLogin").hidden = false;
    } finally {
      busy = false;
    }
  }
  $("retryLogin").onclick = signIn;
  $("logout").onclick = async () => {
    $("logout").disabled = true;
    try {
      await api.logout();
      $("workspace").hidden = true;
      await signIn();
    } catch (error) {
      $("status").textContent = error.message;
    } finally {
      $("logout").disabled = false;
    }
  };
  try {
    const config = await api.getConfig();
    $("schoolName").textContent = config.schoolName || "Staff workspace";
    const session = await api.getSession();
    if (session) await show(session);
    else await signIn();
  } catch (error) {
    $("status").textContent = error.message;
    $("login").hidden = false;
    $("retryLogin").hidden = false;
  }
})();
