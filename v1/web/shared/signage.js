const api = window.GSISV1,
  panel = document.createElement("details");
panel.className = "gsis-panel";
panel.innerHTML =
  '<summary>Signage access</summary><p data-state></p><form data-use><label>Restricted device token<input name="token" type="password" pattern="[a-f0-9]{64}" required autocomplete="off"></label><button>Use in this tab</button><button type="button" data-clear>Forget device token</button></form><form data-create hidden><h2>Create a restricted display session</h2><label>Device ID<input name="deviceId" required maxlength="80" pattern="[A-Za-z0-9][A-Za-z0-9._-]*"></label><label>Days valid<input name="days" type="number" value="7" min="1" max="30" required></label><fieldset data-resources><legend>Resources shown on this display</legend></fieldset><button>Create device token</button><output data-token></output></form>';
document.body.append(panel);
const state = panel.querySelector("[data-state]");
state.textContent = sessionStorage.getItem("gsis-signage-device")
  ? "This tab uses a restricted device session."
  : "Signed-in staff with signage access can preview; unattended displays need a restricted device token.";
panel.querySelector("[data-use]").onsubmit = (event) => {
  event.preventDefault();
  sessionStorage.setItem(
    "gsis-signage-device",
    new FormData(event.currentTarget).get("token"),
  );
  location.reload();
};
panel.querySelector("[data-clear]").onclick = () => {
  sessionStorage.removeItem("gsis-signage-device");
  location.reload();
};
let pending = null;
panel.querySelector("[data-create]").onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget,
    values = new FormData(form);
  try {
    pending ??= {
      operationId: crypto.randomUUID(),
      purpose: "signage",
      deviceId: values.get("deviceId"),
      expiresAt: Date.now() + Number(values.get("days")) * 86400000,
      resourceIds: values.getAll("resource"),
      photos: false,
    };
    const result = await api.request("lord", "/links", {
        method: "POST",
        body: pending,
      }),
      token = result.token ?? result.result?.token;
    if (!token)
      throw Error("The token result is not confirmed. Retry this operation.");
    panel.querySelector("[data-token]").textContent = token;
    state.textContent =
      "Copy this restricted token to its intended display. It grants no staff or administrative access.";
    pending = null;
  } catch (error) {
    state.textContent = error.message;
  }
};
try {
  const session = await api.getSession();
  if (session?.capabilities.some((c) => ["admin", "lord.admin"].includes(c))) {
    const form = panel.querySelector("[data-create]");
    form.hidden = false;
    const result = await api.request("lord", "/resources");
    for (const resource of result.resources || result.rows || []) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.name = "resource";
      input.value = resource.resourceId || resource.id;
      label.append(input, document.createTextNode(resource.name));
      form.querySelector("[data-resources]").append(label);
    }
  }
} catch (error) {
  state.textContent = error.message;
}
