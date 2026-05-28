import { AI_VENDOR_HOSTS } from '@gingermail/core';
/**
 * Compute the set of hostnames the AI tier is currently allowed to reach.
 * Returns `[]` when AI is off (which means we block everything from the AI
 * partition).
 */
export function allowedAiHosts(settings) {
    if (settings.mode === 'off')
        return [];
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
            if (u.hostname)
                return Array.from(new Set([...vendorHosts, u.hostname]));
        }
        catch {
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
export function isUrlAllowedForAi(url, settings) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
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
    return ok ? { allowed: true } : { allowed: false, reason: `host-not-allowlisted:${parsed.hostname}` };
}
/**
 * Install the webRequest filter on a dedicated AI session. The caller is
 * expected to use this session for every cloud-AI fetch (currently routed
 * via the main process's default fetch, but the partition is here so we
 * can swap to a dedicated session in a follow-up without changing every
 * call-site).
 */
export function installAiEgressFilter(session, getSettings, onBlock) {
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
//# sourceMappingURL=aiEgress.js.map