// Output diagnostics carry no payloads, URLs, credentials or stack traces.
const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(value)?value:'';
export function outputFailure(error,fallback='ROSTER_BRIDGE_ERROR'){
 const value=typeof error?.message==='string'?error.message:'';
 const message=value
  .replace(/https?:\/\/[^\s<>"']+/gi,'[URL removed]')
  .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,'[credential removed]')
  .replace(/\b(?:Bearer|Basic)\s+\S+/gi,'[credential removed]')
  .replace(/\b(?:[\w-]*(?:token|secret|password|authorization|signature|nonce|capability)|api[_-]?key)\s*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi,'[credential removed]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email removed]')
  .replace(/[A-Za-z0-9_+/=-]{32,}/g,'[identifier removed]')
  .split(/[\r\n]/,1)[0].replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').trim().slice(0,300);
 const googleCode=code(error?.googleCode)||(Number.isInteger(error?.googleCode)&&error.googleCode>=100&&error.googleCode<=599?String(error.googleCode):'');
 return {code:code(error?.code)||fallback,...(googleCode?{googleCode}:{}),message:message||'The output failed without a detailed response.'};
}
export function outputErrorText(error){const detail=outputFailure(error);return [detail.code,detail.googleCode&&detail.googleCode!==detail.code?'Google '+detail.googleCode:'',detail.message].filter(Boolean).join(' · ').slice(0,300);}
