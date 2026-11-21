// Observed SDK document reads, including transaction retries. Not billed index
// entries, Rules evaluation or network transfer. No payloads are logged.
export function measureNewsReads(raw) {
  let reads = 0;
  const note = value => { reads += Array.isArray(value) ? value.length : Array.isArray(value.docs) ? Math.max(1, value.docs.length) : 1; return value; };
  const db = new Proxy(raw, { get(target, key) {
    if (key === 'runTransaction') return (run, ...options) => target.runTransaction(real => run(new Proxy(real, { get(tx, name) {
      if (['get', 'getAll'].includes(name)) return async (...args) => note(await tx[name](...args));
      return typeof tx[name] === 'function' ? tx[name].bind(tx) : tx[name];
    } })), ...options);
    if (key === 'getAll') return async (...args) => note(await target.getAll(...args));
    return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
  } });
  return { db, get reads() { return reads; } };
}
