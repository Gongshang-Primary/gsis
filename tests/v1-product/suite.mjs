import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startProduct } from "../../scripts/v1/dev.mjs";
import { digest } from "../../v1/runtime/store.mjs";
export const origin = "https://gsis.example.invalid";
export async function productSuite(options = {}) {
  const path = await mkdtemp(join(tmpdir(), "gsis-v1-integration-"));
  let suite;
  try {
    suite = await startProduct({
      persistPath: join(path, "state"),
      output: join(path, "product"),
      ...options,
    });
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
  async function seedAccount(
    id,
    {
      staffId = "staff-" + id,
      capabilities = ["admin"],
      suspended = false,
    } = {},
  ) {
    const db = await suite.db("core"),
      now = Date.now(),
      token = crypto.randomUUID() + crypto.randomUUID(),
      csrf = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          "INSERT INTO core_accounts(school_id,account_id,issuer,subject,email,staff_id,suspended,created_at) VALUES(?,?,'https://accounts.google.com',?,?,?,?,?)",
        )
        .bind(
          "synthetic-school",
          id,
          "google-" + id,
          id + "@example.invalid",
          staffId,
          suspended ? 1 : 0,
          now,
        ),
      db
        .prepare(
          "INSERT INTO core_sessions(school_id,session_id,token_hash,account_id,authenticated_at,expires_at,csrf_token) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          "synthetic-school",
          "session-" + id,
          await digest(token),
          id,
          now - 100,
          now - 100 + 864000000,
          csrf,
        ),
      ...capabilities.map((c) =>
        db
          .prepare(
            "INSERT INTO core_grants(school_id,account_id,capability,valid_from) VALUES(?,?,?,0)",
          )
          .bind("synthetic-school", id, c),
      ),
    ]);
    return { id, staffId, token, csrf };
  }
  async function request(
    user,
    domain,
    path,
    { method = "GET", body, headers = {} } = {},
  ) {
    const h = { origin: origin, ...headers };
    if (user) {
      h.cookie = "__Host-gsis_session=" + user.token;
      h["x-csrf-token"] = user.csrf;
    }
    if (body !== undefined) h["content-type"] = "application/json";
    const response = await suite.mf.dispatchFetch(
      origin + "/api/" + domain + path,
      {
        method,
        headers: h,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
    );
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: response.status, body: data, headers: response.headers };
  }
  async function call(user, domain, path, body) {
    const r = await request(user, domain, path, { method: "POST", body });
    if (r.status >= 400)
      throw Object.assign(Error(JSON.stringify(r.body)), { response: r });
    return r.body.data;
  }
  return {
    ...suite,
    path,
    seedAccount,
    request,
    call,
    async close() {
      await suite.close();
      await rm(path, { recursive: true, force: true });
    },
  };
}
