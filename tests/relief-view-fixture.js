// Use the real server presentation functions outside the public browser VM.
const fs=require('node:fs'),vm=require('node:vm');
const server=vm.createContext({GSISRelief:require('../shared/relief'),GSISWorkload:require('../shared/workload'),GSISTeachingRules:require('../shared/teaching-rules')});
vm.runInContext(fs.readFileSync('backend/Relief.gs','utf8'),server);
module.exports=(doc,roles=['Admin'])=>server.reliefView_(JSON.parse(JSON.stringify(doc)),JSON.parse(JSON.stringify(doc)),{user:{roles}});
