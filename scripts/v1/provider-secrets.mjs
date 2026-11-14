/** Secret values stay in memory and Wrangler stdin, never build configuration.
 * Provisioning credentials does not transfer sender/scheduler/webhook ownership. */
export const providerSecretOwners = Object.freeze({
  WHATSAPP_ACCESS_TOKEN: ['roster','lord','venues'],
  WHATSAPP_APP_SECRET: ['roster'],
  WHATSAPP_VERIFY_TOKEN: ['roster'],
  TELEGRAM_BOT_TOKEN: ['lord'],
  TELEGRAM_WEBHOOK_SECRET: ['roster'],
  GOOGLE_SERVICE_ACCOUNT: ['core','contacts','deploy','roster','calendar','lord','venues','layout'],
  EMAIL_API_TOKEN: ['roster','lord','venues'],
});
export function secretBindings(owner, env) {
  if (!['core','contacts','deploy','roster','calendar','lord','venues','layout','web'].includes(owner))
    throw Error('Unknown isolated owner.');
  if (!env.GSIS_SECRET) throw Error('GSIS_SECRET is required.');
  const result={GSIS_SECRET:env.GSIS_SECRET};
  if (env.GSIS_UPLOAD_PROVIDER_CREDENTIALS!=='true')return result;
  for(const [name,owners] of Object.entries(providerSecretOwners)) {
    const value=env[name];if(!value||!owners.includes(owner))continue;
    if(typeof value!=='string'||value.length>32768)throw Error('Invalid secret binding: '+name);
    if(name==='TELEGRAM_BOT_TOKEN'&&!/^[0-9]+:[A-Za-z0-9_-]+$/.test(value))throw Error('TELEGRAM_BOT_TOKEN format is invalid.');
    result[name]=value;
  }
  return result;
}
