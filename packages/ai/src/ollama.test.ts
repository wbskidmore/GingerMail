import { describe, expect, it, vi } from 'vitest';
import { OllamaClient } from './client.js';

describe('OllamaClient.waitForReady', () => {
  it('returns false when the server never becomes ready', async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async () => {
      throw new Error('refused');
    }) as unknown as typeof global.fetch;
    try {
      const c = new OllamaClient('http://127.0.0.1:65535', 'qwen2.5:0.5b');
      const ok = await c.waitForReady(120);
      expect(ok).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('returns true as soon as /api/tags responds ok', async () => {
    const originalFetch = global.fetch;
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls < 2) throw new Error('warming up');
      return new Response('{"models":[]}', { status: 200 });
    }) as unknown as typeof global.fetch;
    try {
      const c = new OllamaClient('http://localhost:11434', 'qwen2.5:0.5b');
      const ok = await c.waitForReady(2000);
      expect(ok).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe('OllamaClient.pullModel', () => {
  it('parses NDJSON progress lines and calls onProgress for each', async () => {
    const events: Array<{ status: string; completed?: number; total?: number }> = [];
    const original = global.fetch;
    const ndjson =
      [
        JSON.stringify({ status: 'pulling manifest' }),
        JSON.stringify({ status: 'downloading', completed: 1024, total: 4096 }),
        JSON.stringify({ status: 'downloading', completed: 4096, total: 4096 }),
        JSON.stringify({ status: 'success' }),
      ].join('\n') + '\n';
    global.fetch = vi.fn(async () => {
      const enc = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(enc.encode(ndjson));
            controller.close();
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof global.fetch;
    try {
      const c = new OllamaClient('http://x', 'qwen2.5:0.5b');
      await c.pullModel('qwen2.5:0.5b', (e) => events.push(e));
      expect(events.length).toBe(4);
      expect(events[1].completed).toBe(1024);
      expect(events[2].completed).toBe(4096);
      expect(events[3].status).toBe('success');
    } finally {
      global.fetch = original;
    }
  });

  it('surfaces a server-side {error: ...} as a thrown error', async () => {
    const original = global.fetch;
    global.fetch = vi.fn(async () => {
      const enc = new TextEncoder();
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(enc.encode(JSON.stringify({ error: 'model not found' }) + '\n'));
            controller.close();
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof global.fetch;
    try {
      const c = new OllamaClient('http://x', 'missing');
      await expect(c.pullModel('missing', () => {})).rejects.toThrow(/model not found/);
    } finally {
      global.fetch = original;
    }
  });
});
