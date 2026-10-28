/* Current physical register joined to persistent Venues identities. This
 * endpoint returns no reservations, permissions, people, policies or notes. */
function venuesCalendarCatalogue_(state,register){
  const seen=new Set(),venues=(register.rows||[]).map(room=>{
    const matches=state.venues.filter(v=>String(v.unit||'')===room.unitNumber);
    if(matches.length!==1||seen.has(matches[0].id))throw venuesError_('CATALOGUE_UNVERIFIED','Refresh Venues sources to verify the current room directory.',503);
    const venue=matches[0];seen.add(venue.id);
    const aliases=Array.from(new Set([room.shortName].concat(venue.aliases||[],venue.descriptors||[]).filter(value=>typeof value==='string'&&value.trim()&&value.length<=300).map(value=>value.trim()))).slice(0,100);
    return {id:venue.id,unit:room.unitNumber,name:room.name,aliases:aliases,active:true};
  });
  return {venues:venues.sort((a,b)=>a.unit.localeCompare(b.unit,undefined,{numeric:true}))};
}
