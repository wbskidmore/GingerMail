/**
 * Main-process AI egress filter.
 *
 * Two complementary protections, both rooted in the principle that the
 * renderer should not be able to talk to anything other than the user's
 * configured AI vendor (or local Ollama):
 *
 *   1. A `session.webRequest.onBeforeRequest` filter on the AI session
 *      partition that BLOCKS any outbound HTTP/HTTPS request whose host
 *      isn't on the per-mode allowlist. Local mode → 127.0.0.1 only.
 *      Cloud → only the per-vendor host (api.openai.com etc.).
 *
 *   2. A pre-flight check at the call site (`packages/ai/CloudAiClient`)
 *      that verifies the configured `baseUrl` resolves to an allowlisted
 *      host BEFORE the request is built. This catches typos and prevents
 *      info-leakage via redirect-chasing.
 *
 * Why both: the webRequest filter is defense-in-depth (catches any future
 * sneaky path that bypasses our client), but it ALSO can't redact the
 * URL or body — by the time it fires, the credentials are already inside
 * the request. The call-site check stops the leak earlier.
 */
import type { Session } from 'electron';
import { AI_VENDOR_HOSTS, type AiSettings } from '@gingermail/core';

export interface EgressDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Compute the set of hostnames the AI tier is currently allowed to reach.
 * Returns `[]` when AI is off (which means we block everything from the AI
 * partition).
 */
export function allowedAiHosts(settings: AiSettings): string[] {
  if (settings.mode === 'off') return [];
  if (settings.mode === 'local') {
    // Bundled or external Ollama sidecar listens on the loopback only.
    return ['127.0.0.1', 'localhost'];
  }
  if (settings.mode === 'cloud' && settings.cloud) {
    const vendorHosts = AI_VENDOR_HOSTS[settings.cloud.vendor] ?? [];
    // Also allow the user's explicit baseUrl host, in case they pointed at
    // a self-hosted OpenAI-compatible proxy. We do NOT inherit anything
    // from the vendor's CDN tree — only the exact host they configured.
    try {
      const u = new URL(settings.cloud.baseUrl);
      if (u.hostname) return Array.from(new Set([...vendorHosts, u.hostname]));
    } catch {
      /* baseUrl malformed; fall through to vendor list only */
    }
    return vendorHosts;
  }
  return [];
}

/**
 * Decide whether a given outbound URL is allowed under the current AI
 * settings. Pure, easy to unit-test.
 */
export function isUrlAllowedForAi(url: string, settings: AiSettings): EgressDecision {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { allowed: false, reason: 'malformed-url' };
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { allowed: false, reason: `disallowed-protocol:${parsed.protocol}` };
  }
  if (settings.mode === 'local' && parsed.protocol === 'http:') {
    // Localhost is the only place plain http is acceptable (Ollama).
    if (parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      return { allowed: false, reason: 'http-disallowed-off-loopback' };
    }
  }
  if (settings.mode === 'cloud' && parsed.protocol !== 'https:') {
    return { allowed: false, reason: 'cloud-must-be-https' };
  }
  const hosts = allowedAiHosts(settings);
  if (hosts.length === 0) {
    return { allowed: false, reason: 'ai-mode-off' };
  }
  const ok = hosts.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  return ok
    ? { allowed: true }
    : { allowed: false, reason: `host-not-allowlisted:${parsed.hostname}` };
}

/**
 * Install the webRequest filter on a dedicated AI session. The caller is
 * expected to use this session for every cloud-AI fetch (currently routed
 * via the main process's default fetch, but the partition is here so we
 * can swap to a dedicated session in a follow-up without changing every
 * call-site).
 */
export function installAiEgressFilter(
  session: Session,
  getSettings: () => AiSettings,
  onBlock?: (info: { url: string; reason: string }) => void,
): void {
  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const settings = getSettings();
    const decision = isUrlAllowedForAi(details.url, settings);
    if (decision.allowed) {
      callback({ cancel: false });
      return;
    }
    onBlock?.({ url: details.url, reason: decision.reason ?? 'unknown' });
    callback({ cancel: true });
  });
}
