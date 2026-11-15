/* Device-scoped collection photographs. Blob URLs never enter durable browser storage. */
(function () {
  'use strict';
  const MAX_IMAGES = 12, MAX_FETCHES = 3, MAX_BYTES = 2 * 1024 * 1024;
  const photos = new Map(), flights = new Map(), denied = new Set();
  let token = null, epoch = 0, allowed = new Set(), queue = [];
  const currentToken = () => sessionStorage.getItem('gsis-signage-device');
  const images = () => [...document.querySelectorAll('img[data-private-photo]')];
  function resetImage(image) {
    image.src = image.dataset.deviceSrc;
    image.alt = image.dataset.deviceAlt || 'Device';
    delete image.dataset.privatePhoto;
  }
  function forget(id) {
    for (const image of images()) if (image.dataset.privatePhoto === id) resetImage(image);
    const value = photos.get(id); if (value) URL.revokeObjectURL(value);
    photos.delete(id);
  }
  function clear() {
    epoch++; queue = []; allowed.clear(); denied.clear(); token = null;
    for (const controller of flights.values()) controller.abort();
    for (const id of [...photos.keys()]) forget(id);
    document.querySelectorAll('[data-signage-photo-control]').forEach(node => node.remove());
  }
  function display(id) {
    const url = photos.get(id); if (!url) return;
    for (const control of document.querySelectorAll('[data-signage-photo-control]')) {
      if (control.dataset.photoId !== id) continue;
      const card = control.closest('[data-booking-card]'), image = card?.querySelector('.tile-media img');
      if (!image) continue;
      image.dataset.deviceSrc ||= image.src;
      image.dataset.deviceAlt ||= image.alt;
      image.dataset.privatePhoto = id;
      image.src = url;
      image.alt = 'Collection photograph for ' + (control.dataset.resource || 'reserved equipment');
      image.style.objectFit = 'contain';
      control.textContent = control.dataset.label;
    }
  }
  function status(id, message) {
    for (const control of document.querySelectorAll('[data-signage-photo-control]'))
      if (control.dataset.photoId === id) control.textContent = message;
  }
  async function readBounded(response) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(response.headers.get('content-type')?.split(';')[0])) throw Error('Unsupported photo format.');
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try { for (;;) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > MAX_BYTES) { await reader.cancel(); throw Error('Photo exceeds its size limit.'); } chunks.push(next.value); } }
    finally { reader.releaseLock(); }
    return new Blob(chunks, {type: response.headers.get('content-type')});
  }
  function pump() {
    while (flights.size < MAX_FETCHES && queue.length) {
      const id = queue.shift(); if (!allowed.has(id) || denied.has(id) || flights.has(id) || photos.has(id) || !token) continue;
      const controller = new AbortController(), capturedEpoch = epoch, capturedToken = token;
      flights.set(id, controller);
      // This public device route deliberately omits the staff session and cannot fall back to an Admin photo route.
      fetch('/api/lord/board?photoId=' + encodeURIComponent(id), {headers: {'X-GSiS-Device-Token': capturedToken}, credentials: 'omit', cache: 'no-store', signal: controller.signal})
        .then(async response => {
          if (capturedEpoch !== epoch || capturedToken !== currentToken()) return;
          if (response.status === 401) { clear(); window.dispatchEvent(new CustomEvent('gsis:signage-access-ended')); return; }
          if (response.status === 403 || response.status === 404) {
            denied.add(id); for (const cached of [...photos.keys()]) forget(cached);
            status(id, 'Photo is not available to this display.');
            if (response.status === 404) window.dispatchEvent(new Event('online'));
            return;
          }
          if (!response.ok) throw Error('Photo is temporarily unavailable.');
          const blob = await readBounded(response);
          if (capturedEpoch !== epoch || capturedToken !== currentToken() || !allowed.has(id)) return;
          while (photos.size >= MAX_IMAGES) forget(photos.keys().next().value);
          photos.set(id, URL.createObjectURL(blob)); display(id);
        })
        .catch(error => { if (capturedEpoch === epoch && error.name !== 'AbortError') status(id, 'Photo unavailable · select to retry'); })
        .finally(() => { if (flights.get(id) === controller) flights.delete(id); pump(); });
    }
  }
  function ensure(id) {
    if (photos.has(id)) { const url = photos.get(id); photos.delete(id); photos.set(id, url); display(id); return; }
    if (denied.has(id) || flights.has(id) || queue.includes(id)) return;
    queue.push(id); pump();
  }
  function update(rows) {
    const nextToken = currentToken(); if (nextToken !== token) { clear(); token = nextToken; }
    if (!token) return;
    const byBooking = new Map(rows.filter(row => row.isOpen === true && Array.isArray(row.photoIds)).map(row => [row.bookingId, row]));
    allowed = new Set([...byBooking.values()].flatMap(row => row.photoIds.slice(0, 20)).filter(id => typeof id === 'string'));
    for (const id of [...photos.keys()]) if (!allowed.has(id)) forget(id);
    for (const [id, controller] of flights) if (!allowed.has(id)) controller.abort();
    queue = queue.filter(id => allowed.has(id));
    let automaticallyShown = 0;
    for (const card of document.querySelectorAll('[data-booking-card][data-gsis-booking]')) {
      const row = byBooking.get(card.dataset.gsisBooking), ids = row?.photoIds.filter(id => allowed.has(id)).slice(0, 20) || [];
      if (!ids.length) continue;
      let index = 0, control = card.querySelector('[data-signage-photo-control]');
      if (!control) { control = document.createElement('button'); control.type = 'button'; control.dataset.signagePhotoControl = ''; control.style.cssText = 'font:inherit;font-size:12px;padding:5px 8px;max-width:100%'; card.querySelector('.tile-media').after(control); }
      const select = () => { const id = ids[index]; control.dataset.photoId = id; control.dataset.resource = row.resource; control.dataset.label = ids.length > 1 ? 'Collection photo ' + (index + 1) + ' of ' + ids.length + ' · next' : 'Collection photo'; control.textContent = denied.has(id) ? 'Photo is not available to this display.' : control.dataset.label; ensure(id); };
      control.onclick = () => { if (photos.has(ids[index])) index = (index + 1) % ids.length; select(); };
      if (photos.has(ids[0]) || automaticallyShown < MAX_IMAGES) { automaticallyShown++; select(); }
      else { control.dataset.photoId = ids[0]; control.textContent = 'Show collection photo'; }
    }
  }
  window.addEventListener('gsis:clear-protected-state', clear);
  window.addEventListener('pagehide', clear);
  window.GSISV1SignagePhotos = {update, clear};
})();
