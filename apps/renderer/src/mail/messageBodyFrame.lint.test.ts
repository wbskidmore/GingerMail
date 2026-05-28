import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Regression guard for the mail-body iframe hardening posture.
 *
 * The mail body iframe is the single highest-risk attack surface in the
 * app: it renders attacker-controlled HTML on every message open. The
 * hardening (sandbox="", srcdoc-only, no-referrer) lives in MailTab.tsx
 * and can be silently regressed by anyone who edits the JSX without
 * thinking about the implications.
 *
 * Rather than mount the whole MailTab in jsdom just to read three props,
 * we do a source-text assertion. The test will FAIL the moment someone
 * adds `allow-scripts`, `allow-same-origin`, a `src=` attribute, or
 * removes `referrerPolicy="no-referrer"`. That's the bar we want.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readMailTab(): string {
  const p = join(__dirname, '..', 'tabs', 'MailTab.tsx');
  return readFileSync(p, 'utf8');
}

function extractIframeBlock(source: string): string {
  // Find the iframe JSX block and return everything from `<iframe` to its
  // self-closing `/>`. The MailTab.tsx file has exactly one iframe; if a
  // second one appears, this test fails LOUDLY so we audit it.
  const matches = source.match(/<iframe[\s\S]*?\/>/g) ?? [];
  if (matches.length === 0) throw new Error('expected an <iframe> in MailTab.tsx');
  if (matches.length > 1) {
    throw new Error(
      `expected exactly one <iframe> in MailTab.tsx; found ${matches.length}. New iframes need an audit; ` +
        'see apps/renderer/src/mail/messageBodyFrame.lint.test.ts.',
    );
  }
  return matches[0]!;
}

describe('MailTab message body iframe (security hardening)', () => {
  const block = extractIframeBlock(readMailTab());

  it('uses sandbox="" (no allow-* tokens)', () => {
    expect(block).toMatch(/sandbox=""/);
    // Refuse any allow-* token that would re-grant a sandbox capability.
    expect(block).not.toMatch(/allow-scripts/i);
    expect(block).not.toMatch(/allow-same-origin/i);
    expect(block).not.toMatch(/allow-forms/i);
    expect(block).not.toMatch(/allow-top-navigation/i);
    expect(block).not.toMatch(/allow-popups/i);
    expect(block).not.toMatch(/allow-modals/i);
    expect(block).not.toMatch(/allow-downloads/i);
  });

  it('uses srcDoc, never src=', () => {
    expect(block).toMatch(/srcDoc=/);
    // `src=` would point at a URL the iframe can load (file://, https://, etc.)
    // and would defeat the srcdoc-only posture. We allow `srcDoc=` (case sensitive).
    expect(block).not.toMatch(/\bsrc=/);
  });

  it('uses referrerPolicy="no-referrer"', () => {
    expect(block).toMatch(/referrerPolicy="no-referrer"/);
  });

  it('does not loosen the frame via loading=eager autoplay etc.', () => {
    expect(block).not.toMatch(/allow=/);
    expect(block).not.toMatch(/allowFullScreen/);
    expect(block).not.toMatch(/allowfullscreen/i);
  });
});

describe('srcDoc content includes a strict meta CSP', () => {
  const src = readMailTab();
  it('always emits a Content-Security-Policy meta tag', () => {
    expect(src).toMatch(/<meta http-equiv="Content-Security-Policy"/);
  });
  it('default-src is none in both image policies', () => {
    expect(src).toMatch(/default-src 'none'/);
  });
});
