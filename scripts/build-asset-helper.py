from pathlib import Path
r=Path(__file__).resolve().parents[1]
library=(r/'roster-update/public/jszip.min.js').read_text().replace('</script','<\\/script')
logic=(r/'scripts/complete-release-assets.js').read_text().replace('</script','<\\/script')
html='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Complete GSiS v0.7.01 locally</title>
<style>body{font:17px/1.5 system-ui,sans-serif;margin:40px auto;padding:0 24px;max-width:720px;background:#f5f6f8;color:#182635}h1{line-height:1.15}section{padding:22px;background:white;border:1px solid #c7cfd7;border-radius:12px;margin:20px 0}label{display:block;margin:14px 0;font-weight:600}input{display:block;margin-top:8px;max-width:100%}button{font:inherit;background:#123b56;color:white;border:0;border-radius:8px;padding:12px 20px;cursor:pointer}button:disabled{opacity:.6}#status{white-space:pre-wrap}small{display:block;color:#475569}</style>
<h1>Complete GSiS v0.7.01</h1><p>Reuse unchanged vendor assets from your existing release. Your files stay in this browser. Nothing is uploaded.</p><section>
<label>1. Original v0.7.00 Deployment ZIP<input id="baseline" type="file" accept=".zip"></label>
<label>2. New v0.7.01 Deployment ZIP<input id="release" type="file" accept=".zip"></label>
<button id="build">Create complete release</button><p id="status" role="status" aria-live="polite">Select both files to begin.</p></section>
<small>The output contains all five frontend packages and complete backends. Existing asset hashes are verified before use. Code, settings and data are not deployed or changed by this tool.</small>
<script>'''+library+'</script><script>'+logic+'''</script><script>
const $=id=>document.getElementById(id);$('build').onclick=async()=>{const base=$('baseline').files[0],next=$('release').files[0];if(!base||!next){$('status').textContent='Select both Deployment ZIPs.';return;}if(!crypto.subtle){$('status').textContent='Open this HTML file in a current Chrome or Edge browser.';return;}$('build').disabled=true;try{const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');const bytes=await completeRelease(JSZip,await base.arrayBuffer(),await next.arrayBuffer(),hash,s=>$('status').textContent=s);const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'}));const link=document.createElement('a');link.href=url;link.download='GSiS_v0.7.01_Deployment_Ready.zip';link.textContent='Save completed release ZIP';$('status').replaceChildren(link);link.click();setTimeout(()=>URL.revokeObjectURL(url),300000);}catch(e){$('status').textContent='Nothing was changed. '+e.message;}finally{$('build').disabled=false;}};
</script></html>'''
(r/'Complete_Release_Locally.html').write_text(html)
print('Offline local asset helper built; no vendor asset bytes included.')
