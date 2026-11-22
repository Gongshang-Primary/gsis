/** W5 (owner 21 Nov 2026): a known staff member's free-text WhatsApp message that
 * waits in the Roster inbox alerts the duty SMC once per sender per day, even in
 * quiet hours. Menu taps, urgent-message texts and repeats do not alert.
 * Synthetic fixture only; no provider send.
 */
import assert from "node:assert/strict";
import fixture from "./roster701-fixture.cjs";
import { queueInboxAlert, inboxAlertConfigured } from "../v1/services/roster/inbound.mjs";

const date = "2030-03-18";
function setup(at) {
  const f = fixture(), previous = f.date, now = Date.parse(date + "T" + at + ":00+08:00");
  f.ctx.days[date] = f.ctx.days[previous];
  if (previous !== date) delete f.ctx.days[previous];
  Object.assign(f.ctx, { today: date, now, iso: new Date(now).toISOString(), service: true, inboxMode: true });
  f.state.smcDutyRoster = [{ date, staffIds: ["dora"] }];
  f.ctx.dutySources = { [date]: { available: true, staffIds: ["dora"] } };
  f.ctx.smcIds = ["dora"];
  return { f, now };
}
let n = 0;
function inbound(f, now, extra) {
  const event = { id: "wamid.synthetic" + (++n), sender: "6592345678", at: now, text: "Hello, can I swap my duty?", ...extra };
  Object.assign(f.ctx, { now, iso: new Date(now).toISOString() });
  const result = f.O.inboundMessage(f.state, { ...f.ctx, urgentSMCIds: ["dora"] }, {
    messageId: event.id, from: event.sender, timestamp: event.at, text: event.text, type: "text", selection: event.buttonId || undefined,
  });
  return { event, result, alerted: queueInboxAlert(f.state, f.ctx, date, event, result) };
}
const alerts = (s) => s.outbox.filter((j) => j.data?.templateKey === "inbox_alert");

// 1. Free text from a known teacher alerts the duty SMC, with the sender's name.
{
  const { f, now } = setup("10:00");
  const first = inbound(f, now);
  assert.equal(first.result.reply.action, "menu");
  assert.equal(first.alerted, 1);
  const [job] = alerts(f.state);
  assert.equal(job.recipientId, "dora");
  assert.equal(job.data.senderName, "Bob");
  assert.equal(job.data.audience, "duty-smc");
  // Same sender again that day: no second alert.
  assert.equal(inbound(f, now + 120000).alerted, 0);
  assert.equal(alerts(f.state).length, 1);
}
// 2. Quiet hours (22:00): still alerts.
{
  const { f, now } = setup("22:00");
  assert.equal(inbound(f, now).alerted, 1, "bypasses quiet hours");
}
// 3. Menu tap: no alert.
{
  const { f, now } = setup("10:00");
  assert.equal(inbound(f, now, { buttonId: "gsis_layout", text: "" }).alerted, 0);
}
// 4. Urgent message text (after the Urgent prompt): forwarded, not an inbox alert.
{
  const { f, now } = setup("10:00");
  inbound(f, now, { buttonId: "gsis_urgent", text: "" });
  const urgent = inbound(f, now + 60000, { text: "Stuck in traffic, 20 min late." });
  assert.equal(urgent.result.reply.action, "urgent-confirm");
  assert.equal(urgent.alerted, 0);
  assert.equal(alerts(f.state).length, 0);
}
// 5. Not queued until the template is mapped in deployment configuration.
assert.equal(inboxAlertConfigured({}), false);
assert.equal(inboxAlertConfigured({ WHATSAPP_TEMPLATES_JSON: JSON.stringify({ relief_assignment: { name: "x" } }) }), false);
assert.equal(inboxAlertConfigured({ WHATSAPP_TEMPLATES_JSON: JSON.stringify({ inbox_alert: { name: "gsis_v1_inbox_new_message" } }) }), true);
console.log("PASS inbox alert: configuration gate; free text alerts duty SMC once per sender per day, bypasses quiet hours; menu taps and urgent texts do not");
