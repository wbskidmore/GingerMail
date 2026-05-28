import { describe, expect, it } from 'vitest';
import type { AiSettings } from '@gingermail/core';
import { allowedAiHosts, isUrlAllowedForAi } from './aiEgress.js';

const off: AiSettings = { mode: 'off' };

const local: AiSettings = {
  mode: 'local',
  local: { baseUrl: 'http://127.0.0.1:11434', model: 'llama3.2' },
};

const openai: AiSettings = {
  mode: 'cloud',
  cloud: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', vendor: 'openai' },
};

const anthropic: AiSettings = {
  mode: 'cloud',
  cloud: { baseUrl: 'https://api.anthropic.com', model: 'claude-3-haiku', vendor: 'anthropic' },
};

const selfHosted: AiSettings = {
  mode: 'cloud',
  cloud: { baseUrl: 'https://ai.internal.example.com/v1', model: 'gpt', vendor: 'openai' },
};

describe('allowedAiHosts', () => {
  it('returns [] when AI is off', () => {
    expect(allowedAiHosts(off)).toEqual([]);
  });
  it('returns loopback for local mode', () => {
    expect(allowedAiHosts(local)).toContain('127.0.0.1');
  });
  it('returns vendor host for cloud mode', () => {
    expect(allowedAiHosts(openai)).toContain('api.openai.com');
    expect(allowedAiHosts(anthropic)).toContain('api.anthropic.com');
  });
  it('also includes the user-configured baseUrl host (self-hosted proxies)', () => {
    expect(allowedAiHosts(selfHosted)).toContain('ai.internal.example.com');
    expect(allowedAiHosts(selfHosted)).toContain('api.openai.com');
  });
});

describe('isUrlAllowedForAi', () => {
  it('blocks everything when AI is off', () => {
    expect(isUrlAllowedForAi('https://api.openai.com/v1/chat', off).allowed).toBe(false);
    expect(isUrlAllowedForAi('http://127.0.0.1:11434/api/chat', off).allowed).toBe(false);
  });
  it('allows the configured vendor only', () => {
    expect(isUrlAllowedForAi('https://api.openai.com/v1/chat/completions', openai).allowed).toBe(true);
    expect(isUrlAllowedForAi('https://api.anthropic.com/v1/messages', openai).allowed).toBe(false);
  });
  it('refuses http for cloud mode', () => {
    expect(isUrlAllowedForAi('http://api.openai.com/v1/chat', openai).allowed).toBe(false);
  });
  it('refuses non-loopback http in local mode', () => {
    expect(isUrlAllowedForAi('http://example.com/api', local).allowed).toBe(false);
    expect(isUrlAllowedForAi('http://127.0.0.1:11434/api/chat', local).allowed).toBe(true);
    expect(isUrlAllowedForAi('http://localhost:11434/api/chat', local).allowed).toBe(true);
  });
  it('refuses file:// / data: / javascript: protocols outright', () => {
    expect(isUrlAllowedForAi('file:///etc/passwd', openai).allowed).toBe(false);
    expect(isUrlAllowedForAi('javascript:alert(1)', openai).allowed).toBe(false);
  });
  it('reports a reason for blocks (for logging without leaking the URL)', () => {
    const r = isUrlAllowedForAi('https://evil.example.com/leak', openai);
    expect(r.allowed).toBe(false);
    expect(r.reason).toMatch(/host-not-allowlisted/);
  });
});
