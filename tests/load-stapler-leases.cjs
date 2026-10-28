'use strict';
// Production lease metadata is a separate backend module, including in VM harnesses.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=(scope,root=path.resolve(__dirname,'..'))=>{const file=path.join(root,'backend/StaplerLeases.gs');if(typeof scope.rosterStaplerLeaseAttach_!=='function'&&fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),scope);};
