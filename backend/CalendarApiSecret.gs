// Calendar transport uses one required setting. No legacy credential fallback.
function gsisApiSecret_(){
 const value=PropertiesService.getScriptProperties().getProperty('GSIS_SECRET');
 if(typeof value!=='string'||! /^[!-~]{32,8000}$/.test(value))throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),{status:503,code:'GSIS_SECRET_INVALID'});
 return value;
}
