"""Build upload ZIPs and a ZIP + Markdown release. No HTML instruction assistant."""
from pathlib import Path
import zipfile, shutil, subprocess, re
root=Path(__file__).resolve().parents[1]
version='0.4.02'
for dest,source,marker in [('public/app.js','shared/fields.js','GSIS_FIELDS'),('backend/Code.gs','shared/fields.js','GSIS_FIELDS'),('backend/Code.gs','backend/FieldStore.gs','GSIS_FIELDSTORE'),('backend/Code.gs','backend/PlanningPatch.gs','GSIS_PATCH'),('public/app.js','shared/planning.js','GSIS_PLANNING'),('backend/Code.gs','shared/planning.js','GSIS_PLANNING'),('backend/Code.gs','backend/Planning.gs','GSIS_BACKEND_PLANNING'),('public/app.js','public/planning-ui.js','GSIS_PLANNING_UI'),('Contacts_Code.gs','backend/Contacts_Catalogue.gs','GSIS_CONTACTS_CATALOGUE')]:
 p=root/dest
 p.write_text(re.sub(r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/',lambda m:'/* '+marker+'_BEGIN */\n'+(root/source).read_text()+'\n/* '+marker+'_END */',p.read_text()))
engine=(root/'shared/teaching-rules.js').read_text().strip()
for target in ['Contacts_Code.gs','backend/Code.gs','public/app.js']:
 p=root/target
 content=p.read_text()
 begin=content.index('/* One teaching-load rule engine,')
 end=content.index("if(typeof module!=='undefined'&&module.exports)module.exports=GSISTeachingRules;",begin)+len("if(typeof module!=='undefined'&&module.exports)module.exports=GSISTeachingRules;")
 p.write_text(content[:begin]+engine+content[end:])
assert 'function buildCampus' not in (root/'public/landmark.html').read_text(), 'Deploy must not bundle a second model'
assert 'function buildCampus' in (root/'layout-update/public/landmark.html').read_text(), 'Layout must own the model'
code=(root/'backend/Code.gs').read_text()+'\n'+(root/'backend/Seed.gs').read_text()
(root/f'Deploy_Backend_v{version}.gs').write_text(code.replace('DEPLOY_SEED','GSIS_DEPLOY_EMBEDDED_SEED_04'))
contacts=(root/'Contacts_Code.gs').read_text()
(root/f'Contacts_Backend_v{version}.gs').write_text(contacts)
(root/'backend/Contacts_Code_with_Deploy_API.gs').write_text(contacts)
subprocess.run(['node',str(root/'tests/apps-script-syntax.cjs')],cwd=root,check=True)
frontends=[]
for name,folder in [('Contacts','contacts-update/public'),('Deploy','public'),('Layout','layout-update/public')]:
 for shared in ['viewports.js','loading.css','transport.js','layout-renderer.js','table-viewport.js','table-viewport.css','teaching-rules.js','fields.js']:shutil.copyfile(root/'shared'/shared,root/folder/shared)
 path=root/f'{name}_Frontend_v{version}.zip';frontends.append(path)
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
  for p in sorted((root/folder).rglob('*')):
   if p.is_file():z.write(p,str(p.relative_to(root/folder)))
source=root/f'GSiS_v{version}_Source.zip'
with zipfile.ZipFile(source,'w',zipfile.ZIP_DEFLATED) as z:
 for p in sorted(root.rglob('*')):
  if p.is_file() and p.suffix not in ['.zip','.log'] and 'upgrade-' not in p.name and not (re.search(r'_v[0-9.]+\.gs$',p.name) and not p.name.endswith(f'_v{version}.gs')) and not any(t in p.parts for t in ['node_modules','.git','__pycache__']) and not p.name.startswith('GSiS_Unified_Update_'):
   z.write(p,str(p.relative_to(root)))
package=root/f'GSiS_v{version}_Deployment.zip'
with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as z:
 for p in [root/'DEPLOYMENT.md',root/f'CHANGELOG_v{version}.md',root/'VALIDATION.md',root/f'API_CONTRACTS_v{version}.md',*frontends,root/f'Deploy_Backend_v{version}.gs',root/f'Contacts_Backend_v{version}.gs',source]:z.write(p,p.name)
print(package.name,package.stat().st_size,'bytes')
