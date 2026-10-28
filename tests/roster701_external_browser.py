"""Production private UI in Chromium with routed, recipient-scoped fixture responses.
No school service or WhatsApp recipient is contacted.
"""
from pathlib import Path
import json, time, mimetypes, re
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]; PUBLIC=ROOT/'roster-update/public'
def run():
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1280,'height':960}); page.set_default_timeout(7000)
  calls=[]; errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
  date='2026-10-14'; token='fixture-capability-not-a-real-credential'
  instruction='<img src=x onerror="window.bad=1"> Keep original text. https://example.test/safe'
  duty={'id':'a1','status':'published','date':date,'period':3,'subject':'Science','className':'4A','venue':'Room 1','instructions':instruction,'timeStart':'08:30','timeEnd':'09:00'}
  snapshot={'id':'snap1','kind':'assigned','period':3,'assignment':duty,'instructions':instruction}
  periods=[{'period':i,'start':f'{7+i//2:02d}:{30*(i%2):02d}','end':f'{7+(i+1)//2:02d}:{30*((i+1)%2):02d}'} for i in range(17)]
  baseline=[[] for i in range(85)];baseline[2*17+3]=['Baseline English','4B','Room 2']
  data={'date':date,'duties':[duty],'pendingNotices':[snapshot],'history':[snapshot], 'timetable':{'name':'Fixture Teacher','monday':'2026-10-12','periods':periods,'baseline':baseline,'perDay':17,'duties':[duty]},'request':{'id':'req1','absentName':'Fixture Colleague','status':'pending','expiresAt':int(time.time()*1000)+3600000,'lessons':[duty]}}
  def api(payload):
   calls.append(payload)
   if payload['operation']=='acknowledge':
    assert payload['snapshotIds']==['snap1'];data['pendingNotices']=[];data['history'][0]['acknowledgedAt']='2026-10-14T01:00:00Z'
   if payload['operation']=='respond':
    assert payload['decision']=='reject' and payload['reason']=='Already committed';assert payload['requestId'];data['request']['status']='rejected'
   return {'ok':True,'data':data}
  # This managed Chromium blocks navigation. Use real DOM and unchanged production
  # script with an explicit location/history/fetch adapter. Gateway capability parsing
  # and HMAC authorisation are exercised separately by the Node integration suite.
  html=re.sub(r'<script\b[^>]*>.*?</script>|<link\b[^>]*>', '',(PUBLIC/'external.html').read_text(),flags=re.S)
  page.set_content(html);page.add_style_tag(content=(PUBLIC/'external.css').read_text())
  page.expose_function('__privateAPI',api)
  page.evaluate("""({script,token})=>{
    const location={hash:'#'+token,pathname:'/external.html'},history={replaceState:(a,b,url)=>{window.__replaced=url;}};
    const sessionStorage={setItem:(k,v)=>{window.__sessionToken=v;},getItem:()=>null};
    const fetch=async(url,opts)=>{if(url!=='/api/external'||opts.headers.Authorization!=='Bearer '+token)throw Error('Scope violation');const data=await window.__privateAPI(JSON.parse(opts.body));return {ok:true,json:async()=>data};};
    const crypto={randomUUID:()=> 'fixture-request-0001'};
    new Function('location','history','sessionStorage','fetch','crypto',script)(location,history,sessionStorage,fetch,crypto);
  }""",{'script':(PUBLIC/'external.js').read_text(),'token':token})
  page.wait_for_selector('.ops-teacher-overlay');assert page.evaluate('window.__replaced === undefined')
  assert page.locator('.ops-teacher-overlay thead th').count()==18
  assert page.locator('.ops-teacher-overlay tbody tr').count()==12
  assert page.locator('.published-overlay').count()==1
  assert page.locator('#duty-list img').count()==0 and page.evaluate('window.bad===undefined')
  assert '<img src=x' in page.locator('#duty-list').inner_text()
  assert page.locator('#duty-list a').get_attribute('rel')=='noopener noreferrer'
  page.get_by_role('button',name='Acknowledge All').click();page.wait_for_selector('#private-notices >> text=No outstanding updates.')
  page.locator('button[value="reject"]').click();assert len([c for c in calls if c['operation']=='respond'])==0
  page.locator('#reason').fill('Already committed');page.locator('button[value="reject"]').click();page.wait_for_selector('#status >> text=Relief request rejected.')
  assert not page.locator('#decision-form').is_visible()
  # A published cancellation immediately removes the overlay, but keeps its own acknowledgement.
  data['duties']=[];data['timetable']['duties']=[];data['pendingNotices']=[{**snapshot,'kind':'cancelled'}]
  page.locator('#refresh').click();page.wait_for_timeout(100)
  assert page.locator('.published-overlay').count()==0
  assert 'Cancelled' in page.locator('#private-notices').inner_text()
  assert 'Baseline English' in page.locator('.ops-teacher-overlay').inner_text()
  page.screenshot(path=str(ROOT/'verification/701-private-recipient.png'),full_page=True)
  assert not errors,errors
  browser.close();print(json.dumps({'test':'private-recipient-chromium','passed':True,'checks':12,'requests':len(calls)}))
if __name__=='__main__':run()
