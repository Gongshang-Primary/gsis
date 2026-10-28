from pathlib import Path
import json,re,hashlib
root=Path(__file__).resolve().parents[1]
contracts=json.loads((root/'notification-worker/template-contracts.json').read_text())['templates']
def contract_entries():
 for key,c in contracts.items():
  yield key,c
  for variant,v in c.get('variants',{}).items():
   yield key+'.'+variant,v
for key,c in contract_entries():
 assert c['language']=='en_GB' and c['category']=='UTILITY'
 assert c['bodySha256']==hashlib.sha256(c['body'].encode()).hexdigest(), key
 assert sorted(set(map(int,re.findall(r'{{(\d+)}}',c['body']))))==list(range(1,len(c['fields'])+1)), key
 if c.get('urlButtons'):
  assert c.get('privateLinkPurpose') in ['duties','mutual'],key
  assert len(c['urlButtons'])<=2,key
  for b in c['urlButtons']:
   assert b['text'] and b['url'].startswith('https://roster.gsps.edu.sg/external.html') and b['url'].endswith('#{{1}}'),key
p=root/'roster-update/public/_worker.js'
s=p.read_text();block='/* GSIS_WHATSAPP_CONTRACTS_BEGIN */\nconst WHATSAPP_CONTRACTS='+json.dumps(contracts,separators=(',',':'))+';\n/* GSIS_WHATSAPP_CONTRACTS_END */'
s=re.sub(r'/\* GSIS_WHATSAPP_CONTRACTS_BEGIN \*/[\s\S]*?/\* GSIS_WHATSAPP_CONTRACTS_END \*/',lambda m:block,s);p.write_text(s)
renderer=(root/'shared/roster-timetable-view.js').read_text()
for name in ['roster-update/public/roster-operations-ui.js','roster-update/public/external.js']:
 p=root/name;s=p.read_text();block='/* GSIS_ROSTER_TIMETABLE_VIEW_BEGIN */\n'+renderer+'\n/* GSIS_ROSTER_TIMETABLE_VIEW_END */'
 s=re.sub(r'/\* GSIS_ROSTER_TIMETABLE_VIEW_BEGIN \*/[\s\S]*?/\* GSIS_ROSTER_TIMETABLE_VIEW_END \*/',lambda m:block,s);p.write_text(s)
print('WhatsApp contracts and individual timetable renderer synchronised')
