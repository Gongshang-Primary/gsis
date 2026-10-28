"""Prepare/provision new isolated rehearsal resources. Never changes production configs or existing DBs.

Default is an offline plan. --create creates exactly one NEW D1 and one NEW R2 bucket,
checks the new DB is empty, initializes markers, and writes a NEW config. Deployment
is a separate explicit CLI step. No API token or staff data belongs in arguments.
"""
from pathlib import Path
import argparse
import json
import re
import shutil
import subprocess
import sys
import uuid
from urllib.parse import urlparse

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--create', action='store_true', help='Actually create NEW resources; never deploy')
    parser.add_argument('--output-dir', type=Path, default=Path('rehearsal-deployment'))
    parser.add_argument('--origin', default='')
    parser.add_argument('--client-id', default='')
    parser.add_argument('--school-domain', default='')
    parser.add_argument('--admin-emails', default='')
    parser.add_argument('--wrangler', default='wrangler', help='Installed Wrangler executable (no automatic package installation)')
    args = parser.parse_args()
    instance = 'rehearsal-'+uuid.uuid4().hex
    suffix = instance[-12:]
    database = 'gsis-roster-rehearsal-ledger-'+suffix
    bucket = 'gsis-roster-rehearsal-timetables-'+suffix
    plan = {'worker':'gsis-roster-rehearsal','instanceId':instance,'createNewD1':database,'createNewPrivateR2':bucket,
            'outputDir':str(args.output_dir.resolve()),'deploys':False,'changesExistingBindings':False,'remote':args.create}
    print(json.dumps(plan,indent=2))
    if not args.create:
        print('Offline plan only. Read REHEARSAL_SETUP.md, then supply identity settings with --create.')
        return
    parsed = urlparse(args.origin)
    domain = args.school_domain.lower()
    admins = [e.strip().lower() for e in args.admin_emails.split(',') if e.strip()]
    if parsed.scheme!='https' or args.origin!=f'https://{parsed.netloc}' or not re.fullmatch(r'gsis-roster-rehearsal\.[a-z0-9-]+\.workers\.dev',parsed.netloc):
        parser.error('--origin must be the exact https://gsis-roster-rehearsal.YOUR-SUBDOMAIN.workers.dev origin')
    if not re.fullmatch(r'[-A-Za-z0-9.]+\.apps\.googleusercontent\.com',args.client_id) or not re.fullmatch(r'[a-z0-9][a-z0-9.-]*\.[a-z]{2,}',domain):
        parser.error('Supply the school Google web client ID and hosted school domain')
    if not 1<=len(admins)<=20 or any(not re.fullmatch(r'[^@\s]+@'+re.escape(domain),e) for e in admins):
        parser.error('Supply 1–20 explicit school administrator emails')
    out = args.output_dir.resolve()
    if out.exists():
        parser.error('--output-dir must not exist; setup will never overwrite an existing config or resume old resources')
    executable = shutil.which(args.wrangler)
    if not executable:
        parser.error('Install the official Wrangler CLI yourself first; no package or resource was installed')
    here = Path(__file__).resolve().parent
    source = here.parent
    packaged = (here/'worker.mjs').exists()
    worker = here/'worker.mjs' if packaged else source/'rehearsal-worker/dist/worker.mjs'
    schema = here/'schema.sql' if packaged else source/'rehearsal-worker/schema.sql'
    if not worker.exists() or not schema.exists():
        parser.error('Build the rehearsal Worker first or extract the complete standalone rehearsal ZIP')
    out.mkdir(parents=True)
    shutil.copyfile(worker,out/'worker.mjs')
    # All Wrangler calls use a fresh dedicated config. No auto-detected production config.
    config = out/'wrangler.toml'
    config.write_text('name = "gsis-roster-rehearsal"\nmain = "worker.mjs"\ncompatibility_date = "2026-10-01"\n',encoding='utf-8')
    manifest = out/'provisioning.json'
    manifest.write_text(json.dumps({**plan,'status':'starting','created':[]},indent=2)+'\n',encoding='utf-8')
    def run(*parts):
        command = [executable,*parts,'--config',str(config)]
        print('Running:', ' '.join(command),flush=True)
        result = subprocess.run(command,cwd=out,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode:
            # Wrangler may report account/API detail. Keep it local; no credentials are printed by this helper.
            (out/'last-error.txt').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
            raise RuntimeError('Wrangler failed. See the local last-error.txt. Stop; no cleanup or reuse is automatic.')
        return result.stdout
    try:
        created = run('d1','create',database,'--update-config=false')
        matches = re.findall(r'(?:database_id["\s]*[=:]["\s]*)([0-9a-fA-F-]{36})',created)
        if len(set(matches))!=1:
            (out/'new-database-output.txt').write_text(created,encoding='utf-8')
            raise RuntimeError('Could not identify the newly created D1 UUID. Stop; inspect new-database-output.txt.')
        database_id = matches[0]
        manifest.write_text(json.dumps({**plan,'status':'new-d1-created','created':[{'database':database,'id':database_id}]},indent=2)+'\n',encoding='utf-8')
        run('r2','bucket','create',bucket)
        config_text = '\n'.join([
            'name = "gsis-roster-rehearsal"','main = "worker.mjs"','compatibility_date = "2026-10-01"','workers_dev = true','preview_urls = false','',
            '[limits]','cpu_ms = 1000','','[vars]',
            'REHEARSAL_MODE = "simulation-only"','REHEARSAL_INSTANCE_ID = '+json.dumps(instance),
            'REHEARSAL_ORIGIN = '+json.dumps(args.origin),'REHEARSAL_GOOGLE_CLIENT_ID = '+json.dumps(args.client_id),
            'REHEARSAL_SCHOOL_DOMAIN = '+json.dumps(domain),'REHEARSAL_ADMIN_EMAILS = '+json.dumps(','.join(admins)),'',
            '[[d1_databases]]','binding = "REHEARSAL_LEDGER"','database_name = '+json.dumps(database),'database_id = '+json.dumps(database_id),'',
            '[[r2_buckets]]','binding = "REHEARSAL_TIMETABLES"','bucket_name = '+json.dumps(bucket),''])
        config.write_text(config_text,encoding='utf-8')
        empty = json.loads(run('d1','execute',database,'--remote','--json','--command',"SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"))
        if not isinstance(empty,list) or not empty or any(item.get('success') is False or item.get('results') for item in empty):
            raise RuntimeError('New D1 is not demonstrably empty. Refusing schema writes.')
        initialization = schema.read_text(encoding='utf-8')+f"\nINSERT INTO rehearsal_meta VALUES (1,'gsis.rehearsal.ledger',1,'{instance}','simulation-only');\nINSERT INTO rehearsal_ledger (singleton,instance_id) VALUES (1,'{instance}');\n"
        (out/'initialize.sql').write_text(initialization,encoding='utf-8')
        run('d1','execute',database,'--remote','--file',str(out/'initialize.sql'),'--yes')
        (out/'marker.json').write_text(json.dumps({'schema':'gsis.rehearsal.bucket','version':1,'instanceId':instance,'mode':'simulation-only'})+'\n',encoding='utf-8')
        run('r2','object','put',bucket+'/rehearsal/'+instance+'/marker.json','--remote','--file',str(out/'marker.json'),'--content-type','application/json')
        manifest.write_text(json.dumps({**plan,'status':'initialized-not-deployed','created':[{'database':database,'id':database_id},{'bucket':bucket}]},indent=2)+'\n',encoding='utf-8')
        print('New rehearsal resources initialized. Check the private R2 setting, then deploy explicitly:')
        print(executable+' deploy --config '+str(config))
        print('After school sign-in, create the synthetic day and run Verify storage readback. Live readiness is not claimed by setup.')
    except Exception as error:
        print(str(error),file=sys.stderr)
        print('Provisioning stopped. Retain provisioning.json. No production config was changed and no resource was deleted.',file=sys.stderr)
        raise SystemExit(1)

if __name__=='__main__':
    main()
