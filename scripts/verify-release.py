"""Run the current offline release gates without disguising unavailable dependencies.
Requires declared npm devDependencies for legacy DOM tests, plus Python Playwright/Chromium
for browser scenarios. Returns failure for a real failing test; reports blocked dependencies.
"""
from pathlib import Path
import subprocess,json,time,concurrent.futures,sys,os
r=Path(__file__).resolve().parents[1];out=r/'verification';out.mkdir(exist_ok=True)
version=json.loads((r/'package.json').read_text())['gsisRelease'];prefix=version.replace('0.','',1).replace('.','')
historical={'model403.cjs','model405.cjs','workload407.cjs','roster700-operations.cjs','roster700-gateway.mjs','roster700-review.cjs','roster700-ui.cjs'}
helpers={'run.cjs','dom-helper.cjs','preview-server.cjs','roster701-fixture.cjs','import708-fixture.cjs','roster701-adapter.cjs','roster701-operations-speed-browser.cjs','load-stapler-leases.cjs','load-backend-role.cjs'}
test_timeout=float(os.environ.get('GSIS_TEST_TIMEOUT','45'))
files=sorted(p for p in (r/'tests').iterdir() if p.suffix in ('.cjs','.mjs') and p.name not in historical|helpers)
if '--skip-package' in sys.argv:files=[p for p in files if p.name!='package.cjs']
def run(p):
 t=time.monotonic()
 try:
  x=subprocess.run(['node',str(p)],cwd=r,capture_output=True,text=True,timeout=test_timeout,env={**os.environ,'TZ':'Asia/Singapore'});log=x.stdout+x.stderr
  missing='Cannot find module' in log or 'ERR_MODULE_NOT_FOUND' in log
  return {'test':p.name,'status':'passed' if x.returncode==0 else 'dependency-unavailable' if missing else 'failed','seconds':round(time.monotonic()-t,3),'output':log[-16000:]}
 except subprocess.TimeoutExpired as e:return {'test':p.name,'status':'timeout','seconds':test_timeout,'output':str(e)}
rows=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get('GSIS_TEST_WORKERS','4'))) as pool:
 for row in pool.map(run,files):
  rows.append(row);print(row['status'],row['test'],flush=True);(out/(prefix+'-node-results.json')).write_text(json.dumps(rows,indent=2))
summary={k:sum(x['status']==k for x in rows) for k in sorted({x['status'] for x in rows})};print(json.dumps(summary))
(out/(prefix+'-node-summary.json')).write_text(json.dumps({'counts':summary,'historical':sorted(historical),'note':'Dependency-unavailable tests are NOT passes. npm test requires all declared dependencies.'},indent=2))
sys.exit(1 if any(x['status'] in ['failed','timeout'] for x in rows) else 2 if summary.get('dependency-unavailable') else 0)
