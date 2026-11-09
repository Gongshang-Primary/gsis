// Roster/Deploy transport requires one setting without legacy fallback.
// Browser sessions retain their existing purpose- and origin-bound derivation.
function gsisApiSecret(env){
 const value=env?.GSIS_SECRET;
 if(typeof value!=='string'||!/^[!-~]{32,8000}$/.test(value)){
  throw Object.assign(Error('GSIS_SECRET must contain 32 to 8000 printable ASCII characters without spaces.'),
   {status:503,code:'GSIS_SECRET_INVALID'});
 }
 return value;
}
