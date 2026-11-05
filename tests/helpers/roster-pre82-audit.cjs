'use strict';
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const scope=vm.createContext({GSISRosterAllocation:require('../../shared/roster-allocation.js')});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../fixtures/roster-audit-pre82.gs'),'utf8'),scope);
module.exports=scope.rosterAllocationAuditText_;
