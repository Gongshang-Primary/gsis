// Overlapping, identical reads may share one origin request. No settled data is
// cached here. This is an isolate optimisation, never a distributed lock.
const gsisReadFlights = new Map();
function gsisClearReadFlights() { gsisReadFlights.clear(); }
async function gsisCoalescedRead(scope, load) {
 const key = JSON.stringify(scope);
 const existing = gsisReadFlights.get(key);
 if (existing) return { value: structuredClone(await existing), joined: true };
 // Do not retain unbounded user input while an origin is slow.
 if (key.length > 24000 || gsisReadFlights.size >= 64) return { value: await load(), joined: false };
 const pending = Promise.resolve().then(load);
 gsisReadFlights.set(key, pending);
 try { return { value: structuredClone(await pending), joined: false }; }
 finally { if (gsisReadFlights.get(key) === pending) gsisReadFlights.delete(key); }
}
