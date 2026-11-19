import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { startProduct } from "../scripts/v1/dev.mjs";
import { productSuite } from "./v1-product/suite.mjs";

const suite = await productSuite();
let restarted, stopped = false;
try {
  const admin = await suite.seedAccount("register-admin"), reader = await suite.seedAccount("register-reader", {capabilities: ["venues.read"]});
  const db = await suite.db("venues"), school = "synthetic-school";
  const read = user => suite.call(user, "venues", "/read", {operation: "admin"});
  const command = (venues, extras = {}, user = admin) => suite.request(user, "venues", "/command", {method: "POST", body: {operation: "importVenues", operationId: crypto.randomUUID(), venues, ...extras}});
  const room = (id, extra = {}) => ({id, unit: id, name: "Synthetic " + id, revision: 0, capacity: null, ...extra});
  assert.deepEqual((await read(admin)).register.venues, []);
  const preview = await suite.call(admin, "venues", "/read", {operation: "registerPreview", venues: [room("one", {aliases: ["One old label"], bookable: true, approvalMode: "approval", open: "08:00", close: "17:00", bufferMinutes: 10, features: ["Projector"], notes: "Keep source notes"})]});
  assert.equal(preview.created, 1);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM venues_records").first()).n, 0, "preview never writes rooms");
  const operationId = crypto.randomUUID(), first = await command(preview.venues, {operationId});
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal((await read(admin)).register.venues[0].capacity, null);
  const receipt = await suite.call(admin, "venues", "/receipt", {operationId});
  assert.equal(receipt.state, "committed");
  assert.equal((await command(preview.venues, {operationId})).status, 200);
  assert.equal((await read(admin)).register.venues[0].revision, 1, "exact retry has one durable effect");
  assert.equal((await command([room("other")], {operationId})).status, 409, "changed intent rejected");

  // Independent owner state and unprojected metadata must survive a sparse physical edit.
  await db.prepare("UPDATE venues_records SET data_json=json_set(data_json,'$.legacyEvidence','retained') WHERE school_id=? AND kind='venues' AND record_id='one'").bind(school).run();
  await db.prepare("INSERT INTO venues_records(school_id,kind,record_id,revision,data_json) VALUES(?,?,?,?,?)").bind(school, "occurrences", "existing-booking", 1, JSON.stringify({id:"existing-booking",venueId:"one",ownerId:"staff-register-admin",date:"2026-11-20",status:"confirmed",intervals:[{start:540,end:570}],revision:1,note:"Keep booking"})).run();
  await db.prepare("INSERT INTO venues_source_heads VALUES(?,?,?,?,?,?,?)").bind(school,"deploy","planning-original",1,Date.now(),"immutable-digest",JSON.stringify({coverage:null,kind:"planning-reference"})).run();
  const beforeSource = await db.prepare("SELECT * FROM venues_source_heads").all();
  const update = await command([{id:"one",revision:1,name:"Renamed physical room",capacity:null}]);
  assert.equal(update.status, 200, JSON.stringify(update.body));
  const saved = JSON.parse((await db.prepare("SELECT data_json FROM venues_records WHERE record_id='one'").first()).data_json);
  assert.equal(saved.legacyEvidence, "retained");
  assert.deepEqual(saved.aliases, ["One old label"]);
  assert.deepEqual(saved.features, ["Projector"]);
  assert.equal(saved.approvalMode, "approval"); assert.equal(saved.bufferMinutes, 10);
  assert.equal(saved.open, "08:00"); assert.equal(saved.close, "17:00"); assert.equal(saved.bookable, true);
  assert.equal(saved.notes, "Keep source notes");
  assert.deepEqual((await db.prepare("SELECT * FROM venues_source_heads").all()).results, beforeSource.results);
  assert.equal(JSON.parse((await db.prepare("SELECT data_json FROM venues_records WHERE record_id='existing-booking'").first()).data_json).status, "confirmed");
  assert.equal((await command([{id:"one",revision:1,name:"Stale"}])).status, 409);
  assert.equal((await command([{id:"one",revision:2,unit:"changed"}])).status, 409);
  assert.equal((await command([room("different-id",{unit:"one"})])).status, 409);
  assert.equal((await command([room("alias-owner",{aliases:["one OLD label"]})])).status, 409);
  assert.equal((await command([room("reader-attempt")], {}, reader)).status, 403);
  const impersonated = await suite.request(admin,"venues","/command",{method:"POST",headers:{"x-gsis-preview-account":admin.id},body:{operation:"importVenues",operationId:crypto.randomUUID(),venues:[room("preview-attempt")]}});
  assert.equal(impersonated.status,403);
  const denied = await suite.request(reader,"venues","/read",{method:"POST",body:{operation:"registerPreview",venues:[room("denied")]}});
  assert.equal(denied.status,403);
  for (const values of [
    [], [room("duplicate"),room("duplicate")], [room("bad",{capacity:-1})], [room("bad",{capacity:1.5})],
    [room("bad",{capacity:"25"})], [room("bad",{capacity:100001})], [room("bad",{open:"25:00"})],
    [room("bad",{bufferMinutes:121})], [room("bad",{aliases:"not a list"})], [room("bad",{ownerIds:["intruder"]})],
    [room("valid-in-invalid-batch"),room("bad",{name:""})],
  ]) {const response = await command(values); assert(response.status >=400, JSON.stringify(response));}
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM venues_records WHERE kind='venues'").first()).n,1,"invalid batches have no partial writes");
  const register=(await read(admin)).register;
  const workbook={schemaVersion:1,metadata:{schemaVersion:1,module:"venues-register",schoolId:school,mode:"editable"},sheets:{Rooms:{columns:register.columns,rows:register.venues.map(r=>register.columns.map(k=>["aliases","features"].includes(k)?r[k].join("\n"):r[k]))}}};
  assert.equal((await suite.call(admin,"venues","/read",{operation:"registerPreview",workbook})).updated,1);
  const foreign=structuredClone(workbook); foreign.metadata.schoolId="other-school";
  assert.equal((await suite.request(admin,"venues","/read",{method:"POST",body:{operation:"registerPreview",workbook:foreign}})).status,403);
  const wrongColumns=structuredClone(workbook); wrongColumns.sheets.Rooms.columns[0]="ownerId";
  assert.equal((await suite.request(admin,"venues","/read",{method:"POST",body:{operation:"registerPreview",workbook:wrongColumns}})).status,400);
  const aliasRaces=await Promise.all([
    command([room("concurrent-alias",{aliases:["Concurrent alias"]})]),
    suite.request(admin,"venues","/command",{method:"POST",body:{operation:"saveVenue",operationId:crypto.randomUUID(),venue:{id:"one",aliases:["Concurrent alias"]},revision:2}}),
  ]);
  assert.equal(aliasRaces.filter(response=>response.status===200).length,1,JSON.stringify(aliasRaces));
  const currentRevision=(await db.prepare("SELECT revision FROM venues_records WHERE record_id='one'").first()).revision;
  const races=await Promise.all([command([room("race-a",{unit:"shared-new-unit"})]),command([room("race-b",{unit:"shared-new-unit"})])]);
  assert.equal(races.filter(r=>r.status===200).length,1,JSON.stringify(races));
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM venues_records WHERE kind='venues' AND json_extract(data_json,'$.unit')='shared-new-unit'").first()).n,1);
  // The existing physical fence is still required even for a display-name edit.
  await db.prepare("INSERT INTO venues_source_fences VALUES(?,?,?,?,?,?,?,?,?,?)").bind(school,"deploy","pending-source","digest",1,"source-decision","pending",Date.now(),null,null).run();
  await db.prepare("INSERT INTO venues_fence_scopes VALUES(?,?,?,?,?,?)").bind(school,"deploy","pending-source","one",0,0).run();
  const fenced=await command([{id:"one",revision:currentRevision,name:"Blocked by source fence"}]);
  assert.equal(fenced.status,409);
  assert.equal(JSON.parse((await db.prepare("SELECT data_json FROM venues_records WHERE record_id='one'").first()).data_json).name,"Renamed physical room");
  await suite.mf.dispose();
  stopped = true;
  restarted=await startProduct({persistPath:join(suite.path,"state"),output:join(suite.path,"restarted"),migrateSchemas:false});
  const recovered=await restarted.mf.dispatchFetch("https://gsis.example.invalid/api/venues/receipt",{method:"POST",headers:{origin:"https://gsis.example.invalid",cookie:"__Host-gsis_session="+admin.token,"x-csrf-token":admin.csrf,"content-type":"application/json"},body:JSON.stringify({operationId})});
  assert.equal(recovered.status,200);
  assert.equal((await recovered.json()).data.state,"committed");
  assert.equal((await (await restarted.db("venues")).prepare("SELECT revision FROM venues_records WHERE record_id='one'").first()).revision,currentRevision);

  console.log("PASS physical venue register: actual Workers/D1 create, preview, unknown capacity, preservation, strict input, school/capability denial, revision/idempotency and concurrent identity guards");
} finally {await restarted?.close(); if (stopped) await rm(suite.path,{recursive:true,force:true}); else await suite.close();}
