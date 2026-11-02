const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
let reads=0,pending=false,changed=false;
const entry={id:'published',commit:'commit-7',revision:7},document={id:'published',teachers:[],assignments:[]};
const scope={Number,rosterOperationsQuotaSource_:()=>({book:{},index:{},entry}),document_:()=>{reads++;return document;},index_:()=>({pendingFieldCommit:pending}),publishedEntry_:()=>changed?{...entry,commit:'new'}:entry,error_:(status,message)=>{throw Object.assign(Error(message),{status});}};
vm.createContext(scope);vm.runInContext(fs.readFileSync('backend/DeployEdge.gs','utf8'),scope);vm.runInContext(fs.readFileSync('backend/RosterEdgeMigration.gs','utf8'),scope);
assert.deepEqual(JSON.parse(JSON.stringify(scope.rosterEdgeServiceMigrationDispatch_({input:{operation:'edgeDeployPublication'}}))),{handled:true,result:{entry,document}});
assert.equal(reads,1);const same=scope.deployEdgeRosterPublication_({knownCommit:entry.commit,knownRevision:7});assert.equal(same.unchanged,true);assert.equal(reads,1,'matching publication metadata does not reread document');
pending=true;assert.throws(()=>scope.deployEdgeRosterPublication_({}),e=>e.status===503);pending=false;changed=true;assert.throws(()=>scope.deployEdgeRosterPublication_({}),e=>e.status===503);
console.log('PASS signed-service published Deploy export: immutable document, metadata-only match and changed/pending publication refusal');
