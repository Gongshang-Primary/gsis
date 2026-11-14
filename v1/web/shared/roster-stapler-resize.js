/* View sizing only: this extension never changes or saves timetable data. */
(() => {
  'use strict';
  let pitWidth = 310, listHeight = null;
  const installed = new WeakSet();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function separator(label, orientation, className) {
    const node = document.createElement('div');
    node.className = className;
    node.tabIndex = 0;
    node.setAttribute('role', 'separator');
    node.setAttribute('aria-label', label);
    node.setAttribute('aria-orientation', orientation);
    node.title = label;
    return node;
  }
  function drag(handle, apply) {
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      const start = {x:event.clientX,y:event.clientY};
      const update = apply(start);
      const controller = new AbortController();
      const options = {signal:controller.signal};
      window.addEventListener('pointermove', next => {
        if (!handle.isConnected) return controller.abort();
        update(next.clientX - start.x, next.clientY - start.y);
      }, options);
      window.addEventListener('pointerup', () => controller.abort(), options);
      window.addEventListener('pointercancel', () => controller.abort(), options);
      window.addEventListener('blur', () => controller.abort(), options);
    });
  }
  function install(workspace) {
    if (installed.has(workspace)) return;
    const left = workspace.querySelector('.planner-left');
    const pit = workspace.querySelector('.planner-pit');
    const cards = pit?.querySelector('[data-pit-cards]');
    if (!left || !pit || !cards) return;
    installed.add(workspace);
    const split = separator('Resize timetable and Card Pit width', 'vertical', 'v1-planner-pit-divider');
    left.after(split);
    const shell = document.createElement('div');
    shell.className = 'v1-planner-card-list';
    cards.before(shell);
    shell.append(cards);
    const corner = separator('Resize Card Pit card list width and height', 'horizontal', 'v1-planner-pit-corner');
    shell.append(corner);
    workspace.classList.add('v1-planner-resizable');
    const width = value => {
      const max = Math.max(220, Math.min(workspace.clientWidth - 320, workspace.clientWidth * .7));
      pitWidth = clamp(value, 220, max);
      workspace.style.setProperty('--v1-pit-width', pitWidth + 'px');
      split.setAttribute('aria-valuemin', '220');
      split.setAttribute('aria-valuemax', String(Math.round(max)));
      split.setAttribute('aria-valuenow', String(Math.round(pitWidth)));
      corner.setAttribute('aria-valuetext', `${Math.round(pitWidth)} pixels wide, ${Math.round(shell.getBoundingClientRect().height)} pixels high`);
    };
    const height = value => {
      const otherHeight = [...pit.children].filter(n => n !== shell).reduce((total,n) => total+n.getBoundingClientRect().height,0);
      const max = Math.max(100, pit.clientHeight - otherHeight - 40);
      listHeight = clamp(value, 100, max);
      shell.style.height = listHeight + 'px';
      shell.style.flex = '0 1 auto';
      corner.setAttribute('aria-valuemin', '100');
      corner.setAttribute('aria-valuemax', String(Math.round(max)));
      corner.setAttribute('aria-valuenow', String(Math.round(listHeight)));
      corner.setAttribute('aria-valuetext', `${Math.round(pitWidth)} pixels wide, ${Math.round(listHeight)} pixels high`);
    };
    width(pitWidth);
    if (listHeight !== null) height(listHeight);
    drag(split, () => {const initial=pitWidth;return x => width(initial-x);});
    drag(corner, () => {
      const initialHeight=shell.getBoundingClientRect().height,initialWidth=pitWidth;
      return (x,y) => {width(initialWidth+x);height(initialHeight+y);};
    });
    split.addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();width(pitWidth+(event.key==='ArrowLeft'?1:-1)*(event.shiftKey?50:10));
    });
    corner.addEventListener('keydown', event => {
      if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const step=event.shiftKey?50:10;
      if (event.key==='ArrowLeft'||event.key==='ArrowRight') width(pitWidth+(event.key==='ArrowRight'?step:-step));
      height(shell.getBoundingClientRect().height+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0));
    });
  }
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll('.planner-workspace').forEach(install);
  };
  new MutationObserver(() => {
    if (!queued) {queued=true;queueMicrotask(scan);}
  }).observe(document.body,{childList:true,subtree:true});
  scan();
})();
