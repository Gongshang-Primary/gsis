// Materialize a current local candidate for packaged boundary tests, never a release artifact.
'use strict';
const path=require('node:path'),{execFileSync}=require('node:child_process');
module.exports=function calendarCandidate(root){
 const output=path.join(root,'verification/v098q/package-candidate');
 const archive=path.join(output,'GSiS_v0.9.8q_Calendar_Patch.zip');
 execFileSync('python3',['scripts/package-098q-calendar.py','--preview','--output',output],{cwd:root,stdio:'pipe'});
 execFileSync('python3',['scripts/verify-098q-calendar.py',archive,path.join(output,'GSiS_v0.9.8q_Calendar_Review_Source.zip'),'--preview'],{cwd:root,stdio:'pipe'});
 return archive;
};
