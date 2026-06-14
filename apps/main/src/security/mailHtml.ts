/**
 * Main-process mail HTML sanitiser. Mirrors the renderer's
 * `sanitiseMailHtml.ts` but runs DOMPurify on top of a `jsdom` window because
 * the main process has no DOM of its own. Used by the print path and any
 * future server-side mail rendering (digest export, automated tests, etc.).
 *
 * Importantly: this is the ONLY HTML sanitiser allowed in the main process.
 * Don't introduce ad-hoc regex stripping anywhere else — that's how XSS
 * regressions slip in.
 */
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { mailHtmlSanitiserConfig, sanitiseInlineStyle, SAFE_LINK_SCHEMES } from '@gingermail/core';

let cachedPurify: ReturnType<typeof DOMPurify> | null = null;
let currentAllowRemoteImages = false;

function getPurify(): ReturnType<typeof DOMPurify> {
  if (cachedPurify) return cachedPurify;
  const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
  // `DOMPurify` accepts a Window-like object; jsdom's `window` is compatible.
  cachedPurify = DOMPurify(jsdom.window as unknown as Window & typeof globalThis);

  cachedPurify.addHook('uponSanitizeAttribute', (node, data) => {
    if (data.attrName === 'style') {
      data.attrValue = sanitiseInlineStyle(String(data.attrValue ?? ''));
      if (!data.attrValue) data.keepAttr = false;
      return;
    }
    if (data.attrName === 'href' || data.attrName === 'src') {
      const raw = String(data.attrValue ?? '').trim();
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
        if (
          data.attrName === 'src' &&
          node.nodeName === 'IMG' &&
          !currentAllowRemoteImages &&
          (url.protocol === 'http:' || url.protocol === 'https:')
        ) {
          data.keepAttr = false;
        }
      } catch {
        if (!/^(?:cid:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(raw)) {
          data.keepAttr = false;
        }
      }
    }
  });

  cachedPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.nodeName === 'A') {
      const el = node as unknown as { setAttribute: (k: string, v: string) => void };
      el.setAttribute('rel', 'noopener noreferrer nofollow');
      el.setAttribute('target', '_blank');
    }
  });

  return cachedPurify;
}

export interface SanitiseMailHtmlOptions {
  allowRemoteImages?: boolean;
}

export function sanitiseMailHtmlMain(html: string, opts: SanitiseMailHtmlOptions = {}): string {
  const purify = getPurify();
  const cfg = mailHtmlSanitiserConfig({ allowRemoteImages: opts.allowRemoteImages });
  currentAllowRemoteImages = !!opts.allowRemoteImages;
  try {
    return purify.sanitize(html ?? '', { ...cfg, RETURN_TRUSTED_TYPE: false }) as unknown as string;
  } finally {
    currentAllowRemoteImages = false;
  }
}
