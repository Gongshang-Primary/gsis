'use strict';

// Independent Calendar v3 emulator. It deliberately does not offer CalendarApp
// methods: iCalUIDs, REST IDs and conditional writes must use the public API.
const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
function apiError(code,reason,message){
  const error=new Error(message||`${code} ${reason}`);
  error.name='GoogleJsonResponseException';error.code=code;error.status=code;
  error.details={code,message:error.message,errors:[{domain:'calendar',reason,message:error.message}]};
  return error;
}
function makeCalendarApiMock(options={}){
  const calendars=new Map(),events=new Map(),calls=[];
  let fault=null,serial=0;
  const pageSize=options.pageSize||250;
  const stamp=()=>`\"fixture-etag-${++serial}\"`;
  function seedCalendar(calendar){
    const value={id:'staff@example.test',summary:'Synthetic Staff Calendar',timeZone:'Asia/Singapore',accessRole:'writer',...clone(calendar)};
    calendars.set(value.id,value);if(!events.has(value.id))events.set(value.id,new Map());return clone(value);
  }
  function seedEvent(calendarId,event){
    if(!calendars.has(calendarId))seedCalendar({id:calendarId});
    if(!event.id)throw Error('Fixture event requires a REST ID');
    const value={kind:'calendar#event',status:'confirmed',etag:stamp(),iCalUID:event.id+'@google.com',...clone(event)};
    events.get(calendarId).set(value.id,value);return clone(value);
  }
  function checkCalendar(calendarId,write=false){
    const calendar=calendars.get(calendarId);
    if(!calendar)throw apiError(404,'notFound','404 Calendar not found');
    if(write&&!['writer','owner'].includes(calendar.accessRole))throw apiError(403,'forbidden','403 Insufficient calendar permission');
    return calendar;
  }
  function operation(method,calendarId,id,body,params,headers,perform){
    const call={method,calendarId,id,body:clone(body),params:clone(params||{}),headers:clone(headers||{}),committed:false};calls.push(call);
    if(fault)fault('before',call);
    const value=perform(call);
    if(fault){const override=fault('after',call);if(override!==undefined)return clone(override);}
    return clone(value);
  }
  const getLive=(calendarId,id)=>{
    // A common migration error is passing CalendarEvent.getId() directly here.
    if(String(id).includes('@'))throw apiError(404,'notFound','404 REST event ID required, not iCalUID');
    const item=events.get(calendarId)?.get(id);if(!item)throw apiError(404,'notFound','404 Event not found');return item;
  };
  const instant=(part,end=false)=>{
    if(!part)return NaN;
    if(part.dateTime)return Date.parse(part.dateTime);
    if(part.date)return Date.parse(part.date+'T00:00:00+08:00');
    return NaN;
  };
  const api={
    Calendars:{get(calendarId,params){return operation('Calendars.get',calendarId,null,null,params,null,()=>{
      const {accessRole,...calendar}=checkCalendar(calendarId);return calendar;
    });}},
    CalendarList:{get(calendarId,params){return operation('CalendarList.get',calendarId,null,null,params,null,()=>checkCalendar(calendarId));}},
    Events:{
      get(calendarId,id,params){return operation('Events.get',calendarId,id,null,params,null,()=>{checkCalendar(calendarId);return getLive(calendarId,id);});},
      list(calendarId,params={}){return operation('Events.list',calendarId,null,null,params,null,()=>{
        const calendar=checkCalendar(calendarId);let items=[...events.get(calendarId).values()];
        if(!params.showDeleted)items=items.filter(e=>e.status!=='cancelled');
        if(params.iCalUID)items=items.filter(e=>e.iCalUID===params.iCalUID);
        if(params.privateExtendedProperty){
          const properties=Array.isArray(params.privateExtendedProperty)?params.privateExtendedProperty:[params.privateExtendedProperty];
          items=items.filter(e=>properties.every(p=>{const i=p.indexOf('=');return e.extendedProperties?.private?.[p.slice(0,i)]===p.slice(i+1);}));
        }
        if(params.timeMin)items=items.filter(e=>instant(e.end)>Date.parse(params.timeMin));
        if(params.timeMax)items=items.filter(e=>instant(e.start)<Date.parse(params.timeMax));
        const offset=Number(params.pageToken||0),count=Math.min(pageSize,Number(params.maxResults)||250);
        if(!Number.isInteger(offset)||offset<0)throw apiError(400,'invalid','400 Invalid page token');
        return {kind:'calendar#events',summary:calendar.summary,timeZone:calendar.timeZone,accessRole:calendar.accessRole,items:items.slice(offset,offset+count),...(offset+count<items.length?{nextPageToken:String(offset+count)}:{})};
      });},
      insert(body,calendarId,params,headers){return operation('Events.insert',calendarId,body.id,body,params,headers,call=>{
        checkCalendar(calendarId,true);
        if(!/^[a-v0-9]{5,1024}$/.test(String(body.id||'')))throw apiError(400,'invalid','400 Invalid Calendar REST event ID');
        if(events.get(calendarId).has(body.id))throw apiError(409,'duplicate','409 The requested identifier already exists');
        if(!body.start||!body.end)throw apiError(400,'invalid','400 Start and end required');
        const item=seedEvent(calendarId,body);call.committed=true;return item;
      });},
      update(body,calendarId,id,params,headers){return operation('Events.update',calendarId,id,body,params,headers,call=>{
        checkCalendar(calendarId,true);const old=getLive(calendarId,id);
        const condition=headers?.['If-Match']||headers?.['if-match'];
        if(condition&&condition!==old.etag)throw apiError(412,'conditionNotMet','412 Precondition Failed');
        if(!body.start||!body.end)throw apiError(400,'invalid','400 Start and end required');
        const item={...clone(body),id:old.id,iCalUID:old.iCalUID,etag:stamp(),status:body.status||old.status};
        events.get(calendarId).set(id,item);call.committed=true;return item;
      });},
      remove(calendarId,id,params,headers){return operation('Events.remove',calendarId,id,null,params,headers,call=>{
        checkCalendar(calendarId,true);const old=getLive(calendarId,id);
        const condition=headers?.['If-Match']||headers?.['if-match'];
        if(condition&&condition!==old.etag)throw apiError(412,'conditionNotMet','412 Precondition Failed');
        if(old.status==='cancelled')throw apiError(410,'deleted','410 Resource has been deleted');
        events.get(calendarId).set(id,{id:old.id,iCalUID:old.iCalUID,status:'cancelled',etag:stamp()});call.committed=true;
      });}
    }
  };
  return {api,calls,seedCalendar,seedEvent,
    setFault(fn){fault=fn;},
    read(calendarId,id){return clone(events.get(calendarId)?.get(id));},
    live(calendarId){return clone([...events.get(calendarId).values()].filter(e=>e.status!=='cancelled'));},
    externalPatch(calendarId,id,patch){const old=getLive(calendarId,id),value={...clone(old),...clone(patch),etag:stamp()};events.get(calendarId).set(id,value);return clone(value);}
  };
}
module.exports={makeCalendarApiMock,apiError};
