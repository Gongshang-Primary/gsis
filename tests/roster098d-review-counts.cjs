const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const scope=vm.createContext({rosterOperationsDigest_:value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')});
for(const path of ['backend/RosterDeliveryReview.gs','backend/RosterNotificationMaintenance.gs'])vm.runInContext(fs.readFileSync(path,'utf8'),scope);
const state={outbox:[{id:'one',status:'uncertain',attempts:1},{id:'two',status:'uncertain',attempts:1}],deliveryReview:{issues:[],monitor:[],jobs:[]}};
state.outbox[0].adminReviewReceipt={schema:1,fingerprint:scope.rosterDeliveryReviewRowFingerprint_(state.outbox[0])};
let view=scope.rosterDeliveryReviewView_(state,true);assert.equal(view.unresolvedUncertain,1);assert.equal(view.reviewedUncertain,1);assert.equal(view.uncertain,2);assert.equal(view.messagesSent,0);
state.outbox[0].attempts++;view=scope.rosterDeliveryReviewView_(state,true);assert.equal(view.unresolvedUncertain,2);assert.equal(view.reviewedUncertain,0);
console.log('PASS uncertainty counts distinguish unresolved outcomes from exact reviewed history');
