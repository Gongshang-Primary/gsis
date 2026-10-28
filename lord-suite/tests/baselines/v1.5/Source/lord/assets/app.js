/* LORD v1.5 LTS — explicit reload from Sheets */
'use strict';

const API = Object.freeze({
  reference: '/api/reference',
  transaction: '/api/transaction'
});

const STORAGE_KEYS = Object.freeze({
  draft: 'lord_mvp_draft_v1',
  recentTeacher: 'lord_recent_teacher_v1',
  submitIds: 'lord_submit_ids_v1',
  referenceCache: 'lord_reference_cache_v1_3'
});

const state = {
  reference: null,
  mode: null,
  identity: {
    teacher: '',
    teacherCustom: false,
    classOrActivity: '',
    classCustom: false,
    subject: '',
    subjectCustom: false
  },
  loan: {
    cartGroup: '',
    trolleys: [],
    comments: '',
    sessionSearch: '',
    booking: null,
    stylusQuantity: '',
    stylusPhotoData: '',
    stylusFileName: '',
    headphoneQuantity: '',
    headphonePhotoData: '',
    headphoneFileName: ''
  },
  booking: {
    date: '', resource: '', deviceType: '', quantity: 1, startPeriod: '', endPeriod: '', headphones: false, styluses: false, remarks: '', selections: [], availability: [], occupiedPeriods: [], occupancyKey: '', daySchedule: [], scheduleKey: '', scheduleLoading: false, scheduleError: '', scrollLeft: 0, editing: null, bookingForTtbName: ''
  },
  return: {
    openSessions: [],
    selectedSession: null,
    teacher: '',
    trolleys: [],
    selectionMode: 'manual',
    stylusQuantity: 0,
    stylusPhotoData: '',
    stylusFileName: '',
    headphoneQuantity: 0,
    headphonePhotoData: '',
    headphoneFileName: '',
    correctTrolleyDeclaration: false,
    sameOrientationDeclaration: false,
    issue: false,
    issueNotes: '',
    comments: ''
  },
  busy: false,
  reloading: false,
  referenceGeneration: 0
};

const main = document.getElementById('main');
const resetAppBtn = document.getElementById('resetAppBtn');
const networkState = document.getElementById('networkState');

window.addEventListener('online', updateNetworkState);
window.addEventListener('offline', updateNetworkState);
resetAppBtn.addEventListener('click', resetApp);
document.getElementById('reloadDataBtn').addEventListener('click', reloadFromSheets);



function renderLoading(message = 'Retrieving the latest reference data.') {
  main.innerHTML = `
    <section class="card center-card">
      <div class="spinner" aria-hidden="true"></div>
      <h2>Loading LORD</h2>
      <p>${escapeHtml(message)}</p>
    </section>`;
}

function renderFatal(message) {
  main.innerHTML = `
    <section class="card">
      <div class="notice error"><strong>LORD could not start.</strong><br>${escapeHtml(message)}</div>
      <div class="action-grid"><button class="primary-button" id="retryBtn">Try again</button></div>
    </section>`;
  document.getElementById('retryBtn').onclick = init;
}




function renderAdminBookingAccess(){
  main.innerHTML=`<section class="card"><div class="section-title"><div><span class="step-kicker">Admin</span><h2>Manage any booking</h2><p>Use the Booking ID and admin key to edit or cancel a booking.</p></div></div><div class="field"><label for="adminBookingId">Booking ID</label><input class="input" id="adminBookingId" placeholder="BOOK-..."></div><div class="field"><label for="adminPasskey">Admin key</label><input class="input" id="adminPasskey" type="password"></div><div class="action-grid"><button class="ghost-button" id="backBtn">Back</button><button class="primary-button" id="adminOpenBtn">Open Booking</button></div></section>`;
  document.getElementById('backBtn').onclick=renderLanding;
  document.getElementById('adminOpenBtn').onclick=async()=>{const bookingId=document.getElementById('adminBookingId').value.trim(),adminPasskey=document.getElementById('adminPasskey').value;if(!bookingId||!adminPasskey)return alert('Enter the Booking ID and admin key.');renderLoading('Loading booking.');try{const response=await lordFetch(`${API.transaction}?action=bookingGet&bookingId=${encodeURIComponent(bookingId)}&adminPasskey=${encodeURIComponent(adminPasskey)}`,{cache:'no-store'});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'Booking could not be loaded.');applyBookingForEdit(payload.booking,{bookingId,adminPasskey});renderBookingEdit();}catch(e){renderErrorRetry(e.message,renderAdminBookingAccess);}};
}
function applyBookingForEdit(b,editing){state.identity.teacher=b.teacher;state.identity.classOrActivity=b.classOrActivity;state.identity.subject=b.subject;Object.assign(state.booking,{date:b.date,resource:b.resource,deviceType:b.deviceType,quantity:b.requestedQuantity,startPeriod:b.startPeriod,endPeriod:b.endPeriod,headphones:b.headphones,styluses:b.styluses,remarks:b.remarks||'',editing});}
async function loadEligibleBookings(){
  renderLoading('Retrieving today’s uncollected bookings.');
  try{const date=todayIso();const response=await lordFetch(`${API.transaction}?action=bookingEligible&date=${encodeURIComponent(date)}`,{cache:'no-store'});const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'Could not retrieve bookings.');renderEligibleBookings(payload.bookings||[]);}catch(e){renderErrorRetry(e.message,loadEligibleBookings);}
}
function renderEligibleBookings(bookings){
  const relief = Boolean(state.auth && state.auth.session && state.auth.session.identityType === 'RELIEF');
  const emptyMessage = relief
    ? 'No uncollected booking exists for today. A GSPS staff member must create the booking before devices can be collected.'
    : 'No uncollected booking exists for today. Create a booking first.';
  const bookingAction = relief
    ? ''
    : '<button class="booking-button" id="createBookingBtn">Book Devices</button>';

  main.innerHTML=`<section class="card"><div class="section-title"><div><span class="step-kicker">Loan 1 of 2</span><h2>Select the booking</h2><p>Every physical loan must be linked to a booking. Back-timed bookings are permitted.</p></div></div><div class="booking-list">${bookings.length?bookings.map(b=>`<article class="session-card"><div class="session-card-details"><h3>${escapeHtml(b.resource)} · P${escapeHtml(b.startPeriod)} to P${escapeHtml(b.endPeriod)}</h3><div class="session-meta"><span><strong>Booked by:</strong> ${escapeHtml(b.teacher)}</span><span><strong>Group:</strong> ${escapeHtml(b.classOrActivity)}</span><span><strong>Subject:</strong> ${escapeHtml(b.subject)}</span><span><strong>Requested:</strong> ${b.requestedQuantity}</span>${b.backTimed?'<span><strong>Back-timed booking</strong></span>':''}</div></div><button class="primary-button select-booking" data-id="${escapeAttr(b.bookingId)}">Collect</button></article>`).join(''):`<div class="notice warning">${escapeHtml(emptyMessage)}</div>`}</div><div class="action-grid"><button class="ghost-button" id="backBtn">Back</button>${bookingAction}</div></section>`;
  document.getElementById('backBtn').onclick=renderLanding;
  const createBookingBtn = document.getElementById('createBookingBtn');
  if (createBookingBtn) createBookingBtn.onclick=()=>{state.mode='booking';renderBooking();};
  document.querySelectorAll('.select-booking').forEach(btn => btn.onclick = () => {
    const b = bookings.find(x => x.bookingId === btn.dataset.id);
    state.loan.booking = b;
    state.identity.classOrActivity = b.classOrActivity;
    state.identity.subject = b.subject;
    state.loan.cartGroup = b.resource;
    state.loan.stylusQuantity = b.styluses ? '' : 0;
    state.loan.stylusPhotoData = '';
    state.loan.stylusFileName = '';
    state.loan.headphoneQuantity = b.headphones ? '' : 0;
    state.loan.headphonePhotoData = '';
    state.loan.headphoneFileName = '';
    const matches = state.reference.trolleys.filter(t => t.group === b.resource);
    state.loan.trolleys = matches.map(t => ({ name: t.name, quantity: t.defaultQuantity, photoData: '', fileName: '' }));
    renderLoanTrolleys();
  });
}

async function loadBookingEdit(bookingId, token) {
  renderLoading('Loading booking.');
  try {
    const response = await lordFetch(`${API.transaction}?action=bookingGet&bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`, {cache:'no-store'});
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Booking could not be loaded.');
    applyBookingForEdit(payload.booking,{bookingId,token}); renderBookingEdit();
  } catch (error) { renderFatal(error.message); }
}
function renderBookingEdit() {
  renderBooking();
  const title = document.querySelector('.booking-card h2'); if(title) title.textContent='Edit Booking';
  const confirm = document.getElementById('confirmBookingBtn');
  confirm.textContent='Save Changes'; confirm.onclick=submitBookingUpdate;
  const actions=confirm.closest('.action-grid');
  const cancel=document.createElement('button'); cancel.className='danger-button'; cancel.id='cancelBookingBtn'; cancel.textContent='Delete My Booking'; cancel.setAttribute('aria-label','Delete this booking');
  actions.insertBefore(cancel, confirm); cancel.onclick=cancelBooking;
}
async function submitBookingUpdate(){
  const r=bookingResources().find(x=>x.resource===state.booking.resource); if(!r)return alert('Select a resource.');
  state.busy=true;renderSubmitting('Saving booking changes…');
  try{
    const result=await postTransaction({action:'bookingUpdate',bookingId:state.booking.editing.bookingId,editToken:state.booking.editing.token||'',editCode:state.booking.editing.editCode||'',classOrActivity:state.identity.classOrActivity,subject:state.identity.subject,date:state.booking.date,resource:state.booking.resource,deviceType:r.deviceType,requestedQuantity:Number(state.booking.quantity),startPeriod:state.booking.startPeriod,endPeriod:state.booking.endPeriod,headphones:state.booking.headphones,styluses:Boolean(r.stylusOption&&state.booking.styluses),remarks:state.booking.remarks,adminPasskey:state.booking.editing.adminPasskey||'',overrideReason:state.booking.editing.overrideReason||''});
    history.replaceState({},'',location.pathname); renderSuccess('Booking updated','Your booking changes were saved.',result.bookingId,'');
  }catch(e){state.busy=false;renderErrorRetry(e.message,renderBookingEdit);}
}
async function cancelBooking(){
  if(!confirm('Delete your booking? The cart and periods will become available for another booking.'))return;
  state.busy=true;renderSubmitting('Deleting booking…');
  try{
    const result=await postTransaction({action:'bookingCancel',bookingId:state.booking.editing.bookingId,editToken:state.booking.editing.token||'',editCode:state.booking.editing.editCode||'',adminPasskey:state.booking.editing.adminPasskey||'',overrideReason:'Admin cancellation'});
    history.replaceState({},'',location.pathname); renderSuccess('Booking deleted','The cart and periods are now available for another booking.',result.bookingId,'');
  }catch(e){state.busy=false;renderErrorRetry(e.message,renderBookingEdit);}
}

function resourceDisplayClass(resource) {
  const deviceType = String(resource && resource.deviceType || '').toLowerCase();
  const resourceName = String(resource && resource.resource || '').toLowerCase();
  if (deviceType.includes('ipad') || resourceName.includes('ipad')) return 1;
  if (deviceType.includes('laptop') || deviceType.includes('windows') || deviceType.includes('notebook') || deviceType.includes('chromebook') || deviceType.includes('macbook') || resourceName.includes('laptop')) return 2;
  return 0;
}
function compareResourcesForDisplay(a, b) {
  const classDifference = resourceDisplayClass(a) - resourceDisplayClass(b);
  if (classDifference) return classDifference;
  return String(a.resource || '').localeCompare(String(b.resource || ''), 'en', { numeric: true, sensitivity: 'base' });
}
function bookingResources() {
  return Array.isArray(state.reference.bookingResources)
    ? state.reference.bookingResources.filter(r => r.active !== false).slice().sort(compareResourcesForDisplay)
    : [];
}
function bookingPeriods() {
  return Array.isArray(state.reference.periods) ? state.reference.periods.filter(p => p.active !== false) : [];
}
function todayIso() {
  const d = new Date(); const z = n => String(n).padStart(2,'0');
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}
function renderBooking() {
  refreshSelectionConflicts();
  const preservedWindowScrollY = window.scrollY || window.pageYOffset || 0;
  const existingTimetableScroller = document.querySelector('.resource-timetable-wrap');
  const preservedScrollLeft = existingTimetableScroller ? existingTimetableScroller.scrollLeft : (Number(state.booking.scrollLeft) || 0);
  const resources = bookingResources();
  const periods = bookingPeriods();
  if (!resources.length || !periods.length) {
    main.innerHTML = `<section class="card"><div class="notice warning"><strong>Booking reference data is not ready.</strong><br>Add valid rows to the trolleys and timetable tabs, then select Reload from Sheets.</div><div class="action-grid"><button class="ghost-button" id="backBtn">Back</button></div></section>`;
    document.getElementById('backBtn').onclick = renderLanding;
    return;
  }

  if (!state.booking.date) state.booking.date = todayIso();
  const selected = resources.find(function(r){ return r.resource === state.booking.resource; });
  if (selected) {
    state.booking.deviceType = selected.deviceType || '';
    const max = Number(selected.capacity) || 200;
    if (!state.booking.quantity || state.booking.quantity > max) state.booking.quantity = max;
  }

  const scheduleReady = state.booking.scheduleKey === state.booking.date && !state.booking.scheduleError;
  const scheduleBlocked = !scheduleReady;
  const isAdminBooking = Boolean(state.auth.session && state.auth.session.isAdmin && !state.booking.editing);
  const bookingForValue = state.booking.bookingForTtbName || (state.auth.session ? state.auth.session.ttbName : '');
  const bookingForNames = (state.reference.teachers || []).slice();

  main.innerHTML = `
    <section class="card booking-card booking-wide-card">
      <div class="section-title"><div><span class="step-kicker">Booking</span><h2>Book Devices</h2><p>Select one or more cart and period ranges. Each completed stretch is recorded as a separate booking.</p></div></div>
      <div class="booking-identity"><strong>${escapeHtml(state.auth.session ? state.auth.session.ttbName : state.identity.teacher)}</strong><span>${escapeHtml(state.auth.session ? state.auth.session.email : '')}</span></div>
      ${isAdminBooking ? `<div class="field admin-book-for"><label for="bookingForTtbName">Book on behalf of</label><input class="input" id="bookingForTtbName" list="bookingForNames" value="${escapeAttr(bookingForValue)}"><datalist id="bookingForNames">${bookingForNames.map(function(n){return `<option value="${escapeAttr(n)}"></option>`;}).join('')}</datalist><p class="help">Leave your own name selected to book for yourself.</p></div>` : ''}
      <div class="booking-context-grid">
        ${searchFieldHtml('classOrActivity', 'Class or student group', state.identity.classOrActivity, 'Search classes or enter a student group', true)}
        ${searchFieldHtml('subject', 'Subject or student activity', state.identity.subject, 'Search subjects or enter a student activity', true)}
      </div>
      <div class="booking-date-actions"><div class="field booking-date-field"><label for="bookingDate">Date *</label><input class="input" id="bookingDate" type="date" lang="en-SG" readonly data-monday-picker value="${escapeAttr(state.booking.date)}"></div><div class="booking-selection-actions"><button type="button" class="secondary-button delete-booking-button" id="deleteBookingSelection" ${(state.booking.selections||[]).length?'':'disabled'}>Remove selected</button><button type="button" class="secondary-button clear-bookings-button" id="clearBookingSelections" ${(state.booking.selections||[]).length||state.booking.startPeriod?'':'disabled'}>Clear all</button></div></div>

      <div class="resource-timetable-shell ${scheduleBlocked?'schedule-blocked':''}" aria-busy="${scheduleBlocked?'true':'false'}">
        <div class="resource-timetable-wrap" aria-label="Device booking timetable">
          <div class="resource-timetable" style="--period-count:${periods.length}">
          <div class="resource-head sticky-resource">Resource</div>
          ${periods.map(function(p){return `<div class="period-head"><strong>P${escapeHtml(p.code)}</strong><span>${escapeHtml(p.start)}</span><span>${escapeHtml(p.end)}</span></div>`;}).join('')}
          ${resources.map(function(resource){
            return `<div class="resource-name sticky-resource"><strong>${escapeHtml(resource.resource)}</strong><span>${escapeHtml(resource.deviceType)} · ${escapeHtml(resource.capacity)}</span></div>` +
              periods.map(function(period){
                const booking = getDayBookingForCell(resource.resource, period.code);
                const occupied = Boolean(booking);
                const selectedCell = isPeriodSelectedForResource(resource.resource, period.code);
                const startOnly = resource.resource === state.booking.resource && String(period.code) === String(state.booking.startPeriod) && !state.booking.endPeriod;
                const title = booking ? `${booking.teacher} · ${booking.classOrActivity} · ${booking.subject} · P${booking.startPeriod} to P${booking.endPeriod}` : `${resource.resource}, P${period.code}, ${period.start} to ${period.end}`;
                return `<button type="button" class="timetable-cell ${occupied?'occupied':''} ${selectedCell?'selected':''} ${startOnly?'start-selected':''}" data-resource="${escapeAttr(resource.resource)}" data-code="${escapeAttr(period.code)}" data-booking-id="${occupied?escapeAttr(booking.bookingId):''}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">${occupied?'<span class="occupied-mark">×</span>':(startOnly?'<span class="start-mark">START</span>':'')}</button>`;
              }).join('');
          }).join('')}
          </div>
        </div>
        ${scheduleBlocked ? `<div class="schedule-loading-overlay" role="status" aria-live="polite"><div class="schedule-loading-panel"><span class="spinner" aria-hidden="true"></span><strong>${state.booking.scheduleError?'Schedule could not be loaded':'Loading schedule…'}</strong><span>${state.booking.scheduleError?escapeHtml(state.booking.scheduleError):'Please wait while existing bookings are checked.'}</span>${state.booking.scheduleError?'<button type="button" class="secondary-button schedule-retry-button" id="scheduleRetryBtn">Try again</button>':''}</div></div>` : ''}
      </div>
      <p id="periodSelectionHint" class="help period-selection-hint ${state.booking.startPeriod&&!state.booking.endPeriod?'awaiting-end':''}">${state.booking.startPeriod&&!state.booking.endPeriod?`Start selected: ${escapeHtml(state.booking.resource)}, P${escapeHtml(state.booking.startPeriod)}. Now choose the final period on the same row.`:'Tap the first period, then the last period on a row. After a range is added, select another range on the same or another cart.'}</p>
      ${bookingSelectionCards(resources)}
      ${(state.booking.selections||[]).some(function(x){return x.conflictType==='BUFFER';})&&state.auth.session&&state.auth.session.isAdmin?`<div class="override-inline batch-override"><strong>Administrative buffer override</strong><label for="bookingOverrideReason">Reason</label><input class="input" id="bookingOverrideReason" maxlength="180" placeholder="Example: ICT approved direct handover"></div>`:''}
      <div class="notice info">Each selected stretch reserves the whole cart and becomes a separate booking. Actual trolley and device quantities are confirmed during collection.</div>
      <div class="action-grid"><button class="ghost-button" id="backBtn">Back</button><button class="primary-button" id="confirmBookingBtn" ${(state.booking.selections||[]).length?'':'disabled'}>Confirm ${(state.booking.selections||[]).length||''} Booking${(state.booking.selections||[]).length===1?'':'s'}</button></div>
    </section>`;

  bindBooking(resources, periods);
  bindSearchField('classOrActivity', state.reference.classes, function(value){ state.identity.classOrActivity = value; persistDraft(); });
  bindSearchField('subject', state.reference.subjects, function(value){ state.identity.subject = value; persistDraft(); });
  const bookingForInput = document.getElementById('bookingForTtbName');
  if (bookingForInput) {
    state.booking.bookingForTtbName = bookingForInput.value.trim();
    bookingForInput.onchange = function(){ state.booking.bookingForTtbName = bookingForInput.value.trim(); };
    bookingForInput.oninput = function(){ state.booking.bookingForTtbName = bookingForInput.value.trim(); };
  }
  const timetableScroller = document.querySelector('.resource-timetable-wrap');
  if (timetableScroller) {
    timetableScroller.scrollLeft = preservedScrollLeft;
    state.booking.scrollLeft = preservedScrollLeft;
    timetableScroller.addEventListener('scroll', function(){
      state.booking.scrollLeft = timetableScroller.scrollLeft;
    }, {passive:true});
  }
  requestAnimationFrame(function(){
    window.scrollTo({left:0, top:preservedWindowScrollY, behavior:'auto'});
    requestAnimationFrame(function(){
      window.scrollTo({left:0, top:preservedWindowScrollY, behavior:'auto'});
    });
  });
  if (!scheduleReady && !state.booking.scheduleLoading && !state.booking.scheduleError) loadBookingDaySchedule();
  renderBookingNowLine(periods);
}

function getDayBookingForCell(resource, periodCode) {
  const periods = bookingPeriods();
  const index = periods.findIndex(function(p){ return String(p.code) === String(periodCode); });
  if (index < 0) return null;
  for (let i = 0; i < state.booking.daySchedule.length; i++) {
    const booking = state.booking.daySchedule[i];
    if (booking.resource !== resource) continue;
    if (state.booking.editing && booking.bookingId === state.booking.editing.bookingId) continue;
    const start = periods.findIndex(function(p){ return String(p.code) === String(booking.startPeriod); });
    const end = periods.findIndex(function(p){ return String(p.code) === String(booking.endPeriod); });
    if (start < 0 || end < 0) continue;
    if (index >= Math.min(start,end) && index <= Math.max(start,end)) return booking;
  }
  return null;
}

function periodRangeContains(startPeriod, endPeriod, code) {
  const periods = bookingPeriods();
  const a = periods.findIndex(function(p){return String(p.code)===String(startPeriod);});
  const b = periods.findIndex(function(p){return String(p.code)===String(endPeriod);});
  const i = periods.findIndex(function(p){return String(p.code)===String(code);});
  return a>=0 && b>=0 && i>=Math.min(a,b) && i<=Math.max(a,b);
}
function isPeriodSelectedForResource(resource, code) {
  const saved = (state.booking.selections || []).some(function(selection){
    return selection.resource === resource && periodRangeContains(selection.startPeriod, selection.endPeriod, code);
  });
  if (saved) return true;
  if (resource !== state.booking.resource) return false;
  if (!state.booking.startPeriod) return false;
  if (!state.booking.endPeriod) return String(code) === String(state.booking.startPeriod);
  return periodRangeContains(state.booking.startPeriod, state.booking.endPeriod, code);
}
function selectionKey(selection) {
  return [selection.resource, selection.startPeriod, selection.endPeriod].join('|');
}
function rangesOverlapOnResource(resource, startPeriod, endPeriod, ignoreKey) {
  return (state.booking.selections || []).some(function(selection){
    if (selectionKey(selection) === ignoreKey || selection.resource !== resource) return false;
    const periods = bookingPeriods();
    const a1 = periods.findIndex(function(p){return String(p.code)===String(startPeriod);});
    const a2 = periods.findIndex(function(p){return String(p.code)===String(endPeriod);});
    const b1 = periods.findIndex(function(p){return String(p.code)===String(selection.startPeriod);});
    const b2 = periods.findIndex(function(p){return String(p.code)===String(selection.endPeriod);});
    return Math.max(Math.min(a1,a2),Math.min(b1,b2)) <= Math.min(Math.max(a1,a2),Math.max(b1,b2));
  });
}
function bookingSelectionCards(resources) {
  const selections = state.booking.selections || [];
  if (!selections.length) return '<div class="notice info compact-notice">No completed booking ranges selected yet.</div>';
  return `<div class="multi-booking-list"><div class="multi-booking-heading"><strong>Selected bookings</strong><span>${selections.length} booking${selections.length===1?'':'s'}</span></div>${selections.map(function(selection,index){
    const resource = resources.find(function(r){return r.resource===selection.resource;}) || {};
    const accessoryText = [selection.headphones?`Headphones × ${selection.quantity}`:'',selection.styluses?`Styluses × ${selection.quantity}`:''].filter(Boolean).join(' + ') || 'No accessories';
    return `<article class="multi-booking-item ${Number(state.booking.selectedSelectionIndex)===index?'selection-focused':''}" data-selection-index="${index}" tabindex="0"><div class="multi-booking-title"><div><strong>${escapeHtml(selection.resource)} · P${escapeHtml(selection.startPeriod)} to P${escapeHtml(selection.endPeriod)}</strong><span>${escapeHtml(resource.deviceType||selection.deviceType||'')} · ${escapeHtml(accessoryText)}</span></div><button type="button" class="remove-selection" data-remove-selection="${index}" aria-label="Remove booking range">×</button></div><div class="multi-booking-fields"><label>Devices<input class="input selection-qty" data-selection-index="${index}" type="number" min="1" max="${escapeAttr(resource.capacity||200)}" step="1" value="${escapeAttr(selection.quantity)}"></label>${resource.headphoneOption?`<label class="mini-check"><input class="selection-headphones" data-selection-index="${index}" type="checkbox" ${selection.headphones?'checked':''}> Headphones</label>`:''}${resource.stylusOption?`<label class="mini-check"><input class="selection-styluses" data-selection-index="${index}" type="checkbox" ${selection.styluses?'checked':''}> Styluses</label>`:''}</div><label class="selection-remarks-label">Remarks<input class="input selection-remarks" data-selection-index="${index}" value="${escapeAttr(selection.remarks||'')}" placeholder="Optional"></label><div class="selection-status ${selection.conflictType==='BUFFER'?'warning':selection.conflictType==='OVERLAP'?'error':'success'}">${selection.checking?'Checking availability…':selection.conflictType==='BUFFER'?'One free period is required. Admin override needed.':selection.conflictType==='OVERLAP'?'This range is no longer available.':'Available'}</div></article>`;
  }).join('')}</div>`;
}

function bindBooking(resources, periods) {
  document.getElementById('backBtn').onclick = function(){
    if (state.booking.editing) {
      history.replaceState({},'',location.pathname);
      state.booking.editing = null;
    }
    renderLanding();
  };

  document.getElementById('bookingDate').onchange = function(e){
    state.booking.date = e.target.value;
    state.booking.resource = '';
    state.booking.startPeriod = '';
    state.booking.endPeriod = '';
    state.booking.selections = [];
    state.booking.selectedSelectionIndex = -1;
    state.booking.daySchedule = [];
    state.booking.scheduleKey = '';
    state.booking.scheduleLoading = false;
    state.booking.scheduleError = '';
    state.booking.scrollLeft = 0;
    persistDraft();
    renderBooking();
  };

  document.querySelectorAll('.timetable-cell').forEach(function(btn){
    btn.onclick = function(){
      if (btn.classList.contains('occupied')) {
        const booked = state.booking.daySchedule.find(function(item){ return String(item.bookingId) === String(btn.dataset.bookingId); });
        if (booked) showBookingOverlay(booked);
        return;
      }
      const resourceName = String(btn.dataset.resource);
      const code = String(btn.dataset.code);
      const resource = resources.find(function(item){ return item.resource === resourceName; });

      if (!state.booking.startPeriod || state.booking.resource !== resourceName) {
        state.booking.resource = resourceName;
        state.booking.deviceType = resource ? resource.deviceType : '';
        state.booking.quantity = Number(resource ? resource.capacity : 1) || 1;
        state.booking.headphones = false;
        state.booking.styluses = false;
        state.booking.startPeriod = code;
        state.booking.endPeriod = '';
      } else {
        const startIndex = periods.findIndex(function(p){return String(p.code)===String(state.booking.startPeriod);});
        const endIndex = periods.findIndex(function(p){return String(p.code)===code;});
        const low = Math.min(startIndex,endIndex);
        const high = Math.max(startIndex,endIndex);
        let blocked = false;
        for (let i=low;i<=high;i++) {
          if (getDayBookingForCell(resourceName, periods[i].code)) { blocked = true; break; }
        }
        const startCode = endIndex < startIndex ? code : state.booking.startPeriod;
        const endCode = endIndex < startIndex ? state.booking.startPeriod : code;
        if (blocked || rangesOverlapOnResource(resourceName,startCode,endCode,'')) {
          alert('That range crosses an existing or selected booking. Choose another final period.');
          return;
        }
        const selection = {
          resource: resourceName,
          deviceType: resource ? resource.deviceType : '',
          quantity: Number(resource ? resource.capacity : 1) || 1,
          startPeriod: startCode,
          endPeriod: endCode,
          headphones: false,
          styluses: false,
          remarks: '',
          checking: true,
          conflictType: ''
        };
        state.booking.selections.push(selection);
        state.booking.selectedSelectionIndex = state.booking.selections.length - 1;
        state.booking.resource = '';
        state.booking.deviceType = '';
        state.booking.startPeriod = '';
        state.booking.endPeriod = '';
        checkSelectionAvailability(selection);
      }
      persistDraft();
      renderBooking();
    };
  });

  const clearButton = document.getElementById('clearBookingSelections');
  if (clearButton) clearButton.onclick = function(){
    state.booking.selections = [];
    state.booking.selectedSelectionIndex = -1;
    state.booking.resource = '';
    state.booking.startPeriod = '';
    state.booking.endPeriod = '';
    persistDraft();
    renderBooking();
  };
  const deleteButton = document.getElementById('deleteBookingSelection');
  if (deleteButton) deleteButton.onclick = function(){
    const selections = state.booking.selections || [];
    if (!selections.length) return;
    let index = Number(state.booking.selectedSelectionIndex);
    if (!Number.isInteger(index) || index < 0 || index >= selections.length) index = selections.length - 1;
    selections.splice(index, 1);
    state.booking.selectedSelectionIndex = selections.length ? Math.min(index, selections.length - 1) : -1;
    persistDraft();
    renderBooking();
  };
  document.querySelectorAll('.multi-booking-item').forEach(function(card){
    const selectCard = function(){ state.booking.selectedSelectionIndex = Number(card.dataset.selectionIndex); renderBooking(); };
    card.onclick = function(event){ if (event.target.closest('button,input,textarea,label')) return; selectCard(); };
    card.onkeydown = function(event){ if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectCard(); } };
  });
  document.querySelectorAll('[data-remove-selection]').forEach(function(button){
    button.onclick = function(){
      state.booking.selections.splice(Number(button.dataset.removeSelection),1);
      persistDraft();
      renderBooking();
    };
  });
  document.querySelectorAll('.selection-qty').forEach(function(input){ input.oninput=function(){state.booking.selections[Number(input.dataset.selectionIndex)].quantity=Number(input.value);persistDraft();}; });
  document.querySelectorAll('.selection-headphones').forEach(function(input){ input.onchange=function(){state.booking.selections[Number(input.dataset.selectionIndex)].headphones=input.checked;persistDraft();renderBooking();}; });
  document.querySelectorAll('.selection-styluses').forEach(function(input){ input.onchange=function(){state.booking.selections[Number(input.dataset.selectionIndex)].styluses=input.checked;persistDraft();renderBooking();}; });
  document.querySelectorAll('.selection-remarks').forEach(function(input){ input.oninput=function(){state.booking.selections[Number(input.dataset.selectionIndex)].remarks=input.value;persistDraft();}; });
  document.getElementById('confirmBookingBtn').onclick = submitBooking;
  const retry = document.getElementById('scheduleRetryBtn');
  if (retry) retry.onclick = function(){ state.booking.scheduleError=''; state.booking.scheduleKey=''; loadBookingDaySchedule(); };
}

function refreshSelectionConflicts() {
  const ready = state.booking.scheduleKey === state.booking.date;
  (state.booking.selections || []).forEach(selection => {
    const result = ready ? LordBookingRules.analyse(selection, { periods:bookingPeriods(), bookings:state.booking.daySchedule,
      selections:state.booking.selections, date:state.booking.date }) : {conflictType:'ERROR',conflictSummary:'Load the booking schedule before confirming.'};
    selection.checking = false;
    selection.conflictType = result.conflictType || '';
    selection.conflictSummary = result.conflictSummary || '';
  });
}
function checkSelectionAvailability(selection) {
  refreshSelectionConflicts();
  persistDraft();
  renderBooking();
}

function renderBookingNowLine(periods) {
  const grid = document.querySelector('.resource-timetable');
  if (!grid || state.booking.date !== todayIso() || !periods.length) return;
  const now = new Date();
  const minutes = now.getHours()*60 + now.getMinutes();
  function toMinutes(value){ const parts=String(value||'').split(':'); return Number(parts[0])*60+Number(parts[1]); }
  let periodIndex=-1, fraction=0;
  periods.forEach(function(period,index){
    const start=toMinutes(period.start), end=toMinutes(period.end);
    if (minutes>=start && minutes<=end) { periodIndex=index; fraction=(minutes-start)/Math.max(1,end-start); }
  });
  if (periodIndex<0) return;
  requestAnimationFrame(function(){
    const heads=grid.querySelectorAll('.period-head');
    const head=heads[periodIndex];
    if(!head) return;
    const line=document.createElement('div');
    line.className='booking-now-line';
    line.style.left=(head.offsetLeft + head.offsetWidth*fraction)+'px';
    line.innerHTML='<span>Now</span>';
    grid.appendChild(line);
  });
}

let bookingScheduleGeneration = 0;
let bookingScheduleDate = '';
async function loadBookingDaySchedule() {
  const date = state.booking.date;
  if (state.reloading || !date || (state.booking.scheduleLoading && bookingScheduleDate === date)) return;
  const generation = ++bookingScheduleGeneration;
  bookingScheduleDate = date;
  state.booking.scheduleLoading = true;
  state.booking.scheduleError = '';
  renderBooking();
  const cacheKey = 'lord_booking_day_' + date;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
    if (parsed && Date.now() - parsed.savedAt < 60000) {
      state.booking.daySchedule = parsed.bookings || [];
      state.booking.scheduleKey = date;
      renderBooking();
    }
  } catch {}
  try {
    const response = await lordFetch(`${API.transaction}?action=bookingDaySchedule&date=${encodeURIComponent(date)}`,{cache:'no-store'});
    const payload = await lordJson(response,'Could not load bookings.');
    if (generation !== bookingScheduleGeneration || date !== state.booking.date) return;
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not load bookings.');
    state.booking.daySchedule = payload.bookings || [];
    state.booking.scheduleKey = date;
    state.booking.scheduleError = '';
    try { sessionStorage.setItem(cacheKey,JSON.stringify({savedAt:Date.now(),bookings:state.booking.daySchedule})); } catch {}
  } catch(error) {
    if (generation !== bookingScheduleGeneration || date !== state.booking.date) return;
    state.booking.scheduleKey = '';
    state.booking.scheduleError = error.message || 'Could not load bookings.';
  } finally {
    if (generation === bookingScheduleGeneration && date === state.booking.date) { state.booking.scheduleLoading=false; renderBooking(); }
  }
}

function closeBookingOverlay(){ const modal=document.getElementById('bookingOverlay'); if(modal) modal.remove(); }
async function authenticateBookingOverlay(booking, action){
  const box=document.getElementById('bookingCredentialBox');
  if(box.classList.contains('hidden')){ box.classList.remove('hidden'); box.scrollIntoView({behavior:'smooth',block:'nearest'}); return; }
  const editCode=document.getElementById('overlayEditCode').value.trim();
  const adminPasskey=document.getElementById('overlayAdminKey').value;
  const errorBox=document.getElementById('overlayCredentialError');
  if(!editCode && !adminPasskey){ errorBox.textContent='Enter the booking code or admin key.'; errorBox.classList.remove('hidden'); return; }
  try{
    const url=`${API.transaction}?action=bookingGet&bookingId=${encodeURIComponent(booking.bookingId)}&code=${encodeURIComponent(editCode)}&adminPasskey=${encodeURIComponent(adminPasskey)}`;
    const response=await lordFetch(url,{cache:'no-store'}); const payload=await response.json();
    if(!response.ok||!payload.ok) throw new Error(payload.error||'Credentials were not accepted.');
    if(action==='edit'){
      closeBookingOverlay();
      applyBookingForEdit(payload.booking,{bookingId:booking.bookingId,editCode:editCode,adminPasskey:adminPasskey});
      renderBookingEdit();
      return;
    }
    if(!confirm('Cancel this booking? The cart and periods will become available.')) return;
    await postTransaction({action:'bookingCancel',bookingId:booking.bookingId,editCode:editCode,adminPasskey:adminPasskey,overrideReason:adminPasskey?'Administrative cancellation':'User cancellation'});
    closeBookingOverlay(); state.booking.scheduleKey=''; state.booking.scheduleLoading=false; state.booking.scheduleError=''; state.booking.daySchedule=[]; loadBookingDaySchedule();
  }catch(error){ errorBox.textContent=error.message; errorBox.classList.remove('hidden'); }
}

async function checkBookingAvailability(){
  const box=document.getElementById('availabilityBox'); if(!box) return;
  if(!state.booking.date||!state.booking.resource||!state.booking.startPeriod||!state.booking.endPeriod){box.className='notice info';box.textContent='Choose a date, resource and period range to check availability.';return;}
  box.className='notice info';box.textContent='Checking cart availability…';
  try{
    const u=`${API.transaction}?action=bookingAvailability&date=${encodeURIComponent(state.booking.date)}&resource=${encodeURIComponent(state.booking.resource)}&startPeriod=${encodeURIComponent(state.booking.startPeriod)}&endPeriod=${encodeURIComponent(state.booking.endPeriod)}${state.booking.editing ? `&excludeBookingId=${encodeURIComponent(state.booking.editing.bookingId)}` : ''}`;
    const r=await lordFetch(u,{cache:'no-store'}), payload=await r.json(); if(!r.ok||!payload.ok) throw new Error(payload.error||'Availability check failed.');
    const p=payload.result||payload;
    box.className=`notice ${p.available?'success':(p.conflictType==='BUFFER'?'warning':'error')}`;
    box.innerHTML=p.available
      ? '<strong>Available.</strong> This cart can be booked for the selected period range.'
      : (p.conflictType==='BUFFER'
          ? `<strong>One free period is required.</strong><br>${escapeHtml(p.conflictSummary)}${state.auth.session&&state.auth.session.isAdmin?`<br><div class="override-inline"><label for="bookingOverrideReason">Administrative reason for override</label><input class="input" id="bookingOverrideReason" type="text" maxlength="180" placeholder="Example: ICT approved direct handover"></div>`:'<br><span class="help">Only an identified administrator can override this rule.</span>'}`
          : `<strong>Already booked.</strong><br>${escapeHtml(p.conflictSummary||'Choose another cart or period range.')}`);
    box.dataset.conflictType=p.conflictType||'';
  }catch(e){box.className='notice warning';box.textContent=e.message;}
}
async function getBookingOverrideIfNeeded(){
  const box=document.getElementById('availabilityBox');
  if(!box || box.dataset.conflictType!=='BUFFER') return {adminPasskey:'',overrideReason:''};
  const keyInput=document.getElementById('bookingAdminPasskey');
  const reasonInput=document.getElementById('bookingOverrideReason');
  const adminPasskey=keyInput ? keyInput.value.trim() : '';
  const overrideReason=reasonInput ? reasonInput.value.trim() : '';
  if(!adminPasskey){
    if(keyInput) keyInput.focus();
    throw new Error('Enter the authorised admin key to override the one-period buffer.');
  }
  if(!overrideReason){
    if(reasonInput) reasonInput.focus();
    throw new Error('Enter a reason for the authorised override.');
  }
  return {adminPasskey:adminPasskey,overrideReason:overrideReason};
}

async function submitBooking(){
  if(state.busy)return;
  if(state.booking.pendingBatch){showPendingBookingBatch();return;}
  refreshSelectionConflicts();
  const selections=(state.booking.selections||[]).slice();
  if(!state.booking.date||!selections.length)return alert('Select at least one cart and period range.');
  if(!state.identity.classOrActivity||!state.identity.subject)return alert('Enter the class or student group and subject or student activity.');
  if(selections.some(function(x){return x.checking;}))return alert('Wait for the availability checks to finish.');
  if(selections.some(function(x){return x.conflictType==='OVERLAP'||x.conflictType==='ERROR';}))return alert('One or more selected ranges are no longer available. Remove them before confirming.');
  let overrideReason='';
  if(selections.some(function(x){return x.conflictType==='BUFFER';})){
    if(!(state.auth.session&&state.auth.session.isAdmin)) return alert('Only an identified administrator can override the one-period buffer.');
    const reason=document.getElementById('bookingOverrideReason');
    overrideReason=reason?reason.value.trim():'';
    if(!overrideReason)return alert('Enter the administrative reason for the one-period buffer override.');
  }
  for(let i=0;i<selections.length;i++){
    const resource=bookingResources().find(function(r){return r.resource===selections[i].resource;});
    const qty=Number(selections[i].quantity);
    if(!resource||!Number.isInteger(qty)||qty<1||qty>Number(resource.capacity||200))return alert(`Enter a valid whole-number quantity for ${selections[i].resource}.`);
  }
  const payload={action:'bookingCreateBatch',teacher:state.identity.teacher,
    classOrActivity:state.identity.classOrActivity,subject:state.identity.subject,date:state.booking.date,
    editBaseUrl:`${location.origin}/`,bookingForTtbName:state.booking.bookingForTtbName||'',
    bookings:selections.map(selection => {
      const resource=bookingResources().find(r => r.resource===selection.resource);
      return {resource:selection.resource,deviceType:resource.deviceType,requestedQuantity:Number(selection.quantity),
        startPeriod:selection.startPeriod,endPeriod:selection.endPeriod,headphones:Boolean(selection.headphones),
        styluses:Boolean(resource.stylusOption&&selection.styluses),remarks:selection.remarks||'',overrideReason};
    })};
  state.booking.pendingBatch=payload;
  await retryPendingBookingBatch();
}
function showPendingBookingBatch(){
  renderErrorRetry('An earlier booking request is still unconfirmed. Try again with the same saved details so LORD can check its receipt.',retryPendingBookingBatch);
}
async function retryPendingBookingBatch(){
  if(state.busy || !state.booking.pendingBatch)return;
  const payload=state.booking.pendingBatch;
  state.busy=true;
  renderSubmitting(`Confirming ${payload.bookings.length} booking${payload.bookings.length===1?'':'s'}…`);
  try {
    const result=await postTransaction(payload);
    state.booking.pendingBatch=null;
    await clearDraft();
    renderMultiBookingSuccess(result.bookings || []);
  } catch(error) {
    state.busy=false;
    if(error.code==='AUTH_EXPIRED')return;
    if(error.code==='SUBMISSION_REJECTED'){
      state.booking.pendingBatch=null;
      state.booking.scheduleKey='';
      await persistDraft();
      renderErrorRetry(error.message,renderBooking);
    }else{
      await persistDraft();
      renderErrorRetry(error.message || 'The booking result is unconfirmed. Retry with the same details.',retryPendingBookingBatch);
    }
  }
}

function renderMultiBookingSuccess(results){
  state.busy=false;
  main.innerHTML=`<section class="card center-card"><div class="notice success"><strong>${results.length} booking${results.length===1?'':'s'} confirmed</strong></div><div class="booking-success-list">${results.map(function(result){return `<article><strong>${escapeHtml(result.resource)}</strong><span>${escapeHtml(result.date)} · ${escapeHtml(result.periodRange)} · ${escapeHtml(result.requestedQuantity)} devices</span><small>${escapeHtml(result.bookingId)}</small></article>`;}).join('')}</div><div class="notice info">Confirmation email${results.length===1?'':'s'} with booking details and cancellation links will be sent to the school email address.</div><div class="action-grid"><button class="primary-button" id="loanBtn2">Collect Devices</button><button class="secondary-button" id="doneBtn">Back to LORD</button></div></section>`;
  document.getElementById('loanBtn2').onclick=function(){state.mode='loan';loadEligibleBookings();};
  document.getElementById('doneBtn').onclick=function(){resetStateKeepTeacher();renderLanding();};
}
function renderBookingSuccess(result){
  state.busy=false;
  main.innerHTML=`<section class="card center-card"><div class="notice success"><strong>Booking confirmed</strong></div><h2>${escapeHtml(result.resource)}</h2><p>${escapeHtml(result.date)} · ${escapeHtml(result.periodRange)}<br>${result.requestedQuantity} devices requested</p><p class="help">Booking ID: ${escapeHtml(result.bookingId)}</p><div class="notice info">A confirmation email with the booking details and cancellation link will be sent to ${escapeHtml(result.maskedEmail||'your school email')}.</div><div class="action-grid"><button class="primary-button" id="loanBtn2">Collect Devices</button><button class="secondary-button" id="doneBtn">Back to LORD</button></div></section>`;
  document.getElementById('loanBtn2').onclick=()=>{state.mode='loan';loadEligibleBookings();};
  document.getElementById('doneBtn').onclick=()=>{resetStateKeepTeacher();renderLanding();};
}

function renderLoanDetails() {
  main.innerHTML = `
    <section class="card">
      <div class="section-title">
        <div>
          <span class="step-kicker">Loan 1 of 2</span>
          <h2>Lesson details</h2>
          <p>Teacher: <strong>${escapeHtml(state.identity.teacher)}</strong></p>
        </div>
      </div>
      ${searchFieldHtml('classOrActivity', 'Class or student group', state.identity.classOrActivity, 'Search classes or enter a student group', true)}
      ${customToggleHtml('classOrActivity', state.identity.classCustom, state.identity.classOrActivity)}
      ${searchFieldHtml('subject', 'Subject', state.identity.subject, 'Search subjects', true)}
      ${customToggleHtml('subject', state.identity.subjectCustom, state.identity.subject)}
      <div class="action-grid">
        <button class="ghost-button" id="backBtn">Back</button>
        <button class="primary-button" id="nextBtn">Choose Devices</button>
      </div>
    </section>`;

  bindSearchField('classOrActivity', state.reference.classes, value => {
    state.identity.classOrActivity = value;
    persistDraft();
  });
  bindSearchField('subject', state.reference.subjects, value => {
    state.identity.subject = value;
    persistDraft();
  });
  bindCustomToggle('classOrActivity', (isCustom, value) => {
    state.identity.classCustom = isCustom;
    state.identity.classOrActivity = value;
    persistDraft();
  });
  bindCustomToggle('subject', (isCustom, value) => {
    state.identity.subjectCustom = isCustom;
    state.identity.subject = value;
    persistDraft();
  });

  document.getElementById('backBtn').onclick = renderLanding;
  document.getElementById('nextBtn').onclick = () => {
    const c = state.identity.classOrActivity.trim();
    const s = state.identity.subject.trim();
    if (!c || !s) return alert('Select or enter both class or student group and subject.');
    renderLoanTrolleys();
  };
}

function renderLoanTrolleys() {
  const groups = [...new Set(state.reference.trolleys.map(t => t.group))].sort();
  const trolleyOptions = state.reference.trolleys.map(t => `<option value="${escapeAttr(t.name)}">${escapeHtml(t.name)}</option>`).join('');

  main.innerHTML = `
    <section class="card">
      <div class="section-title">
        <div>
          <span class="step-kicker">Loan 2 of 2</span>
          <h2>Devices received</h2>
          <p>${state.loan.booking?`Linked booking: ${escapeHtml(state.loan.booking.bookingId)} · ${escapeHtml(state.loan.booking.resource)} · P${escapeHtml(state.loan.booking.startPeriod)} to P${escapeHtml(state.loan.booking.endPeriod)}`:'Select a cart preset, then adjust the trolley list if needed.'}</p>
        </div>
      </div>
      <div class="field">
        <label for="cartGroup">Cart preset</label>
        <select id="cartGroup" ${state.loan.booking?'disabled':''}>
          <option value="">Select a cart</option>
          ${groups.map(g => `<option value="${escapeAttr(g)}" ${g === state.loan.cartGroup ? 'selected' : ''}>${escapeHtml(g)}</option>`).join('')}
        </select>
      </div>
      <div class="photo-example" role="note" aria-label="Example trolley photo">
        <img src="assets/trolley-photo-example.webp" alt="Example of a top-down trolley photo showing all tablets">
        <div><strong>Photo example</strong><p>Take a top-down photo showing all devices in this trolley.</p></div>
      </div>
      <div id="trolleyList"></div>
      <div id="loanAccessoryEvidence"></div>
      <div class="inline-actions" style="margin-top:0.85rem">
        <button class="ghost-button" id="addTrolleyBtn">Add trolley</button>
      </div>
      <div class="field">
        <label for="loanComments">Comments, if any</label>
        <textarea id="loanComments" placeholder="Optional">${escapeHtml(state.loan.comments)}</textarea>
      </div>
      <div class="notice info" style="margin-top:1rem">I confirm that I received the trolleys and devices recorded above.</div>
      <div class="action-grid">
        <button class="ghost-button" id="backBtn">Back</button>
        <button class="primary-button" id="submitLoanBtn">Confirm Loan</button>
      </div>
    </section>
    <div class="summary-bar" id="loanSummary"></div>`;

  const select = document.getElementById('cartGroup');
  select.onchange = () => {
    state.loan.cartGroup = select.value;
    const matches = state.reference.trolleys.filter(t => t.group === select.value);
    state.loan.trolleys = matches.map(t => ({
      name: t.name,
      quantity: t.defaultQuantity,
      photoData: '',
      fileName: ''
    }));
    persistDraft();
    renderLoanTrolleys();
  };

  const trolleyList = document.getElementById('trolleyList');
  trolleyList.innerHTML = state.loan.trolleys.map((t, i) => trolleyEditorHtml(t, i, trolleyOptions, 'loan')).join('');
  bindLoanTrolleyEditors();
  renderLoanAccessoryEvidence();
  updateLoanSummary();

  document.getElementById('addTrolleyBtn').onclick = () => {
    state.loan.trolleys.push({ name: '', quantity: 14, photoData: '', fileName: '' });
    persistDraft();
    renderLoanTrolleys();
  };
  document.getElementById('loanComments').oninput = e => {
    state.loan.comments = e.target.value;
    persistDraft();
  };
  document.getElementById('backBtn').onclick = renderLanding;
  document.getElementById('submitLoanBtn').onclick = submitLoan;
}

function actualLoanDeviceTotal() {
  return state.loan.trolleys.reduce((sum, trolley) => sum + (Number(trolley.quantity) || 0), 0);
}

function renderLoanAccessoryEvidence() {
  const host = document.getElementById('loanAccessoryEvidence');
  if (!host) return;
  const booking = state.loan.booking || {};
  const blocks = [];

  if (booking.styluses) {
    blocks.push(loanAccessoryCardHtml('Styluses', 'stylus', state.loan.stylusQuantity, state.loan.stylusPhotoData));
  }
  if (booking.headphones) {
    blocks.push(loanAccessoryCardHtml('Headphones', 'headphone', state.loan.headphoneQuantity, state.loan.headphonePhotoData));
  }

  host.innerHTML = blocks.length
    ? `<section class="accessory-evidence"><h3>Accessory collection</h3><p class="help">Enter the actual quantity collected. If none were collected, enter 0 and no accessory photo is required.</p><div class="accessory-evidence-grid">${blocks.join('')}</div></section>`
    : '';

  bindLoanAccessory('stylus');
  bindLoanAccessory('headphone');
}

function loanAccessoryCardHtml(title, key, quantity, photoData) {
  const qty = quantity === '' || quantity === null || quantity === undefined ? '' : Number(quantity);
  const hasQuantity = Number(qty) > 0;
  const preview = photoData ? `<img class="photo-preview" src="${photoData}" alt="${escapeAttr(title)} collection photo preview">` : '';
  return `
    <article class="accessory-card accessory-trolley-card">
      <div class="trolley-head"><h3>${escapeHtml(title)}</h3><span class="muted">All collected ${escapeHtml(title.toLowerCase())}</span></div>
      <div class="field">
        <label for="loan-${key}-qty">Quantity collected</label>
        <input id="loan-${key}-qty" class="input" type="number" min="0" max="200" step="1" inputmode="numeric" value="${escapeAttr(qty)}" placeholder="0">
      </div>
      <div id="loan-${key}-photo-wrap" class="photo-box ${hasQuantity ? '' : 'hidden'}">
        <label>Photo of all ${escapeHtml(title.toLowerCase())}</label>
        <input id="loan-${key}-photo" type="file" accept="image/*" capture="environment">
        <p class="help">Capture the complete accessory batch together.</p>
        ${preview}
      </div>
    </article>`;
}

function bindLoanAccessory(key) {
  const booking = state.loan.booking || {};
  const enabled = key === 'stylus' ? booking.styluses : booking.headphones;
  if (!enabled) return;

  const qtyField = key === 'stylus' ? 'stylusQuantity' : 'headphoneQuantity';
  const photoField = key === 'stylus' ? 'stylusPhotoData' : 'headphonePhotoData';
  const fileField = key === 'stylus' ? 'stylusFileName' : 'headphoneFileName';
  const qty = document.getElementById(`loan-${key}-qty`);
  const photo = document.getElementById(`loan-${key}-photo`);
  const photoWrap = document.getElementById(`loan-${key}-photo-wrap`);

  if (qty) {
    qty.oninput = e => {
      const raw = e.target.value;
      state.loan[qtyField] = raw === '' ? '' : Number(raw);
      if (photoWrap) photoWrap.classList.toggle('hidden', !(Number(raw) > 0));
      if (!(Number(raw) > 0)) {
        state.loan[photoField] = '';
        state.loan[fileField] = '';
      }
      persistDraft();
    };
  }

  if (photo) {
    photo.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        state.loan[photoField] = await compressImage(file);
        state.loan[fileField] = file.name;
        persistDraft();
        renderLoanTrolleys();
      } catch (error) {
        alert(error.message);
      }
    };
  }
}

function trolleyEditorHtml(trolley, index, optionsHtml, phase) {
  const preview = trolley.photoData ? `<img class="photo-preview" src="${trolley.photoData}" alt="Photo preview">` : '';
  return `
    <article class="trolley-card" data-index="${index}">
      <div class="trolley-head"><h3>Trolley ${index + 1}</h3><button type="button" class="small-button remove-trolley">Remove</button></div>
      <div class="field">
        <label>Trolley</label>
        <select class="trolley-name"><option value="">Select trolley</option>${optionsHtml}</select>
      </div>
      <div class="field">
        <label>Number of devices</label>
        <input class="input trolley-quantity" type="number" min="1" max="200" step="1" inputmode="numeric" value="${escapeAttr(trolley.quantity)}">
      </div>
      <div class="photo-box">
        <label>${phase === 'loan' ? 'Top view photo of trolley' : 'Return photo of trolley'}</label>
        <input class="trolley-photo" type="file" accept="image/*" capture="environment">
        <p class="help">Capture the whole trolley with all slots visible. LORD compresses the photo before upload.</p>
        ${preview}
      </div>
    </article>`;
}

function bindLoanTrolleyEditors() {
  document.querySelectorAll('.trolley-card').forEach(card => {
    const index = Number(card.dataset.index);
    const trolley = state.loan.trolleys[index];
    const nameSelect = card.querySelector('.trolley-name');
    nameSelect.value = trolley.name;
    nameSelect.onchange = () => {
      trolley.name = nameSelect.value;
      const ref = state.reference.trolleys.find(t => t.name === trolley.name);
      if (ref) trolley.quantity = ref.defaultQuantity;
      persistDraft();
      renderLoanTrolleys();
    };
    card.querySelector('.trolley-quantity').oninput = e => {
      trolley.quantity = Number(e.target.value);
      persistDraft();
      updateLoanSummary();
    };
    card.querySelector('.remove-trolley').onclick = () => {
      state.loan.trolleys.splice(index, 1);
      persistDraft();
      renderLoanTrolleys();
    };
    card.querySelector('.trolley-photo').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const compressed = await compressImage(file);
        trolley.photoData = compressed;
        trolley.fileName = file.name;
        persistDraft();
        renderLoanTrolleys();
      } catch (error) {
        alert(error.message);
      }
    };
  });
}

async function submitLoan() {
  if (state.busy) return;
  const names = state.loan.trolleys.map(t => t.name).filter(Boolean);
  if (!state.loan.trolleys.length) return alert('Add at least one trolley.');
  if (names.length !== state.loan.trolleys.length) return alert('Select every trolley.');
  if (new Set(names).size !== names.length) return alert('The same trolley cannot be selected twice.');
  for (const trolley of state.loan.trolleys) {
    if (!Number.isInteger(Number(trolley.quantity)) || Number(trolley.quantity) < 1) return alert(`Enter a valid quantity for ${trolley.name}.`);
    if (!trolley.photoData) return alert(`Take a photo of ${trolley.name}.`);
  }

  const actualDeviceTotal = actualLoanDeviceTotal();
  const stylusesBooked = Boolean(state.loan.booking && state.loan.booking.styluses);
  const headphonesBooked = Boolean(state.loan.booking && state.loan.booking.headphones);

  if (stylusesBooked) {
    if (state.loan.stylusQuantity === '' || !Number.isInteger(Number(state.loan.stylusQuantity)) || Number(state.loan.stylusQuantity) < 0) {
      return alert('Enter the actual number of styluses collected.');
    }
    if (Number(state.loan.stylusQuantity) > actualDeviceTotal) {
      return alert('Stylus quantity cannot exceed the number of devices collected.');
    }
    if (Number(state.loan.stylusQuantity) > 0 && !state.loan.stylusPhotoData) {
      return alert('Take a photo of all styluses collected.');
    }
  }

  if (headphonesBooked) {
    if (state.loan.headphoneQuantity === '' || !Number.isInteger(Number(state.loan.headphoneQuantity)) || Number(state.loan.headphoneQuantity) < 0) {
      return alert('Enter the actual number of headphones collected.');
    }
    if (Number(state.loan.headphoneQuantity) > actualDeviceTotal) {
      return alert('Headphone quantity cannot exceed the number of devices collected.');
    }
    if (Number(state.loan.headphoneQuantity) > 0 && !state.loan.headphonePhotoData) {
      return alert('Take a photo of all headphones collected.');
    }
  }

  const submitId = crypto.randomUUID();

  const payload = {
    action: 'loan',
    clientRequestId: submitId,
    teacher: state.identity.teacher,
    teacherCustom: state.identity.teacherCustom,
    classOrActivity: state.identity.classOrActivity,
    classCustom: state.identity.classCustom,
    subject: state.identity.subject,
    subjectCustom: state.identity.subjectCustom,
    cartGroup: state.loan.cartGroup,
    bookingId: state.loan.booking?.bookingId || '',
    comments: state.loan.comments,
    accessories: {
      styluses: { booked: stylusesBooked, quantity: stylusesBooked ? Number(state.loan.stylusQuantity) : 0, photoData: state.loan.stylusPhotoData, fileName: state.loan.stylusFileName },
      headphones: { booked: headphonesBooked, quantity: headphonesBooked ? Number(state.loan.headphoneQuantity) : 0, photoData: state.loan.headphonePhotoData, fileName: state.loan.headphoneFileName }
    },
    trolleys: state.loan.trolleys
  };

  state.busy = true;
  renderSubmitting('Recording loan and uploading photos…');
  try {
    const result = await postTransaction(payload);
    if (state.loan.booking) {
      try {
      } catch (linkError) {
        const linkMessage = String(linkError && linkError.message ? linkError.message : linkError);
        if (!/COLLECTED/i.test(linkMessage)) throw linkError;
      }
    }
    localStorage.setItem(STORAGE_KEYS.recentTeacher, state.identity.teacher);
    clearDraft();
    renderLoanCollectionSuccess(result);
  } catch (error) {
    state.busy = false;
    const errorMessage = String(error && error.message ? error.message : error);
    if (/COLLECTED/i.test(errorMessage)) {
      renderAlreadyCollectedReminder(state.loan.booking ? state.loan.booking.bookingId : '');
      return;
    }
    renderErrorRetry(errorMessage, renderLoanTrolleys);
  }
}

function renderAlreadyCollectedReminder(bookingId) {
  const relief = Boolean(state.auth && state.auth.session && state.auth.session.identityType === 'RELIEF');
  main.innerHTML = `
    <section class="card center-card">
      <div class="notice warning collection-reminder">
        <strong>Devices collected successfully</strong><br>
        This collection has already been recorded, including the before-use photo uploads.
      </div>
      <h2 style="margin-top:1rem">Loan session is open</h2>
      <p>Please return the devices through LORD after use.</p>
      ${bookingId ? `<p class="help">Booking reference: ${escapeHtml(bookingId)}</p>` : ''}
      <div class="action-grid">
        <button class="primary-button" id="viewOpenLoansBtn">Pending Return</button>
        <button class="secondary-button" id="doneBtn">Back to LORD</button>
      </div>
    </section>`;
  document.getElementById('viewOpenLoansBtn').onclick = loadOpenSessions;
  document.getElementById('doneBtn').onclick = () => { resetStateKeepTeacher(); renderLanding(); };
}

async function loadOpenSessions() {
  renderLoading('Retrieving open loan sessions.');
  try {
    const response = await lordFetch(`${API.transaction}?action=openSessions`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not retrieve open sessions.');
    state.return.openSessions = payload.sessions || [];
    renderOpenSessions();
  } catch (error) {
    renderErrorRetry(error.message, loadOpenSessions);
  }
}

function renderOpenSessions() {
  main.innerHTML = `
    <section class="card">
      <div class="section-title">
        <div><span class="step-kicker">Return 1 of 2</span><h2>Select the loan session</h2><p>Search all currently open sessions.</p></div>
      </div>
      <div class="field"><label for="sessionSearch">Search</label><input id="sessionSearch" class="input" value="${escapeAttr(state.return.sessionSearch || '')}" placeholder="Teacher, class, subject or trolley group"></div>
      <div id="sessionList" style="margin-top:1rem"></div>
      <div class="action-grid"><button class="ghost-button" id="backBtn">Back</button><button class="secondary-button" id="refreshBtn">Refresh</button></div>
    </section>`;

  const renderList = filter => {
    const q = filter.trim().toLowerCase();
    const filtered = state.return.openSessions.filter(s => [s.teacher, s.classOrActivity, s.subject, s.cartGroup, s.sessionId].join(' ').toLowerCase().includes(q));
    document.getElementById('sessionList').innerHTML = filtered.length ? filtered.map(s => `
      <div class="session-card">
        <div class="session-card-details">
          <h3>${escapeHtml(s.classOrActivity)} · ${escapeHtml(s.subject)}</h3>
          <div class="session-meta">
            <span><strong>Loaned by:</strong> ${escapeHtml(s.teacher)}</span>
            <span><strong>Devices:</strong> ${s.trolleyCount} trolley${s.trolleyCount === 1 ? '' : 's'}, ${s.deviceTotal} devices</span>
            <span><strong>Cart:</strong> ${escapeHtml(s.cartGroup || 'Modified selection')}</span>
            <span><strong>Time:</strong> ${escapeHtml(s.loanTimestamp)}</span>
          </div>
        </div>
        <button class="primary-button session-return-button" data-session-id="${escapeAttr(s.sessionId)}">Return Devices</button>
      </div>`).join('') : '<div class="notice info">No matching open sessions.</div>';
    document.querySelectorAll('.session-return-button').forEach(btn => btn.onclick = () => loadSession(btn.dataset.sessionId));
  };
  renderList(state.return.sessionSearch || '');
  document.getElementById('sessionSearch').oninput = e => {
    state.return.sessionSearch = e.target.value;
    renderList(e.target.value);
  };
  document.getElementById('backBtn').onclick = renderLanding;
  document.getElementById('refreshBtn').onclick = loadOpenSessions;
}

async function loadSession(sessionId, options = {}) {
  const autoSelect = Boolean(options.autoSelect);
  renderLoading('Loading the selected loan session.');
  try {
    const response = await lordFetch(`${API.transaction}?action=session&sessionId=${encodeURIComponent(sessionId)}`, { cache: 'no-store' });
    const payload = await lordJson(response, 'Could not read the selected session response.');
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not load the selected session.');

    state.return.selectedSession = payload.session;
    state.return.teacher = state.identity.teacher;
    state.return.comments = '';
    state.return.selectionMode = autoSelect ? 'carried' : 'manual';
    state.return.stylusQuantity = Number(payload.session.stylusQuantity) || 0;
    state.return.stylusPhotoData = '';
    state.return.stylusFileName = '';
    state.return.headphoneQuantity = Number(payload.session.headphoneQuantity) || 0;
    state.return.headphonePhotoData = '';
    state.return.headphoneFileName = '';
    state.return.correctTrolleyDeclaration = false;
    state.return.sameOrientationDeclaration = false;
    state.return.issue = false;
    state.return.issueNotes = '';
    state.return.trolleys = payload.session.trolleys.map(t => ({
      ...t,
      selected: autoSelect,
      quantity: t.loanQuantity,
      photoData: '',
      fileName: ''
    }));

    persistDraft();
    renderReturnForm();
  } catch (error) {
    renderErrorRetry(error.message, renderOpenSessions);
  }
}

function returnQuantityMismatchReasons() {
  const s = state.return.selectedSession || {};
  const reasons = [];

  state.return.trolleys.forEach(t => {
    if (Number(t.quantity) !== Number(t.loanQuantity)) {
      reasons.push(`${t.name}: ${Number(t.quantity) || 0} of ${Number(t.loanQuantity) || 0} devices`);
    }
  });

  if (Number(s.stylusQuantity) > 0 && Number(state.return.stylusQuantity) !== Number(s.stylusQuantity)) {
    reasons.push(`Styluses: ${Number(state.return.stylusQuantity) || 0} of ${Number(s.stylusQuantity) || 0}`);
  }
  if (Number(s.headphoneQuantity) > 0 && Number(state.return.headphoneQuantity) !== Number(s.headphoneQuantity)) {
    reasons.push(`Headphones: ${Number(state.return.headphoneQuantity) || 0} of ${Number(s.headphoneQuantity) || 0}`);
  }
  return reasons;
}

function returnIssueActive() {
  return Boolean(state.return.issue || returnQuantityMismatchReasons().length);
}

function renderReturnForm() {
  const s = state.return.selectedSession;
  if (!s) return renderOpenSessions();

  const carriedForward = state.return.selectionMode === 'carried';
  const issueActive = returnIssueActive();
  const mismatchReasons = returnQuantityMismatchReasons();
  const trolleySelectionNotice = carriedForward
    ? `<div class="notice success return-selection-note"><strong>Trolleys carried forward automatically</strong><br>These are the exact trolleys recorded in the collection you just completed.</div>`
    : `<div class="notice info return-selection-note"><strong>Confirm the physical trolleys</strong><br>Select every trolley you are returning. Partial returns are not permitted for one loan session.</div>`;

  main.innerHTML = `
    <section class="card">
      <div class="section-title"><div><span class="step-kicker">Return 2 of 2</span><h2>Return devices</h2><p>${escapeHtml(s.classOrActivity)} · ${escapeHtml(s.subject)}</p></div></div>
      <div class="notice info">Original loan: ${s.loanTrolleyCount} trolley${s.loanTrolleyCount === 1 ? '' : 's'}, ${s.loanDeviceTotal} devices by ${escapeHtml(s.loanTeacher)}.</div>
      ${trolleySelectionNotice}
      <div class="return-wide-checks">
        ${globalCheckHtml('returnCorrectTrolleyDeclaration', 'Tablets are kept in the correct trolley based on their device numbering.', state.return.correctTrolleyDeclaration)}
        ${globalCheckHtml('returnSameOrientationDeclaration', 'Tablets are facing the same orientation.', state.return.sameOrientationDeclaration)}
      </div>
      <div class="photo-example" role="note" aria-label="Example trolley photo">
        <img src="assets/trolley-photo-example.webp" alt="Example of a top-down trolley photo showing all tablets">
        <div><strong>Photo example</strong><p>Take a top-down photo showing all devices in this trolley.</p></div>
      </div>
      <div id="returnTrolleyList" style="margin-top:1rem"></div>
      <div id="returnAccessoryEvidence"></div>

      <div class="field"><label for="returnComments">Other comments</label><textarea id="returnComments" placeholder="Optional">${escapeHtml(state.return.comments)}</textarea></div>
      <div class="notice info" style="margin-top:1rem">I confirm that I returned the devices as recorded above and completed the checks shown.</div>
      <div class="action-grid">
        <button class="ghost-button" id="backBtn">Back</button>
        <button class="${issueActive ? 'danger-button' : 'return-clean-button'}" id="submitReturnBtn">${issueActive ? 'Return devices with issues' : 'Return devices without issues'}</button>
      </div>

      <div class="return-wide-issue">
        <button type="button" class="danger-button return-issue-toggle ${issueActive ? 'is-active' : ''}" id="returnIssueBtn">
          ${issueActive ? 'Return with issues selected' : 'Return with issues'}
        </button>
        ${mismatchReasons.length ? `<div class="notice error return-auto-issue"><strong>Discrepancy detected</strong><br>${escapeHtml(mismatchReasons.join(' · '))}<br>LORD will record this as a return with issue.</div>` : ''}
        <div id="returnIssueNotesWrap" class="field return-issue-notes ${issueActive ? '' : 'hidden'}">
          <label for="returnIssueNotes">Issue details for ICT Backend *</label>
          <textarea id="returnIssueNotes" placeholder="Describe what is missing, damaged or not working, and identify the affected device, trolley or accessory.">${escapeHtml(state.return.issueNotes)}</textarea>
        </div>
      </div>
    </section>
    <div class="summary-bar" id="returnSummary"></div>`;

  document.getElementById('returnTrolleyList').innerHTML = state.return.trolleys.map((t, i) => returnTrolleyHtml(t, i, carriedForward)).join('');
  bindReturnEditors();
  renderReturnAccessoryEvidence();
  bindGlobalReturnChecks();
  bindReturnIssueControl();
  updateReturnSummary();

  document.getElementById('returnComments').oninput = e => { state.return.comments = e.target.value; persistDraft(); };
  document.getElementById('backBtn').onclick = renderOpenSessions;
  document.getElementById('submitReturnBtn').onclick = submitReturn;
}

function renderReturnAccessoryEvidence() {
  const host = document.getElementById('returnAccessoryEvidence');
  const s = state.return.selectedSession || {};
  if (!host) return;

  const blocks = [];
  if (Number(s.stylusQuantity) > 0) {
    blocks.push(returnAccessoryCardHtml('Styluses', 'stylus', Number(s.stylusQuantity) || 0, state.return.stylusQuantity, state.return.stylusPhotoData));
  }
  if (Number(s.headphoneQuantity) > 0) {
    blocks.push(returnAccessoryCardHtml('Headphones', 'headphone', Number(s.headphoneQuantity) || 0, state.return.headphoneQuantity, state.return.headphonePhotoData));
  }

  host.innerHTML = blocks.length
    ? `<section class="accessory-evidence"><h3>Return accessories</h3><p class="help">Quantities are pre-filled from Collection. Change them only if the actual return differs; a mismatch automatically becomes Return with issue.</p><div class="accessory-evidence-grid">${blocks.join('')}</div></section>`
    : '';

  bindReturnAccessory('stylus');
  bindReturnAccessory('headphone');
}

function returnAccessoryCardHtml(title, key, collectedQty, returnedQty, photoData) {
  const qty = Number(returnedQty) || 0;
  const preview = photoData ? `<img class="photo-preview" src="${photoData}" alt="${escapeAttr(title)} return photo preview">` : '';
  return `
    <article class="accessory-card accessory-trolley-card">
      <div class="trolley-head"><h3>${escapeHtml(title)}</h3><span class="muted">Collected: ${collectedQty}</span></div>
      <div class="field">
        <label for="return-${key}-qty">Quantity returned</label>
        <input id="return-${key}-qty" class="input" type="number" min="0" max="200" step="1" inputmode="numeric" value="${escapeAttr(qty)}">
      </div>
      <div id="return-${key}-photo-wrap" class="photo-box ${qty > 0 ? '' : 'hidden'}">
        <label>Photo of all ${escapeHtml(title.toLowerCase())} returned</label>
        <input id="return-${key}-photo" type="file" accept="image/*" capture="environment">
        <p class="help">Capture the complete accessory batch together.</p>
        ${preview}
      </div>
    </article>`;
}

function bindReturnAccessory(key) {
  const s = state.return.selectedSession || {};
  const collectedQty = key === 'stylus' ? Number(s.stylusQuantity) || 0 : Number(s.headphoneQuantity) || 0;
  if (collectedQty <= 0) return;

  const qtyField = key === 'stylus' ? 'stylusQuantity' : 'headphoneQuantity';
  const photoField = key === 'stylus' ? 'stylusPhotoData' : 'headphonePhotoData';
  const fileField = key === 'stylus' ? 'stylusFileName' : 'headphoneFileName';
  const qty = document.getElementById(`return-${key}-qty`);
  const photo = document.getElementById(`return-${key}-photo`);
  const photoWrap = document.getElementById(`return-${key}-photo-wrap`);

  if (qty) {
    qty.oninput = e => {
      state.return[qtyField] = Number(e.target.value);
      if (photoWrap) photoWrap.classList.toggle('hidden', !(Number(e.target.value) > 0));
      if (!(Number(e.target.value) > 0)) {
        state.return[photoField] = '';
        state.return[fileField] = '';
      }
      persistDraft();
      updateReturnIssueUi();
      updateReturnSummary();
    };
  }

  if (photo) {
    photo.onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        state.return[photoField] = await compressImage(file);
        state.return[fileField] = file.name;
        persistDraft();
        renderReturnForm();
      } catch (error) {
        alert(error.message);
      }
    };
  }
}

function returnTrolleyHtml(t, index, carriedForward) {
  const selected = carriedForward || Boolean(t.selected);
  const preview = t.photoData ? `<img class="photo-preview" src="${t.photoData}" alt="Return photo preview">` : '';
  const selection = carriedForward
    ? ''
    : `<div class="return-trolley-selection"><input class="return-trolley-selected" id="return-trolley-selected-${index}" type="checkbox" ${selected ? 'checked' : ''}><label for="return-trolley-selected-${index}">I am physically returning ${escapeHtml(t.name)}</label></div>`;

  return `
    <article class="trolley-card return-trolley-card ${selected ? 'is-selected' : 'is-unselected'}" data-index="${index}">
      <div class="trolley-head"><h3>${escapeHtml(t.name)}</h3><span class="muted">Loaned: ${t.loanQuantity}</span></div>
      ${selection}
      <div class="return-trolley-fields ${selected ? '' : 'is-disabled'}">
        <div class="field"><label>Number of devices returned</label><input class="input return-quantity" type="number" min="0" max="200" step="1" inputmode="numeric" value="${escapeAttr(t.quantity)}" ${selected ? '' : 'disabled'}></div>
        <div class="photo-box"><label>Top view return photo</label><input class="return-photo" type="file" accept="image/*" capture="environment" ${selected ? '' : 'disabled'}><p class="help">Capture the whole trolley with all slots visible.</p>${preview}</div>
      </div>
    </article>`;
}

function globalCheckHtml(id, label, checked) {
  return `<div class="check-row"><input id="${id}" type="checkbox" ${checked ? 'checked' : ''}><label for="${id}">${escapeHtml(label)}</label></div>`;
}

function bindGlobalReturnChecks() {
  const bindings = [
    ['returnCorrectTrolleyDeclaration', 'correctTrolleyDeclaration'],
    ['returnSameOrientationDeclaration', 'sameOrientationDeclaration']
  ];
  bindings.forEach(([id, field]) => {
    const input = document.getElementById(id);
    if (!input) return;
    input.onchange = () => {
      state.return[field] = input.checked;
      persistDraft();
    };
  });
}

function bindReturnIssueControl() {
  const button = document.getElementById('returnIssueBtn');
  const notes = document.getElementById('returnIssueNotes');
  if (button) {
    button.onclick = () => {
      const forcedByMismatch = returnQuantityMismatchReasons().length > 0;
      if (forcedByMismatch && !state.return.issue) {
        // Quantity discrepancies cannot be submitted as a clean return.
        state.return.issue = true;
      } else {
        state.return.issue = !state.return.issue;
      }
      if (!state.return.issue && !forcedByMismatch) state.return.issueNotes = '';
      persistDraft();
      renderReturnForm();
    };
  }
  if (notes) notes.oninput = e => { state.return.issueNotes = e.target.value; persistDraft(); };
}

function updateReturnIssueUi() {
  const active = returnIssueActive();
  const mismatchReasons = returnQuantityMismatchReasons();
  const button = document.getElementById('returnIssueBtn');
  const notesWrap = document.getElementById('returnIssueNotesWrap');
  const submit = document.getElementById('submitReturnBtn');

  if (button) {
    button.classList.toggle('is-active', active);
    button.textContent = active ? 'Return with issues selected' : 'Return with issues';
  }
  if (notesWrap) notesWrap.classList.toggle('hidden', !active);
  if (submit) {
    submit.className = active ? 'danger-button' : 'return-clean-button';
    submit.textContent = active ? 'Return devices with issues' : 'Return devices without issues';
  }

  // If a mismatch appears while the form is already open, reveal the issue
  // field immediately without destroying any captured photos.
  const existing = document.querySelector('.return-auto-issue');
  if (mismatchReasons.length && !existing && notesWrap) {
    const warning = document.createElement('div');
    warning.className = 'notice error return-auto-issue';
    warning.innerHTML = `<strong>Discrepancy detected</strong><br>${escapeHtml(mismatchReasons.join(' · '))}<br>LORD will record this as a return with issue.`;
    notesWrap.parentNode.insertBefore(warning, notesWrap);
  } else if (!mismatchReasons.length && existing) {
    existing.remove();
  } else if (mismatchReasons.length && existing) {
    existing.innerHTML = `<strong>Discrepancy detected</strong><br>${escapeHtml(mismatchReasons.join(' · '))}<br>LORD will record this as a return with issue.`;
  }
}

function bindReturnEditors() {
  document.querySelectorAll('.return-trolley-card').forEach(card => {
    const i = Number(card.dataset.index);
    const trolley = state.return.trolleys[i];
    const selector = card.querySelector('.return-trolley-selected');
    if (selector) {
      selector.onchange = e => {
        trolley.selected = e.target.checked;
        persistDraft();
        renderReturnForm();
      };
    }

    const qty = card.querySelector('.return-quantity');
    if (qty) {
      qty.oninput = e => {
        trolley.quantity = Number(e.target.value);
        persistDraft();
        updateReturnIssueUi();
        updateReturnSummary();
      };
    }

    const photo = card.querySelector('.return-photo');
    if (photo) {
      photo.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          trolley.photoData = await compressImage(file);
          trolley.fileName = file.name;
          persistDraft();
          renderReturnForm();
        } catch (error) {
          alert(error.message);
        }
      };
    }
  });
}

async function submitReturn() {
  if (state.busy) return;

  if (state.return.selectionMode !== 'carried') {
    const notConfirmed = state.return.trolleys.filter(t => !t.selected);
    if (notConfirmed.length) {
      return alert(`Confirm every trolley before returning. Still unconfirmed: ${notConfirmed.map(t => t.name).join(', ')}. Partial returns are not permitted.`);
    }
  }

  for (const t of state.return.trolleys) {
    if (!Number.isInteger(Number(t.quantity)) || Number(t.quantity) < 0) return alert(`Enter a valid returned quantity for ${t.name}.`);
    if (!t.photoData) return alert(`Take a return photo of ${t.name}.`);
  }

  const s = state.return.selectedSession || {};
  if (Number(s.stylusQuantity) > 0) {
    if (!Number.isInteger(Number(state.return.stylusQuantity)) || Number(state.return.stylusQuantity) < 0) return alert('Enter a valid number of styluses returned.');
    if (Number(state.return.stylusQuantity) > 0 && !state.return.stylusPhotoData) return alert('Take a return photo of all styluses returned.');
  }
  if (Number(s.headphoneQuantity) > 0) {
    if (!Number.isInteger(Number(state.return.headphoneQuantity)) || Number(state.return.headphoneQuantity) < 0) return alert('Enter a valid number of headphones returned.');
    if (Number(state.return.headphoneQuantity) > 0 && !state.return.headphonePhotoData) return alert('Take a return photo of all headphones returned.');
  }

  const mismatchReasons = returnQuantityMismatchReasons();
  const issueActive = Boolean(state.return.issue || mismatchReasons.length);

  if (!issueActive && (!state.return.correctTrolleyDeclaration || !state.return.sameOrientationDeclaration)) {
    return alert('Complete both return checks for a normal return, or choose Return with issue if either check cannot be confirmed.');
  }
  if (issueActive && !state.return.issueNotes.trim()) {
    return alert('Describe the outstanding issue for the ICT Backend team.');
  }

  const payload = {
    action: 'return',
    clientRequestId: crypto.randomUUID(),
    sessionId: state.return.selectedSession.sessionId,
    teacher: state.return.teacher,
    comments: state.return.comments,
    issue: issueActive,
    issueNotes: state.return.issueNotes,
    accessories: {
      styluses: {
        booked: Boolean(s.stylusesBooked),
        quantity: Number(s.stylusQuantity) > 0 ? Number(state.return.stylusQuantity) || 0 : 0,
        photoData: state.return.stylusPhotoData,
        fileName: state.return.stylusFileName
      },
      headphones: {
        booked: Boolean(s.headphonesBooked),
        quantity: Number(s.headphoneQuantity) > 0 ? Number(state.return.headphoneQuantity) || 0 : 0,
        photoData: state.return.headphonePhotoData,
        fileName: state.return.headphoneFileName
      }
    },
    trolleys: state.return.trolleys.map(t => ({
      trolleyRecordId: t.trolleyRecordId,
      quantity: t.quantity,
      photoData: t.photoData,
      fileName: t.fileName,
      correctTrolleyDeclaration: state.return.correctTrolleyDeclaration,
      sameOrientationDeclaration: state.return.sameOrientationDeclaration,
      issue: issueActive,
      notes: state.return.issueNotes
    }))
  };

  state.busy = true;
  renderSubmitting('Recording return and uploading photos…');
  try {
    const result = await postTransaction(payload);
    localStorage.setItem(STORAGE_KEYS.recentTeacher, state.return.teacher);
    clearDraft();
    renderSuccess(
      result.status === 'RETURNED WITH ISSUE' ? 'Return recorded with issue' : 'Return successful',
      `${result.returnDeviceTotal} devices were returned successfully. Status: ${result.status}.`,
      result.sessionId,
      'return'
    );
  } catch (error) {
    state.busy = false;
    renderErrorRetry(error.message, renderReturnForm);
  }
}

async function postTransaction(payload) {
  const pending = await stableClientRequestId(payload);
  if(String(payload.action).toLowerCase()==='bookingcreatebatch'){state.booking.pendingBatch=payload;await persistDraft();}
  let response;
  try {
    const writeAction = String(payload.action || '').toLowerCase();
    const writeTimeoutMs = (writeAction === 'loan' || writeAction === 'return')
      ? LORD_WRITE_TIMEOUTS.evidence
      : LORD_WRITE_TIMEOUTS.booking;
    response = await lordFetch(API.transaction, {
      method: 'POST',
      timeoutMs: writeTimeoutMs,
      headers: { 'Content-Type': 'application/json', 'X-LORD-Request-ID': pending.id },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    if (handleAuthExpiry(error)) throw error;
    const unknown = new Error(`We could not confirm whether this was recorded. Your form is preserved. Retry this action; LORD will reuse request ${pending.id.slice(0,8)} safely.`);
    unknown.code = 'UNKNOWN_OUTCOME';
    unknown.requestId = pending.id;
    throw unknown;
  }
  let data;
  try {data=await lordJson(response,'The submission result could not be read. Retry with the same saved details.');}
  catch(error){error.code='UNKNOWN_OUTCOME';throw error;}
  if (!response.ok || !data.ok) {
    const err = new Error(data.error || 'Submission was rejected.');
    err.requestId = pending.id;
    err.code = data.code==='UNKNOWN_OUTCOME' || data.retryable || response.status>=500 ? 'UNKNOWN_OUTCOME' : 'SUBMISSION_REJECTED';
    if(err.code==='SUBMISSION_REJECTED')clearPendingRequest(pending);
    throw err;
  }
  clearPendingRequest(pending);
  if (data.result && data.result.maintenanceWarnings) setReloadDataStatus(data.result.maintenanceWarnings.join(" "),true);
  return data.result;
}

function renderSubmitting(message) {
  main.innerHTML = `<section class="card center-card"><div class="spinner"></div><h2>Please wait</h2><p>${escapeHtml(message)}</p><p class="help">Do not close this page until LORD confirms success.</p></section>`;
}

function renderSuccess(title, message, sessionId, completedAction = '') {
  state.busy = false;
  const isLoan = completedAction === 'loan';
  main.innerHTML = `
    <section class="card center-card">
      <div class="notice success"><strong>${escapeHtml(title)}</strong></div>
      <h2 style="margin-top:1rem">Completed</h2>
      <p>${escapeHtml(message)}</p>
      <p class="help">Reference: ${escapeHtml(sessionId)}</p>
      <div class="action-grid">
        ${isLoan ? '<button class="primary-button" id="returnNowBtn">Return Devices</button>' : ''}
        <button class="secondary-button" id="doneBtn">Start Another Declaration</button>
      </div>
    </section>`;
  if (isLoan) {
    document.getElementById('returnNowBtn').onclick = () => loadSession(sessionId, { autoSelect: true });
  }
  document.getElementById('doneBtn').onclick = () => { resetStateKeepTeacher(); renderLanding(); };
}

function renderLoanCollectionSuccess(result) {
  state.busy = false;
  const trolleyCount = Number(result.trolleyCount || 0);
  const deviceTotal = Number(result.deviceTotal || 0);
  const isRelief = Boolean(state.auth && state.auth.session && state.auth.session.identityType === 'RELIEF');
  const reminderText = isRelief
    ? 'You have successfully collected the devices that were booked for you. The before-use photos were uploaded successfully. Do remember to sign out and return the devices through this app at the end of your lesson.'
    : `${trolleyCount} trolley${trolleyCount === 1 ? '' : 's'} and ${deviceTotal} devices have been recorded. All before-use photos were uploaded successfully.`;
  main.innerHTML = `
    <section class="card center-card">
      <div class="notice warning collection-reminder">
        <strong>Devices collected successfully</strong><br>
        ${escapeHtml(reminderText)}
      </div>
      <h2 style="margin-top:1rem">Loan session is open</h2>
      <p>${isRelief ? 'Please use LORD to return the devices after your lesson.' : 'Please return the devices through LORD after use.'}</p>
      <p class="help">Reference: ${escapeHtml(result.sessionId)}</p>
      <div class="action-grid">
        <button class="primary-button" id="returnNowBtn">Return Devices</button>
        <button class="secondary-button" id="doneBtn">Back to LORD</button>
      </div>
    </section>`;
  document.getElementById('returnNowBtn').onclick = () => loadSession(result.sessionId, { autoSelect: true });
  document.getElementById('doneBtn').onclick = () => { resetStateKeepTeacher(); renderLanding(); };
}

function renderErrorRetry(message, retryFn) {
  if (!state.auth.session) { renderGoogleSignIn(); return; }
  main.innerHTML = `<section class="card"><div class="notice error"><strong>Submission could not be confirmed.</strong><br>${escapeHtml(message)}</div><p class="help">Your form remains open. Check any photo backup warning before closing this tab.</p><div class="action-grid"><button class="primary-button" id="retryBtn">Try again</button><button class="ghost-button" id="homeBtn">Return to start</button></div></section>`;
  document.getElementById('retryBtn').onclick = retryFn;
  document.getElementById('homeBtn').onclick = renderLanding;
}

function searchFieldHtml(id, label, value, placeholder, required) {
  return `<div class="field"><label for="${id}">${escapeHtml(label)}${required ? ' *' : ''}</label><div class="search-wrap"><input id="${id}" class="input" autocomplete="off" value="${escapeAttr(value)}" placeholder="${escapeAttr(placeholder)}"><div id="${id}Results" class="search-results hidden"></div></div></div>`;
}

function customToggleHtml(id, checked, value = '') {
  return `
    <div class="check-row">
      <input id="${id}Custom" type="checkbox" ${checked ? 'checked' : ''}>
      <label for="${id}Custom">Not listed. Enter a custom value.</label>
    </div>
    <div id="${id}ManualWrap" class="field custom-entry ${checked ? '' : 'hidden'}">
      <label for="${id}Manual">Custom value *</label>
      <input id="${id}Manual" class="input" autocomplete="off" value="${escapeAttr(checked ? value : '')}" placeholder="Type the value here">
    </div>`;
}

/* RC1.7a search dropdown fix. The old blur handler hid the list 150ms after
   the input lost focus. Scrolling the list, or touching its scrollbar, blurs
   the input, so the menu vanished mid-scroll and the last entries were
   unreachable. The list now closes only on a real outside tap, on Escape or
   Tab, or after a selection. */
function bindSearchField(id, values, onValue) {
  const input = document.getElementById(id);
  const results = document.getElementById(`${id}Results`);
  const show = () => {
    const q = input.value.trim().toLowerCase();
    const matches = values.filter(v => v.toLowerCase().includes(q)).slice(0, 120);
    results.innerHTML = matches.map(v => `<button type="button" class="search-result" data-value="${escapeAttr(v)}">${escapeHtml(v)}</button>`).join('');
    results.classList.toggle('hidden', matches.length === 0);
    results.scrollTop = 0;
    results.querySelectorAll('.search-result').forEach(btn => btn.onclick = () => {
      input.value = btn.dataset.value;
      results.classList.add('hidden');
      onValue(input.value.trim());
    });
  };
  input.onfocus = show;
  input.oninput = () => { onValue(input.value.trim()); show(); };
  input.onkeydown = e => { if (e.key === 'Escape' || e.key === 'Tab') results.classList.add('hidden'); };
  installSearchDropdownDismiss();
}

let searchDropdownDismissInstalled = false;
function installSearchDropdownDismiss() {
  if (searchDropdownDismissInstalled) return;
  searchDropdownDismissInstalled = true;
  document.addEventListener('pointerdown', event => {
    document.querySelectorAll('.search-results:not(.hidden)').forEach(list => {
      const wrap = list.closest('.search-wrap');
      if (!wrap || !wrap.contains(event.target)) list.classList.add('hidden');
    });
  });
}

function bindCustomToggle(id, callback) {
  const checkbox = document.getElementById(`${id}Custom`);
  const manualWrap = document.getElementById(`${id}ManualWrap`);
  const manualInput = document.getElementById(`${id}Manual`);
  const searchInput = document.getElementById(id);

  const applyMode = checked => {
    manualWrap.classList.toggle('hidden', !checked);
    searchInput.disabled = checked;
    searchInput.closest('.field').classList.toggle('field-disabled', checked);

    if (checked) {
      manualInput.focus();
    }
  };

  checkbox.onchange = e => {
    const checked = e.target.checked;
    applyMode(checked);
    if (checked) {
      searchInput.value = '';
      callback(true, manualInput.value.trim());
    } else {
      manualInput.value = '';
      callback(false, searchInput.value.trim());
      searchInput.focus();
    }
  };

  manualInput.oninput = () => callback(true, manualInput.value.trim());
  applyMode(checkbox.checked);
}

function validateIdentityForLoan() {
  if (!validateTeacher()) return false;
  const classOrActivity = state.identity.classOrActivity.trim();
  const subject = state.identity.subject.trim();
  if (!classOrActivity || !subject) {
    alert('Select or enter both class or student group and subject.');
    return false;
  }
  return true;
}

function validateTeacher() {
  const teacher = state.identity.teacher.trim();
  if (!teacher) { alert('Select or enter a teacher name.'); return false; }
  return true;
}

function updateLoanSummary() {
  const count = state.loan.trolleys.length;
  const total = state.loan.trolleys.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
  const el = document.getElementById('loanSummary');
  if (el) el.innerHTML = `<div><strong>${count} trolley${count === 1 ? '' : 's'}</strong><br><span>${total} devices declared</span></div><div>${escapeHtml(state.loan.cartGroup || 'Custom selection')}</div>`;
}

function updateReturnSummary() {
  const count = state.return.trolleys.length;
  const total = state.return.trolleys.reduce((s, t) => s + (Number(t.quantity) || 0), 0);
  const el = document.getElementById('returnSummary');
  if (el) {
    const issueText = returnIssueActive() ? 'Return with issue' : 'Return without issue';
    el.innerHTML = `<div><strong>${count} trolley${count === 1 ? '' : 's'}</strong><br><span>${total} devices returned</span></div><div>${issueText}</div>`;
  }
}

async function compressImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Select an image file.');
  const dataUrl = await fileToDataUrl(file);
  const image = await loadImage(dataUrl);
  const maxSide = 1280;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read the photo.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not process the photo.'));
    img.src = src;
  });
}

function draftOwner() {
  const session=state.auth && state.auth.session;
  if (!session) return '';
  return session.identityType==='RELIEF' ? 'RELIEF:'+String(session.mobile||'')+':'+String(session.ttbName||'') : 'GSPS:'+String(session.sub||session.email||'').toLowerCase();
}
function showDraftStatus(message) {
  const status=document.getElementById('draftStatus');
  if (status) {status.textContent=message || '';status.hidden=!message;}
}
async function persistDraft() {
  const owner=draftOwner();
  if (!owner) return false;
  let saved;
  try {
    saved=await LordDraftStore.save({mode:state.mode,identity:state.identity,loan:state.loan,
      booking:{...state.booking,scheduleKey:'',scheduleLoading:false,scheduleError:'',daySchedule:[]},return:state.return},owner);
  } catch {
    showDraftStatus('This form could not be saved on this device. Keep this tab open until submission succeeds.');
    return false;
  }
  if (!saved.photosSaved) showDraftStatus(saved.saved ? 'Photo backup is unavailable. Keep this tab open until submission succeeds; photos may need to be taken again after a reload.' : 'This form could not be saved on this device. Keep this tab open until submission succeeds.');
  else showDraftStatus('');
  return saved.photosSaved;
}
async function restoreDraft() {
  const owner=draftOwner();
  if (!owner) return;
  const draft=await LordDraftStore.load(owner,state.auth.session.ttbName);
  if (!draft || draftOwner() !== owner) return;
  Object.assign(state.identity,draft.identity || {});
  state.identity.teacher=state.auth.session.ttbName;
  state.identity.teacherCustom=false;
  state.identity.classCustom=Boolean(state.identity.classCustom && state.identity.classOrActivity.trim());
  state.identity.subjectCustom=Boolean(state.identity.subjectCustom && state.identity.subject.trim());
  Object.assign(state.loan,draft.loan || {});
  Object.assign(state.booking,draft.booking || {},{scheduleKey:'',scheduleLoading:false,scheduleError:'',daySchedule:[]});
  Object.assign(state.return,draft.return || {});
  state.return.teacher=state.auth.session.ttbName;
  state.restoredMode=draft.mode;
  if (draft.photosOmitted) showDraftStatus('Form details were restored. Take the evidence photos again before submitting.');
}
async function clearDraft() {
  state.restoredMode=null;
  showDraftStatus('');
  const cleared=await LordDraftStore.clear();
  if (!cleared) showDraftStatus('The saved draft could not be fully cleared. Close this tab after completing your work.');
}
function resumeDraft() {
  const mode=state.restoredMode || (state.booking.pendingBatch?'booking':null);
  state.restoredMode=null;
  if (mode==='booking' && state.auth.session.identityType!=='RELIEF') {state.mode='booking';if(state.booking.pendingBatch)showPendingBookingBatch();else renderBooking();}
  else if (mode==='loan' && state.loan.booking) {state.mode='loan';renderLoanTrolleys();}
  else if (mode==='return' && state.return.selectedSession) {state.mode='return';renderReturnForm();}
  else renderLanding();
}

function resetStateKeepTeacher(clearStored = true) {
  const teacher = state.identity.teacher;
  state.mode = null;
  state.identity = { teacher, teacherCustom: false, classOrActivity: '', classCustom: false, subject: '', subjectCustom: false };
  state.loan = { cartGroup: '', trolleys: [], comments: '', sessionSearch: '', booking: null, stylusQuantity: '', stylusPhotoData: '', stylusFileName: '', headphoneQuantity: '', headphonePhotoData: '', headphoneFileName: '' };
  state.booking = { date: '', resource: '', deviceType: '', quantity: 1, startPeriod: '', endPeriod: '', headphones: false, styluses: false, remarks: '', selections: [], availability: [], occupiedPeriods: [], occupancyKey: '', daySchedule: [], scheduleKey: '', scheduleLoading: false, scheduleError: '', editing: null };
  state.return = { openSessions: [], selectedSession: null, teacher, trolleys: [], selectionMode: 'manual', stylusQuantity: 0, stylusPhotoData: '', stylusFileName: '', headphoneQuantity: 0, headphonePhotoData: '', headphoneFileName: '', correctTrolleyDeclaration: false, sameOrientationDeclaration: false, issue: false, issueNotes: '', comments: '', sessionSearch: '' };
  if (clearStored) clearDraft();
}

function resetApp() {
  if (!confirm('Clear the current form and start again?')) return;
  resetStateKeepTeacher();
  renderLanding();
}

function updateNetworkState() {
  if (networkState) networkState.textContent = navigator.onLine ? 'Online' : 'Offline';
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function escapeAttr(value) { return escapeHtml(value); }

/* LORD v1 reliability hardening.
   GET requests are safe to retry. POST requests are never automatically retried here;
   postTransaction uses a stable clientRequestId so the user can explicitly retry safely. */
const LORD_NET = { timeoutMs: 45000, getRetries: 1, retryDelays: [1000, 3000] };
const LORD_WRITE_TIMEOUTS = { booking: 105000, evidence: 195000 };

function sleepMs(ms){ return new Promise(resolve => setTimeout(resolve, ms)); }

async function lordFetch(url, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  const getRetries = options.getRetries === undefined ? LORD_NET.getRetries : Math.max(0, Number(options.getRetries) || 0);
  const attempts = method === 'GET' ? 1 + getRetries : 1;
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || LORD_NET.timeoutMs));
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      if (response.status === 401) {
        const err = new Error('Your LORD session has expired. Sign in again to continue.');
        err.code = 'AUTH_EXPIRED';
        err.response = response;
        throw err;
      }
      if (method === 'GET' && response.status >= 500 && attempt < attempts - 1 && !document.hidden) {
        await sleepMs(LORD_NET.retryDelays[Math.min(attempt, LORD_NET.retryDelays.length - 1)]);
        continue;
      }
      return response;
    } catch (error) {
      clearTimeout(timer);
      if (error && error.code === 'AUTH_EXPIRED') throw error;
      lastError = error && error.name === 'AbortError'
        ? new Error('The server is taking longer than expected.')
        : error;
      if (method !== 'GET' || attempt >= attempts - 1 || !navigator.onLine || document.hidden) break;
      await sleepMs(LORD_NET.retryDelays[Math.min(attempt, LORD_NET.retryDelays.length - 1)]);
    }
  }
  if (!navigator.onLine) throw new Error('This device appears to be offline. Keep this tab open until your submission is confirmed.');
  throw lastError || new Error('The network request could not be completed.');
}

async function lordJson(response, fallback) {
  const text = await response.text();
  let payload;
  try { payload = text ? JSON.parse(text) : {}; }
  catch { throw new Error(fallback || 'The server returned an unexpected response. Please try again.'); }
  return payload;
}

const pendingWriteIds = new Map();
function canonicalWrite(value) {
  if (Array.isArray(value)) return value.map(canonicalWrite);
  if (!value || typeof value !== 'object') return value;
  const out={};Object.keys(value).sort().forEach(key=>{if(key!=='clientRequestId')out[key]=canonicalWrite(value[key]);});return out;
}
async function pendingRequestStorageKey(payload) {
  const bytes=new TextEncoder().encode(JSON.stringify([draftOwner(),canonicalWrite(payload)]));
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return 'lordPendingRequest:v1.4:'+Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function stableClientRequestId(payload) {
  const key=await pendingRequestStorageKey(payload);
  let id=pendingWriteIds.get(key);
  try {
    const saved=JSON.parse(localStorage.getItem(key)||'null');
    if(saved && Date.now()-saved.at<24*60*60*1000) id=saved.id;
  } catch {}
  if(!id) id=payload.clientRequestId || crypto.randomUUID();
  pendingWriteIds.set(key,id);
  try {localStorage.setItem(key,JSON.stringify({id,at:Date.now()}));} catch {showDraftStatus('The retry receipt could not be saved on this device. Keep this tab open until submission is confirmed.');}
  payload.clientRequestId=id;
  return {key,id};
}
function clearPendingRequest(pending) {
  pendingWriteIds.delete(pending.key);
  try {localStorage.removeItem(pending.key);} catch {}
}

function handleAuthExpiry(error) {
  if (!error || error.code !== 'AUTH_EXPIRED') return false;
  persistDraft();
  state.auth.session = null;
  renderGoogleSignIn();
  const message = document.getElementById('authMessage');
  if (message) message.textContent = 'Your LORD session expired. Sign in again; your current form has been preserved.';
  return true;
}

/* LORD v0.2 authenticated flow */
state.auth = { session: null, clientId: '', signInInFlight: false };

async function lordAuthRequest(path, options) {
  const opts = Object.assign({ cache: 'no-store', timeoutMs: 30000 }, options || {});
  const response = await lordFetch(path, opts);
  const payload = await lordJson(response, 'Authentication service returned an unexpected response.');
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'Authentication failed.');
  return payload;
}

function readReferenceCache(maxAgeMs) {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.referenceCache);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (!cached || !cached.data || !cached.savedAt) return null;
    if (Date.now() - Number(cached.savedAt) > maxAgeMs) return null;
    return cached.data;
  } catch { return null; }
}
function writeReferenceCache(data) {
  try { localStorage.setItem(STORAGE_KEYS.referenceCache, JSON.stringify({ savedAt: Date.now(), data })); } catch {}
}
function setReloadDataStatus(message, failed = false) {
  const status = document.getElementById('reloadDataStatus');
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle('error', failed);
}
async function reloadFromSheets() {
  if (!state.auth.session || state.reloading) return;
  if (state.busy || state.booking.scheduleLoading) {
    setReloadDataStatus('Please wait for the current request to finish, then reload.', true);
    return;
  }
  const button = document.getElementById('reloadDataBtn');
  const bookingVisible = Boolean(document.querySelector('.booking-card'));
  const canRedraw = bookingVisible && !document.getElementById('bookingOverlay');
  const date = bookingVisible ? state.booking.date : '';
  const overrideInput = document.getElementById('bookingOverrideReason');
  const overrideReason = overrideInput ? overrideInput.value : '';
  state.reloading = true;
  state.referenceGeneration++;
  button.disabled = true;
  button.textContent = 'Reloading…';
  resetAppBtn.disabled = true;
  main.inert = true;
  setReloadDataStatus('Reading the latest data from Sheets…');
  try {
    const response = await lordFetch(`${API.reference}?forceRefresh=1${date ? '&date=' + encodeURIComponent(date) : ''}`, { cache: 'no-store', timeoutMs: 55000, getRetries: 0 });
    const payload = await lordJson(response, 'Could not reload from Sheets.');
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Could not reload from Sheets.');
    if (payload.cacheReloaded !== true || !payload.data) throw new Error('Reload requires the v1.3 backend. Update the Apps Script deployment.');
    if (date && (payload.date !== date || !Array.isArray(payload.daySchedule))) throw new Error('The fresh booking schedule was incomplete.');
    state.reference = payload.data;
    writeReferenceCache(payload.data);
    // Remove only cached schedules. Drafts, photographs and pending write IDs stay.
    try {
      Object.keys(sessionStorage).filter(key => key.startsWith('lord_booking_day_')).forEach(key => sessionStorage.removeItem(key));
    } catch {}
    state.booking.scheduleKey = '';
    state.booking.occupancyKey = '';
    if (date) {
      state.booking.daySchedule = payload.daySchedule;
      state.booking.scheduleKey = date;
      state.booking.scheduleError = '';
      try { sessionStorage.setItem('lord_booking_day_' + date, JSON.stringify({ savedAt: Date.now(), bookings: payload.daySchedule })); } catch {}
    }
    if (canRedraw) {
      if (state.booking.editing) renderBookingEdit(); else renderBooking();
      const newOverride = document.getElementById('bookingOverrideReason');
      if (newOverride) newOverride.value = overrideReason;
    }
    const keptForm = state.mode && !canRedraw ? ' Your current form has been kept.' : '';
    setReloadDataStatus(`Reloaded from Sheets at ${new Date().toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit' })}.${keptForm}`);
  } catch (error) {
    setReloadDataStatus(`Reload failed. Your current data and form have been kept. ${error.message}`, true);
  } finally {
    state.reloading = false;
    button.disabled = false;
    button.textContent = 'Reload from Sheets';
    resetAppBtn.disabled = false;
    main.inert = false;
  }
}
async function refreshReferenceInBackground() {
  if (state.reloading || document.hidden) return;
  const generation = state.referenceGeneration;
  try {
    const response = await lordFetch(API.reference, { cache: 'no-store', timeoutMs: 55000, getRetries: 0 });
    const payload = await lordJson(response, 'Reference data could not be refreshed.');
    if (generation === state.referenceGeneration && !state.reloading && response.ok && payload.ok && payload.data) {
      state.reference = payload.data;
      writeReferenceCache(payload.data);
    }
  } catch (error) { console.warn('LORD reference background refresh deferred:', error); }
}

function loadGoogleIdentityLibrary() {
  return new Promise(function(resolve, reject) {
    if (window.google && google.accounts && google.accounts.id) return resolve();
    var existing = document.querySelector('script[data-lord-gsi]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', function(){ reject(new Error('Google sign in could not be loaded.')); }, { once: true });
      return;
    }
    var script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.dataset.lordGsi = 'true';
    script.onload = resolve;
    script.onerror = function(){ reject(new Error('Google sign in could not be loaded.')); };
    document.head.appendChild(script);
  });
}

async function init() {
  updateNetworkState();
  renderLoading('Checking your LORD session.');
  try {
    // Fast path: most returning users already have a valid HttpOnly LORD session.
    // Do not load Google Identity Services or even request the Google client ID unless sign-in is actually required.
    var sessionPayload = await lordAuthRequest('/api/auth/session');
    if (sessionPayload.authenticated) {
      state.auth.session = sessionPayload.session;
      const usedCache = await loadAuthenticatedReference({ preferCache: true });
      await routeAfterAuthentication();
      if (usedCache) refreshReferenceInBackground();
      return;
    }
    var authConfig = await lordAuthRequest('/api/auth/config');
    state.auth.clientId = authConfig.clientId;
    renderGoogleSignIn();
  } catch (error) {
    renderFatal(error.message);
  }
}

async function loadAuthenticatedReference(options = {}) {
  const owner=draftOwner();
  if (state.formOwner && state.formOwner!==owner) resetStateKeepTeacher(false);
  state.formOwner=owner;
  document.getElementById('reloadDataBtn').hidden = false;
  const preferCache = Boolean(options.preferCache);
  // Reference data is configuration-like and changes infrequently. A local last-good copy
  // makes repeat visits fast and prevents a transient Apps Script delay from looking like an auth failure.
  if (preferCache) {
    const cached = readReferenceCache(12 * 60 * 60 * 1000);
    if (cached) {
      state.reference = cached;
      state.identity.teacher = state.auth.session.ttbName;
      state.identity.teacherCustom = false;
      return true;
    }
  }
  try {
    var response = await lordFetch(API.reference, { cache: 'no-store', timeoutMs: 55000, getRetries: 0 });
    var payload = await lordJson(response, 'Reference data could not be loaded.');
    if (!response.ok || !payload.ok) throw new Error(payload.error || 'Reference data could not be loaded.');
    state.reference = payload.data;
    writeReferenceCache(payload.data);
  } catch (error) {
    const stale = readReferenceCache(7 * 24 * 60 * 60 * 1000);
    if (!stale) throw error;
    state.reference = stale;
  }
  state.identity.teacher = state.auth.session.ttbName;
  state.identity.teacherCustom = false;
  return false;
}



async function signOutLord() {
  document.getElementById('reloadDataBtn').hidden = true;
  setReloadDataStatus('');
  try { await lordFetch('/api/auth/logout', { method: 'POST', timeoutMs: 8000 }); } catch {}
  await clearDraft();
  resetStateKeepTeacher(false);
  state.auth.session = null;
  state.reference = null;
  state.identity.teacher = '';
  renderGoogleSignIn();
}



/* LORD v0.3 relief access and admin booking on behalf */
async function renderGoogleSignIn() {
  state.auth.signInInFlight = false;
  main.innerHTML = `<section class="card auth-card"><span class="step-kicker">Secure access</span><h2>Sign in to LORD</h2><p>Use your GSPS Google Workspace account.</p><div id="googleSignInButton" class="google-signin"></div><div class="auth-divider"><span>or</span></div><button type="button" class="secondary-button full-width" id="reliefAccessBtn">I'm a relief teacher without a GSPS account</button><div id="reliefFormHost"></div><div id="authMessage" class="help"></div></section>`;
  document.getElementById('reliefAccessBtn').onclick = function(){
    document.getElementById('reliefFormHost').innerHTML = `<div class="relief-form"><div class="field"><label for="reliefName">Name *</label><input class="input" id="reliefName" autocomplete="name"></div><div class="field"><label for="reliefMobile">Mobile number *</label><input class="input" id="reliefMobile" type="tel" inputmode="numeric" autocomplete="tel" placeholder="8-digit Singapore mobile"></div><button type="button" class="primary-button full-width" id="continueReliefBtn">Continue</button></div>`;
    document.getElementById('continueReliefBtn').onclick = async function(){
      if (state.auth.signInInFlight) return;
      state.auth.signInInFlight = true;
      const button = document.getElementById('continueReliefBtn');
      if (button) button.disabled = true;
      const message=document.getElementById('authMessage'); message.textContent='Starting restricted relief teacher session…';
      try {
        const payload=await lordAuthRequest('/api/auth/relief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:document.getElementById('reliefName').value,mobile:document.getElementById('reliefMobile').value}),timeoutMs:30000});
        state.auth.session=payload.session;
        const usedCache=await loadAuthenticatedReference({preferCache:true});
        await routeAfterAuthentication();
        if (usedCache) refreshReferenceInBackground();
      } catch(error){ message.textContent=error.message; state.auth.signInInFlight=false; if(button) button.disabled=false; }
    };
  };
  try {
    if (!state.auth.clientId) {
      const authConfig = await lordAuthRequest('/api/auth/config');
      state.auth.clientId = authConfig.clientId;
    }
    await loadGoogleIdentityLibrary();
    google.accounts.id.initialize({
      client_id:state.auth.clientId,
      hd:'gsps.edu.sg',
      auto_select:false,
      callback:async function(response){
        if (state.auth.signInInFlight) return;
        state.auth.signInInFlight = true;
        const signInHost=document.getElementById('googleSignInButton');
        if(signInHost){signInHost.style.pointerEvents='none';signInHost.style.opacity='0.65';}
        const message=document.getElementById('authMessage');
        message.textContent='Verifying your GSPS account…';
        try {
          const payload=await lordAuthRequest('/api/auth/google',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential:response.credential}),timeoutMs:45000});
          state.auth.session=payload.session;
          message.textContent='Signed in. Loading LORD…';
          const usedCache=await loadAuthenticatedReference({preferCache:true});
          await routeAfterAuthentication();
          if (usedCache) refreshReferenceInBackground();
        } catch(error){
          state.auth.signInInFlight=false;
          if(signInHost){signInHost.style.pointerEvents='';signInHost.style.opacity='';}
          message.textContent=error.message;
        }
      }
    });
    google.accounts.id.renderButton(document.getElementById('googleSignInButton'),{theme:'outline',size:'large',text:'signin_with',shape:'rectangular',width:320});
  } catch(error){ document.getElementById('authMessage').textContent=error.message; }
}

function renderLanding() {
  state.mode = null;
  state.identity.teacher = state.auth.session.ttbName;
  const relief = state.auth.session.identityType === 'RELIEF';
  const identityDetail = relief ? `Relief teacher · ${escapeHtml(state.auth.session.mobile)}` : escapeHtml(state.auth.session.email);
  const reliefMessage = relief ? `<div class="notice info compact-notice relief-info">Thank you for helping us with relief. Booking function is not available to relief teachers. You can collect and return devices.</div>` : '';
  const bookDisabledAttr = relief ? 'disabled aria-disabled="true"' : '';
  main.innerHTML = `<section class="card menu-card"><div class="signed-in-strip"><div><span>${relief ? 'Relief access' : 'Signed in as'}</span><strong>${escapeHtml(state.auth.session.ttbName)}</strong><small>${identityDetail}</small></div><button type="button" class="text-button" id="signOutBtn">Sign out</button></div>${reliefMessage}<div class="bcr-strip" aria-label="Book, Collect, Return process overview"><div class="bcr-step step-book"><span class="bcr-step-number">1</span><div><strong>Book</strong><small>Reserve devices</small></div></div><div class="bcr-arrow">→</div><div class="bcr-step step-collect"><span class="bcr-step-number">2</span><div><strong>Collect</strong><small>First sight of devices</small></div></div><div class="bcr-arrow">→</div><div class="bcr-step step-return"><span class="bcr-step-number">3</span><div><strong>Return</strong><small>Send devices back</small></div></div></div><div class="function-group"><div class="function-band band-book"><strong>Book</strong><span>Reserve devices in advance.</span></div><div class="menu-section function-section section-book${relief ? ' is-disabled' : ''}"><button class="menu-action primary-book" id="bookBtn" ${bookDisabledAttr}><strong>Book Devices</strong><span>Reserve a cart for a class or student group</span></button><button class="menu-action" id="manageBookingsBtn" ${bookDisabledAttr}><strong>Manage Bookings</strong><span>View or cancel your own bookings</span></button></div></div><div class="menu-divider function-divider"></div><div class="function-group"><div class="function-band band-collect"><strong>Collect</strong><span>When you first have sight of the devices.</span></div><div class="menu-section function-section section-collect"><button class="menu-action primary-collect" id="loanBtn"><strong>Collect Devices</strong><span>Declare collection against an existing booking</span></button></div></div><div class="menu-divider function-divider"></div><div class="function-group"><div class="function-band band-return"><strong>Return</strong><span>When the devices are sent back.</span></div><div class="menu-section function-section section-return"><button class="menu-action primary-return" id="returnBtn"><strong>Return Devices</strong><span>Complete a device return declaration</span></button><button class="menu-action" id="listOpenLoansBtn"><strong>Pending Return</strong><span>See devices that have not yet been returned</span></button></div></div></section>`;
  if (state.restoredMode || state.booking.pendingBatch) {
    const resume=document.createElement('button');resume.type='button';resume.className='secondary-button full-width';resume.textContent=state.booking.pendingBatch?'Review unconfirmed booking':'Resume saved form';resume.onclick=resumeDraft;main.prepend(resume);
  }
  document.getElementById('signOutBtn').onclick = signOutLord;
  if (!relief) {
    document.getElementById('bookBtn').onclick = function() {
      if(state.booking.pendingBatch){showPendingBookingBatch();return;}
      state.mode = 'booking';
      state.identity.classOrActivity = '';
      state.identity.subject = '';
      state.booking.startPeriod = '';
      state.booking.endPeriod = '';
      state.booking.editing = null;
      state.booking.bookingForTtbName = '';
      renderBooking();
    };
    document.getElementById('manageBookingsBtn').onclick = renderMyBookings;
  }
  document.getElementById('loanBtn').onclick = function() { state.mode = 'loan'; loadEligibleBookings(); };
  document.getElementById('listOpenLoansBtn').onclick = function() { state.mode = 'return'; state.return.sessionSearch = ''; loadOpenSessions(); };
  document.getElementById('returnBtn').onclick = function() { state.mode = 'return'; loadOpenSessions(); };
}




/* RC1.7 Monday-first calendar picker. Native date pickers follow device locale,
   so LORD and OVERLORD use this controlled picker for consistent Monday-first display. */
(function(){
  var activeCalendar = null;
  function pad(n){ return String(n).padStart(2,'0'); }
  function isoDate(d){ return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
  function parseIso(value){
    var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value||''));
    return m ? new Date(Number(m[1]),Number(m[2])-1,Number(m[3])) : new Date();
  }
  function closeMondayCalendar(){
    if(activeCalendar){ activeCalendar.remove(); activeCalendar=null; }
  }
  function openMondayCalendar(input){
    closeMondayCalendar();
    var selected=parseIso(input.value);
    var view=new Date(selected.getFullYear(),selected.getMonth(),1);
    var panel=document.createElement('div');
    panel.className='monday-calendar-popup';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','Choose date');
    document.body.appendChild(panel);
    activeCalendar=panel;
    function render(){
      var year=view.getFullYear(), month=view.getMonth();
      var first=new Date(year,month,1);
      var mondayOffset=(first.getDay()+6)%7;
      var gridStart=new Date(year,month,1-mondayOffset);
      var monthName=new Intl.DateTimeFormat('en-SG',{month:'long',year:'numeric'}).format(view);
      var days=['Mo','Tu','We','Th','Fr','Sa','Su'];
      var cells='';
      for(var i=0;i<42;i++){
        var d=new Date(gridStart.getFullYear(),gridStart.getMonth(),gridStart.getDate()+i);
        var other=d.getMonth()!==month;
        var selectedClass=isoDate(d)===input.value?' selected':'';
        var todayClass=isoDate(d)===isoDate(new Date())?' today':'';
        cells+='<button type="button" class="monday-calendar-day'+(other?' other-month':'')+selectedClass+todayClass+'" data-date="'+isoDate(d)+'">'+d.getDate()+'</button>';
      }
      panel.innerHTML='<div class="monday-calendar-head"><button type="button" data-cal-nav="prev" aria-label="Previous month">‹</button><strong>'+monthName+'</strong><button type="button" data-cal-nav="next" aria-label="Next month">›</button></div><div class="monday-calendar-weekdays">'+days.map(function(x){return '<span>'+x+'</span>';}).join('')+'</div><div class="monday-calendar-grid">'+cells+'</div><div class="monday-calendar-foot"><button type="button" data-cal-action="today">Today</button><button type="button" data-cal-action="clear">Clear</button></div>';
      panel.querySelector('[data-cal-nav="prev"]').onclick=function(e){e.stopPropagation();view=new Date(year,month-1,1);render();position();};
      panel.querySelector('[data-cal-nav="next"]').onclick=function(e){e.stopPropagation();view=new Date(year,month+1,1);render();position();};
      panel.querySelectorAll('.monday-calendar-day').forEach(function(btn){btn.onclick=function(e){e.stopPropagation();input.value=btn.dataset.date;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));closeMondayCalendar();};});
      panel.querySelector('[data-cal-action="today"]').onclick=function(e){e.stopPropagation();input.value=isoDate(new Date());input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));closeMondayCalendar();};
      panel.querySelector('[data-cal-action="clear"]').onclick=function(e){e.stopPropagation();input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));closeMondayCalendar();};
    }
    function position(){
      var r=input.getBoundingClientRect();
      var width=Math.min(320,window.innerWidth-20);
      panel.style.width=width+'px';
      var left=Math.max(10,Math.min(r.left,window.innerWidth-width-10));
      var top=r.bottom+8;
      if(top+panel.offsetHeight>window.innerHeight-10) top=Math.max(10,r.top-panel.offsetHeight-8);
      panel.style.left=left+'px';panel.style.top=top+'px';
    }
    render();position();
  }
  document.addEventListener('pointerdown',function(e){
    var input=e.target.closest&&e.target.closest('input[data-monday-picker]');
    if(input){e.preventDefault();openMondayCalendar(input);return;}
    if(activeCalendar&&!activeCalendar.contains(e.target)) closeMondayCalendar();
  });
  document.addEventListener('keydown',function(e){if(e.key==='Escape')closeMondayCalendar();});
  window.addEventListener('resize',closeMondayCalendar);
  window.addEventListener('scroll',closeMondayCalendar,true);
})();


/* LORD v1 canonical booking-management policy.
   Teachers may view or cancel their own BOOKED records, but may not edit them.
   Existing token links remain valid for read-only viewing and eligible cancellation.
   Administrative editing and cancellation remain in OVERLORD only. */
function humanBookingStatus(value){
  const map={BOOKED:'Booked',COLLECTED:'Collected',COMPLETED:'Completed',CANCELLED:'Cancelled'};
  return map[String(value||'').toUpperCase()]||String(value||'');
}

async function routeAfterAuthentication(){
  await restoreDraft();
  const params=new URLSearchParams(location.search);
  if(params.get('bookingId')&&params.get('token')){
    openLinkedBooking(params.get('bookingId'),params.get('token'));
    return;
  }
  renderLanding();
}

async function renderMyBookings(){
  renderLoading('Retrieving your bookings.');
  try{
    const response=await lordFetch(`${API.transaction}?action=myBookings`,{cache:'no-store'});
    const payload=await response.json();
    if(!response.ok||!payload.ok) throw new Error(payload.error||'Your bookings could not be loaded.');
    const bookings=payload.bookings||[];
    main.innerHTML=`<section class="card"><div class="section-title"><div><span class="step-kicker">Bookings</span><h2>Manage Bookings</h2><p>Bookings made under your verified GSPS account.</p></div></div><div class="notice info"><strong>Bookings cannot be edited.</strong> If any detail is wrong, cancel the booking and make a new booking.</div><div class="booking-list">${bookings.length?bookings.map(function(b){const canCancel=String(b.status).toUpperCase()==='BOOKED';return `<article class="session-card"><div class="session-card-details"><h3>${escapeHtml(b.resource)} · ${escapeHtml(b.date)}</h3><div class="session-meta"><span><strong>Periods:</strong> P${escapeHtml(b.startPeriod)} to P${escapeHtml(b.endPeriod)}</span><span><strong>Group:</strong> ${escapeHtml(b.classOrActivity)}</span><span><strong>Subject:</strong> ${escapeHtml(b.subject)}</span><span><strong>Status:</strong> ${escapeHtml(humanBookingStatus(b.status))}</span></div></div><div class="action-grid"><button class="secondary-button owner-view" data-id="${escapeAttr(b.bookingId)}">View</button>${canCancel?`<button class="danger-button owner-cancel" data-id="${escapeAttr(b.bookingId)}">Cancel</button>`:''}</div></article>`;}).join(''):'<div class="notice info">You have no bookings.</div>'}</div><div class="action-grid"><button class="ghost-button" id="backBtn">Back</button></div></section>`;
    document.getElementById('backBtn').onclick=renderLanding;
    document.querySelectorAll('.owner-view').forEach(function(btn){btn.onclick=function(){openOwnedBooking(btn.dataset.id);};});
    document.querySelectorAll('.owner-cancel').forEach(function(btn){btn.onclick=function(){cancelOwnedBooking(btn.dataset.id);};});
  }catch(error){renderErrorRetry(error.message,renderMyBookings);}
}

async function openOwnedBooking(bookingId){
  renderLoading('Loading booking.');
  try{
    const response=await lordFetch(`${API.transaction}?action=bookingGet&bookingId=${encodeURIComponent(bookingId)}&owner=true`,{cache:'no-store'});
    const payload=await response.json();
    if(!response.ok||!payload.ok) throw new Error(payload.error||'Booking could not be loaded.');
    renderBookingView(payload.booking,{source:'owner'});
  }catch(error){renderErrorRetry(error.message,renderMyBookings);}
}

async function openLinkedBooking(bookingId,token){
  renderLoading('Loading booking.');
  try{
    const response=await lordFetch(`${API.transaction}?action=bookingGet&bookingId=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(token)}`,{cache:'no-store'});
    const payload=await response.json();
    if(!response.ok||!payload.ok) throw new Error(payload.error||'Booking could not be loaded.');
    renderBookingView(payload.booking,{source:'token',token:token});
  }catch(error){renderErrorRetry(error.message,renderLanding);}
}

function renderBookingView(b,context){
  const canCancel=String(b.status).toUpperCase()==='BOOKED';
  const accessory=[b.headphones?`Headphones × ${b.requestedQuantity}`:'',b.styluses?`Styluses × ${b.requestedQuantity}`:''].filter(Boolean).join(', ')||'None';
  main.innerHTML=`<section class="card"><div class="section-title"><div><span class="step-kicker">Booking</span><h2>Booking Details</h2><p>This record is read-only.</p></div></div><div class="notice info"><strong>Bookings cannot be edited.</strong> If any detail is wrong, cancel the booking and make a new booking.</div><div class="session-meta"><span><strong>Booking ID:</strong> ${escapeHtml(b.bookingId)}</span><span><strong>Status:</strong> ${escapeHtml(humanBookingStatus(b.status))}</span><span><strong>Teacher:</strong> ${escapeHtml(b.teacher)}</span><span><strong>Resource:</strong> ${escapeHtml(b.resource)}</span><span><strong>Device type:</strong> ${escapeHtml(b.deviceType)}</span><span><strong>Quantity:</strong> ${escapeHtml(b.requestedQuantity)}</span><span><strong>Date:</strong> ${escapeHtml(b.date)}</span><span><strong>Periods:</strong> P${escapeHtml(b.startPeriod)} to P${escapeHtml(b.endPeriod)}</span><span><strong>Group:</strong> ${escapeHtml(b.classOrActivity)}</span><span><strong>Subject:</strong> ${escapeHtml(b.subject)}</span><span><strong>Accessories:</strong> ${escapeHtml(accessory)}</span><span><strong>Remarks:</strong> ${escapeHtml(b.remarks||'Nil')}</span></div><div class="action-grid"><button class="ghost-button" id="bookingViewBack">Back</button>${canCancel?'<button class="danger-button" id="bookingViewCancel">Cancel Booking</button>':''}</div></section>`;
  document.getElementById('bookingViewBack').onclick=context.source==='owner'?renderMyBookings:renderLanding;
  if(canCancel) document.getElementById('bookingViewCancel').onclick=function(){cancelOwnedBooking(b.bookingId,context);};
}

async function cancelOwnedBooking(bookingId,context){
  if(!confirm('Cancel this booking? The cart and periods will become available.')) return;
  renderLoading('Cancelling booking.');
  try{
    await postTransaction({action:'bookingCancel',bookingId:bookingId,editToken:context&&context.token?context.token:'',overrideReason:'User cancellation'});
    main.innerHTML=`<section class="card center-card"><div class="notice success"><strong>Booking cancelled</strong></div><p>The cart and periods are now available for another booking.</p><div class="action-grid"><button class="primary-button" id="cancelDoneBtn">View My Bookings</button><button class="secondary-button" id="cancelHomeBtn">Back to LORD</button></div></section>`;
    document.getElementById('cancelDoneBtn').onclick=renderMyBookings;
    document.getElementById('cancelHomeBtn').onclick=renderLanding;
  }catch(error){renderErrorRetry(error.message,function(){context&&context.token?openLinkedBooking(bookingId,context.token):openOwnedBooking(bookingId);});}
}

function showBookingOverlay(booking){
  closeBookingOverlay();
  const modal=document.createElement('div');
  modal.className='booking-overlay'; modal.id='bookingOverlay';
  modal.innerHTML=`<section class="booking-overlay-card"><button class="overlay-close" id="closeBookingOverlay" aria-label="Close">×</button><span class="step-kicker">Existing booking</span><h2>${escapeHtml(booking.resource)}</h2><div class="session-meta"><span><strong>Date:</strong> ${escapeHtml(booking.date)}</span><span><strong>Periods:</strong> P${escapeHtml(booking.startPeriod)} to P${escapeHtml(booking.endPeriod)}</span><span><strong>Teacher:</strong> ${escapeHtml(booking.teacher)}</span><span><strong>Group:</strong> ${escapeHtml(booking.classOrActivity||'')}</span><span><strong>Subject:</strong> ${escapeHtml(booking.subject||'')}</span></div><div class="notice info">Use Manage Bookings to view or cancel one of your own bookings.</div><div class="action-grid"><button class="secondary-button" id="overlayCloseBtn">Close</button></div></section>`;
  document.body.appendChild(modal);
  document.getElementById('closeBookingOverlay').onclick=closeBookingOverlay;
  document.getElementById('overlayCloseBtn').onclick=closeBookingOverlay;
  modal.onclick=function(e){if(e.target===modal)closeBookingOverlay();};
}

// Start after all network constants and authentication state are initialized.
init();
