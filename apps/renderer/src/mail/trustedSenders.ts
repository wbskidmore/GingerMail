/**
 * Per-sender "trust this sender for remote images" allow-list. Stored in
 * `localStorage` because it's a UI preference scoped to this client, not
 * sensitive data. Key namespace `gm.trusted-img:` makes the entries trivial
 * to inspect and wipe.
 */
const PREFIX = 'gm.trusted-img:';

function norm(email: string): string {
  return email.trim().toLowerCase();
}

export function isSenderTrusted(email: string | undefined): boolean {
  if (!email) return false;
  try {
    return window.localStorage.getItem(PREFIX + norm(email)) === '1';
  } catch {
    return false;
  }
}

export function trustSender(email: string | undefined): void {
  if (!email) return;
  try {
    window.localStorage.setItem(PREFIX + norm(email), '1');
  } catch {
    /* localStorage unavailable; fall back to in-memory only. */
  }
}

export function distrustSender(email: string | undefined): void {
  if (!email) return;
  try {
    window.localStorage.removeItem(PREFIX + norm(email));
  } catch {
    /* ignore */
  }
}
