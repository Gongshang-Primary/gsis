// Reuse the in-memory Sheets fixture to exercise the actual request dispatcher.
const fs=require('fs'),vm=require('vm');
const fixture=fs.readFileSync(__dirname+'/storage.cjs','utf8');
const checks=`
const originalDocument=document_;let reads=0;document_=(...args)=>{reads++;return originalDocument(...args)};
const first=call('sync',{versionId:id});if(reads!==1||!first.cacheKey)throw Error('Initial snapshot missing');
reads=0;const cached=call('sync',{versionId:id,cacheKey:first.cacheKey});
if(!cached.unchanged||cached.current!==null||reads!==0)throw Error('Unchanged sync read full Sheets document');
const l=call('lease',{versionId:id,key:'load:1:EL',clientId:'A'});
const locked=call('sync',{versionId:id,cacheKey:first.cacheKey});if(!locked.unchanged||!locked.leases.length)throw Error('Cached sync omitted current locks');
reads=0;const saved=call('change',{...l,versionId:id,key:'load:1:EL',clientId:'A',requestId:Utilities.getUuid(),operation:'setLoad',level:'1',subject:'EL',value:14.5});
if(reads!==1||!saved.saved||saved.snapshot)throw Error('Save must acknowledge without a full snapshot');
const after=call('sync',{versionId:id,full:true});if(after.current.loads['1'].EL!==14.5||after.leases.length)throw Error('Confirmed value or lock incorrect');
const kpOnly={...c,user:{roles:['KP']}};const redacted=dispatch_({action:'sync',input:{versionId:id,cacheKey:after.cacheKey},identity:who},kpOnly);
if(redacted.unchanged||redacted.current.audit)throw Error('Role change reused privileged snapshot');
const teacher={...c,user:{roles:[]}};let denied=false;try{dispatch_({action:'sync',input:{versionId:planningId,cacheKey:first.cacheKey},identity:who},teacher)}catch(e){denied=e.status===403}if(!denied)throw Error('Basic teacher accessed Deploy after downgrade');
reads=0;call('bootstrap',{versionId:id,cacheKey:after.cacheKey,reviewContacts:true});if(reads!==1)throw Error('Contacts review incorrectly cached');
const renamedLease=call('lease',{versionId:id,key:'meta',clientId:'A'});const renamed=call('change',{...renamedLease,versionId:id,key:'meta',clientId:'A',requestId:Utilities.getUuid(),operation:'metadata',name:'Renamed',from:'',to:''});
if(!renamed.saved||call('sync',{versionId:id,full:true}).current.name!=='Renamed')throw Error('Save catalog stale');
const deleteLease=call('lease',{versionId:planningId,key:'meta',clientId:'A'});const deleted=call('change',{...deleteLease,versionId:planningId,key:'meta',clientId:'A',requestId:Utilities.getUuid(),operation:'delete'});
if(!deleted.saved||call('sync',{versionId:id,full:true}).versions.some(x=>x.id===planningId))throw Error('Deleted snapshot not switched to active');
console.log('PASS revision cache skips document reads, locks stay fresh, save receipt avoids reread, role downgrade redacts, private plans denied, review refreshed, rename/delete catalog');
`;
const augmented=fixture.replace('`,ctx);','`,ctx);\nvm.runInContext('+JSON.stringify(checks)+',ctx);');
vm.runInNewContext(augmented,{require,__dirname,console},{filename:__filename});
