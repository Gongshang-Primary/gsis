function venuesCalendarSource_(envelope){
 const input=venuesSourceAuthenticate_(envelope,'calendar');
 if(input.operation==='manifest'){
  venuesSourceReadInput_(input,['year']);const year=Number(input.year);if(!Number.isInteger(year)||year<2000||year>2099)venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose a valid Calendar year.');
  const view=venuesCalendarView_(year);return venuesSourceResult_('calendar',view.key,input,{});
 }
 const dates=input.dates;
 if(input.operation!=='dates'||Object.keys(input).some(k=>!['operation','dates'].includes(k))||!Array.isArray(dates)||!dates.length||dates.length>62||new Set(dates).size!==dates.length||dates.some(d=>typeof d!=='string'||!/^20\d\d-\d\d-\d\d$/.test(d)||!Number.isFinite(Date.parse(d+'T12:00:00Z'))||new Date(d+'T12:00:00Z').toISOString().slice(0,10)!==d))venuesSourceError_(400,'VENUES_SOURCE_INPUT','Choose up to 62 unique valid dates.');
 const years=[...new Set(dates.map(d=>Number(d.slice(0,4))))];if(years.length!==1)venuesSourceError_(400,'VENUES_SOURCE_INPUT','Read one Calendar year per source batch.');
 const view=venuesCalendarView_(years[0]),result=dates.map(date=>view.released?rosterDateContext_(date,view.data):{date,code:'YEAR_UNAVAILABLE'});
 if(view.key!==venuesCalendarView_(years[0]).key)venuesSourceError_(409,'VENUES_SOURCE_CHANGED','Calendar changed during the dates read.');
 return {schema:1,source:'calendar',key:view.key,observedAt:isoNow_(),authoritative:true,dates:result};
}
function venuesCalendarView_(year){
 const ss=SpreadsheetApp.getActiveSpreadsheet(),rows=tableObjects_(ss.getSheetByName(CALV2.SHEETS.YEARS)).filter(r=>Number(r.Year)===year),data=rc18YearData_(year,[CALV2.SHEETS.EVENTS,CALV2.SHEETS.YEAR_STRUCTURE]);
 return {key:venuesSourceHash_([year,rows,data]),released:rows.length===1&&yes_(rows[0].ReleasedToTeachers)&&String(rows[0].Status).toUpperCase()!=='ARCHIVED',data};
}
