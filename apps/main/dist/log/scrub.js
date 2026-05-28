/**
 * Secret-aware log scrubber.
 *
 * Production rule: nothing that looks like an API key, OAuth token,
 * Authorization header, or session cookie reaches stdout, electron-log
 * files, or any future telemetry pipeline. We accept some false positives
 * (truncating opaque base64-ish strings) in exchange for never leaking a
 * real secret because of a misplaced `console.log` in a retry loop.
 *
 * The scrubber is conservative: it operates on the stringified form of
 * every argument and only redacts well-known shapes. It does NOT try to
 * be a generic PII redactor.
 *
 * Patterns we redact:
 *   - `Authorization: Bearer <token>` and `Authorization: Basic <b64>`
 *   - `x-api-key: <token>` / `x-goog-api-key: <token>` / `api-key: <token>`
 *   - `?access_token=…` and `?api_key=…` in URLs (query + fragment)
 *   - Bare `sk-…` / `pk-…` (OpenAI), `xoxb-…` (Slack), `AIza…` (Google),
 *     `eyJ…` followed by another base64-ish chunk (JWT-ish), and any
 *     hex strings over 32 chars (which usually means an API key).
 *   - Anything inside a `password:` / `client_secret:` / `refresh_token:`
 *     pair, JSON or YAML-style.
 *
 * Tests live alongside in `scrub.test.ts`.
 */
const RULES = [
    // Authorization headers (header style + JSON style)
    {
        name: 'auth-bearer',
        re: /(authorization\s*[:=]\s*['"]?\s*)bearer\s+[A-Za-z0-9._\-]+(\.[A-Za-z0-9._\-]+){0,3}/gi,
        replace: '$1Bearer ***',
    },
    {
        name: 'auth-basic',
        re: /(authorization\s*[:=]\s*['"]?\s*)basic\s+[A-Za-z0-9+/=]+/gi,
        replace: '$1Basic ***',
    },
    // Generic API key headers. We accept an optional `"` between the key
    // and the separator so JSON shapes like `"x-api-key":"foo"` are caught.
    {
        name: 'x-api-key',
        re: /((?:x-api-key|x-goog-api-key|api-key|apikey|x-auth-token|x-functions-key)["']?\s*[:=]\s*["']?\s*)[^"',\s\r\n}]+/gi,
        replace: '$1***',
    },
    // OAuth + secret fields in JSON / YAML payloads. JSON keys are quoted, so
    // the optional `"` AFTER the field name is what lets us match.
    {
        name: 'token-pair',
        re: /(\b(?:access_token|refresh_token|id_token|client_secret|password|app_password|apikey|api_key|cookie)["']?\s*[:=]\s*["']?)[^"',\s\r\n}]+/gi,
        replace: '$1***',
    },
    // ?access_token= in URLs
    {
        name: 'url-access-token',
        re: /([?&](?:access_token|api_key|apikey|token|key)=)[^&#\s"']+/gi,
        replace: '$1***',
    },
    // Well-known prefixed tokens. ORDER MATTERS: longer / more specific
    // prefixes come first, otherwise the shorter `sk-` rule eats `sk-proj-…`
    // before the proj rule gets a chance.
    { name: 'openai-proj', re: /\bsk-proj-[A-Za-z0-9_\-]{16,}\b/g, replace: 'sk-proj-***' },
    { name: 'openai', re: /\bsk-[A-Za-z0-9_\-]{16,}\b/g, replace: 'sk-***' },
    { name: 'pk', re: /\bpk-[A-Za-z0-9_\-]{16,}\b/g, replace: 'pk-***' },
    { name: 'slack-bot', re: /\bxoxb-[A-Za-z0-9_\-]{16,}\b/g, replace: 'xoxb-***' },
    { name: 'slack-user', re: /\bxoxp-[A-Za-z0-9_\-]{16,}\b/g, replace: 'xoxp-***' },
    { name: 'google', re: /\bAIza[A-Za-z0-9_\-]{20,}\b/g, replace: 'AIza***' },
    // JWT-ish: three base64-url segments separated by dots, header almost
    // always starts with `eyJ` (the JSON `{"`).
    {
        name: 'jwt',
        re: /\beyJ[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}\.[A-Za-z0-9_\-]{4,}\b/g,
        replace: 'eyJ***.***.***',
    },
    // Long hex strings (32+ chars) — likely API keys, DB encryption keys.
    // We deliberately do NOT redact short hex (could be commit SHAs).
    { name: 'long-hex', re: /\b[a-fA-F0-9]{40,}\b/g, replace: '***hex***' },
];
export function scrubSecrets(input) {
    if (input === undefined)
        return 'undefined';
    if (input === null)
        return 'null';
    let str;
    if (input instanceof Error) {
        str = `${input.name}: ${input.message}${input.stack ? '\n' + input.stack : ''}`;
    }
    else if (typeof input === 'string') {
        str = input;
    }
    else {
        try {
            str = JSON.stringify(input);
        }
        catch {
            str = String(input);
        }
    }
    for (const rule of RULES) {
        str = str.replace(rule.re, rule.replace);
    }
    return str;
}
export function wrapLoggerWithScrub(logger) {
    const wrap = (method) => {
        const original = logger[method];
        if (typeof original !== 'function')
            return;
        logger[method] = (...args) => original.apply(logger, args.map((a) => scrubSecrets(a)));
    };
    ['info', 'warn', 'error', 'debug'].forEach(wrap);
    return logger;
}
/**
 * Replace `console.{log,info,warn,error,debug}` so that even libraries that
 * bypass our logger get scrubbed. Idempotent.
 *
 * Call this exactly once during main-process boot. Safe to call before
 * electron-log is configured.
 */
let consolePatched = false;
export function installConsoleScrubbing() {
    if (consolePatched)
        return;
    consolePatched = true;
    const methods = ['log', 'info', 'warn', 'error', 'debug', 'trace'];
    for (const m of methods) {
        const original = console[m];
        console[m] = (...args) => original.apply(console, args.map((a) => scrubSecrets(a)));
    }
}
//# sourceMappingURL=scrub.js.map