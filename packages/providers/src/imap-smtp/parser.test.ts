import { describe, expect, it } from 'vitest';
import { parseRfc822 } from './parser.js';

const SIMPLE_TEXT = `From: alice@example.com\r
To: bob@example.com\r
Subject: hello\r
Content-Type: text/plain; charset=utf-8\r
\r
hello world\r
`;

const MULTIPART = `From: alice@example.com\r
Subject: multipart\r
Content-Type: multipart/alternative; boundary="BOUND"\r
\r
--BOUND\r
Content-Type: text/plain; charset=utf-8\r
Content-Transfer-Encoding: 7bit\r
\r
plain body\r
--BOUND\r
Content-Type: text/html; charset=utf-8\r
\r
<p>html body</p>\r
--BOUND--\r
`;

describe('rfc822 parser', () => {
  it('parses a single-part text message', async () => {
    const out = await parseRfc822(Buffer.from(SIMPLE_TEXT));
    expect(out.text).toContain('hello world');
    expect(out.html).toBeUndefined();
    expect(out.attachments).toEqual([]);
  });

  it('parses a multipart/alternative message', async () => {
    const out = await parseRfc822(Buffer.from(MULTIPART));
    expect(out.text).toContain('plain body');
    expect(out.html).toContain('html body');
  });
});
