/* Shared gateway response diagnostics. Never return or log the upstream body/URL. */
function gsisResponseInfo(response,raw){
 let kind='invalid-json',format='text';
 const text=String(raw||'').trim(),html=/^<!doctype\s+html|^<html\b/i.test(text)||/<(?:html|body)\b/i.test(text.slice(0,500));
 if(html){format='html';kind='html';}
 if(/^[\[{]/.test(text))format='json';
 let host='';try{host=new URL(response.url).hostname;}catch{}
 if(host==='accounts.google.com'||html&&/accounts\.google\.com\/ServiceLogin|Sign in.*Google|Access denied|You need permission/i.test(text))kind='access';
 else if(html&&/Script function not found|ReferenceError|SyntaxError|TypeError|script.*(?:error|failed)|Exception:/i.test(text))kind='execution';
 else if(html&&/file.*(?:does not exist|not found)|Page not found|unable to open/i.test(text))kind='deployment';
 return {kind,format,status:Number(response.status)||0};
}
async function readGSiSBackendResponse(response){
 if(!response.ok)throw Object.assign(Error('Backend HTTP failure'),{code:'UPSTREAM_HTTP',upstreamStatus:response.status});
 let raw='',result;
 try{
  // The fallback supports minimal service test doubles; Fetch Response always has text().
  if(typeof response.text==='function'){raw=await response.text();result=JSON.parse(raw.replace(/^\uFEFF/,''));}
  else result=await response.json();
  if(!result||Array.isArray(result)||typeof result.ok!=='boolean')throw Error('Invalid envelope');
  return result;
 }catch(error){
  if(['TimeoutError','AbortError'].includes(error.name))throw error;
  throw Object.assign(Error('Invalid backend response'),{code:'UPSTREAM_RESPONSE',responseInfo:gsisResponseInfo(response,raw)});
 }
}
function gsisResponseAdvice(error,layout=false){
 if(error.code==='UPSTREAM_SCHEMA')return 'Layout received an incompatible data response. Ask an Admin to check the installed Deploy backend version.';
 if(error.code==='BACKEND_CONFIG')return 'The backend connection URL is not configured correctly.';
 if(error.code!=='UPSTREAM_RESPONSE')return '';
 switch(error.responseInfo?.kind){
  case 'access':return 'Google blocked the backend request. Ask an Admin to check the Apps Script web app access settings.';
  case 'execution':return 'Apps Script returned an execution error. '+(layout?'Ask an Admin to run diagnoseLayout601 in the Deploy script and read its execution log.':'Ask an Admin to check the backend execution log.');
  case 'deployment':return 'The Apps Script deployment could not be opened. Ask an Admin to check the existing web app URL.';
  default:return 'Apps Script returned an unreadable response. '+(layout?'Ask an Admin to check the deployed backend and run diagnoseLayout601 in the Deploy script.':'Ask an Admin to check the deployed backend and its access settings.');
 }
}
