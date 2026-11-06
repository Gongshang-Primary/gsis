// Targeted, repeatable cleanup of the shipped v1.5 frontend patch layers.
// Uses Node's parser to find complete known function statements, no new dependency.
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const {browser}=require('./frontend_harness.cjs');
const root=path.resolve(__dirname,'..'),baseline=path.join(__dirname,'baselines/v1.5/Source');
function functionStatements(source,name){
  const pattern=new RegExp('^(?:(?:async )?function '+name+'\\s*\\(|'+name+'\\s*=\\s*(?:async )?function\\s*\\()','gm');
  const ranges=[];let match;
  while((match=pattern.exec(source))){
    let end=source.indexOf('\n',match.index);
    while(end!==-1){
      try{new vm.Script(source.slice(match.index,end));ranges.push([match.index,end+1]);break;}catch{}
      end=source.indexOf('\n',end+1);
    }
    assert(end!==-1,'Unterminated function '+name);
  }
  return ranges;
}
function removeRanges(source,ranges){
  for(const [start,end] of ranges.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+source.slice(end);
  return source;
}
function declaration(name,fn){return fn.replace(/^(async )?function\s*(?:\w+)?\s*\(/,(_,asyncWord)=>`${asyncWord||''}function ${name}(`);}
function replaceKnown(source,name,fn){
  const ranges=functionStatements(source,name);assert(ranges.length,name+' was not found');
  return removeRanges(source,ranges)+'\n'+declaration(name,fn)+'\n';
}
const removedLord=['loadBookingEdit','authenticateBookingOverlay','checkBookingAvailability','getBookingOverrideIfNeeded','renderBookingSuccess','renderLoanDetails','validateIdentityForLoan','bindGlobalReturnChecks','globalCheckHtml','bindTrolleyDetails'];
function simplifyLord(source){
  for(const name of removedLord){
    assert.equal((source.match(new RegExp('\\b'+name+'\\b','g'))||[]).length,1,name+' has a caller');
    source=removeRanges(source,functionStatements(source,name));
  }
  return source;
}
function simplifyOverlord(source){
  const h=browser('overlord',{source,preserveRender:true});
  const value=name=>vm.runInContext(name+'.toString()',h.ctx);
  for(const name of ['showOverlordAuth','openAdminEditor','saveAdminEdit','adminCancel','renderExceptions','showReturnIssuesInActionRequired'])source=replaceKnown(source,name,value(name));
  for(const [name,baseName,alias] of [['showDetails','renderBaseDetails','rc18BaseShowDetails'],['openMovementPhotos','renderBaseMovementPhotos','rc18BaseOpenMovementPhotos']]){
    source=replaceKnown(source,name,value(name).replace(alias,baseName));
    source+='\n'+declaration(baseName,value(alias))+'\n';
  }
  const base=value('rc18BaseRender');
  const body=base.slice(base.indexOf('{')+1,base.lastIndexOf('}'));
  source=replaceKnown(source,'render',value('render').replace('rc18BaseRender();',body));
  for(const alias of ['oldSaveAdminEdit','rc18BaseRender','rc18BaseShowDetails','rc18BaseOpenMovementPhotos','rc18BaseRenderExceptions','rc18CommentsBaseShowDetails','rc18CommentsBaseOpenMovementPhotos']){
    source=source.replace(new RegExp('^const '+alias+'=[^\\n]+\\n','m'),'');
    assert(!new RegExp('\\b'+alias+'\\b').test(source),'Live alias '+alias);
  }
  source=source.replace(/^const V11_DASHBOARD_FRESH_MS=.*\n/m,'');
  source=source.replace('\nbootOverlord();','');
  // The final renderers no longer use these superseded presentation helpers.
  for(const name of ['issueBannerHtml','movementCommentsHtml','actionMovementCommentsHtml','movementReturnIssueNotes']){
    assert.equal((source.match(new RegExp('\\b'+name+'\\b','g'))||[]).length,1,name+' has a caller');
    source=removeRanges(source,functionStatements(source,name));
  }
  return source.replace(/\n{4,}/g,'\n\n')+'\nbootOverlord();\n';
}
if(require.main===module){
  const results=[];
  for(const [app,simplify] of [['lord',simplifyLord],['overlord',simplifyOverlord]]){
    const relative=app+'/assets/app.js',before=fs.readFileSync(path.join(baseline,relative),'utf8');
    let after=simplify(before);
    new vm.Script(after);
    const target=path.join(root,'Source',relative),current=fs.readFileSync(target,'utf8');
    after=current.split('\n')[0]+'\n'+after.split('\n').slice(1).join('\n');
    assert(current===before||current===after,'Refuse to overwrite later edits in '+relative);
    fs.writeFileSync(target,after);results.push({app,removedBytes:Buffer.byteLength(before)-Buffer.byteLength(after),removedLines:before.split('\n').length-after.split('\n').length});
  }
  console.log(JSON.stringify(results,null,2));
}
module.exports={simplifyLord,simplifyOverlord,removedLord};
