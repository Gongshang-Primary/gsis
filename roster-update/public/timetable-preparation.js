/* Admin-only, user-initiated read-only snapshot download. No polling or browser persistence. */
(()=>{'use strict';
const $=id=>document.getElementById(id),MAX_PART=4*1024*1024,MAX_TOTAL=64*1024*1024,MAX_RESPONSE=10*1024*1024,encoder=new TextEncoder();let active=null;
function status(text,tone='info'){$('export-status').textContent=text;$('export-status').dataset.tone=tone;}
function invalid(message){throw Error(message);}
async function call(body,signal,max=MAX_RESPONSE){
 const timeout=setTimeout(()=>active?.abort(),60000);try{
 const response=await fetch('/api/operations',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});
 window.GSISversionNotice?.(response);
 if(response.status===401||response.status===403)invalid('Sign in to Roster with your school administrator account, then try again.');
 const chunks=[];let size=0;if(Number(response.headers.get('Content-Length'))>max)invalid('The export response exceeds its supported size.');const reader=response.body.getReader();try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>max){await reader.cancel();invalid('The export response exceeds its supported size.');}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}let result;try{result=JSON.parse(new TextDecoder().decode(bytes));}catch{invalid('The source response could not be read. Start a fresh export.');}
 if(!response.ok||result?.ok!==true){const changed=result?.code==='TIMETABLE_PREPARATION_CHANGED'||response.status===409,reference=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(result?.diagnosticId||'')?' Reference: '+result.diagnosticId+'.':'';invalid((changed?'The source changed during export. No mixed snapshot was downloaded. Start again.':response.status===413?'The source exceeds a preparation size limit (4 MiB per part; 64 MiB total). Ask the maintainer to review partitioning before retrying.':'The source export could not be confirmed. Check the backend deployment and retry.')+reference);}
 if(!result.data||typeof result.data!=='object'||Array.isArray(result.data))invalid('The source export response has an invalid shape. Check the backend deployment and retry.');
 // out_ adds request diagnostics to the transport response. They are not part
 // of the portable contract. Keep every other field and native byte unchanged.
 const {timing,...data}=result.data;return data;
 }finally{clearTimeout(timeout);}
}
async function download(){if(active)return;active=new AbortController();$('download-snapshot').disabled=true;$('cancel-export').disabled=false;
 try{
 status('Checking administrator access and current timetable sources…','busy');const signal=active.signal,manifest=await call({operation:'timetablePreparationManifest'},signal,1024*1024);
 if(manifest?.schema!=='gsis.timetable.preparation.manifest'||manifest.version!==1||manifest.mode!=='shadow-only'||!/^[a-f0-9]{64}$/.test(manifest.sourceKey)||!Array.isArray(manifest.parts)||manifest.parts.length>62)invalid('The source manifest could not be confirmed. Check the backend version.');
 let total=0;const ids=new Set();for(const p of manifest.parts){if(typeof p.id!=='string'||ids.has(p.id)||!['baseline','suspended'].includes(p.kind)||!Number.isSafeInteger(p.bytes)||p.bytes<1||p.bytes>MAX_PART||!/^[a-f0-9]{64}$/.test(p.sha256))invalid('The source manifest has an invalid timetable descriptor.');ids.add(p.id);total+=p.bytes;}if(total>MAX_TOTAL)invalid('The timetable snapshot exceeds the supported export size.');
 const parts=[];for(const descriptor of manifest.parts){status('Reading timetable '+(parts.length+1)+' of '+manifest.parts.length+'…','busy');const p=await call({operation:'timetablePreparationPart',sourceKey:manifest.sourceKey,partId:descriptor.id},signal);if(p?.schema!=='gsis.timetable.preparation.part'||p.version!==1||p.sourceKey!==manifest.sourceKey||p.id!==descriptor.id||p.kind!==descriptor.kind||p.sha256!==descriptor.sha256||p.bytes!==descriptor.bytes||typeof p.data!=='string')invalid('A timetable part changed or could not be confirmed. Start a fresh export.');const bytes=encoder.encode(p.data);if(bytes.byteLength!==p.bytes)invalid('Timetable byte verification failed. Start a fresh export.');const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');if(digest!==p.sha256)invalid('Timetable hash verification failed. Start a fresh export.');parts.push(p);}
 status('Checking that the Google sources still match…','busy');const sourceCheck=await call({operation:'timetablePreparationCheck',sourceKey:manifest.sourceKey},signal,1024*1024);if(signal.aborted)throw Object.assign(Error(),{name:'AbortError'});if(sourceCheck?.schema!=='gsis.timetable.preparation.check'||sourceCheck.version!==1||sourceCheck.sourceKey!==manifest.sourceKey||sourceCheck.unchanged!==true||sourceCheck.readOnly!==true||sourceCheck.calendarVerified!==false)invalid('The final source check could not confirm an unchanged snapshot. Start again.');
 const blob=new Blob([JSON.stringify({schema:'gsis.timetable.preparation.bundle',version:1,manifest,parts,sourceCheck})],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='GSiS_Timetable_Preparation_'+manifest.from+'.json';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);status('Snapshot download requested: '+parts.length+' timetable parts, '+manifest.from+' to '+manifest.to+'. Google remains authoritative.','success');
 }catch(error){status(error.name==='AbortError'?'Export stopped. No timetable source was changed. Start again when ready.':error.message||'The export could not be confirmed. Start again.','error');}finally{active=null;$('download-snapshot').disabled=false;$('cancel-export').disabled=true;}
}
$('download-snapshot').addEventListener('click',download);$('cancel-export').addEventListener('click',()=>active?.abort());
})();
