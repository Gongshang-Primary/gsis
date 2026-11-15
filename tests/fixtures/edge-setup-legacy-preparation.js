// Captured verbatim from shared/edge-setup.js at main 84a71b50a7aa60f0f5d546cba651c4a3cc44ed3e.
// Run this old reader in the current setup flow to preserve mixed-version imports.
function preparationMessage(data,extraMs=0){
 if(['step','done','total','elapsedMs'].every(key=>data[key]===undefined)){message('Preparing one immutable source. The same request will resume after preparation.','busy');return false;}
 if(!Number.isSafeInteger(data.step)||!Number.isSafeInteger(data.done)||!Number.isSafeInteger(data.total)||data.step<1||data.total<data.step||data.done<0||data.done>data.total||!Number.isFinite(data.elapsedMs)||data.elapsedMs<0)throw Error('Preparation progress was not verified. Retry the same request.');
 message('Preparing: step '+data.step+' of '+data.total+' · '+Math.floor((data.elapsedMs+extraMs)/1000)+' s','busy');
 return true;
}
