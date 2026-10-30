/* Native preparation exports: real pure timetable rules; only source storage is simulated. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const root=require('node:path').resolve(__dirname,'../..'),file=root+'/backend/RosterTimetablePreparation.gs';
const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
const sha=x=>crypto.createHash('sha256').update(typeof x==='string'?x:canonical(x),'utf8').digest('hex');
function fixture(options={}){
 // The backend's fixed fixture day is 2026-10-28; freeze the clock there too, so
 // capture-window checks do not expire as real time passes.
 options={at:'2026-10-28T10:00:00+08:00',...options};
 const Clock=options.at?class extends Date{constructor(...args){super(...(args.length?args:[options.at]));}static now(){return Date.parse(options.at);}}:Date;
 const scope={console,Date:Clock,Map,Set,WeakMap,JSON,Number,String,Array,Object,Math,Error};vm.createContext(scope);
 for(const name of ['roster.js','roster-stapler.js','roster-operations.js'])vm.runInContext(fs.readFileSync(root+'/shared/'+name,'utf8'),scope,{filename:name});
 const S=scope.GSISRosterStapler,week={days:['Monday','Tuesday','Wednesday','Thursday','Friday'],perDay:4,maxPeriod:3,blocks:[{name:'Teacher A',cells:Array.from({length:20},(_,i)=>i===0?['EL','3A','Room 1','']:['','','',''])},{name:'Teacher B',cells:Array.from({length:20},()=>['','','',''])}]};
 const models={fileA:{layoutMode:'single-week',single:week,timing:{startMinutes:450,periodMinutes:30,normalLastPeriod:3,endOfDayMinutes:570},recesses:[],PRIVATE_CONTACT:'SECRET_PRIVATE_CONTACT'}};
 let index={schema:1,revision:4,entries:[{id:'baseA',name:'Current base',from:'2026-10-28',to:'2026-11-10',priority:1,modelFile:'fileA',createdBy:'PRIVATE_EMAIL',createdAt:'PRIVATE_TIME'}]},state={revision:8,staplerPlans:[],audit:[],absences:[{reason:'PRIVATE_ABSENCE'}],outbox:[{secret:'PRIVATE_OUTBOX'}]};
 const periods=Array.from({length:4},(_,period)=>({period,startMinutes:450+period*30,endMinutes:480+period*30}));
 const plan=S.create({date:'2026-10-29',modelId:'historical-base',parity:'odd',periods,endOfDayMinutes:570,recesses:[],teachers:[{staffId:'a',name:'Teacher A',timetableName:'Teacher A',cells:[['EL','3A','Room 2',''],['','','',''],['','','',''],['','','','']]}],formClasses:[]});
 plan.PRIVATE_EXTENSION='PRIVATE_EXTENSION';plan.teachers[0].email='PRIVATE_EMAIL';plan.tiles[0].privateNote='PRIVATE_TILE_NOTE';plan.baseline.tiles[0].privateNote='PRIVATE_BASE_NOTE';plan.mats=[{target:'teacher',targetId:'a',fromPeriod:1,toPeriod:2,reason:'PRIVATE_SUSPENSION_REASON',note:'PRIVATE_MAT_NOTE'}];
 state.staplerPlans=[{date:plan.date,name:'Confirmed plan',baselineId:'historical-base',revision:7,draft:JSON.parse(JSON.stringify(plan)),confirmedPlan:plan,confirmedRevision:3,confirmedAt:'2026-10-20T00:00:00.000Z',confirmedBy:'PRIVATE_EDITOR',confirmed:true}];
 state.staplerPlans[0].draft.tiles[0].venue='PRIVATE_DRAFT_VENUE';
 let today='2026-10-28',reads=0,afterRead=null;
 scope.rosterToday_=()=>today;scope.rosterIndex_=()=>JSON.parse(JSON.stringify(index));scope.rosterOperationsState_=()=>{const out=state;reads++;if(afterRead)afterRead(reads);return out;};scope.rosterReadFile_=id=>{assert.ok(Object.hasOwn(models,id));return JSON.stringify(models[id]);};
 scope.rosterOperationsPlanDigest_=raw=>sha(raw);scope.Utilities={newBlob:x=>({getBytes:()=>Array.from(Buffer.from(x,'utf8'))})};scope.error_=(status,message)=>{throw Object.assign(Error(message),{status});};
 for(const key of ['LockService','CacheService','PropertiesService','UrlFetchApp','DriveApp'])scope[key]=new Proxy({},{get(){assert.fail(key+' must not be used by the preparation exporter');}});
 if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),scope,{filename:'RosterTimetablePreparation.gs'});
 const admin={user:{rosterAdmin:true}},call=(operation,input={},c=admin)=>scope.rosterTimetablePreparationDispatch_({input:{operation,...input}},c);
 return {scope,S,models,plan,call,state,index,setIndex:x=>index=x,setState:x=>state=x,setToday:x=>today=x,after:f=>afterRead=f};
}

module.exports={fixture,canonical,sha};
