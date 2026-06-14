import DOMPurify from 'dompurify';
import { mailHtmlSanitiserConfig, sanitiseInlineStyle, SAFE_LINK_SCHEMES } from '@gingermail/core';

/**
 * Renderer-side mail HTML sanitiser. Wraps DOMPurify with the project-wide
 * allow-list from `@gingermail/core/mailHtml`, then layers a couple of
 * post-sanitisation hooks (style attribute filter, link rel/target rewrite)
 * that DOMPurify can't express declaratively.
 *
 * Returns a string that is safe to drop into an `iframe sandbox=""` `srcdoc`
 * attribute — `sandbox=""` already blocks scripting, top-level navigation,
 * forms, and same-origin access, but we still sanitise so users on browsers
 * with no iframe sandbox support (or future regressions) aren't exposed.
 */
/**
 * `allowRemoteImages` has to be read per-sanitisation rather than baked into
 * the hook (DOMPurify hooks are global). We stash the current call's flag
 * on this module-local var, set immediately before `sanitize()` and cleared
 * after. The `sanitiseMailHtml` API is sync so this isn't racy.
 */
let currentAllowRemoteImages = false;

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style') {
      data.attrValue = sanitiseInlineStyle(String(data.attrValue ?? ''));
      if (!data.attrValue) data.keepAttr = false;
      return;
    }
    if (data.attrName === 'href' || data.attrName === 'src') {
      const raw = String(data.attrValue ?? '').trim();
      // Reject empty values and protocol-relative URLs (which would resolve
      // against the data: URL host and silently break).
      if (!raw || raw.startsWith('//')) {
        data.keepAttr = false;
        return;
      }
      try {
        const url = new URL(raw, 'about:blank');
        if (!SAFE_LINK_SCHEMES.has(url.protocol)) {
          if (!(data.attrName === 'src' && url.protocol === 'data:')) {
            data.keepAttr = false;
            return;
          }
        }
        // Element-aware tightening: when the caller hasn't opted in to
        // remote images, drop http(s) src on <img>. <a href> stays.
        if (
          data.attrName === 'src' &&
          node.nodeName === 'IMG' &&
          !currentAllowRemoteImages &&
          (url.protocol === 'http:' || url.protocol === 'https:')
        ) {
          data.keepAttr = false;
        }
      } catch {
        // Allow obvious safe relative values like `cid:foo@bar` and
        // `data:image/png;base64,...` which the URL parser rejects above.
        if (!/^(?:cid:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(raw)) {
          data.keepAttr = false;
        }
      }
    }
  });

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A') {
      const el = node as HTMLAnchorElement;
      el.setAttribute('rel', 'noopener noreferrer nofollow');
      el.setAttribute('target', '_blank');
    }
  });
}

export interface SanitiseMailHtmlOptions {
  allowRemoteImages?: boolean;
}

export function sanitiseMailHtml(html: string, opts: SanitiseMailHtmlOptions = {}): string {
  installHooks();
  const cfg = mailHtmlSanitiserConfig({ allowRemoteImages: opts.allowRemoteImages });
  currentAllowRemoteImages = !!opts.allowRemoteImages;
  try {
    return DOMPurify.sanitize(html ?? '', {
      ...cfg,
      RETURN_TRUSTED_TYPE: false,
    }) as unknown as string;
  } finally {
    currentAllowRemoteImages = false;
  }
}
