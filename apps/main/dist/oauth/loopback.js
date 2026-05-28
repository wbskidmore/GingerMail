import { createServer } from 'node:http';
import { shell } from '../electronShim.js';
/**
 * Localhost OAuth callback receiver.
 *
 * Hardening rules (all enforced here, not in the per-provider flow):
 *   - Binds 127.0.0.1 only (never 0.0.0.0).
 *   - Only honours requests whose path is exactly `/callback`. Anything else
 *     (favicon scan, browser pre-render, attacker probe) gets 404.
 *   - Requires the `state` param to match the expected nonce. Mismatch =>
 *     400 + reject(); we never forward the code to the token exchange.
 *   - Refuses to forward `code` more than once (one-shot listener).
 *   - Success page uses history.replaceState to scrub `?code=…&state=…` out
 *     of the user's browser URL bar (and history) immediately on load.
 */
export async function runLoopbackOAuth(opts) {
    return new Promise((resolve, reject) => {
        let resolved = false;
        const finish = (ok) => {
            if (resolved)
                return;
            resolved = true;
            ok();
        };
        const server = createServer((req, res) => {
            if (!req.url) {
                res.statusCode = 400;
                res.end('Missing URL');
                return;
            }
            const port = server.address().port;
            const url = new URL(req.url, `http://127.0.0.1:${port}`);
            if (url.pathname !== '/callback') {
                res.statusCode = 404;
                res.end('Not found');
                return;
            }
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            const error = url.searchParams.get('error');
            res.setHeader('content-type', 'text/html; charset=utf-8');
            res.setHeader('referrer-policy', 'no-referrer');
            res.setHeader('cache-control', 'no-store');
            if (error) {
                res.statusCode = 400;
                res.end(`<h1>Sign-in failed</h1><p>${escapeHtml(error)}</p>`);
                finish(() => {
                    server.close();
                    reject(new Error(`OAuth error: ${error}`));
                });
                return;
            }
            if (!code) {
                res.statusCode = 400;
                res.end('Missing code');
                return;
            }
            if (opts.expectedState !== undefined && state !== opts.expectedState) {
                res.statusCode = 400;
                res.end('<h1>Sign-in failed</h1><p>State mismatch. Refusing to continue.</p>');
                finish(() => {
                    server.close();
                    reject(new Error('OAuth state mismatch (CSRF guard tripped)'));
                });
                return;
            }
            res.end(opts.successHtml ?? defaultSuccessHtml());
            finish(() => {
                server.close();
                resolve({ code, state: state ?? undefined, port });
            });
        });
        server.listen(0, '127.0.0.1', () => {
            const addr = server.address();
            const redirect = `http://127.0.0.1:${addr.port}/callback`;
            Promise.resolve(opts.buildAuthUrl(redirect))
                .then((authUrl) => shell.openExternal(authUrl))
                .catch((err) => {
                finish(() => {
                    server.close();
                    reject(err);
                });
            });
        });
        if (opts.timeoutMs) {
            setTimeout(() => {
                finish(() => {
                    server.close();
                    reject(new Error('OAuth timed out'));
                });
            }, opts.timeoutMs);
        }
    });
}
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}
function defaultSuccessHtml() {
    // The inline script scrubs `?code=…&state=…` from the URL bar so the
    // auth code doesn't sit in the browser's URL history forever. It's a
    // best-effort hardening; servers that drop the script tag still get the
    // plain confirmation message.
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>Signed in to GingerMail</title></head>
<body style="font-family:system-ui;text-align:center;margin-top:6rem">
<h1>Signed in to GingerMail</h1>
<p>You can close this tab.</p>
<script>try{history.replaceState({},'',location.pathname);}catch(e){}</script>
</body></html>`;
}
//# sourceMappingURL=loopback.js.map