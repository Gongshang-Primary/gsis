/* Acknowledgement is private to the signed-in editor and version. Audit data is retained. */
function noticeAckKey_(email,version,event){return 'NOTICE_ACK_'+hash_([email,version,event]);}
function noticeAckEpoch_(email,version){return props_().getProperty('NOTICE_ACK_EPOCH_'+hash_([email,version]))||'';}
function pendingNotices_(d,c){return reliefSafeConflicts_((d.audit||[]).filter(a=>a.action==='Conflicts resolved — latest server save wins'&&!props_().getProperty(noticeAckKey_(c.user.email,d.id,a.id))).flatMap(a=>(a.after||[]).filter(x=>x.overwrittenBy===c.user.email).map(x=>({...x,requestId:a.id}))),c);}
function acknowledgeNotices_(b,idx,c,p){gsisRequireBackendRole_('deploy');
 auth_(c,'either');const en=idx.versions.find(x=>x.id===p.versionId);visible_(en,idx,c);
 if(!Array.isArray(p.eventIds)||!p.eventIds.length||p.eventIds.length>100||p.eventIds.some(id=>typeof id!=='string'||!/^[\w-]{36}$/.test(id))||new Set(p.eventIds).size!==p.eventIds.length)error_(400,'Choose saved-value notices to acknowledge.');
 const lock=LockService.getScriptLock();if(!deployLock_(lock,1000))error_(503,'A save is completing. Retry acknowledgement shortly.');
 try{
  const current=index_(b);if(current.pendingFieldCommit)error_(503,'A save is completing. Retry acknowledgement shortly.');
  const entry=current.versions.find(x=>x.id===en.id);visible_(entry,current,c);const d=document_(b,entry,'view');
  for(const id of p.eventIds){const a=(d.audit||[]).find(x=>x.id===id);if(!a||a.action!=='Conflicts resolved — latest server save wins'||!(a.after||[]).some(x=>x.overwrittenBy===c.user.email))error_(403,'This notice belongs to another editor or version.');}
  const props=props_(),stamp=new Date().toISOString();for(const id of p.eventIds)props.setProperty(noticeAckKey_(c.user.email,en.id,id),stamp);
  props.setProperty('NOTICE_ACK_EPOCH_'+hash_([c.user.email,en.id]),Utilities.getUuid());
  return {acknowledged:true,versionId:en.id,eventIds:p.eventIds};
 }finally{deployUnlock_(lock);}
}
