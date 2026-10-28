// Synthetic timetable structure only. No school identities or source data.
const days=['Monday','Tuesday','Wednesday','Thursday','Friday'];
const xml=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function html({teachers=100,perDay=17,oddEven=true,clash=true,missing=false,horizontal=false}={}){
 const total=5*perDay*(oddEven?2:1),conflicts=[perDay+perDay-6,perDay+perDay-5,...(oddEven?[6*perDay+perDay-6,6*perDay+perDay-5]:[])],sparse=new Set([...conflicts,5,8]);
 const headers='<tr><td>Teacher</td>'+Array.from({length:oddEven?10:5},(_,d)=>'<td colspan="'+perDay+'">'+(oddEven?(d<5?'Odd - ':'Even - '):'')+days[d%5]+'</td>').join('')+'</tr><tr><td></td>'+Array.from({length:total},(_,i)=>'<td>'+i%perDay+'</td>').join('')+'</tr>';
 const fields=(subject,detail=true)=>[subject,detail?'1A':'',detail?'Room A':'',detail?'Group A':'','07:00 - 07:30'].map(xml).join('<br>');
 let result='<table>'+headers;
 for(let teacher=0;teacher<teachers;teacher++){
  if(teacher===Math.ceil(teachers/2))result+='</table><table>';
  if(teacher!==1){result+='<tr><td>Teacher '+teacher+'</td>'+Array.from({length:total},(_,c)=>'<td>'+(c===teacher%total?fields('Lesson '+teacher):'')+'</td>').join('')+'</tr>';continue;}
  result+='<tr><td rowspan="2">'+(missing?'':'Teacher 1')+'</td>';
  for(let c=0;c<total;c++){
   if(horizontal&&c===3)continue;
   result+='<td rowspan="'+(sparse.has(c)?1:2)+'"'+(horizontal&&c===2?' colspan="2"':'')+'>'+(clash&&conflicts.includes(c)?fields('Activity A',false):c===2?fields('Inherited lesson'):'')+'</td>';
  }
  result+='</tr><tr>'+Array.from({length:total},(_,c)=>sparse.has(c)?'<td>'+(conflicts.includes(c)?fields('Activity B'):c===5?fields('Continuation lesson'):'')+'</td>':'').join('')+'</tr>';
 }
 return result+'</table>';
}
function col(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;}
async function xlsx(JSZip,{mixed=false,vertical=true}={}){
 const zip=new JSZip(),rows=new Map(),perDay=17,total=170,merges=['A5:A6'];
 const put=(r,c,v)=>{if(!rows.has(r))rows.set(r,[]);rows.get(r).push('<c r="'+col(c)+r+'" t="inlineStr"><is><t>'+xml(v)+'</t></is></c>');};
 for(let d=0;d<10;d++){put(3,2+d*perDay,(d<5?'Odd - ':'Even - ')+days[d%5]);merges.push(col(2+d*perDay)+'3:'+col(1+(d+1)*perDay)+'3');}
 put(4,1,'Teacher');for(let c=0;c<total;c++)put(4,c+2,c%perDay);
 put(5,1,'Teacher 1');put(7,1,'Teacher 2');put(7,2,'Ordinary\n2A\nRoom B\nGroup B');
 put(5,4,'Inherited\n1A\nRoom A\nGroup A');if(vertical)merges.push('D5:D6');
 for(const c of [28,29,113,114]){put(5,c+2,'Activity A\n\n\n');put(6,c+2,mixed?'Activity B':'Activity B\n1A\nRoom A\nGroup A');}
 zip.file('xl/workbook.xml','<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Teachers" r:id="r1"/></sheets></workbook>');
 zip.file('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>');
 zip.file('xl/worksheets/sheet1.xml','<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+[...rows].map(([r,c])=>'<row r="'+r+'">'+c.join('')+'</row>').join('')+'</sheetData><mergeCells>'+merges.map(ref=>'<mergeCell ref="'+ref+'"/>').join('')+'</mergeCells></worksheet>');
 return zip.generateAsync({type:'nodebuffer'});
}
module.exports={html,xlsx};
