// Intentional settings-storage migration only. Frozen historical sources remain
// byte-for-byte intact; configuration comparison uses synthetic current values.
const vm=require('vm');
const settings=require('./backend_config_fixture.cjs');
const aliases={
 LORD_CONFIG:{SPREADSHEET_ID:'LORD_SPREADSHEET_ID',REFERENCE_SPREADSHEET_ID:'LORD_REFERENCE_SPREADSHEET_ID',PHOTO_FOLDER_ID:'LORD_PHOTO_FOLDER_ID',REIGN_ARCHIVE_FOLDER_ID:'LORD_REIGN_ARCHIVE_FOLDER_ID',PROXY_SECRET:'LORD_PROXY_SECRET',BOOKING_TOKEN_PEPPER:'LORD_BOOKING_TOKEN_PEPPER',BOOKING_CODE_PEPPER:'LORD_BOOKING_CODE_PEPPER'},
 BOOKING_CONFIG:{REFERENCE_SPREADSHEET_ID:'LORD_REFERENCE_SPREADSHEET_ID'},
 OVERLORD_CONFIG:{TELEGRAM_BOT_TOKEN:'LORD_TELEGRAM_BOT_TOKEN',TELEGRAM_CHAT_ID:'LORD_TELEGRAM_CHAT_ID'},
 LORD_REFERENCE_CONFIG:{SPREADSHEET_ID:'LORD_REFERENCE_SPREADSHEET_ID'},
 REIGN_CONFIG:{ARCHIVE_FOLDER_ID:'LORD_REIGN_ARCHIVE_FOLDER_ID'}
};
function context(source){
 const ctx=vm.createContext({});
 Object.defineProperty(ctx,'PropertiesService',{value:{getScriptProperties:()=>({getProperty:key=>settings[key]??null})},enumerable:false});
 vm.runInContext(source,ctx);return ctx;
}
function value(ctx,name){
 const runtime=ctx.LORD_RUNTIME_;
 try{
  const result=JSON.parse(JSON.stringify(ctx[name]));
  // Only the recorded sanitized literals are translated. Current getters must
  // independently return the correct synthetic value for equality to pass.
  for(const [field,property] of Object.entries(aliases[name]||{})){
   if(typeof result[field]==='string'&&result[field].startsWith('REPLACE_'))result[field]=settings[property];
  }
  // LORD_PROXY_SECRET is now protected configuration, never a cleanup target.
  if(name==='LORD_PROPERTY_POLICY'&&!ctx.LORD_CONFIGURATION_PROPERTIES){
   result.LEGACY_EXACT=result.LEGACY_EXACT.filter(key=>key!=='LORD_PROXY_SECRET');
  }
  return result;
 }finally{ctx.LORD_RUNTIME_=runtime;}
}
module.exports={context,value,
 changed:['isCurrentLORDRuntimeProperty_','inspectLORDV1ScriptProperties','inspectLORDV1Configuration','selfTestLORDV1','sendOverlordTelegram_'],
 added:['LORD_CONFIGURATION_PROPERTIES','lordSetting_','lordGSiSSecret_','lordConfigurationStatus_']
};
