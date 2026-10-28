import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
const source=fs.readFileSync('roster-update/public/edge-notifications.js','utf8').replace(/^import .*;\n/gm,'');
const M=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const sql=new DatabaseSync(':memory:');let failAt=-1;
const prepare=text=>({text,args:[],bind(...args){return {...this,args};},async run(){const r=sql.prepare(this.text).run(...this.args);return {success:true,meta:{changes:r.changes}};}});
const db={prepare,async batch(statements){sql.exec('BEGIN');try{const results=statements.map((s,i)=>{if(i===failAt){failAt=-1;throw Error('rollback fixture');}const q=sql.prepare(s.text);if(/^SELECT|RETURNING/i.test(s.text)||/ RETURNING /.test(s.text))return {success:true,results:q.all(...s.args)};const r=q.run(...s.args);return {success:true,results:[],meta:{changes:r.changes}};});sql.exec('COMMIT');return results;}catch(error){sql.exec('ROLLBACK');throw error;}}};
const env={GSIS_JOBS:db,WHATSAPP_PHONE_NUMBER_ID:'123456789',WHATSAPP_SENDS_PER_SECOND:'20'},clock=Date.now,now=Date.now();Date.now=()=>now;
try{
 const reservations=await Promise.all(Array.from({length:12},(_,i)=>M.reserveEdgeWhatsAppSend(env,'65900000'+String(i).padStart(2,'0'))));assert(reservations.every(r=>r.reserved));assert.equal(new Set(reservations.map(r=>r.at)).size,12);for(let i=1;i<12;i++)assert(reservations[i].at-reservations[i-1].at>=50,'all concurrent send lanes share phone budget');
 const same=await M.reserveEdgeWhatsAppSend(env,'6590000000');assert(same.at>=now+6000,'phone-recipient pacing is shared with inbox sends');
 const before=sql.prepare('SELECT * FROM gsis_whatsapp_sender').get();failAt=3;await assert.rejects(M.reserveEdgeWhatsAppSend(env,'6599999999'),/rollback fixture/);assert.deepEqual(sql.prepare('SELECT * FROM gsis_whatsapp_sender').get(),before,'partial reservation rolls back');assert.equal(sql.prepare('SELECT * FROM gsis_whatsapp_recipient_pacing WHERE mobile=?').get('6599999999'),undefined);
 await M.recordEdgeWhatsAppThrottle(env,120000);const blocked=await M.reserveEdgeWhatsAppSend(env,'6590000001');assert.equal(blocked.reserved,false);assert.equal(blocked.readyAt,now+120000,'provider throttle stops every lane');
 assert.equal(sql.prepare("SELECT name FROM sqlite_master WHERE name='gsis_edge_records'").get(),undefined,'pacing never loads or modifies the business state');
 console.log('roster094 sender pacing: atomic SQLite concurrent slots, recipient spacing, rollback and shared cooldown passed');
}finally{Date.now=clock;sql.close();}
