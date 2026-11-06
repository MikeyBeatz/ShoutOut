import { beginIndexGc } from './feed_index_gc_store.js';
import { labIndexBinding } from './feed_index_paths.js';
export async function beginIndexGcLab(db, base, cell, options) {
  const binding = labIndexBinding(db, base?.id);
  if (base?.path !== binding.base.path) throw new Error('index-lab-emulator-only');
  return beginIndexGc(db, binding, cell, options);
}
