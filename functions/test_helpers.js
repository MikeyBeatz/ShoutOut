import { createHash } from 'node:crypto';

// Deterministic request identities for fixed-clock emulator fixtures.
export function operationTestKey(label, now) {
  if (label.startsWith('op1_')) return label;
  return `op1_${Math.floor(now.getTime() / 1000)}_${createHash('sha256').update(label).digest('hex').slice(0, 32)}`;
}
