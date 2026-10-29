// Local workerd measurements. This observes the application isolate, excluding
// fixture generation and the separate D1/R2 service isolates.
import {performance} from 'node:perf_hooks';

export async function profileWorker(mf, name) {
  await mf.ready;
  const url = await mf.getInspectorURL();
  url.protocol = 'http:';
  url.pathname = '/json/list';
  const targets = await (await fetch(url)).json();
  const target = targets.find(row => row.id === 'core:user:' + name);
  if (!target) throw Error('Application isolate was not exposed by workerd');
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, {once: true});
    socket.addEventListener('error', reject, {once: true});
  });
  let sequence = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    const entry = pending.get(message.id);
    if (!entry) return;
    pending.delete(message.id);
    clearTimeout(entry.timer);
    message.error ? entry.reject(Error(JSON.stringify(message.error))) : entry.resolve(message.result);
  });
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error('Inspector command timed out: ' + method));
    }, 20000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id, method, params}));
  });
  await call('Profiler.enable');
  await call('Profiler.setSamplingInterval', {interval: 100});
  const measurements = [];
  let peakBytes = 0;
  const sample = async () => {
    const heap = await call('Runtime.getHeapUsage');
    const bytes = heap.usedSize + (heap.embedderHeapUsedSize || 0) + (heap.backingStorageSize || 0);
    peakBytes = Math.max(peakBytes, bytes);
    return bytes;
  };
  await sample();
  return {
    measurements,
    get peakBytes() { return peakBytes; },
    async measure(label, work) {
      await call('Profiler.start');
      let requestPeakBytes = await sample();
      const reads = new Set();
      const timer = setInterval(() => {
        const read = sample().then(bytes => { requestPeakBytes = Math.max(requestPeakBytes, bytes); });
        reads.add(read);
        read.catch(() => {}).finally(() => reads.delete(read));
      }, 5);
      const started = performance.now();
      let result, failure;
      try { result = await work(); } catch (error) { failure = error; }
      const wallMs = performance.now() - started;
      clearInterval(timer);
      await Promise.allSettled([...reads]);
      requestPeakBytes = Math.max(requestPeakBytes, await sample());
      const {profile} = await call('Profiler.stop');
      const idle = new Set(profile.nodes.filter(row => row.callFrame.functionName === '(idle)').map(row => row.id));
      const sampledActiveMs = profile.samples.reduce((sum, id, i) => sum + (idle.has(id) ? 0 : profile.timeDeltas[i] || 0), 0) / 1000;
      measurements.push({label, wallMs, sampledActiveMs, requestPeakBytes, samples: profile.samples.length});
      if (failure) throw failure;
      return result;
    },
    async close() {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(Error('Inspector closed'));
      }
      pending.clear();
      socket.close();
    }
  };
}
