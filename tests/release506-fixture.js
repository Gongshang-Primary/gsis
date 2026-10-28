// Load canonical modules without writing generated release bundles.
const fs=require('fs'),path=require('path');
const read=fs.readFileSync,base=path.join(__dirname,'..');
const modules=[['backend/FieldStore.gs','GSIS_FIELDSTORE'],['backend/Planning.gs','GSIS_BACKEND_PLANNING'],['backend/PlanningPatch.gs','GSIS_PATCH'],['shared/planning.js','GSIS_PLANNING']].map(([file,marker])=>[read(path.join(base,file),'utf8'),marker]);
fs.readFileSync=function(file,...args){let data=read.call(this,file,...args);if(String(file).endsWith('/backend/Code.gs')&&typeof data==='string')for(const [source,marker]of modules)data=data.replace(new RegExp('/\\* '+marker+'_BEGIN \\*/[\\s\\S]*?/\\* '+marker+'_END \\*/'),()=> '/* '+marker+'_BEGIN */\n'+source+'\n/* '+marker+'_END */');return data;};
try{module.exports=require('./storage.cjs');}finally{fs.readFileSync=read;}
