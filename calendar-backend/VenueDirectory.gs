/* Read-only, identity-scoped catalogue. Location remains valid free text; a
 * catalogue match never creates a booking or claims that a room is available. */
function calendarVenueCatalogue_(actor){
  const io=rc18IO_();if(io.venueCatalogue)return io.venueCatalogue;
  const unavailable={venues:[],venueSource:{status:'unavailable',message:'Venue directory is unavailable. Custom location text remains usable.'}};
  let stage='configuration',httpStatus;
  const fail=code=>{throw Object.assign(new Error('Venue directory check failed.'),{venueCode:code});};
  try{
    const props=PropertiesService.getScriptProperties(),url=props.getProperty('VENUES_APPS_SCRIPT_URL');
    if(!url)fail('VENUES_URL_MISSING');
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url))fail('VENUES_URL_INVALID');
    const secret=gsisApiSecret_('VENUES_BRIDGE_SECRET');if(!secret)fail('VENUES_SECRET_MISSING');
    const payload=JSON.stringify({action:'calendarCatalogue',service:'gsis-calendar-catalogue-v1',purpose:'calendar-venue-catalogue-v1',timestamp:Date.now(),nonce:Utilities.getUuid(),identity:{email:actor.email,subject:actor.sub},input:{operation:'calendarLookup'}});
    const signature=Utilities.computeHmacSha256Signature(payload,secret).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
    stage='transport';
    const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload:payload,signature:signature}),followRedirects:true,muteHttpExceptions:true}),raw=response.getContentText();
    httpStatus=response.getResponseCode();if(httpStatus!==200)fail('VENUES_HTTP_ERROR');
    stage='response';if(raw.length>2000000)fail('VENUES_RESPONSE_TOO_LARGE');
    let envelope;try{envelope=JSON.parse(raw);}catch(_){fail('VENUES_RESPONSE_INVALID');}
    if(envelope&&envelope.ok===false){
      stage='source';
      const safeCodes=['SETUP_REQUIRED','INVALID_SIGNATURE','EXPIRED_REQUEST','GSIS_SECRET_INVALID','FORBIDDEN','IDENTITY_CHANGED','REGISTER_SETUP_REQUIRED','REGISTER_INVALID','CATALOGUE_UNVERIFIED','COMMIT_UNCERTAIN'];
      fail(safeCodes.includes(envelope.code)?envelope.code:'VENUES_SOURCE_UNAVAILABLE');
    }
    const value=envelope&&envelope.ok===true&&envelope.data;
    stage='catalogue';if(!value||!Array.isArray(value.venues)||value.venues.length>10000)fail('VENUES_CATALOGUE_INVALID');
    const ids=new Set(),venues=value.venues.map(v=>{
      if(!v||typeof v.id!=='string'||!v.id||v.id.length>200||ids.has(v.id)||typeof v.unit!=='string'||!v.unit||v.unit.length>200||typeof v.name!=='string'||!v.name||v.name.length>300||v.active!==true||!Array.isArray(v.aliases)||v.aliases.length>100||v.aliases.some(a=>typeof a!=='string'||a.length>300))fail('VENUES_CATALOGUE_INVALID');
      ids.add(v.id);return {id:v.id,unit:v.unit,name:v.name,aliases:v.aliases,active:true};
    });
    io.venueDiagnostic={status:'ready',code:'READY',stage:'catalogue',venueCount:venues.length,message:'School venue lookup is available. Selecting a venue does not reserve it.'};
    return io.venueCatalogue={venues:venues,venueSource:{status:'ready'}};
  }catch(error){
    const code=error.venueCode||(error.code==='GSIS_SECRET_INVALID'?'GSIS_SECRET_INVALID':stage==='transport'?'VENUES_TRANSPORT_FAILED':'VENUES_SOURCE_UNAVAILABLE');
    io.venueDiagnostic={status:'unavailable',code:code,stage:stage,message:calendarVenueDiagnosticMessage_(code),...(Number.isInteger(httpStatus)?{httpStatus:httpStatus}:{})};
    return io.venueCatalogue=unavailable;
  }
}
function calendarVenueDiagnosticMessage_(code){
  const messages={
    VENUES_URL_MISSING:'Set VENUES_APPS_SCRIPT_URL in Calendar Script Properties to the existing Venues deployment /exec URL.',
    VENUES_URL_INVALID:'Check VENUES_APPS_SCRIPT_URL: use the existing script.google.com/macros/s/.../exec deployment URL.',
    VENUES_SECRET_MISSING:'Configure the shared GSIS_SECRET on Calendar and Venues. Do not paste the key into a diagnostic.',
    GSIS_SECRET_INVALID:'Check GSIS_SECRET on Calendar and Venues: 32 to 8000 printable ASCII characters, without spaces.',
    INVALID_SIGNATURE:'Calendar and Venues could not verify the shared signing key. Check their GSIS_SECRET values privately.',
    REGISTER_SETUP_REQUIRED:'Check the Venues workbook and its shared Venues tab.',
    REGISTER_INVALID:'Review the Venues register headings, room units and required values.',
    CATALOGUE_UNVERIFIED:'Refresh Venues sources to reconcile the room register with its saved venue identities.',
    IDENTITY_CHANGED:'Staff identity changed during this lookup. Check status again.',
    FORBIDDEN:'Check current staff access in Contacts and Venues.',
    COMMIT_UNCERTAIN:'Review the unresolved Venues save before retrying the lookup.',
    EXPIRED_REQUEST:'Check the signed request timing and retry the lookup.',
    SETUP_REQUIRED:'Check the existing Venues backend configuration and shared signing key.',
    VENUES_HTTP_ERROR:'Check the Venues deployment URL and web-app access settings.',
    VENUES_RESPONSE_INVALID:'The venue endpoint did not return the expected JSON. Check its deployment and web-app access settings.',
    VENUES_RESPONSE_TOO_LARGE:'The venue catalogue response exceeded its size limit.',
    VENUES_CATALOGUE_INVALID:'Redeploy the matching Calendar and Venues backends, then check the current room register.',
    VENUES_TRANSPORT_FAILED:'Calendar could not reach the venue endpoint. Check the deployment and try again.'
  };
  return messages[code]||'The venue source could not be verified. Check Venues system status; custom location text remains usable.';
}
// Called only from the existing administrator health-check response. Never
// return endpoint URLs, credentials, staff records or raw provider errors.
function calendarVenueDirectoryStatus_(actor){
  calendarVenueCatalogue_(actor);
  return rc18IO_().venueDiagnostic||{status:'unavailable',code:'VENUES_SOURCE_UNAVAILABLE',message:calendarVenueDiagnosticMessage_('VENUES_SOURCE_UNAVAILABLE')};
}
function calendarValidateVenue_(event,before){
  const supplied=Object.prototype.hasOwnProperty.call(event,'VenueID');
  const id=String(supplied?event.VenueID||'':before&&String(before.Location||'').trim()===event.Location?before.VenueID||'':'').trim();
  if(!id)return '';
  if(before&&String(before.VenueID||'')===id&&String(before.Location||'').trim()===event.Location)return id;
  const directory=rc18IO_().venueCatalogue,venue=directory&&directory.venueSource.status==='ready'&&directory.venues.find(v=>v.id===id);
  const matches=venue&&[venue.name+' ('+venue.unit+')',venue.name,venue.unit].concat(venue.aliases).some(value=>value===event.Location);
  if(matches)return id;
  if(before&&String(before.VenueID||'')===id)return ''; // edited into custom text
  throw mutationError_('VENUE_NOT_VALIDATED','Choose a current venue directory result, or keep this as custom location text.',409,true);
}
