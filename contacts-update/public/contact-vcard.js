/* Portable contact copies are generated only from the selected, loaded directory row. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GSISContactVCard=api;})(typeof window==='object'?window:globalThis,function(){
 'use strict';
 function escapeText(value){
  const text=String(value??'');
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))throw Error('Contact details contain an unsupported control character.');
  return text.replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/;/g,'\\;').replace(/,/g,'\\,');
 }
 function foldLine(value){
  let result='',octets=0;
  for(const character of value){const point=character.codePointAt(0),size=point<0x80?1:point<0x800?2:point<0x10000?3:4;if(octets+size>75){result+='\r\n ';octets=1;}result+=character;octets+=size;}
  return result;
 }
 function mobileNumber(value){
  let number=String(value??'').trim().replace(/[\s().-]/g,'');
  if(/^00\d+$/.test(number))number='+'+number.slice(2);
  else if(/^\d{8}$/.test(number))number='+65'+number;
  else if(/^65\d{8}$/.test(number))number='+'+number;
  return /^\+?\d{7,15}$/.test(number)?number:'';
 }
 function buildContactVCard(person){
  if(!person||typeof person!=='object')throw Error('Choose a loaded contact to export.');
  const first=String(person.name??''),last=String(person.statutoryName??''),name=['GSPS',first,last].filter(value=>value!=='').join(' ');
  const lines=['BEGIN:VCARD','VERSION:3.0','N:'+escapeText(last)+';'+escapeText(first)+';;GSPS;','FN:'+escapeText(name),'ORG:Gongshang Primary School'];
  const mobile=mobileNumber(person.mobile);if(mobile)lines.push('TEL;TYPE=CELL:'+mobile);
  const seen=new Set();for(const key of ['gsps','icon','ces']){const value=String(person.emails?.[key]??'').trim(),identity=value.toLowerCase();if(/^[^@\s,;\\<>]+@[^@\s,;\\<>]+\.[^@\s,;\\<>]+$/.test(value)&&!seen.has(identity)){lines.push('EMAIL;TYPE=INTERNET,WORK:'+escapeText(value));seen.add(identity);}}
  if(String(person.ext??'').trim())lines.push('NOTE:'+escapeText('School extension: '+String(person.ext).trim()));
  lines.push('END:VCARD');
  const base=('GSPS '+(first||last||'contact')).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  return {filename:Array.from(base).slice(0,100).join('').replace(/[. ]+$/,'')+'.vcf',text:lines.map(foldLine).join('\r\n')+'\r\n'};
 }
 return {buildContactVCard};
});
