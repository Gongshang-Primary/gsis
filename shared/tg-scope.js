/* CCE EL consolidation is an explicit version edit; published snapshots stay intact. */
var GSISTGScope=(function(){
 const subject='CCE EL';
 const state=d=>({groups:(d.groups||[]).filter(g=>g.subject===subject),assignments:(d.assignments||[]).filter(a=>a.subject===subject),loads:Object.fromEntries(Object.entries(d.loads||{}).map(([l,r])=>[l,r[subject]??null]))});
 function consolidate(d){
  if((d.groups||[]).some(g=>g.subject===subject&&(d.assignments||[]).some(a=>a.target===g.id&&a.subject!==subject)))throw Error('A CCE EL group has another subject assigned. Review that TG before consolidation.');
  // Preserve explicit cross-level TGs and their assignments during legacy consolidation.
  const crossLevel=new Set((d.groups||[]).filter(g=>Array.isArray(g.levels)&&g.levels.length>1).map(g=>g.id));
  const audit=[],removed=new Set(),levels=new Set([...Object.keys(d.loads||{}).filter(l=>d.loads[l][subject]!=null&&!/^n\/a$/i.test(String(d.loads[l][subject]))),...(d.groups||[]).filter(g=>g.subject===subject&&!crossLevel.has(g.id)).map(g=>String(g.level)),...(d.assignments||[]).filter(a=>a.subject===subject&&!crossLevel.has(a.target)).map(a=>String(a.level))]);
  for(const level of levels){const gs=d.groups.filter(g=>g.subject===subject&&!crossLevel.has(g.id)&&String(g.level)===level),chosen=gs.find(g=>g.levelWide)||gs[0];let id=chosen?.id||'cce-el-level-'+level;while(!chosen&&d.groups.some(g=>g.id===id))id+='-new';const target=chosen||{id,name:'P'+level+' CCE EL',subject,level,venue:''};Object.assign(target,{levelWide:true,form:'',anchorRef:'',sources:[],classRefs:[],associationSchema:1});if(!chosen)d.groups.push(target);for(const g of gs)if(g!==chosen)removed.add(g.id);
   const seen=new Set();d.assignments=d.assignments.filter(a=>{if(a.subject!==subject||crossLevel.has(a.target)||String(a.level)!==level)return true;audit.push({...a});if(seen.has(a.teacher))return false;seen.add(a.teacher);a.target=target.id;a.venue=target.venue||'';delete a.targetRef;return true;});
  }
  d.groups=d.groups.filter(g=>!removed.has(g.id));if(!d.cceELScope)d.cceELScope={schema:1,previousAssignments:audit};return d;
 }
 return {state,consolidate};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISTGScope;
