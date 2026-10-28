/* Stable-address reads for exclusion-only saves. The two server-side searches
   scan key columns, while value reads transfer only the touched records. */
function exclusionFieldRead_(b,entry,scope,before){
 if(!entry.fastIndex||!entry.viewIndex||!entry.rootReadRanges||!entry.rootViewRanges||!entry.receiptSchema||!entry.auditIndex)return null;
 const fast=b.getSheetByName(entry.fastIndex),view=b.getSheetByName(entry.viewIndex);if(!fast||!view)return null;
 const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),exact=path=>escape(JSON.stringify(path)),sub=path=>escape(JSON.stringify(path).slice(0,-1))+'(?:,.*)?\\]';
 const structural=['teachers','teacherDrafts','levelExclusions','fieldAuthors','loads'];
 const patterns=[exact([]),...['id','name','notes','pendingUnitRename','membership'].map(k=>sub([k])),...structural.map(k=>exact([k])), '\\["(?:teachers|levelExclusions|audit)","!order[0-9]+"\\]',exact(['audit']),'\\["(?:teacherDrafts|fieldAuthors|loads)","!keys[0-9]+"\\]', '\\["loads","(?:[^"\\\\]|\\\\.)*"\\]'];
 for(const id of scope.exclusions.teachers)patterns.push(sub(['teachers','@'+id]),sub(['teacherDrafts',id]),sub(['levelExclusions','@'+id]));
 for(const key of scope.exclusions.authors)patterns.push(sub(['fieldAuthors',key]));
 function ranges(sheet){
  if(sheet.getLastRow()<2)return [];
  const rows=new Set();for(let i=0;i<patterns.length;i+=80){const finder=sheet.getRange(2,1,sheet.getLastRow()-1,1).createTextFinder('^(?:'+patterns.slice(i,i+80).join('|')+')$').matchEntireCell(true).matchCase(true).useRegularExpression(true);if(typeof finder.findAll!=='function')return null;for(const hit of finder.findAll())rows.add(hit.getRow());}
  return fieldRuns_([...rows].map(row=>({row,col:1,values:[[]]}))).map(r=>[r.row,r.values.length]);
 }
 const editRanges=ranges(fast),viewRanges=ranges(view);if(!editRanges||!viewRanges)return null;
 const values=GSISSheets.readAcross(b,[...editRanges.map(([row,height])=>({sheet:fast,row,col:1,height,width:3})),...viewRanges.map(([row,height])=>({sheet:view,row,col:1,height,width:1}))],false,{flush:false});
 const fields={},positions={},projectionPositions={},prefetchedViewPositions={};
 values.slice(0,editRanges.length).forEach((part,i)=>part.forEach(([key,row,value],j)=>{if(key){positions[key]=row;projectionPositions[key]=editRanges[i][0]+j;if(value!=='')fields[key]=value;}}));
 values.slice(editRanges.length).forEach((part,i)=>part.forEach(([key],j)=>{if(key)prefetchedViewPositions[key]=viewRanges[i][0]+j;}));
 if(!fields['[]']||!fields['["teachers"]']||!fields['["loads"]'])return null;
 const selected={...fields},containers={};
 for(const root of structural){
  const key=JSON.stringify([root]);if(!fields[key])continue;
  const keys=fieldContainerKeys_(fields,root);if(!keys)return null;
  const array=['teachers','levelExclusions'].includes(root);if(array&&keys.some(k=>!k.startsWith('@')))return null;
  containers[root]={keys,array};let keep=root==='fieldAuthors'?scope.exclusions.authors:scope.exclusions.teachers.map(id=>array?'@'+id:id);
  if(root==='loads')keep=keys;
  fieldContainerSet_(selected,root,keys.filter(k=>keep.includes(k)),array);
  if(root==='loads')for(const level of keys){const k=JSON.stringify([root,level]);if(!fields[k])return null;const value=JSON.parse(fields[k]);selected[k]=JSON.stringify(Object.prototype.hasOwnProperty.call(value,'v')?value:{o:[]});}
 }
 // Keep complete container headers in the comparison baseline. They are merged
 // back before persistence so unselected siblings can never become deletions.
 const root=fields['[]'],list=JSON.parse(root),skip=list.o.filter(k=>!scope.roots.includes(k));
 selected['[]']=JSON.stringify({o:list.o.filter(k=>scope.roots.includes(k))});
 for(const k of Object.keys(selected))if(k!=='[]'&&!scope.roots.includes(JSON.parse(k)[0]))delete selected[k];
 let d;try{d=GSISFields.inflate(selected);}catch(e){return null;}d.audit=[];
 const after=index_(b);if(after.pendingFieldCommit||after.revision!==before.revision)error_(503,'Version changed while reading; retry.');
 fieldReadState_.set(d,{fields,positions,projectionPositions,prefetchedViewPositions,store:entry.store,root,auditOrder:fields['["audit"]'],skip:[...new Set([...skip,'audit','saveReceipts'])],settings:true,selectedRoots:scope.roots,projectionComplete:true,partial:containers});return d;
}
function fieldContainerKeys_(fields,root){
 const node=JSON.parse(fields[JSON.stringify([root])]);if(node.a||node.ac)return GSISFields.order(fields,[root]);if(node.o)return node.o;if(node.oc)return Array.from({length:node.oc},(_,i)=>JSON.parse(fields[JSON.stringify([root,'!keys'+i])]).v).flat();return null;
}
function fieldContainerSet_(fields,root,keys,array){
 for(const k of Object.keys(fields)){const p=JSON.parse(k);if(p[0]===root&&p.length===2&&/^!(?:keys|order)\d+$/.test(p[1]))delete fields[k];}
 if(array){GSISFields.putOrder(fields,[root],keys);return;}
 fields[JSON.stringify([root])]=JSON.stringify(keys.length>100?{oc:Math.ceil(keys.length/100)}:{o:keys});
 if(keys.length>100)for(let i=0;i<keys.length;i+=100)fields[JSON.stringify([root,'!keys'+i/100])]=JSON.stringify({v:keys.slice(i,i+100)});
}
function fieldRestorePartial_(fields,old){
 const root=JSON.parse(fields['[]']);root.o=root.o.filter(k=>!['teachers','teacherDrafts','loads'].includes(k)||old.fields[JSON.stringify([k])]);fields['[]']=JSON.stringify(root);
 for(const root of ['teachers','teacherDrafts','loads']){
  for(const k of Object.keys(fields))if(JSON.parse(k)[0]===root)delete fields[k];
  for(const [k,v]of Object.entries(old.fields))if(JSON.parse(k)[0]===root)fields[k]=v;
 }
 for(const root of ['fieldAuthors','levelExclusions'])if(fields[JSON.stringify([root])]){
  const next=fieldContainerKeys_(fields,root),previous=old.partial[root]?.keys||[];
  fieldContainerSet_(fields,root,[...new Set([...previous,...next])],root==='levelExclusions');
 }
}
