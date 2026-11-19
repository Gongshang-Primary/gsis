import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { JSDOM } from "jsdom";
import { encodeWorkbook, decodeWorkbook } from "../v1/web/shared/workbooks.mjs";
import { fixture, seedScenario } from "./v1-product/roster-unblock-fixtures.mjs";
import { loadVersion } from "../v1/services/deploy/service.mjs";
import { schoolId } from "./v1-product/roster-unblock-fixtures.mjs";
import { origin } from "./v1-product/suite.mjs";
const f = await fixture();
try {
  const { versionId } = await f.call(f.admin,"deploy","/versions/create",{operationId:"synthetic-links-create",name:"Synthetic catalogue links",year:2026});
  const lease = await f.call(f.admin,"deploy","/lease",{operationId:"synthetic-links-lease",versionId,scope:"meta",clientId:"synthetic-links"});
  await f.call(f.admin,"deploy","/change",{operationId:"synthetic-links-matrix",versionId,scope:"meta",clientId:"synthetic-links",leaseFence:lease.fence,edits:[{operation:"setRoleMemberships",expected:[],value:[["Unit Lead","Synthetic unit leader","","","1","1","","","","","","","Grade A",true]]}]});
  const page=await f.pageFor();
  await page.goto(origin+"/deploy/");
  await page.getByRole("button",{name:"HR Settings",exact:true}).click();
  await page.getByRole("button",{name:"Teachers",exact:true}).click();
  await page.getByRole("button",{name:"Add teacher",exact:true}).click();
  const options=await page.locator('select[data-profile="1"] option').allTextContents();
  assert(options.includes("Unit Lead"),"Saved role matrix must supply Add teacher Role choices even with zero teachers");
  const dialog=page.locator('.inline-editor').filter({has:page.locator('select[data-profile="1"]')});
  await page.locator('label').filter({has:page.locator('select[data-profile="1"]')}).locator('summary').click();
  await page.getByRole('option',{name:'Unit Lead',exact:true}).click();
  assert.equal(await page.locator('input[data-profile="2"]').inputValue(),'Grade A','Role selection previews its configured grade');
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'HR Terms',exact:true}).click();
  const hr=page.locator('table[data-hr-choices]');await hr.waitFor();
  assert.match(await hr.innerText(),/Unit Lead/);
  for(const [field,value] of [['Appointment Status','Acting\nConfirmed'],['Employment Modifier','BT\n4/5'],['Subject Modifier','Music\nArt'],['EO Appt Level','Grade A\nGrade B'],['MK Modifier','MK']]){
    const input=hr.getByRole('textbox',{name:field+' choices',exact:true});await input.fill(value);await input.blur();
  }
  await page.locator('#saveQueue').getByRole('button',{name:'Save to online',exact:true}).click();
  await page.waitForFunction(()=>!queuedEdits().length&&!queueFlight);
  const db=await f.db('deploy');
  assert.deepEqual((await loadVersion(db,schoolId,versionId)).doc.hrChoices['Appointment Status'],['Acting','Confirmed']);
  await page.reload();
  await page.getByRole('button',{name:'HR Settings',exact:true}).click();
  await page.getByRole('button',{name:'Teachers',exact:true}).click();
  await page.getByRole('button',{name:'Add teacher',exact:true}).click();
  for(const [index,expected] of [[1,['Unit Lead']],[3,['Acting','Confirmed']],[4,['BT','4/5']],[5,['Music','Art']],[6,['Y','N']]]){
    const actual=await page.locator('select[data-profile="'+index+'"]').locator('option').allTextContents();
    for(const label of expected)assert(actual.includes(label),'linked choice '+label);
  }
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Membership',exact:true}).click();
  assert.deepEqual(await page.locator('#deploy-role-grade-choices option').allTextContents(),['Grade A','Grade B']);

  await page.getByRole('button',{name:'HR Terms',exact:true}).click();
  const tools=page.locator('#content .gsis-core-tools').first();
  await tools.getByRole('combobox',{name:'Excel export scope',exact:true}).selectOption('all');
  const download=page.waitForEvent('download');await tools.getByRole('button',{name:'Export Excel',exact:true}).click();
  const xml=new JSDOM('');
  const book=await decodeWorkbook(await readFile(await (await download).path()),{Zip:JSZip,XMLParser:xml.window.DOMParser});
  xml.window.close();
  assert.deepEqual(book.sheets['HR Terms'].columns,['Field','Choices — one per line']);
  book.sheets['HR Terms'].rows.find(row=>row[0]==='Appointment Status')[1]='Acting\nConfirmed\nTemporary';
  const choose=page.waitForEvent('filechooser');await tools.getByRole('button',{name:'Import Excel',exact:true}).click();
  await (await choose).setFiles({name:'synthetic-hr.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(await encodeWorkbook(book,{Zip:JSZip}))});
  const importer=page.getByRole('dialog',{name:'Import Deploy workbook',exact:true});
  await importer.getByRole('button',{name:'Confirm atomic replacement',exact:true}).click();
  await importer.getByRole('status').filter({hasText:'Draft replacement committed'}).waitFor();
  await importer.getByRole('button',{name:'Close',exact:true}).click();
  assert.deepEqual((await loadVersion(db,schoolId,versionId)).doc.hrChoices['Appointment Status'],['Acting','Confirmed','Temporary']);
  const scenario=await seedScenario(f),staff=scenario.staff[0];
  // Contacts created after this version remain candidates until an explicit
  // owner refresh saves membership; a read must not populate this fixture.
  const refreshClient = await page.evaluate(() => clientId);
  const refreshLease = await f.call(f.admin, "deploy", "/lease", {
    operationId: "synthetic-links-refresh-lease", versionId, scope: "meta", clientId: refreshClient,
  });
  await f.call(f.admin, "deploy", "/change", {
    operationId: "synthetic-links-refresh-members", operation: "acceptContacts", versionId,
    scope: "meta", clientId: refreshClient, leaseFence: refreshLease.fence,
  });
  assert.deepEqual((await loadVersion(db, schoolId, versionId)).doc.teachers.map(t => t.id).sort(), scenario.staff.slice().sort());
  await page.reload();await page.getByRole('button',{name:'HR Settings',exact:true}).click();
  await page.getByRole('button',{name:'Teachers',exact:true}).click();
  const staffRow=page.locator('[data-roster-teacher="'+staff+'"]');
  await staffRow.locator('select[data-field="Role"]').locator('..').locator('summary').click();
  await page.getByRole('option',{name:'Unit Lead',exact:true}).click();
  assert.equal(await staffRow.locator('td').nth(3).innerText(),'Grade A','existing row updates grade immediately');
  await page.locator('#saveQueue').getByRole('button',{name:'Save to online',exact:true}).click();
  try { await page.waitForFunction(()=>!queuedEdits().length&&!queueFlight); }
  catch(error) { console.error(JSON.stringify({failed:f.requests.filter(r=>r.status>=400).map(r=>({url:r.url,input:r.input,body:r.body})),queue:await page.evaluate(()=>queuedEdits()),content:await page.locator('#saveQueue').innerText()}));throw error; }
  await page.reload();await page.getByRole('button',{name:'HR Settings',exact:true}).click();
  await page.getByRole('button',{name:'Teachers',exact:true}).click();
  assert.equal(await page.locator('[data-roster-teacher="'+staff+'"] td').nth(3).innerText(),'Grade A');
  console.log("PASS built browser/Worker/D1 links: empty-school Role choices, role-grade preview, HR choices save/reload and all existing Teachers selectors");
} finally { await f.close(); }
