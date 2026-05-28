/**
 * Tests for the shared mailHtml allow-list helpers. These are pure functions
 * so we can run them without any DOM dependency — the renderer-side
 * sanitiser test exercises the full DOMPurify wiring.
 */
import { describe, it, expect } from 'vitest';
import {
  mailHtmlSanitiserConfig,
  sanitiseInlineStyle,
  SAFE_LINK_SCHEMES,
  DISALLOWED_STYLE_FRAGMENTS,
} from './mailHtml.js';

describe('mailHtmlSanitiserConfig', () => {
  it('always allows https, cid, and mailto schemes', () => {
    for (const allow of [true, false]) {
      const cfg = mailHtmlSanitiserConfig({ allowRemoteImages: allow });
      // https stays allowed at the regex level so <a href="https://..."> works
      // even when remote images are blocked; the renderer-side hook is what
      // strips remote <img src> when `allowRemoteImages` is false.
      expect(cfg.ALLOWED_URI_REGEXP.test('https://x.com/p.png')).toBe(true);
      expect(cfg.ALLOWED_URI_REGEXP.test('cid:foo@bar')).toBe(true);
      expect(cfg.ALLOWED_URI_REGEXP.test('mailto:a@b.com')).toBe(true);
    }
  });

  it('never allows javascript: or file: regardless of mode', () => {
    for (const allow of [true, false]) {
      const cfg = mailHtmlSanitiserConfig({ allowRemoteImages: allow });
      expect(cfg.ALLOWED_URI_REGEXP.test('javascript:alert(1)')).toBe(false);
      expect(cfg.ALLOWED_URI_REGEXP.test('file:///etc/passwd')).toBe(false);
      expect(cfg.ALLOWED_URI_REGEXP.test('data:text/html,<script>')).toBe(false);
    }
  });

  it('forbids the obvious script-bearing tags', () => {
    const cfg = mailHtmlSanitiserConfig();
    for (const t of ['script', 'iframe', 'object', 'embed', 'form', 'style', 'meta', 'link', 'base']) {
      expect(cfg.FORBID_TAGS).toContain(t);
    }
  });
});

describe('sanitiseInlineStyle', () => {
  it('returns the original value when safe', () => {
    expect(sanitiseInlineStyle('color: #333; font-weight: 600')).toBe('color: #333; font-weight: 600');
  });

  it('drops any style containing url(...) (CSS exfil vector)', () => {
    expect(sanitiseInlineStyle('background: url(https://x.com/bg.png)')).toBe('');
    expect(sanitiseInlineStyle('background-image:url(\'x\')')).toBe('');
  });

  it.each(DISALLOWED_STYLE_FRAGMENTS)('drops style containing %s', (frag) => {
    const sample = `color:red;${frag}top:0`;
    expect(sanitiseInlineStyle(sample)).toBe('');
  });

  it('drops javascript:/vbscript:/expression() regardless of casing', () => {
    expect(sanitiseInlineStyle('width: EXPRESSION(alert(1))')).toBe('');
    expect(sanitiseInlineStyle('color: VBSCRIPT:msgbox(1)')).toBe('');
  });
});

describe('SAFE_LINK_SCHEMES', () => {
  it('whitelists the expected protocols', () => {
    for (const p of ['http:', 'https:', 'mailto:', 'tel:', 'cid:']) {
      expect(SAFE_LINK_SCHEMES.has(p)).toBe(true);
    }
  });

  it('does not whitelist javascript:/data:/file:', () => {
    for (const p of ['javascript:', 'data:', 'file:', 'about:', 'vbscript:']) {
      expect(SAFE_LINK_SCHEMES.has(p)).toBe(false);
    }
  });
});
