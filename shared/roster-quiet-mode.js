// Quiet mode lets SMCs allocate without background jobs competing for the
// Google Roster lock. It pauses only lock-heavy, deferrable work; absence
// intake, notifications, inbox and webhooks keep running. The state lives in
// the shared GSiS D1 database so every Worker sees it within a minute.
const ROW='roster',MORNING_END_MINUTE=7*60+15,DAYTIME_MS=30*60000;
export const QUIET_PAUSED_JOBS=Object.freeze(['allocation','peer-mail','audit-export']);
// Reasons record what the Worker knows: the backend accepted the request.
// WhatsApp delivery is tracked separately by the notification outbox.
export const QUIET_END_OPERATIONS=Object.freeze({publish:'publish-accepted',notifyDaily:'whatsapp-queued'});

function singapore(now){const sg=new Date(now+8*3600000);return {date:sg.toISOString().slice(0,10),minute:sg.getUTCHours()*60+sg.getUTCMinutes()};}
// Before 07:15 SGT quiet mode ends at 07:15; later it lasts 30 minutes.
export function quietExpiry(now=Date.now()){const {date,minute}=singapore(now);return minute<MORNING_END_MINUTE?Date.parse(date+'T07:15:00+08:00'):now+DAYTIME_MS;}

async function ensure(db){
 await db.batch([
  db.prepare('CREATE TABLE IF NOT EXISTS gsis_quiet_mode (id TEXT PRIMARY KEY, active INTEGER NOT NULL, actor TEXT NOT NULL, started_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, ended_at INTEGER, ended_by TEXT, end_reason TEXT)'),
  db.prepare('CREATE TABLE IF NOT EXISTS gsis_quiet_mode_log (id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, actor TEXT NOT NULL, at INTEGER NOT NULL, expires_at INTEGER, reason TEXT)')
 ]);
}
function view(row,now){
 const active=!!row&&row.active===1&&row.expires_at>now;
 return {active,actor:row?.actor||null,startedAt:row?.started_at||null,expiresAt:active?row.expires_at:null,endedAt:active?null:row?.ended_at||(row?.active===1?row.expires_at:null),endReason:active?null:row?.end_reason||(row?.active===1?'expired':null),pausedJobs:[...QUIET_PAUSED_JOBS]};
}
export async function readQuietMode(db,now=Date.now()){
 if(!db?.prepare)return view(null,now);
 await ensure(db);return view(await db.prepare('SELECT * FROM gsis_quiet_mode WHERE id=?').bind(ROW).first(),now);
}
export async function startQuietMode(db,actor,now=Date.now()){
 if(!db?.prepare)throw Object.assign(Error('Quiet mode storage is not configured.'),{status:503});
 await ensure(db);const expires=quietExpiry(now);
 await db.batch([
  db.prepare('INSERT INTO gsis_quiet_mode(id,active,actor,started_at,expires_at) VALUES(?,1,?,?,?) ON CONFLICT(id) DO UPDATE SET active=1,actor=excluded.actor,started_at=excluded.started_at,expires_at=excluded.expires_at,ended_at=NULL,ended_by=NULL,end_reason=NULL').bind(ROW,actor,now,expires),
  db.prepare('INSERT INTO gsis_quiet_mode_log(action,actor,at,expires_at) VALUES(?,?,?,?)').bind('on',actor,now,expires)
 ]);
 return readQuietMode(db,now);
}
// Ends only the session that was active when the request arrived, so a request
// that straddles a new session never ends it.
export async function endQuietModeSession(db,actor,reason,session,now=Date.now()){
 if(!db?.prepare||!session)return view(null,now);
 await ensure(db);
 const ended=await db.prepare('UPDATE gsis_quiet_mode SET active=0,ended_at=?,ended_by=?,end_reason=? WHERE id=? AND active=1 AND expires_at>? AND started_at=?').bind(now,actor,reason,ROW,now,session).run();
 if(ended.meta?.changes)await db.prepare('INSERT INTO gsis_quiet_mode_log(action,actor,at,reason) VALUES(?,?,?,?)').bind('off',actor,now,reason).run();
 return readQuietMode(db,now);
}
export async function endQuietMode(db,actor,reason,now=Date.now()){
 if(!db?.prepare)return view(null,now);
 await ensure(db);
 const ended=await db.prepare('UPDATE gsis_quiet_mode SET active=0,ended_at=?,ended_by=?,end_reason=? WHERE id=? AND active=1 AND expires_at>?').bind(now,actor,reason,ROW,now).run();
 if(ended.meta?.changes)await db.prepare('INSERT INTO gsis_quiet_mode_log(action,actor,at,reason) VALUES(?,?,?,?)').bind('off',actor,now,reason).run();
 return readQuietMode(db,now);
}
