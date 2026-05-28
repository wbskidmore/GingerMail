import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiClient } from './client.js';
import { buildNlSearchSpec, CloudAiClient } from './client.js';

function stubClient(output: string): AiClient {
  return {
    modelName: 'test-model',
    async chat() {
      return output;
    },
    async testConnection() {
      return { ok: true, model: 'test-model' };
    },
  };
}

describe('buildNlSearchSpec', () => {
  it('parses a clean JSON response', async () => {
    const client = stubClient(
      JSON.stringify({
        ftsQuery: 'from_text:"alice" AND "budget"',
        after: '2026-01-01',
        unread: true,
        explanation: 'Unread messages from Alice about budget since January',
      }),
    );
    const spec = await buildNlSearchSpec(client, 'alice budget');
    expect(spec).toMatchObject({
      ftsQuery: 'from_text:"alice" AND "budget"',
      after: '2026-01-01',
      unread: true,
    });
    expect(spec?.explanation).toMatch(/Alice/);
  });

  it('strips ```json fences before parsing', async () => {
    const client = stubClient('```json\n{"ftsQuery":"\\"hello\\"","explanation":"hi"}\n```');
    const spec = await buildNlSearchSpec(client, 'hello');
    expect(spec?.ftsQuery).toBe('"hello"');
  });

  it('returns null when the model emits non-JSON', async () => {
    const client = stubClient('I cannot help with that.');
    const spec = await buildNlSearchSpec(client, 'irrelevant');
    expect(spec).toBeNull();
  });

  it('discards bogus types instead of throwing', async () => {
    const client = stubClient(JSON.stringify({ ftsQuery: 42, after: ['nope'], unread: 'sure' }));
    const spec = await buildNlSearchSpec(client, 'q');
    expect(spec).toEqual({
      ftsQuery: '',
      after: undefined,
      before: undefined,
      unread: undefined,
      explanation: '',
    });
  });
});

describe('CloudAiClient Gemini dispatch', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('posts to the Gemini generateContent endpoint with the API key in the x-goog-api-key header', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: 'pong' }] } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const client = new CloudAiClient(
      'https://generativelanguage.googleapis.com/v1beta',
      'test-key',
      'gemini-1.5-flash',
      'google',
    );
    const out = await client.chat({ messages: [{ role: 'user', content: 'ping' }] });
    expect(out).toBe('pong');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent',
    );
    // API key MUST travel as a header, not a query param: ?key=... ends up
    // in HTTP access logs and referer captures.
    expect(url).not.toContain('key=');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-key');
    expect(headers['content-type']).toBe('application/json');
  });

  it('hoists system messages into systemInstruction and merges consecutive same-role turns', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), { status: 200 }),
    );
    const client = new CloudAiClient(
      'https://generativelanguage.googleapis.com/v1beta',
      'k',
      'gemini-1.5-pro',
      'google',
    );
    await client.chat({
      messages: [
        { role: 'system', content: 'you are pithy' },
        { role: 'user', content: 'a' },
        { role: 'user', content: 'b' },
        { role: 'assistant', content: 'c' },
      ],
      format: 'json',
      maxTokens: 64,
      temperature: 0.3,
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as {
      systemInstruction?: { parts: Array<{ text: string }> };
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
      generationConfig: { temperature: number; maxOutputTokens: number; responseMimeType?: string };
    };
    expect(body.systemInstruction?.parts[0]?.text).toBe('you are pithy');
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'a' }, { text: 'b' }] },
      { role: 'model', parts: [{ text: 'c' }] },
    ]);
    expect(body.generationConfig).toMatchObject({
      temperature: 0.3,
      maxOutputTokens: 64,
      responseMimeType: 'application/json',
    });
  });

  it('throws with the safety block reason when Gemini refuses the prompt', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }),
    );
    const client = new CloudAiClient(
      'https://generativelanguage.googleapis.com/v1beta',
      'k',
      'gemini-1.5-flash',
      'google',
    );
    await expect(
      client.chat({ messages: [{ role: 'user', content: 'x' }] }),
    ).rejects.toThrow(/SAFETY/);
  });
});
