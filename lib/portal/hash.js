import { createHash } from 'node:crypto';

export function contentHash(text) {
  return createHash('sha256').update(String(text || ''), 'utf8').digest('hex');
}
