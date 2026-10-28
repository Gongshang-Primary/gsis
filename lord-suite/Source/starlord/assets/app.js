/* STARLORD v0.9.7 — MacBook device artwork */
(function () {
  const config = {
    refreshMs: 60000,
    stripDwellMs: 7000,
    stripAnimMs: 1100,
    minZoom: 0.4,
    requestTimeoutMs: 55000,
    retryMs: [15000, 30000, 60000]
  };
  const elements = {
    currentDayLabel: document.getElementById('currentDayLabel'),
    currentDateTime: document.getElementById('currentDateTime'),
    pastStrip: document.getElementById('pastStrip'),
    activeGrid: document.getElementById('activeGrid'),
    boardMain: document.getElementById('boardMain'),
    feedStatus: document.getElementById('feedStatus'),
    // Shared data refresh is an administrator setting in OVERLORD.
  };

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const CACHE_KEY = 'starlord_board_last_good_v1_3';
  let boardData = [];
  let lastRenderMinute = -1;
  let lastSuccessfulAt = 0;
  let lastSuccessfulDate = '';
  let retryIndex = 0;
  let refreshTimer = null;
  let fetchInFlight = false;
  let loadGeneration = 0;
  let activeController = null;
  let manualReload = false;
  let pendingReload = false;
  let currentDateKey = isoDate(new Date());

  // Horizontal auto-scroll state (past strip)
  let stripTimer = null;
  let stripDirection = 1;
  let stripAnimFrame = null;

  function start() {
    restoreLastGood();
    tickClock();
    loadBoard();
    setInterval(tickClock, 1000);
    window.addEventListener('online', () => { setFeedStatus('Reconnected · updating…', true); scheduleLoad(0); });
    window.addEventListener('offline', () => setFeedStatus(lastSuccessfulAt ? `Offline · last updated ${formatTime(lastSuccessfulAt)}` : 'Offline', true));
    window.addEventListener('resize', debounce(() => {
      fitBoard();
      rebuildStripScroll();
    }, 250));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stopStripScroll();
        if(refreshTimer)clearTimeout(refreshTimer);
        refreshTimer=null;
      } else {
        rebuildStripScroll();
        if(pendingReload){pendingReload=false;loadBoard(true);}else scheduleLoad(0);
      }
    });
  }

  function scheduleLoad(delay) {
    if (refreshTimer) clearTimeout(refreshTimer);
    if(document.hidden){refreshTimer=null;return;}
    refreshTimer = setTimeout(loadBoard, Math.max(0, Number(delay) || 0));
  }

  function formatTime(epoch) {
    return new Date(epoch).toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  function setFeedStatus(message, stale) {
    if (!elements.feedStatus) return;
    elements.feedStatus.textContent = message || '';
    elements.feedStatus.classList.toggle('stale', Boolean(stale));
  }

  function saveLastGood(payload, rows) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), date: payload.date || isoDate(new Date()), rows }));
    } catch (error) {
      console.warn('STARLORD cache write failed:', error);
    }
  }

  function restoreLastGood() {
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (!cached || !Array.isArray(cached.rows)) return;
      boardData = cached.rows;
      lastSuccessfulAt = Number(cached.savedAt) || 0;
      lastSuccessfulDate = String(cached.date || '');
      if (boardData.length) renderBoard(boardData);
      const today = isoDate(new Date());
      const previousDay = lastSuccessfulDate && lastSuccessfulDate !== today;
      setFeedStatus(previousDay ? `Previous-day data · reconnecting…` : `Cached · last updated ${formatTime(lastSuccessfulAt)}`, true);
    } catch (error) {
      console.warn('STARLORD cache restore failed:', error);
    }
  }

  function tickClock() {
    const now = new Date();
    const weekday = now.toLocaleDateString('en-SG', { weekday: 'long' });
    const date = now.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
    const time = now.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: false });
    elements.currentDayLabel.textContent = weekday;
    elements.currentDateTime.textContent = `${date}, ${time}`;

    const dateKey = isoDate(now);
    if (dateKey !== currentDateKey) {
      currentDateKey = dateKey;
      setFeedStatus(lastSuccessfulDate && lastSuccessfulDate !== dateKey ? 'Previous-day data · updating…' : 'Updating…', true);
      scheduleLoad(0);
    }

    // Re-render only when the minute changes so statuses stay fresh.
    const minute = now.getHours() * 60 + now.getMinutes();
    if (boardData.length && minute !== lastRenderMinute) {
      lastRenderMinute = minute;
      renderBoard(boardData);
    }
  }

  async function loadBoard(forceRefresh = false) {
    if (document.hidden || manualReload) return;
    if (fetchInFlight) {
      if(forceRefresh){pendingReload=true;setFeedStatus('Waiting for the current update before reloading from Sheets…',false);}
      return;
    }
    const generation = ++loadGeneration;
    if (activeController) activeController.abort();
    if (refreshTimer) clearTimeout(refreshTimer);
    fetchInFlight = true;
    const controller = new AbortController();
    activeController = controller;
    if (forceRefresh) {
      manualReload = true;
      setFeedStatus('Reading the latest data from Sheets…', false);
    }
    const timeout = setTimeout(() => controller.abort(), forceRefresh ? 55000 : Number(config.requestTimeoutMs) || 55000);
    try {
      const requestedDate = isoDate(new Date());
      const response = await fetch(`/api/board?date=${encodeURIComponent(requestedDate)}${forceRefresh ? '&forceRefresh=1' : ''}`, {
        cache: 'no-store',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal
      });
      let payload;
      try { payload = await response.json(); }
      catch { const error=new Error('Invalid booking response'); error.code='BOARD_INVALID_JSON'; throw error; }
      if (!response.ok || !payload || payload.ok !== true) {
        const error=new Error('The booking feed is unavailable.');
        // Only our fixed diagnostic codes reach the display; never echo an
        // upstream error body, deployment URL or credential.
        const allowed=['BOARD_UPSTREAM_HTTP','BOARD_INVALID_JSON','BOARD_BACKEND_REJECTED','BOARD_INVALID_FEED','BOARD_BACKEND_VERSION','BOARD_TIMEOUT','BOARD_NETWORK'];
        error.code=payload && allowed.includes(payload.code)?payload.code:`HTTP_${response.status}`;
        throw error;
      }
      if (generation !== loadGeneration) return;
      if (!payload || payload.ok !== true) throw new Error(payload && payload.error ? payload.error : 'Invalid response');
      if (forceRefresh && payload.cacheReloaded !== true) throw new Error('Reload requires the current LORD backend.');
      const rows = normalisePayload(payload);
      boardData = rows;
      lastSuccessfulAt = Date.now();
      lastSuccessfulDate = String(payload.date || requestedDate);
      retryIndex = 0;
      lastRenderMinute = new Date().getHours() * 60 + new Date().getMinutes();
      saveLastGood(payload, rows);
      renderBoard(rows);
      setFeedStatus(`${forceRefresh ? 'Reloaded from Sheets' : 'Updated'} ${formatTime(lastSuccessfulAt)}`, false);
      scheduleLoad(Number(config.refreshMs) || 60000);
    } catch (error) {
      if (generation !== loadGeneration) return;
      console.error(error);
      const delays = Array.isArray(config.retryMs) && config.retryMs.length ? config.retryMs : [15000, 30000, 60000];
      const delay = delays[Math.min(retryIndex, delays.length - 1)];
      retryIndex = Math.min(retryIndex + 1, delays.length - 1);
      if (boardData.length || lastSuccessfulAt) {
        const previousDay = lastSuccessfulDate && lastSuccessfulDate !== isoDate(new Date());
        setFeedStatus(previousDay ? `Previous-day data · live update delayed` : `Live update delayed · last updated ${formatTime(lastSuccessfulAt)}`, true);
        renderBoard(boardData);
      } else {
        stopStripScroll();
        elements.pastStrip.innerHTML = '<div class="empty-past">No cached bookings available.</div>';
        elements.activeGrid.innerHTML = '<article class="error-card">Unable to load live bookings. Retrying automatically…</article>';
        const diagnostic=error && error.code?error.code:error && error.name==='AbortError'?'BOARD_TIMEOUT':'BOARD_NETWORK';
        setFeedStatus(`Live connection unavailable (${diagnostic})`, true);
        fitBoard();
      }
      if (forceRefresh) setFeedStatus(lastSuccessfulAt ? `Reload failed · last working data kept (${formatTime(lastSuccessfulAt)})` : 'Reload failed · no saved data available', true);
      scheduleLoad(delay);
    } finally {
      clearTimeout(timeout);
      if (generation === loadGeneration) {
        fetchInFlight = false;
        activeController = null;
        manualReload = false;
        if(pendingReload && !document.hidden){pendingReload=false;return loadBoard(true);}
      }
    }
  }

  function combineDateAndDisplayTime(baseDate, timeText) {
    const match = String(timeText).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    let hours = 0;
    let minutes = 0;
    if (match) {
      hours = Number(match[1]) % 12;
      minutes = Number(match[2]);
      if (match[3].toUpperCase() === 'PM') hours += 12;
    }
    return new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), hours, minutes, 0, 0);
  }

  function normalisePayload(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.bookings)) return payload.bookings;
    return [];
  }

  function renderBoard(rows) {
    const now = Date.now();
    const enriched = rows
      .map((row) => enrichRow(row, now))
      .sort((a, b) => (a.epochStart || 0) - (b.epochStart || 0) || a.teacherStatutoryName.localeCompare(b.teacherStatutoryName));

    const pastRows = enriched.filter((row) => row.displayState === 'grey');
    const activeRows = enriched.filter((row) => row.displayState !== 'grey');

    renderPastStrip(pastRows);
    renderActiveGrid(activeRows);
    fitBoard();
    rebuildStripScroll();
  }

  function normaliseMovementState(row) {
    const raw = String(
      row.movementState || row.movementStatus || row.sessionStatus || row.actualStatus || ''
    ).trim().toUpperCase().replace(/[\s-]+/g, '_');
    const returned = Boolean(row.returnTimestamp || row.returnMs) ||
      ['RETURNED', 'RETURNED_WITH_ISSUE', 'RETURNED_WITH_ISSUES', 'COMPLETED', 'CLOSED'].includes(raw);
    const open = row.isOpen === true ||
      ['OPEN', 'ACTIVE', 'GRACE', 'OVERDUE', 'COLLECTED', 'LATE'].includes(raw);
    return { raw, returned, open };
  }

  function enrichRow(row, now) {
    const startEpoch = Number(row.epochStart) || inferEpoch(row.startTime, 0);
    const endEpoch = Number(row.epochEnd) || inferEpoch(row.endTime, 1);
    const movement = normaliseMovementState(row);
    const graceEnd = endEpoch + 30 * 60 * 1000;

    let displayState;
    if (movement.open && now > graceEnd) {
      displayState = 'late';
    } else if (movement.open) {
      displayState = 'collected';
    } else if (movement.returned || now > endEpoch) {
      displayState = 'grey';
    } else if (now >= startEpoch && now <= endEpoch) {
      displayState = 'now';
    } else {
      displayState = 'upcoming';
    }

    const accessories = row.accessories && row.accessories !== 'None' ? row.accessories : '';
    return {
      ...row,
      epochStart: startEpoch,
      epochEnd: endEpoch,
      displayState,
      accessoriesText: accessories,
      teacherStatutoryName: row.teacherStatutoryName || row.teacher || row.teacherTtbName || 'Staff member',
      classOrActivity: row.classOrActivity || '—',
      subject: row.subject || '—',
      startTime: row.startTime || '—',
      endTime: row.endTime || '—',
      requestedQuantity: row.requestedQuantity ?? row.qty ?? '—',
      resource: row.resource || row.cartDesignation || '—',
      deviceType: row.deviceType || 'Device',
      deviceImage: resolveDeviceImage(row.deviceType)
    };
  }

  function inferEpoch(displayTime, endBiasHours) {
    const base = new Date();
    const dt = combineDateAndDisplayTime(base, displayTime || '12:00 AM');
    if (endBiasHours && /12:00 AM/i.test(displayTime || '')) dt.setHours(dt.getHours() + 24);
    return dt.getTime();
  }

  function resolveDeviceImage(deviceType) {
    const text = String(deviceType || '').toLowerCase();
    if (/mac[\s-]*book/.test(text)) return 'assets/device-mbn.webp';
    if (text.includes('ipad')) return 'assets/device-ipad.webp';
    if (text.includes('laptop') || text.includes('notebook') || text.includes('windows') || /\bhp\b/.test(text)) return 'assets/device-laptop.jpg';
    return 'assets/device-android.webp';
  }

  function renderPastStrip(rows) {
    if (!rows.length) {
      elements.pastStrip.innerHTML = '<div class="empty-past">No past or returned bookings yet.</div>';
      return;
    }

    elements.pastStrip.innerHTML = rows.map((row) => `
      <article class="past-card" aria-label="Past or returned booking for ${escapeHtml(row.teacherStatutoryName)}">
        <img src="${row.deviceImage}" alt="${escapeHtml(row.deviceType)}" />
        <div>
          <div class="mini-title">${escapeHtml(row.teacherStatutoryName)}</div>
          <div class="mini-meta">${escapeHtml(row.classOrActivity)} · ${escapeHtml(row.resource)} · ${escapeHtml(row.startTime)}–${escapeHtml(row.endTime)}</div>
        </div>
      </article>
    `).join('');
  }

  function renderActiveGrid(rows) {
    if (!rows.length) {
      elements.activeGrid.innerHTML = '<article class="empty-card">No active or upcoming bookings for today.</article>';
      return;
    }

    const labels = {
      upcoming: 'Upcoming',
      now: 'Now',
      collected: 'Collected',
      late: 'Late'
    };

    elements.activeGrid.innerHTML = rows.map((row) => {
      const tileClass = row.displayState;
      const badgeLabel = labels[tileClass] || 'Upcoming';
      const addRow = row.accessoriesText
        ? `<div class="add-row">Add: ${escapeHtml(row.accessoriesText)}</div>`
        : '';
      return `
        <article class="tile ${tileClass}" data-booking-card>
          <div class="tile-media">
            <img src="${row.deviceImage}" alt="${escapeHtml(row.deviceType)}" />
            <span class="badge ${tileClass}">${badgeLabel}</span>
          </div>
          <div class="tile-body">
            <div class="teacher">${escapeHtml(row.teacherStatutoryName)}</div>
            <div class="pair-row">
              <span class="pair"><span class="k">Class</span>${escapeHtml(row.classOrActivity)}</span>
              <span class="pair"><span class="k">Sub</span>${escapeHtml(row.subject)}</span>
            </div>
            <div class="cart-row">
              <span class="cart-chip">${escapeHtml(row.resource)}</span>
              <span class="device">${escapeHtml(row.deviceType)}</span>
            </div>
            <div class="pair-row">
              <span class="pair"><span class="k">Time</span>${escapeHtml(row.startTime)} – ${escapeHtml(row.endTime)}</span>
              <span class="pair"><span class="k">Qty</span>${escapeHtml(String(row.requestedQuantity))}</span>
            </div>
            ${addRow}
          </div>
        </article>
      `;
    }).join('');
  }

  /* ── Auto-fit: zoom the board so everything fits the window ────
     Iterates because zoom changes the effective width, which can
     re-flow the grid into more columns and change the height. */
  function fitBoard() {
    const main = elements.boardMain;
    if (!main) return;

    main.style.zoom = '1';
    const shell = document.querySelector('.sticky-shell');
    const shellHeight = shell ? shell.getBoundingClientRect().height : 0;
    const available = window.innerHeight - shellHeight;
    if (available <= 60) return;

    let zoom = 1;
    const minZoom = Number(config.minZoom) || 0.4;

    for (let i = 0; i < 10; i++) {
      const height = main.getBoundingClientRect().height; // visual px under current zoom
      if (height <= available) {
        // Fits. If shrunk earlier and there is big slack, grow back a little.
        if (zoom < 1 && height < available * 0.88) {
          zoom = Math.min(1, zoom * (available / height) * 0.96);
          main.style.zoom = String(zoom);
          continue;
        }
        break;
      }
      if (zoom <= minZoom) break;
      zoom = Math.max(minZoom, zoom * (available / height) * 0.97);
      main.style.zoom = String(zoom);
    }

    // If even minimum zoom cannot fit (an extreme day), allow scrolling.
    const finalHeight = main.getBoundingClientRect().height;
    document.body.classList.toggle('allow-scroll', finalHeight > available + 4);
  }

  /* ── Eased motion for the past strip ──────────────────────────── */
  function easeInOutBack(t) {
    const c1 = 0.7;
    const c2 = c1 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c2 + 1) * 2 * t - c2)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2;
  }

  function animateStripScroll(strip, targetLeft) {
    if (stripAnimFrame) cancelAnimationFrame(stripAnimFrame);
    const startLeft = strip.scrollLeft;
    const delta = targetLeft - startLeft;
    if (Math.abs(delta) < 2) return;
    if (reducedMotion) {
      strip.scrollLeft = targetLeft;
      return;
    }
    const duration = Number(config.stripAnimMs) || 1100;
    const startTime = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - startTime) / duration);
      strip.scrollLeft = startLeft + delta * easeInOutBack(p);
      if (p < 1) stripAnimFrame = requestAnimationFrame(step);
      else stripAnimFrame = null;
    };
    stripAnimFrame = requestAnimationFrame(step);
  }

  /* ── Horizontal auto-scroll (past strip) ───────────────────────
     Steps by a whole number of past cards that fit in view.
     Ping-pongs. Only runs when the strip overflows. */
  function rebuildStripScroll() {
    stopStripScroll();
    const strip = elements.pastStrip;
    const firstCard = strip.querySelector('.past-card');
    if (!firstCard) return;

    const overflow = strip.scrollWidth - strip.clientWidth;
    if (overflow <= 10) return;

    const gap = 8;
    const cardWidth = firstCard.getBoundingClientRect().width + gap;
    const tilesFit = Math.max(1, Math.floor(strip.clientWidth / cardWidth));
    const step = tilesFit * cardWidth;
    const dwellMs = Number(config.stripDwellMs) || 7000;

    const cycle = () => {
      if (document.hidden) return;
      const maxLeft = strip.scrollWidth - strip.clientWidth;
      let next = strip.scrollLeft + step * stripDirection;

      if (next >= maxLeft) {
        next = maxLeft;
        stripDirection = -1;
      } else if (next <= 0) {
        next = 0;
        stripDirection = 1;
      }

      animateStripScroll(strip, next);
      stripTimer = setTimeout(cycle, dwellMs);
    };

    stripTimer = setTimeout(cycle, dwellMs);
  }

  function stopStripScroll() {
    if (stripTimer) {
      clearTimeout(stripTimer);
      stripTimer = null;
    }
    if (stripAnimFrame) {
      cancelAnimationFrame(stripAnimFrame);
      stripAnimFrame = null;
    }
  }

  function isoDate(date) {
    // Local calendar date, not UTC. toISOString() would report yesterday
    // before 8:00 AM in Singapore (UTC+8).
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function escapeHtml(text) {
    return String(text ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function debounce(fn, ms) {
    let timer = null;
    return function () {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, arguments), ms);
    };
  }

  start();
})();
