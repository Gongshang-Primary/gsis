// Server-to-server transport only. Session keys, private links and provider credentials stay separate.
function gsisApiSecret_(legacyName){
 const properties=PropertiesService.getScriptProperties(),value=properties.getProperty('GSIS_SECRET');
 if(value!==null&&value!==undefined){
  if(typeof value!=='string'||! /^[!-~]{32,8000}$/.test(value))throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),{status:503,code:'GSIS_SECRET_INVALID'});
  return value;
 }
 return properties.getProperty(legacyName)||'';
}
