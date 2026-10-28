const componentVersions=require('../../package.json').gsisComponentVersions;
// Real backend configuration boundaries; all values are synthetic fixtures.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../Source/backend/Code.gs'),'utf8');
const defaults={LORD_SPREADSHEET_ID:'fixture-transactions',LORD_REFERENCE_SPREADSHEET_ID:'fixture-references',LORD_PHOTO_FOLDER_ID:'fixture-photos',LORD_REIGN_ARCHIVE_FOLDER_ID:'fixture-archives',LORD_PROXY_SECRET:'fixture-proxy',LORD_BOOKING_TOKEN_PEPPER:'  exact legacy token  ',LORD_BOOKING_CODE_PEPPER:'exact legacy code',LORD_TELEGRAM_BOT_TOKEN:'fixture-telegram',LORD_TELEGRAM_CHAT_ID:'fixture-chat'};
function fixture(values=defaults){
 const state={values:{...values},reads:[],logs:[],fetches:0};
 const props={getProperty(k){state.reads.push(k);return state.values[k]??null;},getProperties(){return {...state.values};},deleteProperty(k){delete state.values[k];}};
 const ctx=vm.createContext({console:{log:v=>state.logs.push(v)},Logger:{log:v=>state.logs.push(v)},PropertiesService:{getScriptProperties:()=>props},ScriptApp:{getProjectTriggers:()=>[]},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:content=>({content,setMimeType(){return this;}})},UrlFetchApp:{fetch(){state.fetches++;throw Error('network '+defaults.LORD_TELEGRAM_BOT_TOKEN);}}});
 vm.runInContext(source,ctx);return {ctx,state};
}
const tests=[];function test(name,fn){tests.push([name,fn]);}
test('Source evaluation and public health require no properties or service reads',()=>{
 assert.doesNotThrow(()=>vm.runInContext(source,vm.createContext({})));
 const {ctx,state}=fixture({});assert.equal(state.reads.length,0);
 const result=JSON.parse(ctx.doGet({parameter:{action:'health'}}).content);assert.equal(result.ok,true);assert.equal(result.version,componentVersions.lordBackend);assert.equal(state.reads.length,0);
});
test('Lazy getters read each configured key once per execution and preserve exact peppers',()=>{
 const {ctx,state}=fixture();for(let i=0;i<3;i++){
  assert.equal(ctx.LORD_CONFIG.SPREADSHEET_ID,defaults.LORD_SPREADSHEET_ID);
  assert.equal(ctx.BOOKING_CONFIG.REFERENCE_SPREADSHEET_ID,defaults.LORD_REFERENCE_SPREADSHEET_ID);
  assert.equal(ctx.LORD_REFERENCE_CONFIG.SPREADSHEET_ID,defaults.LORD_REFERENCE_SPREADSHEET_ID);
  assert.equal(ctx.REIGN_CONFIG.ARCHIVE_FOLDER_ID,defaults.LORD_REIGN_ARCHIVE_FOLDER_ID);
  assert.equal(ctx.bookingTokenPepper_(),defaults.LORD_BOOKING_TOKEN_PEPPER);
  assert.equal(ctx.bookingCodePepper_(),defaults.LORD_BOOKING_CODE_PEPPER);
 }
 assert.equal(state.reads.length,5);assert.equal(new Set(state.reads).size,5);
 state.values.LORD_BOOKING_TOKEN_PEPPER='new fixture token';assert.equal(ctx.bookingTokenPepper_(),defaults.LORD_BOOKING_TOKEN_PEPPER);
 ctx.resetExecutionContext_();assert.equal(ctx.bookingTokenPepper_(),'new fixture token');
});
test('Existing booking token and code hashes validate with exactly copied Script Property peppers',()=>{
 const {ctx,state}=fixture();const crypto=require('node:crypto'),rows=Array(17).fill('');
 ctx.Utilities={DigestAlgorithm:{SHA_256:'SHA_256'},computeDigest:(_,value)=>Array.from(crypto.createHash('sha256').update(value).digest())};
 rows[15]=crypto.createHash('sha256').update('old-token'+defaults.LORD_BOOKING_TOKEN_PEPPER).digest('hex');
 rows[16]=crypto.createHash('sha256').update('old-code'+defaults.LORD_BOOKING_CODE_PEPPER).digest('hex');
 assert.equal(ctx.validateBookingCredential_(rows,'old-token',''),true);assert.equal(ctx.validateBookingCredential_(rows,'','old-code'),true);
 assert.equal(ctx.validateBookingCredential_(rows,'wrong-token','wrong-code'),false);
 state.values.LORD_BOOKING_TOKEN_PEPPER=defaults.LORD_BOOKING_TOKEN_PEPPER.trim();ctx.resetExecutionContext_();
 assert.equal(ctx.validateBookingCredential_(rows,'old-token',''),false,'changing legacy pepper bytes must not preserve access');
});
test('Missing, blank or placeholder proxy never authenticates and errors disclose only its property name',()=>{
 for(const value of [undefined,'',' ','REPLACE_PROXY_SECRET']){
  const {ctx}=fixture({...defaults,LORD_PROXY_SECRET:value});
  assert.throws(()=>ctx.requireProxySecret_(value),e=>/LORD_PROXY_SECRET/.test(e.message)&&!e.message.includes('fixture-proxy'));
  const result=JSON.parse(ctx.doGet({parameter:{action:'reference',proxySecret:value}}).content);assert.equal(result.ok,false);assert.match(result.error,/LORD_PROXY_SECRET/);
 }
});
test('Configured proxy matches exactly and rejects a mismatched value without revealing the secret',()=>{
 const {ctx}=fixture();assert.doesNotThrow(()=>ctx.requireProxySecret_(defaults.LORD_PROXY_SECRET));
 assert.throws(()=>ctx.requireProxySecret_('wrong'),e=>/Unauthorised/.test(e.message)&&!e.message.includes(defaults.LORD_PROXY_SECRET));
});
test('Missing storage IDs and peppers fail closed before use, without generated fallbacks',()=>{
 for(const key of ['SPREADSHEET_ID','REFERENCE_SPREADSHEET_ID','PHOTO_FOLDER_ID','REIGN_ARCHIVE_FOLDER_ID','BOOKING_TOKEN_PEPPER','BOOKING_CODE_PEPPER']){
  const {ctx}=fixture({...defaults,['LORD_'+key]:''});assert.throws(()=>ctx.LORD_CONFIG[key],e=>e.message.includes('LORD_'+key));
 }
});
test('Telegram is optional for ordinary configuration; direct sends fail before provider access',()=>{
 const {ctx,state}=fixture({...defaults,LORD_TELEGRAM_BOT_TOKEN:'',LORD_TELEGRAM_CHAT_ID:''});
 assert.equal(ctx.telegramConfigured_(),false);assert.equal(ctx.LORD_CONFIG.SPREADSHEET_ID,defaults.LORD_SPREADSHEET_ID);
 assert.throws(()=>ctx.sendOverlordTelegram_('test'),/LORD_TELEGRAM/);assert.equal(state.fetches,0);
});
test('Telegram network errors do not expose the bot token or request URL',()=>{
 const {ctx}=fixture();assert.throws(()=>ctx.sendOverlordTelegram_('test'),e=>/Telegram/.test(e.message)&&!e.message.includes(defaults.LORD_TELEGRAM_BOT_TOKEN));
});
test('Legacy cleanup preserves all configuration, bridge, WhatsApp and current receipt properties',()=>{
 const {ctx,state}=fixture({...defaults,LORD_BRIDGE_SECRET:'fixture-bridge',WHATSAPP_ACCESS_TOKEN:'fixture-wa',LORD_V14_MAINTENANCE_WARNING:'{}',LORD_IDEMPOTENCY_RC25:'obsolete'});
 const report=ctx.cleanLegacyScriptPropertiesV1();assert.deepEqual(Array.from(report.deletedLegacyKeys),['LORD_IDEMPOTENCY_RC25']);
 for(const key of Object.keys(defaults))assert.equal(state.values[key],defaults[key]);
 assert.equal(state.values.LORD_BRIDGE_SECRET,'fixture-bridge');assert.equal(state.values.WHATSAPP_ACCESS_TOKEN,'fixture-wa');assert.equal(state.values.LORD_V14_MAINTENANCE_WARNING,'{}');
 const inspection=ctx.inspectLORDV1ScriptProperties();assert.equal(inspection.configurationPropertiesRequired,true);assert(!inspection.legacyKeysSafeToDeleteAfterCutover.includes('LORD_PROXY_SECRET'));
 const logged=JSON.stringify(state.logs);for(const value of Object.values(defaults))assert(!logged.includes(value));
});
test('Configuration inspection identifies missing settings without accessing storage or exposing values',()=>{
 const {ctx,state}=fixture({LORD_PROXY_SECRET:defaults.LORD_PROXY_SECRET});
 const result=ctx.inspectLORDV1Configuration();assert.equal(result.ready,false);assert(result.configuration.missingRequired.includes('LORD_SPREADSHEET_ID'));
 const logged=JSON.stringify(state.logs);assert(!logged.includes(defaults.LORD_PROXY_SECRET));
});
let passed=0;for(const [name,fn]of tests){try{fn();passed++;console.log('PASS '+name);}catch(e){console.error('FAIL '+name+': '+e.message);process.exitCode=1;}}console.log(JSON.stringify({passed,failed:tests.length-passed}));
