/**
 * Covers the renderer-side mail HTML sanitiser. The renderer doesn't normally
 * have a DOM in Vitest's Node environment, but Vitest runs us under jsdom by
 * default via the vitest.config in the app, so DOMPurify works here too.
 *
 * The matrix focuses on the attacks the security review called out:
 *   - <script> + on* handlers stripped
 *   - javascript: / data: URLs blocked
 *   - css url() / position:fixed style attrs stripped
 *   - remote <img> blocked unless explicitly allowed
 *   - <a> rewritten with rel="noopener noreferrer nofollow"
 */
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { sanitiseMailHtml } from './sanitiseMailHtml.js';

describe('sanitiseMailHtml', () => {
  it('strips <script> tags entirely', () => {
    const out = sanitiseMailHtml('<p>hi</p><script>alert(1)</script><p>bye</p>');
    expect(out).toContain('<p>hi</p>');
    expect(out).toContain('<p>bye</p>');
    expect(out).not.toContain('script');
    expect(out).not.toContain('alert');
  });

  it('strips on* event handlers from any tag', () => {
    const out = sanitiseMailHtml('<a href="https://example.com" onclick="alert(1)">x</a>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('alert');
    expect(out).toContain('href="https://example.com"');
  });

  it('rewrites <a> tags with rel + target', () => {
    const out = sanitiseMailHtml('<a href="https://example.com">x</a>');
    expect(out).toMatch(/rel="noopener noreferrer nofollow"/);
    expect(out).toMatch(/target="_blank"/);
  });

  it('blocks javascript: hrefs', () => {
    const out = sanitiseMailHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toMatch(/javascript:/);
  });

  it('blocks remote <img> by default', () => {
    const out = sanitiseMailHtml('<img src="https://tracker.example.com/pixel.gif">');
    expect(out).not.toMatch(/src=/);
  });

  it('allows remote <img> when explicitly opted in', () => {
    const out = sanitiseMailHtml('<img src="https://example.com/cat.png">', { allowRemoteImages: true });
    expect(out).toMatch(/src="https:\/\/example\.com\/cat\.png"/);
  });

  it('always allows cid: <img>', () => {
    const out = sanitiseMailHtml('<img src="cid:embedded@msg">');
    expect(out).toMatch(/src="cid:embedded@msg"/);
  });

  it('strips style attributes containing url() or position:fixed', () => {
    const bad = sanitiseMailHtml('<div style="background:url(https://x.com/bg.png)">x</div>');
    expect(bad).not.toMatch(/style=/);
    const bad2 = sanitiseMailHtml('<div style="position:fixed;top:0">x</div>');
    expect(bad2).not.toMatch(/style=/);
  });

  it('keeps safe style attributes intact', () => {
    const out = sanitiseMailHtml('<div style="color:#333;font-weight:600">x</div>');
    expect(out).toMatch(/style="color:#333;font-weight:600"/);
  });

  it('strips <iframe>, <object>, <embed>', () => {
    const out = sanitiseMailHtml('<iframe src="https://x"></iframe><object data="x"></object><embed src="x">');
    expect(out).not.toContain('iframe');
    expect(out).not.toContain('object');
    expect(out).not.toContain('embed');
  });

  it('strips <link> and <meta> (avoid CSP overrides)', () => {
    const out = sanitiseMailHtml('<link rel="stylesheet" href="https://x"><meta http-equiv="refresh" content="0;url=https://x">');
    expect(out).not.toContain('link');
    expect(out).not.toContain('meta');
  });

  it('drops srcdoc, formaction, ping attributes', () => {
    const out = sanitiseMailHtml('<img srcdoc="<script>alert(1)</script>"><form formaction="https://x"></form><a ping="https://x">y</a>');
    expect(out).not.toMatch(/srcdoc/);
    expect(out).not.toMatch(/formaction/);
    expect(out).not.toMatch(/ping=/);
  });

  it('handles empty and undefined input without throwing', () => {
    expect(sanitiseMailHtml('')).toBe('');
    // @ts-expect-error - intentional misuse
    expect(sanitiseMailHtml(undefined)).toBe('');
  });
});
