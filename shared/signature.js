/* Signature designation rules are shared by browser rendering and Admin settings validation. */
var GSISSignature=(function(){
 const SUBJECTS=[['Art','Art'],['CL','Chinese Language'],['TL','Tamil Language'],['ML','Malay Language'],['SS','Social Studies'],['Sci','Science'],['Music','Music'],['EL','English Language'],['Math','Mathematics'],['PHE','Physical Education']];
 const canonical=s=>({PE:'PHE',MA:'Math',Mathematics:'Math',Science:'Sci'}[s]||s);
 const defaults=()=>SUBJECTS.map(x=>x[0]);
 function validate(selected){if(!Array.isArray(selected)||selected.length>SUBJECTS.length||selected.some(x=>!SUBJECTS.some(([code])=>code===x))||new Set(selected).size!==selected.length)throw Error('Choose signature subjects from the available list.');return selected.slice();}
 function designation(person,settings,published){
  const formal=String(person.formalRole||'').trim();
  if(formal&&!/^Teacher(?:\b|\()/i.test(formal))return formal;
  if(!published)return 'Teacher';
  const selected=new Set(settings?.subjects||defaults()),codes=new Set((person.teachingAssignments||[]).map(a=>canonical(a.subject)));
  const names=SUBJECTS.filter(([code])=>selected.has(code)&&codes.has(code)).map(([,name])=>name).sort((a,b)=>a.localeCompare(b,'en'));
  if(!names.length)return 'Teacher';
  const text=names.length===1?names[0]:names.slice(0,-1).join(', ')+' & '+names.at(-1);
  return 'Teacher ('+text+')';
 }
 function self(people,email){const matches=(people||[]).filter(p=>String(p.emails?.gsps||'').toLowerCase()===String(email||'').toLowerCase());if(matches.length!==1)throw Error('Your school email must match exactly one contact record. Ask an Admin to check it.');if(!String(matches[0].statutoryName||'').trim())throw Error('Add your Statutory Name in DIY update before downloading a signature.');return matches[0];}
 function fit(ctx,text,weight,size,width){let n=size;ctx.font=weight+' '+n+'px "GSIS Outfit"';while(ctx.measureText(text).width>width&&n>1){n-=0.25;ctx.font=weight+' '+n+'px "GSIS Outfit"';}return n;}
 let assets=null;
 function loadAssets(){if(assets)return assets;assets=(async()=>{
  const regular=new FontFace('GSIS Outfit','url("signature-assets/Outfit-Regular.ttf")',{weight:'400'}),bold=new FontFace('GSIS Outfit','url("signature-assets/Outfit-Bold.ttf")',{weight:'700'});
  await Promise.all([regular.load(),bold.load()]);document.fonts.add(regular);document.fonts.add(bold);
  const base=new Image();base.src='signature-assets/template.png?v=0.5.0';await base.decode();return base;
 })().catch(e=>{assets=null;throw Error('Signature artwork or Outfit fonts could not load. Retry the preview.');});return assets;}
 async function render(canvas,person,settings,published){const name=String(person.statutoryName||'');if(!name.trim())throw Error('Statutory Name is required.');const title=designation(person,settings,published),base=await loadAssets();canvas.width=base.naturalWidth;canvas.height=base.naturalHeight;const ctx=canvas.getContext('2d');if(!ctx)throw Error('Your browser cannot render a signature.');
  // Copy the supplied final-size artwork pixel for pixel. Draw only the personal text.
  ctx.drawImage(base,0,0);const scale=canvas.width/900;ctx.textBaseline='alphabetic';ctx.fillStyle='#0A2A49';const x=148*scale,width=736*scale,nameSize=fit(ctx,name,'700',28*scale,width);ctx.fillText(name,x,35*scale);ctx.fillStyle='#000000';const designationSize=fit(ctx,title,'400',22*scale,width);ctx.fillText(title,x,61*scale);return {name,designation:title,width:canvas.width,height:canvas.height,nameSize,designationSize};}
 async function png(canvas){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG export failed. Retry the preview.')),'image/png'));}
 return {SUBJECTS,defaults,canonical,validate,designation,self,fit,render,png};
})();
if(typeof module!=='undefined'&&module.exports)module.exports=GSISSignature;
