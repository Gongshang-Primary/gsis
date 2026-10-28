// A separate read-only service credential; never delegates a school-user role.
function venuesSourceError_(status,code,message){throw Object.assign(Error(message),{status,code});}
function venuesSourceHash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');}
function venuesSourceAuthenticate_(envelope,source){
 const deny=()=>venuesSourceError_(401,'VENUES_SOURCE_AUTH','Invalid Venues source request.');
 if(!envelope||typeof envelope.payload!=='string'||envelope.payload.length>120000||typeof envelope.signature!=='string'||!/^[a-f0-9]{64}$/.test(envelope.signature)||Object.keys(envelope).some(k=>!['payload','signature'].includes(k)))deny();
 const secret=gsisApiSecret_('VENUES_BRIDGE_SECRET');if(!secret||secret.length<32)venuesSourceError_(503,'VENUES_SOURCE_SETUP','Configure VENUES_BRIDGE_SECRET for the Venues source service.');
 const signature=Utilities.computeHmacSha256Signature(envelope.payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');let diff=0;for(let i=0;i<64;i++)diff|=signature.charCodeAt(i)^envelope.signature.charCodeAt(i);if(diff)deny();
 let request;try{request=JSON.parse(envelope.payload);}catch(_){deny();}
 if(!request||request.action!=='venuesSource'||request.service!=='gsis-venues-v1'||request.source!==source||Object.keys(request).some(k=>!['action','service','source','timestamp','nonce','input'].includes(k))||!Number.isFinite(request.timestamp)||Math.abs(Date.now()-request.timestamp)>60000||!/^[-\w]{36}$/.test(request.nonce||''))deny();
 const input=request.input;if(!input||typeof input!=='object'||Array.isArray(input))venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose a valid source read.');return input;
}
function venuesSourceReadInput_(input,extra=[]){
 if(!['manifest','snapshot'].includes(input.operation)||Object.keys(input).some(k=>!['operation','knownKey','expectedKey',...extra].includes(k))||['knownKey','expectedKey'].some(k=>input[k]!==undefined&&(typeof input[k]!=='string'||input[k].length>200)))venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose a supported source read.');return input;
}
function venuesSourceResult_(source,key,input,value,updatedAt){
 if(input.expectedKey!==undefined&&input.expectedKey!==key)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','The source changed. Refresh before trying again.');
 const result={schema:1,source,key,authoritative:true,observedAt:new Date().toISOString(),...(updatedAt?{updatedAt}:{})};
 return input.operation==='manifest'&&input.knownKey===key?{...result,unchanged:true}:{...result,...value};
}
