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
import { type AiSettings } from '@gingermail/core';
export interface EgressDecision {
    allowed: boolean;
    reason?: string;
}
/**
 * Compute the set of hostnames the AI tier is currently allowed to reach.
 * Returns `[]` when AI is off (which means we block everything from the AI
 * partition).
 */
export declare function allowedAiHosts(settings: AiSettings): string[];
/**
 * Decide whether a given outbound URL is allowed under the current AI
 * settings. Pure, easy to unit-test.
 */
export declare function isUrlAllowedForAi(url: string, settings: AiSettings): EgressDecision;
/**
 * Install the webRequest filter on a dedicated AI session. The caller is
 * expected to use this session for every cloud-AI fetch (currently routed
 * via the main process's default fetch, but the partition is here so we
 * can swap to a dedicated session in a follow-up without changing every
 * call-site).
 */
export declare function installAiEgressFilter(session: Session, getSettings: () => AiSettings, onBlock?: (info: {
    url: string;
    reason: string;
}) => void): void;
//# sourceMappingURL=aiEgress.d.ts.map