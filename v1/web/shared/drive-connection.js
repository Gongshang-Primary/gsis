const api = window.GSISV1;
const callback = (() => {
  const url = new URL(location.href);
  if (!url.searchParams.has("state") || !(url.searchParams.has("code") || url.searchParams.has("error"))) return null;
  const value = { state: url.searchParams.get("state"), code: url.searchParams.get("code"), denied: url.searchParams.has("error") };
  history.replaceState(null, "", url.pathname + "#health");
  return value;
})();
let completionMessage = "";
export async function completeGoogleConnection() {
  if (!callback) return;
  if (callback.denied) { completionMessage = "Google consent was cancelled. No new connection was saved."; return; }
  try {
    await api.request("core", "/admin/google-connection/complete", { method: "POST", body: {
      operationId: "google-complete-" + callback.state, state: callback.state, code: callback.code,
    } });
    completionMessage = "School Google account connected. Backup scheduling and provider activation are unchanged.";
  } catch (error) { completionMessage = error.message + " Check connection status before starting again."; }
  // Keep authorization codes in memory only for the callback attempt.
  callback.code = null;
}
export async function renderGoogleConnection(host) {
  const panel = document.createElement("section");
  panel.className = "gsis-panel";
  const title = document.createElement("h3"), status = document.createElement("p"), message = document.createElement("p");
  title.textContent = "School Google account";
  status.textContent = "Checking connection…";
  message.textContent = completionMessage;
  message.setAttribute("role", "status");
  panel.append(title, status, message);
  host.append(panel);
  try {
    const value = await api.request("core", "/admin/google-connection");
    status.textContent = value.configured ? `${value.email}: ${value.state}.` : "Google helper connection is not configured. Complete the approved Google setup first.";
    const note = document.createElement("p");
    note.textContent = "Uses the school helper account for Drive and Calendar. Connecting does not activate backups, sync or message sending.";
    panel.append(note);
    async function action(button, path, body, done) {
      button.disabled = true;
      try {
        const result = await api.request("core", path, { method: "POST", body: { ...body, operationId: crypto.randomUUID() } });
        done(result);
      } catch (error) { message.textContent = error.message + " Refresh the connection status before retrying."; }
      finally { button.disabled = false; }
    }
    const connect = document.createElement("button");
    connect.textContent = "Connect school Google account";
    connect.disabled = !value.configured || value.pending;
    connect.onclick = () => action(connect, "/admin/google-connection/start", { revision: value.revision }, result => {
      const url = new URL(result.authorizationUrl);
      if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth") throw Error("Invalid Google consent destination.");
      location.assign(url.href);
    });
    const check = document.createElement("button");
    check.textContent = "Check Google connection";
    check.disabled = value.state !== "connected";
    check.onclick = () => action(check, "/admin/google-connection/check", {}, () => {
      message.textContent = "Helper access and Shared Drive destination verified. No file was written; integrations remain unchanged.";
    });
    const disconnect = document.createElement("button");
    disconnect.textContent = "Disconnect / cancel connection";
    disconnect.disabled = !value.pending && !["connected", "reconnect-required"].includes(value.state);
    disconnect.onclick = () => action(disconnect, "/admin/google-connection/disconnect", { revision: value.revision }, () => {
      panel.remove(); void renderGoogleConnection(host);
    });
    panel.append(connect, check, disconnect);
  } catch (error) { status.textContent = error.message; }
}
