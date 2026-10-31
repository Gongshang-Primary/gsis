/* A separate atomic metadata document keeps conversations out of relief/timetable payloads. */
function rosterInboxState_() {
  const id = props_().getProperty('ROSTER_INBOX_FILE') || rosterFindFile_(ROSTER_DATA, 'Roster WhatsApp Inbox.json');
  if (!id) return GSISRosterInbox.initial();
  try {
    return GSISRosterInbox.validate(JSON.parse(typeof rosterNativeRead_==='function'?rosterNativeRead_(id):rosterReadFile_(id)));
  } catch (e) {
    if (e.status) throw e;
    error_(503, 'WhatsApp Inbox records could not be read.');
  }
}
function rosterInboxCommit_(state) {if(typeof rosterEdgeAssertLegacyWrite_==='function')rosterEdgeAssertLegacyWrite_();gsisRequireBackendRole_('roster');
  const stored = props_().getProperty('ROSTER_INBOX_FILE'),
    id = stored || rosterFindFile_(ROSTER_DATA, 'Roster WhatsApp Inbox.json');
  if(typeof rosterNativeSplitWrite_==='function'&&rosterNativeSplitWrite_(id,state,'ROSTER_INBOX_FILE'))return;
  const data = JSON.stringify(state);
  if (data.length > 8000000) error_(507, 'WhatsApp Inbox records are full. Ask Admin to archive them before continuing.');
  const saved = id ? (rosterDriveRequest_('https://www.googleapis.com/upload/drive/v3/files/' + encodeURIComponent(id) + '?uploadType=media&supportsAllDrives=true&fields=id', {
    method: 'patch',
    contentType: 'application/json; charset=UTF-8',
    payload: data
  }, 'inbox-commit'), id) : rosterCreateFile_(ROSTER_DATA, 'Roster WhatsApp Inbox.json', Utilities.newBlob(data, 'application/json'));
  if (!stored) props_().setProperty('ROSTER_INBOX_FILE', saved);
}
function rosterInboxDuty_(c, now, operations) {
  const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10),
    people = c.rosterPeople || [],
    ids = c.rosterSMCIds || [];
  return GSISRosterOperations.dutySMC(operations || rosterOperationsState_(true), {
    now,
    people,
    smcIds: ids,
    dutySources: {
      [today]: {
        available: Array.isArray(c.rosterSMCIds),
        staffIds: ids
      }
    }
  }, today);
}
function rosterInboxContext_(c, identity, service, needsDuty = true) {
  if (!Array.isArray(c?.rosterPeople) || !Array.isArray(c.rosterSMCIds) || !Array.isArray(c.rosterAdminIds)) error_(503, 'Contacts must provide current SMC and Admin inbox authority.');
  const user = service ? null : rosterOperationsAuthority_(c, identity);
  if (!service && !user.smc && !user.admin) error_(403, 'SMC or Admin access is required.');
  // Read all storage before sampling the clock used for reply/duty eligibility.
  const operations = needsDuty ? rosterOperationsState_(true) : null,
    now = Date.now();
  return {
    now,
    service: service === true,
    user,
    people: c.rosterPeople,
    smcIds: c.rosterSMCIds,
    adminIds: c.rosterAdminIds,
    currentDutyIds: needsDuty ? rosterInboxDuty_(c, now, operations) : [],
    uuid: () => Utilities.getUuid(),
    digest: rosterOperationsDigest_
  };
}
function rosterInboxDispatch_(req, c) {gsisRequireBackendRole_('roster');
  const p = req.input || {},
    reads = ['inboxList', 'inboxThread', 'inboxMediaAuthorize', 'inboxTemplates'],
    writes = ['inboxAssign', 'inboxSetHandled', 'inboxReply'];
  if (!reads.includes(p.operation) && !writes.includes(p.operation)) error_(400, 'Unknown inbox action.');
  // Contacts was freshly requested by the signed school-user envelope before dispatch.
  const user = rosterOperationsAuthority_(c, req.identity);
  if (!user.smc && !user.admin) error_(403, 'SMC or Admin access is required.');
  if (p.operation === 'inboxTemplates') return {
    authorized: true
  };
  if (reads.includes(p.operation)) {
    const s = rosterInboxState_(),
      ctx = rosterInboxContext_(c, req.identity, false, p.operation !== 'inboxMediaAuthorize' && s.threads.some(t => !t.handled && (t.alertRecipientIds || []).includes(user.staffId)));
    return p.operation === 'inboxList' ? GSISRosterInbox.list(s, ctx, p) : p.operation === 'inboxThread' ? GSISRosterInbox.thread(s, ctx, p) : GSISRosterInbox.media(s, ctx, p);
  }
  const lock = LockService.getScriptLock();
  if (!deployLock_(lock, 8000)) error_(503, 'Another inbox update is running. Retry this action.');
  try {
    const s = rosterInboxState_(),
      ctx = rosterInboxContext_(c, req.identity, false, s.threads.some(t => !t.handled && (t.alertRecipientIds || []).includes(user.staffId))),
      before = s.revision,
      result = GSISRosterInbox.mutation(s, ctx, p);
    if (s.revision !== before) rosterInboxCommit_(s);
    // The accepted snapshot avoids another signed Contacts/Drive round trip.
    ctx.now = Date.now();
    return result.receiptMissing ? result : {...result, ...GSISRosterInbox.thread(s, ctx, {waId: p.waId, limit: 100}), affectedDomains:['inbox'], affectedDates:[]};
  } finally {
    deployUnlock_(lock);
  }
}
function rosterInboxServiceDispatch_(req) {gsisRequireBackendRole_('roster');
  const p = req.input || {},
    allowed = ['inboxIngest', 'inboxReplyPrepare', 'inboxReplyResult', 'inboxDelivery', 'inboxAlertPrepare', 'inboxAlertResult', 'inboxPendingDispatch'];
  if (!allowed.includes(p.operation)) error_(403, 'Unknown inbox service action.');
  // Contacts has its own source of truth. Do not hold the Roster writer lock
  // during that remote read; claims and current duty still use locked state.
  const receiptOnly = ['inboxReplyResult', 'inboxAlertResult', 'inboxDelivery'].includes(p.operation),
    contacts = receiptOnly ? null : rosterServiceContacts_().c;
  const lock = LockService.getScriptLock();
  if (!deployLock_(lock, 8000)) error_(503, 'Another inbox update is running. Retry this action.');
  try {
    const s = rosterInboxState_(),
      // Signed delivery receipts only settle an existing claim. Sending/ingest still
      // require the current Contacts directory and current duty roster below.
      ctx = receiptOnly ? {
        now: Date.now(),
        service: true,
        uuid: () => Utilities.getUuid()
      } : rosterInboxContext_(contacts, null, true),
      before = s.revision;
    const result = p.operation === 'inboxPendingDispatch' ? GSISRosterInbox.pending(s, ctx) : p.operation === 'inboxIngest' ? GSISRosterInbox.ingest(s, ctx, p) : p.operation === 'inboxReplyPrepare' ? GSISRosterInbox.prepare(s, ctx, p) : p.operation === 'inboxReplyResult' ? GSISRosterInbox.replyResult(s, ctx, p) : p.operation === 'inboxAlertPrepare' ? GSISRosterInbox.alertPrepare(s, ctx, p) : p.operation === 'inboxAlertResult' ? GSISRosterInbox.alertResult(s, ctx, p) : GSISRosterInbox.delivery(s, ctx, p);
    if (s.revision !== before) rosterInboxCommit_(s);
    return result;
  } finally {
    deployUnlock_(lock);
  }
}
