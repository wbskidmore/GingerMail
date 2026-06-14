import { describe, expect, it } from 'vitest';
import type { AiClient } from './client.js';
import { detectActionables } from './client.js';

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

describe('detectActionables', () => {
  it('parses valid items and clamps confidence', async () => {
    const client = stubClient(
      JSON.stringify({
        items: [
          {
            category: 'task',
            title: 'Send the report',
            confidence: 0.9,
            due: '2026-06-01T09:00:00Z',
          },
          {
            category: 'event',
            title: 'Standup',
            confidence: 1.5,
            when: '2026-06-02T15:00:00Z',
            location: 'Zoom',
          },
        ],
      }),
    );
    const out = await detectActionables(client, {
      text: 'please send the report and join standup',
    });
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ category: 'task', title: 'Send the report', confidence: 0.9 });
    expect(out[0]!.payload.due).toBe('2026-06-01T09:00:00Z');
    // 1.5 is clamped to 1.
    expect(out[1]!.confidence).toBe(1);
    expect(out[1]!.payload.location).toBe('Zoom');
  });

  it('drops items with an unknown category or empty title', async () => {
    const client = stubClient(
      JSON.stringify({
        items: [
          { category: 'spaceship', title: 'Nope', confidence: 0.9 },
          { category: 'task', title: '', confidence: 0.9 },
          { category: 'reminder', title: 'Call mom', confidence: 0.8 },
        ],
      }),
    );
    const out = await detectActionables(client, { text: 'hi' });
    expect(out).toHaveLength(1);
    expect(out[0]!.category).toBe('reminder');
  });

  it('returns an empty array on malformed model output', async () => {
    const client = stubClient('not json at all');
    const out = await detectActionables(client, { text: 'hi' });
    expect(out).toEqual([]);
  });

  it('returns an empty array when nothing is actionable', async () => {
    const client = stubClient(JSON.stringify({ items: [] }));
    const out = await detectActionables(client, { text: 'just saying hello' });
    expect(out).toEqual([]);
  });

  it('defaults confidence to 0.5 when missing', async () => {
    const client = stubClient(JSON.stringify({ items: [{ category: 'task', title: 'Do thing' }] }));
    const out = await detectActionables(client, { text: 'do thing' });
    expect(out[0]!.confidence).toBe(0.5);
  });
});
