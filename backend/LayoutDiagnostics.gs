/* Editor-only, read-only checks. No reseeding, publication, access changes or resets. */
function diagnoseLayout601(){
 const report={backendVersion:GSIS_DEPLOY_VERSION,readOnly:true,ready:false,checks:[]};
 const check=(name,fn)=>{try{const value=fn();report.checks.push({name,ok:true,...value});return value;}catch(e){
  // Editor logs are for the script maintainer. No properties, secrets or payloads are logged.
  const message=String(e.message||'Unknown error').replace(/https?:\/\/\S+/g,'[URL]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').slice(0,500);
  report.checks.push({name,ok:false,...(e.code==='DEPLOY_URL_CONFIGURATION'?{category:'configuration'}:{}),message});return null;
 }};
 const current=check('Current Layout snapshot',()=>{
  const year=Number(props_().getProperty('LAYOUT_YEAR')||2026),b=SpreadsheetApp.openById(layoutRepositoryId_(year,false)),read=layoutRead_(b,year),view=GSISLayoutData.publicView(read.snapshot);
  return {year,revision:view.layoutRevision,...layoutCounts_(read.snapshot)};
 });
 if(current)check('JSON response',()=>{
  const view=publicLayout_({year:current.year}),response=JSON.parse(out_({ok:true,data:view}).getContent());
  if(response.ok!==true||response.data?.layoutRevision!==current.revision)throw Error('Layout response contract differs.');return {};
 });
 check('Published web app response',()=>{
  const url=deployWebAppUrl_(),secret=gsisApiSecret_();
  if(!secret||secret.length<32)throw Error('GSIS_SECRET is missing or invalid.');
  const nonce=Utilities.getUuid(),payload=JSON.stringify({action:'publicLayout',input:{year:current?.year||2026},identity:null,timestamp:Date.now(),nonce,traceId:nonce});
  const response=UrlFetchApp.fetch(url,{method:'post',contentType:'application/json',payload:JSON.stringify({payload,signature:signature_(payload,secret)}),muteHttpExceptions:true,followRedirects:true}),raw=response.getContentText();
  let result;try{result=JSON.parse(raw);}catch(e){throw Error('The published web app returned '+response.getResponseCode()+' with '+(/^\s*</.test(raw)?'HTML':'invalid JSON')+'. Check deployment access, the deployed version and execution logs.');}
  if(!result.ok||result.data?.repository!=='layout-current')throw Error('The published web app did not return the current Layout contract.');
  if(result.data.timing?.backendVersion!==GSIS_DEPLOY_VERSION)throw Error('The published backend version differs from the editor. Update the existing web app deployment.');
  if(current&&result.data.layoutRevision!==current.revision)throw Error('The published web app reads a different Layout revision.');
  return {backendVersion:result.data.timing.backendVersion,revision:result.data.layoutRevision};
 });
 report.ready=report.checks.length===3&&report.checks.every(c=>c.ok);
 console.log(JSON.stringify(report,null,2));return report;
}
