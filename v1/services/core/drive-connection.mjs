import { ApiError, requireValue } from "../../runtime/errors.mjs";
import { digest, one, statement, prepareOperation, commitOperation } from "../../runtime/store.mjs";
import { admit, resolveAdmission } from "../../runtime/admission.mjs";
import { fetchProvider } from "../../runtime/providers.mjs";
import { verifyDriveRoot } from "../../runtime/drive-backup.mjs";
import { helperConfig, HELPER_SCOPES, randomSecret, base64url, sealHelper, openHelper,
  validateGoogleToken, tokenRequest, helperAccessToken } from "../../runtime/google-drive-credential.mjs";
import { verifyIdentity } from "./identity.mjs";

const readConnection = env => one(env.DB, "SELECT * FROM core_google_connections WHERE school_id=?", [env.SCHOOL_ID]);
const adminGuard = ctx => ({
  sql: `SELECT EXISTS(SELECT 1 FROM core_sessions s JOIN core_accounts a ON a.school_id=s.school_id AND a.account_id=s.account_id
    JOIN core_grants g ON g.school_id=a.school_id AND g.account_id=a.account_id
    WHERE s.school_id=? AND s.session_id=? AND a.account_id=? AND s.revoked=0 AND a.suspended=0 AND a.pending_change=0
    AND s.expires_at>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)) AND g.capability='admin'
    AND g.valid_from<=? AND (g.valid_until IS NULL OR g.valid_until>MAX(?,CAST((julianday('now')-2440587.5)*86400000 AS INTEGER)))) AS ok`,
  args: [ctx.env.SCHOOL_ID, ctx.principal.sessionId, ctx.principal.actorId, Date.now(), Date.now(), Date.now()],
});
const revisionGuard = (env, revision) => ({ sql: "SELECT COALESCE((SELECT revision FROM core_google_connections WHERE school_id=?),0)=? AS ok", args: [env.SCHOOL_ID, revision] });
async function prepared(ctx, action, intent) {
  return prepareOperation(ctx.env.DB, { schoolId: ctx.env.SCHOOL_ID, actorId: ctx.principal.actorId,
    operationId: ctx.body.operationId, action, intent, now: ctx.now, validUntil: ctx.principal.validUntil, authorization: ctx.principal });
}
async function commit(ctx, op, writes, result, guards = []) {
  const now = Date.now(), admission = await admit(ctx.env, ctx.env.DB, op, ctx.principal, [], now);
  const receipt = await commitOperation(ctx.env.DB, op, { now, admission, guards: [adminGuard(ctx), ...guards], writes, result,
    audit: { kind: "google-helper-connection", state: result.state, connectionRevision: result.revision } });
  await resolveAdmission(ctx.env, ctx.env.DB, op, admission, receipt, now);
  return { ...receipt.result, receipt };
}
const replay = op => ({ ...op.receipt.result, receipt: op.receipt });
export async function connectionStatus(env) {
  const row = await readConnection(env);
  let cfg;
  try { cfg = await helperConfig(env); } catch (error) { if (error.code !== "GOOGLE_HELPER_NOT_CONFIGURED") throw error; }
  const flow = await one(env.DB, "SELECT status,expires_at FROM core_google_flows WHERE school_id=?", [env.SCHOOL_ID]);
  return { configured: !!cfg, state: !cfg ? "not-configured" : row?.config_digest !== cfg.digest && row?.state === "connected"
    ? "reconnect-required" : row?.state || "disconnected", revision: row?.revision || 0,
    email: cfg?.email || null, connectedAt: row?.connected_at || null,
    pending: !!flow && ["pending", "exchanging"].includes(flow.status) && flow.expires_at > Date.now(),
    activationChanged: false };
}
export async function internalHelperToken(ctx) {
  const { env, body } = ctx;
  requireValue(ctx.internal && body.schoolId === env.SCHOOL_ID &&
    ["core", "contacts", "deploy", "roster", "calendar", "lord", "venues", "layout"].includes(body.service), "SERVICE_DENIED", 403);
  const permitted = body.service === "calendar" ? HELPER_SCOPES : [HELPER_SCOPES[0]];
  requireValue(Array.isArray(body.scopes) && body.scopes.length > 0 && body.scopes.every(scope => permitted.includes(scope)), "GOOGLE_HELPER_SCOPE_DENIED", 403);
  return helperAccessToken(env, body.scopes, fetchProvider);
}
export async function driveConnection(ctx) {
  const { env, principal, method, body, path } = ctx;
  requireValue(principal?.capabilities.includes("admin") && !principal.impersonating, "CAPABILITY_DENIED", 403);
  if (method === "GET" && path === "/admin/google-connection") return connectionStatus(env);
  requireValue(method === "POST", "METHOD_NOT_ALLOWED", 405);
  if (path === "/admin/google-connection/disconnect") {
    requireValue(Number.isSafeInteger(body.revision) && body.revision >= 0, "INVALID_INPUT");
    const op = await prepared(ctx, "core.google.disconnect", { revision: body.revision });
    if (op.receipt) return replay(op);
    return commit(ctx, op, [
      { sql: "INSERT INTO core_google_connections(school_id,revision,state,config_digest,updated_at) VALUES(?,?,'disconnected','',?) ON CONFLICT(school_id) DO UPDATE SET revision=excluded.revision,state='disconnected',credential_cipher=NULL,updated_at=excluded.updated_at",
        args: [env.SCHOOL_ID, body.revision + 1, Date.now()] },
      { sql: "UPDATE core_google_flows SET status='cancelled',flow_cipher='' WHERE school_id=?", args: [env.SCHOOL_ID] },
    ], { state: "disconnected", revision: body.revision + 1 }, [revisionGuard(env, body.revision)]);
  }
  const cfg = await helperConfig(env);
  if (path === "/admin/google-connection/start") {
    requireValue(Number.isSafeInteger(body.revision) && body.revision >= 0, "INVALID_INPUT");
    const op = await prepared(ctx, "core.google.connect", { revision: body.revision, config: cfg.digest });
    if (op.receipt) return replay(op);
    const state = randomSecret(), nonce = randomSecret(), verifier = randomSecret(), expiresAt = Date.now() + 600000;
    const encrypted = await sealHelper(env, "flow:" + op.operationId, { nonce, verifier });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: cfg.clientId, redirect_uri: cfg.redirectUri, response_type: "code",
      scope: ["openid", "email", ...HELPER_SCOPES].join(" "), access_type: "offline", prompt: "consent select_account",
      include_granted_scopes: "false", login_hint: cfg.email, hd: cfg.hostedDomain, state, nonce,
      code_challenge_method: "S256", code_challenge: base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))) });
    return commit(ctx, op, [{ sql: `INSERT INTO core_google_flows(school_id,operation_id,actor_id,session_id,state_hash,config_digest,connection_revision,flow_cipher,status,expires_at)
      VALUES(?,?,?,?,?,?,?,?,'pending',?) ON CONFLICT(school_id) DO UPDATE SET operation_id=excluded.operation_id,actor_id=excluded.actor_id,session_id=excluded.session_id,
      state_hash=excluded.state_hash,config_digest=excluded.config_digest,connection_revision=excluded.connection_revision,flow_cipher=excluded.flow_cipher,status='pending',expires_at=excluded.expires_at`,
      args: [env.SCHOOL_ID, op.operationId, principal.actorId, principal.sessionId, await digest(state), cfg.digest, body.revision, encrypted, expiresAt] }],
      { state: "awaiting-consent", authorizationUrl: url.href, expiresAt, revision: body.revision },
      [revisionGuard(env, body.revision), { sql: "SELECT NOT EXISTS(SELECT 1 FROM core_google_flows WHERE school_id=? AND status IN ('pending','exchanging') AND expires_at>?) AS ok", args: [env.SCHOOL_ID, Date.now()] }]);
  }
  if (path === "/admin/google-connection/check") {
    const op = await prepared(ctx, "core.google.check", { config: cfg.digest });
    if (op.receipt) return replay(op);
    const row = await readConnection(env);
    const token = await helperAccessToken(env, [HELPER_SCOPES[0]], fetchProvider);
    await verifyDriveRoot({ ...env, GOOGLE_HELPER_ENABLED: "false", GOOGLE_ACCESS_TOKEN: token.accessToken }, cfg);
    return commit(ctx, op, [], { state: "connected", revision: row.revision, checkedAt: Date.now(), activationChanged: false }, [revisionGuard(env, row.revision)]);
  }
  requireValue(path === "/admin/google-connection/complete", "NOT_FOUND", 404);
  requireValue(typeof body.state === "string" && /^[A-Za-z0-9_-]{43}$/.test(body.state) &&
    typeof body.code === "string" && body.code.length > 0 && body.code.length <= 8192, "GOOGLE_HELPER_CALLBACK_INVALID", 400);
  const stateHash = await digest(body.state), op = await prepared(ctx, "core.google.complete", {
    stateHash, codeHash: await digest(body.code), config: cfg.digest,
  });
  if (op.receipt) return replay(op);
  const flow = await one(env.DB, "SELECT * FROM core_google_flows WHERE school_id=?", [env.SCHOOL_ID]);
  requireValue(flow && flow.state_hash === stateHash && flow.actor_id === principal.actorId && flow.session_id === principal.sessionId &&
    flow.config_digest === cfg.digest && flow.expires_at > Date.now(), "GOOGLE_HELPER_CALLBACK_INVALID", 403);
  requireValue(flow.status === "pending", "GOOGLE_HELPER_OUTCOME_UNKNOWN", 503);
  const guard = adminGuard(ctx), claim = await statement(env.DB,
    `UPDATE core_google_flows SET status='exchanging' WHERE school_id=? AND state_hash=? AND status='pending' AND expires_at>? AND (SELECT ok FROM (${guard.sql}))=1`,
    [env.SCHOOL_ID, stateHash, Date.now(), ...guard.args]).run();
  requireValue(claim.meta.changes === 1, "GOOGLE_HELPER_OUTCOME_UNKNOWN", 503);
  try {
    const secret = await openHelper(env, "flow:" + flow.operation_id, flow.flow_cipher);
    const token = validateGoogleToken(await tokenRequest(env, { grant_type: "authorization_code", code: body.code,
      redirect_uri: cfg.redirectUri, code_verifier: secret.verifier }, fetchProvider), { offline: true });
    const identity = await verifyIdentity({ ...env, GOOGLE_CLIENT_ID: cfg.clientId }, token.id_token, await digest(secret.nonce), Date.now());
    const previous = await readConnection(env);
    requireValue(identity.email === cfg.email && (!previous?.subject || previous.subject === identity.identity.subject), "GOOGLE_HELPER_IDENTITY_DENIED", 403);
    await verifyDriveRoot({ ...env, GOOGLE_HELPER_ENABLED: "false", GOOGLE_ACCESS_TOKEN: token.access_token }, cfg);
    const encrypted = await sealHelper(env, "credential:" + identity.identity.subject, { refreshToken: token.refresh_token });
    return await commit(ctx, op, [
      { sql: `INSERT INTO core_google_connections(school_id,revision,state,subject,email,config_digest,credential_cipher,connected_by,connected_at,updated_at)
        VALUES(?,?,'connected',?,?,?,?,?,?,?) ON CONFLICT(school_id) DO UPDATE SET revision=excluded.revision,state='connected',subject=excluded.subject,email=excluded.email,
        config_digest=excluded.config_digest,credential_cipher=excluded.credential_cipher,connected_by=excluded.connected_by,connected_at=excluded.connected_at,updated_at=excluded.updated_at`,
        args: [env.SCHOOL_ID, flow.connection_revision + 1, identity.identity.subject, identity.email, cfg.digest, encrypted, principal.actorId, Date.now(), Date.now()] },
      { sql: "UPDATE core_google_flows SET status='completed',flow_cipher='' WHERE school_id=? AND state_hash=?", args: [env.SCHOOL_ID, stateHash] },
    ], { state: "connected", revision: flow.connection_revision + 1, activationChanged: false }, [revisionGuard(env, flow.connection_revision),
      { sql: "SELECT EXISTS(SELECT 1 FROM core_google_flows WHERE school_id=? AND state_hash=? AND status='exchanging' AND expires_at>?) AS ok", args: [env.SCHOOL_ID, stateHash, Date.now()] }]);
  } catch (error) {
    await statement(env.DB, "UPDATE core_google_flows SET status='failed',flow_cipher='' WHERE school_id=? AND state_hash=? AND status='exchanging'", [env.SCHOOL_ID, stateHash]).run();
    throw error;
  }
}
