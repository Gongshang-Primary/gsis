/* WhatsApp metadata only. Provider credentials and media bytes belong to the worker. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;else root.GSISRosterInbox = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DAY = 86400000,
    MAX_MESSAGES = 20000,
    MAX_THREADS = 5000,
    MAX_AUDIT = 30000;
  const fail = (status, message) => {
    throw Object.assign(Error(message), {
      status
    });
  };
  const copy = value => JSON.parse(JSON.stringify(value));
  const text = (value, max = 4096) => String(value ?? '').replace(/\u0000/g, '').slice(0, max);
  function initial() {
    return {
      schema: 1,
      revision: 0,
      threads: [],
      messages: [],
      audit: [],
      receipts: [],
      deliveryEvents: [],
      alerts: []
    };
  }
  function validate(s) {
    if (!s || s.schema !== 1 || !Number.isInteger(s.revision) || ['threads', 'messages', 'audit', 'receipts', 'deliveryEvents', 'alerts'].some(k => !Array.isArray(s[k]))) fail(503, 'WhatsApp Inbox records could not be read.');
    return s;
  }
  function manager(ctx) {
    if (!ctx.user || !ctx.user.smc && !ctx.user.admin) fail(403, 'SMC or Admin access is required.');
  }
  function waId(value) {
    const id = String(value || '');
    if (!/^\d{7,16}$/.test(id)) fail(400, 'Invalid WhatsApp conversation.');
    return id;
  }
  function stamp(value, now) {
    let n = typeof value === 'number' ? value : /^\d+$/.test(String(value || '')) ? Number(value) : Date.parse(value);
    if (n < 100000000000) n *= 1000;
    if (!Number.isFinite(n) || n <= 0 || n > now + 60000) fail(400, 'Invalid WhatsApp message timestamp.');
    return n;
  }
  function findThread(s, id) {
    const row = s.threads.find(x => x.waId === waId(id));
    if (!row) fail(404, 'This conversation is unavailable.');
    return row;
  }
  function actor(ctx) {
    return {
      staffId: ctx.user.staffId || null,
      email: text(ctx.user.email, 254),
      name: text(ctx.people.find(p => p.id === ctx.user.staffId)?.name || ctx.user.email, 200)
    };
  }
  function eligible(ctx) {
    const allowed = new Set([...(ctx.smcIds || []), ...(ctx.adminIds || [])]);
    return ctx.people.filter(p => p.active && allowed.has(p.id)).map(p => ({
      id: p.id,
      name: p.name
    }));
  }
  function mobile(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.length === 8) digits = '65' + digits;
    return digits;
  }
  function directory(ctx) {
    const names = new Map();
    for (const p of ctx.people) {
      const number = mobile(p.mobile);
      if (number) names.set(number, names.has(number) ? null : p.name);
    }
    return {...ctx, inboxNames: names};
  }
  function senderName(t, ctx) {
    if (ctx.inboxNames) return ctx.inboxNames.get(t.waId) || t.profileName || t.waId;
    const matches = ctx.people.filter(p => mobile(p.mobile) === t.waId);
    return matches.length === 1 ? matches[0].name : t.profileName || t.waId;
  }
  const dutyAlert = (t, ctx) => !t.handled && (t.alertRecipientIds || []).includes(ctx.user.staffId) && (ctx.currentDutyIds || []).includes(ctx.user.staffId);
  function publicThread(s, t, ctx) {
    const expires = t.lastInboundAt ? t.lastInboundAt + DAY : 0;
    return {
      waId: t.waId,
      name: senderName(t, ctx),
      revision: t.revision,
      assignedTo: t.assignedTo || null,
      handled: t.handled === true,
      lastInboundAt: t.lastInboundAt || null,
      lastMessageAt: t.lastMessageAt,
      replyWindowExpiresAt: expires || null,
      canReply: expires > ctx.now,
      preview: t.preview || '',
      alert: dutyAlert(t, ctx)
    };
  }
  function providerError(value) {
    if (!value) return null;
    const result = {
      message: text(typeof value === 'string' ? value : value.message, 500),
      metaErrorCode: text(value.metaErrorCode, 40),
      metaErrorSubcode: text(value.metaErrorSubcode, 40),
      fbtraceId: text(value.fbtraceId, 100)
    };
    // Only fixed classifications and parameter shape cross this persistence boundary.
    // Provider details may echo the original message or a private timetable link.
    const details = [
      'Template parameters cannot contain line breaks, tabs or more than four consecutive spaces.',
      'The number of template parameters does not match the approved template.',
      'A template parameter has an invalid format.',
      'A template parameter exceeds the permitted length.',
      'Provider details withheld; use the Meta trace ID for investigation.'
    ];
    if (typeof value.details === 'string') result.details = details.includes(value.details) ? value.details : details[4];
    if (typeof value.templateName === 'string' && /^[a-z0-9_]{1,128}$/.test(value.templateName)) result.templateName = value.templateName;
    if (Array.isArray(value.fields)) result.fields = value.fields.slice(0, 32).filter(f => f && typeof f.field === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(f.field) && Number.isInteger(f.index) && f.index >= 1 && f.index <= 100 && Number.isInteger(f.characters) && f.characters >= 0 && f.characters <= 1000000).map(f => ({
      field: f.field,
      index: f.index,
      characters: f.characters,
      ...(typeof f.normalized === 'boolean' ? { normalized: f.normalized } : {})
    }));
    return result;
  }
  function publicMessage(m, now) {
    return {
      id: m.id,
      direction: m.direction,
      type: m.type,
      text: m.text || '',
      at: m.at,
      ...(m.sender ? {
        sender: copy(m.sender)
      } : {}),
      ...(m.direction === 'outbound' ? {
        status: m.status === 'sending' && now - m.preparedAt > 120000 ? 'uncertain' : m.status,
        deliveryStatus: m.deliveryStatus || '',
        error: copy(m.error || null),
        template: m.template ? copy(m.template) : null
      } : {}),
      ...(m.image ? {
        image: {
          available: m.image.captureStatus === 'stored' && !!m.image.objectKey,
          mimeType: m.image.mimeType,
          captureStatus: m.image.captureStatus
        }
      } : {}),
      ...(m.audio ? {
        audio: {
          available: m.audio.captureStatus === 'stored' && !!m.audio.objectKey,
          mimeType: m.audio.mimeType,
          voice: m.audio.voice === true,
          captureStatus: m.audio.captureStatus
        }
      } : {})
    };
  }
  function cursor(value) {
    if (!value) return null;
    if (typeof value !== 'string' || value.length > 600) fail(400, 'Invalid inbox page.');
    try {
      const x = JSON.parse(decodeURIComponent(value));
      if (!Array.isArray(x) || x.length !== 2 || !Number.isFinite(x[0]) || typeof x[1] !== 'string') throw Error();
      return x;
    } catch (e) {
      fail(400, 'Invalid inbox page.');
    }
  }
  const pack = (at, id) => encodeURIComponent(JSON.stringify([at, id]));
  const limit = value => Math.min(100, Math.max(1, Number.isInteger(value) ? value : 100));
  function list(s, ctx, p) {
    manager(ctx);
    ctx = directory(ctx);
    if (!['open', 'handled', 'all', undefined].includes(p.filter)) fail(400, 'Invalid inbox filter.');
    const c = cursor(p.cursor),
      search = text(p.search, 200).trim().toLowerCase(),
      rows = s.threads.filter(t => !search || (senderName(t, ctx) + ' ' + t.waId).toLowerCase().includes(search)).filter(t => p.filter === 'all' || (p.filter === 'handled' ? t.handled : !t.handled)).filter(t => !c || t.lastMessageAt < c[0] || t.lastMessageAt === c[0] && t.waId < c[1]).sort((a, b) => b.lastMessageAt - a.lastMessageAt || b.waId.localeCompare(a.waId)),
      page = rows.slice(0, limit(p.limit)),
      last = page.at(-1);
    return {
      threads: page.map(t => publicThread(s, t, ctx)),
      people: eligible(ctx),
      alertCount: s.threads.filter(t => dutyAlert(t, ctx)).length,
      nextCursor: rows.length > page.length ? pack(last.lastMessageAt, last.waId) : null,
      now: ctx.now
    };
  }
  function thread(s, ctx, p) {
    manager(ctx);
    const t = findThread(s, p.waId);
    // Fresh authority and summary on every read. Recheck full history at least every
    // 30 seconds because an unconfirmed delivery can age without a new webhook.
    if (!p.before && p.knownRevision === t.revision && Number.isFinite(p.knownReadAt) && ctx.now >= p.knownReadAt && ctx.now - p.knownReadAt < 30000) return {
      unchanged: true,
      thread: publicThread(s, t, ctx),
      people: eligible(ctx),
      now: ctx.now
    };
    const c = cursor(p.before),
      all = s.messages.filter(m => m.waId === t.waId && (!c || m.at < c[0] || m.at === c[0] && m.id < c[1])).sort((a, b) => b.at - a.at || b.id.localeCompare(a.id)),
      page = all.slice(0, limit(p.limit)),
      last = page.at(-1);
    return {
      thread: publicThread(s, t, ctx),
      messages: page.reverse().map(m => publicMessage(m, ctx.now)),
      audit: copy(s.audit.filter(a => a.waId === t.waId).slice(-100)),
      nextCursor: all.length > page.length ? pack(last.at, last.id) : null,
      people: eligible(ctx),
      now: ctx.now
    };
  }
  function audioMetadata(a = {}) {
    const captureStatus = ['stored', 'unavailable', 'failed'].includes(a.captureStatus) ? a.captureStatus : 'unavailable';
    if (captureStatus === 'stored' && (!/^inbox\/[A-Za-z0-9_./-]{1,240}$/.test(a.objectKey || '') || String(a.objectKey).includes('..'))) fail(400, 'Invalid private media object.');
    return {
      mediaId: text(a.mediaId, 300),
      mimeType: text(a.mimeType, 100),
      sha256: text(a.sha256, 100),
      voice: a.voice === true,
      objectKey: captureStatus === 'stored' ? a.objectKey : '',
      captureStatus
    };
  }
  function imageMetadata(a = {}) {
    if (!['image/jpeg', 'image/png'].includes(a.mimeType) && !(a.mimeType === '' && a.captureStatus !== 'stored')) fail(400, 'Unsupported inbox image type.');
    return audioMetadata(a);
  }
  function room(s) {
    if (s.messages.length >= MAX_MESSAGES || s.threads.length >= MAX_THREADS || s.audit.length >= MAX_AUDIT || s.receipts.length >= MAX_AUDIT || s.alerts.length >= MAX_AUDIT) fail(507, 'WhatsApp Inbox records are full. Ask Admin to archive records before continuing.');
  }
  function log(s, ctx, t, operation, extra = {}) {
    s.audit.push({
      id: ctx.uuid(),
      waId: t.waId,
      at: ctx.now,
      operation,
      actor: ctx.user ? actor(ctx) : {
        staffId: null,
        email: 'whatsapp-webhook',
        name: 'WhatsApp'
      },
      ...extra
    });
  }
  function touch(s, t) {
    t.revision++;
    s.revision++;
  }
  function ingest(s, ctx, p) {
    if (!ctx.service) fail(403, 'Signed WhatsApp service required.');
    const m = p.message || {},
      id = text(m.id, 300);
    if (!id || id !== m.id) fail(400, 'Invalid WhatsApp message ID.');
    const from = waId(m.from),
      old = s.messages.find(x => x.direction === 'inbound' && x.id === id);
    if (old) {
      if (old.waId !== from) fail(409, 'WhatsApp message identity changed.');
      const kind = old.type;
      if (['audio', 'image'].includes(kind) && m.type === kind && old[kind]?.captureStatus !== 'stored' && m[kind]?.captureStatus === 'stored') {
        const updated = kind === 'image' ? imageMetadata(m[kind]) : audioMetadata(m[kind]);
        if (updated.mediaId !== old[kind].mediaId) fail(409, 'WhatsApp media identity changed.');
        old[kind] = updated;
        touch(s, findThread(s, from));
        return {
          duplicate: true,
          mediaUpdated: true,
          waId: from
        };
      }
      return {
        duplicate: true,
        waId: from
      };
    }
    room(s);
    const at = stamp(m.timestamp, ctx.now);
    let t = s.threads.find(t => t.waId === from);
    if (!t) {
      t = {
        waId: from,
        profileName: '',
        revision: 0,
        handled: false,
        assignedTo: null,
        lastInboundAt: 0,
        lastMessageAt: 0,
        alertRecipientIds: []
      };
      s.threads.push(t);
    }
    const previousInbound = t.lastInboundAt,
      today = new Date(ctx.now + 8 * 3600000).toISOString().slice(0, 10),
      messageDate = new Date(at + 8 * 3600000).toISOString().slice(0, 10),
      freshMessage = messageDate === today && ctx.now - at < DAY;
    let audio, image;
    if (m.type === 'audio') audio = audioMetadata(m.audio);
    if (m.type === 'image') image = imageMetadata(m.image);
    const row = {
      id,
      waId: from,
      direction: 'inbound',
      type: text(m.type || 'unsupported', 40),
      text: text(m.text),
      at,
      receivedAt: ctx.now,
      context: m.context ? {
        id: text(m.context.id, 300)
      } : null,
      ...(audio ? {audio} : {}),
      ...(image ? {image} : {})
    };
    s.messages.push(row);
    t.profileName = text(m.profileName || t.profileName, 200);
    t.lastInboundAt = Math.max(t.lastInboundAt, at);
    if (at >= t.lastMessageAt) t.preview = row.text || (row.type === 'audio' ? 'Voice note' : row.type === 'image' ? 'Image' : '[' + row.type + ']');
    t.lastMessageAt = Math.max(t.lastMessageAt, at);
    if (at >= previousInbound) {
      t.handled = false;
      t.alertRecipientIds = freshMessage ? [...new Set(ctx.currentDutyIds || [])] : [];
    }
    const alerts = [];
    if (at >= previousInbound && freshMessage) for (const recipientId of t.alertRecipientIds) {
      const alert = {
        id: ctx.uuid(),
        claimId: ctx.uuid(),
        messageId: id,
        waId: from,
        recipientId,
        date: today,
        status: 'queued',
        createdAt: ctx.now
      };
      s.alerts.push(alert);
      alerts.push({
        alertId: alert.id,
        claimId: alert.claimId
      });
    }
    touch(s, t);
    log(s, ctx, t, 'incoming', {
      messageId: id
    });
    return {
      recorded: true,
      waId: from,
      alerts
    };
  }
  function normalizedReply(p) {
    if (p.kind === 'text') {
      if (typeof p.text !== 'string' || !p.text.trim() || p.text.length > 4096) fail(400, 'Enter a reply of up to 4096 characters.');
      return {
        kind: 'text',
        text: p.text.trim()
      };
    }
    if (p.kind === 'template') {
      const t = p.template || {};
      if (!/^[a-z0-9_]{1,512}$/.test(t.name || '') || !/^\w{2,12}$/.test(t.language || '') || !Array.isArray(t.parameters) || t.parameters.length > 30 || t.parameters.some(x => typeof x !== 'string' || !x.trim() || x.length > 1024)) fail(400, 'Choose an approved template and complete its fields.');
      return {
        kind: 'template',
        template: {
          name: t.name,
          language: t.language,
          parameters: t.parameters.map(x => x.trim())
        }
      };
    }
    fail(400, 'Choose text or an approved template reply.');
  }
  function mutation(s, ctx, p) {
    manager(ctx);
    const t = findThread(s, p.waId),
      op = p.operation;
    if (!/^[\w-]{36}$/.test(p.requestId || '')) fail(400, 'Request ID required.');
    let command = {
      operation: op,
      waId: t.waId
    };
    if (op === 'inboxReply') command = {
      ...command,
      ...normalizedReply(p)
    };else if (op === 'inboxAssign') {
      command.assignedTo = p.assignedTo == null ? null : String(p.assignedTo);
      if (command.assignedTo && !eligible(ctx).some(x => x.id === command.assignedTo)) fail(400, 'Assign this conversation to a current SMC or Admin user.');
    } else if (op === 'inboxSetHandled') {
      if (typeof p.handled !== 'boolean') fail(400, 'Choose a conversation status.');
      command.handled = p.handled;
    } else fail(400, 'Unknown inbox action.');
    const digest = ctx.digest(command),
      prior = s.receipts.find(r => r.requestId === p.requestId);
    if (prior) {
      if (prior.actor !== ctx.user.email || prior.digest !== digest) fail(409, 'This request ID was used for a different action.');
      const m = s.messages.find(m => m.id === prior.messageId);
      return {
        replayed: true,
        thread: publicThread(s, t, ctx),
        ...(m ? {
          message: publicMessage(m, ctx.now)
        } : {})
      };
    }
    // A worker-only recovery probe can acknowledge a committed reply, never create one.
    if (op === 'inboxReply' && p.receiptOnly === true) return {receiptMissing: true};
    if (!Number.isInteger(p.expectedRevision) || p.expectedRevision !== t.revision) fail(409, 'This conversation changed. Refresh it before updating.');
    room(s);
    let message, dispatch;
    if (op === 'inboxReply') {
      if (command.kind === 'text' && (!t.lastInboundAt || t.lastInboundAt + DAY <= ctx.now)) fail(409, 'The 24-hour reply window has ended. Use an approved template.');
      message = {
        id: ctx.uuid(),
        waId: t.waId,
        direction: 'outbound',
        type: command.kind === 'text' ? 'text' : 'template',
        kind: command.kind,
        text: command.text || '',
        ...(command.template ? {
          template: command.template
        } : {}),
        at: ctx.now,
        createdAt: ctx.now,
        sender: actor(ctx),
        status: 'queued',
        claimId: ctx.uuid(),
        requestId: p.requestId
      };
      s.messages.push(message);
      t.lastMessageAt = Math.max(t.lastMessageAt, ctx.now);
      t.preview = message.text || (message.template ? 'Template: ' + message.template.name : '');
      dispatch = {
        replyId: message.id,
        claimId: message.claimId,
        ...(message.template ? {
          template: copy(message.template)
        } : {})
      };
    }
    if (op === 'inboxAssign') t.assignedTo = command.assignedTo;
    if (op === 'inboxSetHandled') {
      t.handled = command.handled;
      if (command.handled) t.alertRecipientIds = [];
    }
    touch(s, t);
    log(s, ctx, t, op, {
      ...(message ? {
        messageId: message.id
      } : {}),
      ...(op === 'inboxAssign' ? {
        assignedTo: t.assignedTo
      } : {}),
      ...(op === 'inboxSetHandled' ? {
        handled: t.handled
      } : {})
    });
    s.receipts.push({
      requestId: p.requestId,
      actor: ctx.user.email,
      digest,
      messageId: message?.id || null,
      at: ctx.now
    });
    return {
      thread: publicThread(s, t, ctx),
      ...(message ? {
        message: publicMessage(message, ctx.now),
        dispatch
      } : {})
    };
  }
  function findReply(s, p) {
    const m = s.messages.find(m => m.direction === 'outbound' && m.id === p.replyId);
    if (!m || m.claimId !== p.claimId) fail(409, 'This reply claim is unavailable.');
    return m;
  }
  function prepare(s, ctx, p) {
    if (!ctx.service) fail(403, 'Signed WhatsApp service required.');
    const m = findReply(s, p),
      t = findThread(s, m.waId);
    if (m.status !== 'queued') return {
      reply: null
    };
    if (ctx.now - m.createdAt > 300000) {
      m.status = 'failed';
      m.error = {
        message: 'Not sent. The reply waited more than five minutes in the queue.'
      };
      touch(s, t);
      return {
        reply: null
      };
    }
    const senderStillAllowed = eligible(ctx).some(x => x.id === m.sender.staffId);
    if (!senderStillAllowed) {
      m.status = 'failed';
      m.error = {
        message: 'The sender no longer has SMC or Admin access.'
      };
      touch(s, t);
      return {
        reply: null
      };
    }
    if (m.kind === 'text' && t.lastInboundAt + DAY <= ctx.now) {
      m.status = 'failed';
      m.error = {
        message: 'The 24-hour reply window ended before this reply was sent.'
      };
      touch(s, t);
      return {
        reply: null
      };
    }
    if (m.kind === 'template' && JSON.stringify(m.template) !== JSON.stringify(p.approvedTemplate)) {
      m.status = 'failed';
      m.error = {
        message: 'The template is not currently approved or its fields changed.'
      };
      touch(s, t);
      return {
        reply: null
      };
    }
    m.status = 'sending';
    m.preparedAt = ctx.now;
    touch(s, t);
    return {
      reply: {
        id: m.id,
        claimId: m.claimId,
        to: m.waId,
        kind: m.kind,
        text: m.text,
        replyWindowExpiresAt: t.lastInboundAt + DAY,
        ...(m.template ? {
          template: copy(m.template)
        } : {})
      }
    };
  }
  function replyResult(s, ctx, p) {
    if (!ctx.service) fail(403, 'Signed WhatsApp service required.');
    if (!['sent', 'failed', 'uncertain'].includes(p.state)) fail(400, 'Invalid reply result.');
    const m = findReply(s, p),
      t = findThread(s, m.waId);
    if (['sent', 'delivered', 'read'].includes(m.deliveryStatus)) {
      if (p.messageId && !m.messageId) m.messageId = text(p.messageId, 300);
      return {
        recorded: true
      };
    }
    if (m.status === 'sending' || m.status === 'uncertain') {
      m.status = p.state;
      m.messageId = text(p.messageId, 300);
      m.error = providerError(p.error);
      m.completedAt = ctx.now;
      touch(s, t);
      log(s, ctx, t, 'replyResult', {
        messageId: m.id,
        state: m.status
      });
    }
    return {
      recorded: true
    };
  }
  function delivery(s, ctx, p) {
    if (!ctx.service) fail(403, 'Signed WhatsApp service required.');
    if (!p.eventId || typeof p.eventId !== 'string' || p.eventId.length > 500 || !['sent', 'delivered', 'read', 'failed'].includes(p.state)) fail(400, 'Invalid inbox delivery event.');
    if (s.deliveryEvents.includes(p.eventId)) return {
      recorded: true,
      duplicate: true
    };
    const m = s.messages.find(m => m.direction === 'outbound' && (m.messageId && m.messageId === p.messageId || p.replyId && m.id === p.replyId));
    if (!m) return {
      recorded: false
    };
    if (p.recipientId && waId(p.recipientId) !== m.waId) fail(403, 'Reply recipient does not match.');
    if (s.deliveryEvents.length >= 60000) fail(507, 'Inbox delivery receipts are full. Ask Admin to archive records.');
    const t = findThread(s, m.waId),
      rank = {
        sent: 1,
        delivered: 2,
        read: 3
      };
    if (p.messageId && !m.messageId) m.messageId = text(p.messageId, 300);
    if (p.state === 'failed') {
      if (!['delivered', 'read'].includes(m.deliveryStatus)) {
        m.status = 'failed';
        m.deliveryStatus = 'failed';
        m.error = providerError(p.error) || {
          message: 'WhatsApp confirmed that delivery failed.'
        };
      }
    } else if (!(p.state === 'sent' && m.deliveryStatus === 'failed') && (rank[p.state] || 0) > (rank[m.deliveryStatus] || 0)) {
      m.deliveryStatus = p.state;
      m.status = 'sent';
      m.error = null;
    }
    m.deliveryAt = stamp(p.timestamp || ctx.now, ctx.now);
    s.deliveryEvents.push(p.eventId);
    touch(s, t);
    return {
      recorded: true
    };
  }
  function alertRecord(s, p) {
    const a = s.alerts.find(a => a.id === p.alertId && a.claimId === p.claimId);
    if (!a) fail(409, 'This inbox alert claim is unavailable.');
    return a;
  }
  function alertPrepare(s, ctx, p) {
    if (!ctx.service) fail(403, 'Signed WhatsApp service required.');
    const a = alertRecord(s, p);
    if (a.status !== 'queued') return {
      alert: null
    };
    const person = ctx.people.find(x => x.id === a.recipientId && x.active),
      to = mobile(person?.mobile);
    if (a.date !== new Date(ctx.now + 8 * 3600000).toISOString().slice(0, 10) || !(ctx.currentDutyIds || []).includes(a.recipientId) || !/^\d{7,16}$/.test(to) || ctx.now - a.createdAt > 120000) {
      a.status = 'cancelled';
      a.error = {
        message: 'The current duty or notification window changed.'
      };
      s.revision++;
      return {
        alert: null
      };
    }
    a.status = 'sending';
    a.preparedAt = ctx.now;
    s.revision++;
    return {
      alert: {
        id: a.id,
        claimId: a.claimId,
        to,
        name: person.name,
        senderName: senderName(findThread(s, a.waId), ctx)
      }
    };
  }
  function alertResult(s, ctx, p) {
    if (!ctx.service) fail(403, 'Signed WhatsApp service required.');
    if (!['sent', 'failed', 'uncertain', 'blocked'].includes(p.state)) fail(400, 'Invalid inbox alert result.');
    const a = alertRecord(s, p);
    if (a.status === 'sending' || a.status === 'queued' && p.state === 'blocked') {
      a.status = p.state;
      a.error = providerError(p.error);
      a.messageIdProvider = text(p.messageId, 300);
      a.completedAt = ctx.now;
      s.revision++;
    }
    return {
      recorded: true
    };
  }
  // Cron may recover only intents which have never crossed the one-send prepare gate.
  function pending(s, ctx) {
    if (!ctx.service) fail(403, 'Signed WhatsApp service required.');
    for (const m of s.messages.filter(m => m.direction === 'outbound')) {
      if (m.status === 'queued' && !m.preparedAt && ctx.now - m.createdAt > 300000) {
        m.status = 'failed';
        m.error = {
          message: 'Not sent. The reply waited more than five minutes in the queue.'
        };
        touch(s, findThread(s, m.waId));
      } else if (m.status === 'sending' && ctx.now - m.preparedAt > 120000) {
        m.status = 'uncertain';
        m.error = {
          message: 'WhatsApp did not confirm this send. Check delivery before sending again.'
        };
        touch(s, findThread(s, m.waId));
      }
    }
    const today = new Date(ctx.now + 8 * 3600000).toISOString().slice(0, 10);
    for (const a of s.alerts) {
      if (a.status === 'queued' && (ctx.now - a.createdAt > 120000 || a.date !== today || !(ctx.currentDutyIds || []).includes(a.recipientId))) {
        a.status = 'cancelled';
        a.error = {
          message: 'The current duty or notification window changed.'
        };
        s.revision++;
      } else if (a.status === 'sending' && ctx.now - a.preparedAt > 120000) {
        a.status = 'uncertain';
        a.error = {
          message: 'WhatsApp did not confirm this alert.'
        };
        s.revision++;
      }
    }
    return {
      replies: s.messages.filter(m => m.direction === 'outbound' && m.status === 'queued' && !m.preparedAt).slice(0, 3).map(m => ({
        replyId: m.id,
        claimId: m.claimId,
        ...(m.template ? {
          template: copy(m.template)
        } : {})
      })),
      alerts: s.alerts.filter(a => a.status === 'queued' && !a.preparedAt).slice(0, 5).map(a => ({
        alertId: a.id,
        claimId: a.claimId
      }))
    };
  }
  function media(s, ctx, p) {
    manager(ctx);
    const t = findThread(s, p.waId),
      m = s.messages.find(m => m.id === p.messageId && m.waId === t.waId && m.direction === 'inbound');
    const a = m && (m.type === 'image' ? m.image : m.audio);
    if (!a?.mediaId) fail(404, 'This attachment is unavailable.');
    return {
      objectKey: a.objectKey || '',
      mediaId: a.mediaId,
      sha256: a.sha256,
      mimeType: a.mimeType,
      voice: a.voice === true,
      message: {
        id: m.id,
        from: m.waId,
        timestamp: m.at,
        type: m.type
      }
    };
  }
  return {
    initial,
    validate,
    list,
    thread,
    mutation,
    ingest,
    prepare,
    replyResult,
    delivery,
    alertPrepare,
    alertResult,
    pending,
    media,
    publicThread,
    publicMessage
  };
});
