import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { chromium } from "playwright";
import { encodeWorkbook } from "../v1/web/shared/workbooks.mjs";
import { productSuite, origin } from "./v1-product/suite.mjs";

const suite = await productSuite();
let browser;
try {
  const admin = await suite.seedAccount("physical-room-admin"), reader = await suite.seedAccount("physical-room-reader", {capabilities:["venues.read"]});
  browser = await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"],executablePath:process.env.GSIS_BROWSER_EXECUTABLE||process.env.ROSTER_TEST_CHROMIUM||undefined});
  const errors=[], external=[], commands=[];
  let dropSave=false, blockReceipt=false;
  async function pageFor(user, extraHeaders={}) {
    const context=await browser.newContext({viewport:{width:1280,height:1000},timezoneId:"Asia/Singapore",extraHTTPHeaders:extraHeaders});
    await context.addCookies([{name:"__Host-gsis_session",value:user.token,domain:"gsis.example.invalid",path:"/",secure:true,httpOnly:true,sameSite:"Lax"}]);
    await context.route("**/*",async route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==origin){external.push(url.origin);await route.abort();return;}
      if(blockReceipt&&url.pathname==="/api/venues/receipt"){await route.abort();return;}
      const response=await suite.mf.dispatchFetch(request.url(),{method:request.method(),headers:await request.allHeaders(),body:["GET","HEAD"].includes(request.method())?undefined:request.postDataBuffer()});
      if(url.pathname==="/api/venues/command"){
        commands.push(request.postDataJSON());
        if(dropSave){dropSave=false;blockReceipt=true;await route.abort();return;}
      }
      const headers=Object.fromEntries(response.headers);delete headers["transfer-encoding"];
      await route.fulfill({status:response.status,headers,body:Buffer.from(await response.arrayBuffer())});
    });
    const page=await context.newPage();page.setDefaultTimeout(10000);page.on("pageerror",e=>errors.push(e.message));
    await page.goto(origin+"/venues/?view=admin");
    return {page,context};
  }
  const {page,context}=await pageFor(admin);
  const register=page.locator("#v1VenueRegister");
  await register.getByText("No physical rooms yet.",{exact:false}).waitFor();
  await register.getByRole("button",{name:"Add physical room",exact:true}).click();
  let dialog=page.getByRole("dialog",{name:"Add physical room",exact:true});
  await dialog.getByLabel("Unit",{exact:true}).fill("SYN-01");
  await dialog.getByLabel("Room name",{exact:true}).fill("Synthetic hall");
  await dialog.getByRole("button",{name:"Preview room changes"}).click();
  await dialog.getByText("1 new rooms; 0 existing rooms.",{exact:false}).waitFor();
  assert.equal(commands.length,0,"browser preview has no write");
  await dialog.getByLabel("Short name",{exact:true}).fill("SYN");
  assert.equal(await dialog.getByRole("button",{name:"Confirm register changes"}).count(),0,"editing invalidates the old preview");
  await dialog.getByRole("button",{name:"Preview room changes"}).click();
  await dialog.getByRole("button",{name:"Confirm register changes"}).click();
  await register.getByText("Synthetic hall",{exact:true}).waitFor();
  const db=await suite.db("venues");
  let rows=(await db.prepare("SELECT data_json FROM venues_records WHERE kind='venues'").all()).results.map(r=>JSON.parse(r.data_json));
  assert.equal(rows.length,1); assert.equal(rows[0].capacity,null); assert.equal(rows[0].bookable,false);
  const id=rows[0].id;

  await register.getByRole("button",{name:"Edit SYN-01",exact:true}).click();
  dialog=page.getByRole("dialog",{name:"Edit physical room",exact:true});
  assert.equal(await dialog.getByLabel("Unit",{exact:true}).getAttribute("readonly"),"");
  await dialog.getByLabel("Room name",{exact:true}).fill("Edited hall");
  await dialog.getByRole("button",{name:"Preview room changes"}).click();
  await dialog.getByRole("button",{name:"Confirm register changes"}).click();
  await register.getByText("Edited hall",{exact:true}).waitFor();

  // Export is the existing canonical Excel path, not a visible-table report.
  await register.getByLabel("Excel export scope").selectOption("all");
  const downloading=page.waitForEvent("download");
  await register.getByRole("button",{name:"Export Excel",exact:true}).click();
  const downloaded=await downloading, archive=await JSZip.loadAsync(await readFile(await downloaded.path()));
  assert((await archive.file("xl/worksheets/sheet2.xml").async("string")).includes(id));
  const current=(await suite.call(admin,"venues","/read",{operation:"admin"})).register;
  const book={schemaVersion:1,metadata:{schemaVersion:1,module:"venues-register",schoolId:current.schoolId,mode:"editable"},sheets:{Rooms:{columns:current.columns,rows:current.venues.map(r=>current.columns.map(k=>["features","aliases"].includes(k)?r[k].join("\n"):r[k]))}}};
  book.sheets.Rooms.rows[0][current.columns.indexOf("capacity")]=60;
  book.sheets.Rooms.rows[0][current.columns.indexOf("aliases")]="Exact source label";
  await register.getByRole("button",{name:"Import Excel",exact:true}).click();
  dialog=page.getByRole("dialog",{name:"Import physical room register",exact:true});
  const beforeImport=commands.length;
  await dialog.locator("[data-register-file]").setInputFiles({name:"physical-rooms.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:Buffer.from(await encodeWorkbook(book,{Zip:JSZip}))});
  await dialog.getByText("0 new rooms; 1 existing rooms.",{exact:false}).waitFor();
  assert.equal(commands.length,beforeImport);
  dropSave=true;
  await dialog.getByRole("button",{name:"Confirm register changes"}).click();
  await dialog.getByRole("button",{name:"Check / retry original register save"}).waitFor();
  const uncertainOperation=commands.at(-1).operationId;
  blockReceipt=false;
  await page.reload();
  await register.getByRole("button",{name:"Check / retry original register save"}).click();
  await page.waitForFunction(()=>!document.querySelector("#v1VenueRegister [data-register-recover]"));
  rows=(await db.prepare("SELECT data_json FROM venues_records WHERE kind='venues'").all()).results.map(r=>JSON.parse(r.data_json));
  assert.equal(rows[0].revision,3); assert.equal(rows[0].capacity,60); assert.deepEqual(rows[0].aliases,["Exact source label"]);
  assert.equal(commands.filter(c=>c.operationId===uncertainOperation).length,1,"reload recovered the committed receipt without another send");

  // An exported old revision cannot overwrite a newer edit.
  await register.getByRole("button",{name:"Import Excel",exact:true}).click();
  dialog=page.getByRole("dialog",{name:"Import physical room register",exact:true});
  await dialog.locator("[data-register-file]").setInputFiles({name:"stale.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:Buffer.from(await encodeWorkbook(book,{Zip:JSZip}))});
  await dialog.getByText("A room changed since the preview.",{exact:false}).waitFor();
  assert.equal(await dialog.getByRole("button",{name:"Confirm register changes"}).count(),0);
  await dialog.getByRole("button",{name:"Close",exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await register.getByRole("button",{name:"Add physical room",exact:true}).isVisible(),true);
  const narrow=await register.boundingBox();assert(narrow.width<=390);

  const denied=await pageFor(reader);
  await denied.page.getByText("Room management access required",{exact:true}).waitFor();
  assert.equal(await denied.page.locator("#v1VenueRegister").count(),0);
  const preview=await pageFor(admin,{"x-gsis-preview-account":admin.id});
  await preview.page.locator("#v1VenueRegister").waitFor();
  assert.equal(await preview.page.getByRole("button",{name:"Add physical room",exact:true}).isDisabled(),true);
  await page.evaluate(()=>dispatchEvent(new Event("gsis:clear-protected-state")));
  assert.equal(await page.locator("#v1VenueRegister").count(),0);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  await context.close();await denied.context.close();await preview.context.close();
  console.log("PASS built Venues register: empty Add/Edit, unknown capacity, real XLSX export/preview/import, saved-receipt reload recovery, stale preview, reader/preview denial, account clearing and narrow viewport");
} finally {await browser?.close();await suite.close();}
