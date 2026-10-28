"""Real Chromium checks of the production frontend. APIs are deterministic fixtures, not live school data."""
from pathlib import Path
import json,sys,time,re,base64,mimetypes,os
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];PUBLIC=ROOT/'roster-update/public'
PROFILE={'user':{'email':'test@gsps.edu.sg','staffId':'alice','smc':True,'admin':True,'accessVerified':True},'revision':1,'active':None,'upcoming':None,'selected':None,'entries':[],'model':None}
def run(item):
 assert item in {'R02','R03','R04','R05','R06','R07','R08','R09','R10','R12','R14','R15','R16','R17','R18','R19','R20','R21'}, 'Unknown scenario: '+item
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=os.environ.get('ROSTER_TEST_CHROMIUM','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
  page=browser.new_page();page.set_default_timeout(6000); errors=[];calls=[]
  page.on('pageerror',lambda e:(errors.append(str(e)),print('PAGE ERROR:',str(e),flush=True)))
  # Chromium in this environment blocks network navigation. Inject the unchanged production
  # markup and scripts into a real browser document; deterministic fetch fixture below.
  html=(PUBLIC/'index.html').read_text()
  html=re.sub(r'<script\b[^>]*>.*?</script>|<link\b[^>]*>', '',html,flags=re.S)
  def local_image(m):
   asset=PUBLIC/m.group(1)
   return 'src="data:'+mimetypes.guess_type(str(asset))[0]+';base64,'+base64.b64encode(asset.read_bytes()).decode()+'"' if asset.is_file() else m.group(0)
  html=re.sub(r'src="([^"]+)"',local_image,html)
  page.set_content(html)
  for css in ['roster.css','roster-operations.css']:page.add_style_tag(content=(PUBLIC/css).read_text())
  page.add_script_tag(content=(ROOT/'shared/roster-allocation.js').read_text())
  page.add_script_tag(content=(ROOT/'shared/roster-operations.js').read_text())
  page.add_script_tag(content=(ROOT/'tests/roster701-fixture.js').read_text())
  for script in ['converter.js','roster-model.js','roster-operations-ui.js','roster.js']:page.add_script_tag(content=(PUBLIC/script).read_text())
  page.wait_for_selector('.function-tile')
  if item=='R02':
   for width in [320,375,430,600,768,800]:
    page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(25)
    assert page.locator('#navToggle').is_visible(),width
    assert not page.locator('#nav').is_visible(),width
    for grid in page.locator('.function-grid').all():
     assert len(grid.evaluate('(e)=>getComputedStyle(e).gridTemplateColumns.split(" ")'))==2,width
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    page.locator('#navToggle').click();assert page.locator('#nav').is_visible()
    page.keyboard.press('Escape');assert not page.locator('#nav').is_visible()
    page.locator('#navToggle').click();page.locator('.home h2').click();assert not page.locator('#nav').is_visible()
   page.set_viewport_size({'width':1280,'height':900});assert not page.locator('#navToggle').is_visible();assert page.locator('#nav').is_visible()
   assert len(page.locator('.function-grid').first.evaluate('(e)=>getComputedStyle(e).gridTemplateColumns.split(" ")'))==3
  if item=='R03':
   page.set_viewport_size({'width':1280,'height':900});page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-absence-form]')
   tiles=page.locator('[data-period]');assert tiles.count()==17
   size=tiles.first.bounding_box();assert size['width']<66 and size['height']<90,size
   fields=page.locator('.ops-form-top');assert fields.bounding_box()['height']<120
   for width in [320,375,768]:
    page.set_viewport_size({'width':width,'height':900});page.wait_for_timeout(20)
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'),width
    assert tiles.first.bounding_box()['height']>=44
   assert len(page.evaluate("__fixture.calls.filter(x=>x.p.operation==='read')"))==1,'report reuses preload'
  if item=='R04':
   page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-teacher-search]')
   inp=page.locator('[data-teacher-search]');before=page.locator('.ops-form-top').bounding_box()['height'];reads=page.evaluate('__fixture.calls.length')
   inp.fill('bOb');assert page.locator('[data-absence-teacher] [role=option]').count()==1
   assert page.locator('.ops-form-top').bounding_box()['height']==before
   inp.press('Enter');page.wait_for_function("document.getElementById('content').getAttribute('aria-busy')==='false'");assert page.locator('[data-absence-teacher] .teacher-chip').count()==2
   assert page.locator('[data-absence-teacher] .teacher-chip[data-staff=bob]').count()==1
   inp.fill('no such teacher');assert page.locator('[data-absence-teacher] [role=option]').count()==0;inp.press('Escape');assert inp.get_attribute('aria-expanded')=='false'
   assert inp.evaluate('(e)=>e.checkValidity()');assert page.evaluate('__fixture.calls.length')==reads+1
  if item=='R05':
   page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-absence-form]')
   page.locator('[data-select-periods]').click()
   page.evaluate("__fixture.delay.saveAbsence=700")
   result=page.evaluate("""()=>{const start=performance.now();document.querySelector('[data-log-absence]').click();return {ms:performance.now()-start,rows:document.querySelectorAll('[data-instruction]').length,saves:__fixture.calls.filter(x=>x.p.operation==='saveAbsence').length};}""")
   assert result['rows']>0 and result['ms']<100 and result['saves']==0,result
   page.locator('[data-instruction]').first.fill('Read aloud. <not HTML>')
   page.locator('[data-save-instructions]').click();assert page.evaluate('__fixture.state.absences.length')==0
   page.wait_for_function('__fixture.state.absences.length===1');page.wait_for_function('!RosterOpsUI.isDirty()')
   assert 'Read aloud. <not HTML>' in page.evaluate('Object.values(__fixture.state.absences[0].instructions)')
   assert len(page.evaluate("__fixture.calls.filter(x=>x.p.operation==='saveAbsence')"))==1
   print('Preview timing:',result)
  if item=='R06':
   page.set_viewport_size({'width':1440,'height':1000});page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-absence-form]')
   page.locator('[name=to]').fill('2026-10-16');page.locator('[name=to]').dispatch_event('change');page.locator('[data-select-periods]').click();page.locator('[data-log-absence]').click()
   y=[page.locator(selector).bounding_box()['y'] for selector in ['.ops-instructions-heading h3','[data-instruction-date]']]
   assert max(y)-min(y)<20,y
   page.locator('[data-instructions-na]').click();page.wait_for_function('__fixture.state.absences.length===3')
   assert page.evaluate('__fixture.state.absences.every(a=>a.instructionsNA&&a.reliefRequired)')
   assert len(page.evaluate("__fixture.calls.filter(x=>x.p.operation==='saveAbsence')"))==1
  if item=='R07':
   page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-absence-form]')
   for period in [7,8]:page.locator('[data-period="'+str(period)+'"]').click()
   page.locator('[data-log-absence]').click();assert page.locator('[data-instruction]').count()==1
   assert page.locator('.ops-merged-lesson').get_attribute('rowspan')=='2'
   assert page.locator('.ops-instruction-table tbody tr').count()==2,'periods themselves stay separate'
   assert page.locator('[data-instruction]').evaluate('(e)=>e.closest("td").rowSpan')==2
   page.locator('[data-instruction]').fill('PD notes');page.locator('[data-save-instructions]').click();page.wait_for_function('__fixture.state.absences.length===1')
   assert set(page.evaluate('Object.values(__fixture.state.absences[0].instructions)'))=={'PD notes'}
  if item=='R08':
   page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-absence-form]')
   for period in [2,3]:page.locator('[data-period="'+str(period)+'"]').click()
   page.locator('[data-log-absence]').click();assert page.evaluate('__fixture.state.absences.length')==0;page.locator('[data-save-instructions]').click();page.wait_for_function('__fixture.state.absences.length===1 && !RosterOpsUI.isDirty()');page.locator('[data-own-arrangements]').click();page.wait_for_selector('dialog[open]')
   assert page.locator('dialog table').count()==1;assert page.locator('dialog thead').count()==1
   assert page.locator('.ops-own-row th').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(124, 36, 59)'
   page.locator('[data-own-period="2"]').click();page.wait_for_selector('[data-select-colleague="dora"]');assert page.locator('[data-select-colleague="charlie"]').count()==0
   page.locator('[data-select-colleague="dora"]').click();page.locator('[data-own-period="3"]').click();page.wait_for_selector('[data-select-colleague="charlie"]')
   count=page.evaluate('__fixture.calls.length');page.locator('[data-colleague-filter]').fill('cHa');assert page.locator('dialog tbody tr').count()==2
   assert page.evaluate('__fixture.calls.length')==count;assert 'Free in timetable' not in page.locator('dialog').inner_text()
   assert page.locator('[data-select-colleague="charlie"]').inner_text()=='';page.locator('[data-select-colleague="charlie"]').click();page.locator('[data-submit-mutual]').click();page.wait_for_function('__fixture.state.requests.length===2')
   assert sorted(page.evaluate('__fixture.state.requests.map(r=>[r.periods[0],r.recipientId])'))==[[2,'dora'],[3,'charlie']]
  if item=='R09':
   page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-log-absence]')
   assert page.locator('[data-log-absence]').inner_text()=="I'm not available during the above selected periods"
   page.locator('[data-period="2"]').click();page.locator('[data-log-absence]').click()
   assert page.evaluate('__fixture.state.absences.length')==0
   assert 'Select No relief instructions or Submit absence to save.' in page.locator('.ops-instructions').inner_text()
   assert page.locator('[data-save-instructions]').inner_text()=='Submit absence'
  if item=='R10':
   page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-log-absence]');page.locator('[data-period="2"]').click();page.locator('[data-log-absence]').click()
   page.evaluate("__fixture.fail='after-save';__fixture.delay.saveAbsence=500")
   page.locator('[data-save-instructions]').click();assert page.locator('[data-ops-saving]').is_visible();assert page.locator('.ops-spinner').evaluate('(e)=>getComputedStyle(e).animationName')=='ops-spin'
   page.wait_for_selector('[data-retry-save]');assert page.evaluate('__fixture.state.absences.length')==1
   page.locator('[data-retry-save]').click();page.wait_for_function('!RosterOpsUI.isDirty()');assert page.evaluate('__fixture.state.absences.length')==1
   attempts=page.evaluate("__fixture.calls.filter(x=>x.p.operation==='saveAbsence').map(x=>x.p)");assert len(attempts)==2 and attempts[0]==attempts[1]
   assert not page.locator('[data-ops-saving]').is_visible();assert page.evaluate('__fixture.state.audit.length')==1
  if item=='R12':
   page.locator('.function-tile[data-page="Report Absence"]').click();page.wait_for_selector('[data-absence-form]')
   page.locator('[name=typeId]').select_option('others');assert page.locator('[data-other-reason]').is_visible();assert page.locator('[name=reasonDetail]').get_attribute('required') is not None
   page.locator('[data-period="2"]').click();page.locator('[data-log-absence]').click();assert page.locator('[data-instruction]').count()==0
   page.locator('[name=reasonDetail]').fill('Official appointment');page.locator('[data-log-absence]').click();page.locator('[data-instructions-na]').click();page.wait_for_function('__fixture.state.absences.length===1')
   assert page.evaluate('__fixture.state.absences[0].reasonDetail')=='Official appointment'
   page.locator('#nav [data-page="Manage reported absences"]').click();page.wait_for_selector('.ops-record-table');assert 'Others: Official appointment' in page.locator('.ops-record-table').inner_text()
  if item=='R14':
   page.locator('.function-tile[data-page="Manage Ad-hoc relief"]').click();page.wait_for_selector('[data-add-contact]')
   assert page.locator('[data-add-contact]').evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(124, 36, 59)'
   assert page.locator('.ops-known-contact [data-teacher-search]').count()==1
   assert page.locator('.ops-new-contact [data-add-contact]').count()==1
   page.locator('[data-add-contact]').click();assert page.locator('dialog form').is_visible()
   assert not any(x['p'].get('operation')=='contactCreate' for x in page.evaluate('__fixture.calls'))
  if item in ['R15','R16']:
   page.evaluate("""()=>{const f=__fixture;f.profile.model={layoutMode:'single-week',single:{days:['Mon','Tue','Wed','Thu','Fri'],perDay:17,maxPeriod:16,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>t.cells).flat()}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[],maxPeriod:16,teacherCount:4};f.profile.active=f.profile.selected={id:'baseline',name:'Test timetable',from:'2026-01-01',to:'2026-12-31'};f.profile.calendar={available:true,schoolDay:true,parity:'even'};}""")
   page.locator('.function-tile[data-page="Check Availability"]').click();page.wait_for_selector('#teacherSearch')
   page.wait_for_function("__fixture.calls.some(x=>x.p.operation==='availability')")
   assert page.locator('.availability-table').count()==0
   assert 'Select teachers' in page.locator('#timetables').inner_text()
   inp=page.locator('#teacherSearch');inp.fill('Bob');page.locator('#teacherChoices input[value="bob"]').check()
   page.wait_for_selector('.availability-table');assert 'Bob Colleague' in page.locator('#timetables').inner_text();assert 'Dora Free' not in page.locator('#timetables').inner_text()
   last=page.evaluate("__fixture.calls.filter(x=>x.p.operation==='availability').at(-1).p.staffIds");assert last==['bob'],last
  if item=='R18':
   page.evaluate("""()=>{__fixture.setClock('2026-10-14T06:00:00+08:00');GSISRosterOperations.apply(__fixture.state,__fixture.ctx,{operation:'saveAbsence',staffId:'alice',date:__fixture.ctx.today,typeId:'mc',periods:[2,3]});}""")
   page.locator('.function-tile[data-page="Assign Relief"]').click();page.wait_for_selector('[data-manual-select="dora"]')
   assert page.locator('.ops-candidate-matrix thead th').count()==21
   assert page.locator('[data-manual-select="dora"]').inner_text()==''
   assert page.locator('[data-manual-select="bob"]').locator('..').get_attribute('class')=='ops-eligible-1'
   page.locator('[data-candidate-search]').fill('char');assert page.locator('[data-candidate-rows] tr').count()==1
   assert page.locator('[data-combine-select="charlie"]').is_visible()
   before=page.evaluate('__fixture.calls.length');page.locator('[data-candidate-search]').fill('dora');assert page.evaluate('__fixture.calls.length')==before
   page.evaluate('__fixture.delay.assign=350');page.locator('[data-manual-select="dora"]').click();assert page.locator('[data-ops-saving]').is_visible()
   page.wait_for_function("__fixture.state.assignments.some(a=>a.staffId==='dora'&&a.status==='draft')");page.wait_for_function('!RosterOpsUI.isDirty()')
   assert page.locator('dialog').count()==0
   page.locator('#nav [data-page="Home"]').click();page.locator('.function-tile[data-page="Assign Relief"]').click();page.wait_for_selector('[data-undo-assignment]')
   assert page.locator('[data-candidate-search]').input_value()=='dora'
   page.locator('[data-undo-assignment]').click();page.wait_for_function("__fixture.state.assignments.every(a=>a.status==='cancelled')");page.wait_for_function('!RosterOpsUI.isDirty()')
   page.locator('[data-candidate-search]').fill('bob');page.locator('[data-manual-select="bob"]').click();page.wait_for_selector('[data-manual-reason]')
   page.locator('[data-manual-reason]').fill('SMC reviewed the extra period');page.locator('[data-confirm-manual]').click();page.wait_for_function("__fixture.state.assignments.some(a=>a.staffId==='bob'&&a.status==='draft')");page.wait_for_function('!RosterOpsUI.isDirty()')
   page.locator('[data-undo-assignment]').click();page.wait_for_function('!RosterOpsUI.isDirty()')
   page.locator('[data-candidate-search]').fill('char');page.locator('[data-combine-select="charlie"]').click();page.wait_for_function("__fixture.state.assignments.some(a=>a.combination&&a.status==='draft')");page.wait_for_function('!RosterOpsUI.isDirty()')
   selected=page.locator('[data-combine-select="charlie"]');assert '4A' in selected.inner_text();assert '3A' not in selected.inner_text(),selected.inner_text()
   page.locator('[data-undo-assignment]').click();page.wait_for_function('!RosterOpsUI.isDirty()')
   page.locator('[data-candidate-search]').fill('dora');page.evaluate('__fixture.state.revision++');page.locator('[data-manual-select="dora"]').click();page.wait_for_function('!RosterOpsUI.isDirty()')
   assert 'Candidates refreshed' in page.locator('[data-ops-message]').inner_text()
   assert page.locator('[data-candidate-search]').input_value()=='dora'
   assert page.locator('[data-relief-demand][aria-pressed="true"]').count()==1
   page.set_viewport_size({'width':375,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  if item=='R17':
   page.evaluate("__fixture.setClock('2026-10-14T06:00:00+08:00')")
   page.locator('.function-tile[data-page="Absences by Date"]').click();page.wait_for_selector('.ops-health-period')
   assert page.locator('.ops-health-period').count()==17
   assert 'opportunities' in page.locator('.ops-health-heading').inner_text()
   assert 'not independent' in page.locator('.ops-health .hint').first.inner_text()
   page.locator('.ops-health-controls summary').click();page.locator('[data-duty-smc] input[value="alice"]').check();page.locator('[data-duty-smc] button').click()
   page.wait_for_function('__fixture.state.smcDutyRoster.length===1');page.wait_for_function('!RosterOpsUI.isDirty()')
   assert page.evaluate('__fixture.state.smcDutyRoster[0].staffIds')==['alice']
   assert page.evaluate("__fixture.state.assignments.length")==0
   page.set_viewport_size({'width':375,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  if item=='R16':
   assert page.locator('.teacher-multiselect #teacherChips').count()==1
   assert page.locator('.teacher-chip').first.evaluate('(e)=>getComputedStyle(e).backgroundColor')=='rgb(229, 231, 235)'
   inp.fill('dora');inp.press('ArrowDown');inp.press('Enter');page.wait_for_function("__fixture.calls.filter(x=>x.p.operation==='availability').at(-1).p.staffIds.length===2")
   assert page.locator('.teacher-chip').count()==2
   inp.fill('');inp.press('Backspace');page.wait_for_function("__fixture.calls.filter(x=>x.p.operation==='availability').at(-1).p.staffIds.length===1")
   assert page.locator('.teacher-chip').count()==1
   inp.press('Escape');assert not page.locator('#teacherChoices').is_visible()
   page.set_viewport_size({'width':320,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.locator('.teacher-chip').click();page.wait_for_function("__fixture.calls.filter(x=>x.p.operation==='availability').at(-1).p.staffIds.length===0")
   assert page.locator('.availability-table').count()==0
  if item=='R19':
   page.locator('.function-tile[data-page="Custom Notifications"]').click();page.wait_for_selector('[data-custom-form]')
   page.locator('[data-custom-form] input[name="level"][value="1"]').check();page.locator('[data-custom-form] input[name="level"][value="2"]').check()
   page.locator('[data-custom-form] input[name="period"][value="12"]').check()
   page.locator('[data-custom-form] textarea').fill('Dismiss through the foyer.\nWait for the parent.')
   page.locator('[data-custom-form] button[type="submit"]').click();page.wait_for_function('__fixture.state.customInstructions.length===1');page.wait_for_function('!RosterOpsUI.isDirty()')
   assert page.evaluate('__fixture.state.customInstructions[0].levels')==[1,2]
   assert page.evaluate('__fixture.state.publicationSnapshots.length')==0
   assert 'Dismiss through the foyer.' in page.locator('[data-custom-list]').inner_text()
   page.locator('[data-custom-edit]').click();page.locator('[data-custom-form] textarea').fill('Changed directions.')
   page.locator('[data-custom-form] button[type="submit"]').click();page.wait_for_function('__fixture.state.customInstructions[0].version===2');page.wait_for_function('!RosterOpsUI.isDirty()')
   page.set_viewport_size({'width':375,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   page.locator('[data-custom-delete]').click();page.wait_for_function('!!__fixture.state.customInstructions[0].deletedAt')
  if item=='R20':
   page.evaluate("""()=>{const f=__fixture;f.setClock('2026-10-14T06:00:00+08:00');f.day.teachers[0].cells[2]=['','','',''];f.day.teachers[0].cells[3]=['','','',''];f.day.teachers[3].cells[2]=['EL','4B','C1-02',''];f.day.teachers[3].cells[3]=['MA','4B','C1-02',''];const O=GSISRosterOperations;O.apply(f.state,f.ctx,{operation:'saveAbsence',staffId:'dora',date:f.ctx.today,typeId:'mc',periods:[2,3]});const ds=O.demand(f.ctx,f.state,f.ctx.today);O.apply(f.state,f.ctx,{operation:'saveInstructions',absenceId:f.state.absences[0].id,instructions:Object.fromEntries(ds.map(d=>[d.lessonKey,'Original <not markup> instruction.']))});f.profile.model={layoutMode:'single-week',single:{days:['Mon','Tue','Wed','Thu','Fri'],perDay:17,maxPeriod:16,blocks:f.day.teachers.map(t=>({name:t.name,cells:Array.from({length:5},()=>t.cells).flat()}))},timing:{startMinutes:420,periodMinutes:30,normalLastPeriod:16},recesses:[],maxPeriod:16,teacherCount:4};f.profile.active=f.profile.selected={id:'baseline',name:'Test timetable',from:'2026-01-01',to:'2026-12-31'};f.profile.calendar={available:true,schoolDay:true,parity:'even'};}""")
   page.locator('.function-tile[data-page="Assign Relief"]').click();page.wait_for_selector('[data-manual-select="alice"]')
   page.locator('[data-manual-select="alice"]').click();page.wait_for_function('!RosterOpsUI.isDirty()');page.wait_for_function('__fixture.state.assignments.length===1')
   page.locator('[data-no-relief]').click();page.wait_for_function('__fixture.state.assignments.some(a=>a.noRelief)');page.wait_for_function('!RosterOpsUI.isDirty()')
   assert page.locator('dialog').count()==0
   page.locator('[data-no-relief]').click();page.wait_for_function('!RosterOpsUI.isDirty()')
   page.locator('[data-manual-select="alice"]').click();page.wait_for_function('!RosterOpsUI.isDirty()')
   page.locator('[data-publish-relief]').click();page.wait_for_function("__fixture.state.assignments.some(a=>a.status==='published')");page.wait_for_function('!RosterOpsUI.isDirty()')
   page.locator('#nav [data-page="My Relief Duties"]').click();page.wait_for_selector('[data-ack-all]');page.wait_for_selector('.published-overlay')
   assert '4B' in page.locator('.published-overlay').inner_text()
   assert 'Original <not markup> instruction.' in page.locator('[data-duty-today]').inner_text()
   (ROOT/'verification').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'verification/701-teacher-timetable.png'),full_page=True)
   page.locator('[data-ack-all]').click();page.wait_for_function('__fixture.state.acknowledgements.length===1');page.wait_for_function('!RosterOpsUI.isDirty()')
   assert page.locator('[data-ack-all]').count()==0
   page.evaluate("""()=>{const f=__fixture;GSISRosterOperations.apply(f.state,f.ctx,{operation:'deleteAbsences',ids:[f.state.absences[0].id],confirm:true});f.state.revision++;}""")
   page.locator('#nav [data-page="Home"]').click();page.locator('.function-tile[data-page="My Relief Duties"]').click();page.wait_for_selector('[data-ack-all]');page.wait_for_selector('.ops-teacher-overlay')
   assert page.locator('.published-overlay').count()==0
   assert 'Cancelled' in page.locator('.ops-acknowledgements').inner_text()
   page.locator('[data-ack-all]').click();page.wait_for_function('__fixture.state.acknowledgements.length===2');page.wait_for_function('!RosterOpsUI.isDirty()')
   page.locator('.ops-notification-history > summary').click();page.wait_for_selector('[data-notice-history] details')
   assert page.locator('[data-notice-history] details').count()==2
   page.locator('[data-notice-history] details').last.locator('summary').click();assert 'Original <not markup> instruction.' in page.locator('[data-notice-history]').inner_text()
   page.set_viewport_size({'width':375,'height':900});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  if item=='R21':
   page.evaluate("""()=>{const f=__fixture;f.setClock('2026-10-14T06:30:00+08:00');f.day.recesses.push({level:4,period:6});f.day.teachers[1].cells[6]=['Recess Duty','P4','',''];}""")
   page.locator('.function-tile[data-page="Recess Regression"]').click();page.wait_for_selector('[data-recess-form]')
   assert page.locator('[data-recess-form] [name=level]').count()==6
   page.locator('[data-recess-form] [name=level][value="4"]').check()
   page.locator('[data-recess-form] [name=to]').fill('2026-10-15')
   page.locator('[data-recess-form] button[type=submit]').click();page.wait_for_function('__fixture.state.recessActivations.length===1');page.wait_for_function('!RosterOpsUI.isDirty()')
   assert page.evaluate('__fixture.state.assignments.length')==0,'After cut-off, all allocation is manual'
   assert page.evaluate('GSISRosterOperations.demand(__fixture.ctx,__fixture.state,"2026-10-14").length')==2
   assert page.evaluate('GSISRosterOperations.demand(__fixture.ctx,__fixture.state,"2026-10-15").length')==2
   assert 'Primary 4' in page.locator('[data-recess-list]').inner_text()
   page.locator('[data-recess-edit]').click();page.locator('[data-recess-form] [name=to]').fill('2026-10-14')
   page.locator('[data-recess-form] button[type=submit]').click();page.wait_for_function('__fixture.state.recessActivations[0].to==="2026-10-14"');page.wait_for_function('!RosterOpsUI.isDirty()')
   assert page.evaluate('GSISRosterOperations.demand(__fixture.ctx,__fixture.state,"2026-10-15").length')==0
   page.set_viewport_size({'width':375,'height':1000});assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   (ROOT/'verification').mkdir(exist_ok=True);page.screenshot(path=str(ROOT/'verification/701-recess-mobile.png'),full_page=True)
   page.locator('[data-recess-delete]').click();page.wait_for_function('!!__fixture.state.recessActivations[0].deletedAt');page.wait_for_function('!RosterOpsUI.isDirty()')
   assert page.evaluate('GSISRosterOperations.demand(__fixture.ctx,__fixture.state,"2026-10-14").length')==0
  assert not errors,errors
  print(json.dumps({'item':item,'browser':'Chromium','checks':'PASS','APIcalls':page.evaluate('window.__calls'),'pageErrors':errors}));browser.close()
if __name__=='__main__':run(sys.argv[1])
