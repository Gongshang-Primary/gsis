// Separate read-only service boundary; no school-user identity or role delegation.
function lordSourceError_(status,code,message){throw Object.assign(Error(message),{status,code});}
function lordSourceHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function lordSourceAuthenticate_(envelope,source){
 const fail=()=>lordSourceError_(401,'SOURCE_UNAUTHORIZED','Invalid LORD reference service request.');
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>6000||typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature)||Object.keys(envelope).some(k=>!['payload','signature'].includes(k)))fail();
 const secret=gsisApiSecret_('LORD_BRIDGE_SECRET');if(!secret||secret.length<32)lordSourceError_(503,'SOURCE_UNAVAILABLE','Configure the LORD reference service connection.');
 const signature=Utilities.computeHmacSha256Signature(envelope.payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');let mismatch=0;for(let i=0;i<64;i++)mismatch|=signature.charCodeAt(i)^envelope.signature.charCodeAt(i);if(mismatch)fail();
 let req;try{req=JSON.parse(envelope.payload);}catch(_){fail();}
 if(!req||req.action!=='lordService'||req.service!=='gsis-lord-v1'||req.source!==source||Object.keys(req).some(k=>!['action','service','source','timestamp','nonce','input'].includes(k))||!Number.isFinite(req.timestamp)||Math.abs(Date.now()-req.timestamp)>60000||!/^[-\w]{36}$/.test(req.nonce||''))fail();
 const p=req.input;if(!p||typeof p!=='object'||Array.isArray(p)||!['manifest','snapshot'].includes(p.operation)||Object.keys(p).some(k=>!['operation','knownKey','expectedKey'].includes(k))||['knownKey','expectedKey'].some(k=>p[k]!==undefined&&(typeof p[k]!=='string'||!/^[a-f0-9]{64}$/.test(p[k]))))lordSourceError_(400,'SOURCE_REQUEST_INVALID','Choose a supported LORD reference read.');
 return p;
}
function lordSourceResult_(source,key,input,value,updatedAt){
 if(input.expectedKey!==undefined&&input.expectedKey!==key)lordSourceError_(409,'SOURCE_CHANGED','Reference data changed. Check its manifest again.');
 const meta={schema:1,source,key,authoritative:true,observedAt:new Date().toISOString(),...(updatedAt?{updatedAt}:{})};
 return input.operation==='manifest'&&input.knownKey===key?{...meta,unchanged:true}:{...meta,...value};
}
