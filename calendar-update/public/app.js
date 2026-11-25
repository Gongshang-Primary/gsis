(() => {
  'use strict';

  const FRONTEND_VERSION = '0.9.9';
  const PAGE_STORAGE_KEY = 'gspsCalPage';
  const LANDING_VERSION_KEY = 'gspsCalLandingVersion';
  const PUBLICATION_REQUESTS_KEY = 'gspsCalPublicationRequests';

  // RC1.0 promotes Weekly View to the default landing page. The version marker
  // moves existing sessions to Weekly once on upgrade; after that, navigation
  // within the same browser session is remembered normally.
  const sessionGet=key=>{try{return sessionStorage.getItem(key);}catch{return null;}};
  const sessionSet=(key,value)=>{try{sessionStorage.setItem(key,value);}catch{}};
  let storedPage = sessionGet(PAGE_STORAGE_KEY) || '';
  const landingVersion = sessionGet(LANDING_VERSION_KEY) || '';

  if (landingVersion !== FRONTEND_VERSION) {
    storedPage = 'weekly';
    sessionSet(PAGE_STORAGE_KEY, storedPage);
    sessionSet(LANDING_VERSION_KEY, FRONTEND_VERSION);
  }

  if (!storedPage || storedPage === 'migration') {
    storedPage = 'weekly';
  }

  const state = {
    data: null,
    page: storedPage,
    year: null,
    googleClientId: '',
    frontendVersion: FRONTEND_VERSION,
    allowNavigationOnce: false
  };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindStaticEvents();
    showBootStatus('Checking your GSPS session…');

    try {
      const cfg = await fetchJson('/api/client-config');
      state.googleClientId = cfg.googleClientId || '';
      state.calendarJobsEnabled = cfg.calendarJobsEnabled === true;
      state.calendarChangePushEnabled = cfg.calendarChangePushEnabled === true;
    } catch (err) {
      showLoginError(err.message);
    }

    try {
      showBootStatus('Loading calendar data…');
      await loadBootstrap(undefined, false);
      showApp();
    } catch (err) {
      showLogin();
      if (err.status === 401) {
        showSignInPrompt();
        initGoogleButton();
      } else {
        showLoginError(err.message);
        showSignInPrompt();
        initGoogleButton();
      }
    }
  }

  function trackCalendarHeaderHeight() {
    if (state.headerResizeTracking) return;
    const header = document.querySelector('.topbar');
    if (!header) return;
    state.headerResizeTracking = true;
    const measure = () => {
      const height = Math.ceil(header.getBoundingClientRect().height);
      if (height) document.documentElement.style.setProperty('--calendar-header-height', `${height}px`);
    };
    measure();
    if (typeof ResizeObserver === 'function') {
      state.headerResizeObserver = new ResizeObserver(measure);
      state.headerResizeObserver.observe(header);
    } else {
      window.addEventListener('resize', measure, {passive: true});
    }
  }

  function bindStaticEvents() {
    trackCalendarHeaderHeight();
    $('logoutBtn').addEventListener('click', () => {
      if (state.calendarOperation) return;
      if (!confirmUnsavedChanges('sign out')) return;
      logout();
    });

    $('publishVersionBtn').addEventListener('click', publishVersion);
    $('pullBirthdaysBtn').addEventListener('click', pullBirthdays);
    $('syncStaffBtn').addEventListener('click', () => syncYear('staff'));
    $('syncParentBtn').addEventListener('click', () => syncYear('parent'));
    $('stopSyncWaiting')?.addEventListener('click', stopCalendarSyncWaiting);

    const markFormDirty = ev => {
      const form = ev.target?.closest?.('form');

      if (
        form &&
        form.dataset.noDirtyTracking !== '1'
      ) {
        form.dataset.dirty = '1';
      }
    };

    document.addEventListener(
      'input',
      markFormDirty,
      true
    );

    document.addEventListener(
      'change',
      markFormDirty,
      true
    );

    $('yearSelect').addEventListener('change', async e => {
      if (state.calendarOperation) { renderYearSelect(); return; }
      const year=Number(e.currentTarget.value||0);
      if(!year || (year===state.year && !state.loadingYear))return;
      if(!confirmUnsavedChanges('change calendar year')){renderYearSelect();return;}
      if(state.pendingMutation){renderYearSelect();toast('Resolve the pending save before switching years.',true);return;}
      closeModal(true);
      try {await loadBootstrap(year,true,{yearSwitch:true});} catch(err){toast(err.message,true);}
    });
    bindRC17StaticEvents();

    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.addEventListener('click', () => setPage(btn.dataset.page));
    });
  }

  function initGoogleButton() {
    if (!state.googleClientId) {
      showLoginError('GOOGLE_CLIENT_ID has not been configured in Cloudflare.');
      return;
    }

    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        google.accounts.id.initialize({
          client_id: state.googleClientId,
          callback: onGoogleCredential
        });
        google.accounts.id.renderButton($('googleButton'), {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 320
        });
      } else if (attempts > 40) {
        clearInterval(timer);
        showLoginError('Google sign-in could not be loaded.');
      }
    }, 150);
  }

  async function onGoogleCredential(response) {
    clearCalendarOwnerState();
    try {
      showBootStatus('Signing in…');
      $('signInPrompt').classList.add('hidden');
      await fetchJson('/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });
      await loadBootstrap(undefined, false);
      showApp();
    } catch (err) {
      showLoginError(err.message);
    }
  }

  async function logout() {
    clearCalendarOwnerState();
    state.data=null;showLogin();
    try { await fetchJson('/auth/logout', { method: 'POST' }); } catch {}
    state.data = null; state.calendarJobs = []; clearTimeout(state.calendarJobsTimer); $('calendarJobsPanel')?.remove(); yearCache.clear(); viewMemory.clear(); bootstrapSequence++;
    showLogin();
    showSignInPrompt();
    initGoogleButton();
  }

  function loadBootstrap(year, render = true, options = {}) {
    const requested = Number(year || 0);
    if (bootstrapFlight?.year === requested && bootstrapFlight.sequence === bootstrapSequence) return bootstrapFlight.promise;
    const flight = {year:requested, sequence:bootstrapSequence + 1};
    bootstrapFlight = flight;
    flight.promise = loadBootstrapSnapshot(year, render, options).finally(() => {
      if (bootstrapFlight === flight) bootstrapFlight = null;
    });
    return flight.promise;
  }

  async function loadBootstrapSnapshot(year, render = true, options = {}) {
    cancelSourceReadRetry();
    const sequence=++bootstrapSequence;
    clearYearLoadingOverlay();
    const requested=Number(year||0);
    rememberView();
    const previous={data:state.data,year:state.year,readOnly:state.readOnly};
    // Superseded requests may have installed a read-only cache or temporarily
    // disabled editing. Keep the original verified fallback across the chain.
    if(options.yearSwitch && previous.data && !state.yearSwitchFallback)state.yearSwitchFallback=previous;
    const fallback=options.yearSwitch?(state.yearSwitchFallback||previous):previous;
    const sameYear=!!previous.data && requested===Number(previous.year);
    const beforeSnapshot=sameYear?JSON.stringify(previous.data):'';
    state.retryYear=null;
    state.loadingYear=requested || true; state.readOnly=sameYear?previous.readOnly:true; state.refreshFailed=false;
    state.freshnessMessage=options.refresh?'Refreshing…':`Loading ${requested || 'calendar'}…`;
    const cached=requested ? yearCache.get(requested) : null;
    if(options.yearSwitch && render && previous.data && !sameYear && !cached){
      state.yearLoadingTimer=setTimeout(()=>{
        if(sequence!==bootstrapSequence)return;
        $('yearLoadingTitle').textContent=`Loading ${requested} calendar…`;
        $('yearLoadingOverlay').classList.remove('hidden');
      },300);
    }
    if(cached && render && !sameYear){
      state.freshnessMessage='Refreshing… Previously loaded data is read-only.';
      installBootstrap(cached,true,true);
    } else if(state.data && !sameYear) renderYearSelect();
    updateFreshnessUI();
    try {
      const response=await fetchJson(requested?`/api/bootstrap?year=${requested}`:'/api/bootstrap',{timeoutMs:45000});
      if(sequence!==bootstrapSequence)return false;
      const payload=response && response.result && typeof response.result==='object'?response.result:response;
      const actual=validateBootstrap(payload,requested);
      const oldActor=state.data?.actor;
      const sameActor=!!oldActor && JSON.stringify(oldActor)===JSON.stringify(payload.actor);
      if(oldActor && !sameActor){yearCache.clear();clearCalendarOwnerState();}
      for(const key of yearCache.keys())if(!payload.years.some(y=>Number(y.Year)===key))yearCache.delete(key);
      // A response started before a draft or local save must never overwrite it.
      // Discard this snapshot and read again once the interaction has finished.
      if(sameYear && sameActor && (snapshotInteractionBusy() || JSON.stringify(state.data)!==beforeSnapshot)){
        state.readOnly=previous.readOnly;state.refreshDeferred=true;
        state.freshnessMessage='Updates will appear after you finish editing.';
        return true;
      }
      if(Number(state.year)===actual && render)rememberView();
      if(sameYear && sameActor && render)installCalendarSnapshotInPlace(payload);
      else installBootstrap(payload,render,false);
      yearCache.set(actual,payload);
      state.refreshFailed=false; state.freshnessMessage='';
      if(!render)showBootStatus('Rendering calendar…');
      return true;
    } catch(err) {
      if(sequence!==bootstrapSequence)return false;
      state.refreshFailed=true;state.retryYear=requested || state.year;
      if(err.status===401){clearCalendarOwnerState();yearCache.clear();viewMemory.clear();state.data=null;showLogin();showSignInPrompt();initGoogleButton();}
      else if(cached && err.status===403){
        yearCache.delete(requested);
        if(fallback.data && Number(fallback.year)!==requested)installBootstrap(fallback.data,render,options.yearSwitch?fallback.readOnly:true);
        else {state.data=null;showLogin();showLoginError(err.message);}
        state.freshnessMessage=options.yearSwitch?'That year is not available. The previous calendar is retained.':'Access could not be verified. Refresh before editing.';
      } else if(options.yearSwitch && fallback.data){
        if(state.data!==fallback.data)installBootstrap(fallback.data,render,fallback.readOnly);
        state.readOnly=fallback.readOnly;
        state.freshnessMessage=`Could not load ${requested}. The previous calendar is retained.`;
        renderYearSelect();
      } else {
        state.readOnly=true;
        state.freshnessMessage=cached || options.refresh?'Previously loaded data—refresh failed':`Could not load ${requested}. The previous calendar is retained read-only.`;
        if(state.data)renderYearSelect();
      }
      throw err;
    } finally {
      if(sequence===bootstrapSequence){clearYearLoadingOverlay();state.yearSwitchFallback=null;state.loadingYear=null;updateFreshnessUI();drainDeferredRefresh();}
    }
  }

  async function api(action, payload = {}) {
    const isRead=['eventEditAuthor','calendarPreflight','healthCheck','calendarReconciliationPreview','runSelfTests','calendarWipePreview','archiveYearsPreview','eventMutationStatus','calendarSyncStatus','mutationReceipts'].includes(action);
    const duringPublication = ['publishVersion','startSyncYear','syncYearBatch','pullBirthdays'].includes(action);
    if(!isRead && !isCalendarEditable(duringPublication))throw new Error('Refresh verification, publication, sync or save recovery must finish before editing.');
    if(EVENT_MUTATIONS.has(action) && pendingEventJob(action==='saveEvent'?payload.event?.EventID:payload.eventId))throw new Error('This event has an unresolved Calendar job. Check its exact receipt before editing it again.');
    if(duringPublication && hasPendingCalendarJobs())throw new Error('Finish queued event changes before publishing or syncing this calendar.');
    return EVENT_MUTATIONS.has(action)?reliableEventApi(action,payload):rawApi(action,payload,['startSyncYear','syncYearBatch'].includes(action)?90000:45000);
  }

  async function fetchJson(url, options = {}) {
    const {timeoutMs=45000,...fetchOptions}=options;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const res=await fetch(url,{...fetchOptions,signal:controller.signal,cache:'no-store'});
      let data;
      try{data=await res.json();}catch(err){const bad=new Error('The server response was not valid JSON.');Object.assign(bad,{status:res.status,code:'RESPONSE_UNREADABLE',definite:false});throw bad;}
      if(!res.ok || data?.ok===false){
        const err=new Error(data?.error || `Request failed (${res.status})`);
        Object.assign(err,{status:res.status,code:data?.code,current:data?.current,definite:data?.definite===true,retryAfterMs:Number(data?.retryAfterMs)||0});throw err;
      }
      if(!data || typeof data!=='object')throw new Error('The server response was incomplete.');
      return data;
    } catch(err){if(err.name==='AbortError')throw Object.assign(new Error('The request timed out. Its outcome is not yet confirmed.'),{code:'REQUEST_TIMEOUT',definite:false});throw err;}
    finally{clearTimeout(timer);}
  }

  function showLogin() {
    $('loginView').classList.remove('hidden');
    $('appView').classList.add('hidden');
  }

  function showBootStatus(text) {
    $('bootStatus').classList.remove('hidden');
    $('bootStatusText').textContent = text || 'Loading…';
    $('signInPrompt').classList.add('hidden');
  }

  function showSignInPrompt() {
    $('bootStatus').classList.add('hidden');
    $('signInPrompt').classList.remove('hidden');
  }

  function showApp() {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    renderAll();
  }

  function renderAll() {
    if (!state.data) return;
    const actor = state.data.actor;

    document.querySelectorAll('.admin-only').forEach(el =>
      el.classList.toggle('hidden', !actor.isAdmin)
    );
    document.querySelectorAll('.privileged-parent').forEach(el => {
      el.classList.toggle('hidden', !(actor.isAdmin || actor.isParentPublisher));
    });

    $('identity').textContent =
      displayAlias(actor.userAlias) +
      (actor.isAdmin ? ' · Admin' : actor.isParentPublisher ? ' · Parent Publisher' : ' · Teacher');

    renderYearSelect();
    renderDirtyPill();
    activatePage(state.page);
    renderPage(state.page);
    updateFreshnessUI();
    renderCalendarJobs();
  }

  function mutationCurrentHtml(event) {
    if(!event)return '<p>The event is no longer available in this view. Refresh before redoing the change.</p>';
    const fields=['StaffTitle','StartDate','EndDate','StartTime','EndTime','LaneID','Status','StaffDescription','ParentTitle','ParentDescription'];
    return `<dl>${fields.filter(k=>event[k]).map(k=>`<dt>${esc(k)}</dt><dd>${esc(event[k])}</dd>`).join('')}</dl>`;
  }
  function renderMutationFailures() {
    $('mutationFailureNotices')?.remove();
    const failures=state.data?.mutationFailures||[];if(!failures.length)return;
    const box=document.createElement('div');box.id='mutationFailureNotices';box.className='notice';
    box.innerHTML=failures.map(row=>`<details><summary>${esc(row.message)}</summary><p>Current saved content</p>${mutationCurrentHtml(row.current)}</details>`).join('');
    $('page-'+state.page)?.prepend(box);
  }
  function renderPage(page) {
    switch (page) {
      case 'events': renderCalendar(); break;
      case 'weekly': renderWeeklyView(); break;
      case 'stats': renderStats(); break;
      case 'parent': renderParentPublishing(); break;
      case 'yearSetup': renderYearSetup(); break;
      case 'columns': renderColumns(); break;
      case 'glossary': renderGlossary(); break;
      case 'formatting': renderFormatting(); break;
      case 'people': renderPeople(); break;
      case 'urls': renderUrls(); break;
      default:
        state.page = 'weekly';
        renderWeeklyView();
        break;
    }
    renderMutationFailures();
  }

  function activatePage(page) {
    const calendarPage=['events','weekly'].includes(page);
    document.documentElement.classList.toggle('calendar-layout',calendarPage);
    document.body.classList.toggle('calendar-layout',calendarPage);
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));

    const target = $(`page-${page}`);
    if (target) target.classList.add('active');
    const btn = document.querySelector(`.nav-button[data-page="${page}"]`);
    if (btn) btn.classList.add('active');
  }

  function renderYearSelect() {
    const years = state.data.years || [];
    const sel = $('yearSelect');
    sel.innerHTML = '';

    if (!years.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No released year';
      sel.appendChild(opt);
      sel.disabled = true;
      return;
    }

    sel.disabled = !!state.calendarOperation;
    years
      .slice()
      .sort((a, b) => Number(b.Year) - Number(a.Year))
      .forEach(y => {
        const opt = document.createElement('option');
        opt.value = y.Year;
        opt.textContent = `${y.Year}${yes(y.ReleasedToTeachers) ? '' : ' · Planning'}`;
        sel.appendChild(opt);
      });

    if (state.year && years.some(y => Number(y.Year) === state.year)) {
      sel.value = String(state.year);
    } else {
      sel.value = '';
    }
  }

  function canonicalSyncState(value) {
    const v = String(value || '').trim().toUpperCase();
    if (v === 'DIRTY') return 'PENDING_SYNC';
    if (v === 'DELETE_PENDING') return 'PENDING_REMOVAL';
    return v;
  }

  function syncStateNeedsWork(value) {
    const v = canonicalSyncState(value);
    return ['PENDING_SYNC', 'PENDING_REMOVAL', 'ERROR'].includes(v);
  }

  function syncStateLabel(value) {
    const v = canonicalSyncState(value);
    if (v === 'PENDING_SYNC') return 'Awaiting sync';
    if (v === 'PENDING_REMOVAL') return 'Removal pending';
    if (v === 'SYNCED') return 'Synced';
    if (v === 'ERROR') return 'Sync error';
    return v || 'Not synced';
  }

  function renderDirtyPill() {
    const events =
      state.data.events || [];

    const laneMap = {};

    (state.data.lanes || [])
      .forEach(lane => {
        laneMap[
          String(lane.LaneID || '')
        ] = lane;
      });

    let staffActionable = 0;
    let staffHeld = 0;

    events.forEach(e => {
      const linked = e._staffCalendarLinked ||
        !!String(
          e.StaffCalendarEventId || ''
        ).trim();

      const lane =
        laneMap[
          String(e.LaneID || '')
        ] || {};

      const desired =
        !e.DeletedAt &&
        String(
          e.Status || ''
        ).toUpperCase() === 'PUBLISHED' &&
        yes(
          lane.SyncToStaffCalendar
        );

      const pending = syncStateNeedsWork(e.StaffSyncState);
      if ((pending && (linked || desired)) || (desired && !linked)) {
        staffActionable++;
      } else if (pending) {
        staffHeld++;
      }
    });

    staffActionable += (state.data.pendingRemovals || []).filter(r => r.staff).length;
    const parentPending =
      events.filter(e =>
        syncStateNeedsWork(
          e.ParentSyncState
        ) &&
        (
          yes(e.ParentEnabled) || e._parentCalendarLinked ||
          !!String(
            e.ParentCalendarEventId || ''
          ).trim()
        )
      ).length + (state.data.pendingRemovals || []).filter(r => r.parent).length;

    const pill = $('dirtyPill');
    const publishBtn = $('publishVersionBtn');
    const staffBtn = $('syncStaffBtn');
    const birthdaysBtn = $('pullBirthdaysBtn');
    birthdaysBtn.classList.toggle('hidden', !state.data.actor.isAdmin);
    $('birthdayActions').classList.toggle('hidden', !state.data.actor.isAdmin);
    if (!state.data.actor.isAdmin) $('birthdayPullStatus').classList.add('hidden');
    birthdaysBtn.disabled = !state.year || !!state.readOnly || !!state.pendingMutation || !!state.calendarOperation || hasPendingCalendarJobs();
    const parentBtn = $('syncParentBtn');
    const parts = [];

    if (staffActionable) {
      parts.push(
        `Staff: ${staffActionable} awaiting sync`
      );
    }

    if (staffHeld) {
      parts.push(
        `Staff: ${staffHeld} held from Calendar`
      );
    }

    if (parentPending) {
      parts.push(
        `Parent: ${parentPending} awaiting sync`
      );
    }

    const jobs=state.calendarJobs||[];
    const review=jobs.some(job=>['NEEDS_ATTENTION','CAPTURE_UNKNOWN'].includes(job.state));
    const checking=jobs.some(job=>job.state==='CHECKING');
    const saving=jobs.some(job=>['QUEUED','RUNNING'].includes(job.state));
    const summary=review?'A change needs your attention':state.calendarJobsError?'Save status could not be checked':
      checking?'Checking your save':saving?'Saving in background':state.calendarOperation?.syncTarget?'Syncing in background':
      jobs.length && !parts.length?'Changes saved':'';
    const showDetails=!!jobs.length || !!state.calendarJobsError;
    const text=[summary,...parts].filter(Boolean).join(' · ');
    pill.classList.toggle('hidden',!text && !showDetails);
    let label=pill.querySelector('span');
    if(!label){label=document.createElement('span');label.setAttribute('role','status');pill.replaceChildren(label);}
    label.textContent=text;
    let details=pill.querySelector('button');
    if(showDetails && !details){details=document.createElement('button');details.type='button';details.className='calendar-status-details';details.setAttribute('aria-controls','calendarJobsPanel');pill.appendChild(details);}
    if(!showDetails){details?.remove();details=null;}
    if(details){details.textContent=review?'Review saves':'Details';details.setAttribute('aria-expanded',String(!!state.calendarJobsExpanded));}
    if(details)details.onclick=()=>{state.calendarJobsExpanded=!state.calendarJobsExpanded;renderCalendarJobs();renderDirtyPill();};

    if (state.data.actor.isAdmin) {
      const busy = !!state.readOnly || !!state.pendingMutation || !!state.calendarOperation || hasPendingCalendarJobs();
      publishBtn.classList.remove('hidden');
      staffBtn.classList.remove('hidden');
      parentBtn.classList.remove('hidden');
      publishBtn.disabled = !state.year || busy;
      staffBtn.disabled =
        busy ||
        !state.year ||
        staffActionable === 0;
      parentBtn.disabled =
        busy ||
        !state.year ||
        parentPending === 0;
    } else {
      publishBtn.classList.add('hidden');
      staffBtn.classList.add('hidden');
      parentBtn.classList.add('hidden');
    }
  }

  function setPage(page, preserve = false) {
    if (state.calendarOperation) return;
    if(state.pendingMutation){toast('Resolve the pending save before changing pages.',true);return;}
    rememberView();
    if (
      page !== state.page &&
      !confirmUnsavedChanges('leave this page')
    ) {
      return;
    }

    if (state.page === 'formatting' &&
        page !== 'formatting' &&
        state.formattingOrderDirty) {
      const leave = confirm(
        'Formatting priority has unsaved changes. Leave without saving?'
      );
      if (!leave) return;
      state.formattingOrderDirty = false;
    }
    const adminOnlyPages = ['yearSetup', 'columns', 'formatting', 'urls'];
    if (adminOnlyPages.includes(page) && state.data && !state.data.actor?.isAdmin) {
      page = 'weekly';
      preserve = false;
    }
    if (page === 'parent' && state.data &&
        !(state.data.actor?.isAdmin || state.data.actor?.isParentPublisher)) {
      page = 'weekly';
      preserve = false;
    }

    state.page = page;
    if (!preserve) {
      sessionSet(PAGE_STORAGE_KEY, page);
    }

    activatePage(page);
    renderPage(page);
    restoreRememberedView();
    updateFreshnessUI();
  }

  const EVENT_META_HEADERS = Object.freeze({
    date: 'Date',
    term: 'Term',
    week: 'Week',
    dow: 'Day'
  });

  function headerFitEventColumnWidth(key) {
    const label = EVENT_META_HEADERS[key];
    if (!label) return 0;

    // Match .cal-head: 700 / 11px Arial, with room for cell padding and the
    // resize handle. This deliberately lets date values wrap below the header.
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = '700 11px Arial';
      return Math.max(
        40,
        Math.ceil(ctx.measureText(label).width) + 20
      );
    } catch {
      return {
        date: 46,
        term: 46,
        week: 48,
        dow: 42
      }[key] || 45;
    }
  }

  function defaultEventColumnWidth(key) {
    // Keep the full date readable in two lines, not three, at default density.
    if (key === 'date') return 64;
    if (Object.prototype.hasOwnProperty.call(EVENT_META_HEADERS, key)) {
      return headerFitEventColumnWidth(key);
    }

    if (key === 'planning') return 114;
    return 125;
  }

  function getEventColumnWidths(keys) {
    const widthKey = 'gspsCalEventColumnWidths';
    const widthVersionKey = 'gspsCalEventColumnWidthsVersion';

    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(widthKey) || '{}');
    } catch {}

    // Existing users may have RC0.x widths persisted. On first RC1.0 load,
    // reset only Date / Term / Week / Day to their header-fit widths. Preserve
    // Planning Notes and all event-lane custom widths.
    if (localStorage.getItem(widthVersionKey) !== FRONTEND_VERSION) {
      Object.keys(EVENT_META_HEADERS).forEach(k => delete saved[k]);

      try {
        localStorage.setItem(widthKey, JSON.stringify(saved));
        localStorage.setItem(widthVersionKey, FRONTEND_VERSION);
      } catch {}
    }

    const out = {};

    keys.forEach(k => {
      const n = Number(saved[k]);

      out[k] =
        Number.isFinite(n)
          ? Math.max(40, Math.min(520, n))
          : defaultEventColumnWidth(k);
    });

    return out;
  }

  function resizeableHead(label, key) {
    return `<div class="cal-head resizable-head" data-col-key="${esc(key)}"><span>${esc(label)}</span><span class="col-resizer" data-resize-key="${esc(key)}"></span></div>`;
  }

  function bindEventColumnResizers(host, keys) {
    const grid = host.querySelector('.resizable-calendar');
    if (!grid) return;
    const widths = getEventColumnWidths(keys);

    host.querySelectorAll('.col-resizer').forEach(handle => {
      handle.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();
        const key = handle.dataset.resizeKey;
        const startX = e.clientX;
        const startWidth = widths[key];
        document.body.classList.add('column-resizing');

        const move = ev => {
          widths[key] = Math.max(40, Math.min(520, startWidth + ev.clientX - startX));
          grid.style.setProperty('--event-grid-columns', keys.map(k => `${Math.round(widths[k])}px`).join(' '));
        };
        const up = () => {
          document.removeEventListener('pointermove', move);
          document.removeEventListener('pointerup', up);
          document.body.classList.remove('column-resizing');
          try { localStorage.setItem('gspsCalEventColumnWidths', JSON.stringify(widths)); } catch {}
        };
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', up);
      });
    });
  }

  /* =========================
   * CALENDAR
   * ========================= */

  const todayJumpedViews=new Set();
  let todayJumpGeneration=0;
  function cancelTodayJump(){todayJumpGeneration++;}
  function jumpViewToTodayOnce(viewName, host) {
    const key=`gspsCalTodayJump:${viewName}`;
    if(Number(sgToday().slice(0,4))!==Number(state.year)||todayJumpedViews.has(viewName))return;
    todayJumpedViews.add(viewName);
    if(sessionGet(key)==='1')return;
    sessionSet(key,'1');
    const generation=todayJumpGeneration,year=state.year;
    const wrap=host.querySelector(viewName==='weekly'?'.weekly-wrap':'.calendar-wrap');
    wrap?.addEventListener('scroll',cancelTodayJump,{passive:true,once:true});
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
      if(generation!==todayJumpGeneration||year!==state.year||!wrap?.isConnected)return;
      const target=viewName==='weekly'?host.querySelector('.week-day.today')?.closest('tr'):host.querySelector('.cal-row.today');
      if(!target)return;
      const offset=Math.min(90,Math.max(30,wrap.clientHeight*.12));
      wrap.scrollTop=Math.max(0,target.offsetTop-offset);wrap.scrollLeft=0;
    }));
  }

  function renderCalendar() {
    const host=$('calendarHost');
    $('calendarTitle').textContent=state.year?`Events ${state.year}`:'Events';
    $('dateSearch').value=yearView().query;
    $('calendarMessage').classList.add('hidden');
    if(!state.year){host.innerHTML='<div class="empty">No calendar year is currently available to you.</div>';return;}
    const ctx=calendarRenderContext();
    const keys=['date','term','week','dow','planning'].concat(ctx.lanes.map(l=>`lane:${l.laneId}:${l.shift}`));
    const widths=getEventColumnWidths(keys);
    host.innerHTML=`<div class="calendar-wrap" tabindex="0" aria-label="Events calendar"><div class="cal-grid resizable-calendar" style="--event-grid-columns:${keys.map(k=>widths[k]+'px').join(' ')}"><div class="cal-row header">${resizeableHead('Date','date')}${resizeableHead('Term','term')}${resizeableHead('Week','week')}${resizeableHead('Day','dow')}${resizeableHead('Planning Notes','planning')}${ctx.lanes.map(l=>resizeableHead(l.label,`lane:${l.laneId}:${l.shift}`)).join('')}</div>${datesOfYear(state.year).map(d=>calendarRowHtml(d,ctx)).join('')}</div></div>`;
    bindEventColumnResizers(host,keys);bindCalendarActions(host,false);applyDateSearch(true);
    if(!yearView().events && yearView().filter.kind==='all')jumpViewToTodayOnce('events',host);
  }

  function openDayNoteModal(date, text) {
    const expectedMetadataRevision=state.data.metadataRevisions?.notes?.[date]||'missing';
    openModal(`
      <div class="modal-head"><h3>Planning Note</h3><button class="close-x" data-close>&times;</button></div>
      <form id="dayNoteForm">
        <div class="modal-body">
          <div class="field"><label>Date</label><input value="${esc(date)}" disabled></div>
          <div class="field" style="margin-top:10px"><label>Planning note</label><textarea name="Text" autofocus>${esc(text || '')}</textarea></div>
          <p class="privacy-note">Planning Notes are plain text metadata. They do not sync to either Google Calendar and do not require a glossary tag.</p>
        </div>
        <div class="modal-foot"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Save Note</button></div>
      </form>
    `);

    $('dayNoteForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);
      showWorkOverlay('Saving Planning Note', 'Writing note to the backend…');
      try {
        const response =
          await api(
            'saveDayNote',
            {
              expectedMetadataRevision,
              year:
                state.year,
              date:
                date,
              text:
                f.get('Text')
            }
          );

        if(state.data.metadataRevisions)state.data.metadataRevisions.notes[date]=response.metadataRevision;
        const saved =
          upsertLocalDayNote(
            response
          );

        setWorkProgress(
          100,
          saved?.deleted
            ? 'Note removed. Updating Events…'
            : 'Note saved. Updating Events…'
        );

        refreshEventViewLocally({
          close:
            true
        });

        toast(
          saved?.deleted
            ? 'Planning Note removed.'
            : 'Planning Note saved.'
        );

      } catch (err) {
        hideWorkOverlay();
        toast(err.message, true);
      }
    });
  }

  function displayColumns() {
    const out = [];
    (state.data.lanes || []).forEach(lane => {
      if (yes(lane.SupportsShift)) {
        out.push({ laneId: lane.LaneID, shift: 'PM_I', label: `${lane.Header} · ${lane.ShiftALabel || 'PM(i)'}` });
        out.push({ laneId: lane.LaneID, shift: 'PM_II', label: `${lane.Header} · ${lane.ShiftBLabel || 'PM(ii)'}` });
      } else {
        out.push({ laneId: lane.LaneID, shift: 'NONE', label: lane.Header });
      }
    });
    return out;
  }

  function eventInDisplayLane(event, displayLane) {
    if (String(event.LaneID) !== String(displayLane.laneId)) return false;
    if (displayLane.shift === 'NONE') return true;
    const span = String(event.ShiftSpan || 'PM_I').toUpperCase();
    return span === displayLane.shift || span === 'BOTH';
  }

  function eventsByDate(events) {
    const map = {};
    events.forEach(e => {
      const start = String(e.StartDate || '').slice(0, 10);
      const end = String(e.EndDate || e.StartDate || '').slice(0, 10);
      if (!start) return;

      let d = parseISODate(start);
      const last = parseISODate(end || start);
      let guard = 0;
      while (d <= last && guard++ < 370) {
        const key = isoDate(d);
        (map[key] ||= []).push(e);
        d = addDays(d, 1);
      }
    });
    return map;
  }

  function isGeneratedStructureEvent(e) {
    return String(
      e?.StaffDescription || ''
    ).includes(
      '[[GSPS_YEAR_STRUCTURE:'
    );
  }

  function multiDayProgress(e, dateValue) {
    const start =
      parseISODate(
        dateOnly(e?.StartDate)
      );

    const end =
      parseISODate(
        dateOnly(
          e?.EndDate ||
          e?.StartDate
        )
      );

    const current =
      parseISODate(
        dateOnly(dateValue)
      );

    if (
      !start ||
      !end ||
      !current ||
      isNaN(start) ||
      isNaN(end) ||
      isNaN(current)
    ) {
      return '';
    }

    const total =
      Math.max(
        1,
        Math.round(
          (end - start) /
          86400000
        ) + 1
      );

    const day =
      Math.min(
        total,
        Math.max(
          1,
          Math.round(
            (current - start) /
            86400000
          ) + 1
        )
      );

    return `day ${day}/${total}`;
  }

  function eventAuthorName(identity) {
    const alias = String(identity || '').trim();
    if (!alias) return 'Not recorded';
    if (alias.startsWith('CONTACTS-BIRTHDAY-V1|') || alias === 'system:contacts-birthdays') return 'Contacts birthday import';
    const person = (state.data.people || []).find(row => row.userAlias === alias || row.accountId === alias);
    if (person?.displayName) return person.displayName;
    if (alias === state.data.actor.userAlias && state.data.actor.displayName) return state.data.actor.displayName;
    return alias.replace(/@gsps\.edu\.sg$/i, '').replace(/[._]+/g, ' ').replace(/\b[a-z]/g, letter => letter.toUpperCase());
  }

  function eventCreatorHtml(event) {
    if (!event?.EventID || event._calendarJobId) return '';
    return `<div class="event-time">Created by ${esc(eventAuthorName(event.CreatedBy))}</div>`;
  }

  function eventAttributionHtml(event) {
    if (!event?.EventID || event._calendarJobId) return '';
    // Never infer edit authorship from UpdatedBy: Sheets publication can
    // overwrite it, and historical v1 parent edits can retain a previous actor.
    const editor = window.GSISV1 ? eventAuthorName(event.LastEventEditor) :
      event.LastMutationID ? 'Checking…' : 'Not recorded';
    return eventCreatorHtml(event) + `<div class="event-time">Last event edit by <span data-event-editor>${esc(editor)}</span></div>`;
  }

  function loadEventEditAuthor(event) {
    const label = $('modalHost')?.querySelector('[data-event-editor]');
    if (!label || window.GSISV1 || !event?.LastMutationID) return;
    api('eventEditAuthor', {eventId: event.EventID, operationId: event.LastMutationID})
      .then(result => { label.textContent = eventAuthorName(result.userAlias); })
      .catch(() => { label.textContent = 'Unavailable'; });
  }

  function visibleEventTitleHtml(e) {
    const generated =
      isGeneratedStructureEvent(e);

    return generated
      ? esc(e.StaffTitle)
      : `<span class="event-tag">[${esc(e.OwnerTag)}]</span> ${esc(e.StaffTitle)}`;
  }

  function eventCardHtml(e, rowDate, displayLane) {
    const privileged =
      state.data.actor.isAdmin ||
      state.data.actor.isParentPublisher;

    const psle =
      String(e.OwnerTag || '')
        .toUpperCase() === 'PSLE';

    const hidden =
      String(e.Status || '')
        .toUpperCase() === 'HIDDEN';

    const both =
      String(e.ShiftSpan || '')
        .toUpperCase() === 'BOTH';

    const multiDay =
      String(e.EventType || '')
        .toUpperCase() === 'MULTI_DAY';

    const cls = ['event-card'];

    if (privileged) {
      cls.push('editable');
    }

    if (psle) {
      cls.push('psle');
    }

    if (hidden) {
      cls.push('hidden-event');
    }

    if (both) {
      cls.push('shift-both');
    }

    let title =
      visibleEventTitleHtml(e);

    let time = '';

    if (
      String(e.EventType || '')
        .toUpperCase() === 'TIMED'
    ) {
      const spanNote =
        both
          ? ' · spans PM(i)+PM(ii)'
          : '';

      if (dateOnly(e.EndDate) > dateOnly(e.StartDate)) title += ` <span class="event-multiday-progress">(${esc(multiDayProgress(e,rowDate))})</span>`;
      time =
        `<div class="event-time">` +
        `${esc(segmentTimeLabel(e,rowDate))}` +
        `${spanNote}</div>`;

    } else if (multiDay) {
      const progress =
        multiDayProgress(
          e,
          rowDate
        );

      title +=
        progress
          ? ` <span class="event-multiday-progress">(${esc(progress)})</span>`
          : '';
    }

    const fmt =
      resolveEventFormatting(e);

    const style =
      formattingStyle(
        fmt,
        true
      );

    return (
      `<div class="${cls.join(' ')}" ` +
      `style="${style}" ` +
      `data-event-id="${esc(e.EventID)}" data-segment-date="${esc(rowDate)}" ` +
      `${privileged ? 'role="button" tabindex="0" ' : ''}` +
      `${state.data.actor.isAdmin && !e._calendarJobId && !pendingEventJob(e.EventID) ? 'draggable="true"' : ''}>` +
      `${title}${time}${eventCreatorHtml(e)}${calendarJobBadge(e)}</div>`
    );
  }

  function vacationStructures(structure) {
    return (structure || [])
      .filter(s => String(s.Kind || '').toUpperCase() === 'VACATION' && !s.DeletedAt)
      .slice()
      .sort((a, b) => dateOnly(a.StartDate).localeCompare(dateOnly(b.StartDate)));
  }

  function vacationLabel(v) {
    const code = String(v.Label || '');
    if (code === 'VAC_T1') return 'Mar Hols';
    if (code === 'VAC_T2') return 'Jun Hols';
    if (code === 'VAC_T3') return 'Sep Hols';
    if (code === 'VAC_T4') return 'Dec Hols';
    return code || 'School Holidays';
  }

  function inclusiveDayCount(start, end) {
    const a = parseISODate(dateOnly(start));
    const b = parseISODate(dateOnly(end));
    if (!a || !b || isNaN(a) || isNaN(b)) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }

  function vacationCardHtml(v, rowDate, weekly) {
    const start = dateOnly(v.StartDate);
    const end = dateOnly(v.EndDate);
    const first = rowDate === start;
    const label = vacationLabel(v);
    const days = inclusiveDayCount(start, end);

    if (weekly) {
      return `<div class="week-event vacation-structure-card">
        <span class="week-lane">Vacation:</span>
        ${first
          ? `${esc(label)} <span class="vacation-days">${days} days</span><div class="event-time">${esc(start)} → ${esc(end)}</div>`
          : `↳ ${esc(label)} (cont.)`}
      </div>`;
    }

    return `<div class="event-card vacation-structure-card">
      ${first
        ? `<span class="event-tag">[Vacation]</span> ${esc(label)}
           <div class="event-time">${esc(start)} → ${esc(end)} · ${days} days</div>`
        : `<span class="event-cont">↳ ${esc(label)} (cont.)</span>`
      }
    </div>`;
  }

  function structureMetaForDate(structure, iso) {
    const week = structure.find(s =>
      String(s.Kind || '').toUpperCase() === 'TERM_WEEK' &&
      inDateRange(iso, s.StartDate, s.EndDate)
    );
    return week ? {
      term: week.Term || '',
      week: week.Week || '',
      label: week.Label || ((week.Term && week.Week) ? `T${week.Term}W${week.Week}` : '')
    } : {};
  }


  function moveOrCopyEventToCell(source,targetDate,targetLaneId,targetShift) {
    openRelocation(source,{date:targetDate,laneId:targetLaneId,shift:targetShift});
  }

  function bindEventsViewDragDrop(host) { bindGridDragDrop(host,false); }

  function renderWeeklyView() {
    const host=$('weeklyHost');$('weeklyTitle').textContent=state.year?`Weekly View ${state.year}`:'Weekly View';
    if(!state.year){host.innerHTML='<div class="empty">No calendar year is currently available to you.</div>';return;}
    const ctx=calendarRenderContext();
    const first=mondayOnOrBefore(new Date(state.year,0,1,12)),last=sundayOnOrAfter(new Date(state.year,11,31,12));
    let html=`<div class="weekly-toolbar"><button id="savePdfBtn" class="primary">Save as PDF</button></div><div class="weekly-wrap" tabindex="0" aria-label="Weekly calendar"><table class="weekly-grid"><thead><tr><th class="week-label">${state.year}</th>${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>'<th>'+d+'</th>').join('')}</tr></thead><tbody>`;
    for(let weekStart=new Date(first);weekStart<=last;weekStart=addDays(weekStart,7)){
      const meta=structureMetaForDate(ctx.structure,isoDate(weekStart));
      const label=meta.label || (meta.term&&meta.week?`T${meta.term}W${meta.week}`:'') || fallbackWeekLabel(weekStart,state.year);
      html+=`<tr><td class="week-label">${esc(label)}</td>${Array.from({length:7},(_,i)=>weeklyDayHtml(addDays(weekStart,i),ctx)).join('')}</tr>`;
    }
    host.innerHTML=html+'</tbody></table></div>';
    bindCalendarActions(host,true);
    $('savePdfBtn').onclick=()=>{document.body.classList.add('printing-weekly');window.print();setTimeout(()=>document.body.classList.remove('printing-weekly'),500);};
    if(!yearView().weekly)jumpViewToTodayOnce('weekly',host);
  }

  function bindWeeklyDragDrop(host) { bindGridDragDrop(host,true); }

  function moveOrCopyEvent(source,targetDate) { openRelocation(source,{date:targetDate}); }

  function weekEventHtml(e, laneMap, dayKey) {
    const lane =
      laneMap[e.LaneID] || {};

    let laneText =
      lane.Header ||
      e.LaneID ||
      '';

    const shift =
      String(
        e.ShiftSpan || ''
      ).toUpperCase();

    if (yes(lane.SupportsShift)) {
      if (shift === 'PM_I') {
        laneText +=
          ` ${lane.ShiftALabel || 'PM(i)'}`;

      } else if (shift === 'PM_II') {
        laneText +=
          ` ${lane.ShiftBLabel || 'PM(ii)'}`;

      } else if (shift === 'BOTH') {
        laneText +=
          ` ${lane.ShiftALabel || 'PM(i)'}` +
          `+${lane.ShiftBLabel || 'PM(ii)'}`;
      }
    }

    const cls =
      ['week-event'];

    if (
      state.data.actor.isAdmin ||
      state.data.actor.isParentPublisher
    ) {
      cls.push('editable');
    }

    if (
      String(e.OwnerTag || '')
        .toUpperCase() === 'PSLE'
    ) {
      cls.push('psle');
    }

    if (
      String(e.Status || '')
        .toUpperCase() === 'HIDDEN'
    ) {
      cls.push('hidden-event');
    }

    let suffix = '';

    if (
      String(e.EventType || '')
        .toUpperCase() === 'TIMED'
    ) {
      suffix =
        ` ${esc(segmentTimeLabel(e,dayKey))}` + (dateOnly(e.EndDate)>dateOnly(e.StartDate)?` (${esc(multiDayProgress(e,dayKey))})`:'');

    } else if (
      String(e.EventType || '')
        .toUpperCase() === 'MULTI_DAY'
    ) {
      const progress =
        multiDayProgress(
          e,
          dayKey
        );

      suffix =
        progress
          ? ` (${esc(progress)})`
          : '';
    }

    const generated =
      isGeneratedStructureEvent(e);

    const title =
      generated
        ? esc(e.StaffTitle)
        : `[${esc(e.OwnerTag)}] ${esc(e.StaffTitle)}`;

    const fmt =
      resolveEventFormatting(e);

    const style =
      formattingStyle(
        fmt,
        true
      );

    return (
      `<div class="${cls.join(' ')}" ` +
      `style="${style}" ` +
      `data-event-id="${esc(e.EventID)}" data-segment-date="${esc(dayKey)}" ` +
      `${state.data.actor.isAdmin || state.data.actor.isParentPublisher ? 'role="button" tabindex="0" ' : ''}` +
      `${state.data.actor.isAdmin && !e._calendarJobId && !pendingEventJob(e.EventID) ? 'draggable="true"' : ''}>` +
      `<span class="week-lane">${esc(laneText)}:</span> ` +
      `${title}${suffix}${eventCreatorHtml(e)}${calendarJobBadge(e)}` +
      `</div>`
    );
  }

  function eventCoversDateClient(e, key) {
    const start = dateOnly(e.StartDate);
    const end = dateOnly(e.EndDate || e.StartDate);
    return !!start && key >= start && key <= (end || start);
  }

  function laneSort(e, laneMap) {
    return Number((laneMap[e.LaneID] || {}).SortOrder || 9999);
  }

  function mondayOnOrBefore(d) {
    const out = new Date(d);
    const day = out.getDay();
    out.setDate(out.getDate() + (day === 0 ? -6 : 1 - day));
    return out;
  }

  function sundayOnOrAfter(d) {
    const out = new Date(d);
    const day = out.getDay();
    out.setDate(out.getDate() + (day === 0 ? 0 : 7 - day));
    return out;
  }

  function fallbackWeekLabel(weekStart, year) {
    const jan1 = mondayOnOrBefore(new Date(year, 0, 1, 12));
    const n = Math.floor((weekStart - jan1) / 604800000);
    return `W${n}`;
  }

  /* =========================
   * STATS
   * ========================= */

  function renderStats() {
    const host = $('statsHost');
    $('statsTitle').textContent = state.year ? `Stats ${state.year}` : 'Stats';

    const events = (state.data.events || []).filter(e => Number(e.Year) === Number(state.year));
    const groups = new Map();

    events.forEach(e => {
      const tag = String(e.OwnerTag || '').trim();
      const title = String(e.StaffTitle || '').trim();
      const normTitle = title.replace(/\s+/g, ' ').toLowerCase();
      const key = tag.toLowerCase() + '|' + normTitle;
      if (!groups.has(key)) {
        groups.set(key, { tag, title, count:0, first:'', last:'', lanes:new Set() });
      }
      const g = groups.get(key);
      const date = dateOnly(e.StartDate);
      g.count++;
      if (!g.first || date < g.first) g.first = date;
      if (!g.last || date > g.last) g.last = date;
      g.lanes.add(String(e.LaneID || ''));
    });

    const rows = Array.from(groups.values())
      .sort((a,b) => b.count - a.count ||
        a.tag.localeCompare(b.tag, 'en', {sensitivity:'base'}) ||
        a.title.localeCompare(b.title, 'en', {sensitivity:'base'}));

    const recurring = rows.filter(r => r.count > 1).length;

    host.innerHTML = `
      <div class="stats-summary">
        <div class="stat-card"><strong>${events.length}</strong><span>Total event instances</span></div>
        <div class="stat-card"><strong>${rows.length}</strong><span>Unique events</span></div>
        <div class="stat-card"><strong>${recurring}</strong><span>Recurring events</span></div>
      </div>

      <div class="stats-filters">
        <select id="statsMode">
          <option value="all">All</option>
          <option value="recurring">Recurring only</option>
          <option value="oneoff">One-off only</option>
        </select>
        <select id="statsTag">
          <option value="">All tags</option>
          ${(state.data.tags || []).map(t => `<option value="${esc(t.Tag)}">[${esc(t.Tag)}]</option>`).join('')}
        </select>
        <select id="statsLane">
          <option value="">All lanes</option>
          ${(state.data.lanes || []).map(l => `<option value="${esc(l.LaneID)}">${esc(l.Header)}</option>`).join('')}
        </select>
      </div>

      <div class="data-table-wrap">
        <table class="data-table stats-table">
          <thead><tr><th>Event</th><th>Count</th><th>First occurrence</th><th>Last occurrence</th></tr></thead>
          <tbody id="statsBody"></tbody>
        </table>
      </div>`;

    const renderRows = () => {
      const mode = $('statsMode').value;
      const tag = $('statsTag').value;
      const lane = $('statsLane').value;
      const filtered = rows.filter(r =>
        (mode === 'all' || (mode === 'recurring' ? r.count > 1 : r.count === 1)) &&
        (!tag || r.tag === tag) &&
        (!lane || r.lanes.has(lane))
      );

      $('statsBody').innerHTML = filtered.map(r => `<tr>
        <td><strong>[${esc(r.tag)}]</strong> ${esc(r.title)}</td>
        <td class="stats-count">${r.count}</td>
        <td>${esc(r.first)}</td>
        <td>${esc(r.last)}</td>
      </tr>`).join('') || `<tr><td colspan="4" class="empty">No events match these filters.</td></tr>`;
    };

    ['statsMode','statsTag','statsLane'].forEach(id => $(id).addEventListener('change', renderRows));
    renderRows();
  }

  /* =========================
   * PARENT PUBLISHING
   * ========================= */

  function parentSyncLabel(e) {
    const enabled = yes(e.ParentEnabled);
    const hasCalendarEvent = e._parentCalendarLinked || !!String(e.ParentCalendarEventId || '').trim();
    const stateValue = canonicalSyncState(e.ParentSyncState);

    if (!enabled && !hasCalendarEvent) return 'Not included';
    if (!enabled && hasCalendarEvent && stateValue === 'PENDING_REMOVAL') {
      return 'Removal pending';
    }
    return syncStateLabel(stateValue);
  }

  function renderParentPublishing() {
    const host = $('parentHost');
    if (!(state.data.actor.isAdmin || state.data.actor.isParentPublisher)) {
      host.innerHTML = '';
      return;
    }

    const events = (state.data.events || [])
      .filter(e => Number(e.Year) === Number(state.year))
      .slice()
      .sort((a, b) => String(a.StartDate).localeCompare(String(b.StartDate)) ||
        String(a.StaffTitle).localeCompare(String(b.StaffTitle)));

    if (!events.length) {
      host.innerHTML = `
        <div class="empty">
          No events exist for ${esc(String(state.year || 'the selected year'))}.
        </div>`;
      return;
    }

    host.innerHTML = `<div class="card parent-table-card">
      <table class="data-table parent-publishing-table">
        <colgroup>
          <col class="parent-date-col">
          <col class="parent-staff-col">
          <col class="parent-toggle-col">
          <col class="parent-title-col">
          <col class="parent-state-col">
        </colgroup>
        <thead><tr><th>Date</th><th>Staff event</th><th>Clone to Parent</th><th>Parent title</th><th>Sync</th></tr></thead>
        <tbody>${events.map(e => `
          <tr data-parent-row="${esc(e.EventID)}">
            <td>${esc(eventDateLabel(e))}</td>
            <td class="parent-staff-event">${
              isGeneratedStructureEvent(e)
                ? esc(e.StaffTitle)
                : `<strong>[${esc(e.OwnerTag)}]</strong> ${esc(e.StaffTitle)}`
            }</td>
            <td>
              <label class="toggle-switch" title="Off = not on Parent Calendar; On = clone as all-day event">
                <input class="parent-toggle" type="checkbox" data-id="${esc(e.EventID)}" ${yes(e.ParentEnabled) ? 'checked' : ''}>
                <span class="toggle-slider"></span>
              </label>
            </td>
            <td>
              <textarea class="parent-title-inline" rows="1" wrap="soft" data-id="${esc(e.EventID)}"
                aria-label="Parent title for ${esc(e.StaffTitle || '')}"
                placeholder="${esc(e.StaffTitle || '')}">${esc(e.ParentTitle || e.StaffTitle || '')}</textarea>
            </td>
            <td class="parent-inline-state">${esc(parentSyncLabel(e))}</td>
          </tr>`).join('')}</tbody>
      </table>
    </div>`;

    const fitParentTitle = title => {
      title.style.height = 'auto';
      title.style.height = `${title.scrollHeight}px`;
    };

    const saveInline = async (eventId, row) => {
      const ev = events.find(e => e.EventID === eventId);
      if (!ev) return;
      const toggle = row.querySelector('.parent-toggle');
      const title = row.querySelector('.parent-title-inline');
      const stateCell = row.querySelector('.parent-inline-state');
      const proposal = () => ({
        ParentEnabled: toggle.checked ? 'Yes' : 'No',
        ParentTitle: title.value.replace(/[\r\n]+/g, ' ').trim(),
        ParentDescription: ev.ParentDescription || ''
      });

      // A stale edit needs explicit review, not another blind write on blur.
      if (row.parentConflict) {
        row.parentConflict.proposal = proposal();
        return; // Review only on explicit request; changing fields cannot trigger another write.
      }
      const proposed = proposal();
      toggle.disabled = true;
      title.disabled = true;
      stateCell.textContent = 'Saving…';

      try {
        const saved = await api('saveParentSide', {
          eventId,
          expectedRevision: ev._revision,
          ...proposed
        });
        if(isCalendarJob(saved)){row.dataset.inlineDirty='0';stateCell.textContent=calendarJobLabel(saved);row.dataset.calendarJob=saved.jobId;return;}
        // events is a shallow copy: update the shared event object in place.
        // This also advances _revision for the next inline save on this row.
        Object.assign(ev, saved);
        row.dataset.inlineDirty='0';
        toggle.checked = yes(ev.ParentEnabled);
        title.value = ev.ParentTitle || ev.StaffTitle || '';
        fitParentTitle(title);
        stateCell.textContent = parentSyncLabel(ev);
        renderDirtyPill();
      } catch (err) {
        if(err.code==='STALE_CALENDAR_CONTEXT')return;
        if (err.code === 'CONFLICT' && err.current?.EventID === eventId) {
          row.parentConflict = {err, proposal: proposed};
          row.dataset.reviewPending = '1';
          const review = document.createElement('button');
          review.type = 'button';
          review.className = 'text-link';
          review.textContent = 'Review conflict';
          review.addEventListener('click', () => {
            row.parentConflict.proposal = proposal();
            openParentModal(ev, row.parentConflict);
          });
          const discard = document.createElement('button');
          discard.type = 'button';
          discard.className = 'text-link';
          discard.textContent = 'Use latest';
          discard.addEventListener('click', () => {
            Object.assign(ev, row.parentConflict.err.current);
            delete row.parentConflict;
            delete row.dataset.reviewPending;
            renderParentPublishing();
            drainDeferredRefresh();
          });
          stateCell.replaceChildren(review, document.createTextNode(' · '), discard);
          toast('This event has changed. Your edits are retained; review or use the latest version.', true);
        } else {
          toggle.checked = yes(ev.ParentEnabled);
          title.value = ev.ParentTitle || ev.StaffTitle || '';
          fitParentTitle(title);
          stateCell.textContent = 'Error';
          toast(err.message, true);
        }
      } finally {
        toggle.disabled = !!pendingEventJob(eventId);
        title.disabled = !!pendingEventJob(eventId);
      }
    };

    // Measure all title heights before writing any height, avoiding layout on every row.
    const parentTitles = [...host.querySelectorAll('.parent-title-inline')];
    const titleHeights = parentTitles.map(title => title.scrollHeight);
    parentTitles.forEach((title, i) => {
      title.style.height = `${titleHeights[i]}px`;
      title.addEventListener('input', () => {title.closest('tr').dataset.inlineDirty='1';fitParentTitle(title);});
    });
    host.querySelectorAll('tr[data-parent-row]').forEach(row => {
      const id = row.dataset.parentRow;
      const toggle = row.querySelector('.parent-toggle');
      const title = row.querySelector('.parent-title-inline');
      toggle.addEventListener('change', () => saveInline(id, row));
      title.addEventListener('change', () => saveInline(id, row));
      title.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          title.blur();
        }
      });
    });
  }


  const SINGAPORE_PUBLIC_HOLIDAYS = Object.freeze([
    "New Year's Day",
    'Chinese New Year – first day',
    'Chinese New Year – second day',
    'Hari Raya Puasa',
    'Hari Raya Haji',
    'Good Friday',
    'Labour Day',
    'Vesak Day',
    'Youth Day',
    'National Day',
    'Day after National Day',
    "Teachers' Day",
    "Children's Day",
    'Deepavali',
    'Christmas Day'
  ]);

  function weekendInfoForDate(dateValue) {
    const text = dateOnly(dateValue);
    if (!text) {
      return {
        isWeekend: false,
        day: ''
      };
    }

    const d = parseISODate(text);

    if (!d || isNaN(d)) {
      return {
        isWeekend: false,
        day: ''
      };
    }

    const day =
      ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
        [d.getDay()];

    return {
      isWeekend:
        d.getDay() === 0 ||
        d.getDay() === 6,
      day: day
    };
  }

  function existingPublicHolidayMap(year) {
    const out = {};

    (state.data.events || [])
      .filter(e =>
        Number(e.Year) === Number(year) &&
        String(e.LaneID || '') === 'day' &&
        String(e.OwnerTag || '').toLowerCase() === 'hol' &&
        !e.DeletedAt
      )
      .forEach(e => {
        out[String(e.StaffTitle || '')] = e;
      });

    return out;
  }

  function publicHolidayRowsHtml(year) {
    const existing =
      existingPublicHolidayMap(year);

    return SINGAPORE_PUBLIC_HOLIDAYS
      .map((name, index) => {
        const base =
          existing[name] || {};

        const observed =
          existing[`${name} (observed)`] || {};

        const baseDate =
          dateOnly(base.StartDate);

        const observedDate =
          dateOnly(observed.StartDate);

        const weekend =
          weekendInfoForDate(baseDate);

        return `
          <div
            class="public-holiday-row ${weekend.isWeekend ? 'weekend-holiday-alert' : ''}"
            data-holiday-index="${index}"
            data-holiday-name="${esc(name)}"
          >
            <div class="public-holiday-name">
              <strong>[hol]</strong> ${esc(name)}
            </div>

            <div class="field holiday-date-field">
              <input
                type="date"
                aria-label="${esc(name)} date"
                data-holiday-date
                value="${esc(baseDate)}"
              >
            </div>

            <div class="holiday-weekend-message">
              ${
                weekend.isWeekend
                  ? `<strong>${esc(weekend.day)}</strong> · weekend date. Review whether an observed event is required.`
                  : ''
              }
            </div>

            <label class="holiday-observed-toggle ${weekend.isWeekend || observedDate ? '' : 'hidden'}">
              <input
                type="checkbox"
                data-holiday-observed
                ${observedDate ? 'checked' : ''}
              >
              <span>Create observed event</span>
            </label>

            <div class="field holiday-observed-date ${observedDate ? '' : 'hidden'}">
              <input
                type="date"
                aria-label="${esc(name)} observed date"
                data-holiday-observed-date
                value="${esc(observedDate)}"
              >
            </div>

            <div class="holiday-observed-preview ${observedDate ? '' : 'hidden'}">
              [hol] ${esc(name)} (observed)
            </div>
          </div>`;
      })
      .join('');
  }

  /* =========================
   * YEAR SETUP
   * ========================= */

  function renderYearSetup() {
    const metadata=JSON.parse(JSON.stringify(state.data.metadataRevisions||{}));
    const host = $('yearSetupHost');
    if (!state.data.actor.isAdmin) { host.innerHTML = ''; return; }

    const years = (state.data.years || []).slice().sort((a, b) => Number(b.Year) - Number(a.Year));
    const selected = years.find(y => Number(y.Year) === state.year) || {};
    const nextYear = years.length ? Math.max(...years.map(y => Number(y.Year))) + 1 : new Date().getFullYear();
    const structures = (state.data.yearStructure || []).filter(s => Number(s.Year) === Number(state.year));
    const vacationRows = vacationStructures(structures);
    const vacations = {};
    vacationRows.forEach(s => vacations[String(s.Label || '')] = s);
    const inferredVacations = inferVacationRangesFromStructure(structures, state.year);
    const effectiveVacations = {
      VAC_T1: vacations.VAC_T1 || inferredVacations.VAC_T1 || null,
      VAC_T2: vacations.VAC_T2 || inferredVacations.VAC_T2 || null,
      VAC_T3: vacations.VAC_T3 || inferredVacations.VAC_T3 || null,
      VAC_T4: vacations.VAC_T4 || inferredVacations.VAC_T4 || null
    };
    const generationFlash = consumeStructureGenerationFlash();
    const moeSearch = 'https://www.google.com/search?q=%2BMOE+%2Bpress+%2B%22School+terms+of+holidays%22';

    host.innerHTML = `
      <div class="notice">
        Verify school terms and vacations against the MOE press release for the target year.
        Verify Ramadan dates against the MUIS Islamic Calendar. The administrator enters authoritative dates manually.
      </div>

      <div class="card">
        <h3>Authoritative sources</h3>
        <div class="source-links">
          <a href="${moeSearch}" target="_blank" rel="noopener">Search MOE School Terms & Holidays press release</a>
          <a href="${esc(state.data.sources?.moeCalendar || 'https://www.moe.gov.sg/calendar')}" target="_blank" rel="noopener">MOE Calendar</a>
          <a href="${esc(state.data.sources?.muisCalendar || 'https://www.muis.gov.sg/resources/islamic-calendar/')}" target="_blank" rel="noopener">MUIS Islamic Calendar</a>
        </div>
      </div>

      <div class="card">
        <h3>Singapore public holidays</h3>

        <p class="privacy-note">
          Enter the gazetted dates for the selected year. 0.9.7 intentionally
          does not prefill dates from any reference screenshot. Existing
          [hol] events already saved for this year are shown back here.
        </p>

        <div class="notice compact-notice">
          Every generated event uses Owner Tag <strong>[hol]</strong> and the
          Day lane. Saturday/Sunday dates are highlighted. If an observed day
          is needed, tick Create observed event and enter that date explicitly.
        </div>

        <form id="publicHolidayForm">
          <div id="publicHolidayRows" class="public-holiday-list">
            ${publicHolidayRowsHtml(state.year)}
          </div>

          <button
            class="primary"
            type="submit"
          >Create / update public holiday events</button>
        </form>
      </div>

      <div class="card">
        <h3>${selected.Year ? `Edit ${esc(selected.Year)}` : 'Create planning year'}</h3>
        <form id="yearForm" class="form-grid">
          <div class="field"><label>Year</label><input name="Year" type="number" min="2000" max="2100" required value="${esc(selected.Year || nextYear)}"></div>
          <div class="field"><label>Status</label><select name="Status"><option value="PLANNING">Planning</option><option value="ACTIVE">Active</option></select></div>
          <div class="field"><label>Ramadan start</label><input name="RamadanStart" type="date" value="${esc(dateOnly(selected.RamadanStart))}"></div>
          <div class="field"><label>Ramadan end</label><input name="RamadanEnd" type="date" value="${esc(dateOnly(selected.RamadanEnd))}"></div>
          <div class="field full checkbox"><input id="releaseYear" name="ReleasedToTeachers" type="checkbox" ${yes(selected.ReleasedToTeachers) ? 'checked' : ''}><label for="releaseYear">Release this whole year to teachers</label></div>
          <div class="field full"><small>New events default to Hidden in a Planning year and Published in an Active year. Individual Published events can sync to the Staff Calendar before year release. The Publish version button releases the year, publishes all live Hidden events and starts Staff Calendar sync.</small></div>
          <div class="field full"><button class="primary" type="submit">Save Year</button></div>
        </form>
      </div>

      <div class="card">
        <h3>Years</h3>
        <table class="data-table"><thead><tr><th>Year</th><th>Status</th><th>Teacher visibility</th><th>Ramadan</th></tr></thead>
          <tbody>${years.map(y => `<tr><td>${esc(y.Year)}</td><td>${esc(y.Status)}</td><td>${yes(y.ReleasedToTeachers) ? 'Released' : 'Hidden'}</td><td>${esc(dateOnly(y.RamadanStart))}${y.RamadanEnd ? ' → ' + esc(dateOnly(y.RamadanEnd)) : ''}</td></tr>`).join('')}</tbody>
        </table>
      </div>

      <div class="card">
        <h3>Term / vacation generator</h3>
        <p class="privacy-note">Enter the four vacation periods in the same order used in the MOE School Terms & Holidays press release. For 2026 this generates T1W0, T1W1–T4W10, plus four vacation blocks.</p>
        ${renderGenerationFeedback(structures, generationFlash)}
        ${!vacationRows.length && Object.values(effectiveVacations).some(Boolean)
          ? '<div class="notice compact-notice">Vacation dates below are prefilled from the gaps between the existing term-week blocks. Verify them against the MOE press release before generating.</div>'
          : ''}
        <form id="structureForm">
          <div class="vacation-grid">
            ${vacationRow(1, 'Mar Hols', effectiveVacations.VAC_T1)}
            ${vacationRow(2, 'Jun Hols', effectiveVacations.VAC_T2)}
            ${vacationRow(3, 'Sep Hols', effectiveVacations.VAC_T3)}
            ${vacationRow(4, 'Dec Hols', effectiveVacations.VAC_T4)}
          </div>
          <button class="primary" type="submit">Generate Term / Vacation Structure</button>
        </form>
        <div class="structure-summary">${renderStructureSummary(structures)}</div>
      </div>
    `;

    const publicHolidayForm =
      $('publicHolidayForm');

    const refreshPublicHolidayRow = row => {
      const dateInput =
        row.querySelector('[data-holiday-date]');

      const observedToggle =
        row.querySelector('[data-holiday-observed]');

      const observedToggleLabel =
        row.querySelector('.holiday-observed-toggle');

      const observedField =
        row.querySelector('.holiday-observed-date');

      const observedPreview =
        row.querySelector('.holiday-observed-preview');

      const message =
        row.querySelector('.holiday-weekend-message');

      const weekend =
        weekendInfoForDate(
          dateInput.value
        );

      row.classList.toggle(
        'weekend-holiday-alert',
        weekend.isWeekend
      );

      message.innerHTML =
        weekend.isWeekend
          ? `<strong>${esc(weekend.day)}</strong> · weekend date. Review whether an observed event is required.`
          : '';

      observedToggleLabel.classList.toggle(
        'hidden',
        !weekend.isWeekend &&
          !observedToggle.checked
      );

      observedField.classList.toggle(
        'hidden',
        !observedToggle.checked
      );

      observedPreview.classList.toggle(
        'hidden',
        !observedToggle.checked
      );
    };

    publicHolidayForm
      .querySelectorAll(
        '.public-holiday-row'
      )
      .forEach(row => {
        const dateInput =
          row.querySelector(
            '[data-holiday-date]'
          );

        const observedToggle =
          row.querySelector(
            '[data-holiday-observed]'
          );

        dateInput.addEventListener(
          'change',
          () => refreshPublicHolidayRow(row)
        );

        observedToggle.addEventListener(
          'change',
          () => refreshPublicHolidayRow(row)
        );

        refreshPublicHolidayRow(row);
      });

    publicHolidayForm
      .addEventListener(
        'submit',
        async ev => {
          ev.preventDefault();

          if (!state.year) {
            toast(
              'Create/select a Year first.',
              true
            );
            return;
          }

          const holidays =
            [
              ...publicHolidayForm
                .querySelectorAll(
                  '.public-holiday-row'
                )
            ].map(row => ({
              name:
                row.dataset.holidayName,

              date:
                row.querySelector(
                  '[data-holiday-date]'
                ).value,

              observed:
                row.querySelector(
                  '[data-holiday-observed]'
                ).checked
                  ? 'Yes'
                  : 'No',

              observedDate:
                row.querySelector(
                  '[data-holiday-observed-date]'
                ).value
            }));

          const incompleteObserved =
            holidays.find(h =>
              h.observed === 'Yes' &&
              !h.observedDate
            );

          if (incompleteObserved) {
            toast(
              `${incompleteObserved.name}: enter the observed date.`,
              true
            );
            return;
          }

          showWorkOverlay(
            'Saving Public Holidays',
            'Creating/updating [hol] Day events…'
          );

          try {
            const result =
              await api(
                'savePublicHolidays',
                {
                  expectedMetadataRevision:metadata.holidays,
                  Year:
                    state.year,
                  holidays:
                    holidays
                }
              );

            const created =
              Number(
                result.createdOrUpdated?.length || 0
              );

            const observed =
              Number(
                result.observedCreatedOrUpdated?.length || 0
              );

            await finishWriteAndReload(
              'yearSetup',
              'Refreshing Year Setup…',
              false
            );

            toast(
              `Public holidays saved: ${created} base event(s)` +
              (observed ? ` · ${observed} observed event(s)` : '') +
              '.'
            );

          } catch (err) {
            hideWorkOverlay();
            toast(
              err.message,
              true
            );
          }
        }
      );

    const form = $('yearForm');
    if (selected.Status) form.elements.Status.value = selected.Status;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(form);
      const payload = {
        expectedMetadataRevision:metadata.years?.[String(Number(f.get('Year')))]||'missing',
        Year:Number(f.get('Year')), Status:f.get('Status'),
        RamadanStart:f.get('RamadanStart'), RamadanEnd:f.get('RamadanEnd'),
        ReleasedToTeachers:form.elements.ReleasedToTeachers.checked ? 'Yes' : 'No'
      };
      showWorkOverlay('Saving Year', 'Writing year configuration…');
      try {
        await api('saveYear', payload);
        state.year = payload.Year;
        await finishWriteAndReload('yearSetup', 'Refreshing Year Setup…', false);
      } catch (err) { hideWorkOverlay(); toast(err.message, true); }
    });

    $('structureForm').addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      showWorkOverlay('Generating Year Structure', 'Writing term/vacation structure and 44 multi-day Events…');
      try {
        const result = await api('generateYearStructure', {
          expectedMetadataRevision:metadata.structure,
          Year:state.year,
          Vacation1Start:f.get('Vacation1Start'), Vacation1End:f.get('Vacation1End'),
          Vacation2Start:f.get('Vacation2Start'), Vacation2End:f.get('Vacation2End'),
          Vacation3Start:f.get('Vacation3Start'), Vacation3End:f.get('Vacation3End'),
          Vacation4Start:f.get('Vacation4Start'), Vacation4End:f.get('Vacation4End')
        });
        try {
          sessionStorage.setItem('gspsCalStructureGenerationFlash', JSON.stringify(result));
        } catch {}
        await finishWriteAndReload('yearSetup', 'Refreshing generated term structure…', false);
      } catch (err) { hideWorkOverlay(); toast(err.message, true); }
    });
  }

  function inferVacationRangesFromStructure(structures, year) {
    const weeks = (structures || [])
      .filter(s => String(s.Kind || '').toUpperCase() === 'TERM_WEEK' && !s.DeletedAt)
      .map(s => ({
        term: Number(s.Term || 0),
        start: dateOnly(s.StartDate),
        end: dateOnly(s.EndDate)
      }))
      .filter(s => s.term >= 1 && s.term <= 4 && s.start && s.end);

    const byTerm = {};
    for (let term = 1; term <= 4; term++) {
      const rows = weeks.filter(w => w.term === term);
      if (!rows.length) continue;
      byTerm[term] = {
        start: rows.map(r => r.start).sort()[0],
        end: rows.map(r => r.end).sort().slice(-1)[0]
      };
    }

    const out = {};
    const addOne = key => isoDate(addDays(parseISODate(key), 1));
    const minusOne = key => isoDate(addDays(parseISODate(key), -1));

    if (byTerm[1] && byTerm[2]) out.VAC_T1 = {
      StartDate: addOne(byTerm[1].end),
      EndDate: minusOne(byTerm[2].start)
    };
    if (byTerm[2] && byTerm[3]) out.VAC_T2 = {
      StartDate: addOne(byTerm[2].end),
      EndDate: minusOne(byTerm[3].start)
    };
    if (byTerm[3] && byTerm[4]) out.VAC_T3 = {
      StartDate: addOne(byTerm[3].end),
      EndDate: minusOne(byTerm[4].start)
    };
    if (byTerm[4]) out.VAC_T4 = {
      StartDate: addOne(byTerm[4].end),
      EndDate: `${Number(year)}-12-31`
    };

    return out;
  }

  function vacationRow(n, label, row) {
    return `<div class="vacation-row"><div class="vacation-label">${esc(label)}</div>
      <div class="field"><label>Start</label><input name="Vacation${n}Start" type="date" required value="${esc(dateOnly(row?.StartDate))}"></div>
      <div class="field"><label>End</label><input name="Vacation${n}End" type="date" required value="${esc(dateOnly(row?.EndDate))}"></div></div>`;
  }

  function renderStructureSummary(structures) {
    const weeks = structures.filter(s => String(s.Kind || '').toUpperCase() === 'TERM_WEEK');
    const vacations = vacationStructures(structures);
    if (!weeks.length && !vacations.length) {
      return '<span class="privacy-note">No generated structure yet.</span>';
    }
    return `<span class="summary-chip">${weeks.length} term-week blocks</span>
      <span class="summary-chip">${vacations.length} vacation blocks</span>`;
  }

  function renderGenerationFeedback(structures, flash) {
    const weeks = structures.filter(s => String(s.Kind || '').toUpperCase() === 'TERM_WEEK');
    const vacations = vacationStructures(structures);
    const complete = vacations.length === 4 && weeks.length >= 40;

    let html = '';
    if (flash && Number(flash.year) === Number(state.year)) {
      html += `<div class="generation-success">
        <strong>Generation complete.</strong>
        ${esc(flash.termWeeksGenerated || weeks.length)} term-week blocks and
        ${esc(flash.vacationsGenerated || vacations.length)} vacation blocks written.
        ${flash.multiDayEventsCreatedOrUpdated !== undefined
          ? `<br>${esc(flash.multiDayEventsCreatedOrUpdated)} multi-day Staff Calendar Event records created/updated.`
          : ''}
      </div>`;
    } else if (!complete) {
      html += `<div class="generation-warning">
        <strong>Vacation structure not generated yet.</strong>
        Current backend: ${weeks.length} term-week block${weeks.length === 1 ? '' : 's'} ·
        ${vacations.length} vacation block${vacations.length === 1 ? '' : 's'}.
        ${weeks.length ? 'The form can infer the missing vacation gaps from these term weeks.' : ''}
      </div>`;
    } else {
      html += `<div class="generation-success">
        <strong>Vacation structure present.</strong>
        ${weeks.length} term-week blocks · ${vacations.length} vacation blocks.
      </div>`;
    }

    if (vacations.length) {
      html += `<div class="generated-vacation-list">
        ${vacations.map(v => {
          const days = inclusiveDayCount(v.StartDate, v.EndDate);
          return `<div class="generated-vacation-item">
            <strong>${esc(vacationLabel(v))}</strong>
            <span>${esc(dateOnly(v.StartDate))} → ${esc(dateOnly(v.EndDate))}</span>
            <span class="summary-chip">${days} days</span>
          </div>`;
        }).join('')}
      </div>`;
    }

    return html;
  }

  function consumeStructureGenerationFlash() {
    try {
      const raw = sessionStorage.getItem('gspsCalStructureGenerationFlash');
      if (!raw) return null;
      sessionStorage.removeItem('gspsCalStructureGenerationFlash');
      const parsed = JSON.parse(raw);
      return parsed && parsed.result ? parsed.result : parsed;
    } catch {
      return null;
    }
  }


  /* =========================
   * CONDITIONAL FORMATTING ENGINE
   * ========================= */

  function activeFormattingRules() {
    return (state.data.colourRules || [])
      .filter(r => yes(r.Active))
      .slice()
      .sort((a, b) => Number(a.Priority || 0) - Number(b.Priority || 0));
  }

  function resolveDayFormatting(dateKey, dateObj, yearRow) {
    const out = { fill: '', text: '', border: '' };

    activeFormattingRules().forEach(rule => {
      // Today stays class-based so @media print can reliably omit it.
      if (String(rule.Operator || '').toUpperCase() === 'EQUALS_TODAY') return;
      if (!formatRuleMatchesDay(rule, dateKey, dateObj, yearRow)) return;
      mergeFormatting(out, rule);
    });

    return out;
  }

  function resolveEventFormatting(event) {
    const out = { fill: '', text: '', border: '' };
    activeFormattingRules().forEach(rule => {
      if (!formatRuleMatchesEvent(rule, event)) return;
      mergeFormatting(out, rule);
    });
    return out;
  }

  function resolveWeeklyCellFormatting(dateKey, dateObj, yearRow, events) {
    const out = { fill: '', text: '', border: '' };
    activeFormattingRules().forEach(rule => {
      if (String(rule.Operator || '').toUpperCase() === 'EQUALS_TODAY') return;
      const matchesDay = formatRuleMatchesDay(rule, dateKey, dateObj, yearRow);
      const matchesEvent = (events || []).some(e => formatRuleMatchesEvent(rule, e));
      if (matchesDay || matchesEvent) mergeFormatting(out, rule);
    });
    return out;
  }

  function formatRuleMatchesDay(rule, dateKey, dateObj, yearRow) {
    const op = String(rule.Operator || '').toUpperCase();
    if (op === 'IN_RAMADAN_RANGE') {
      return inDateRange(dateKey, yearRow.RamadanStart, yearRow.RamadanEnd);
    }
    if (op === 'IS_WEEKEND') {
      const day = dateObj.getDay();
      return day === 0 || day === 6;
    }
    if (op === 'BETWEEN') {
      const parts = String(rule.Value || '').split('|');
      return parts.length === 2 && !!parts[0] && !!parts[1] &&
        dateKey >= parts[0] && dateKey <= parts[1];
    }
    return false;
  }

  function formatRuleMatchesEvent(rule, event) {
    const field = String(rule.Field || '');
    const op = String(rule.Operator || '').toUpperCase();
    const value = String(rule.Value || '');

    if (field === 'OwnerTag' && op === 'EQUALS') {
      return String(event.OwnerTag || '').toLowerCase() === value.toLowerCase();
    }
    if (field === 'LaneID' && op === 'EQUALS') {
      return String(event.LaneID || '') === value;
    }
    if (field === 'StaffTitle' && op === 'CONTAINS') {
      return String(event.StaffTitle || '').toLowerCase().includes(value.toLowerCase());
    }
    return false;
  }

  function mergeFormatting(target, rule) {
    const fill = safeColour(rule.FillColour);
    const text = safeColour(rule.TextColour);
    const border = safeColour(rule.BorderColour);
    if (fill) target.fill = fill;
    if (text) target.text = text;
    if (border) target.border = border;
  }

  function safeColour(value) {
    const v = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : '';
  }

  function formattingStyle(fmt, includeBorder) {
    const parts = [];
    if (fmt?.fill) parts.push(`background-color:${safeColour(fmt.fill)}!important`);
    if (fmt?.text) parts.push(`color:${safeColour(fmt.text)}!important`);
    if (includeBorder && fmt?.border) parts.push(`border-color:${safeColour(fmt.border)}!important`);
    return parts.length ? parts.join(';') + ';' : '';
  }

  const LANE_WEEKDAYS = Object.freeze([
    { code:'MON', short:'Mon', label:'Monday', jsDay:1 },
    { code:'TUE', short:'Tue', label:'Tuesday', jsDay:2 },
    { code:'WED', short:'Wed', label:'Wednesday', jsDay:3 },
    { code:'THU', short:'Thu', label:'Thursday', jsDay:4 },
    { code:'FRI', short:'Fri', label:'Friday', jsDay:5 },
    { code:'SAT', short:'Sat', label:'Saturday', jsDay:6 },
    { code:'SUN', short:'Sun', label:'Sunday', jsDay:0 }
  ]);

  function weekdayCodeForDate(dateValue) {
    const text = dateOnly(dateValue);
    if (!text) return '';

    const d = parseISODate(text);
    if (!d || isNaN(d)) return '';

    return ['SUN','MON','TUE','WED','THU','FRI','SAT'][d.getDay()];
  }

  function legacyLaneSchedule(lane) {
    const configured =
      String(lane?.DefaultWeekday || 'ANY').toUpperCase();

    return LANE_WEEKDAYS.map(day => ({
      LaneID: lane?.LaneID || '',
      Weekday: day.code,
      Enabled:
        configured === 'ANY' || configured === day.code
          ? 'Yes'
          : 'No',
      DefaultStartTime:
        timeOnly(lane?.DefaultStartTime),
      DefaultEndTime:
        timeOnly(lane?.DefaultEndTime),
      ShiftADefaultStartTime:
        timeOnly(lane?.ShiftADefaultStartTime),
      ShiftADefaultEndTime:
        timeOnly(lane?.ShiftADefaultEndTime),
      ShiftBDefaultStartTime:
        timeOnly(lane?.ShiftBDefaultStartTime),
      ShiftBDefaultEndTime:
        timeOnly(lane?.ShiftBDefaultEndTime)
    }));
  }

  function laneScheduleRows(lane) {
    if(lane && laneScheduleCache.has(lane)) return laneScheduleCache.get(lane);
    const rows =
      Array.isArray(lane?.Schedule) && lane.Schedule.length
        ? lane.Schedule
        : legacyLaneSchedule(lane || {});

    const byCode = {};
    rows.forEach(row => {
      byCode[String(row.Weekday || '').toUpperCase()] = row;
    });

    const normalized = LANE_WEEKDAYS.map(day =>
      Object.assign(
        {
          LaneID: lane?.LaneID || '',
          Weekday: day.code,
          Enabled: 'No',
          DefaultStartTime: '',
          DefaultEndTime: '',
          ShiftADefaultStartTime: '',
          ShiftADefaultEndTime: '',
          ShiftBDefaultStartTime: '',
          ShiftBDefaultEndTime: ''
        },
        byCode[day.code] || {}
      )
    );
    if(lane) laneScheduleCache.set(lane,normalized);
    return normalized;
  }

  function laneScheduleForDate(lane, dateValue) {
    const code =
      weekdayCodeForDate(dateValue);

    if (!code) return null;

    return laneScheduleRows(lane)
      .find(row =>
        String(row.Weekday || '').toUpperCase() === code
      ) || null;
  }

  function laneAvailableOnDate(lane, dateValue) {
    const row =
      laneScheduleForDate(lane, dateValue);

    return row
      ? yes(row.Enabled)
      : true;
  }

  function laneDaysLabel(lane) {
    const enabled =
      laneScheduleRows(lane)
        .filter(row => yes(row.Enabled))
        .map(row =>
          String(row.Weekday || '').toUpperCase()
        );

    if (!enabled.length) return 'None';
    if (enabled.length === 7) return 'Mon–Sun';

    const weekdays =
      ['MON','TUE','WED','THU','FRI'];

    if (
      enabled.length === 5 &&
      weekdays.every(code => enabled.includes(code))
    ) {
      return 'Mon–Fri';
    }

    return enabled
      .map(code =>
        LANE_WEEKDAYS.find(d => d.code === code)?.short || code
      )
      .join(', ');
  }

  function timingForScheduleRow(lane, row) {
    const fmt = value =>
      timeOnly(value) || '—';

    if (yes(lane?.SupportsShift)) {
      return (
        `${lane.ShiftALabel || 'PM(i)'} ` +
        `${fmt(row?.ShiftADefaultStartTime)}–${fmt(row?.ShiftADefaultEndTime)} · ` +
        `${lane.ShiftBLabel || 'PM(ii)'} ` +
        `${fmt(row?.ShiftBDefaultStartTime)}–${fmt(row?.ShiftBDefaultEndTime)}`
      );
    }

    return (
      `${fmt(row?.DefaultStartTime)}–` +
      `${fmt(row?.DefaultEndTime)}`
    );
  }

  function laneScheduleTimingLabel(lane) {
    if (
      String(lane?.DefaultEventType || '').toUpperCase() !== 'TIMED'
    ) {
      return '—';
    }

    const enabled =
      laneScheduleRows(lane)
        .filter(row => yes(row.Enabled));

    if (!enabled.length) return '—';

    const pairs =
      enabled.map(row => ({
        day:
          LANE_WEEKDAYS.find(
            d => d.code === String(row.Weekday || '').toUpperCase()
          )?.short || row.Weekday,
        timing:
          timingForScheduleRow(lane, row)
      }));

    const unique =
      [...new Set(pairs.map(x => x.timing))];

    if (unique.length === 1) {
      return `${laneDaysLabel(lane)} · ${unique[0]}`;
    }

    return pairs
      .map(x => `${x.day} ${x.timing}`)
      .join(' · ');
  }

  /* =========================
   * COLUMNS
   * ========================= */

  function renderColumns() {
    const host = $('columnsHost');

    if (!state.data.actor.isAdmin) {
      host.innerHTML = '';
      return;
    }

    const lanes =
      state.data.editableLanes || state.data.lanes || [];

    host.innerHTML = `
      <button id="newLaneBtn" class="primary" style="margin-bottom:8px">Add Column</button>
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>
            <th>Header</th>
            <th>Lane ID</th>
            <th>Available days</th>
            <th>Default type</th>
            <th>Default timing by day</th>
            <th>Calendar sync</th>
            <th></th>
          </tr></thead>

          <tbody>${
            lanes.map(l => `
              <tr>
                <td>${esc(l.Header)}${!yes(l.Active)?' <span class="role-badge">Inactive</span>':''}</td>
                <td>${esc(l.LaneID)}</td>
                <td class="wrap">${esc(laneDaysLabel(l))}</td>
                <td>${esc(eventTypeLabel(l.DefaultEventType))}</td>
                <td class="wrap">${esc(laneScheduleTimingLabel(l))}</td>
                <td>${yes(l.SyncToStaffCalendar) ? 'Yes' : 'No'}</td>
                <td>
                  <button
                    class="text-link edit-lane"
                    data-id="${esc(l.LaneID)}"
                  >Edit</button>
                </td>
              </tr>`
            ).join('')
          }</tbody>
        </table>
      </div>`;

    host
      .querySelectorAll('.edit-lane')
      .forEach(btn => {
        btn.addEventListener(
          'click',
          () =>
            openLaneModal(
              lanes.find(
                l => l.LaneID === btn.dataset.id
              )
            )
        );
      });

    $('newLaneBtn')
      .addEventListener(
        'click',
        () => openLaneModal(null)
      );
  }

  function weekdayLabel(v) {
    return ({ANY:'Any',MON:'Monday',TUE:'Tuesday',WED:'Wednesday',THU:'Thursday',FRI:'Friday',SAT:'Saturday',SUN:'Sunday'})[String(v || 'ANY').toUpperCase()] || 'Any';
  }

  function eventTypeLabel(v) {
    return ({ALL_DAY:'All day',TIMED:'Timed',MULTI_DAY:'Multi-day'})[String(v || 'ALL_DAY').toUpperCase()] || 'All day';
  }

  function laneTimingLabel(lane) {
    return laneScheduleTimingLabel(lane);
  }


  /* =========================
   * GLOSSARY
   * ========================= */

  function renderGlossary() {
    const revisions={...(state.data.metadataRevisions?.tags||{})};
    const host = $('glossaryHost');
    const tags = state.data.actor.isAdmin ? (state.data.editableTags || state.data.tags || []) : (state.data.tags || []);

    host.innerHTML = `
      ${state.data.actor.isAdmin ? '<button id="newTagBtn" class="primary" style="margin-bottom:8px">Add Tag</button>' : ''}
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>Tag</th><th>Meaning</th>${state.data.actor.isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody>${tags.map(t => {
            const fmt = resolveEventFormatting({ OwnerTag:t.Tag, LaneID:'', StaffTitle:'' });
            return `<tr>
              <td><span class="glossary-tag-chip" style="${formattingStyle(fmt, true)}"><strong>[${esc(t.Tag)}]</strong></span></td>
              <td class="wrap">${esc(t.Meaning)}${!yes(t.Active)?' <span class="role-badge">Inactive</span>':''}</td>
              ${state.data.actor.isAdmin ? `<td class="glossary-actions">
                <button class="text-link edit-tag" data-tag="${esc(t.Tag)}">Edit</button>
                <button class="text-link danger-link delete-tag" data-tag="${esc(t.Tag)}">Delete</button>
              </td>` : ''}
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;

    if (state.data.actor.isAdmin) {
      $('newTagBtn').addEventListener('click', () => openTagModal(null));
      host.querySelectorAll('.edit-tag').forEach(btn => {
        btn.addEventListener('click', () => openTagModal(tags.find(t => t.Tag === btn.dataset.tag)));
      });
      host.querySelectorAll('.delete-tag').forEach(btn => {
        btn.addEventListener('click', async () => {
          const tag = btn.dataset.tag;
          if (!confirm(`Delete [${tag}] from the Glossary?`)) return;
          const owner=calendarOwnerContext();
          showWorkOverlay('Deleting Glossary Tag', `Checking whether [${tag}] is in use…`);
          try {
            const saved=await api('deleteTag', { Tag:tag, expectedMetadataRevision:revisions[String(tag).toLowerCase()] });
            if(!sameCalendarOwner(owner))return;
            applyGlossaryRecord(saved); hideWorkOverlay(); toast('Glossary tag deleted.');
          } catch (err) {
            if(!sameCalendarOwner(owner))return;
            hideWorkOverlay();
            toast(err.message, true);
          }
        });
      });
    }
  }



  /* =========================
   * CONDITIONAL FORMATTING ADMIN
   * ========================= */

  function renderFormatting() {
    const expectedMetadataRevision=state.data.metadataRevisions?.ruleOrder;
    const host = $('formattingHost');
    if (!state.data.actor.isAdmin) { host.innerHTML = ''; return; }

    const rules = (state.data.colourRules || [])
      .slice()
      .sort((a, b) => Number(b.Priority || 0) - Number(a.Priority || 0) ||
        String(a.RuleID || '').localeCompare(String(b.RuleID || '')));

    const originalIds = rules.map(r => String(r.RuleID));
    state.formattingOrderDirty = false;
    state.formattingOriginalOrder = originalIds.slice();

    host.innerHTML = `
      <div class="notice">
        Drag rules vertically to set priority: <strong>top wins</strong>.
        Dragging changes only this screen until you press
        <strong>Save Priority Order</strong>.
        System rules cannot be edited or deleted, but they can be repositioned.
        <strong>Today</strong> remains a screen-only border and is omitted from Save as PDF.
      </div>

      <div class="formatting-toolbar">
        <button id="newFormattingBtn" class="primary">Add Rule</button>
        <button id="saveFormattingOrderBtn" class="primary" disabled>Save Priority Order</button>
        <button id="resetFormattingOrderBtn" class="secondary" disabled>Reset order</button>
        <span id="formattingUnsaved" class="unsaved-indicator hidden">Unsaved priority changes</span>
      </div>

      <div id="formattingRuleList" class="formatting-rule-list">
        ${rules.map(r => `<div
          class="formatting-rule-tile ${yes(r.Active) ? '' : 'inactive-row'}"
          draggable="true"
          data-rule-id="${esc(r.RuleID)}">
          <div class="drag-handle" title="Drag to change priority">☰</div>
          <div class="formatting-rule-main">
            <strong>${esc(formatRuleName(r))}</strong>
            <span>${esc(formatRuleDescription(r))}</span>
          </div>
          <div class="formatting-swatches">
            <span>Fill ${colourSwatch(r.FillColour)}</span>
            <span>Text ${colourSwatch(r.TextColour)}</span>
            <span>Border ${colourSwatch(r.BorderColour)}</span>
          </div>
          <div>${yes(r.Active) ? 'Active' : 'Inactive'}</div>
          <div>${yes(r.Locked)
            ? '<span class="role-badge">System</span>'
            : `<button class="text-link edit-formatting" data-id="${esc(r.RuleID)}">Edit</button>`}
          </div>
        </div>`).join('')}
      </div>`;

    $('newFormattingBtn')
      .addEventListener('click', () => openFormattingModal(null));

    host.querySelectorAll('.edit-formatting').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const rule = rules.find(r => r.RuleID === btn.dataset.id);
        if (rule) openFormattingModal(rule);
      });
    });

    const list = $('formattingRuleList');
    const saveBtn = $('saveFormattingOrderBtn');
    const resetBtn = $('resetFormattingOrderBtn');
    const unsaved = $('formattingUnsaved');

    const currentIds = () =>
      Array.from(list.querySelectorAll('.formatting-rule-tile'))
        .map(x => x.dataset.ruleId);

    const setDirty = dirty => {
      state.formattingOrderDirty = dirty;
      saveBtn.disabled = !dirty;
      resetBtn.disabled = !dirty;
      unsaved.classList.toggle('hidden', !dirty);
    };

    const checkDirty = () => {
      setDirty(currentIds().join('|') !== originalIds.join('|'));
    };

    bindFormattingDragOrder(host, checkDirty);

    resetBtn.addEventListener('click', () => {
      const byId = {};
      Array.from(list.children)
        .forEach(el => byId[el.dataset.ruleId] = el);

      originalIds.forEach(id => {
        if (byId[id]) list.appendChild(byId[id]);
      });

      setDirty(false);
    });

    saveBtn.addEventListener('click', async () => {
      if (!state.formattingOrderDirty) return;

      const ids = currentIds();

      showWorkOverlay(
        'Saving Priority Order',
        'Writing Conditional Formatting priority…'
      );
      setWorkProgress(35, 'Saving priority order…');

      try {
        const savedRules = await api('reorderColourRules', {
          expectedMetadataRevision,
          RuleIDs: ids
        });

        setWorkProgress(82, 'Priority order saved. Updating screen…');

        if (Array.isArray(savedRules)) {
          state.data.colourRules = savedRules;
          if(state.data.metadataRevisions){
            state.data.metadataRevisions.ruleOrder=savedRules[0]?._orderRevision;
            state.data.metadataRevisions.rules=Object.fromEntries(savedRules.map(r=>[r.RuleID,r._metadataRevision]));
          }
        }

        state.formattingOrderDirty = false;
        state.formattingOriginalOrder = ids.slice();

        setWorkProgress(100, 'Saved.');
        await new Promise(resolve => setTimeout(resolve, 350));

        hideWorkOverlay();
        renderFormatting();
        toast('Priority order saved.');
      } catch (err) {
        hideWorkOverlay();
        toast(err.message || 'Could not save priority order.', true);
      }
    });
  }

  function bindFormattingDragOrder(host, onOrderChanged) {
    const list = host.querySelector('#formattingRuleList');
    if (!list) return;

    let dragged = null;

    list.querySelectorAll('.formatting-rule-tile').forEach(tile => {
      tile.addEventListener('dragstart', e => {
        dragged = tile;
        tile.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      tile.addEventListener('dragend', () => {
        tile.classList.remove('dragging');
        dragged = null;
        if (onOrderChanged) onOrderChanged();
      });

      tile.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragged || dragged === tile) return;

        const rect = tile.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        list.insertBefore(
          dragged,
          before ? tile : tile.nextSibling
        );
      });

      tile.addEventListener('drop', e => {
        e.preventDefault();
        if (onOrderChanged) onOrderChanged();
      });
    });
  }


  function formatRuleName(rule) {
    const id = String(rule.RuleID || '');
    if (id === 'SYS_TODAY') return 'Today';
    if (id === 'SYS_RAMADAN') return 'Ramadan';
    if (id === 'SYS_PSLE') return 'PSLE';
    if (id === 'SYS_WEEKEND') return 'Weekend';
    return rule.Notes || 'Custom rule';
  }

  function formatRuleDescription(rule) {
    const type = String(rule.RuleType || '').toUpperCase();
    if (String(rule.Operator || '').toUpperCase() === 'EQUALS_TODAY') return 'Current date';
    if (String(rule.Operator || '').toUpperCase() === 'IN_RAMADAN_RANGE') return 'Year Setup Ramadan date range';
    if (String(rule.Operator || '').toUpperCase() === 'IS_WEEKEND') return 'Saturday or Sunday';
    if (rule.Field === 'OwnerTag') return `Tag [${rule.Value}]`;
    if (rule.Field === 'LaneID') {
      const lane = (state.data.lanes || []).find(l => l.LaneID === rule.Value);
      return `Lane: ${lane?.Header || rule.Value}`;
    }
    if (rule.Field === 'StaffTitle') return `Title contains “${rule.Value}”`;
    if (type === 'DATE_RANGE' || rule.Operator === 'BETWEEN') {
      const [start, end] = String(rule.Value || '').split('|');
      return `${start || '?'} to ${end || '?'}`;
    }
    return `${rule.Field || ''} ${rule.Operator || ''} ${rule.Value || ''}`.trim();
  }

  function colourSwatch(value) {
    const c = safeColour(value);
    return c
      ? `<span class="colour-swatch" style="background:${c}" title="${c}"></span><span class="colour-code">${c}</span>`
      : '—';
  }

  function openFormattingModal(rule) {
    const ruleId=rule?.RuleID || `RULE-${crypto.randomUUID()}`;
    const expectedMetadataRevision=rule?state.data.metadataRevisions?.rules?.[rule.RuleID]:'missing';
    const r = rule || {
      RuleID: '',
      RuleType: 'TAG',
      Value: (state.data.tags || [])[0]?.Tag || '',
      Priority: 500,
      FillColour: '#FFF2CC',
      TextColour: '',
      BorderColour: '',
      Active: 'Yes',
      Notes: ''
    };

    let startDate = '';
    let endDate = '';
    if (String(r.RuleType).toUpperCase() === 'DATE_RANGE' || r.Operator === 'BETWEEN') {
      [startDate, endDate] = String(r.Value || '').split('|');
    }

    openModal(`
      <div class="modal-head"><h3>${rule ? 'Edit' : 'Add'} Conditional Formatting Rule</h3><button class="close-x" data-close>&times;</button></div>
      <form id="formattingForm">
        <div class="modal-body form-grid">
          <div class="field">
            <label>Match type</label>
            <select name="RuleType">
              <option value="TAG">Glossary tag</option>
              <option value="LANE">Display lane</option>
              <option value="TITLE_CONTAINS">Title contains</option>
              <option value="DATE_RANGE">Date range</option>
            </select>
          </div>
          <div id="fmtTagField" class="field full">
            <label>Glossary tag</label>
            <select name="TagValue">${(state.data.tags || []).map(t => `<option value="${esc(t.Tag)}">[${esc(t.Tag)}] ${esc(t.Meaning || '')}</option>`).join('')}</select>
          </div>

          <div id="fmtLaneField" class="field full hidden">
            <label>Display lane</label>
            <select name="LaneValue">${(state.data.lanes || []).map(l => `<option value="${esc(l.LaneID)}">${esc(l.Header)}</option>`).join('')}</select>
          </div>

          <div id="fmtTitleField" class="field full hidden">
            <label>Title contains</label>
            <input name="TitleValue" value="${esc(String(r.RuleType).toUpperCase() === 'TITLE_CONTAINS' ? r.Value : '')}">
          </div>

          <div id="fmtDateField" class="field full hidden">
            <div class="form-grid">
              <div class="field"><label>Start date</label><input name="StartDate" type="date" value="${esc(startDate || '')}"></div>
              <div class="field"><label>End date</label><input name="EndDate" type="date" value="${esc(endDate || '')}"></div>
            </div>
          </div>

          ${colourControl('Fill', 'FillColour', r.FillColour)}
          ${colourControl('Text', 'TextColour', r.TextColour)}
          ${colourControl('Border', 'BorderColour', r.BorderColour)}

          <div class="field full"><label>Rule name / note</label><input name="Notes" value="${esc(r.Notes || '')}" placeholder="e.g. Weighted Assessment"></div>
          <div class="field full checkbox"><input id="fmtActive" name="Active" type="checkbox" ${yes(r.Active) ? 'checked' : ''}><label for="fmtActive">Active</label></div>
        </div>
        <div class="modal-foot">
          ${rule ? '<button type="button" id="deleteFormattingBtn" class="danger">Delete</button>' : ''}
          <span class="spacer"></span>
          <button type="button" class="secondary" data-close>Cancel</button>
          <button type="submit" class="primary">Save Rule</button>
        </div>
      </form>
    `);

    const form = $('formattingForm');
    form.elements.RuleType.value = String(r.RuleType || '').toUpperCase();

    if (String(r.RuleType).toUpperCase() === 'TAG') form.elements.TagValue.value = r.Value || '';
    if (String(r.RuleType).toUpperCase() === 'LANE') form.elements.LaneValue.value = r.Value || '';

    const refreshType = () => {
      const type = form.elements.RuleType.value;
      $('fmtTagField').classList.toggle('hidden', type !== 'TAG');
      $('fmtLaneField').classList.toggle('hidden', type !== 'LANE');
      $('fmtTitleField').classList.toggle('hidden', type !== 'TITLE_CONTAINS');
      $('fmtDateField').classList.toggle('hidden', type !== 'DATE_RANGE');
    };
    form.elements.RuleType.addEventListener('change', refreshType);
    refreshType();

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = new FormData(form);
      const type = f.get('RuleType');
      let value = '';
      if (type === 'TAG') value = f.get('TagValue');
      else if (type === 'LANE') value = f.get('LaneValue');
      else if (type === 'TITLE_CONTAINS') value = f.get('TitleValue');

      showWorkOverlay('Saving Formatting Rule', 'Writing conditional formatting…');
      try {
        await api('saveColourRule', {
          expectedMetadataRevision,
          RuleID: ruleId,
          RuleType: type,
          Value: value,
          StartDate: f.get('StartDate'),
          EndDate: f.get('EndDate'),
          FillColour: form.elements.UseFill.checked ? f.get('FillColour') : '',
          TextColour: form.elements.UseText.checked ? f.get('TextColour') : '',
          BorderColour: form.elements.UseBorder.checked ? f.get('BorderColour') : '',
          Active: form.elements.Active.checked ? 'Yes' : 'No',
          Notes: f.get('Notes')
        });
        await finishWriteAndReload('formatting', 'Refreshing Conditional Formatting…', true);
      } catch (err) {
        hideWorkOverlay();
        toast(err.message, true);
      }
    });

    if (rule) {
      $('deleteFormattingBtn').addEventListener('click', async () => {
        showWorkOverlay('Deleting Formatting Rule', 'Removing conditional formatting…');
        try {
          await api('deleteColourRule', { RuleID: rule.RuleID, expectedMetadataRevision });
          await finishWriteAndReload('formatting', 'Refreshing Conditional Formatting…', true);
        } catch (err) {
          hideWorkOverlay();
          toast(err.message, true);
        }
      });
    }
  }

  function colourControl(label, name, value) {
    const colour = safeColour(value) || '#FFFFFF';
    const checked = !!safeColour(value);
    const id = `use${name}`;
    return `<div class="field">
      <label>${esc(label)} colour</label>
      <div class="colour-control">
        <input id="${id}" name="Use${label}" type="checkbox" ${checked ? 'checked' : ''}>
        <input name="${name}" type="color" value="${colour}">
        <span class="privacy-note">Use</span>
      </div>
    </div>`;
  }

  /* =========================
   * PEOPLE
   * ========================= */

  function renderPeople() {
    const host = $('peopleHost');
    const people = state.data.people || [];

    host.innerHTML = `
      ${state.data.actor.isAdmin ? '<button id="newPersonBtn" class="primary" style="margin-bottom:8px">Add Role</button>' : ''}
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr><th>User alias</th><th>Name</th><th>Frontend role</th>${state.data.actor.isAdmin ? '<th></th>' : ''}</tr></thead>
          <tbody>${people.map(p => `<tr>
            <td>${esc(p.userAlias)}</td>
            <td>${esc(p.displayName)}</td>
            <td>
              ${p.isAdmin ? '<span class="role-badge">Admin</span>' : ''}
              ${p.isParentPublisher ? '<span class="role-badge">Parent Publisher</span>' : ''}
              ${!p.isAdmin&&!p.isParentPublisher ? '<span>No privileged role</span>' : ''}
              ${p.active===false ? '<span class="role-badge">Inactive</span>' : ''}
            </td>
            ${state.data.actor.isAdmin ? `<td><button class="text-link edit-person" data-alias="${esc(p.userAlias)}">Edit</button></td>` : ''}
          </tr>`).join('')}</tbody>
        </table>
      </div>`;

    if (state.data.actor.isAdmin) {
      $('newPersonBtn').addEventListener('click', () => openPersonModal(null));
      host.querySelectorAll('.edit-person').forEach(btn => {
        btn.addEventListener('click', () => openPersonModal(people.find(p => p.userAlias === btn.dataset.alias)));
      });
    }
  }

  /* =========================
   * URL SETUP
   * ========================= */

  function healthCheckHtml(result) {
    const summary =
      result?.summary || {};

    const status =
      String(
        summary.status || 'UNKNOWN'
      );

    const cls =
      status === 'OK'
        ? 'health-ok'
        : status === 'ERROR'
          ? 'health-error'
          : 'health-warning';

    const issues =
      result?.issues || [];

    const issueHtml =
      issues.length
        ? `
          <div class="health-issue-list">
            ${issues.map(issue => `
              <div class="health-issue ${String(issue.severity).toLowerCase()}">
                <strong>${esc(issue.severity)} · ${esc(issue.code)}</strong>
                <span>${esc(issue.message)}</span>
                ${
                  issue.entityId
                    ? `<code>${esc(issue.entityId)}</code>`
                    : ''
                }
              </div>
            `).join('')}
          </div>`
        : '<div class="privacy-note">No integrity issues detected.</div>';

    const opLine = op => {
      if (!op) return 'None';

      return (
        `${esc(op.target || '')} ${esc(op.year || '')} · ` +
        `${esc(op.ageMinutes || 0)} min since activity` +
        `${op.stale ? ' · STALE' : ''}`
      );
    };

    return `
      <div class="health-summary ${cls}">
        <strong>${esc(status)}</strong>
        <span>
          ${Number(summary.errors || 0)} error(s) ·
          ${Number(summary.warnings || 0)} warning(s) ·
          ${Number(result?.counts?.eventsChecked || 0)} Event row(s) checked
        </span>
      </div>

      <div class="health-operation-grid">
        <div>
          <strong>Sync session</strong>
          <div>${opLine(result?.operations?.sync)}</div>
        </div>
        <div>
          <strong>Wipe session</strong>
          <div>${opLine(result?.operations?.wipe)}</div>
        </div>
      </div>

      ${result?.venueDirectory?`<div class="health-summary"><strong>Venue directory · ${esc(result.venueDirectory.code || result.venueDirectory.status)}</strong><span>${esc(result.venueDirectory.message || '')}</span></div>`:''}

      ${issueHtml}

      ${
        result?.truncated
          ? '<div class="privacy-note">Issue display truncated; counts remain complete.</div>'
          : ''
      }
    `;
  }

  function reconciliationHtml(result) {
    return `
      <div class="health-summary ${
        Number(result.linkedMissing || 0) ||
        Number(result.duplicateLookingGroups || 0)
          ? 'health-warning'
          : 'health-ok'
      }">
        <strong>${esc(String(result.target || '').toUpperCase())} ${esc(result.year)}</strong>
        <span>${esc(result.calendarName || '')}</span>
      </div>

      <div class="reconcile-grid">
        <div><strong>${Number(result.linkedPresent || 0)}</strong><span>linked + present</span></div>
        <div><strong>${Number(result.linkedMissing || 0)}</strong><span>linked but missing</span></div>
        <div><strong>${Number(result.desiredUnlinked || 0)}</strong><span>desired but unlinked</span></div>
        <div><strong>${Number(result.linkedButUndesired || 0)}</strong><span>linked but no longer desired</span></div>
        <div><strong>${Number(result.hashDrift || 0)}</strong><span>backend hash drift</span></div>
        <div><strong>${Number(result.unlinkedCalendarEvents || 0)}</strong><span>Calendar events with no backend link</span></div>
        <div><strong>${Number(result.duplicateLookingGroups || 0)}</strong><span>duplicate-looking Calendar groups</span></div>
      </div>

      <div class="privacy-note">
        Dry run only. No Calendar event is adopted, deleted or modified.
      </div>
    `;
  }

  function selfTestHtml(result) {
    const failed =
      (result?.tests || [])
        .filter(test => !test.ok);

    return `
      <div class="health-summary ${result?.ok ? 'health-ok' : 'health-error'}">
        <strong>${result?.ok ? 'PASS' : 'FAIL'}</strong>
        <span>
          ${Number(result?.passed || 0)} passed ·
          ${Number(result?.failed || 0)} failed ·
          ${Number(result?.total || 0)} total
        </span>
      </div>

      ${
        failed.length
          ? `
            <div class="health-issue-list">
              ${failed.map(test => `
                <div class="health-issue error">
                  <strong>${esc(test.name)}</strong>
                  <span>${esc(test.error)}</span>
                </div>
              `).join('')}
            </div>`
          : '<div class="privacy-note">All 0.9.7 self-tests passed.</div>'
      }
    `;
  }

  function renderUrls() {
    const expectedMetadataRevision=state.data.metadataRevisions?.urls;
    const host = $('urlsHost');
    if (!state.data.actor.isAdmin) {
      host.innerHTML = '';
      return;
    }

    const urls = state.data.urls || {};

    host.innerHTML = `
      <div class="card">
        <h3>Google Calendars</h3>
        <form id="urlForm" class="form-grid">
          <div class="field full">
            <label>Staff Calendar URL</label>
            <div style="display:flex;gap:7px;align-items:center">
              <input name="staffCalendarUrl" value="${esc(urls.staffCalendar || '')}">
              ${urls.staffCalendar
                ? `<a class="text-link" href="${esc(urls.staffCalendar)}" target="_blank" rel="noopener">Open</a>`
                : ''}
            </div>
          </div>

          <div class="field full">
            <label>Parent Calendar URL</label>
            <div style="display:flex;gap:7px;align-items:center">
              <input name="parentCalendarUrl" value="${esc(urls.parentCalendar || '')}">
              ${urls.parentCalendar
                ? `<a class="text-link" href="${esc(urls.parentCalendar)}" target="_blank" rel="noopener">Open</a>`
                : ''}
            </div>
          </div>

          <div class="field full">
            <button class="primary" type="submit">Save URLs</button>
          </div>
        </form>

        <p class="privacy-note">
          Saving a Calendar URL also updates the Calendar ID used by Sync.
        </p>
      </div>

      <div class="card">
        <h3>Calendar access diagnostics</h3>
        <p class="privacy-note">
          This uses the same Apps Script execution identity as Sync.
          The optional write test creates a temporary event on 31 Dec 2099
          and immediately deletes it.
        </p>

        <div class="calendar-diagnostic-actions">
          <button id="calendarReadCheckBtn" class="secondary">Check access</button>
          <button id="calendarWriteCheckBtn" class="primary">Check access + write permission</button>
        </div>

        <div id="calendarDiagnosticHost">
          <span class="privacy-note">No diagnostic run yet.</span>
        </div>
      </div>

      <div class="card stable-health-card">
        <h3>Unresolved saves and publications</h3>
        <p class="privacy-note">Check a receipt against the current saved record. Recent or uncertain writes remain blocked.</p>
        <button id="loadMutationReceipts" type="button" class="secondary">Load receipts</button>
        <div id="mutationReceiptsHost" style="margin-top:10px"></div>
      </div>
      <div class="card stable-health-card">
        <h3>Stable Release Health</h3>

        <p class="privacy-note">
          0.9.7 maintenance tools are read-only unless you explicitly clear a
          stale operation. Destructive workflows also run the core integrity
          check automatically before they begin.
        </p>

        <div class="calendar-diagnostic-actions">
          <button id="healthCheckBtn" class="primary" type="button">
            Run consistency audit
          </button>

          <button id="selfTestBtn" class="secondary" type="button">
            Run 0.9.7 self-tests
          </button>
        </div>

        <div id="healthCheckHost" style="margin-top:10px">
          <span class="privacy-note">No consistency audit run yet.</span>
        </div>

        <div class="stale-operation-actions">
          <button id="clearStaleSyncBtn" class="danger hidden" type="button">
            Clear stale Sync session
          </button>
          <button id="clearStaleWipeBtn" class="danger hidden" type="button">
            Clear stale Wipe session
          </button>
        </div>

        <hr class="maintenance-divider">

        <h4>Calendar reconciliation · dry run</h4>

        <div class="form-grid">
          <div class="field">
            <label>Year</label>
            <select id="reconcileYear">
              ${(state.data.years || [])
                .filter(y => String(y.Status || '').toUpperCase() !== 'ARCHIVED')
                .slice()
                .sort((a, b) => Number(b.Year) - Number(a.Year))
                .map(y => `
                  <option
                    value="${esc(String(y.Year))}"
                    ${Number(y.Year) === Number(state.year) ? 'selected' : ''}
                  >${esc(String(y.Year))}</option>
                `)
                .join('')}
            </select>
          </div>

          <div class="field">
            <label>Calendar</label>
            <select id="reconcileTarget">
              <option value="staff">Staff Calendar</option>
              <option value="parent">Parent Calendar</option>
            </select>
          </div>

          <div class="field full">
            <button id="reconcileBtn" class="secondary" type="button">
              Reconciliation dry run
            </button>
          </div>
        </div>

        <div id="reconcileHost">
          <span class="privacy-note">No reconciliation run yet.</span>
        </div>

        <div id="selfTestHost" style="margin-top:10px"></div>
      </div>

      <details class="danger-zone-card">
        <summary>Danger zone · Archive Years</summary>

        <div class="danger-zone-body">
          <p>
            Export selected Year + Status combinations into a standalone
            0.9.7-compatible Google Spreadsheet in the configured Shared Drive
            folder, verify it, then eject that year-scoped operational data
            from the working workbook.
          </p>

          <p class="privacy-note">
            The live Years row is retained as an ARCHIVED pointer to the
            archive workbook. Events, DayNotes and YearStructure for the
            selected year(s) are removed only after archive verification succeeds.
          </p>

          <div id="archiveSelectionHost" class="archive-selection-grid"></div>

          <button
            id="archivePreviewBtn"
            class="secondary"
            type="button"
          >Preview archive</button>

          <div id="archivePreviewHost" style="margin-top:10px">
            <span class="privacy-note">
              Select one or more ACTIVE / PLANNING years, then preview.
            </span>
          </div>

          <div id="archiveConfirmHost" class="hidden">
            <label class="wipe-check-row">
              <input id="archiveAcknowledge" type="checkbox">
              <span>
                I understand that verified year-scoped operational rows will
                be removed from the live backend after the archive workbook is created.
              </span>
            </label>

            <div class="field" style="margin-top:10px">
              <label>
                Type <code id="archivePhraseLabel"></code> to confirm
              </label>
              <input id="archivePhraseInput" autocomplete="off">
            </div>

            <button
              id="archiveCommitBtn"
              class="danger-button"
              type="button"
              disabled
            >Archive selected Years</button>
          </div>
        </div>
      </details>

      <details class="danger-zone-card">
        <summary>Danger zone · Wipe Calendar</summary>
        <div class="danger-zone-body">
          <p>
            This permanently deletes <strong>every Google Calendar event</strong>
            across the selected full calendar year for the chosen Calendar.
            If backend Events assigned to that logical year extend outside Jan–Dec
            (for example preparation days in late December), those dates are included too.
            It does not delete backend Events.
          </p>
          <p class="privacy-note">
            After completion, Calendar event IDs and sync hashes for that target
            are cleared and the existing differential Sync is prepared to
            repopulate the Calendar from the backend.
          </p>

          <div class="form-grid">
            <div class="field">
              <label>Calendar to wipe</label>
              <select id="wipeCalendarTarget">
                <option value="staff">Staff Calendar</option>
                <option value="parent">Parent Calendar</option>
              </select>
            </div>
            <div class="field">
              <label>School year</label>
              <input id="wipeCalendarYear" value="${esc(String(state.year || ''))}" readonly>
            </div>
            <div class="field full">
              <button id="wipePreviewBtn" class="secondary" type="button">Preview wipe</button>
            </div>
          </div>

          <div id="wipePreviewHost">
            <span class="privacy-note">Preview is required before the destructive action is enabled.</span>
          </div>

          <div id="wipeConfirmHost" class="hidden">
            <label class="wipe-check-row">
              <input id="wipeAcknowledge" type="checkbox">
              <span>
                I understand that this deletes all Calendar events in the shown
                date window, including manually-added or unrelated entries.
              </span>
            </label>
            <div class="field" style="margin-top:10px">
              <label>Type <code id="wipePhraseLabel"></code> to confirm</label>
              <input id="wipePhraseInput" autocomplete="off">
            </div>
            <button id="wipeStartBtn" class="danger-button" type="button" disabled>Wipe Calendar</button>
          </div>
        </div>
      </details>

      <div class="notice">
        Weekly View → Save as PDF uses your browser's print/PDF function and saves to your own device. No PDF is uploaded to Google Drive.
      </div>
    `;

    $('urlForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const f = new FormData(ev.currentTarget);

      showWorkOverlay(
        'Saving URLs',
        'Updating Calendar destinations…'
      );

      try {
        await api('saveUrls', {
          expectedMetadataRevision,
          staffCalendarUrl: f.get('staffCalendarUrl'),
          parentCalendarUrl: f.get('parentCalendarUrl')
        });

        await finishWriteAndReload(
          'urls',
          'Refreshing URL Setup…',
          false
        );
      } catch (err) {
        hideWorkOverlay();
        toast(err.message, true);
      }
    });

    const runPreflight = async testWrite => {
      const output = $('calendarDiagnosticHost');
      output.innerHTML =
        '<span class="privacy-note">Checking Calendar access…</span>';

      $('calendarReadCheckBtn').disabled = true;
      $('calendarWriteCheckBtn').disabled = true;

      try {
        const response = await api('calendarPreflight', {
          testWrite: testWrite ? 'Yes' : 'No'
        });
        const result = response?.result || response;
        output.innerHTML = calendarDiagnosticHtml(result);
      } catch (err) {
        output.innerHTML =
          `<div class="diagnostic-error">${esc(err.message)}</div>`;
      } finally {
        $('calendarReadCheckBtn').disabled = false;
        $('calendarWriteCheckBtn').disabled = false;
      }
    };

    $('calendarReadCheckBtn')
      .addEventListener('click', () => runPreflight(false));

    $('calendarWriteCheckBtn')
      .addEventListener('click', () => runPreflight(true));

    let lastHealthResult = null;

    const updateStaleOperationButtons = result => {
      lastHealthResult = result || null;

      const syncBtn =
        $('clearStaleSyncBtn');

      const wipeBtn =
        $('clearStaleWipeBtn');

      syncBtn.classList.toggle(
        'hidden',
        !result?.operations?.sync?.stale
      );

      wipeBtn.classList.toggle(
        'hidden',
        !result?.operations?.wipe?.stale
      );
    };

    const runHealthCheck = async () => {
      const host =
        $('healthCheckHost');

      $('healthCheckBtn').disabled = true;

      host.innerHTML =
        '<span class="privacy-note">Running 0.9.7 consistency audit…</span>';

      try {
        const response =
          await api(
            'healthCheck',
            {
              year:
                state.year,
              includeCalendar:
                'Yes'
            }
          );

        const result =
          response?.result || response;

        host.innerHTML =
          healthCheckHtml(result);

        updateStaleOperationButtons(
          result
        );

      } catch (err) {
        host.innerHTML =
          `<div class="diagnostic-error">${esc(err.message)}</div>`;

      } finally {
        $('healthCheckBtn').disabled = false;
      }
    };

    const loadMutationReceipts=async(operationId)=>{
      const host=$('mutationReceiptsHost'),button=$('loadMutationReceipts'),owner=calendarOwnerContext();
      button.disabled=true;host.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{
        const response=await api('mutationReceipts',operationId?{check:true,operationId}:{check:false}),result=response?.result||response;
        if(!sameCalendarOwner(owner)||$('mutationReceiptsHost')!==host)return;
        const checked=(result.checked||[]).map(row=>row.error?.message||`${row.operationId}: ${row.state==='UNKNOWN'?'Still uncertain. No change made.':row.state}`).join(' ');
        host.innerHTML=`${checked?`<p role="status">${esc(checked)}</p>`:''}${result.receipts?.length?`<div class="conflict-table-wrap"><table class="data-table"><thead><tr><th>State</th><th>Age</th><th>Event</th><th>User</th><th>Action</th></tr></thead><tbody>${result.receipts.map(row=>`<tr><td>${esc(row.state)}</td><td>${row.ageMs==null?'Unknown':Math.floor(row.ageMs/60000)+' min'}</td><td>${esc(row.event)}</td><td>${esc(row.user)}</td><td><button type="button" class="secondary" data-check-mutation="${esc(row.operationId)}">Check now</button></td></tr>`).join('')}</tbody></table></div>`:'<p>No unresolved receipts.</p>'}`;
        host.querySelectorAll('[data-check-mutation]').forEach(b=>b.onclick=()=>loadMutationReceipts(b.dataset.checkMutation));
      }catch(err){if(sameCalendarOwner(owner)&&$('mutationReceiptsHost')===host)host.innerHTML=`<p role="alert">${esc(err.message)}</p>`;}
      finally{if($('loadMutationReceipts')===button)button.disabled=false;}
    };
    $('loadMutationReceipts').onclick=()=>loadMutationReceipts();
    $('healthCheckBtn')
      .addEventListener(
        'click',
        runHealthCheck
      );

    $('selfTestBtn')
      .addEventListener(
        'click',
        async () => {
          const host =
            $('selfTestHost');

          $('selfTestBtn').disabled = true;

          host.innerHTML =
            '<span class="privacy-note">Running self-tests…</span>';

          try {
            const response =
              await api(
                'runSelfTests',
                {}
              );

            host.innerHTML =
              selfTestHtml(
                response?.result ||
                response
              );

          } catch (err) {
            host.innerHTML =
              `<div class="diagnostic-error">${esc(err.message)}</div>`;

          } finally {
            $('selfTestBtn').disabled = false;
          }
        }
      );

    $('reconcileBtn')
      .addEventListener(
        'click',
        async () => {
          const host =
            $('reconcileHost');

          $('reconcileBtn').disabled = true;

          host.innerHTML =
            '<span class="privacy-note">Comparing backend links with Google Calendar…</span>';

          try {
            const response =
              await api(
                'calendarReconciliationPreview',
                {
                  year:
                    Number(
                      $('reconcileYear').value
                    ),
                  target:
                    $('reconcileTarget').value
                }
              );

            host.innerHTML =
              reconciliationHtml(
                response?.result ||
                response
              );

          } catch (err) {
            host.innerHTML =
              `<div class="diagnostic-error">${esc(err.message)}</div>`;

          } finally {
            $('reconcileBtn').disabled = false;
          }
        }
      );

    const clearStale =
      async kind => {
        const op =
          lastHealthResult?.operations?.[kind];

        if (!op?.stale) {
          toast(
            `No stale ${kind} session is currently reported.`,
            true
          );
          return;
        }

        const ok =
          confirm(
            `Clear stale ${kind} session ${op.id}? ` +
            'This clears only the abandoned job marker; it does not undo prior completed writes.'
          );

        if (!ok) return;

        try {
          await api(
            'clearStaleOperation',
            {
              kind:
                kind
            }
          );

          toast(
            `Stale ${kind} session cleared.`
          );

          await runHealthCheck();

        } catch (err) {
          toast(
            err.message,
            true
          );
        }
      };

    $('clearStaleSyncBtn')
      .addEventListener(
        'click',
        () => clearStale('sync')
      );

    $('clearStaleWipeBtn')
      .addEventListener(
        'click',
        () => clearStale('wipe')
      );

    const archiveYears =
      (state.data.years || [])
        .filter(y =>
          ['ACTIVE', 'PLANNING'].includes(
            String(y.Status || '').toUpperCase()
          )
        )
        .sort((a, b) =>
          Number(b.Year) - Number(a.Year)
        );

    $('archiveSelectionHost').innerHTML =
      archiveYears.length
        ? archiveYears.map(y => `
            <label class="archive-selection-row">
              <input
                type="checkbox"
                data-archive-year="${esc(String(y.Year))}"
                data-archive-status="${esc(String(y.Status).toUpperCase())}"
              >
              <span>
                ${esc(String(y.Year))} ·
                ${esc(String(y.Status).toUpperCase())}
              </span>
            </label>
          `).join('')
        : '<div class="empty">No ACTIVE or PLANNING years are available to archive.</div>';

    let archivePreview = null;

    const selectedArchiveRows = () =>
      [
        ...document.querySelectorAll(
          '#archiveSelectionHost input[type="checkbox"]:checked'
        )
      ].map(input => ({
        year:
          Number(input.dataset.archiveYear),
        status:
          input.dataset.archiveStatus
      }));

    const updateArchiveCommitState = () => {
      if (!archivePreview) return;

      $('archiveCommitBtn').disabled =
        !(
          $('archiveAcknowledge').checked &&
          $('archivePhraseInput').value.trim() ===
            archivePreview.confirmationPhrase
        );
    };

    $('archivePreviewBtn')
      .addEventListener(
        'click',
        async () => {
          const selections =
            selectedArchiveRows();

          if (!selections.length) {
            toast(
              'Select at least one Year + Status combination.',
              true
            );
            return;
          }

          $('archivePreviewBtn').disabled = true;
          $('archiveConfirmHost').classList.add('hidden');
          $('archivePreviewHost').innerHTML =
            '<span class="privacy-note">Preparing archive preview…</span>';

          try {
            archivePreview =
              await api(
                'archiveYearsPreview',
                { selections: selections }
              );

            const counts =
              archivePreview.counts || {};

            $('archivePreviewHost').innerHTML = `
              <div class="wipe-preview-box">
                <div>
                  <strong>${esc(archivePreview.fileName)}</strong>
                </div>

                <div>
                  Selected:
                  ${esc(
                    (archivePreview.selections || [])
                      .map(x =>
                        `${x.year} ${x.status}`
                      )
                      .join(', ')
                  )}
                </div>

                <div>
                  Events ${Number(counts.Events || 0)} ·
                  YearStructure ${Number(counts.YearStructure || 0)} ·
                  DayNotes ${Number(counts.DayNotes || 0)}
                </div>

                <div>
                  The standalone archive also carries current Settings, Lanes,
                  LaneSchedule, Tags, Users, ColourRules and logs for context.
                </div>
              </div>`;

            $('archivePhraseLabel').textContent =
              archivePreview.confirmationPhrase;

            $('archivePhraseInput').value = '';
            $('archiveAcknowledge').checked = false;
            $('archiveCommitBtn').disabled = true;
            $('archiveConfirmHost').classList.remove('hidden');

          } catch (err) {
            archivePreview = null;

            $('archivePreviewHost').innerHTML =
              `<div class="diagnostic-error">${esc(err.message)}</div>`;

          } finally {
            $('archivePreviewBtn').disabled = false;
          }
        }
      );

    $('archiveAcknowledge')
      .addEventListener(
        'change',
        updateArchiveCommitState
      );

    $('archivePhraseInput')
      .addEventListener(
        'input',
        updateArchiveCommitState
      );

    $('archiveCommitBtn')
      .addEventListener(
        'click',
        async () => {
          if (!archivePreview) return;

          $('archiveCommitBtn').disabled = true;

          showWorkOverlay(
            'Archiving Years',
            'Creating and verifying standalone archive workbook…'
          );

          try {
            const result =
              await api(
                'archiveYearsCommit',
                {
                  selections:
                    archivePreview.selections,

                  confirmed:
                    $('archiveAcknowledge').checked
                      ? 'Yes'
                      : 'No',

                  confirmationPhrase:
                    $('archivePhraseInput').value.trim()
                }
              );

            setWorkProgress(
              100,
              'Archive verified and live backend cleaned.'
            );

            await new Promise(
              resolve =>
                setTimeout(resolve, 650)
            );

            hideWorkOverlay();

            await loadBootstrap(
              state.year
            );

            toast(
              `Archive complete: ${result.fileName}`
            );

          } catch (err) {
            hideWorkOverlay();
            toast(err.message, true);
            $('archiveCommitBtn').disabled = false;
          }
        }
      );

    let wipePreview = null;

    const updateWipeStartState = () => {
      if (!wipePreview || wipePreview.inProgress) return;
      const ok =
        $('wipeAcknowledge').checked &&
        $('wipePhraseInput').value.trim() === wipePreview.confirmationPhrase;
      $('wipeStartBtn').disabled = !ok;
    };

    const renderWipePreview = preview => {
      wipePreview = preview;
      const host = $('wipePreviewHost');
      const confirmHost = $('wipeConfirmHost');
      const sample = (preview.sample || [])
        .map(x => `<li>${esc(x.start)} · ${esc(x.title || '(untitled)')}</li>`)
        .join('');

      if (preview.inProgress) {
        host.innerHTML = `
          <div class="wipe-preview-box">
            <strong>Wipe already in progress.</strong>
            <div>${esc(preview.label)} Calendar · ${esc(String(preview.year))}</div>
            <div>${esc(preview.startDate)} → ${esc(preview.endDate)}</div>
            <div>${Number(preview.eventCount || 0)} Calendar event(s) currently remain.</div>
            <div>${Number(preview.deletedTotal || 0)} deleted so far.</div>
            <button id="wipeResumeBtn" class="danger-button" type="button" style="margin-top:10px">Resume wipe</button>
          </div>`;
        confirmHost.classList.add('hidden');
        $('wipeResumeBtn').addEventListener('click', () =>
          runCalendarWipeBatches({
            wipeId: preview.wipeId,
            target: preview.target,
            year: preview.year,
            initialCount: preview.initialCount || preview.eventCount,
            deletedTotal: preview.deletedTotal || 0
          })
        );
        return;
      }

      host.innerHTML = `
        <div class="wipe-preview-box">
          <div><strong>${esc(preview.label)} Calendar</strong></div>
          <div>Execution account: ${esc(preview.effectiveUser || 'Unknown')}</div>
          <div>Calendar: ${esc(preview.calendarName || preview.calendarId)}</div>
          <div>Window: ${esc(preview.startDate)} → ${esc(preview.endDate)}</div>
          <div><strong>${Number(preview.eventCount || 0)} event(s) will be deleted.</strong></div>
          ${sample ? `<details style="margin-top:8px"><summary>Sample events</summary><ul>${sample}</ul></details>` : ''}
        </div>`;

      $('wipePhraseLabel').textContent = preview.confirmationPhrase;
      $('wipePhraseInput').value = '';
      $('wipeAcknowledge').checked = false;
      $('wipeStartBtn').disabled = true;
      confirmHost.classList.remove('hidden');
    };

    $('wipePreviewBtn').addEventListener('click', async () => {
      $('wipePreviewBtn').disabled = true;
      $('wipeConfirmHost').classList.add('hidden');
      $('wipePreviewHost').innerHTML = '<span class="privacy-note">Inspecting Calendar contents…</span>';
      try {
        const preview = await api('calendarWipePreview', {
          target: $('wipeCalendarTarget').value,
          year: Number($('wipeCalendarYear').value)
        });
        renderWipePreview(preview);
      } catch (err) {
        wipePreview = null;
        $('wipePreviewHost').innerHTML = `<div class="diagnostic-error">${esc(err.message)}</div>`;
      } finally {
        $('wipePreviewBtn').disabled = false;
      }
    });

    $('wipeCalendarTarget').addEventListener('change', () => {
      wipePreview = null;
      $('wipeConfirmHost').classList.add('hidden');
      $('wipePreviewHost').innerHTML = '<span class="privacy-note">Preview again after changing Calendar target.</span>';
    });

    $('wipeAcknowledge').addEventListener('change', updateWipeStartState);
    $('wipePhraseInput').addEventListener('input', updateWipeStartState);

    $('wipeStartBtn').addEventListener('click', async () => {
      if (!wipePreview || wipePreview.inProgress) return;
      $('wipeStartBtn').disabled = true;
      try {
        const session = await api('startCalendarWipe', {
          target: wipePreview.target,
          year: wipePreview.year,
          expectedCount: Number(wipePreview.eventCount || 0),
          confirmed: $('wipeAcknowledge').checked ? 'Yes' : 'No',
          confirmationPhrase: $('wipePhraseInput').value.trim()
        });

        if (session.completed) {
          showWorkOverlay('Wiping Calendar', 'Calendar was already empty. Resetting sync linkage…');
          setWorkProgress(100, 'Wipe complete.');
          await new Promise(resolve => setTimeout(resolve, 400));
          hideWorkOverlay();
          await loadBootstrap(state.year);
          toast(`${wipePreview.label} Calendar wipe complete.`);
          return;
        }
        await runCalendarWipeBatches(session);
      } catch (err) {
        hideWorkOverlay();
        toast(err.message || 'Calendar wipe could not start.', true);
        $('wipeStartBtn').disabled = false;
      }
    });
  }

  async function waitForCalendarResume(session, completed, remaining, operation = null) {
    const reasons = {DAILY_QUOTA: 'Google Calendar daily quota reached', CALENDAR_USAGE_LIMIT: 'Google Calendar usage limit reached',
      APPS_SCRIPT_QUOTA: 'Apps Script Calendar quota reached', ACCESS_DENIED: 'Calendar permission denied', AUTH_REQUIRED: 'Calendar authorisation required',
      API_DISABLED: 'Google Calendar API must be enabled'};
    const next = Number(session.nextAttemptEpochMs || 0);
    const retryTime = next ? new Intl.DateTimeFormat('en-SG', {timeZone: 'Asia/Singapore', dateStyle: 'medium', timeStyle: 'medium'}).format(new Date(next)) + ' Singapore time' : '';
    if (session.manualReview) throw new Error(`${reasons[session.pauseReason] || 'Calendar sync needs review'}. Review the cause, then resume${retryTime ? ' after ' + retryTime : ''}. ${completed} completed · ${remaining} remaining.`);
    const wait = Math.max(0, Number(session.retryAfterMs) || (next ? next - Date.now() : 0));
    if (!wait) return;
    $('syncStage').textContent = session.pauseReason === 'BATCH_YIELD' ? 'Waiting for the next Calendar batch' : session.pauseReason==='SOURCE_READ_RATE_LIMIT'?'Waiting for Calendar source reads':'Paused by Google Calendar';
    $('syncDetail').textContent = `${completed} completed · ${remaining} remaining. Next retry: ${retryTime || 'shortly'}. The source session is retained. This page will retry after the saved delay; a separately configured background scheduler may continue it.`;
    if(operation)await waitForCalendarSyncDelay(operation,Math.min(wait,2147483647));
    else await new Promise(resolve => setTimeout(resolve, Math.min(wait, 2147483647)));
  }

  async function runCalendarWipeBatches(session) {
    const label = session.target === 'parent' ? 'Parent' : 'Staff';
    const initialCount = Math.max(0, Number(session.initialCount || 0));
    showWorkOverlay(`Wiping ${label} Calendar`, 'Deleting Calendar events in controlled batches…');

    let current = session;
    try {
      while (!current.completed) {
        const deletedTotal = Math.max(0, Number(current.deletedTotal || 0));
        const progress = initialCount
          ? Math.min(96, Math.round((deletedTotal / initialCount) * 96))
          : 90;
        setWorkProgress(
          Math.max(8, progress),
          `Deleted ${deletedTotal} of ${initialCount} event${initialCount === 1 ? '' : 's'}…`
        );

        if (current.paused || Number(current.retryAfterMs || 0) > 5000) await waitForCalendarResume(current, deletedTotal, Number(current.remaining === undefined ? initialCount - deletedTotal : current.remaining));
        current = await api('calendarWipeBatch', { wipeId: current.wipeId });
        if (current.inProgress && !current.paused) await new Promise(resolve => setTimeout(resolve, Math.max(180, Number(current.retryAfterMs) || 1200)));
        if ((current.errors || []).length) {
          const first = current.errors[0]?.error || 'Calendar deletion error.';
          throw new Error(
            `Wipe paused after ${Number(current.deletedTotal || 0)} deletions: ${first} ` +
            'Open URL Setup and Preview wipe to resume.'
          );
        }
      }

      setWorkProgress(100, `Wipe complete. ${Number(current.deletedTotal || 0)} Calendar event(s) deleted.`);
      await new Promise(resolve => setTimeout(resolve, 650));
      hideWorkOverlay();
      await loadBootstrap(state.year);
      toast(
        `${label} Calendar wipe complete. ` +
        `${Number(current.deletedTotal || 0)} event(s) deleted; ` +
        `${Number(current.resetBackendRows || 0)} backend row(s) reset for Sync.`
      );
    } catch (err) {
      hideWorkOverlay();
      toast(err.message || `${label} Calendar wipe paused.`, true);
      throw err;
    }
  }

  function calendarDiagnosticHtml(result) {
    if (!result) {
      return '<div class="diagnostic-error">No diagnostic result returned.</div>';
    }

    const effectiveUser = result.effectiveUser
      ? `<div class="privacy-note" style="margin-bottom:8px">Apps Script execution account: ${esc(result.effectiveUser)}</div>`
      : '';

    const card = item => {
      if (!item) return '';

      return `<div class="calendar-diagnostic-card ${item.accessible ? 'diagnostic-ok' : 'diagnostic-error-card'}">
        <strong>${esc(item.label || item.target || 'Calendar')}</strong>
        <div><span>Configured:</span> ${item.configured ? 'Yes' : 'No'}</div>
        <div><span>Accessible:</span> ${item.accessible ? 'Yes' : 'No'}</div>
        <div><span>Calendar name:</span> ${esc(item.name || '—')}</div>
        <div><span>Calendar ID:</span> <code>${esc(item.calendarId || '—')}</code></div>
        ${item.writeTestRequested
          ? `<div><span>Write permission:</span> ${
              item.writable === true ? 'Yes' :
              item.writable === false ? 'No' :
              'Not tested'
            }</div>`
          : ''}
        ${item.error
          ? `<div class="diagnostic-message">${esc(item.error)}</div>`
          : ''}
      </div>`;
    };

    return `${effectiveUser}<div class="calendar-diagnostic-grid">
      ${card(result.staff)}
      ${card(result.parent)}
    </div>
    <div class="privacy-note">Checked ${esc(result.testedAt || '')}</div>`;
  }


  /* =========================
   * MODALS
   * ========================= */

  function firstAvailableLaneDate(year, lane) {
    let d =
      new Date(
        Number(year),
        0,
        1,
        12
      );

    const last =
      new Date(
        Number(year),
        11,
        31,
        12
      );

    while (d <= last) {
      const key = isoDate(d);

      if (laneAvailableOnDate(lane, key)) {
        return key;
      }

      d = addDays(d, 1);
    }

    return `${year}-01-01`;
  }

  function defaultStartForLane(lane, shift, dateValue) {
    if (!lane) return '';

    const row =
      laneScheduleForDate(lane, dateValue) ||
      laneScheduleRows(lane)
        .find(r => yes(r.Enabled)) ||
      laneScheduleRows(lane)[0];

    if (yes(lane.SupportsShift)) {
      const span =
        String(shift || '').toUpperCase();

      if (span === 'PM_II') {
        return timeOnly(
          row?.ShiftBDefaultStartTime
        );
      }

      return timeOnly(
        row?.ShiftADefaultStartTime
      );
    }

    return timeOnly(
      row?.DefaultStartTime
    );
  }

  function defaultEndForLane(lane, shift, dateValue) {
    if (!lane) return '';

    const row =
      laneScheduleForDate(lane, dateValue) ||
      laneScheduleRows(lane)
        .find(r => yes(r.Enabled)) ||
      laneScheduleRows(lane)[0];

    if (yes(lane.SupportsShift)) {
      const span =
        String(shift || '').toUpperCase();

      if (span === 'PM_II' || span === 'BOTH') {
        return timeOnly(
          row?.ShiftBDefaultEndTime
        );
      }

      return timeOnly(
        row?.ShiftADefaultEndTime
      );
    }

    return timeOnly(
      row?.DefaultEndTime
    );
  }

  function inferAfterSchoolSpan(
    lane,
    startTime,
    endTime,
    fallback = 'NONE',
    dateValue = ''
  ) {
    if (!lane || !yes(lane.SupportsShift)) {
      return 'NONE';
    }

    const start =
      timeOnly(startTime);

    const end =
      timeOnly(endTime);

    const row =
      laneScheduleForDate(lane, dateValue);

    const split =
      timeOnly(
        row?.ShiftBDefaultStartTime ||
        lane.ShiftBDefaultStartTime
      ) || '15:30';

    if (!start || !end) {
      return String(
        fallback || 'PM_I'
      ).toUpperCase();
    }

    if (start < split && end > split) {
      return 'BOTH';
    }

    if (start >= split) {
      return 'PM_II';
    }

    return 'PM_I';
  }

  function openEventModal(event, defaults = {}) {
    if (!state.data.actor.isAdmin || !isCalendarEditable()) return;
    if(guardPendingEvent(event))return;
    rememberEditedEvent(event,defaults.anchorDate||defaults.StartDate);
    let expectedRevision=event?._revision || '';
    let reviewBaseline=defaults.reviewBaseline || (event ? JSON.parse(JSON.stringify(event)) : null);

    const years = state.data.years || [];
    const lanes = state.data.lanes || [];
    const tags = state.data.tags || [];
    const defaultLaneId = defaults.LaneID || lanes[0]?.LaneID || '';
    const defaultLane = lanes.find(l => l.LaneID === defaultLaneId) || {};
    const baseDate =
      defaults.StartDate ||
      (
        state.year
          ? firstAvailableLaneDate(state.year, defaultLane)
          : ''
      );

    const defaultVisibilityForYear = yearValue => {
      const row =
        years.find(y =>
          Number(y.Year) ===
          Number(yearValue)
        );

      return (
        String(row?.Status || '')
          .toUpperCase() === 'ACTIVE'
      )
        ? 'PUBLISHED'
        : 'HIDDEN';
    };

    const e = event || {
      Year: state.year,
      Status:
        defaultVisibilityForYear(
          state.year
        ),
      LaneID: defaultLaneId,
      ShiftSpan: defaults.ShiftSpan || (yes(defaultLane.SupportsShift) ? 'PM_I' : 'NONE'),
      OwnerTag: tags[0]?.Tag || '',
      EventType: String(defaultLane.DefaultEventType || 'ALL_DAY').toUpperCase(),
      StartDate: baseDate,
      EndDate: defaults.EndDate || baseDate,
      StartTime: defaultStartForLane(
        defaultLane,
        defaults.ShiftSpan || 'PM_I',
        baseDate
      ),
      EndTime: defaultEndForLane(
        defaultLane,
        defaults.ShiftSpan || 'PM_I',
        baseDate
      ),
      ParentEnabled: 'No',
      ...defaults
    };

    openModal(`
      <div class="modal-head"><h3>${event ? 'Edit Event' : 'Add Event'}</h3><button class="close-x" data-close>&times;</button></div>
      <form id="eventForm">
        <div class="modal-body">
          ${eventAttributionHtml(reviewBaseline)}
          <div class="form-grid">
            <div class="field"><label>Year</label><select name="Year">${years.map(y => `<option value="${esc(y.Year)}">${esc(y.Year)}</option>`).join('')}</select></div>
            <div class="field"><label>Visibility</label><select name="Status"><option value="HIDDEN">Hidden</option><option value="PUBLISHED">Published</option></select></div>
            <div class="field"><label>Display column</label><select name="LaneID">${lanes.map(l => `<option value="${esc(l.LaneID)}">${esc(l.Header)}</option>`).join('')}</select></div>
            <div id="shiftField" class="field"><label>After-school shift</label><select name="ShiftSpan"><option value="PM_I">PM(i)</option><option value="PM_II">PM(ii)</option><option value="BOTH">Both shifts</option></select></div>
            <div class="field"><label>Compulsory tag / owner</label><select name="OwnerTag">${tags.map(t => `<option value="${esc(t.Tag)}">[${esc(t.Tag)}] ${esc(t.Meaning)}</option>`).join('')}</select></div>
            <div class="field full"><label>Staff title</label><input name="StaffTitle" required value="${esc(e.StaffTitle || '')}"></div>
            <div class="field"><label>Event type</label><select name="EventType"><option value="ALL_DAY">All day · single day</option><option value="TIMED">Specific timing · one or more days</option><option value="MULTI_DAY">All day · multiple days</option></select></div>
            <div class="field"><label>Start date</label><input name="StartDate" type="date" required value="${esc(dateOnly(e.StartDate))}"></div>
            <div id="endDateField" class="field"><label>End date</label><input name="EndDate" type="date" value="${esc(dateOnly(e.EndDate || e.StartDate))}"></div>
            <div id="startTimeField" class="field"><label>Start time</label><input name="StartTime" type="time" value="${esc(timeOnly(e.StartTime))}"></div>
            <div id="endTimeField" class="field"><label>End time</label><input name="EndTime" type="time" value="${esc(timeOnly(e.EndTime))}"></div>
            <div id="laneAvailabilityNotice" class="field full hidden"><div class="notice compact-notice"></div></div>
            <div id="shiftSpanPreview" class="field full hidden"><div class="notice compact-notice"></div></div>
            <div class="field full calendar-venue-field"><label for="calendarVenueInput">Location (staff calendar)</label><div id="calendarVenueChips" class="calendar-venue-chips" aria-label="Selected locations"></div><input id="calendarVenueInput" value="" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="calendarVenueSuggestions" aria-describedby="calendarVenueHelp"><input type="hidden" name="Location" value="${esc(e.Location || '')}"><input type="hidden" name="VenueID" value="${esc(e.VenueID || '')}"><div id="calendarVenueSuggestions" class="calendar-venue-suggestions" role="listbox" hidden></div><small id="calendarVenueHelp">Add up to six locations. Find a school venue by name, unit or alias, or press Enter to add one custom location. Selecting a venue does not reserve it.</small></div>
            <div class="field full"><label>Staff description</label><textarea name="StaffDescription">${esc(e.StaffDescription || '')}</textarea></div>
          </div>

          <div class="card" style="margin-top:16px;background:#faf7f0">
            <h3>Parent-facing side</h3>
            <div class="form-grid">
              <div class="field full checkbox"><input id="parentEnabled" name="ParentEnabled" type="checkbox" ${yes(e.ParentEnabled) ? 'checked' : ''}><label for="parentEnabled">Clone to Parent-only calendar</label></div>
              <div class="field full"><label>Parent title (optional; staff title used if blank)</label><input name="ParentTitle" value="${esc(e.ParentTitle || '')}"></div>
              <div class="field full"><label>Parent description</label><textarea name="ParentDescription">${esc(e.ParentDescription || '')}</textarea></div>
              <div class="field full"><small>Parent event is always all-day, even when the staff event has a specific time.</small></div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          ${event ? '<button type="button" id="deleteEventBtn" class="danger">Delete</button><button type="button" id="moveCopyEventBtn" class="secondary">Move / Copy…</button>' : ''}
          <div class="spacer"></div>
          <button type="button" class="secondary" data-close>Cancel</button>
          <button id="eventSaveBtn" type="submit" class="primary">Save Event</button>
        </div>
      </form>
    `);
    loadEventEditAuthor(reviewBaseline);

    const form = $('eventForm');
    const venuePicker=bindCalendarVenuePicker(form);
    form.elements.Year.value = String(e.Year || state.year);
    if(event) $('moveCopyEventBtn').onclick=()=>{
      if(!confirmUnsavedChanges('move or copy the saved event'))return;
      openRelocation(reviewBaseline || event);
    };
    form.elements.Status.value =
      String(
        e.Status ||
        defaultVisibilityForYear(
          e.Year ||
          state.year
        )
      ).toUpperCase();
    form.elements.LaneID.value = e.LaneID || lanes[0]?.LaneID || '';
    form.elements.ShiftSpan.value = String(e.ShiftSpan || 'PM_I').toUpperCase();
    form.elements.OwnerTag.value = e.OwnerTag || tags[0]?.Tag || '';
    form.elements.EventType.value = String(e.EventType || 'ALL_DAY').toUpperCase();

    if (!event) {
      let visibilityManuallyChanged =
        false;

      form.elements.Status
        .addEventListener(
          'change',
          () => {
            visibilityManuallyChanged =
              true;
          }
        );

      form.elements.Year
        .addEventListener(
          'change',
          () => {
            if (
              visibilityManuallyChanged
            ) {
              return;
            }

            form.elements.Status.value =
              defaultVisibilityForYear(
                form.elements.Year.value
              );
          }
        );
    }

    const existingPlacementException = (lane, dateValue) =>
      !!event &&
      String(event.LaneID || '') === String(lane?.LaneID || '') &&
      dateOnly(event.StartDate) === dateOnly(dateValue);

    const selectedLane = () =>
      lanes.find(
        l => l.LaneID === form.elements.LaneID.value
      );

    const refreshLaneAvailability = () => {
      const dateValue =
        form.elements.StartDate.value;

      [...form.elements.LaneID.options]
        .forEach(option => {
          const lane =
            lanes.find(
              l => l.LaneID === option.value
            );

          const available =
            laneAvailableOnDate(
              lane,
              dateValue
            ) ||
            existingPlacementException(
              lane,
              dateValue
            );

          option.disabled =
            !available;
        });

      const lane =
        selectedLane();

      const available =
        laneAvailableOnDate(
          lane,
          dateValue
        ) ||
        existingPlacementException(
          lane,
          dateValue
        );

      const box =
        $('laneAvailabilityNotice');

      const saveBtn =
        $('eventSaveBtn');

      if (available) {
        box.classList.add('hidden');
        saveBtn.disabled = false;

      } else {
        const code =
          weekdayCodeForDate(dateValue);

        const day =
          LANE_WEEKDAYS.find(
            d => d.code === code
          )?.label || code;

        box
          .querySelector('.notice')
          .textContent =
            `${lane?.Header || 'This column'} is not configured for ${day}. ` +
            `Enable that day under Columns before adding or moving an event here.`;

        box.classList.remove('hidden');
        saveBtn.disabled = true;
      }
    };

    const refreshShiftPreview = () => {
      const lane =
        selectedLane();

      const box =
        $('shiftSpanPreview');

      if (
        !yes(lane?.SupportsShift) ||
        form.elements.EventType.value !== 'TIMED'
      ) {
        box.classList.add('hidden');
        return;
      }

      const span =
        inferAfterSchoolSpan(
          lane,
          form.elements.StartTime.value,
          form.elements.EndTime.value,
          form.elements.ShiftSpan.value,
          form.elements.StartDate.value
        );

      const text =
        span === 'BOTH'
          ? `${lane.Header} · ${lane.ShiftALabel || 'PM(i)'} + ${lane.ShiftBLabel || 'PM(ii)'} · spans both shifts`
          : `${lane.Header} · ${
              span === 'PM_II'
                ? (lane.ShiftBLabel || 'PM(ii)')
                : (lane.ShiftALabel || 'PM(i)')
            }`;

      box
        .querySelector('.notice')
        .textContent =
          text;

      box.classList.remove('hidden');

      form.elements.ShiftSpan.value =
        span;
    };

    const applyLaneDefaults = forceTimes => {
      const lane =
        selectedLane();

      $('shiftField')
        .classList.toggle(
          'hidden',
          !yes(lane?.SupportsShift)
        );

      if (!event && forceTimes) {
        form.elements.EventType.value =
          String(
            lane?.DefaultEventType ||
            'ALL_DAY'
          ).toUpperCase();

        const shift =
          form.elements.ShiftSpan.value ||
          'PM_I';

        const dateValue =
          form.elements.StartDate.value;

        form.elements.StartTime.value =
          defaultStartForLane(
            lane,
            shift,
            dateValue
          );

        form.elements.EndTime.value =
          defaultEndForLane(
            lane,
            shift,
            dateValue
          );
      }

      const type =
        form.elements.EventType.value;

      $('endDateField')
        .classList.toggle(
          'hidden',
          type !== 'MULTI_DAY' && type !== 'TIMED'
        );

      $('startTimeField')
        .classList.toggle(
          'hidden',
          type !== 'TIMED'
        );

      $('endTimeField')
        .classList.toggle(
          'hidden',
          type !== 'TIMED'
        );

      refreshLaneAvailability();
      refreshShiftPreview();
    };

    form.elements.LaneID
      .addEventListener(
        'change',
        () => applyLaneDefaults(true)
      );

    let previousStartDate=form.elements.StartDate.value;
    form.elements.StartDate
      .addEventListener(
        'change',
        () => {
          // Preserve the familiar single-day editor behaviour, while leaving
          // an explicitly chosen multi-day end date under the user's control.
          if(form.elements.EndDate.value===previousStartDate)form.elements.EndDate.value=form.elements.StartDate.value;
          previousStartDate=form.elements.StartDate.value;
          refreshLaneAvailability();

          if (!event) {
            applyLaneDefaults(true);
          } else {
            refreshShiftPreview();
          }
        }
      );

    form.elements.ShiftSpan
      .addEventListener(
        'change',
        () => {
          if (!event) {
            const lane =
              selectedLane();

            const dateValue =
              form.elements.StartDate.value;

            form.elements.StartTime.value =
              defaultStartForLane(
                lane,
                form.elements.ShiftSpan.value,
                dateValue
              );

            form.elements.EndTime.value =
              defaultEndForLane(
                lane,
                form.elements.ShiftSpan.value,
                dateValue
              );
          }

          refreshShiftPreview();
        }
      );

    form.elements.EventType
      .addEventListener(
        'change',
        () => applyLaneDefaults(false)
      );

    form.elements.StartTime
      .addEventListener(
        'input',
        refreshShiftPreview
      );

    form.elements.EndTime
      .addEventListener(
        'input',
        refreshShiftPreview
      );

    applyLaneDefaults(false);

    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if(!venuePicker.commit())return;
      const f = new FormData(form);
      const payload = {
        expectedRevision,
        event: {
          EventID: e.EventID || '',
          Year: Number(f.get('Year')),
          Status: f.get('Status'),
          LaneID: f.get('LaneID'),
          ShiftSpan: inferAfterSchoolSpan(
            lanes.find(l => l.LaneID === f.get('LaneID')),
            f.get('StartTime'),
            f.get('EndTime'),
            f.get('ShiftSpan') || 'NONE',
            f.get('StartDate')
          ),
          OwnerTag: f.get('OwnerTag'),
          StaffTitle: f.get('StaffTitle'),
          EventType: f.get('EventType'),
          StartDate: f.get('StartDate'),
          EndDate: f.get('EndDate') || f.get('StartDate'),
          StartTime: f.get('StartTime'),
          EndTime: f.get('EndTime'),
          Location: f.get('Location'),
          VenueID: f.get('VenueID'),
          StaffDescription: f.get('StaffDescription'),
          ParentEnabled: form.elements.ParentEnabled.checked ? 'Yes' : 'No',
          ParentTitle: f.get('ParentTitle'),
          ParentDescription: f.get('ParentDescription')
        }
      };

      const proposed=payload.event;
      if(!String(proposed.StaffTitle||'').trim()||!proposed.OwnerTag||!proposed.LaneID||!proposed.StartDate||!proposed.EndDate){toast('Complete the title, glossary tag, lane and dates before saving.',true);return;}
      if(proposed.EndDate<proposed.StartDate||(proposed.EventType==='TIMED'&&(!proposed.StartTime||!proposed.EndTime||(proposed.EndDate===proposed.StartDate&&proposed.EndTime<=proposed.StartTime)))){toast('End must be after the start. Check the event dates and times.',true);return;}
      showWorkOverlay('Saving Event', state.calendarJobsEnabled?'Accepting your event proposal…':'Writing event to the backend…');
      try {
        const response =
          await api('saveEvent', payload);

        if(isCalendarJob(response)){finishQueuedEvent(response,[reviewBaseline]);return;}

        const saved =
          upsertLocalEvent(response);

        if(Number(saved.Year)!==Number(state.year)) {
          closeModal(true); hideWorkOverlay();
          try { await loadBootstrap(Number(saved.Year),true); }
          catch(loadError) { toast(`Event saved in ${saved.Year}, but that calendar could not be loaded. Use the year selector to try again.`,true); return; }
        }

        setWorkProgress(
          100,
          'Saved. Updating view…'
        );

        refreshEventViewLocally({close:true,affected:[reviewBaseline,saved]});

        toast('Event saved. Awaiting Sync.');
      } catch (err) {
        if(err.code==='STALE_CALENDAR_CONTEXT')return;
        if($('eventForm')!==form)return;
        hideWorkOverlay();
        showConflictReview(err,reviewBaseline || e,payload.event,latest=>{expectedRevision=latest._revision;reviewBaseline=latest;});
      }
    });

    if (event) {
      $('deleteEventBtn').addEventListener('click', async () => {
        if (!confirm('Delete this event? It will be removed from Google Calendars on the next Sync Changes run.')) return;
        showWorkOverlay('Deleting Event', 'Marking event for deletion…');
        try {
          const response=await api(
            'deleteEvent',
            {
              eventId:
                event.EventID,
              expectedRevision
            }
          );

          if(isCalendarJob(response)){finishQueuedEvent(response,[reviewBaseline || event]);return;}

          removeLocalEvent(
            event.EventID
          );

          setWorkProgress(
            100,
            'Deleted. Updating view…'
          );

          refreshEventViewLocally({close:true,affected:[reviewBaseline || event]});

          toast(
            'Event deleted. Calendar removal is awaiting Sync.'
          );

        } catch (err) {
          if(err.code==='STALE_CALENDAR_CONTEXT')return;
          if($('eventForm')!==form)return;
          hideWorkOverlay();
          showConflictReview(err,reviewBaseline || event,reviewBaseline || event,latest=>{expectedRevision=latest._revision;reviewBaseline=latest;});
        }
      });
    }
  }

  function openParentModal(e, inlineConflict = null, anchorDate = null) {
    if (!(state.data.actor.isAdmin || state.data.actor.isParentPublisher) || !isCalendarEditable()) return;
    if(guardPendingEvent(e))return;
    rememberEditedEvent(e,anchorDate);
    let expectedRevision=e._revision;
    let reviewBaseline=JSON.parse(JSON.stringify(e));
    const display = inlineConflict?.proposal || e;

    openModal(`
      <div class="modal-head"><h3>Parent-facing Event</h3><button class="close-x" data-close>&times;</button></div>
      <form id="parentForm">
        <div class="modal-body">
          <div class="card">
            <strong>[${esc(e.OwnerTag)}] ${esc(e.StaffTitle)}</strong>
            ${eventAttributionHtml(e)}
            <div style="color:var(--muted);margin-top:5px">${esc(eventDateLabel(e))}</div>
          </div>
          <div class="form-grid">
            <div class="field full checkbox"><input id="pEnabled" name="ParentEnabled" type="checkbox" ${yes(display.ParentEnabled) ? 'checked' : ''}><label for="pEnabled">Include on Parent-only calendar</label></div>
            <div class="field full"><label>Parent title (optional)</label><input name="ParentTitle" value="${esc(display.ParentTitle || '')}" placeholder="${esc(e.StaffTitle || '')}"></div>
            <div class="field full"><label>Parent description</label><textarea name="ParentDescription">${esc(display.ParentDescription || '')}</textarea></div>
            <div class="field full"><small>Parent version is always an all-day event. Staff-side details cannot be edited here.</small></div>
          </div>
        </div>
        <div class="modal-foot">
          <button type="button" class="secondary" data-close>Cancel</button>
          <button type="submit" class="primary">Save Parent Side</button>
        </div>
      </form>
    `);
    loadEventEditAuthor(e);

    if (inlineConflict) {
      const saveButton = $('parentForm').querySelector('button[type="submit"]');
      saveButton.disabled = true;
      showConflictReview(inlineConflict.err, reviewBaseline, inlineConflict.proposal, latest => {
        expectedRevision = latest._revision;
        reviewBaseline = latest;
        saveButton.disabled = false;
      });
    }

    $('parentForm').addEventListener('submit',async ev=>{
      ev.preventDefault();if(state.pendingMutation)return;
      const form=ev.currentTarget,f=new FormData(form);
      const payload={eventId:e.EventID,expectedRevision,ParentEnabled:form.elements.ParentEnabled.checked?'Yes':'No',ParentTitle:f.get('ParentTitle'),ParentDescription:f.get('ParentDescription')};
      showWorkOverlay('Saving Parent Event','Saving…');
      try{
        const response=await api('saveParentSide',payload);
        if(isCalendarJob(response)){finishQueuedEvent(response,[reviewBaseline]);return;}
        const saved=upsertLocalEvent(response);
        refreshEventViewLocally({close:true,affected:[reviewBaseline,saved]});toast('Parent-facing details saved. Awaiting sync.');
      }catch(err){
        if(err.code==='STALE_CALENDAR_CONTEXT')return;
        if($('parentForm')!==form)return;
        hideWorkOverlay();
        const submitButton = form.querySelector('button[type="submit"]');
        if (inlineConflict && err.code === 'CONFLICT') submitButton.disabled = true;
        showConflictReview(err,reviewBaseline,payload,latest=>{
          expectedRevision=latest._revision;
          reviewBaseline=latest;
          if (inlineConflict) submitButton.disabled = false;
        });
      }
    });
  }

  function openTagModal(tag) {
    const expectedMetadataRevision=tag?state.data.metadataRevisions?.tags?.[String(tag.Tag).toLowerCase()]:'missing';
    openModal(`
      <div class="modal-head"><h3>${tag ? 'Edit Tag' : 'Add Tag'}</h3><button class="close-x" data-close>&times;</button></div>
      <form id="tagForm">
        <div class="modal-body form-grid">
          <div class="field full"><label>Tag</label><input name="Tag" required maxlength="22" value="${esc(tag ? `[${tag.Tag}]` : '')}" ${tag ? 'readonly' : ''} placeholder="[SDT] or SDT"><small class="privacy-note">Brackets are optional. The system stores SDT and displays [SDT].</small></div>
          <input name="SortOrder" type="hidden" value="${esc(tag?.SortOrder || '')}">
          <div class="field full"><label>Meaning</label><input name="Meaning" required value="${esc(tag?.Meaning || '')}"></div>
          <div class="field full checkbox"><input id="tagActive" name="Active" type="checkbox" ${tag ? (yes(tag.Active) ? 'checked' : '') : 'checked'}><label for="tagActive">Active</label></div>
        </div>
        <div class="modal-foot"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Save Tag</button></div>
      </form>
    `);

    $('tagForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const f = new FormData(form);
      const owner=calendarOwnerContext();

      showWorkOverlay('Saving Glossary', 'Writing tag to the backend…');
      setWorkProgress(28, 'Writing tag to the backend…');

      try {
        const saved=await api('saveTag', {
          expectedMetadataRevision,
          Tag: f.get('Tag'),
          Meaning: f.get('Meaning'),
          SortOrder: f.get('SortOrder') ? Number(f.get('SortOrder')) : '',
          Active: form.elements.Active.checked ? 'Yes' : 'No'
        });

        if(!sameCalendarOwner(owner))return;
        applyGlossaryRecord(saved);if($('tagForm')===form){closeModal(true);hideWorkOverlay();}toast('Glossary tag saved.');
      } catch (err) {
        if(!sameCalendarOwner(owner)||$('tagForm')!==form)return;
        hideWorkOverlay();
        toast(err.message, true);
      }
    });
  }

  function openLaneModal(lane) {
    const expectedMetadataRevision=lane?state.data.metadataRevisions?.lanes?.[lane.LaneID]:'missing';
    const l =
      lane || {
        LaneID: '',
        Header: '',
        SortOrder: 999,
        Active: 'Yes',
        SupportsShift: 'No',
        ShiftALabel: '',
        ShiftBLabel: '',
        DefaultWeekday: 'ANY',
        DefaultEventType: 'ALL_DAY',
        DefaultStartTime: '',
        DefaultEndTime: '',
        ShiftADefaultStartTime: '',
        ShiftADefaultEndTime: '',
        ShiftBDefaultStartTime: '',
        ShiftBDefaultEndTime: '',
        SyncToStaffCalendar: 'Yes',
        Schedule: []
      };

    const schedule =
      laneScheduleRows(l);

    const scheduleHtml =
      LANE_WEEKDAYS.map(day => {
        const row =
          schedule.find(
            r =>
              String(r.Weekday || '').toUpperCase() === day.code
          ) || {};

        return `
          <div class="lane-schedule-row" data-schedule-day="${day.code}">
            <label class="lane-day-toggle">
              <input
                type="checkbox"
                data-schedule-enabled="${day.code}"
                ${yes(row.Enabled) ? 'checked' : ''}
              >
              <span>${day.label}</span>
            </label>

            <div class="lane-single-times">
              <input
                type="time"
                aria-label="${day.label} start time"
                data-schedule-day="${day.code}"
                data-schedule-field="DefaultStartTime"
                value="${esc(timeOnly(row.DefaultStartTime))}"
              >
              <span>to</span>
              <input
                type="time"
                aria-label="${day.label} end time"
                data-schedule-day="${day.code}"
                data-schedule-field="DefaultEndTime"
                value="${esc(timeOnly(row.DefaultEndTime))}"
              >
            </div>

            <div class="lane-shift-times">
              <span class="lane-shift-tag">${esc(l.ShiftALabel || 'PM(i)')}</span>
              <input
                type="time"
                aria-label="${day.label} shift A start"
                data-schedule-day="${day.code}"
                data-schedule-field="ShiftADefaultStartTime"
                value="${esc(timeOnly(row.ShiftADefaultStartTime))}"
              >
              <span>to</span>
              <input
                type="time"
                aria-label="${day.label} shift A end"
                data-schedule-day="${day.code}"
                data-schedule-field="ShiftADefaultEndTime"
                value="${esc(timeOnly(row.ShiftADefaultEndTime))}"
              >

              <span class="lane-shift-tag">${esc(l.ShiftBLabel || 'PM(ii)')}</span>
              <input
                type="time"
                aria-label="${day.label} shift B start"
                data-schedule-day="${day.code}"
                data-schedule-field="ShiftBDefaultStartTime"
                value="${esc(timeOnly(row.ShiftBDefaultStartTime))}"
              >
              <span>to</span>
              <input
                type="time"
                aria-label="${day.label} shift B end"
                data-schedule-day="${day.code}"
                data-schedule-field="ShiftBDefaultEndTime"
                value="${esc(timeOnly(row.ShiftBDefaultEndTime))}"
              >
            </div>
          </div>`;
      }).join('');

    openModal(`
      <div class="modal-head">
        <h3>${lane ? 'Edit Column' : 'Add Column'}</h3>
        <button class="close-x" data-close>&times;</button>
      </div>

      <form id="laneForm">
        <div class="modal-body">
          <div class="form-grid">
            <div class="field">
              <label>Lane ID</label>
              <input
                name="LaneID"
                required
                pattern="[a-z0-9_]+"
                value="${esc(l.LaneID)}"
                ${lane ? 'readonly' : ''}
              >
            </div>

            <div class="field">
              <label>Header shown to users</label>
              <input
                name="Header"
                required
                value="${esc(l.Header)}"
              >
            </div>

            <div class="field">
              <label>Sort order</label>
              <input
                name="SortOrder"
                type="number"
                value="${esc(l.SortOrder)}"
              >
            </div>

            <div class="field">
              <label>Default event type</label>
              <select name="DefaultEventType">
                <option value="ALL_DAY">All day</option>
                <option value="TIMED">Timed</option>
                <option value="MULTI_DAY">Multi-day</option>
              </select>
            </div>

            <div class="field checkbox">
              <input
                id="laneActive"
                name="Active"
                type="checkbox"
                ${yes(l.Active) ? 'checked' : ''}
              >
              <label for="laneActive">Active</label>
            </div>

            <div class="field checkbox">
              <input
                id="supportsShift"
                name="SupportsShift"
                type="checkbox"
                ${yes(l.SupportsShift) ? 'checked' : ''}
              >
              <label for="supportsShift">Two after-school shifts</label>
            </div>

            <div class="field checkbox">
              <input
                id="syncLane"
                name="SyncToStaffCalendar"
                type="checkbox"
                ${yes(l.SyncToStaffCalendar) ? 'checked' : ''}
              >
              <label for="syncLane">Sync this lane to Staff Calendar</label>
            </div>

            <div id="shiftLabelFields" class="field full">
              <div class="form-grid">
                <div class="field">
                  <label>Shift A label</label>
                  <input
                    name="ShiftALabel"
                    value="${esc(l.ShiftALabel || '')}"
                    placeholder="PM(i)"
                  >
                </div>

                <div class="field">
                  <label>Shift B label</label>
                  <input
                    name="ShiftBLabel"
                    value="${esc(l.ShiftBLabel || '')}"
                    placeholder="PM(ii)"
                  >
                </div>
              </div>
            </div>

            <div class="field full">
              <label>Available days & default timing</label>
              <p class="privacy-note" style="margin-top:0">
                Tick every weekday on which this column may accept a new event.
                Timings below are defaults only and may still be changed per event.
              </p>

              <div id="laneScheduleEditor" class="lane-schedule-editor">
                ${scheduleHtml}
              </div>
            </div>

            <div class="field full">
              <label>Notes</label>
              <textarea name="Notes">${esc(l.Notes || '')}</textarea>
            </div>
          </div>
        </div>

        <div class="modal-foot">
          <button type="button" class="secondary" data-close>Cancel</button>
          <button type="submit" class="primary">Save Column</button>
        </div>
      </form>
    `);

    const form =
      $('laneForm');

    form.elements.DefaultEventType.value =
      String(
        l.DefaultEventType || 'ALL_DAY'
      ).toUpperCase();

    const refreshLaneFields = () => {
      const shifted =
        form.elements.SupportsShift.checked;

      const timed =
        form.elements.DefaultEventType.value === 'TIMED';

      $('shiftLabelFields')
        .classList.toggle(
          'hidden',
          !shifted
        );

      $('laneScheduleEditor')
        .classList.toggle(
          'schedule-not-timed',
          !timed
        );

      $('laneScheduleEditor')
        .classList.toggle(
          'schedule-shifted',
          shifted
        );

      const aLabel =
        form.elements.ShiftALabel.value ||
        'PM(i)';

      const bLabel =
        form.elements.ShiftBLabel.value ||
        'PM(ii)';

      document
        .querySelectorAll(
          '.lane-schedule-row .lane-shift-tag'
        )
        .forEach((tag, index) => {
          tag.textContent =
            index % 2 === 0
              ? aLabel
              : bLabel;
        });
    };

    form.elements.SupportsShift
      .addEventListener(
        'change',
        refreshLaneFields
      );

    form.elements.DefaultEventType
      .addEventListener(
        'change',
        refreshLaneFields
      );

    form.elements.ShiftALabel
      .addEventListener(
        'input',
        refreshLaneFields
      );

    form.elements.ShiftBLabel
      .addEventListener(
        'input',
        refreshLaneFields
      );

    refreshLaneFields();

    const collectSchedule = () =>
      LANE_WEEKDAYS.map(day => {
        const enabled =
          form.querySelector(
            `[data-schedule-enabled="${day.code}"]`
          );

        const getField = field =>
          form.querySelector(
            `[data-schedule-day="${day.code}"][data-schedule-field="${field}"]`
          )?.value || '';

        return {
          Weekday: day.code,
          Enabled:
            enabled?.checked
              ? 'Yes'
              : 'No',
          DefaultStartTime:
            getField('DefaultStartTime'),
          DefaultEndTime:
            getField('DefaultEndTime'),
          ShiftADefaultStartTime:
            getField('ShiftADefaultStartTime'),
          ShiftADefaultEndTime:
            getField('ShiftADefaultEndTime'),
          ShiftBDefaultStartTime:
            getField('ShiftBDefaultStartTime'),
          ShiftBDefaultEndTime:
            getField('ShiftBDefaultEndTime')
        };
      });

    form.addEventListener(
      'submit',
      async ev => {
        ev.preventDefault();

        const f =
          new FormData(form);

        const weeklySchedule =
          collectSchedule();

        const enabled =
          weeklySchedule
            .filter(row => yes(row.Enabled));

        showWorkOverlay(
          'Saving Column',
          'Writing weekly availability and default timings…'
        );

        try {
          await api(
            'saveLane',
            {
              expectedMetadataRevision,
              LaneID:
                f.get('LaneID'),

              Header:
                f.get('Header'),

              SortOrder:
                f.get('SortOrder')
                  ? Number(f.get('SortOrder'))
                  : '',

              Active:
                form.elements.Active.checked
                  ? 'Yes'
                  : 'No',

              SupportsShift:
                form.elements.SupportsShift.checked
                  ? 'Yes'
                  : 'No',

              ShiftALabel:
                f.get('ShiftALabel'),

              ShiftBLabel:
                f.get('ShiftBLabel'),

              DefaultEventType:
                f.get('DefaultEventType'),

              Schedule:
                weeklySchedule,

              // Legacy compatibility fields. RC1.0 runtime uses Schedule.
              DefaultWeekday:
                enabled.length === 1
                  ? enabled[0].Weekday
                  : 'ANY',

              DefaultStartTime:
                enabled[0]?.DefaultStartTime || '',

              DefaultEndTime:
                enabled[0]?.DefaultEndTime || '',

              ShiftADefaultStartTime:
                enabled[0]?.ShiftADefaultStartTime || '',

              ShiftADefaultEndTime:
                enabled[0]?.ShiftADefaultEndTime || '',

              ShiftBDefaultStartTime:
                enabled[0]?.ShiftBDefaultStartTime || '',

              ShiftBDefaultEndTime:
                enabled[0]?.ShiftBDefaultEndTime || '',

              SyncToStaffCalendar:
                form.elements.SyncToStaffCalendar.checked
                  ? 'Yes'
                  : 'No',

              Notes:
                f.get('Notes')
            }
          );

          await finishWriteAndReload(
            'columns',
            'Refreshing Columns…',
            true
          );

        } catch (err) {
          hideWorkOverlay();
          toast(
            err.message,
            true
          );
        }
      }
    );
  }


  function openPersonModal(person) {
    const expectedMetadataRevision=person?state.data.metadataRevisions?.users?.[String(person.userAlias).toLowerCase()]:'missing';
    const p = person || { userAlias: '', displayName: '', isAdmin: false, isParentPublisher: false };
    openModal(`
      <div class="modal-head"><h3>Frontend Role</h3><button class="close-x" data-close>&times;</button></div>
      <form id="personForm">
        <div class="modal-body form-grid">
          <div class="field"><label>GSPS user alias</label><input name="UserAlias" required value="${esc(p.userAlias || '')}" placeholder="e.g. song.wee"></div>
          <div class="field"><label>Display name</label><input name="DisplayName" value="${esc(p.displayName || '')}"></div>
          <div class="field full checkbox"><input id="isAdmin" name="IsAdmin" type="checkbox" ${p.isAdmin ? 'checked' : ''}><label for="isAdmin">Admin — full staff-side configuration/edit + parent-side edit</label></div>
          <div class="field full checkbox"><input id="isParent" name="IsParentPublisher" type="checkbox" ${p.isParentPublisher ? 'checked' : ''}><label for="isParent">Parent Publisher — parent-facing side only</label></div>
          <div class="field full checkbox"><input id="personActive" name="Active" type="checkbox" ${p.active!==false?'checked':''}><label for="personActive">Active privileged entry</label></div>
          ${!person?'<p class="privacy-note full">To change an existing entry, choose Edit in People &amp; Roles.</p>':''}
        </div>
        <div class="modal-foot"><button type="button" class="secondary" data-close>Cancel</button><button type="submit" class="primary">Save Role</button></div>
      </form>
    `);

    $('personForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const form = ev.currentTarget;
      const f = new FormData(form);
      showWorkOverlay('Saving Role', 'Writing People & Roles entry…');
      try {
        await api('saveUser', {
          expectedMetadataRevision:String(f.get('UserAlias')).trim().toLowerCase()===String(person?.userAlias||'').toLowerCase()?expectedMetadataRevision:'missing',
          UserAlias: f.get('UserAlias'),
          DisplayName: f.get('DisplayName'),
          IsAdmin: form.elements.IsAdmin.checked ? 'Yes' : 'No',
          IsParentPublisher: form.elements.IsParentPublisher.checked ? 'Yes' : 'No',
          Active: form.elements.Active.checked ? 'Yes' : 'No'
        });
        await finishWriteAndReload('people', 'Refreshing People & Roles…', true);
      } catch (err) {
        hideWorkOverlay();
        toast(err.message, true);
      }
    });
  }

  function openModal(innerHtml) {
    if(!$('modalHost').firstElementChild)state.modalReturnFocus=document.activeElement;
    $('modalHost').innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="Calendar editor">${innerHtml}</div></div>`;
    $('modalHost').onkeydown=ev=>{
      if(ev.key==='Escape'){ev.preventDefault();closeModal(false);}
      if(ev.key==='Tab'){
        const all=[...$('modalHost').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(e=>e.getClientRects().length);
        const first=all[0],last=all[all.length-1];
        if(ev.shiftKey && document.activeElement===first){ev.preventDefault();last?.focus();}
        else if(!ev.shiftKey && document.activeElement===last){ev.preventDefault();first?.focus();}
      }
    };
    requestAnimationFrame(()=>$('modalHost').querySelector('[autofocus],input:not(:disabled),select:not(:disabled),button')?.focus());
    $('modalHost')
      .querySelectorAll('[data-close]')
      .forEach(btn =>
        btn.addEventListener(
          'click',
          () => closeModal(false)
        )
      );
    const backdrop = $('modalHost').querySelector('.modal-backdrop');
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal();
    });
  }

  function closeModal(force = false) {
    if(state.pendingMutation){toast('Resolve the pending save before closing this proposal.',true);return false;}
    const modalHost = $('modalHost');

    if (
      !force &&
      modalHost?.querySelector(
        'form[data-dirty="1"]'
      )
    ) {
      const leave = confirm(
        'This form has unsaved changes. Close it without saving?'
      );

      if (!leave) {
        return false;
      }
    }

    modalHost.innerHTML = '';
    if(state.modalReturnFocus?.isConnected)state.modalReturnFocus.focus({preventScroll:true});
    drainDeferredRefresh();
    return true;
  }

  /* =========================
   * SYNC
   * ========================= */

  function beginCalendarOperation() {
    if (!state.data?.actor.isAdmin || !state.year || !isCalendarEditable()) return null;
    if (interactionsBusy()) {
      toast('Finish or close the current form before publishing or syncing.', true);
      return null;
    }
    const operation = {year: Number(state.year), published: false};
    state.calendarOperation = operation;
    renderYearSelect();
    updateFreshnessUI();
    return operation;
  }

  function assertCalendarOperation(operation) {
    if(operation.waitStopped)throw calendarSyncStoppedError();
    if (state.calendarOperation !== operation || Number(state.year) !== operation.year || !state.data?.actor.isAdmin) {
      throw new Error('The selected calendar changed. Refresh the intended year before continuing.');
    }
  }

  function finishCalendarOperation(operation) {
    if (state.calendarOperation !== operation) return;
    state.calendarOperation = null;
    $('stopSyncWaiting')?.classList.add('hidden');
    hideWorkOverlay();
    if (state.data) { renderYearSelect(); updateFreshnessUI(); }
    drainDeferredRefresh();
  }

  function readPublicationRequests() {
    try {
      const stored = JSON.parse(sessionStorage.getItem(PUBLICATION_REQUESTS_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter(pair => Array.isArray(pair) && /^[^|]{1,128}\|(?:20\d{2}|2100)$/.test(pair[0]) && /^[\da-f-]{36}$/i.test(pair[1])) : [];
    } catch { return []; }
  }

  function savePublicationRequests() {
    // Retain request identities across reloads without storing calendar content.
    try { sessionStorage.setItem(PUBLICATION_REQUESTS_KEY, JSON.stringify([...publicationRequests])); } catch {}
  }

  const birthdayRequests = new Map(readBirthdayRequests());
  function readBirthdayRequests() {
    try {
      const value = JSON.parse(sessionStorage.getItem('gspsCalBirthdayRequests') || '[]');
      return Array.isArray(value) ? value.filter(pair => Array.isArray(pair) && /^[^|]{1,128}\|(?:20\d{2}|2100)$/.test(pair[0]) && /^[\da-f-]{36}$/i.test(pair[1])) : [];
    } catch { return []; }
  }
  function saveBirthdayRequests() {
    try { sessionStorage.setItem('gspsCalBirthdayRequests', JSON.stringify([...birthdayRequests])); } catch {}
  }
  function showBirthdayStatus(message, busy = false, error = false) {
    const status = $('birthdayPullStatus');
    status.textContent = message;
    status.classList.remove('hidden');
    status.classList.toggle('loading', busy);
    status.classList.toggle('error', error);
    status.setAttribute('aria-busy', String(busy));
  }
  async function pullBirthdays() {
    const operation = beginCalendarOperation();
    if (!operation) return;
    const year = operation.year;
    const key = `${String(state.data.actor.userAlias || '').toLowerCase()}|${year}`;
    const operationId = birthdayRequests.get(key) || crypto.randomUUID();
    birthdayRequests.set(key, operationId);
    saveBirthdayRequests();
    showBirthdayStatus(`Reading Contacts and updating birthdays for ${year}…`, true);
    let saved = false;
    try {
      const result = await api('pullBirthdays', {year, operationId});
      if (Number(result?.year) !== year || ['created','updated','removed','skipped','unchanged'].some(k => !Number.isInteger(result?.[k]) || result[k] < 0)) throw new Error('The server did not confirm the birthday update.');
      saved = true;
      birthdayRequests.delete(key);
      saveBirthdayRequests();
      assertCalendarOperation(operation);
      const counts = `${year}: ${result.created} created, ${result.updated} updated, ${result.removed} removed, ${result.skipped} skipped, ${result.unchanged} unchanged.`;
      showBirthdayStatus(`${counts} Refreshing the year…`, true);
      await loadBootstrap(year);
      showBirthdayStatus(`${counts} Use Sync Staff to update the staff calendar. Hidden events follow the normal publication workflow.`);
    } catch (err) {
      if (err.definite) { birthdayRequests.delete(key); saveBirthdayRequests(); }
      showBirthdayStatus(saved
        ? `Birthdays were saved for ${year}. Refresh this year, then use Sync Staff. ${err.message}`
        : `${err.message} ${err.definite ? 'Correct the problem, then try again.' : 'The update is not confirmed. Click Update birthdays from Contacts again to check the same update.'}`, false, true);
    } finally {
      finishCalendarOperation(operation);
    }
  }

  async function publishVersion() {
    if (!state.data?.actor.isAdmin || !state.year || !isCalendarEditable()) return;
    if (interactionsBusy()) {
      toast('Finish or close the current form before publishing or syncing.', true);
      return;
    }
    const year = Number(state.year);
    const requestKey = `${String(state.data.actor.userAlias || state.data.actor.email || '').toLowerCase()}|${year}`;
    const retry = publicationRequests.get(requestKey);
    const message = retry
      ? `Retry the previous Publish version request for ${year}, then sync the Staff Calendar?`
      : `Publish version ${year}? This releases the year to teachers, changes every live Hidden event in ${year} to Published, then syncs the Staff Calendar. Only columns enabled for Staff Calendar sync are included.`;
    if (!confirm(message)) return;
    const operation = beginCalendarOperation();
    if (!operation || operation.year !== year) {
      if (operation) finishCalendarOperation(operation);
      return;
    }
    const operationId = retry || crypto.randomUUID();
    publicationRequests.set(requestKey, operationId);
    savePublicationRequests();
    showWorkOverlay(`Publishing ${year}`, 'Publishing Hidden events and releasing the year…');
    try {
      const result = await api('publishVersion', {year, operationId});
      if (Number(result?.year) !== year || !Number.isFinite(result?.published) || !yes(result?.ReleasedToTeachers)) {
        throw new Error('The server did not confirm publication.');
      }
      publicationRequests.delete(requestKey);
      savePublicationRequests();
      operation.published = true;
      assertCalendarOperation(operation);
      setWorkProgress(35, `${result.published} event(s) published. Refreshing before Staff Calendar sync…`);
      const refreshed = await loadBootstrap(year);
      assertCalendarOperation(operation);
      if (!refreshed) throw new Error('The published year could not be verified.');
      await syncYear('staff', operation);
    } catch (err) {
      if (err.definite) { publicationRequests.delete(requestKey); savePublicationRequests(); }
      if(err.code==='STALE_DISPATCH')await loadBootstrap(year).catch(()=>{});
      toast(operation.published
        ? `${year} is published. Staff sync did not start. Refresh this year, then click Sync Staff. ${err.message}`
        : `${err.message} ${err.definite ? 'Correct the problem, then click Publish version again.' : 'Click Publish version again to retry the same request.'}`, true);
    } finally {
      finishCalendarOperation(operation);
    }
  }

  function cancelSourceReadRetry() {
    const retry=state.syncReadRetry;
    clearTimeout(state.syncReadRetryTimer);state.syncReadRetry=null;
    $('cancelSourceReadRetry')?.remove();
    if(retry&&state.freshnessMessage===retry.message){state.freshnessMessage='';updateFreshnessUI();}
  }

  function scheduleSourceReadRetry(operation,target,previous,error) {
    const attemptsUsed=previous?.attemptsUsed||1,wait=Math.max(60000,Number(error.retryAfterMs)||60000),expires=previous?.expires||Date.now()+600000;
    if(attemptsUsed>=3||wait>300000||Date.now()+wait>expires)return false;
    const retry={year:operation.year,target,actor:state.data?.actor.userAlias,page:state.page,attemptsUsed:attemptsUsed+1,expires,
      message:`Preparing ${target==='parent'?'Parent':'Staff'} sync is waiting for source read quota. Retry in ${Math.ceil(wait/1000)} seconds; editing or leaving this flow cancels automatic retry.`};
    cancelSourceReadRetry();state.syncReadRetry=retry;state.freshnessMessage=retry.message;updateFreshnessUI();
    const button=document.createElement('button');button.id='cancelSourceReadRetry';button.className='text-link';button.textContent='Cancel sync retry';button.onclick=cancelSourceReadRetry;$('freshnessBar')?.append(button);
    state.syncReadRetryTimer=setTimeout(async()=>{
      if(state.syncReadRetry!==retry)return;
      if(!state.data||state.data.actor.userAlias!==retry.actor||Number(state.year)!==retry.year||state.page!==retry.page||Date.now()>retry.expires||interactionsBusy()||hasPendingCalendarJobs()||state.readOnly){cancelSourceReadRetry();return;}
      await syncYear(retry.target,null,retry);
    },wait);
    return true;
  }

  function calendarSyncStoppedError() {
    return Object.assign(new Error('Stopped waiting. Already submitted work may still finish; a configured background scheduler may continue. The sync record is retained. Use Sync again to check it.'),{code:'SYNC_WAIT_STOPPED',definite:true});
  }

  function stopCalendarSyncWaiting() {
    const operation=state.calendarOperation;
    if(!operation?.stopSyncWaiting||operation.waitStopped)return;
    operation.waitStopped=true;
    operation.stopSyncWaiting();
  }

  async function waitForCalendarSyncStep(operation,promise) {
    assertCalendarOperation(operation);
    const result=await Promise.race([promise,operation.stopped.then(()=>{throw calendarSyncStoppedError();})]);
    assertCalendarOperation(operation);
    return result;
  }

  async function waitForCalendarSyncDelay(operation,milliseconds) {
    let timer;
    try{await waitForCalendarSyncStep(operation,new Promise(resolve=>{timer=setTimeout(resolve,milliseconds);}));}
    finally{clearTimeout(timer);}
  }

  function calendarSyncErrorCount(session) {
    return Math.max((session?.counts?.errors||[]).length,Number(session?.counts?.errorCount)||0);
  }

  function calendarSyncTransportUncertain(error) {
    return !error.definite&&(!error.status||error.status>=500||error.code==='RESPONSE_UNREADABLE'&&error.status>=200&&error.status<300)&&
      (!error.code||['REQUEST_TIMEOUT','TRANSPORT_ERROR','BACKEND_ERROR','RESPONSE_UNREADABLE'].includes(error.code));
  }

  async function recoverCalendarSync(operation,target,syncRunId) {
    if(!syncRunId)throw new Error('The sync identity was not confirmed. Use Sync again to check the retained operation.');
    const deadline=Date.now()+10*60000;
    let delay=5000,transportFailures=0;
    for(let attempt=0;attempt<24&&Date.now()<deadline;attempt++){
      $('syncStage').textContent='Checking the saved Calendar sync…';
      $('syncDetail').textContent='The last response was not confirmed. Checking the same run before continuing. Already submitted work may still finish.';
      await waitForCalendarSyncDelay(operation,Math.min(delay,Math.max(0,deadline-Date.now())));
      if(Date.now()>=deadline)break;
      let current;
      try{
        current=await waitForCalendarSyncStep(operation,api('calendarSyncStatus',{syncRunId,year:operation.year,target}));
        transportFailures=0;
      }catch(error){
        if(!calendarSyncTransportUncertain(error)||++transportFailures>=3)throw error;
        delay=Math.min(30000,delay*2);
        continue;
      }
      if(current?.syncRunId!==syncRunId||Number(current.year)!==operation.year||current.target!==target){
        throw Object.assign(new Error('The saved sync response does not match this run. Its record is retained for administrator review.'),{code:'SYNC_STATUS_MISMATCH',definite:true});
      }
      const countKeys=['staffCreates','staffUpdates','staffDeletes','parentCreates','parentUpdates','parentDeletes','errorCount'];
      if(typeof current.completed!=='boolean'||!current.counts||
         !countKeys.every(key=>Number.isSafeInteger(current.counts[key])&&current.counts[key]>=0)||
         !['initialPending','processedTotal','remaining','blockedCount','writes'].every(key=>Number.isSafeInteger(current[key])&&current[key]>=0)||
         current.completed&&current.fullySynced!==(current.blockedCount===0&&current.counts.errorCount===0)){
        throw Object.assign(new Error('The saved sync totals cannot be verified. Its record is retained for administrator review.'),{code:'SYNC_STATUS_UNREADABLE',definite:true});
      }
      if(current.completed||current.manualReview||current.paused)return current;
      if(current.inProgress){delay=Math.min(30000,Math.max(delay*2,Number(current.retryAfterMs)||0));continue;}
      if(current.readyToResume)return current;
      throw Object.assign(new Error('The saved sync outcome could not be confirmed. Its record is retained for administrator review.'),{code:'SYNC_STATUS_UNREADABLE',definite:true});
    }
    throw new Error('The sync is still unconfirmed after bounded status checks. Its record is retained. Use Sync again to check it.');
  }

  async function syncYear(target, publicationOperation = null, sourceRetry = null) {
    if(sourceRetry&&state.syncReadRetry!==sourceRetry)return;
    if(!sourceRetry)cancelSourceReadRetry();
    const operation = publicationOperation || beginCalendarOperation();
    if (!operation) return;
    const year = operation.year;
    operation.stopped=new Promise(resolve=>{operation.stopSyncWaiting=resolve;});
    $('stopSyncWaiting')?.classList.remove('hidden');

    target = target === 'parent' ? 'parent' : 'staff';
    operation.syncTarget=target;renderDirtyPill();

    const label =
      target === 'staff' ? 'Staff' : 'Parent';

    showWorkOverlay(
      `Synchronising ${label} Calendar`,
      'Preparing resumable whole-year sync…'
    );

    let sessionReceived=false;
    try {
      assertCalendarOperation(operation);
      let session = await waitForCalendarSyncStep(operation,api(
        'startSyncYear',
        {
          year: year,
          target: target
        }
      ));
      sessionReceived=true;
      cancelSourceReadRetry();
      assertCalendarOperation(operation);

      if (session.completed && !Number(session.blockedCount || 0) && !calendarSyncErrorCount(session) && session.fullySynced !== false) {
        setWorkProgress(
          100,
          `${label} Calendar is already fully synchronised.`
        );

        $('syncDetail').textContent =
          `0 pending record(s) · ` +
          `${Number(session.writes || 0)} Calendar write(s)`;

        await waitForCalendarSyncDelay(operation,650);

        assertCalendarOperation(operation);
        // A final refresh installs shared page state. Once it starts, keep its
        // operation owner until the loader's bounded request has settled.
        operation.stopSyncWaiting=null;
        $('stopSyncWaiting')?.classList.add('hidden');
        const refreshed = state.calendarChangePushEnabled ? true : await loadBootstrap(year);
        assertCalendarOperation(operation);
        if (!refreshed) throw new Error('The sync result could not be refreshed.');

        toast(
          `${label} sync complete. Nothing pending.`
        );

        return;
      }

      const total = Math.max(
        Number(session.initialPending || 0),
        Number(session.processedTotal || 0) +
          Number(session.remaining || 0),
        1
      );

      if (session.resumed) {
        $('syncDetail').textContent =
          `Resuming ${Number(session.processedTotal || 0)} ` +
          `of ${total} processed.`;
      }

      let unconfirmedBatches=0,confirmedProgress=Number(session.processedTotal)||0;
      const recordRecoveredProgress=current=>{
        if(current.completed||Number(current.processedTotal)>confirmedProgress)unconfirmedBatches=0;
        else unconfirmedBatches++;
        confirmedProgress=Math.max(confirmedProgress,Number(current.processedTotal)||0);
        if(unconfirmedBatches>=3)throw new Error('Repeated batch responses remain unconfirmed without saved progress. The sync record is retained. Use Sync again to check it.');
      };
      while (!session.completed) {
        const processed =
          Number(session.processedTotal || 0);

        const writes =
          Number(session.writes || 0);

        const errors = calendarSyncErrorCount(session);

        const progress = Math.max(
          5,
          Math.min(
            96,
            Math.round(
              (processed / total) * 96
            )
          )
        );

        setWorkProgress(
          progress,
          `Processed ${processed} of ${total} ` +
          `backend record${total === 1 ? '' : 's'}…`
        );

        $('syncDetail').textContent =
          `${writes} Calendar write${writes === 1 ? '' : 's'} · ` +
          `${errors} error${errors === 1 ? '' : 's'} · ` +
          `${Number(session.remaining || 0)} remaining` +
          (Number(session.blockedCount || 0) ? ` · ${Number(session.blockedCount)} blocked by earlier unconfirmed saves` : '');

        if (session.paused || Number(session.retryAfterMs || 0) > 5000) {
          await waitForCalendarResume(session, processed, Number(session.remaining || 0),operation);
          assertCalendarOperation(operation);
        }
        const syncRunId=session.syncRunId;
        try{
          session = await waitForCalendarSyncStep(operation,api('syncYearBatch',{syncRunId}));
        }catch(error){
          if(!calendarSyncTransportUncertain(error))throw error;
          session=await recoverCalendarSync(operation,target,syncRunId);
          recordRecoveredProgress(session);
          continue;
        }
        if(session.inProgress){
          session=await recoverCalendarSync(operation,target,syncRunId);
          recordRecoveredProgress(session);
          continue;
        }
        unconfirmedBatches=0;
        confirmedProgress=Math.max(confirmedProgress,Number(session.processedTotal)||0);
        assertCalendarOperation(operation);

        if (!session.completed && !session.paused && Number(session.retryAfterMs || 0) <= 5000) {
          await waitForCalendarSyncDelay(operation,Math.max(180,Math.min(5000,Number(session.retryAfterMs)||180)));
        }
      }

      const writes =
        Number(session.writes || 0);

      const errors = calendarSyncErrorCount(session);
      const blocked = Number(session.blockedCount || 0);

      setWorkProgress(
        100,
        blocked ? `${label} sync finished for unblocked records.` : errors ? `${label} sync finished with errors.` : `${label} whole-year sync complete.`
      );

      $('syncDetail').textContent =
        `${Number(session.processedTotal || 0)} record(s) processed · ` +
        `${writes} Calendar write${writes === 1 ? '' : 's'} · ` +
        `${errors} error${errors === 1 ? '' : 's'}` +
        (blocked ? ` · ${blocked} blocked by earlier unconfirmed saves` : '');

      await waitForCalendarSyncDelay(operation,750);

      assertCalendarOperation(operation);
      operation.stopSyncWaiting=null;
      $('stopSyncWaiting')?.classList.add('hidden');
      const refreshed = state.calendarChangePushEnabled ? true : await loadBootstrap(year);
      assertCalendarOperation(operation);
      if (!refreshed) throw new Error('The sync result could not be refreshed.');

      toast(
        (blocked ? `${label} sync processed the unblocked records. ` : errors ? `${label} sync finished with errors. ` : `${label} sync complete. `) +
        `${writes} Calendar write${writes === 1 ? '' : 's'}` +
        (
          errors
            ? ` · ${errors} error${errors === 1 ? '' : 's'}.`
            : '.'
        ) +
        (blocked ? ` ${blocked} blocked by earlier unconfirmed saves. Review those saves; use Sync ${label} again to retry other pending records.` : ''),
        !!errors || !!blocked
      );

    } catch (err) {
      if(err.code==='SYNC_WAIT_STOPPED'){toast(err.message);return;}
      if(!sessionReceived&&err.definite&&err.code==='SOURCE_READ_DEFERRED'&&scheduleSourceReadRetry(operation,target,sourceRetry,err))return;
      if(sourceRetry)cancelSourceReadRetry();
      const detail =
        String(
          err && err.message
            ? err.message
            : ''
        );

      toast(
        (operation.published ? `${year} is published. ` : '') + (detail
          ? detail +
            ` Sync ${label} is resumable; click the button again to continue.`
          : `${label} Calendar sync paused. ` +
            `Click Sync ${label} again to resume.`),
        true
      );

    } finally {
      if (!publicationOperation) finishCalendarOperation(operation);
    }
  }

  function showWorkOverlay(title, stage) {
    const overlay = $('syncOverlay');
    if (!overlay) return;

    overlay.classList.remove('hidden');

    if ($('workTitle')) {
      $('workTitle').textContent = title || 'Working';
    }
    if ($('syncProgress')) {
      $('syncProgress').style.width = '8%';
    }
    if ($('syncStage')) {
      $('syncStage').textContent = stage || 'Preparing…';
    }
    if ($('syncDetail')) {
      $('syncDetail').textContent = 'Please keep this page open.';
    }
  }

  function setWorkProgress(percent, stage) {
    if ($('syncProgress')) {
      $('syncProgress').style.width =
        `${Math.max(0, Math.min(100, Number(percent) || 0))}%`;
    }
    if (stage && $('syncStage')) {
      $('syncStage').textContent = stage;
    }
  }

  function hideWorkOverlay() {
    const overlay = $('syncOverlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function clearYearLoadingOverlay(){
    clearTimeout(state.yearLoadingTimer);state.yearLoadingTimer=0;
    $('yearLoadingOverlay')?.classList.add('hidden');
  }

  function showSyncOverlay() { showWorkOverlay('Synchronising', 'Preparing differential sync…'); }
  function setSyncProgress(percent, stage) { setWorkProgress(percent, stage); }
  function hideSyncOverlay() { hideWorkOverlay(); }

  /* =========================
   * DATE / DISPLAY HELPERS
   * ========================= */

  function datesOfYear(year) {
    const dates = [];
    let d = new Date(year, 0, 1, 12);
    while (d.getFullYear() === year) {
      dates.push(new Date(d));
      d.setDate(d.getDate() + 1);
    }
    return dates;
  }

  function parseISODate(s) {
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  }

  function addDays(d, n) {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
  }

  function isoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function sgToday() {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Singapore',
      year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
    const get = type => parts.find(p => p.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function formatDateShort(d) {
    return new Intl.DateTimeFormat('en-SG', {
      day: 'numeric', month: 'short', year: 'numeric'
    }).format(d);
  }

  function dateOnly(v) {
    return String(v || '').slice(0, 10);
  }

  function timeOnly(v) {
    const s = String(v || '');
    const m = s.match(/(\d{2}:\d{2})/);
    return m ? m[1] : '';
  }

  function inDateRange(date, start, end) {
    const s = dateOnly(start);
    const e = dateOnly(end);
    return !!s && !!e && date >= s && date <= e;
  }

  function eventDateLabel(e) {
    const start=dateOnly(e.StartDate),end=dateOnly(e.EndDate||e.StartDate);
    const range=start+(end!==start?' → '+end:'');
    return e.EventType==='TIMED' ? (end!==start ? `${start} ${timeOnly(e.StartTime)} → ${end} ${timeOnly(e.EndTime)}` : `${start} · ${timeOnly(e.StartTime)}–${timeOnly(e.EndTime)}`) : range+' · All day';
  }

  function yes(v) {
    return ['yes', 'y', 'true', '1'].includes(String(v || '').toLowerCase());
  }

  function displayAlias(alias) {
    return String(alias || '')
      .replace(/[._]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, ch => ch.toUpperCase());
  }

  function apiResult(value) {
    return value && value.result
      ? value.result
      : value;
  }

  function upsertLocalEvent(value) {
    const saved =
      apiResult(value);

    if (!saved || !saved.EventID || !saved._revision) {
      throw new Error('No authoritative saved event was returned. Check status before retrying.');
    }

    const events =
      state.data.events || (
        state.data.events = []
      );

    const index =
      events.findIndex(e =>
        e.EventID === saved.EventID
      );

    if (
      Number(saved.Year) !==
      Number(state.year)
    ) {
      if (index >= 0) {
        events.splice(index, 1);
      }
      return saved;
    }

    if (saved.DeletedAt) {
      if (index >= 0) {
        events.splice(index, 1);
      }
      return saved;
    }

    if (index >= 0) {
      events[index] = saved;
    } else {
      events.push(saved);
    }

    return saved;
  }

  function removeLocalEvent(eventId) {
    const existing=(state.data.events || []).find(e => e.EventID===eventId);
    if(existing && state.data.actor.isAdmin) {
      const removals=state.data.pendingRemovals || (state.data.pendingRemovals=[]);
      if(!removals.some(r=>r.eventId===eventId) && (existing.StaffCalendarEventId || existing.ParentCalendarEventId || existing._staffCalendarLinked || existing._parentCalendarLinked)) {
        removals.push({eventId,staff:!!(existing.StaffCalendarEventId || existing._staffCalendarLinked),parent:!!(existing.ParentCalendarEventId || existing._parentCalendarLinked)});
      }
    }
    state.data.events =
      (state.data.events || [])
        .filter(e =>
          e.EventID !== eventId
        );
  }

  function upsertLocalDayNote(value) {
    const saved =
      apiResult(value);

    const year =
      Number(
        saved?.Year ||
        saved?.year ||
        state.year
      );

    const date =
      dateOnly(
        saved?.Date ||
        saved?.date ||
        ''
      );

    const notes =
      state.data.dayNotes || (
        state.data.dayNotes = []
      );

    if (
      saved?.deleted
    ) {
      state.data.dayNotes =
        notes.filter(note =>
          !(
            Number(note.Year) === year &&
            dateOnly(note.Date) === date
          )
        );

      return saved;
    }

    if (
      !saved ||
      !saved.NoteID
    ) {
      return null;
    }

    const index =
      notes.findIndex(note =>
        note.NoteID === saved.NoteID ||
        (
          Number(note.Year) === year &&
          dateOnly(note.Date) === date
        )
      );

    if (index >= 0) {
      notes[index] = saved;
    } else {
      notes.push(saved);
    }

    return saved;
  }

  function rememberEditedEvent(event,date) {
    if(!['events','weekly'].includes(state.page))return;
    cancelTodayJump();
    state.editedViewAnchor={page:state.page,year:state.year,eventId:event?.EventID||'',date:date||dateOnly(event?.StartDate)};
    rememberView();
  }

  function captureEventViewPosition() {
    const wrap =
      state.page === 'weekly'
        ? document.querySelector(
            '#weeklyHost .weekly-wrap'
          )
        : document.querySelector(
            '#calendarHost .calendar-wrap'
          );

    const rect=wrap?.getBoundingClientRect();
    const header=wrap?.querySelector('.cal-row.header,thead');
    const visibleTop=Math.max(rect?.top||0,header?.getBoundingClientRect().bottom||0);
    const preferred=state.editedViewAnchor;
    const eligible=preferred?.page===state.page && preferred.year===state.year;
    const cards=wrap?[...wrap.querySelectorAll('[data-event-id]')]:[];
    const visible=node=>{const box=node.getBoundingClientRect();return box.height>0 && box.bottom>visibleTop && box.top<rect.bottom;};
    const eventAnchor=eligible && cards.find(node=>node.dataset.eventId===preferred.eventId && (!preferred.date||node.dataset.segmentDate===preferred.date) && visible(node));
    const preferredDate=eligible && [...(wrap?.querySelectorAll('[data-date]')||[])].find(node=>node.dataset.date===preferred.date && visible(node));
    const anchor=preferredDate || (wrap && [...wrap.querySelectorAll('[data-date]')].find(row=>{
      const box=row.getBoundingClientRect();return box.height>0 && box.bottom>visibleTop && box.top<rect.bottom;
    }));
    const focus=document.activeElement;
    return {
      page:state.page,year:state.year,wrap,focus,
      anchorDate:anchor?.dataset.date,
      anchorEventId:eventAnchor?.dataset?.eventId,
      anchorSegmentDate:eventAnchor?.dataset?.segmentDate,
      anchorOffset:eventAnchor?eventAnchor.getBoundingClientRect().top-rect.top:anchor?anchor.getBoundingClientRect().top-rect.top:0,
      fallbackOffset:anchor?anchor.getBoundingClientRect().top-rect.top:0,
      windowX:
        window.scrollX,
      windowY:
        window.scrollY,
      wrapLeft:
        wrap ? wrap.scrollLeft : 0,
      wrapTop:
        wrap ? wrap.scrollTop : 0
    };
  }

  function restoreEventViewPosition(position) {
    cancelTodayJump();
    if(position.page!==undefined && (position.page!==state.page || position.year!==state.year))return;
    const apply=()=>{
      if(window.scrollX!==position.windowX || window.scrollY!==position.windowY)window.scrollTo(position.windowX,position.windowY);

      const wrap =
        state.page === 'weekly'
          ? document.querySelector(
              '#weeklyHost .weekly-wrap'
            )
          : document.querySelector(
              '#calendarHost .calendar-wrap'
            );

      if (wrap) {
        wrap.scrollLeft =
          position.wrapLeft;
        const event=position.anchorEventId && [...wrap.querySelectorAll('[data-event-id]')].find(node=>node.dataset.eventId===position.anchorEventId && node.dataset.segmentDate===position.anchorSegmentDate && node.getBoundingClientRect().height>0);
        const row=position.anchorDate && [...wrap.querySelectorAll('[data-date]')].find(node=>node.dataset.date===position.anchorDate && node.getBoundingClientRect().height>0);
        const anchor=event||row,offset=event?position.anchorOffset:(position.fallbackOffset??position.anchorOffset);
        wrap.scrollTop = anchor?wrap.scrollTop+anchor.getBoundingClientRect().top-wrap.getBoundingClientRect().top-offset:position.wrapTop;
      }
      if(position.focus && !position.focus.isConnected && document.activeElement===document.body && wrap){
        const old=position.focus;
        const match=[...wrap.querySelectorAll('[data-event-id],[data-add-date],[data-note-date]')].find(node=>
          old.dataset.eventId?node.dataset.eventId===old.dataset.eventId && node.dataset.segmentDate===old.dataset.segmentDate:
          old.dataset.addDate?node.dataset.addDate===old.dataset.addDate && node.dataset.addLane===old.dataset.addLane && node.dataset.addShift===old.dataset.addShift:
          old.dataset.noteDate && node.dataset.noteDate===old.dataset.noteDate);
        match?.focus({preventScroll:true});
        if(document.activeElement===document.body)wrap.focus({preventScroll:true});
      }
    };
    // Restore synchronously: a later animation-frame callback could steal a
    // subsequent scroll, focus change or navigation from the user.
    apply();
  }

  function refreshEventViewLocally(options = {}) {
    const position=captureEventViewPosition();
    if(options.close!==false)closeModal(true);
    const affected=options.affected;
    let patched=affected && ['events','weekly'].includes(state.page) && patchEventDates(affected);
    if(!patched && ['events','weekly'].includes(state.page) && document.querySelector(state.page==='events'?'#calendarHost .calendar-wrap':'#weeklyHost .weekly-wrap')){patchCalendarGrid();patched=true;}
    if(!patched)renderPage(state.page);
    if(state.page==='events')applyDateSearch(true);
    renderDirtyPill();restoreEventViewPosition(position);rememberView();if(!options.keepOverlay)hideWorkOverlay();updateFreshnessUI();
    yearCache.set(Number(state.year),state.data);
    drainDeferredRefresh();
  }

  function hasUnsavedChanges() {
    return (
      !!state.pendingMutation ||
      !!document.querySelector(
        'form[data-dirty="1"]'
      ) ||
      !!document.querySelector('#parentHost tr[data-review-pending="1"]') ||
      !!document.querySelector('#parentHost tr[data-inline-dirty="1"]') ||
      !!state.formattingOrderDirty
    );
  }

  function clearUnsavedMarkers() {
    document
      .querySelectorAll(
        'form[data-dirty="1"]'
      )
      .forEach(form => {
        form.dataset.dirty = '0';
      });

    state.formattingOrderDirty = false;
  }

  function confirmUnsavedChanges(actionText) {
    if(state.pendingMutation){toast('Resolve the pending save before leaving this proposal.',true);return false;}
    if (!hasUnsavedChanges()) {
      return true;
    }

    const leave =
      confirm(
        'You have unsaved changes. ' +
        'Discard them and ' +
        String(actionText || 'continue') +
        '?'
      );

    if (leave) {
      clearUnsavedMarkers();
    }

    return leave;
  }

  async function finishWriteAndReload(page, stage = 'Refreshing…', close = true) {
    if (close) closeModal(true);

    state.allowNavigationOnce = true;

    const targetPage = page || state.page || 'events';
    state.page = targetPage;
    sessionSet('gspsCalPage', targetPage);
    setWorkProgress(78, stage);
    await new Promise(resolve => setTimeout(resolve, 300));
    setWorkProgress(100, 'Saved. Reloading…');
    await new Promise(resolve => setTimeout(resolve, 220));
    window.location.reload();
  }

  function toast(message, error = false) {
    const t = $('toast');
    t.textContent = message;
    t.classList.toggle('error', error);
    t.classList.remove('hidden');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => t.classList.add('hidden'), error ? 6500 : 4000);
  }

  function showLoginError(message) {
    $('loginError').innerHTML = `<p style="color:#8b2e38;margin-top:14px">${esc(message)}</p>`;
  }

  window.addEventListener('beforeunload', e => {
    if (state.allowNavigationOnce) return;
    if (!hasUnsavedChanges() && !state.calendarOperation) return;

    e.preventDefault();
    e.returnValue = '';
  });


  const laneScheduleCache = new WeakMap();
  // 0.9.7 state is tab-local. Calendar data is never persisted in localStorage.
  const yearCache = new Map();
  const publicationRequests = new Map(readPublicationRequests());
  const viewMemory = new Map();
  let bootstrapSequence = 0;
  let bootstrapFlight = null;
  let refreshTimer = 0;
  let filterTimer = 0;
  const EVENT_MUTATIONS = new Set(['saveEvent','deleteEvent','saveParentSide','relocateEvent']);

  function yearView(year = state.year) {
    const key = Number(year || 0);
    if (!viewMemory.has(key)) viewMemory.set(key,{query:'',filter:{kind:'all'},events:null,weekly:null});
    return viewMemory.get(key);
  }

  function rememberView() {
    if (!state.year) return;
    if (state.page === 'events' || state.page === 'weekly') yearView()[state.page] = captureEventViewPosition();
    if ($('dateSearch') && state.page === 'events') yearView().query = $('dateSearch').value;
  }

  function restoreRememberedView() {
    const saved = yearView()[state.page];
    if (saved && ['events','weekly'].includes(state.page)) restoreEventViewPosition(saved);
  }

  function isCalendarEditable(allowCalendarOperation = false) {
    return !!state.data && !state.readOnly && !state.pendingMutation && (allowCalendarOperation || !state.calendarOperation);
  }

  function interactionsBusy() {
    return !!state.calendarOperation || snapshotInteractionBusy() || !$('syncOverlay')?.classList.contains('hidden');
  }

  function snapshotInteractionBusy() {
    const selection=window.getSelection?.();
    const selectedCalendarText=selection && !selection.isCollapsed &&
      selection.anchorNode?.parentElement?.closest('#calendarHost,#weeklyHost');
    return !!state.drag || document.body.classList.contains('column-resizing') || !!state.pendingMutation || !!$('modalHost')?.firstElementChild ||
      !!document.activeElement?.closest('#parentHost tr[data-parent-row]') || hasUnsavedChanges() || !!selectedCalendarText;
  }

  function updateFreshnessUI() {
    const status = $('freshnessStatus');
    if (!status) return;
    status.textContent = state.freshnessMessage || '';
    $('freshnessBar').classList.toggle('attention',!!state.readOnly);
    $('refreshCalendarBtn').textContent = state.refreshFailed ? 'Retry' : 'Refresh';
    $('refreshCalendarBtn').disabled = !!state.loadingYear || !!state.pendingMutation || !!state.calendarOperation;
    document.body.classList.toggle('calendar-readonly',!!state.readOnly || !!state.pendingMutation || !!state.calendarOperation);
    if (state.readOnly || state.pendingMutation || state.calendarOperation) {
      $('publishVersionBtn').disabled = true; $('syncStaffBtn').disabled = true; $('syncParentBtn').disabled = true; $('pullBirthdaysBtn').disabled = true;
    } else if(state.data) {
      renderDirtyPill();
    }
  }

  function validateBootstrap(payload, requestedYear) {
    if (!payload || !payload.actor || !Array.isArray(payload.years)) throw new Error('Incomplete calendar response. The previous view has been retained.');
    const version = String(payload.version || '').replace(/^v2\s*/i,'').trim();
    if (version !== FRONTEND_VERSION) throw new Error(`Frontend/backend version mismatch: ${FRONTEND_VERSION} / ${payload.version || 'unknown'}. Deploy the matching ${FRONTEND_VERSION} package.`);
    for (const k of ['events','lanes','tags','yearStructure','dayNotes','colourRules']) {
      if (!Array.isArray(payload[k])) throw new Error(`Incomplete calendar response (${k}). No calendar was replaced.`);
      if(payload[k].some(row=>!row || typeof row!=='object' || Array.isArray(row)))throw new Error(`Invalid calendar records (${k}). The previous view has been retained.`);
    }
    const year = Number(payload.selectedYear || 0);
    if (requestedYear && year !== Number(requestedYear)) throw new Error('The backend returned a different year. The previous view has been retained.');
    if (year && !payload.years.some(y => Number(y.Year) === year)) throw new Error('This year is not available to your account.');
    if (payload.events.some(e => !e.EventID || Number(e.Year) !== year || !e._revision)) throw new Error('Calendar events have inconsistent year/revision data. No calendar was replaced.');
    if (payload.dayNotes.some(n => Number(n.Year) !== year) || payload.yearStructure.some(s => Number(s.Year) !== year)) throw new Error('Calendar notes/structure belong to a different year.');
    return year;
  }

  function installBootstrap(payload, render, readOnly) {
    const before = {data:state.data,year:state.year,readOnly:state.readOnly};
    try {
      state.data = payload; state.year = Number(payload.selectedYear || 0); state.readOnly = !!readOnly;
      if (render) {renderAll(); restoreRememberedView();}
      if(state.calendarJobsEnabled && !readOnly)loadCalendarJobs().catch(()=>{});
      if(!readOnly)startCalendarChangeStream();
    } catch (err) {
      Object.assign(state,before);
      if (render && before.data) {renderAll(); restoreRememberedView();}
      throw err;
    }
  }

  function installCalendarSnapshotInPlace(payload, options = {}) {
    const previous=state.data,position=captureEventViewPosition();
    const previousReadOnly=state.readOnly;
    try {
    const changed=key=>JSON.stringify(previous[key])!==JSON.stringify(payload[key]);
    const changedKeys=Object.keys(payload).filter(changed);
    // Job ownership deliberately compares the actor object by identity.
    payload.actor=previous.actor;
    state.data=payload;state.readOnly=false;
    if(changedKeys.includes('years'))renderYearSelect();
    const gridMetadata=['lanes','tags','yearStructure','dayNotes','colourRules','years'];
    if(['events','weekly'].includes(state.page)){
      if(changedKeys.some(key=>gridMetadata.includes(key)))patchCalendarGrid();
      else if(changedKeys.includes('events')){
        const before=new Map(previous.events.map(event=>[event.EventID,event]));
        const after=new Map(payload.events.map(event=>[event.EventID,event]));
        const affected=[];
        for(const id of new Set([...before.keys(),...after.keys()])){
          if(JSON.stringify(before.get(id))!==JSON.stringify(after.get(id)))affected.push(before.get(id),after.get(id));
        }
        patchEventDates(affected);
      }
      if(state.page==='events')applyDateSearch(true);
    }else if(changedKeys.some(key=>!['actor','version','venueSource','venues','metadataRevisions'].includes(key))){
      renderPage(state.page);
    }
    renderDirtyPill();renderCalendarJobs();restoreEventViewPosition(position);
    if(state.calendarJobsEnabled && !options.skipJobs)loadCalendarJobs().catch(()=>{});
    }catch(error){
      state.data=previous;state.readOnly=previousReadOnly;
      if(['events','weekly'].includes(state.page)){patchCalendarGrid();if(state.page==='events')applyDateSearch(true);}
      else renderPage(state.page);
      renderYearSelect();renderDirtyPill();restoreEventViewPosition(position);
      throw error;
    }
  }

  function patchCalendarGrid() {
    state.pendingGridRefresh=false;
    const ctx=calendarRenderContext();
    if(state.page==='events'){
      const grid=document.querySelector('#calendarHost .cal-grid');
      if(!grid)return;
      const keys=['date','term','week','dow','planning'].concat(ctx.lanes.map(l=>`lane:${l.laneId}:${l.shift}`));
      const widths=getEventColumnWidths(keys);
      grid.style.setProperty('--event-grid-columns',keys.map(k=>widths[k]+'px').join(' '));
      const header=grid.querySelector('.cal-row.header');
      const html=resizeableHead('Date','date')+resizeableHead('Term','term')+resizeableHead('Week','week')+resizeableHead('Day','dow')+resizeableHead('Planning Notes','planning')+ctx.lanes.map(l=>resizeableHead(l.label,`lane:${l.laneId}:${l.shift}`)).join('');
      if(header && header.innerHTML!==html){header.innerHTML=html;bindEventColumnResizers($('calendarHost'),keys);}
      grid.querySelectorAll('.cal-row[data-date]').forEach(row=>replaceCalendarRow(row,calendarRowHtml(parseISODate(row.dataset.date),ctx)));
    }else if(state.page==='weekly'){
      document.querySelectorAll('#weeklyHost .week-day[data-date]').forEach(row=>replaceCalendarRow(row,weeklyDayHtml(parseISODate(row.dataset.date),ctx)));
      document.querySelectorAll('#weeklyHost tbody tr').forEach(row=>{
        const first=row.querySelector('.week-day[data-date]'),label=row.querySelector('.week-label');
        if(!first||!label)return;
        const date=parseISODate(first.dataset.date),meta=structureMetaForDate(ctx.structure,first.dataset.date);
        label.textContent=meta.label || (meta.term&&meta.week?`T${meta.term}W${meta.week}`:'') || fallbackWeekLabel(date,state.year);
      });
    }
  }

  async function requestRefresh(reason = 'manual') {
    if (!state.data || state.loadingYear) return;
    if (interactionsBusy()) {
      state.refreshDeferred = true;
      state.freshnessMessage = 'Refresh queued until your current interaction finishes.';
      updateFreshnessUI();
      return;
    }
    state.refreshDeferred = false;
    try { await loadBootstrap(state.year,true,{refresh:true}); }
    catch (err) { if (reason === 'manual') toast(err.message,true); }
  }

  function drainDeferredRefresh() {
    if(state.calendarChangePushEnabled)drainCalendarChanges();
    if(state.pendingGridRefresh && !snapshotInteractionBusy()){
      const position=captureEventViewPosition();patchCalendarGrid();
      if(state.page==='events')applyDateSearch(true);
      restoreEventViewPosition(position);
    }
    if (state.refreshDeferred && !interactionsBusy()) {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => requestRefresh('deferred'),200);
    }
  }

  function bindRC17StaticEvents() {
    $('refreshCalendarBtn').addEventListener('click',() => {
      if(state.retryYear && Number(state.retryYear)!==Number(state.year))loadBootstrap(state.retryYear,true).catch(err=>toast(err.message,true));
      else requestRefresh('manual');
    });
    const returned = () => {
      if (document.visibilityState !== 'visible' || !state.data) return;
      if(state.calendarChangePushEnabled){startCalendarChangeStream();drainCalendarChanges();return;}
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => requestRefresh('return'),500);
    };
    document.addEventListener('visibilitychange',returned);
    window.addEventListener('focus',returned);
    document.addEventListener('selectionchange',()=>{if(!snapshotInteractionBusy())drainDeferredRefresh();if(state.pendingJobsRender)renderCalendarJobs();});
    $('dateSearch').addEventListener('input',() => {
      clearTimeout(filterTimer); yearView().query = $('dateSearch').value;
      filterTimer = setTimeout(() => applyDateSearch(),250);
    });
    $('dateSearch').addEventListener('keydown',e => {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(filterTimer); applyDateSearch(); }
    });
    $('clearDateSearch').addEventListener('click',() => {
      clearTimeout(filterTimer); $('dateSearch').value=''; yearView().query=''; applyDateSearch();
      $('dateSearch').focus();
    });
  }

  function applyDateSearch(restoring = false) {
    if (!state.year) return;
    const memory = yearView();
    if (!restoring) memory.query = $('dateSearch').value;
    const parsed = GSPSCalendarCore.parseDateSearch(memory.query,state.year);
    const guide = $('dateSearchGuide');
    guide.textContent = '';
    if (parsed.status !== 'valid') {
      guide.textContent = parsed.message;
    } else if (parsed.external) {
      guide.textContent = `You are viewing ${state.year}. `;
      const accessible = state.data.years.some(y => Number(y.Year) === parsed.year);
      if (accessible) {
        const button = document.createElement('button'); button.className='text-link';
        button.textContent=`Switch to ${parsed.year}`;
        button.addEventListener('click', async () => {
          if (!confirmUnsavedChanges('switch calendar year')) return;
          const requestedQuery = memory.query;
          const switched = await loadBootstrap(parsed.year,true,{yearSwitch:true}).catch(err => {toast(err.message,true); return false;});
          if (switched && Number(state.year) === parsed.year) {
            yearView().query = requestedQuery; $('dateSearch').value = requestedQuery; applyDateSearch();
          }
        });
        guide.appendChild(button);
      } else guide.appendChild(document.createTextNode(`${parsed.year} is not available to your account.`));
    } else if (!restoring || parsed.status === 'valid') {
      memory.filter = parsed;
    }
    const wrap = document.querySelector('#calendarHost .calendar-wrap');
    let count = 0;
    document.querySelectorAll('#calendarHost .cal-row[data-date]').forEach(row => {
      const visible = GSPSCalendarCore.dateMatches(row.dataset.date,memory.filter);
      row.classList.toggle('hidden',!visible); if (visible) count++;
    });
    $('dateMatchCount').textContent = memory.filter.kind === 'all' ? '' : `${count} date${count===1?'':'s'}`;
    if (!restoring && parsed.status === 'valid' && !parsed.external && wrap) wrap.scrollTop=0;
  }
  async function rawApi(action, payload = {}, timeoutMs = 45000) {
    const response = await fetchJson('/api',{
      method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload}),timeoutMs
    });
    if (!Object.prototype.hasOwnProperty.call(response,'result')) throw new Error('The backend response did not confirm an outcome.');
    return response.result;
  }

  function responseError(detail) {
    const err = new Error(detail.message || detail.error || 'The save was rejected.');
    Object.assign(err,{code:detail.code,status:detail.status,current:detail.current,definite:true});
    return err;
  }

  function assertMutationResult(action, result) {
    if (action === 'deleteEvent') {
      if (!result?.deleted || !result.eventId) throw new Error('The deletion response is incomplete.');
    } else if (!result?.EventID || !result?._revision || !Number(result.Year)) {
      throw new Error('The saved-event response is incomplete.');
    }
    return result;
  }

  async function reliableEventApi(action, original) {
    if(state.calendarJobsEnabled)return enqueueCalendarJob(action,original);
    if (state.pendingMutation) throw new Error('Finish checking the pending save before starting another change.');
    const pending = {action,payload:JSON.parse(JSON.stringify(original)),resolve:null,reject:null};
    pending.payload.operationId = crypto.randomUUID();
    state.pendingMutation = pending; lockMutationForm(true); updateFreshnessUI();
    try {
      try { return assertMutationResult(action,await rawApi(action,pending.payload)); }
      catch (err) {
        if (err.definite) throw err;
      }
      setWorkProgress(70,'Checking whether saved…');
      for (const delay of [0,800,2000]) {
        if (delay) await new Promise(resolve => setTimeout(resolve,delay));
        try {
          const outcome = await readMutationStatus(pending);
          if (outcome.state === 'SAVED') return assertMutationResult(action,outcome.result);
          if (outcome.state === 'REJECTED') throw responseError(outcome.error || {});
          if (outcome.state === 'NOT_SAVED') return await waitForRecovery(pending,true);
        } catch (err) { if (err.definite) throw err; }
      }
      return await waitForRecovery(pending,false);
    } finally {
      state.pendingMutation = null;
      lockMutationForm(false);
      $('mutationRecovery')?.remove();
      updateFreshnessUI();
      drainDeferredRefresh();
    }
  }

  function isCalendarJob(value) { return !!value?.jobId && !!value?.state && !!value?.payload; }
  function calendarOwnerContext() { return {epoch:state.calendarOwnerEpoch||0,actor:state.data?.actor}; }
  function sameCalendarOwner(context) { return context.epoch===(state.calendarOwnerEpoch||0) && !!context.actor && context.actor===state.data?.actor; }
  function staleCalendarOwner() { return Object.assign(new Error('The Calendar session changed. The original actor can check their retained job after signing in.'),{code:'STALE_CALENDAR_CONTEXT',definite:true}); }
  function clearCalendarOwnerState() {
    stopCalendarChangeStream();
    clearYearLoadingOverlay();state.yearSwitchFallback=null;state.editedViewAnchor=null;cancelTodayJump();
    state.calendarOwnerEpoch=(state.calendarOwnerEpoch||0)+1;
    state.calendarJobs=[];state.calendarJobsError='';state.calendarJobsExpanded=false;state.calendarJobsFlight=null;state.pendingJobSnapshotRefresh=false;state.pendingGridRefresh=false;state.pendingJobsRender=false;state.refreshDeferred=false;
    clearTimeout(state.calendarJobsTimer);cancelSourceReadRetry();$('calendarJobsPanel')?.remove();$('modalHost')?.replaceChildren();hideWorkOverlay();
  }
  function jobEventId(job) { return String(job.action==='saveEvent'?job.payload?.event?.EventID||'':job.payload?.eventId||''); }
  function pendingEventJob(id) { return id && (state.calendarJobs||[]).find(job=>job.blocked && jobEventId(job)===String(id)); }
  function hasPendingCalendarJobs() { return (state.calendarJobs||[]).some(job=>job.blocked); }
  function guardPendingEvent(event) {
    const job=event?._calendarJobId?(state.calendarJobs||[]).find(j=>j.jobId===event._calendarJobId):pendingEventJob(event?.EventID);
    if(!job)return false;
    toast('This event has an unresolved Calendar change. Its proposal and exact status are retained below.',true);
    state.calendarJobsExpanded=true;renderCalendarJobs();renderDirtyPill();return true;
  }
  function calendarJobLabel(job) {
    return ({QUEUED:'Queued',RUNNING:'Saving to Google',CHECKING:'Checking Google receipt',SAVED:'Saved to Google Sheet',NEEDS_ATTENTION:'Needs attention',CAPTURE_UNKNOWN:'Acceptance unconfirmed'})[job.state] || 'Needs attention';
  }
  function calendarJobBadge(event) {
    const job=event._calendarJobId?(state.calendarJobs||[]).find(j=>j.jobId===event._calendarJobId):pendingEventJob(event.EventID);
    return job?`<div class="calendar-job-badge">${event._calendarJobId?'Proposed · ':''}${esc(calendarJobLabel(job))}</div>`:'';
  }
  function calendarDisplayEvents() {
    const proposals=(state.calendarJobs||[]).filter(j=>j.blocked && j.action==='saveEvent' && Number(j.payload.event?.Year)===Number(state.year));
    return [...(state.data.events||[]),...proposals.map(j=>({...j.payload.event,EventID:'JOB-'+j.jobId,_calendarJobId:j.jobId}))];
  }
  function rememberCalendarJob(job) {
    const jobs=state.calendarJobs||(state.calendarJobs=[]),index=jobs.findIndex(j=>j.jobId===job.jobId);
    if(index<0)jobs.unshift(job);else jobs[index]=job;
    renderCalendarJobs();renderDirtyPill();return job;
  }
  async function enqueueCalendarJob(action,original) {
    const owner=calendarOwnerContext();
    const form=$('modalHost')?.querySelector('form'),payload=JSON.parse(JSON.stringify(original));
    payload.operationId=payload.operationId || form?.dataset.calendarOperationId || crypto.randomUUID();
    const prior=(state.calendarJobs||[]).find(job=>job.jobId===payload.operationId);
    if(prior&&(prior.blocked||prior.state==='CAPTURE_UNKNOWN'))throw new Error('This editor already has an unresolved captured proposal. Check acceptance of its frozen proposal in Event saves before creating a revised change. Your later edits remain in this form.');
    if(form)form.dataset.calendarOperationId=payload.operationId;
    const capture={jobId:payload.operationId,action,payload,state:'CAPTURE_UNKNOWN',blocked:true,attemptOperationId:payload.operationId,attempts:0,checks:0};
    try {
      const response=await fetchJson('/api/calendar-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'enqueue',action,payload})});
      if(!sameCalendarOwner(owner))throw staleCalendarOwner();
      if(!isCalendarJob(response.result)||response.result.jobId!==payload.operationId)throw new Error('The job service did not confirm durable acceptance.');
      const job=rememberCalendarJob(response.result);Object.defineProperty(job,'_uiContext',{value:{owner,form},configurable:true});
      const baseline=(state.data.events||[]).find(event=>event.EventID===(action==='saveEvent'?payload.event?.EventID:payload.eventId));
      if(baseline)Object.defineProperty(job,'_uiBaseline',{value:JSON.parse(JSON.stringify(baseline)),configurable:true});
      if(job.state==='SAVED'){state.pendingJobSnapshotRefresh=true;loadCalendarJobs().catch(()=>{});}
      scheduleCalendarJobs();return job;
    } catch(err) {
      if(!sameCalendarOwner(owner)||err.code==='STALE_CALENDAR_CONTEXT')throw staleCalendarOwner();
      if(err.definite){if(form&&err.code!=='JOB_MISMATCH')delete form.dataset.calendarOperationId;throw err;}
      // Recover the exact accepted identity; never manufacture a replacement write.
      try{await loadCalendarJobs();if(!sameCalendarOwner(owner))throw staleCalendarOwner();const found=(state.calendarJobs||[]).find(j=>j.jobId===payload.operationId && j.state!=='CAPTURE_UNKNOWN');if(found){Object.defineProperty(found,'_uiContext',{value:{owner,form},configurable:true});return found;}}catch(error){if(error.code==='STALE_CALENDAR_CONTEXT')throw error;}
      if(!sameCalendarOwner(owner))throw staleCalendarOwner();
      rememberCalendarJob(capture);scheduleCalendarJobs();
      throw new Error('Durable acceptance is not confirmed. Your proposal is retained in this editor and the job panel. Check its exact status before changing it.');
    }
  }
  function finishQueuedEvent(job,affected=[]) {
    const context=job._uiContext;
    if(!context||!sameCalendarOwner(context.owner))return;
    const proposed=job.payload.event;
    const ownForm=!context.form||$('modalHost')?.querySelector('form')===context.form;
    refreshEventViewLocally({close:ownForm,keepOverlay:!ownForm,affected:[...affected,proposed].filter(Boolean)});
    renderCalendarJobs();renderDirtyPill();
  }
  function scheduleCalendarJobs() {
    clearTimeout(state.calendarJobsTimer);state.calendarJobsTimer=0;
    if(!state.calendarJobsEnabled||!state.data||state.calendarChangePushEnabled)return;
    state.calendarJobsTimer=setTimeout(()=>loadCalendarJobs().catch(()=>{}),15000);
  }
  async function loadCalendarJobs() {
    if(!state.calendarJobsEnabled||!state.data)return;
    if(state.calendarJobsFlight)return state.calendarJobsFlight;
    const owner=calendarOwnerContext();
    const flight=(async()=>{
      try {
        const response=await fetchJson('/api/calendar-jobs',{timeoutMs:15000});
        if(!sameCalendarOwner(owner))return;
        const jobs=response.result?.jobs;
        if(!Array.isArray(jobs)||jobs.some(j=>!isCalendarJob(j)))throw new Error('Calendar job status is incomplete. Retained proposals have not been removed.');
        const old=new Map((state.calendarJobs||[]).map(j=>[j.jobId,j])),affected=[];
        const firstSaved=jobs.filter(j=>j.state==='SAVED'&&!old.has(j.jobId));
        for(const job of firstSaved){
          const current=(state.data.events||[]).find(e=>e.EventID===(job.result?.EventID||job.result?.eventId));
          if(job.action==='deleteEvent'?current?._revision===job.payload.expectedRevision:(!current||current._revision===job.payload.expectedRevision))state.pendingJobSnapshotRefresh=true;
        }
        for(const job of jobs)if(job.state==='SAVED'&&old.has(job.jobId)&&old.get(job.jobId).state!=='SAVED'){
          const before=(state.data.events||[]).find(e=>e.EventID===jobEventId(job));
          assertMutationResult(job.action,job.result);
          const current=(state.data.events||[]).find(e=>e.EventID===job.result.EventID);
          const newer=current && current._revision!==job.payload.expectedRevision && current._revision!==job.result._revision && current.LastMutationID!==job.attemptOperationId;
          if(job.action==='deleteEvent'){if(!before||before._revision===job.payload.expectedRevision||before.LastMutationID===job.attemptOperationId)removeLocalEvent(job.result.eventId);}else if(!newer)upsertLocalEvent(job.result);
          affected.push(before,job.result,job.payload.event);
        }
        for(const job of jobs){
          const previous=old.get(job.jobId);
          if(previous?._uiBaseline)Object.defineProperty(job,'_uiBaseline',{value:previous._uiBaseline,configurable:true});
          if(job.outcome==='REJECTED' && job.error?.current){
            const current=(state.data.events||[]).find(event=>event.EventID===jobEventId(job));
            const latest=job.error.current;
            // A delayed rejection cannot roll back a newer local/colleague save.
            if(latest.EventID===jobEventId(job) && latest._revision && (!current || current._revision===job.payload.expectedRevision)){
              affected.push(current,latest);upsertLocalEvent(latest);
            }
          }
          if(job.state!=='SAVED'&&(!previous||previous.state!==job.state))affected.push(job.payload.event,(state.data.events||[]).find(e=>e.EventID===jobEventId(job)));
        }
        if(state.pendingJobSnapshotRefresh){
          const beforeEvents=JSON.stringify(state.data.events),beforeRemovals=JSON.stringify(state.data.pendingRemovals);
          const year=state.year,response=await fetchJson(`/api/bootstrap?year=${year}`,{timeoutMs:45000});
          if(!sameCalendarOwner(owner)||state.year!==year)return;
          const snapshot=response.result||response;validateBootstrap(snapshot,year);
          if(JSON.stringify(snapshot.actor)!==JSON.stringify(state.data.actor)){
            clearCalendarOwnerState();yearCache.clear();
            installBootstrap(snapshot,true,false);yearCache.set(Number(year),snapshot);
            return;
          }
          if(JSON.stringify(state.data.events)===beforeEvents && JSON.stringify(state.data.pendingRemovals)===beforeRemovals){
            affected.push(...state.data.events,...snapshot.events);state.data.events=snapshot.events;
            if(Array.isArray(snapshot.pendingRemovals))state.data.pendingRemovals=snapshot.pendingRemovals;
            state.pendingJobSnapshotRefresh=false;
          }
        }
        state.calendarJobs=[...jobs,...[...old.values()].filter(j=>(j.blocked||j.state==='CAPTURE_UNKNOWN')&&!jobs.some(n=>n.jobId===j.jobId))];
        state.calendarJobsError='';renderCalendarJobs();renderDirtyPill();
        if(['events','weekly'].includes(state.page)&&affected.some(Boolean))refreshEventViewLocally({close:false,keepOverlay:true,affected:affected.filter(Boolean)});
        else if(state.page==='parent'&&!interactionsBusy())renderParentPublishing();
      }catch(error){if(sameCalendarOwner(owner)){state.calendarJobsError='Save status could not be checked. Your accepted changes are retained.';renderCalendarJobs();renderDirtyPill();}throw error;}
      finally{if(sameCalendarOwner(owner))scheduleCalendarJobs();}
    })();
    state.calendarJobsFlight=flight;
    try{return await flight;}finally{if(state.calendarJobsFlight===flight)state.calendarJobsFlight=null;}
  }
  function renderCalendarJobs() {
    if(!state.calendarJobsEnabled||!state.data)return;
    let panel=$('calendarJobsPanel');
    if(!panel){panel=document.createElement('section');panel.id='calendarJobsPanel';panel.className='calendar-jobs-panel';panel.setAttribute('aria-label','Calendar save jobs');$('freshnessBar')?.after(panel);}
    const jobs=state.calendarJobs||[],visible=[...jobs.filter(j=>j.state!=='SAVED'),...jobs.filter(j=>j.state==='SAVED').slice(0,5)];
    panel.hidden=!state.calendarJobsExpanded || (!visible.length&&!state.calendarJobsError);
    const content=`<div class="calendar-jobs-heading"><strong>Save details</strong><button type="button" class="text-link" data-job-refresh>Check status</button><button type="button" class="text-link" data-job-close aria-label="Close save details">×</button></div><p class="calendar-jobs-note">Saved changes are sent to Google Calendar when an administrator runs sync.</p>${state.calendarJobsError?`<p role="status">${esc(state.calendarJobsError)}</p>`:''}<div class="calendar-job-list">${visible.map(job=>{
      const event=job.payload.event||(state.data.events||[]).find(e=>e.EventID===jobEventId(job))||{};
      const title=event.StaffTitle||jobEventId(job)||'New event';
      return `<div class="calendar-job-row ${job.state==='NEEDS_ATTENTION'||job.state==='CAPTURE_UNKNOWN'?'attention':''}" data-calendar-job="${esc(job.jobId)}"><div><strong>${esc(title)}</strong> <span class="calendar-job-state" role="status">${esc(calendarJobLabel(job))}</span><details class="calendar-job-technical"><summary>Technical details</summary><small>${esc(job.action)} · ${esc(jobEventId(job)||'New event')} · ${esc(event.StartDate||'')} · Job ${esc(job.jobId)} · Attempt ${esc(job.attemptOperationId||job.jobId)} · ${Number(job.attempts||0)} write(s), ${Number(job.checks||0)} receipt check(s)</small></details>${job.error?`<p>${esc(job.error.message||job.error.error||'Review this proposal.')}</p>`:''}</div><div class="calendar-job-actions"><button type="button" class="text-link" data-job-proposal="${esc(job.jobId)}">View proposal</button>${job.canRetry?`<button type="button" class="secondary" data-job-recover="retry" data-job-id="${esc(job.jobId)}">Retry confirmed not saved</button>`:''}${job.canCheck?`<button type="button" class="secondary" data-job-recover="check" data-job-id="${esc(job.jobId)}">Check exact receipt</button>`:''}${job.state==='CAPTURE_UNKNOWN'?`<button type="button" class="secondary" data-job-recover="capture" data-job-id="${esc(job.jobId)}">Check acceptance</button>`:''}</div></div>`;
    }).join('')}</div>`;
    if(panel._calendarContent===content)return;
    const selection=window.getSelection?.();
    if(selection && !selection.isCollapsed && selection.rangeCount && selection.getRangeAt(0).intersectsNode(panel)){state.pendingJobsRender=true;return;}
    state.pendingJobsRender=false;
    const expanded=[...panel.querySelectorAll('.calendar-job-technical[open]')].map(detail=>detail.closest('[data-calendar-job]').dataset.calendarJob);
    const focused=panel.contains(document.activeElement)?document.activeElement:null;
    const focusedJob=focused?.closest('[data-calendar-job]')?.dataset.calendarJob;
    panel.innerHTML=content;
    panel._calendarContent=content;
    for(const row of panel.querySelectorAll('[data-calendar-job]')){
      if(expanded.includes(row.dataset.calendarJob))row.querySelector('.calendar-job-technical').open=true;
      if(focusedJob===row.dataset.calendarJob){
        const replacement=focused.tagName==='SUMMARY'?row.querySelector('summary'):[...row.querySelectorAll('button')].find(button=>button.dataset.jobRecover===focused.dataset.jobRecover && button.dataset.jobProposal===focused.dataset.jobProposal);
        replacement?.focus({preventScroll:true});
      }
    }
    panel.querySelector('[data-job-close]').onclick=()=>{state.calendarJobsExpanded=false;renderCalendarJobs();renderDirtyPill();$('dirtyPill')?.querySelector('button')?.focus({preventScroll:true});};
    panel.querySelector('[data-job-refresh]').onclick=()=>loadCalendarJobs().catch(err=>toast(err.message,true));
    panel.querySelectorAll('[data-job-proposal]').forEach(button=>button.onclick=()=>openCalendarJobProposal(jobs.find(j=>j.jobId===button.dataset.jobProposal)));
    panel.querySelectorAll('[data-job-recover]').forEach(button=>button.onclick=async()=>{
      const owner=calendarOwnerContext();
      const job=(state.calendarJobs||[]).find(j=>j.jobId===button.dataset.jobId);if(!job)return;button.disabled=true;
      try{
        const input=button.dataset.jobRecover==='capture'?{kind:'enqueue',action:job.action,payload:job.payload}:{kind:button.dataset.jobRecover,jobId:job.jobId,attemptOperationId:job.attemptOperationId};
        const response=await fetchJson('/api/calendar-jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
        if(!sameCalendarOwner(owner))return;
        if(response.result?.state==='SAVED')state.pendingJobSnapshotRefresh=true;
        rememberCalendarJob(response.result);await loadCalendarJobs();
      }catch(err){if(sameCalendarOwner(owner)){toast(err.message,true);button.disabled=false;}}
    });
  }
  function openCalendarJobProposal(job) {
    if(!job||!confirmUnsavedChanges('view this retained proposal'))return;
    openModal(`<div class="modal-head"><h3>Retained event proposal</h3><button class="close-x" data-close>&times;</button></div><div class="modal-body"><p>${esc(calendarJobLabel(job))}. Job ${esc(job.jobId)}.</p><p>Google remains authoritative. Review the current event before creating a revised change.</p><pre class="calendar-job-proposal">${esc(JSON.stringify({action:job.action,payload:job.payload,error:job.error},null,2))}</pre></div><div class="modal-foot"><button type="button" class="secondary" data-close>Close</button><button type="button" class="primary" id="downloadCalendarJobProposal">Download proposal</button></div>`);
    if(job.outcome==='REJECTED' && ['CONFLICT','STALE_DISPATCH'].includes(job.error?.code) && job.error.current){
      const baseline=job._uiBaseline||{},proposal=job.payload.event||job.payload;
      showConflictReview(responseError(job.error),baseline,proposal,latest=>{
        if(!isCalendarEditable())return;
        if(job.action==='saveEvent')openEventModal({...proposal,_revision:latest._revision},{reviewBaseline:latest});
        else if(job.action==='saveParentSide'){
          openParentModal(latest);
          const form=$('parentForm');if(form){form.elements.ParentEnabled.checked=yes(job.payload.ParentEnabled);form.elements.ParentTitle.value=job.payload.ParentTitle||'';form.elements.ParentDescription.value=job.payload.ParentDescription||'';}
        }else if(job.action==='relocateEvent')openRelocation(latest,{date:job.payload.targetDate,laneId:job.payload.targetLaneId,shift:job.payload.targetShift,anchorDate:job.payload.anchorDate});
        else openEventModal(latest);
        const form=$('modalHost').querySelector('form');if(form)form.dataset.dirty='1';
      },{baselineAvailable:!!job._uiBaseline});
    }
    $('downloadCalendarJobProposal').onclick=()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(job,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`calendar-job-${job.jobId}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
  }
  function applyGlossaryRecord(saved) {
    if(!saved?.Tag||!saved._metadataRevision)throw new Error('The glossary write did not include its revision. Your editor is retained; refresh before another edit.');
    const key=String(saved.Tag).toLowerCase(),seen=new Set();
    for(const data of [state.data,...yearCache.values()]){
      if(!data||seen.has(data))continue;seen.add(data);
      for(const field of ['tags','editableTags']){
        if(!Array.isArray(data[field]))continue;
        const rows=data[field].filter(t=>String(t.Tag).toLowerCase()!==key);
        if(!saved.deleted&&(field==='editableTags'||yes(saved.Active)))rows.push({...saved});
        data[field]=rows.sort((a,b)=>String(a.Tag).localeCompare(String(b.Tag),'en',{sensitivity:'base'}));
      }
      if(data.metadataRevisions?.tags)data.metadataRevisions.tags[key]=saved._metadataRevision;
    }
    renderGlossary();
    document.querySelectorAll('select[name="OwnerTag"]').forEach(select=>{
      const value=select.value,rows=[...(state.data.tags||[])];
      if(value&&!rows.some(t=>t.Tag===value))rows.push({Tag:value,Meaning:'Previously selected tag'});
      select.innerHTML=rows.map(t=>`<option value="${esc(t.Tag)}">[${esc(t.Tag)}] ${esc(t.Meaning)}</option>`).join('');select.value=value;
    });
  }
  function bindCalendarVenuePicker(form) {
    const input=$('calendarVenueInput'),selected=form.elements.VenueID,location=form.elements.Location,list=$('calendarVenueSuggestions'),help=$('calendarVenueHelp'),host=$('calendarVenueChips');
    const catalogue=state.data.venues||[],ids=selected.value.split(',').filter(Boolean),chips=[];
    let remaining=location.value,active=-1;
    for(const id of ids){
      const venue=catalogue.find(v=>v.id===id);
      const labels=venue?[`${venue.unit} ${venue.name}`,`${venue.name} (${venue.unit})`,venue.name,venue.unit,...(venue.aliases||[])]:[];
      const label=labels.find(value=>remaining===value||remaining.startsWith(value+', '));
      if(label){chips.push({id,label});remaining=remaining.slice(label.length).replace(/^, /,'');}
      else {
        // A custom chip may precede or separate directory chips. Find the next
        // exact label at a delimiter; commas inside a venue name stay intact.
        const found=labels.map(label=>({label,at:remaining.indexOf(', '+label)})).filter(x=>x.at>=0&&(remaining.length===x.at+2+x.label.length||remaining.slice(x.at+2+x.label.length).startsWith(', '))).sort((a,b)=>a.at-b.at||b.label.length-a.label.length)[0];
        if(found){chips.push({id:'',label:remaining.slice(0,found.at)},{id,label:found.label});remaining=remaining.slice(found.at+2+found.label.length).replace(/^, /,'');}
        else {const parts=remaining.split(', ');chips.push({id,label:ids.length===1?remaining:parts.shift()||id});remaining=ids.length===1?'':parts.join(', ');}
      }
    }
    if(remaining)chips.push({id:'',label:remaining});
    const normalHelp=help.textContent;
    if(state.data.venueSource?.status!=='ready')help.textContent='School venue lookup could not load. Custom location text is still supported. Selecting a venue does not reserve it.';
    const close=()=>{list.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
    const sync=()=>{selected.value=chips.filter(c=>c.id).map(c=>c.id).join(',');location.value=chips.map(c=>c.label).join(', ');form.dataset.dirty='1';};
    const render=()=>{
      host.innerHTML=chips.map((chip,i)=>`<button type="button" class="calendar-venue-chip${chip.id?'':' custom'}" data-remove-venue="${i}" aria-label="Remove ${esc(chip.label)}"><span aria-hidden="true">×</span><span>${esc(chip.label)}</span></button>`).join('');
      host.querySelectorAll('[data-remove-venue]').forEach(button=>button.onclick=()=>{chips.splice(Number(button.dataset.removeVenue),1);sync();render();input.focus();});
    };
    const add=chip=>{
      if(chip.id&&chips.some(c=>c.id===chip.id)){input.value='';close();return true;}
      if(!chip.id&&chips.some(c=>!c.id)){help.textContent='Remove the existing custom location before adding another.';return false;}
      if(chips.length>=6){help.textContent='Choose up to six locations. Remove a chip before adding another.';return false;}
      chips.push(chip);sync();render();input.value='';help.textContent=normalHelp;close();return true;
    };
    const choose=id=>{const venue=catalogue.find(v=>v.id===id);if(venue)add({id:venue.id,label:`${venue.unit} ${venue.name}`});};
    const commit=()=>{
      const text=input.value.trim();if(!text)return true;
      const exact=catalogue.find(v=>[`${v.unit} ${v.name}`,`${v.name} (${v.unit})`,v.name,v.unit,...(v.aliases||[])].some(label=>label.toLocaleLowerCase()===text.toLocaleLowerCase()));
      return exact?add({id:exact.id,label:`${exact.unit} ${exact.name}`}):add({id:'',label:text});
    };
    const search=()=>{
      const words=input.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const venues=words.length?catalogue.filter(v=>v.active!==false&&words.every(word=>[v.unit,v.name,...(v.aliases||[])].join(' ').toLocaleLowerCase().includes(word))).slice(0,12):[];
      list.innerHTML=venues.map((v,i)=>`<button type="button" role="option" id="calendarVenueOption${i}" data-calendar-venue="${esc(v.id)}" aria-selected="false"><strong>${esc(v.unit)}</strong> ${esc(v.name)}</button>`).join('');
      list.hidden=!venues.length;input.setAttribute('aria-expanded',String(!!venues.length));active=-1;
      list.querySelectorAll('[data-calendar-venue]').forEach(button=>{button.onmousedown=ev=>ev.preventDefault();button.onclick=()=>choose(button.dataset.calendarVenue);});
    };
    render();input.addEventListener('input',search);input.addEventListener('focus',search);input.addEventListener('blur',()=>setTimeout(close,100));
    input.addEventListener('keydown',event=>{
      const buttons=[...list.querySelectorAll('[data-calendar-venue]')];
      if(event.key==='Escape'){close();return;}
      if(event.key==='Backspace'&&!input.value&&chips.length){event.preventDefault();chips.pop();sync();render();return;}
      if(['ArrowDown','ArrowUp'].includes(event.key)&&buttons.length){event.preventDefault();active=(active+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons.forEach((b,i)=>b.setAttribute('aria-selected',String(i===active)));input.setAttribute('aria-activedescendant',buttons[active].id);}
      if(event.key==='Enter'){event.preventDefault();if(!list.hidden&&active>=0)choose(buttons[active].dataset.calendarVenue);else commit();}
    });
    return {commit};
  }

  function waitForRecovery(pending, notSaved) {
    hideWorkOverlay();
    return new Promise((resolve,reject) => {
      pending.resolve=resolve; pending.reject=reject;
      showRecoveryPanel(pending,notSaved);
    });
  }

  function showRecoveryPanel(pending, notSaved) {
    $('mutationRecovery')?.remove();
    const panel = document.createElement('div'); panel.id='mutationRecovery'; panel.className='notice mutation-recovery';
    panel.setAttribute('role','status');
    panel.innerHTML=`<strong>${notSaved ? 'Confirmed not saved' : 'Save status unknown'}</strong>
      <p>${notSaved ? 'The original request has been closed safely. Your proposed change is retained.' : 'The server has not confirmed the outcome. Do not create a replacement event. Your proposal is retained here.'}</p>
      <div class="recovery-actions"><button type="button" class="primary" id="checkMutationBtn">${notSaved ? 'Retry' : 'Check status'}</button>
      <button type="button" class="secondary" id="downloadProposalBtn">Download proposal</button>
      ${notSaved ? '<button type="button" class="secondary" id="cancelMutationBtn">Return to proposal</button>' : ''}</div>`;
    const body = document.querySelector('#modalHost .modal-body') || $('modalHost');
    body.prepend(panel);
    panel.scrollIntoView({block:'nearest'});
    $('downloadProposalBtn').onclick=() => {
      const url=URL.createObjectURL(new Blob([JSON.stringify({version:FRONTEND_VERSION,...pending,payload:pending.payload,resolve:undefined,reject:undefined},null,2)],{type:'application/json'}));
      const a=document.createElement('a'); a.href=url; a.download=`calendar-save-proposal-${pending.payload.operationId}.json`; a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    if ($('cancelMutationBtn')) $('cancelMutationBtn').onclick=() => pending.reject(responseError({code:'NOT_SAVED',message:'Nothing was saved. Your proposal is still available.'}));
    $('checkMutationBtn').onclick=async () => {
      const button=$('checkMutationBtn'); button.disabled=true; button.textContent=notSaved?'Saving…':'Checking whether saved…';
      try {
        if (notSaved) {
          // The previous operation was fenced; a new identity is safe only after NOT_SAVED.
          pending.payload.operationId=crypto.randomUUID();
          const result=await rawApi(pending.action,pending.payload);
          pending.resolve(assertMutationResult(pending.action,result)); return;
        }
        const outcome=await readMutationStatus(pending);
        if (outcome.state==='SAVED') {pending.resolve(assertMutationResult(pending.action,outcome.result));return;}
        if (outcome.state==='REJECTED') {pending.reject(responseError(outcome.error||{}));return;}
        showRecoveryPanel(pending,outcome.state==='NOT_SAVED');
      } catch(err) {
        if(err.definite) {pending.reject(err);return;}
        // A retry response can itself be lost. Check it once automatically; never repeat the write.
        try {
          const outcome=await readMutationStatus(pending);
          if(outcome.state==='SAVED'){pending.resolve(assertMutationResult(pending.action,outcome.result));return;}
          if(outcome.state==='REJECTED'){pending.reject(responseError(outcome.error||{}));return;}
          showRecoveryPanel(pending,outcome.state==='NOT_SAVED');
        } catch(ignored) {showRecoveryPanel(pending,false);}
      }
    };
  }

  function showConflictReview(err, baseline, proposal, accepted, options = {}) {
    if (!err.current || !['CONFLICT','STALE_DISPATCH'].includes(err.code)) {toast(err.message,true); return;}
    $('conflictReview')?.remove();
    const latest=err.current;
    const fields=GSPSCalendarCore.EDIT_FIELDS.filter(k => k!=='EventID' && (err.code==='STALE_DISPATCH'||String(baseline[k]||'')!==String(latest[k]||'')));
    const box=document.createElement('div'); box.id='conflictReview'; box.className='notice';
    box.innerHTML=`<strong>${esc(err.code==='STALE_DISPATCH'?err.message:'A colleague changed this event.')}</strong><p>Your proposal has not been saved or discarded. Review the differences before resubmitting.</p>
      <div class="conflict-table-wrap"><table class="data-table"><thead><tr><th>Field</th><th>${options.baselineAvailable===false?'Before queued change':'When opened'}</th><th>Latest saved</th><th>Your proposal</th></tr></thead><tbody>
      ${fields.map(k=>`<tr><td>${esc(k)}</td><td class="wrap">${options.baselineAvailable===false?'Not retained':esc(baseline[k])}</td><td class="wrap">${esc(latest[k])}</td><td class="wrap">${esc(proposal[k]??baseline[k])}</td></tr>`).join('')}</tbody></table></div>
      <p>Keeping your proposal may replace the newer values shown above. Nothing is submitted by the review button.</p>
      <button id="acceptConflictReview" type="button" class="secondary">Reviewed — keep my proposal</button>`;
    (document.querySelector('#modalHost .modal-body') || $('modalHost')).prepend(box);
    box.scrollIntoView({block:'nearest'});
    $('acceptConflictReview').onclick=()=>{accepted(latest);box.remove();toast('Review recorded. Check your proposal, then save again.');};
  }
  function relocationProposal(source, destination, copy = false) {
    const lane=(state.data.lanes||[]).find(l=>l.LaneID===destination.laneId);
    if (!lane) throw new Error('Destination lane not found.');
    const anchor=destination.anchorDate || dateOnly(source.StartDate);
    const delta=GSPSCalendarCore.dateNumber(destination.date)-GSPSCalendarCore.dateNumber(anchor);
    const newStart=GSPSCalendarCore.shifted(dateOnly(source.StartDate),delta);
    if (!laneAvailableOnDate(lane,destination.date) || !laneAvailableOnDate(lane,newStart)) throw new Error('This lane is unavailable on the new start/grabbed date.');
    return GSPSCalendarCore.relocate(source,{year:state.year,anchorDate:anchor,targetDate:destination.date,
      lane,shift:destination.shift,copy,
      defaultStart:defaultStartForLane(lane,destination.shift,newStart),defaultEnd:defaultEndForLane(lane,destination.shift,newStart)});
  }

  function placementSummary(event) {
    const lane=(state.data.lanes||[]).find(l=>l.LaneID===event.LaneID) || {};
    const shift=event.ShiftSpan==='PM_I' ? lane.ShiftALabel || 'PM(i)' : event.ShiftSpan==='PM_II' ? lane.ShiftBLabel || 'PM(ii)' : event.ShiftSpan==='BOTH' ? 'PM(i) + PM(ii)' : '';
    const start=dateOnly(event.StartDate),end=dateOnly(event.EndDate || start);
    return `${eventDateLabel(event)} · ${lane.Header || event.LaneID}${shift?' / '+shift:''}`;
  }

  function openRelocation(source, destination = {}) {
    if (!state.data.actor.isAdmin || !isCalendarEditable()) return;
    if(guardPendingEvent(source))return;
    rememberEditedEvent(source,destination.anchorDate);
    let baseline=JSON.parse(JSON.stringify(source));
    const anchor=destination.anchorDate || dateOnly(source.StartDate);
    const choices=displayColumns().map(l=>({key:l.laneId+'|'+l.shift,label:l.label}));
    (state.data.lanes||[]).filter(l=>yes(l.SupportsShift)).forEach(l=>choices.push({key:l.LaneID+'|BOTH',label:l.Header+' · Both shifts'}));
    const selectedKey=(destination.laneId || source.LaneID)+'|'+(destination.shift || source.ShiftSpan || 'NONE');
    openModal(`<div class="modal-head"><h3>Move / Copy event</h3><button class="close-x" data-close>&times;</button></div>
      <form id="relocationForm"><div class="modal-body">
      <strong>[${esc(source.OwnerTag)}] ${esc(source.StaffTitle)}</strong>
      <p class="privacy-note">${destination.anchorDate ? `The grabbed day (${esc(anchor)}) lands on the destination date.` : 'The destination date refers to the event’s start date.'} The full span is preserved.</p>
      <div class="form-grid"><div class="field"><label for="relocateDate">Destination date</label><input id="relocateDate" name="date" type="date" required min="${state.year}-01-01" max="${state.year}-12-31" value="${esc(destination.date || dateOnly(source.StartDate))}"></div>
      <div class="field"><label for="relocateLane">Destination lane</label><select id="relocateLane" name="lane">${choices.map(l=>`<option value="${esc(l.key)}">${esc(l.label)}</option>`).join('')}</select></div></div>
      <div id="relocationPreview" class="card" style="margin-top:12px"></div>
      <p class="privacy-note">Copies start Hidden on the staff side, as in RC1.5, and are excluded from the parent calendar. Moving retains publication settings.</p>
      </div><div class="modal-foot"><button type="button" class="secondary" data-close>Cancel</button>
      <button id="confirmCopy" type="button" class="secondary">Copy</button><button id="confirmMove" type="button" class="primary">Move</button></div></form>`);
    $('relocateLane').value=selectedKey;
    const relocationForm=$('relocationForm');
    let dest, proposal;
    const preview=()=>{
      const [laneId,shift]=$('relocateLane').value.split('|');
      dest={date:$('relocateDate').value,laneId,shift,anchorDate:anchor};
      try {
        proposal=relocationProposal(baseline,dest);
        $('relocationPreview').innerHTML=`<div><strong>From:</strong> ${esc(placementSummary(baseline))}</div><div style="margin-top:8px"><strong>To:</strong> ${esc(placementSummary(proposal))}</div>
        ${baseline.EventType!==proposal.EventType?'<p><strong>Time mode changes:</strong> '+esc(baseline.EventType)+' → '+esc(proposal.EventType)+'</p>':''}
        ${yes(baseline.ParentEnabled)?'<p class="notice">This event is included in the parent calendar. Its dates/times will be updated at the next parent sync. This warning applies to Move; a copy starts excluded.</p>':''}`;
        $('confirmMove').disabled=false;$('confirmCopy').disabled=false;
      } catch(err){proposal=null;$('relocationPreview').textContent=err.message;$('confirmMove').disabled=true;$('confirmCopy').disabled=true;}
    };
    $('relocateDate').addEventListener('change',preview);$('relocateLane').addEventListener('change',preview);
    const submit=async mode=>{
      if (!proposal || state.pendingMutation) return;
      $('confirmMove').disabled=true; $('confirmCopy').disabled=true;
      showWorkOverlay(mode==='move'?'Moving Event':'Copying Event','Saving… original tiles stay in place until confirmed.');
      try {
        const result=await api('relocateEvent',{eventId:baseline.EventID,expectedRevision:baseline._revision,
          year:state.year,mode,anchorDate:dest.anchorDate,targetDate:dest.date,targetLaneId:dest.laneId,targetShift:dest.shift});
        if(isCalendarJob(result)){finishQueuedEvent(result,[baseline]);return;}
        const saved=upsertLocalEvent(result);
        refreshEventViewLocally({close:true,affected:[baseline,saved]});
        showRelocationSuccess(mode,dest.date);
      } catch(err) {
        if(err.code==='STALE_CALENDAR_CONTEXT')return;
        if($('relocationForm')!==relocationForm)return;
        hideWorkOverlay();
        showConflictReview(err,baseline,proposal,latest=>{
          // Preserve the intended new start and lane, then require a fresh confirmation.
          const retainedStart=proposal.StartDate;
          openRelocation(latest,{date:retainedStart,laneId:dest.laneId,shift:dest.shift});
        });
        preview();
      }
    };
    $('confirmMove').onclick=()=>submit('move');$('confirmCopy').onclick=()=>submit('copy');preview();
  }

  function showRelocationSuccess(mode, destinationDate) {
    const message=mode==='copy'?'Event copied as Hidden; excluded from the parent calendar.':'Event moved. Awaiting sync.';
    toast(message);
    const host=$('calendarMessage'); if(!host)return;
    host.innerHTML='';
    if(state.page!=='events' || GSPSCalendarCore.dateMatches(destinationDate,yearView().filter)){host.classList.add('hidden');return;}
    host.classList.remove('hidden');host.appendChild(document.createTextNode(message+' Destination is outside the current date filter. '));
    const button=document.createElement('button');button.className='text-link';button.textContent='Show destination';
    button.onclick=()=>{
      const [y,m,d]=destinationDate.split('-');$('dateSearch').value=`${d}/${m}/${y}`;applyDateSearch();
      document.querySelector(`#calendarHost .cal-row[data-date="${destinationDate}"]`)?.scrollIntoView({block:'nearest'});
      host.classList.add('hidden');
    };host.appendChild(button);
  }

  function bindCalendarActions(host, weekly = false) {
    host.onclick=ev=>{
      if (performance.now() < (state.suppressClickUntil || 0)) return;
      if (!isCalendarEditable()) {if(ev.target.closest('.editable,.cell-add,.editable-note'))toast('This calendar is read-only until verification or save recovery completes.',true);return;}
      const card=ev.target.closest('[data-event-id]');
      if(card){if(card.dataset.eventId.startsWith('JOB-')){openCalendarJobProposal((state.calendarJobs||[]).find(j=>'JOB-'+j.jobId===card.dataset.eventId));return;}const event=(state.data.events||[]).find(e=>e.EventID===card.dataset.eventId);if(!event)return;
        if(state.data.actor.isAdmin)openEventModal(event,{anchorDate:card.dataset.segmentDate});else if(state.data.actor.isParentPublisher)openParentModal(event,null,card.dataset.segmentDate);return;}
      const add=ev.target.closest('.cell-add');
      if(add && state.data.actor.isAdmin){openEventModal(null,{StartDate:add.dataset.addDate,EndDate:add.dataset.addDate,LaneID:add.dataset.addLane,ShiftSpan:add.dataset.addShift});return;}
      const note=ev.target.closest('[data-note-date]');
      if(note && state.data.actor.isAdmin){const n=(state.data.dayNotes||[]).find(n=>dateOnly(n.Date)===note.dataset.noteDate);openDayNoteModal(note.dataset.noteDate,n?.Text||'');}
    };
    host.onkeydown=ev=>{
      if(['Enter',' '].includes(ev.key) && ev.target.matches('[data-event-id][role="button"],[data-note-date][role="button"]')){ev.preventDefault();ev.target.click();}
    };
    bindGridDragDrop(host,weekly);
  }

  function bindGridDragDrop(host, weekly) {
    const clear=()=>{host.querySelectorAll('.drop-hover,.dragging').forEach(e=>e.classList.remove('drop-hover','dragging'));};
    const targetFor=ev=>{
      const cell=ev.target.closest(weekly?'.week-day[data-date]':'.cal-cell[data-cell-date]');
      if(!cell || !state.drag)return null;
      const source=state.drag.source;
      const dest={date:weekly?cell.dataset.date:cell.dataset.cellDate,laneId:weekly?source.LaneID:cell.dataset.cellLane,
        shift:weekly?source.ShiftSpan:cell.dataset.cellShift,anchorDate:state.drag.anchorDate};
      try{relocationProposal(source,dest);return {cell,dest};}catch(err){return null;}
    };
    host.ondragstart=ev=>{
      const card=ev.target.closest('[data-event-id][draggable="true"]');
      if(!card || !state.data.actor.isAdmin || !isCalendarEditable() || $('modalHost').firstElementChild){ev.preventDefault();return;}
      const source=(state.data.events||[]).find(e=>e.EventID===card.dataset.eventId);if(!source){ev.preventDefault();return;}
      if(pendingEventJob(source.EventID)){ev.preventDefault();guardPendingEvent(source);return;}
      state.drag={source:JSON.parse(JSON.stringify(source)),anchorDate:card.dataset.segmentDate || dateOnly(source.StartDate)};
      ev.dataTransfer.effectAllowed='copyMove';ev.dataTransfer.setData('text/plain',source.EventID);card.classList.add('dragging');
    };
    host.ondragover=ev=>{
      if(!state.drag || !isCalendarEditable())return;
      const hit=targetFor(ev);host.querySelectorAll('.drop-hover').forEach(e=>{if(e!==hit?.cell)e.classList.remove('drop-hover');});
      if(hit){ev.preventDefault();ev.dataTransfer.dropEffect='move';hit.cell.classList.add('drop-hover');}
    };
    host.ondragenter=host.ondragover;
    host.ondragleave=ev=>{const cell=ev.target.closest('.drop-hover');if(cell && !cell.contains(ev.relatedTarget))cell.classList.remove('drop-hover');};
    host.ondrop=ev=>{
      const hit=targetFor(ev);if(!hit || !isCalendarEditable())return;
      ev.preventDefault();ev.stopPropagation();const source=state.drag.source;clear();state.drag=null;
      state.suppressClickUntil=performance.now()+120;openRelocation(source,hit.dest);
    };
    host.ondragend=()=>{clear();state.drag=null;state.suppressClickUntil=performance.now()+120;drainDeferredRefresh();};
  }
  function calendarRenderContext() {
    const laneMap={},noteMap={};
    (state.data.lanes||[]).forEach(l=>{laneMap[l.LaneID]=l;});
    (state.data.dayNotes||[]).forEach(n=>{noteMap[dateOnly(n.Date)]=n;});
    const structure=state.data.yearStructure||[];
    return {lanes:displayColumns(),laneMap,noteMap,eventMap:eventsByDate(calendarDisplayEvents()),structure,
      vacations:vacationStructures(structure),yearRow:(state.data.years||[]).find(y=>Number(y.Year)===state.year)||{},today:sgToday()};
  }

  function calendarRowHtml(date, ctx) {
    const iso=isoDate(date),dow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()];
    const meta=structureMetaForDate(ctx.structure,iso);
    const cls=['cal-row'];
    if(date.getDay()===0||date.getDay()===6)cls.push('weekend');
    if(inDateRange(iso,ctx.yearRow.RamadanStart,ctx.yearRow.RamadanEnd))cls.push('ramadan');
    if(iso===ctx.today)cls.push('today');
    if(!GSPSCalendarCore.dateMatches(iso,yearView().filter))cls.push('hidden');
    const fmt=resolveDayFormatting(iso,date,ctx.yearRow),style=formattingStyle(fmt,false);
    const border=iso!==ctx.today&&fmt.border?`outline:2px solid ${safeColour(fmt.border)};outline-offset:-2px;`:'';
    let html=`<div class="${cls.join(' ')}" data-date="${iso}" style="${border}">`;
    html+=`<div class="cal-meta ${date.getDate()===1?'month-marker':''}" style="${style}">${esc(formatDateShort(date))}</div>`;
    html+=`<div class="cal-meta" style="${style}">${esc(meta.term||'')}</div><div class="cal-meta" style="${style}">${esc(meta.week||'')}</div><div class="cal-meta" style="${style}">${dow}</div>`;
    const note=ctx.noteMap[iso];
    html+=`<div class="cal-cell planning-note-cell ${state.data.actor.isAdmin?'editable-note':''}" style="${style}" ${state.data.actor.isAdmin?`data-note-date="${iso}" role="button" tabindex="0" aria-label="Planning note ${iso}"`:''}>${note?.Text?`<div class="planning-note-text">${esc(note.Text)}</div>`:state.data.actor.isAdmin?'<span class="planning-note-placeholder">Add note</span>':''}</div>`;
    ctx.lanes.forEach(displayLane=>{
      const events=(ctx.eventMap[iso]||[]).filter(e=>eventInDisplayLane(e,displayLane));
      const vacation=displayLane.laneId==='day'?ctx.vacations.find(v=>inDateRange(iso,v.StartDate,v.EndDate)):null;
      const lane=ctx.laneMap[displayLane.laneId],available=laneAvailableOnDate(lane,iso),canAdd=state.data.actor.isAdmin&&available;
      html+=`<div class="cal-cell ${canAdd?'has-add ':''}${available?'':'lane-unavailable'}" data-cell-date="${iso}" data-cell-lane="${esc(displayLane.laneId)}" data-cell-shift="${esc(displayLane.shift)}" style="${style}${available?'':'background-color:#ECEFF1!important;'}" ${available?'':`title="${esc((lane?.Header||displayLane.label)+' is not configured for '+dow)}"`}>`;
      if(canAdd)html+=`<button class="cell-add" title="Add event" aria-label="Add event ${iso} ${esc(displayLane.label)}" data-add-date="${iso}" data-add-lane="${esc(displayLane.laneId)}" data-add-shift="${esc(displayLane.shift)}">+</button>`;
      html+=(vacation?vacationCardHtml(vacation,iso,false):'')+events.map(e=>eventCardHtml(e,iso,displayLane)).join('')+'</div>';
    });
    return html+'</div>';
  }

  function weeklyDayHtml(date, ctx) {
    const key=isoDate(date),cls=['week-day'];
    if(date.getDay()===0||date.getDay()===6)cls.push('weekend');
    if(inDateRange(key,ctx.yearRow.RamadanStart,ctx.yearRow.RamadanEnd))cls.push('ramadan');
    if(key===ctx.today)cls.push('today');
    const events=(ctx.eventMap[key]||[]).slice().sort((a,b)=>laneSort(a,ctx.laneMap)-laneSort(b,ctx.laneMap)||String(a.StartTime||'').localeCompare(String(b.StartTime||''))||String(a.StaffTitle||'').localeCompare(String(b.StaffTitle||'')));
    const style=formattingStyle(resolveWeeklyCellFormatting(key,date,ctx.yearRow,events),true);
    const vacation=ctx.vacations.find(v=>inDateRange(key,v.StartDate,v.EndDate));
    return `<td class="${cls.join(' ')}" data-date="${key}" style="${style}"><div class="week-date"><strong>${date.getDate()}</strong> ${esc(date.toLocaleString('en-SG',{month:'short'}))}</div>${vacation?vacationCardHtml(vacation,key,true):''}${events.map(e=>weekEventHtml(e,ctx.laneMap,key)).join('')}</td>`;
  }

  function patchEventDates(affected) {
    const ctx=calendarRenderContext();
    const keys=Object.keys(eventsByDate(affected.filter(Boolean)));
    let patched=0;
    keys.forEach(key=>{
      const old=state.page==='events'?document.querySelector(`#calendarHost .cal-row[data-date="${key}"]`):document.querySelector(`#weeklyHost .week-day[data-date="${key}"]`);
      if(!old)return;
      replaceCalendarRow(old,state.page==='events'?calendarRowHtml(parseISODate(key),ctx):weeklyDayHtml(parseISODate(key),ctx));
      patched++;
    });
    // An off-screen/out-of-year date is a successful no-op, never a reason to
    // recreate the entire calendar and lose its focus or scroll position.
    return !!document.querySelector(state.page==='events'?'#calendarHost .calendar-wrap':'#weeklyHost .weekly-wrap');
  }

  function replaceCalendarRow(old,html) {
    const template=document.createElement('template');template.innerHTML=html;
    const next=template.content.firstElementChild;
    if(next && !old.isEqualNode(next)){
      const selection=window.getSelection?.();
      if(selection && !selection.isCollapsed && selection.rangeCount && selection.getRangeAt(0).intersectsNode(old)){
        state.pendingGridRefresh=true;return;
      }
      old.replaceWith(next);
    }
  }


  function lockMutationForm(lock) {
    document.querySelectorAll('#modalHost input,#modalHost select,#modalHost textarea,#modalHost button').forEach(el=>{
      if(el.closest('#mutationRecovery'))return;
      if(lock){el.dataset.mutationDisabled=el.disabled?'1':'0';el.disabled=true;}
      else if(el.dataset.mutationDisabled!==undefined){el.disabled=el.dataset.mutationDisabled==='1';delete el.dataset.mutationDisabled;}
    });
  }


  async function readMutationStatus(pending) {
    try { return await rawApi('eventMutationStatus',{action:pending.action,payload:pending.payload},15000); }
    catch (error) {
      // A failed status READ (including lock-busy/auth failure) says nothing
      // about whether the original WRITE committed. Never unlock/retry it on that basis.
      const unavailable=new Error(`Status check unavailable: ${error.message}`);
      unavailable.definite=false;
      throw unavailable;
    }
  }


  function segmentTimeLabel(event, date) {
    const start=dateOnly(event.StartDate),end=dateOnly(event.EndDate || event.StartDate);
    if(end===start)return `${timeOnly(event.StartTime)}–${timeOnly(event.EndTime)}`;
    if(date===start)return `From ${timeOnly(event.StartTime)} · continues`;
    if(date===end)return `Until ${timeOnly(event.EndTime)}`;
    return 'Continues';
  }

  // Push is opt-in. The cursor is tab/actor/year-local and advances only after
  // authorized data has been applied, or a no-data/job-only hint was handled.
  function stopCalendarChangeStream() {
    const channel=state.calendarChangeState;
    if(channel){clearTimeout(channel.timer);clearTimeout(channel.reconnect);channel.stopped=true;channel.socket?.close();}
    delete state.calendarChangeState;
  }
  function startCalendarChangeStream() {
    if(!state.calendarChangePushEnabled||!state.data||!state.year)return;
    const owner=calendarOwnerContext(),year=Number(state.year);
    let channel=state.calendarChangeState;
    if(channel && (!sameCalendarOwner(channel.owner)||channel.year!==year)){stopCalendarChangeStream();channel=null;}
    if(!channel)channel=state.calendarChangeState={owner,year,cursor:0,pendingCursor:0,retries:0,pendingData:false,pendingJobs:false};
    if(channel.socket && [0,1].includes(channel.socket.readyState))return;
    if(typeof WebSocket!=='function'){state.freshnessMessage='Live updates are unavailable in this browser. Use Refresh to check for changes.';updateFreshnessUI();return;}
    clearTimeout(channel.reconnect);
    const url=new URL('/api/calendar-changes',location.href);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('year',year);url.searchParams.set('cursor',channel.cursor);
    const socket=channel.socket=new WebSocket(url.href);
    socket.onmessage=event=>{
      if(channel.stopped||state.calendarChangeState!==channel||!sameCalendarOwner(owner)||Number(state.year)!==year)return;
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.type!=='changes'||!Number.isSafeInteger(message.cursor)||message.cursor<channel.cursor||!Array.isArray(message.entries))return;
      channel.retries=0;
      const current=state.data.actor,access=message.access;
      if(access && (access.userAlias!==current.userAlias||access.isAdmin!==current.isAdmin||access.isParentPublisher!==current.isParentPublisher))channel.permissions=true;
      if(channel.expiredAuthority){channel.expiredAuthority=false;if(!channel.permissions)state.readOnly=false;}
      channel.pendingCursor=Math.max(channel.pendingCursor,message.cursor);
      channel.pendingData ||= message.snapshotRequired===true || message.entries.some(entry=>entry.kind!=='job') || !!channel.permissions;
      channel.pendingJobs ||= message.snapshotRequired===true || message.entries.some(entry=>entry.kind==='job');
      if(message.entries.some(entry=>entry.kind==='permissions'))channel.permissions=true;
      if(message.entries.some(entry=>entry.kind==='reconcile'))channel.uncertain=true;
      if(!channel.pendingData&&!channel.pendingJobs){channel.cursor=channel.pendingCursor;if(!state.loadingYear)state.freshnessMessage=channel.uncertain?'An earlier change needs review; use Refresh to check the current data.':'';updateFreshnessUI();return;}
      clearTimeout(channel.timer);channel.timer=setTimeout(()=>drainCalendarChanges(),150);
    };
    socket.onclose=event=>{
      if(channel.stopped||state.calendarChangeState!==channel||!sameCalendarOwner(owner))return;
      channel.socket=null;
      if(event.code===4401){channel.expiredAuthority=true;state.readOnly=true;}
      state.freshnessMessage='Live updates disconnected. Your view is retained; use Refresh to check changes.';updateFreshnessUI();
      // Bounded reconnect only after a disconnect. No idle data/status timer.
      if(channel.retries<3){const delay=event.code===4401?100:Math.min(30000,1000*2**channel.retries);channel.retries++;channel.reconnect=setTimeout(startCalendarChangeStream,delay);}
    };
    socket.onerror=()=>{};
  }
  async function drainCalendarChanges() {
    const channel=state.calendarChangeState;
    if(!channel||channel.stopped||channel.flight||!sameCalendarOwner(channel.owner)||Number(state.year)!==channel.year)return;
    if(!channel.pendingData&&!channel.pendingJobs)return;
    if((interactionsBusy()||state.loadingYear)&&!channel.permissions){state.freshnessMessage='Updates available; your draft or selection is retained.';updateFreshnessUI();return;}
    const cursor=channel.pendingCursor,needsData=channel.pendingData,needsJobs=channel.pendingJobs,before=JSON.stringify(state.data);
    channel.pendingData=false;channel.pendingJobs=false;channel.flight=true;
    let completed=false;
    try{
      if(needsData){
        const known=(state.data.events||[]).map(event=>({id:String(event.EventID),revision:String(event._changeRevision||event._revision||'')}));
        const response=await fetchJson('/api/calendar-changes/delta',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({year:channel.year,known})});
        if(state.calendarChangeState!==channel||!sameCalendarOwner(channel.owner)||Number(state.year)!==channel.year)return;
        const result=response.result;
        if(!result||result.year!==channel.year||!Array.isArray(result.events)||!Array.isArray(result.removed)||!result.snapshot?.actor)throw Error('Calendar delta was incomplete. Use Refresh to verify the source.');
        const current=state.data,changedActor=JSON.stringify(current.actor)!==JSON.stringify(result.snapshot.actor);
        if(!changedActor&&(snapshotInteractionBusy()||JSON.stringify(current)!==before)){
          channel.pendingData=true;channel.pendingJobs ||= needsJobs;
          state.freshnessMessage='Updates available; your draft is retained.';return;
        }
        const events=new Map(current.events.map(event=>[String(event.EventID),event]));
        result.removed.forEach(id=>events.delete(String(id)));result.events.forEach(event=>events.set(String(event.EventID),event));
        const snapshot={...result.snapshot,events:[...events.values()]};validateBootstrap(snapshot,channel.year);
        if(changedActor){clearCalendarOwnerState();yearCache.clear();installBootstrap(snapshot,true,false);yearCache.set(channel.year,snapshot);return;}
        installCalendarSnapshotInPlace(snapshot,{skipJobs:true});yearCache.set(channel.year,snapshot);
      }
      if(needsJobs&&state.calendarJobsEnabled)await loadCalendarJobs();
      if(state.calendarChangeState!==channel||!sameCalendarOwner(channel.owner))return;
      channel.cursor=Math.max(channel.cursor,cursor);channel.permissions=false;completed=true;
      state.freshnessMessage=channel.uncertain?'An earlier change needs review; the current Google data has been checked.':'';updateFreshnessUI();
    }catch(error){
      if(state.calendarChangeState!==channel||!sameCalendarOwner(channel.owner))return;
      channel.pendingData ||= needsData;channel.pendingJobs ||= needsJobs;
      if([401,403].includes(error.status)){
        clearCalendarOwnerState();yearCache.clear();viewMemory.clear();state.data=null;showLogin();showLoginError('Calendar access changed. Sign in or reload an available year.');
      }else{state.freshnessMessage='Changes could not be checked. Your view is retained; use Refresh.';updateFreshnessUI();}
    }finally{
      channel.flight=false;
      if(completed&&state.calendarChangeState===channel&&(channel.pendingData||channel.pendingJobs)){clearTimeout(channel.timer);channel.timer=setTimeout(()=>drainCalendarChanges(),150);}
    }
  }

})();
