"""Build deployable components and a clean full package from the explicit installation manifest."""
from pathlib import Path
import zipfile, shutil, subprocess, re, tempfile, os, sys, hashlib
from contextlib import contextmanager
def roster_backend_source(code, component_version):
 code=re.sub(r'/\* GSIS_DEPLOY_QUEUE_([A-Z_]+)_BEGIN \*/[\s\S]*?/\* GSIS_DEPLOY_QUEUE_\1_END \*/', '', code)
 # Deploy owns Layout routes, the campus seed and the local aSc exporter. Roster retains the
 # live venue identities used by Relief/Deploy quota and timetable helpers.
 for marker in ['GSIS_LAYOUT_DATA','GSIS_LAYOUT_REPOSITORY','GSIS_LAYOUT_DIAGNOSTICS','GSIS_LAYOUT_SEED','GSIS_ASC_EXPORT']:
  code,count=re.subn(r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/', '', code)
  assert count==1, 'Expected one audited Layout block: '+marker
 assert code.count("const GSIS_BACKEND_KIND='deploy';")==1, 'Canonical backend needs one fixed Deploy role'
 code=code.replace("const GSIS_BACKEND_KIND='deploy';","const GSIS_BACKEND_KIND='roster';",1)
 code,count=re.subn(r"const GSIS_DEPLOY_VERSION='[^']+';",lambda _:f"const GSIS_DEPLOY_VERSION='{component_version}';",code)
 assert count==1, 'Roster build needs one component version'
 return code

root=Path(__file__).resolve().parents[1]
import runpy
installation_manifest=runpy.run_path(str(root/'scripts/installation-manifest.py'))['installation_manifest']
import json
release=json.loads((root/'package.json').read_text())
version=release['gsisRelease']
# One visible build label (release plus deploy letter) on every frontend header and
# asset query string, so users can tell builds apart and caches never serve old files.
build_label=release.get('gsisBuildLabel',version)
assert re.fullmatch(re.escape(version)+r'[a-z]?',build_label), 'gsisBuildLabel must be the release plus at most one letter'
label_pattern=re.compile(r'(\?v=|(?<![\w.])v)'+re.escape(version)+r'[a-z]?(?![\w.])')
# LORD setup templates must stay byte-identical to their Source pages.
for folder in [*json.loads((root/'release-installation-manifest.json').read_text())['frontends'].values(),*['lord-suite/First_Time_Setup/templates/'+app for app in ['lord','overlord','starlord']]]:
 for page in sorted((root/folder).rglob('*.html')):
  text=page.read_text();stamped=label_pattern.sub(lambda m:m.group(1)+build_label,text)
  if stamped!=text:page.write_text(stamped)
# Working-source checks must not overwrite the last authorised deployment.
source_only='--source-only' in sys.argv
FONT_SUFFIXES=set() if release.get('gsisAssetsIncluded') else {'.ttf','.woff','.woff2','.otf','.eot'}
if not source_only and not release.get('gsisAssetsIncluded'):
 subprocess.run([sys.executable,str(root/'scripts/build-asset-helper.py')],cwd=root,check=True)
subprocess.run([sys.executable,str(root/'scripts/sync-whatsapp-contracts.py')],cwd=root,check=True)
@contextmanager
def release_zip(destination):
 # Publish only complete archives; readers must never see an in-progress ZIP.
 fd, temporary = tempfile.mkstemp(prefix='gsis-release-', suffix='.zip', dir=root.parent)
 os.close(fd)
 try:
  with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED) as archive:
   yield archive
  with open(temporary,'r+b') as handle: os.fsync(handle.fileno())
  os.replace(temporary,destination)
 finally:
  Path(temporary).unlink(missing_ok=True)

api_secret_sources = [
 ('backend/ApiSecret.gs', ['backend/Code.gs', 'Contacts_Code.gs', 'calendar-backend/Code.gs', 'venues-backend/Code.gs']),
 ('shared/gsis-api-secret.js', ['public/_worker.js', 'contacts-update/public/_worker.js', 'layout-update/public/_worker.js',
  'roster-update/public/_worker.js', 'calendar-update/public/_worker.js', 'public/edge-deploy.js',
  'roster-update/public/edge-roster.js', 'roster-update/public/edge-timetable-cache.js',
  'shared/edge-venues-fence.js', 'shared/backend-service.js', 'notification-worker/index.js',
  'venues-viewport/public/_worker.js',
  *['lord-suite/Source/'+app+'/_worker.js' for app in ['lord', 'overlord', 'starlord']],
  *['lord-suite/First_Time_Setup/templates/'+app+'/_worker.js' for app in ['lord', 'overlord', 'starlord']]])]
for source, targets in api_secret_sources:
 marker='GSIS_API_SECRET'
 block='/* '+marker+'_BEGIN */\n'+(root/source).read_text()+'\n/* '+marker+'_END */'
 pattern=r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/'
 for target in targets:
  helper_source=({'backend/ApiSecret.gs':'backend/ContactsApiSecret.gs','shared/gsis-api-secret.js':'shared/contacts-api-secret.js'}.get(source,source) if target in {'Contacts_Code.gs','contacts-update/public/_worker.js'} else source)
  if target in {'calendar-backend/Code.gs','calendar-update/public/_worker.js'}:
   helper_source={'backend/ApiSecret.gs':'backend/CalendarApiSecret.gs','shared/gsis-api-secret.js':'shared/calendar-api-secret.js'}.get(source,source)
  if target in {'backend/Code.gs','public/_worker.js','roster-update/public/_worker.js','public/edge-deploy.js','roster-update/public/edge-roster.js','roster-update/public/edge-timetable-cache.js','shared/edge-venues-fence.js','shared/backend-service.js','notification-worker/index.js'}:
   helper_source={'backend/ApiSecret.gs':'backend/RosterDeployApiSecret.gs','shared/gsis-api-secret.js':'shared/roster-deploy-api-secret.js'}.get(source,source)
  block='/* '+marker+'_BEGIN */\n'+(root/helper_source).read_text()+'\n/* '+marker+'_END */'
  path=root/target
  content=path.read_text()
  assert len(re.findall(pattern,content))<=1, 'Duplicate API secret helper: '+target
  path.write_text(re.sub(pattern,lambda _:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')

for dest,source,marker in [('backend/Code.gs','shared/edge-store.js','GSIS_EDGE_STORE'),('backend/Code.gs','shared/roster-import.js','GSIS_ROSTER_IMPORT'),('backend/Code.gs','backend/RosterEdgeMigration.gs','GSIS_ROSTER_EDGE_MIGRATION'),('backend/Code.gs','backend/RosterMirror.gs','GSIS_ROSTER_MIRROR'),('backend/Code.gs','backend/RosterDriveOutputs.gs','GSIS_ROSTER_DRIVE_OUTPUTS'),('backend/Code.gs','backend/RosterNativeStorage.gs','GSIS_ROSTER_NATIVE_STORAGE'),('backend/Code.gs','backend/DeployEdge.gs','GSIS_DEPLOY_EDGE'),('backend/Code.gs','backend/RosterEdgeMail.gs','GSIS_ROSTER_EDGE_MAIL'),('backend/Code.gs','backend/VenuesBridge.gs','GSIS_VENUES_SOURCE_BRIDGE'),('Contacts_Code.gs','backend/VenuesBridge.gs','GSIS_VENUES_SOURCE_BRIDGE'),('calendar-backend/Code.gs','backend/VenuesBridge.gs','GSIS_VENUES_SOURCE_BRIDGE'),('backend/Code.gs','backend/RosterVenues.gs','GSIS_VENUES_ROSTER_SOURCE'),('backend/Code.gs','backend/DeployVenues.gs','GSIS_VENUES_DEPLOY_SOURCE'),('Contacts_Code.gs','backend/Contacts_Venues.gs','GSIS_VENUES_CONTACTS_SOURCE'),('calendar-backend/Code.gs','calendar-backend/Venues.gs','GSIS_VENUES_CALENDAR_SOURCE'),('backend/Code.gs','backend/LordBridge.gs','GSIS_LORD_SOURCE_BRIDGE'),('backend/Code.gs','backend/LordDeploy.gs','GSIS_LORD_DEPLOY_SOURCE'),('Contacts_Code.gs','backend/LordBridge.gs','GSIS_LORD_SOURCE_BRIDGE'),('Contacts_Code.gs','backend/Contacts_Lord.gs','GSIS_LORD_CONTACTS_SOURCE'),('backend/Code.gs','backend/BackendRole.gs','GSIS_BACKEND_ROLE'),('backend/Code.gs','backend/StaplerLeases.gs','GSIS_STAPLER_LEASES'),('backend/Code.gs','backend/RosterAllocationRun.gs','GSIS_ROSTER_ALLOCATION_RUN'),('backend/Code.gs','shared/roster-inbox.js','GSIS_ROSTER_INBOX_MODEL'),('backend/Code.gs','backend/RosterInbox.gs','GSIS_ROSTER_INBOX_STORE'),('backend/Code.gs','shared/roster-stapler.js','GSIS_ROSTER_STAPLER'),('backend/Code.gs','shared/roster-allocation.js','GSIS_ROSTER_ALLOCATION'),('backend/Code.gs','shared/roster-operations.js','GSIS_ROSTER_OPERATIONS_MODEL'),('backend/Code.gs','backend/RosterOperations.gs','GSIS_ROSTER_OPERATIONS_STORE'),('backend/Code.gs','backend/RosterColdArchive.gs','GSIS_ROSTER_COLD_ARCHIVE'),('backend/Code.gs','backend/RosterAbsenceIntake.gs','GSIS_ROSTER_ABSENCE_INTAKE'),('backend/Code.gs','backend/RosterAbsencePipeline.gs','GSIS_ROSTER_ABSENCE_PIPELINE'),('backend/Code.gs','backend/RosterPeerMail.gs','GSIS_ROSTER_PEER_MAIL'),('backend/Code.gs','shared/roster-statistics.js','GSIS_ROSTER_STATISTICS_MODEL'),('backend/Code.gs','backend/RosterStatistics.gs','GSIS_ROSTER_STATISTICS_STORE'),('backend/Code.gs','backend/RosterNotificationStore.gs','GSIS_ROSTER_NOTIFICATION_STORE'),('backend/Code.gs','backend/RosterNotificationMaintenance.gs','GSIS_ROSTER_NOTIFICATION_MAINTENANCE'),('backend/Code.gs','backend/RosterTimetableBatch.gs','GSIS_ROSTER_TIMETABLE_BATCH'),('backend/Code.gs','backend/RosterTimetablePreparation.gs','GSIS_ROSTER_TIMETABLE_PREPARATION'),('calendar-backend/Code.gs','calendar-backend/RosterDate.gs','GSIS_CALENDAR_DATE'),('calendar-backend/Code.gs','calendar-backend/Birthdays.gs','GSIS_CALENDAR_BIRTHDAYS'),('Contacts_Code.gs','backend/Contacts_Birthdays.gs','GSIS_CONTACTS_BIRTHDAYS'),('public/app.js','shared/asc-export.js','GSIS_ASC_EXPORT'),('backend/Code.gs','shared/asc-export.js','GSIS_ASC_EXPORT'),('public/app.js','public/asc-export-ui.js','GSIS_ASC_EXPORT_UI'),('backend/Code.gs','shared/roster.js','GSIS_ROSTER_MODEL'),('backend/Code.gs','backend/Roster.gs','GSIS_ROSTER_STORE'),('backend/Code.gs','backend/ExclusionStore.gs','GSIS_EXCLUSION_STORE'),('Contacts_Code.gs','backend/Contacts_Recalculate.gs','GSIS_CONTACTS_RECALCULATE'),('public/app.js','shared/pal.js','GSIS_PAL'),('backend/Code.gs','shared/pal.js','GSIS_PAL'),('Contacts_Code.gs','backend/Contacts_Current.gs','GSIS_CONTACTS_CURRENT'),('Contacts_Code.gs','shared/signature.js','GSIS_SIGNATURE'),('backend/Code.gs','backend/NoticeAcknowledgement.gs','GSIS_NOTICE_ACK'),('Contacts_Code.gs','backend/SheetsIO.gs','GSIS_SHEETS_IO'),('backend/Code.gs','backend/SheetsIO.gs','GSIS_SHEETS_IO'),('public/app.js','shared/reporting.js','GSIS_REPORTING'),('backend/Code.gs','shared/reporting.js','GSIS_REPORTING'),('public/app.js','shared/tg-scope.js','GSIS_TG_SCOPE'),('backend/Code.gs','shared/tg-scope.js','GSIS_TG_SCOPE'),('public/app.js','public/reporting-ui.js','GSIS_REPORTING_UI'),('public/app.js','shared/workload.js','GSIS_WORKLOAD'),('backend/Code.gs','shared/workload.js','GSIS_WORKLOAD'),('backend/Code.gs','shared/relief.js','GSIS_RELIEF'),('public/app.js','public/relief-ui.js','GSIS_RELIEF_UI'),('backend/Code.gs','backend/Relief.gs','GSIS_RELIEF_BACKEND'),('public/app.js','public/workload-ui.js','GSIS_WORKLOAD_UI'),('backend/Code.gs','shared/venue-groups.js','GSIS_VENUE_GROUPS'),('public/app.js','shared/venue-groups.js','GSIS_VENUE_GROUPS'),('public/app.js','public/version-rows.js','GSIS_VERSION_ROWS'),('backend/Code.gs','backend/VersionNotes.gs','GSIS_VERSION_NOTES'),('public/app.js','shared/fields.js','GSIS_FIELDS'),('backend/Code.gs','shared/fields.js','GSIS_FIELDS'),('backend/Code.gs','backend/FieldStore.gs','GSIS_FIELDSTORE'),('backend/Code.gs','backend/PlanningPatch.gs','GSIS_PATCH'),('public/app.js','shared/planning.js','GSIS_PLANNING'),('backend/Code.gs','shared/planning.js','GSIS_PLANNING'),('backend/Code.gs','backend/Planning.gs','GSIS_BACKEND_PLANNING'),('public/app.js','public/planning-ui.js','GSIS_PLANNING_UI'),('Contacts_Code.gs','backend/Contacts_Catalogue.gs','GSIS_CONTACTS_CATALOGUE')]:
 p=root/dest
 content=p.read_text()
 pattern=r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/'
 block='/* '+marker+'_BEGIN */\n'+(root/source).read_text()+'\n/* '+marker+'_END */'
 if dest in {'Contacts_Code.gs','calendar-backend/Code.gs'} and source in {'backend/LordBridge.gs','backend/VenuesBridge.gs'}:
  block=re.sub(r"gsisApiSecret_\('(?:LORD|VENUES)_BRIDGE_SECRET'\)",'gsisApiSecret_()',block)
  block=block.replace('Configure VENUES_BRIDGE_SECRET','Configure GSIS_SECRET')
  block=block.replace('A separate read-only service credential; never delegates a school-user role.', 'Read-only service boundary; transport authentication never delegates a school-user role.')
 p.write_text(re.sub(pattern,lambda m:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')
for folder in ['public','contacts-update/public','layout-update/public','roster-update/public']:
 p=root/folder/'_worker.js';content=p.read_text();marker='GSIS_BACKEND_RESPONSE'
 block='/* '+marker+'_BEGIN */\n'+(root/'shared/backend-response.js').read_text()+'\n/* '+marker+'_END */'
 pattern=r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/'
 p.write_text(re.sub(pattern,lambda m:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')
for folder in ['public','contacts-update/public']:
 p=root/folder/'_worker.js';content=p.read_text();marker='GSIS_WORKER_READ_COALESCING'
 block='/* '+marker+'_BEGIN */\n'+(root/'shared/worker-read-coalescing.js').read_text()+'\n/* '+marker+'_END */'
 pattern=r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/'
 p.write_text(re.sub(pattern,lambda m:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')
p=root/'roster-update/public/_worker.js';content=p.read_text();marker='GSIS_ROSTER_ABSENCE_TRANSPORT'
block='/* '+marker+'_BEGIN */\n'+(root/'shared/roster-absence-transport.js').read_text()+'\n/* '+marker+'_END */'
pattern=r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/'
p.write_text(re.sub(pattern,lambda m:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')
# Calendar's browser model is canonical; its Apps Script copy must match exactly.
calendar_target=root/'calendar-backend/Code.gs'
calendar_content=calendar_target.read_text()
calendar_core=(root/'calendar-update/public/calendar-core.js').read_text()
core_start=calendar_core.index('function gspsCalendarCoreFactory() {')
core_end=calendar_core.index('\nconst GSPSCalendarCore = gspsCalendarCoreFactory();',core_start)
backend_start=calendar_content.index('function gspsCalendarCoreFactory() {')
backend_end=calendar_content.index('\nconst RC17_CORE = gspsCalendarCoreFactory();',backend_start)
calendar_target.write_text(calendar_content[:backend_start]+calendar_core[core_start:core_end].rstrip()+'\n'+calendar_content[backend_end:])
for destination,source,marker in [
 ('calendar-backend/Code.gs','calendar-backend/Commands.gs','GSIS_CALENDAR_COMMANDS'),
 ('calendar-backend/Code.gs','calendar-backend/ChangeAwareness.gs','GSIS_CALENDAR_CHANGE_AWARENESS'),
 ('calendar-backend/Code.gs','calendar-backend/VenueDirectory.gs','GSIS_CALENDAR_VENUE_DIRECTORY'),
 ('venues-backend/Code.gs','venues-backend/CalendarCatalogue.gs','GSIS_VENUES_CALENDAR_CATALOGUE')]:
 target=root/destination
 content=target.read_text()
 pattern=r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/'
 block='/* '+marker+'_BEGIN */\n'+(root/source).read_text()+'\n/* '+marker+'_END */'
 assert len(re.findall(pattern,content))<=1, 'Duplicate generated module: '+marker
 target.write_text(re.sub(pattern,lambda _:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')
view=root/'Contacts_Code.gs'
audit_target=root/'backend/Code.gs'
audit_content=audit_target.read_text()
audit_marker='GSIS_ROSTER_AUDIT_EXPORT'
audit_block='/* '+audit_marker+'_BEGIN */\n'+(root/'backend/RosterAuditExport.gs').read_text()+'\n/* '+audit_marker+'_END */'
audit_pattern=r'/\* '+audit_marker+r'_BEGIN \*/[\s\S]*?/\* '+audit_marker+r'_END \*/'
audit_target.write_text(re.sub(audit_pattern,lambda m:audit_block,audit_content) if re.search(audit_pattern,audit_content) else audit_content+'\n'+audit_block+'\n')
review_source=root/'backend/RosterDeliveryReview.gs'
review_target=root/'backend/Code.gs'
review_content=review_target.read_text()
review_marker='GSIS_ROSTER_DELIVERY_REVIEW'
review_block='/* '+review_marker+'_BEGIN */\n'+review_source.read_text()+'\n/* '+review_marker+'_END */'
review_pattern=r'/\* '+review_marker+r'_BEGIN \*/[\s\S]*?/\* '+review_marker+r'_END \*/'
review_target.write_text(re.sub(review_pattern,lambda m:review_block,review_content) if re.search(review_pattern,review_content) else review_content+'\n'+review_block+'\n')

content=view.read_text()
block='/* GSIS_CONTACTS_VIEW_BEGIN */\n'+(root/'backend/Contacts_View.gs').read_text()+'\n/* GSIS_CONTACTS_VIEW_END */'
pattern=r'/\* GSIS_CONTACTS_VIEW_BEGIN \*/[\s\S]*?/\* GSIS_CONTACTS_VIEW_END \*/'
view.write_text(re.sub(pattern,lambda m:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')
content=view.read_text()
diag='/* GSIS_CONTACTS_DIAGNOSTICS_BEGIN */\n'+(root/'backend/Contacts_Diagnostics.gs').read_text()+'\n/* GSIS_CONTACTS_DIAGNOSTICS_END */'
pattern=r'/\* GSIS_CONTACTS_DIAGNOSTICS_BEGIN \*/[\s\S]*?/\* GSIS_CONTACTS_DIAGNOSTICS_END \*/'
view.write_text(re.sub(pattern,lambda m:diag,content) if re.search(pattern,content) else content+'\n'+diag+'\n')
content=view.read_text()
block=(root/'backend/Contacts_Commit.gs').read_text().strip()
pattern=r'/\* GSIS_CONTACTS_COMMIT_BEGIN \*/[\s\S]*?/\* GSIS_CONTACTS_COMMIT_END \*/'
view.write_text(re.sub(pattern,lambda m:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')
layout=root/'backend/Code.gs'
content=layout.read_text()
for marker,source in [('GSIS_LAYOUT_DATA',root/'shared/layout-data.js'),('GSIS_LAYOUT_REPOSITORY',root/'backend/LayoutRepository.gs'),('GSIS_LAYOUT_DIAGNOSTICS',root/'backend/LayoutDiagnostics.gs')]:
 block='/* '+marker+'_BEGIN */\n'+source.read_text()+'\n/* '+marker+'_END */'
 pattern=r'/\* '+marker+r'_BEGIN \*/[\s\S]*?/\* '+marker+r'_END \*/'
 content=re.sub(pattern,lambda m:block,content) if re.search(pattern,content) else content+'\n'+block+'\n'
seed='const GSIS_LAYOUT_SEED_2026='+json.dumps(json.loads((root/'data/layout-2026.json').read_text()),ensure_ascii=True,separators=(',',':'))+';'
pattern=r'/\* GSIS_LAYOUT_SEED_BEGIN \*/[\s\S]*?/\* GSIS_LAYOUT_SEED_END \*/'
block='/* GSIS_LAYOUT_SEED_BEGIN */\n'+seed+'\n/* GSIS_LAYOUT_SEED_END */'
layout.write_text(re.sub(pattern,lambda m:block,content) if re.search(pattern,content) else content+'\n'+block+'\n')
shutil.copyfile(root/'shared/signature.js',root/'contacts-update/public/signature.js')
engine=(root/'shared/teaching-rules.js').read_text().strip()
for target in ['Contacts_Code.gs','backend/Code.gs','public/app.js']:
 p=root/target
 content=p.read_text()
 begin=content.index('/* One teaching-load rule engine,')
 end=content.index("if(typeof module!=='undefined'&&module.exports)module.exports=GSISTeachingRules;",begin)+len("if(typeof module!=='undefined'&&module.exports)module.exports=GSISTeachingRules;")
 p.write_text(content[:begin]+engine+content[end:])
assert 'function buildCampus' not in (root/'public/landmark.html').read_text(), 'Deploy must not bundle a second model'
assert 'function buildCampus' in (root/'layout-update/public/landmark.html').read_text(), 'Layout must own the model'
# Runtime module blocks may be newly appended. Start only after every block has
# initialized; tests and preview hosts also remove this one trailing boot call.
app=root/'public/app.js'
app.write_text(re.sub(r'^controls\(\);startSignIn\(\);\s*$', '', app.read_text(), flags=re.M).rstrip()+'\n\ncontrols();startSignIn();\n')
# P1 adds one Deploy-only canonical module. Preserve all bytes outside its marker.
queue_target=root/'backend/Code.gs'
queue_content=queue_target.read_text()
queue_marker='GSIS_DEPLOY_QUEUE_MODULE'
queue_block='/* '+queue_marker+'_BEGIN */\n'+(root/'shared/edge-command-queue.js').read_text()+'\n'+(root/'backend/DeployCommandQueue.gs').read_text()+'\n/* '+queue_marker+'_END */'
queue_pattern=r'/\* '+queue_marker+r'_BEGIN \*/[\s\S]*?/\* '+queue_marker+r'_END \*/'
assert len(re.findall(queue_pattern,queue_content))<=1, 'Duplicate Deploy queue module'
queue_target.write_text(re.sub(queue_pattern,lambda _:queue_block,queue_content) if re.search(queue_pattern,queue_content) else queue_content+queue_block)
subprocess.run(['node',str(root/'scripts/build-edge-deploy.cjs')],cwd=root,check=True)
subprocess.run(['node',str(root/'scripts/build-edge-modules.cjs')],cwd=root,check=True)
code=(root/'backend/Code.gs').read_text()+'\n'+(root/'backend/Seed.gs').read_text()
assert code.count("const GSIS_BACKEND_KIND='deploy';")==1, 'Canonical backend needs one fixed Deploy role'
roster_version=release.get('gsisComponentVersions',{}).get('rosterBackend',version)
roster_code=roster_backend_source(code,roster_version)
if not source_only and (release.get('gsisPackageKind') != 'component-patch' or 'deployBackend' in release.get('gsisPatchComponents', ['deployBackend'])):
 (root/f'Deploy_Backend_v{version}.gs').write_text(code.replace('DEPLOY_SEED','GSIS_DEPLOY_EMBEDDED_SEED_04'))
if 'Venues' in json.loads((root/'release-installation-manifest.json').read_text())['backends']:
 shutil.copyfile(root/'shared/venues.js',root/'venues-backend/Domain.gs')
 if not source_only and (release.get('gsisPackageKind') != 'component-patch' or 'venuesBackend' in release.get('gsisPatchComponents', [])):
  venues='// Generated by scripts/build-release.py from venues-backend sources.\n'+ '\n\n'.join((root/'venues-backend'/name).read_text() for name in ['Domain.gs','Code.gs','Sources.gs','Register.gs','Notifications.gs'])
  (root/f'Venues_Backend_v{version}.gs').write_text(venues)
contacts=(root/'Contacts_Code.gs').read_text()
if not source_only and (release.get('gsisPackageKind') != 'component-patch' or 'contactsBackend' in release.get('gsisPatchComponents', [])):
 (root/f'Contacts_Backend_v{version}.gs').write_text(contacts)
if not source_only and (release.get('gsisPackageKind') != 'component-patch' or 'calendarBackend' in release.get('gsisPatchComponents', [])):
 (root/f'Calendar_Backend_v{version}.gs').write_text((root/'calendar-backend/Code.gs').read_text())
if not source_only and (release.get('gsisPackageKind') != 'component-patch' or 'lordBackend' in release.get('gsisPatchComponents', [])) and 'LORD' in json.loads((root/'release-installation-manifest.json').read_text())['backends']:
 (root/f'LORD_Backend_v{version}.gs').write_text((root/'lord-suite/Source/backend/Code.gs').read_text())
if not source_only and (release.get('gsisPackageKind') != 'component-patch' or 'rosterBackend' in release.get('gsisPatchComponents', [])):
 (root/f'Roster_Backend_v{version}.gs').write_text(roster_code.replace('DEPLOY_SEED','GSIS_DEPLOY_EMBEDDED_SEED_04'))
(root/'backend/Contacts_Code_with_Deploy_API.gs').write_text(contacts)
subprocess.run(['node',str(root/'tests/apps-script-syntax.cjs')],cwd=root,check=True)
dashboard_builder=root/'scripts/build-notification-worker.py'
if dashboard_builder.exists() and (release.get('gsisPackageKind')!='component-patch' or 'notificationWorker' in release.get('gsisPatchComponents',['deployBackend','notificationWorker','rosterFrontend'])):
 subprocess.run([sys.executable,str(dashboard_builder)],cwd=root,check=True)
operations_builder=root/'scripts/build-operations-worker.py'
if operations_builder.exists() and (release.get('gsisPackageKind')!='component-patch' or 'operationsWorker' in release.get('gsisPatchComponents', [])):
 subprocess.run([sys.executable,str(operations_builder)],cwd=root,check=True)
if version=='0.9.7' and release.get('gsisPackageKind')!='component-patch':
 # Copy operational setup references into the offline installation inventory.
 # The source ZIP retains the original paths; the deployment guide uses docs/.
 (root/'docs/v097/QUEUES.md').write_text((root/'notification-worker/QUEUES.md').read_text().replace('`wrangler.toml`','`notification-worker.example.toml`'))
 for worker in ('notification-worker','operations-worker'):
  shutil.copyfile(root/worker/'wrangler.toml',root/'docs/v097'/f'{worker}.example.toml')
calendar_job_builder=root/'scripts/build-calendar-job-worker.py'
if calendar_job_builder.exists() and (release.get('gsisPackageKind')!='component-patch' or 'calendarJobWorker' in release.get('gsisPatchComponents', [])):
 subprocess.run([sys.executable,str(calendar_job_builder)],cwd=root,check=True)
shutil.copyfile(root/'shared/roster.js',root/'roster-update/public/roster-model.js')
shutil.copyfile(root/'shared/roster-operations.js',root/'roster-update/public/roster-operations-model.js')
shutil.copyfile(root/'shared/roster-allocation.js',root/'roster-update/public/roster-allocation.js')
shutil.copyfile(root/'shared/roster-stapler.js',root/'roster-update/public/roster-stapler-model.js')
shutil.copyfile(root/'shared/roster-statistics.js',root/'roster-update/public/roster-statistics.js')
shutil.copyfile(root/'shared/excel-export.js',root/'roster-update/public/excel-export.js')
if source_only or '--sync-only' in sys.argv:
 for folder in ['public','contacts-update/public','layout-update/public']:
  for shared in ([] if folder in ['roster-update/public','calendar-update/public'] else ['viewports.js','loading.css','transport.js','layout-renderer.js','table-viewport.js','table-viewport.css','table-tools.js','excel-export.js','layout-excel.js','layout-excel-template.json','teaching-rules.js','fields.js']):shutil.copyfile(root/'shared'/shared,root/folder/shared)
 print('Synced working runtime sources; versioned deployment artifacts unchanged' if source_only else 'Synced v'+version+' runtime modules and combined backends')
 sys.exit(0)
frontends=[]
frontend_spec=json.loads((root/'release-installation-manifest.json').read_text())['frontends']
for name,folder in frontend_spec.items():
 for shared in (['viewports.js','loading.css','transport.js','layout-renderer.js','table-viewport.js','table-viewport.css','table-tools.js','excel-export.js','layout-excel.js','layout-excel-template.json','teaching-rules.js','fields.js'] if folder in ['public','contacts-update/public','layout-update/public'] else []):shutil.copyfile(root/'shared'/shared,root/folder/shared)
 path=root/f'{name}_Frontend_v{version}.zip';frontends.append(path)
 with release_zip(path) as z:
  for p in sorted((root/folder).rglob('*')):
   if p.is_file() and p.suffix.lower() not in FONT_SUFFIXES:
    assert p.name not in {'.env','.dev.vars'}, 'Do not package local secret files'
    if p.name=='_worker.js' and folder in ['public','roster-update/public']:
     with tempfile.TemporaryDirectory(prefix='gsis-worker-') as bundled:
      output=Path(bundled)/'_worker.js'
      subprocess.run(['node',str(root/'scripts/bundle-worker.cjs'),str(p.relative_to(root)),str(output)],cwd=root,check=True)
      z.writestr('_worker.js',output.read_bytes())
    else:z.write(p,str(p.relative_to(root/folder)))
# Keep historical documentation, source recovery and verification outside the
# installation ZIP. Runtime dependencies remain inside their frontend ZIPs.
package=root/f'GSiS_v{version}_Deployment.zip'
installation,members=installation_manifest(root,version)
files={name:path.read_bytes() for name,path in members.items()}
try:
 commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True,stderr=subprocess.DEVNULL).strip()
 # Only release inputs determine provenance; unrelated local review files do not.
 release_inputs=list(installation['frontends'].values())+['backend','shared','data','calendar-backend','Contacts_Code.gs',
  'notification-worker','operations-worker','edge-command-worker','migrations','scripts','package.json','package-lock.json','release-installation-manifest.json']
 release_inputs += [str(members[name.format(version=version)].relative_to(root)) for name in installation['documents']]
 if 'LORD' in installation['backends']:release_inputs.append('lord-suite/Source/backend')
 if 'Venues' in installation['backends']:release_inputs.append('venues-backend')
 dirty=bool(subprocess.check_output(['git','status','--porcelain','--',*release_inputs],cwd=root,text=True).strip())
except (subprocess.CalledProcessError,FileNotFoundError):
 commit=None
 dirty=True
metadata={'schema':1,'version':version,'sourceCommit':commit,
          'sourceState':'working-tree' if dirty else 'committed',
          'sha256':{name:hashlib.sha256(data).hexdigest() for name,data in sorted(files.items())}}
with release_zip(package) as z:
 for name,data in files.items():z.writestr(name,data)
 z.comment=json.dumps(metadata,separators=(',',':')).encode()
print(package.name,package.stat().st_size,'bytes;',len(members),'installation/document files')
