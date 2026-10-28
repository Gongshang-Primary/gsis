from pathlib import Path
import re, subprocess, tempfile, sys, json, hashlib

ROOT=Path(__file__).resolve().parents[1]
release=json.loads((ROOT.parent/'package.json').read_text())['gsisComponentVersions']
backend_version=release['lordBackend']
checks=[]
def check(name, ok, detail=''):
    checks.append({'name':name,'ok':bool(ok),'detail':detail})

def node_check(path, label):
    r=subprocess.run(['node','--check',str(path)],capture_output=True,text=True)
    check(label+' syntax', r.returncode==0, r.stderr.strip())

backend=ROOT/'Source/backend/Code.gs'
text=backend.read_text()
with tempfile.NamedTemporaryFile('w',suffix='.js',delete=False) as f:
    f.write(text); tmp=f.name
r=subprocess.run(['node','--check',tmp],capture_output=True,text=True)
check('Backend JavaScript syntax',r.returncode==0,r.stderr.strip())
funcs=re.findall(r'^function\s+([A-Za-z_$][\w$]*)\s*\(',text,re.M)
check('Exactly one doGet router',funcs.count('doGet')==1,str(funcs.count('doGet')))
check('Exactly one doPost router',funcs.count('doPost')==1,str(funcs.count('doPost')))
check('No duplicate backend function declarations',len(funcs)==len(set(funcs)),f'{len(funcs)} / {len(set(funcs))}')
check('Only two SpreadsheetApp.openById loaders',text.count('SpreadsheetApp.openById')==2,str(text.count('SpreadsheetApp.openById')))
check('Backend release version matches the installation manifest',f"VERSION: '{backend_version}'" in text and f'LORD Suite Backend v{backend_version}' in text)
check('Formal v1 diagnostics are present','selfTestLORDV1' in text and 'installLORDV1Triggers' in text and 'inspectLORDV1Configuration' in text)
check('Pre-v1 admin diagnostic aliases remain for maintainer compatibility','function selfTestLORDV3() { return selfTestLORDV1(); }' in text)
check('No hard-coded Apps Script deployment URL in backend','script.google.com/macros' not in text)
check('Backend credentials are Script Properties, not embedded literals',
      'getScriptProperties' in text and all('LORD_'+key in text and not re.search(r'^\s*'+key+r':\s*[\x27\x22]',text,re.M)
      for key in ['PROXY_SECRET','BOOKING_TOKEN_PEPPER','BOOKING_CODE_PEPPER','TELEGRAM_BOT_TOKEN','TELEGRAM_CHAT_ID']))
check('All external configuration names are retained',all('LORD_'+key in text for key in ['SPREADSHEET_ID','REFERENCE_SPREADSHEET_ID','PHOTO_FOLDER_ID','REIGN_ARCHIVE_FOLDER_ID']))
check('Runtime schema assertion is non-mutating','insertColumnsAfter' not in re.search(r'function assertSessionSchema_\(.*?\n\}',text,re.S).group(0) and '.setValues' not in re.search(r'function assertSessionSchema_\(.*?\n\}',text,re.S).group(0))
check('Recoverable collection state retained','PENDING_COLLECTION' in text)
check('REIGN safety guard retained','assertReignCloseSafe_' in text and 'REIGN_CLOSE_HOUR: 18' in text)
check('Secondary queue one-minute trigger retained','everyMinutes(1)' in text and 'processSecondaryQueueTrigger' in text)
check('Photo filename helper defined','function sanitiseFileName_(' in text)

# v1 collection/return contract
loan_fn=re.search(r'function createLoanSession_\(request, requestId\) \{.*?\n\}',text,re.S).group(0)
return_fn=text[text.index('function completeReturn_(request, requestId) {'):text.index('\nfunction ensureNoOpenLoanForCart_',text.index('function completeReturn_'))]
check('Collection records actual stylus quantity','stylusLoanQuantity' in loan_fn and 'stylusesBooked ? stylusLoanQuantity' in loan_fn)
check('Collection records actual headphone quantity','headphoneLoanQuantity' in loan_fn and 'headphonesBooked ? headphoneLoanQuantity' in loan_fn)
check('Collection accessory photo required only above zero','stylusesBooked && stylusLoanQuantity > 0' in loan_fn and 'headphonesBooked && headphoneLoanQuantity > 0' in loan_fn)
check('Collection accessory quantities bounded by collected devices','stylusLoanQuantity > loanDeviceTotal' in loan_fn and 'headphoneLoanQuantity > loanDeviceTotal' in loan_fn)
check('Return uses one Session-level issue declaration','var sessionIssue = request.issue' in return_fn and 'var sessionIssueNotes = normaliseText_(request.issueNotes)' in return_fn)
check('Backend rejects partial trolley returns','All trolleys in this loan session must be returned together.' in return_fn)
check('Backend rejects duplicate trolley records','The same trolley was submitted more than once' in return_fn)
check('Backend detects trolley quantity discrepancies','returnQuantity !== saved.loanQuantity' in return_fn)
check('Backend detects accessory quantity discrepancies','returnStylusQuantity !== loanStylusQuantity' in return_fn and 'returnHeadphoneQuantity !== loanHeadphoneQuantity' in return_fn)
check('Backend refuses clean return when discrepancy exists','A return discrepancy was detected. Use Return with issue' in return_fn)
check('Backend requires issue explanation','Describe the outstanding issue for the ICT Backend team.' in return_fn)
check('Return accessory photos conditional on returned quantity','stylusesBooked && returnStylusQuantity > 0' in return_fn and 'headphonesBooked && returnHeadphoneQuantity > 0' in return_fn)
check('Session issue copied to trolley audit rows','hasIssue, hasIssue ? sessionIssueNotes' in return_fn)

# Frontend syntax and worker invariants
for app in ['lord','overlord','starlord']:
    worker=ROOT/f'Source/{app}/_worker.js'
    appjs=ROOT/f'Source/{app}/assets/app.js'
    node_check(worker,f'{app.upper()} Worker')
    node_check(appjs,f'{app.upper()} app.js')
    wt=worker.read_text()
    check(f'{app.upper()} uses external backend URL and secret bindings', 'env.LORD_BACKEND_URL' in wt and "gsisApiSecret(env,'LORD_PROXY_SECRET')" in wt and 'function gsisApiSecret(env,legacyName)' in wt and 'env?.GSIS_SECRET' in wt)
    check(f'{app.upper()} has no embedded connection literals',not re.search(r'const\s+LORD_(?:BACKEND_URL|PROXY_SECRET)\s*=\s*[\x27\x22]',wt))

lord_app=(ROOT/'Source/lord/assets/app.js').read_text()
lord_index=(ROOT/'Source/lord/index.html').read_text()
lord_worker=(ROOT/'Source/lord/_worker.js').read_text()
check('LORD title matches the installation manifest',f"<title>LORD v{release['lordFrontend']} |" in lord_index)
check('LORD booking-success Collect re-enters authoritative booking selector',lord_app.count("state.mode='loan';loadEligibleBookings();") >= 1)
check('LORD Collection accessory UI has independent quantities','stylusQuantity' in lord_app and 'headphoneQuantity' in lord_app and 'Quantity collected' in lord_app)
check('LORD Collection zero accessory quantity needs no photo',"Number(state.loan.stylusQuantity) > 0 && !state.loan.stylusPhotoData" in lord_app and "Number(state.loan.headphoneQuantity) > 0 && !state.loan.headphonePhotoData" in lord_app)
check('LORD immediate Collection-to-Return auto-selects trolleys',lord_app.count('loadSession(result.sessionId, { autoSelect: true })')>=1)
check('LORD direct Return uses manual trolley confirmation',"selectionMode: 'manual'" in lord_app and 'return-trolley-selected' in lord_app and 'Partial returns are not permitted' in lord_app)
check('LORD has one Session-level red issue control','id="returnIssueBtn"' in lord_app and "returnIssue'" not in lord_app)
check('LORD issue action precedes clean return in the shared action row',lord_app.find('id="returnIssueBtn"') < lord_app.find('id="submitReturnBtn"') and 'action-grid return-actions' in lord_app)
check('LORD issue text becomes mandatory when issue active','issueActive && !state.return.issueNotes.trim()' in lord_app)
check('LORD quantity mismatch automatically activates issue state','returnIssueActive()' in lord_app and 'returnQuantityMismatchReasons()' in lord_app and 'LORD will record this as a return with issue.' in lord_app)
check('LORD clean and issue returns are explicit actions','submitReturn(false)' in lord_app and 'submitReturn(true)' in lord_app)
check('LORD clean action cannot bypass quantity discrepancies',"withIssues === false && returnQuantityMismatchReasons().length" in lord_app)
check('LORD Return accessories shown only if actually collected','Number(s.stylusQuantity) > 0' in lord_app and 'Number(s.headphoneQuantity) > 0' in lord_app)
check('LORD Return accessory quantities pre-filled from Collection','state.return.stylusQuantity = Number(payload.session.stylusQuantity)' in lord_app and 'state.return.headphoneQuantity = Number(payload.session.headphoneQuantity)' in lord_app)
check('LORD transaction reads tolerate slow backend','TRANSACTION_READ_TIMEOUT_MS = 45000' in lord_worker)
check('LORD booking writes exceed backend lock window','BOOKING_WRITE_TIMEOUT_MS = 90000' in lord_worker and 'booking: 105000' in lord_app)
check('LORD evidence writes allow Drive staging','EVIDENCE_WRITE_TIMEOUT_MS = 180000' in lord_worker and 'evidence: 195000' in lord_app)
check('LORD browser retains stable write idempotency','await stableClientRequestId(payload)' in lord_app and "crypto.subtle.digest('SHA-256'" in lord_app and 'localStorage.setItem(key,JSON.stringify({id' in lord_app)

# OVERLORD resilience must survive v1 formalisation.
ov_worker=(ROOT/'Source/overlord/_worker.js').read_text()
ov_app=(ROOT/'Source/overlord/assets/app.js').read_text()
ov_index=(ROOT/'Source/overlord/index.html').read_text()
check('OVERLORD title matches the installation manifest',f"<title>OVERLORD v{release['overlordFrontend']}</title>" in ov_index)
check('OVERLORD Worker validates upstream JSON','async function backendJson' in ov_worker and 'looksLikeHtml' in ov_worker and 'UPSTREAM_HTML' in ov_worker)
check('OVERLORD Worker delegates retries to browser','retries: 1' not in ov_worker and 'for (let attempt' not in ov_worker and 'RETRYABLE_UPSTREAM_STATUS' in ov_worker)
check('OVERLORD Reference edge cache uses v1.3 fresh/stale key','overlord-reference-cache.local/v1.3' in ov_worker and 'REFERENCE_STALE_SECONDS' in ov_worker and "'edge-stale'" in ov_worker)
check('OVERLORD browser has one shared fetch site',ov_app.count('await fetch(')==1,str(ov_app.count('await fetch(')))
check('OVERLORD browser does not blindly call response.json','.json()' not in ov_app)
check('OVERLORD HTML-vs-JSON protection retained','v1LooksHtml' in ov_app and 'HTML_INSTEAD_OF_JSON' in ov_app)
check('OVERLORD bounded retry/backoff retained','apiJsonV1' in ov_app and 'V1_RETRYABLE_STATUS' in ov_app and 'v1Sleep' in ov_app)
check('OVERLORD preserves last-loaded schedule','Live refresh delayed · showing last loaded schedule' in ov_app)
check('OVERLORD Booking Editor last-good fallback retained','Live booking refresh is delayed. Showing the last available booking details' in ov_app and 'v1BookingCacheKey' in ov_app)

st_index=(ROOT/'Source/starlord/index.html').read_text()
check('STARLORD title matches the installation manifest',f"<title>STARLORD v{release['starlordFrontend']} ·" in st_index)

# LORD v1.3 reliability/authentication refactor
check('LORD session lifetime extended to 14 days','const SESSION_SECONDS = 14 * 24 * 60 * 60;' in lord_worker)
check('LORD session has rolling renewal threshold','SESSION_REFRESH_THRESHOLD_SECONDS = 7 * 24 * 60 * 60' in lord_worker and 'sessionNeedsRefresh(session)' in lord_worker)
check('LORD session endpoint renews cookie without Google login',"'Set-Cookie': await makeSessionCookie(publicSession(session), env)" in lord_worker)
check('LORD startup checks existing session before Google auth config',lord_app.find("lordAuthRequest('/api/auth/session')") < lord_app.find("lordAuthRequest('/api/auth/config')"))
check('LORD Google sign-in callback is single-flight','state.auth.signInInFlight' in lord_app and "if (state.auth.signInInFlight) return;" in lord_app)
check('LORD Google sign-in gives in-flight click suppression',"signInHost.style.pointerEvents='none'" in lord_app)
check('LORD verified GSPS login is not hard-dependent on Apps Script identity lookup','Do not make a temporary Sheets/Apps Script delay prevent that user from entering LORD.' in lord_worker)
check('LORD sign-in retains 8s fallback; explicit role recovery allows 20s',"{ redirect: 'follow' }, strict ? 20000 : 8000" in lord_worker)
check('LORD JWKS uses explicit edge cache','lord-auth-cache.local/google-jwks' in lord_worker and 'JWKS_STALE_SECONDS' in lord_worker)
check('LORD reference uses fresh plus stale edge cache','lord-reference-cache.local/v1.3' in lord_worker and "'edge-stale'" in lord_worker and 'REFERENCE_STALE_SECONDS' in lord_worker)
check('LORD reference backend timeout no longer 12 seconds','proxyReference' in lord_worker and '}, 45000)' in lord_worker)
check('LORD browser has local last-good reference cache',"referenceCache: 'lord_reference_cache_v1_3'" in lord_app and 'readReferenceCache' in lord_app and 'writeReferenceCache' in lord_app)
check('LORD returning user can enter from local reference cache','loadAuthenticatedReference({ preferCache: true })' in lord_app and 'refreshReferenceInBackground()' in lord_app)
check('LORD reference avoids layered browser retries','timeoutMs: 55000, getRetries: 0' in lord_app)
check('LORD layout CSS preserves the approved return action row', hashlib.sha256((ROOT/'Source/lord/assets/styles.css').read_text().split('/* v1.3 reload controls */')[0].replace('v1.3','v1.2').strip().encode()).hexdigest()=='e1430cb63add670ac47db2c98d85dc710c9b1b3a01d12909084f7c80accef2fa')


# OVERLORD v1.3 parity with LORD v1.3 reliability principles
check('OVERLORD session lifetime extended to 14 days','const SESSION_SECONDS = 14 * 24 * 60 * 60;' in ov_worker)
check('OVERLORD session has rolling renewal threshold','SESSION_REFRESH_THRESHOLD_SECONDS = 7 * 24 * 60 * 60' in ov_worker and 'sessionNeedsRefresh(session)' in ov_worker)
check('OVERLORD sliding renewal revalidates administrator before extending','cachedIdentity(session.email, session.sub, env)' in ov_worker and "headers['Set-Cookie'] = await makeSessionCookie(publicIdentity, env)" in ov_worker)
check('OVERLORD transient admin revalidation failure does not eject valid session','A transient identity-service delay must not eject an already-valid administrator.' in ov_worker)
boot_overlord=re.search(r'async function bootOverlord\(\)\{.*?\n\}',ov_app,re.S).group(0)
check('OVERLORD startup checks existing session before Google auth config',"overlordAuthJson('/api/auth/session')" in boot_overlord and "overlordAuthJson('/api/auth/config')" not in boot_overlord)
check('OVERLORD Google sign-in is single-flight','overlordAuthState.signInInFlight' in ov_app and 'if(overlordAuthState.signInInFlight)return;' in ov_app)
check('OVERLORD sign-in suppresses repeat clicks while verification runs',"host.style.pointerEvents='none'" in ov_app)
check('OVERLORD does not automatically retry browser POST login requests',"retries:method==='GET'?1:0" in ov_app)
check('OVERLORD Google library loader is single-instance','overlordAuthState.googleLibraryPromise' in ov_app and 'data-overlord-gsi' in ov_app)
check('OVERLORD Google verification keys use explicit last-good edge cache','overlord-auth-cache.local/google-jwks-v1.3' in ov_worker and 'JWKS_STALE_SECONDS' in ov_worker)
check('OVERLORD administrator identity cache is fresh plus stale','overlord-identity-cache.local/' in ov_worker and 'IDENTITY_FRESH_SECONDS' in ov_worker and 'IDENTITY_STALE_SECONDS' in ov_worker)
check('OVERLORD stale identity fallback never promotes non-admin','if (identity && identity.isAdmin) return identity;' in ov_worker)
check('OVERLORD cold admin lookup makes one bounded request',"timeoutMs: 30000, label: 'Administrator identity service'" in ov_worker)
check('OVERLORD reference browser cache persists across browser restarts','localStorage.getItem(key)' in ov_app and 'localStorage.setItem(key' in ov_app and "OVERLORD_V1_3_REFERENCE" in ov_app)
check('OVERLORD reference browser cache has background refresh','refreshReferenceV11' in ov_app and 'setTimeout(()=>refreshReferenceV11().catch(()=>{}),0)' in ov_app)
check('OVERLORD reference browser cache has seven-day last-good fallback','V1_REFERENCE_STALE_MS=7*24*60*60*1000' in ov_app)
check('OVERLORD immediately labels and shows a saved dashboard within the existing 24-hour limit','V11_DASHBOARD_STALE_MS=24*60*60*1000' in ov_app and 'v11DashboardCacheKey(els.date.value),V11_DASHBOARD_STALE_MS' in ov_app and 'Saved schedule from' in ov_app)
check('OVERLORD retains one-day last-good dashboard on cold live failure','V11_DASHBOARD_STALE_MS=24*60*60*1000' in ov_app and 'showing last-good schedule' in ov_app)
check('OVERLORD dashboard reads have 45-second upstream ceiling',"timeoutMs: method === 'GET' ? 45000 : 60000" in ov_worker)
# Scope the visual preservation contract to unaffected interaction surfaces.
# A whole-file hash incorrectly rejected the approved v0.9.7 notice/settings fix.
ov_css=(ROOT/'Source/overlord/assets/styles.css').read_text()
ov_css_baseline=(ROOT/'tests/baselines/v1.5/Source/overlord/assets/styles.css').read_text()
for selector in ['.timeline-header,.resource-row', '.bar-layer', '.booking-row .bar', '.detail-actions', '.return-issue-banner', '.operation-overlay']:
    declaration=re.compile(re.escape(selector)+r'\{([^{}]*)\}')
    prior=declaration.findall(ov_css_baseline)
    current=declaration.findall(ov_css)
    check('OVERLORD preserves approved timetable/action styling: '+selector, bool(prior) and current==prior)


def strip_css_comments(data):
    return re.sub(rb'/\\*.*?\\*/',b'',data,flags=re.S)
check('STARLORD layout CSS preserves the approved return action row', hashlib.sha256((ROOT/'Source/starlord/assets/styles.css').read_text().split('/* v1.3 reload controls */')[0].replace('v1.3','v1.2').strip().encode()).hexdigest()=='257fe21af81b5ba34b4241f4e5944f5ec4bf334cf72f5e89b9387966883128f5')
check('STARLORD MacBook artwork routing present', "assets/device-mbn.webp" in (ROOT/'Source/starlord/assets/app.js').read_text() and (ROOT/'Source/starlord/assets/device-mbn.webp').is_file())
check('STARLORD forced reload bypasses CDN caching', "cacheEverything:false" in (ROOT/'Source/starlord/_worker.js').read_text() and "forceRefresh?'no-store'" in (ROOT/'Source/starlord/_worker.js').read_text())

failed=[c for c in checks if not c['ok']]
result={'passed':len(checks)-len(failed),'failed':len(failed),'total':len(checks),'checks':checks}
(ROOT/'tests/static_results.json').write_text(json.dumps(result,indent=2))
print(json.dumps({k:v for k,v in result.items() if k!='checks'},indent=2))
for item in failed: print(json.dumps(item))
sys.exit(1 if failed else 0)
