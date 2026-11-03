const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict'),fixture=require('./roster701-fixture.cjs');
module.exports=function adapter(){
 const f=fixture(),calls={reads:0,writes:0,contexts:[],phases:[]};let durable=structuredClone(f.state),locked=false,failAfter=false;const properties=new Map([['ROSTER_OPERATIONS_FILE','ops-file']]);
 const NativeDate=Date,ClockDate=class extends NativeDate{constructor(...args){super(...(args.length?args:[f.ctx.now]));}static now(){return f.ctx.now;}};
 const scope=vm.createContext({Date:ClockDate,GSISRosterOperations:f.O,GSISRosterAllocation:require('../shared/roster-allocation.js'),GSISRoster:require('../shared/roster.js'),ROSTER_DATA:'folder',
  props_:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,String(value)),getProperties:()=>Object.fromEntries(properties),deleteProperty:key=>properties.delete(key)}),rosterFindFile_:()=> 'ops-file',rosterReadFile_:()=>{calls.reads++;return JSON.stringify(durable);},
  rosterDriveRequest_:(url,options)=>{assert(locked,'Commit without lock');durable=JSON.parse(options.payload);calls.writes++;if(failAfter){failAfter=false;throw Error('Uncertain response');}return {};},
  error_:(status,message)=>{throw Object.assign(Error(message),{status});},LockService:{getScriptLock:()=>({})},deployLock_:()=>{assert(!locked);locked=true;return true;},deployUnlock_:()=>{assert(locked);locked=false;},
  deployPhase_:(name,fn)=>{calls.phases.push(name);return fn();},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(s).digest()],getUuid:()=>crypto.randomUUID()}});
 require('./load-backend-role.cjs')(scope,'roster');
 vm.runInContext(fs.readFileSync(__dirname+'/../backend/RosterOperations.gs','utf8'),scope);
 require('./load-stapler-leases.cjs')(scope);
 scope.rosterOperationsContext_=req=>{calls.contexts.push(req.input.operation);return {...f.ctx,user:{...f.ctx.user,...req.identity},timetableEntries:[{id:'baseline',from:'2026-01-01',to:'2026-12-31'}]};};
 // This adapter supplies context directly; immutable fixture manifests match it.
 const referenceStamp=scope.rosterOperationsReferenceStamp_;
 scope.rosterOperationsReferenceStamp_=ctx=>scope.rosterOperationsReferenceKey_(ctx);
 scope.rosterServiceContacts_=()=>({identity:f.ctx.user,c:{rosterPeople:f.ctx.people,rosterSMCIds:['alice'],rosterAdminIds:['alice']}});
 return {...f,calls,scope,referenceStamp,call:(input,identity={})=>scope.rosterOperationsDispatch_({identity:{...f.ctx.user,...identity},input},{}),state:()=>structuredClone(durable),setState:s=>{durable=structuredClone(s);},locked:()=>locked,loseNextResponse:()=>{failAfter=true;}};
};
