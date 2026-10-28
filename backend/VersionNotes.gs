/* Independent version-note save; no planning projection or Contacts publication. */
function saveVersionNote_(b,idx,p,c,req){gsisRequireBackendRole_('deploy');
 auth_(c,'either');
 const en=idx.versions.find(x=>x.id===p.versionId);visible_(en,idx,c);
 if(!/^[\w-]{36}$/.test(p.requestId||'')||typeof p.notes!=='string'||p.notes.length>4000||typeof p.expected!=='string')error_(400,'Use up to 4,000 characters for a version note.');

 // Preserve the exact stored document: a note save must not persist model defaults.
 // The note scope deliberately bypasses model defaults and preserves all omitted fields.
 const digest=hash_(['saveVersionNote',en.id,p.notes,p.expected]),prior=storedReceipt_(b,en,p.requestId);
 if(prior){if(prior.actor!==req.identity.email||prior.digest!==digest)error_(409,'Save ID belongs to a different request');return {saved:true,duplicate:true,versionId:en.id,requestId:p.requestId,notes:p.notes,revision:en.revision};}
 const d=document_(b,en,'note');
 if(!Number.isFinite(p.issuedAt)||p.issuedAt<Date.now()-86400000||p.issuedAt>Date.now()+60000)error_(409,'This save attempt expired. Review the saved note before trying again.');
 const lease=leases_()[d.id+'|meta'];if(lease&&(lease.actor!==req.identity.email||lease.clientId!==p.clientId))error_(423,'Version settings are being edited. Retry after that edit finishes.');
 if((d.notes||'')!==p.expected)error_(409,'The saved note changed. Review the latest note before saving your draft.');
 const before=d.notes||'';d.notes=p.notes;d.audit=d.audit||[];log_(d,req,'Save version note',before,d.notes);
 fieldPendingReceipt_.set(d,{id:p.requestId,actor:req.identity.email,digest,at:new Date().toISOString(),conflicts:[]});
 const entry=persist_(b,idx,d,p.requestId);
 return {saved:true,versionId:d.id,requestId:p.requestId,notes:d.notes,revision:entry.revision,...publication_(entry,idx)};
}
