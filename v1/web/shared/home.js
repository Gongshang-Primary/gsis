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
      link.append(title, detail);
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
