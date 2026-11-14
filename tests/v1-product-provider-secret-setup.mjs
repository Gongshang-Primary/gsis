import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {secretBindings,providerSecretOwners} from '../scripts/v1/provider-secrets.mjs';
import {buildProduct} from '../scripts/v1/build.mjs';
const env={GSIS_SECRET:'synthetic-common-secret',GSIS_UPLOAD_PROVIDER_CREDENTIALS:'true'};
for(const name of Object.keys(providerSecretOwners))env[name]=name==='TELEGRAM_BOT_TOKEN'?'123456789:synthetic_canary_token':'synthetic-private-canary-'+name;
for(const owner of ['core','contacts','deploy','roster','calendar','lord','venues','layout','web']){
 assert.deepEqual(secretBindings(owner,{...env,GSIS_UPLOAD_PROVIDER_CREDENTIALS:'false'}),{GSIS_SECRET:env.GSIS_SECRET},'credential upload is opt-in');
 const result=secretBindings(owner,env);
 for(const [name,owners] of Object.entries(providerSecretOwners))assert.equal(result[name],owners.includes(owner)?env[name]:undefined,owner+' least-privilege binding '+name);
}
assert.throws(()=>secretBindings('other',env));
assert.throws(()=>secretBindings('lord',{...env,TELEGRAM_BOT_TOKEN:'123:bad token'}),/format is invalid/);
assert.deepEqual(secretBindings('lord',{GSIS_SECRET:env.GSIS_SECRET,GSIS_UPLOAD_PROVIDER_CREDENTIALS:'true'}),{GSIS_SECRET:env.GSIS_SECRET},'missing optional values neither fabricate nor erase a secret');
const workflow=await readFile(new URL('../.github/workflows/v1-deploy.yml',import.meta.url),'utf8');
assert(workflow.includes('default: false'));assert(workflow.includes('environment: gsis-v1-owner-approved'));assert(workflow.includes("github.ref == 'refs/heads/main'"));
const step=workflow.indexOf('name: Apply isolated owner schemas');
for(const name of Object.keys(providerSecretOwners)){assert(!workflow.slice(0,step).includes('secrets.'+name));assert(workflow.slice(step).includes('inputs.upload_provider_credentials && secrets.'+name));}
const deploy=await readFile(new URL('../scripts/v1/deploy.mjs',import.meta.url),'utf8');
assert(deploy.indexOf('const secretsByOwner')<deploy.indexOf('"--remote"'),'validate before any live side effect');
assert(deploy.includes('input: JSON.stringify(secrets)'),'credentials travel on stdin, never command arguments');
const output=await mkdtemp(join(tmpdir(),'gsis-secret-isolation-')),previous={};
try{
 for(const [key,value] of Object.entries(env)){previous[key]=process.env[key];process.env[key]=value;}
 await buildProduct({output});
 async function inspect(dir){for(const item of await readdir(dir,{withFileTypes:true})){const p=join(dir,item.name);if(item.isDirectory())await inspect(p);else {const content=await readFile(p);for(const value of Object.values(env).filter(v=>v!=='true'))assert(!content.includes(Buffer.from(value)),'secret canary reached '+p);}}}
 await inspect(output);
 console.log('PASS optional protected-environment provisioning, owner-specific secret bindings, preflight validation, stdin-only transfer and zero secret canaries in built Worker/web/config/package material');
}finally{for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}await rm(output,{recursive:true,force:true});}
