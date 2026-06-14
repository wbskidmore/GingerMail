import {
  AI_VENDOR_HOSTS,
  redactPii,
  type AiSettings,
  type Message,
  type MessageThread,
  type Task,
} from '@gingermail/core';
import type { SuggestionCategory, SuggestionPayload } from '@gingermail/core';
import {
  classifySendersForUnsubscribePrompt,
  detectActionablesPrompt,
  draftReplyPrompt,
  extractActionItemsPrompt,
  nlSearchPrompt,
  prioritizeInboxPrompt,
  summarizeThreadPrompt,
} from './prompts.js';

/**
 * Guard against egress to anything other than the configured vendor host.
 * Throws (instead of returning) so callers don't accidentally swallow the
 * failure and silently fall through to a worse default.
 */
function assertCloudUrlAllowed(
  url: string,
  vendor: 'openai' | 'anthropic' | 'google',
  baseUrl: string,
): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`[ai] refusing to call malformed URL`);
  }
  if (parsed.protocol !== 'https:') {
    throw new Error(`[ai] refusing non-HTTPS cloud call to ${parsed.hostname}`);
  }
  const allowed = new Set<string>(AI_VENDOR_HOSTS[vendor]);
  try {
    const base = new URL(baseUrl);
    if (base.hostname) allowed.add(base.hostname);
  } catch {
    /* malformed baseUrl: vendor list only */
  }
  const ok = Array.from(allowed).some(
    (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`),
  );
  if (!ok) {
    // Log the host explicitly but never the URL (URL may carry tokens).
    throw new Error(
      `[ai] refusing call to non-allowlisted host '${parsed.hostname}' (vendor=${vendor})`,
    );
  }
}

export interface CloudClientPrivacy {
  /** When true, run `redactPii` over every outgoing message body before send. */
  redactPii: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionInput {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  format?: 'text' | 'json';
}

export interface AiClient {
  chat(input: CompletionInput): Promise<string>;
  testConnection(): Promise<{ ok: boolean; error?: string; model?: string }>;
  readonly modelName: string;
  /**
   * Coarse provenance label for the UI. The renderer renders this in the
   * per-message AI badge so the user always sees where their email body
   * was sent. Values:
   *   - `local:<model>`       — request stayed on-device (Ollama)
   *   - `cloud:openai:<model>`
   *   - `cloud:anthropic:<model>`
   *   - `cloud:google:<model>`
   */
  readonly provenance: string;
}

/** Cloud AI client. Supports OpenAI-compatible, Anthropic, and Google Gemini. */
export class CloudAiClient implements AiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    public readonly modelName: string,
    private readonly vendor: 'openai' | 'anthropic' | 'google',
    private readonly privacy: CloudClientPrivacy = { redactPii: false },
  ) {}

  get provenance(): string {
    return `cloud:${this.vendor}:${this.modelName}`;
  }

  async chat(input: CompletionInput): Promise<string> {
    const filtered = this.applyPrivacy(input);
    if (this.vendor === 'anthropic') return this.chatAnthropic(filtered);
    if (this.vendor === 'google') return this.chatGemini(filtered);
    return this.chatOpenAi(filtered);
  }

  /**
   * Apply main-process privacy posture to a request before it leaves the
   * machine. Today: opt-in PII redaction. Idempotent; safe to call twice.
   */
  private applyPrivacy(input: CompletionInput): CompletionInput {
    if (!this.privacy.redactPii) return input;
    return {
      ...input,
      messages: input.messages.map((m) => ({ ...m, content: redactPii(m.content).text })),
    };
  }

  private async chatOpenAi(input: CompletionInput): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/chat/completions`;
    assertCloudUrlAllowed(url, this.vendor, this.baseUrl);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.modelName,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 1024,
        response_format: input.format === 'json' ? { type: 'json_object' } : undefined,
      }),
    });
    if (!res.ok) throw new Error(`AI error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content ?? '';
  }

  private async chatAnthropic(input: CompletionInput): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/messages`;
    assertCloudUrlAllowed(url, this.vendor, this.baseUrl);
    const system = input.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    const rest = input.messages.filter((m) => m.role !== 'system');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.modelName,
        system,
        messages: rest,
        max_tokens: input.maxTokens ?? 1024,
        temperature: input.temperature ?? 0.2,
      }),
    });
    if (!res.ok) throw new Error(`AI error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { content?: Array<{ text?: string }> };
    return (json.content ?? []).map((p) => p.text ?? '').join('');
  }

  /**
   * Google Gemini (Generative Language API).
   *
   * Mapping notes:
   *   - System messages get hoisted into `systemInstruction` (Gemini doesn't
   *     have a `system` role on the message list).
   *   - Our `assistant` role maps to Gemini's `model` role; `user` stays put.
   *     Multiple consecutive same-role messages are concatenated because
   *     Gemini rejects role repeats.
   *   - JSON mode uses `responseMimeType: 'application/json'` which Gemini
   *     1.5+ supports natively.
   *   - The API key is sent via the `x-goog-api-key` header rather than the
   *     `?key=` query param so it doesn't end up in HTTP access logs or
   *     `RECEIVED-FROM` style URL captures.
   */
  private async chatGemini(input: CompletionInput): Promise<string> {
    const base = this.baseUrl.replace(/\/$/, '');
    const url = `${base}/models/${encodeURIComponent(this.modelName)}:generateContent`;
    assertCloudUrlAllowed(url, this.vendor, this.baseUrl);

    const systemText = input.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n');
    const turns = input.messages.filter((m) => m.role !== 'system');

    type GeminiContent = { role: 'user' | 'model'; parts: Array<{ text: string }> };
    const contents: GeminiContent[] = [];
    for (const t of turns) {
      const role: 'user' | 'model' = t.role === 'assistant' ? 'model' : 'user';
      const prev = contents[contents.length - 1];
      if (prev && prev.role === role) {
        // Gemini rejects consecutive turns with the same role; merge instead.
        prev.parts.push({ text: t.content });
      } else {
        contents.push({ role, parts: [{ text: t.content }] });
      }
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxTokens ?? 1024,
        ...(input.format === 'json' ? { responseMimeType: 'application/json' } : {}),
      },
    };
    if (systemText) {
      body['systemInstruction'] = { parts: [{ text: systemText }] };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`AI error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      promptFeedback?: { blockReason?: string };
    };
    if (json.promptFeedback?.blockReason) {
      // Gemini blocked the prompt outright (safety filters). Surface the
      // reason so the caller can decide whether to fall back to heuristics
      // rather than silently returning an empty string.
      throw new Error(`Gemini blocked the prompt: ${json.promptFeedback.blockReason}`);
    }
    const parts = json.candidates?.[0]?.content?.parts ?? [];
    return parts.map((p) => p.text ?? '').join('');
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; model?: string }> {
    try {
      const out = await this.chat({
        messages: [{ role: 'user', content: 'reply with the single word OK' }],
        maxTokens: 10,
      });
      return { ok: out.trim().length > 0, model: this.modelName };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

/** Local Ollama client (http://localhost:11434/api/chat). */
export class OllamaClient implements AiClient {
  constructor(
    private readonly baseUrl: string,
    public readonly modelName: string,
  ) {}

  get provenance(): string {
    return `local:${this.modelName}`;
  }

  async chat(input: CompletionInput): Promise<string> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/api/chat`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.modelName,
        messages: input.messages,
        stream: false,
        options: { temperature: input.temperature ?? 0.2, num_predict: input.maxTokens ?? 1024 },
      }),
    });
    if (!res.ok) throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? '';
  }

  async testConnection(): Promise<{ ok: boolean; error?: string; model?: string }> {
    try {
      const tagRes = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/tags`);
      if (!tagRes.ok) return { ok: false, error: `Ollama not reachable at ${this.baseUrl}` };
      return { ok: true, model: this.modelName };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Block until `/api/tags` responds 200 or the deadline expires. Returns
   * true on success, false on timeout. Useful when the caller has just
   * spawned the sidecar and needs to gate the first chat() call on it.
   */
  async waitForReady(timeoutMs = 30_000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/tags`);
        if (r.ok) return true;
      } catch {
        // not ready yet
      }
      await new Promise((res) => setTimeout(res, 350));
    }
    return false;
  }

  /** Tag the locally-installed models (Ollama `/api/tags`). */
  async listInstalledModels(): Promise<
    Array<{ name: string; sizeBytes: number; modifiedAt: number }>
  > {
    const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/tags`);
    if (!r.ok) throw new Error(`Ollama not reachable at ${this.baseUrl}`);
    const json = (await r.json()) as {
      models?: Array<{ name: string; size: number; modified_at: string }>;
    };
    return (json.models ?? []).map((m) => ({
      name: m.name,
      sizeBytes: m.size,
      modifiedAt: Date.parse(m.modified_at) || Date.now(),
    }));
  }

  /**
   * Stream a model download. The provided callback is invoked for every
   * NDJSON line Ollama emits; the renderer translates these into a Mantine
   * `Progress` bar. Resolves when the server closes the stream.
   */
  async pullModel(
    name: string,
    onProgress: (evt: { status: string; completed?: number; total?: number }) => void,
  ): Promise<void> {
    const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, stream: true }),
    });
    if (!r.ok || !r.body) throw new Error(`Pull failed: ${r.status} ${r.statusText}`);
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const evt = JSON.parse(trimmed) as {
            status?: string;
            completed?: number;
            total?: number;
            error?: string;
          };
          if (evt.error) throw new Error(evt.error);
          onProgress({
            status: evt.status ?? 'pulling',
            completed: evt.completed,
            total: evt.total,
          });
        } catch (e) {
          // Swallow malformed lines so a single bad chunk doesn't abort the pull.
          if (e instanceof Error && e.message && !e.message.includes('JSON')) throw e;
        }
      }
    }
  }

  async deleteModel(name: string): Promise<void> {
    const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/delete`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (!r.ok) throw new Error(`Delete failed: ${r.status} ${r.statusText}`);
  }
}

export function buildAiClient(settings: AiSettings): AiClient | null {
  if (settings.mode === 'off') return null;
  if (settings.mode === 'cloud' && settings.cloud?.apiKey) {
    return new CloudAiClient(
      settings.cloud.baseUrl,
      settings.cloud.apiKey,
      settings.cloud.model,
      settings.cloud.vendor,
      { redactPii: Boolean(settings.privacy?.redactPii) },
    );
  }
  if (settings.mode === 'local' && settings.local) {
    return new OllamaClient(settings.local.baseUrl, settings.local.model);
  }
  return null;
}

// ---- High-level features ----

export async function summarizeThread(
  client: AiClient,
  thread: MessageThread,
  messages: Message[],
): Promise<{ summary: string; actionItems: string[] }> {
  const out = await client.chat({
    messages: [
      { role: 'system', content: summarizeThreadPrompt() },
      {
        role: 'user',
        content: JSON.stringify({
          subject: thread.subject,
          messages: messages.map((m) => ({
            from: m.from,
            date: new Date(m.date).toISOString(),
            text: m.body?.text ?? m.snippet,
          })),
        }),
      },
    ],
    format: 'json',
    temperature: 0.1,
  });
  try {
    const parsed = JSON.parse(out) as { summary?: string; actionItems?: string[] };
    return { summary: parsed.summary ?? '', actionItems: parsed.actionItems ?? [] };
  } catch {
    return { summary: out.trim(), actionItems: [] };
  }
}

export async function draftReply(
  client: AiClient,
  thread: MessageThread,
  messages: Message[],
  opts: { tone?: string; intent?: string },
): Promise<string> {
  const out = await client.chat({
    messages: [
      { role: 'system', content: draftReplyPrompt(opts.tone, opts.intent) },
      {
        role: 'user',
        content: JSON.stringify({
          subject: thread.subject,
          history: messages.map((m) => ({
            from: m.from,
            text: m.body?.text ?? m.snippet,
            date: new Date(m.date).toISOString(),
          })),
        }),
      },
    ],
    temperature: 0.4,
  });
  return out.trim();
}

export async function extractActionItems(
  client: AiClient,
  message: Message,
  listId: string,
): Promise<Task[]> {
  const out = await client.chat({
    messages: [
      { role: 'system', content: extractActionItemsPrompt() },
      {
        role: 'user',
        content: JSON.stringify({
          subject: message.subject,
          text: message.body?.text ?? message.snippet,
        }),
      },
    ],
    format: 'json',
    temperature: 0.1,
  });
  let items: { title: string; due?: string; notes?: string }[] = [];
  try {
    const parsed = JSON.parse(out) as { items?: typeof items };
    items = parsed.items ?? [];
  } catch {
    return [];
  }
  return items.map((it, i) => ({
    id: `ai-${message.id}-${i}`,
    listId,
    accountId: message.accountId,
    title: it.title,
    notes: it.notes,
    status: 'open',
    starred: false,
    due: it.due ? Date.parse(it.due) || undefined : undefined,
    position: i,
    linkedMessageId: message.id,
  }));
}

/** A single actionable item the detection agent found in a message. */
export interface DetectedActionable {
  category: SuggestionCategory;
  title: string;
  confidence: number;
  payload: SuggestionPayload;
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set(['email', 'reminder', 'event', 'task']);

/**
 * Scan a single message (chat or mail) for actionable items: emails to send,
 * reminders, calendar events, and tasks. Returns a (possibly empty) typed
 * list. Parsing is defensive: malformed model output yields an empty array
 * rather than throwing, so a flaky local model never breaks message sync.
 */
export async function detectActionables(
  client: AiClient,
  input: { text: string; context?: string },
): Promise<DetectedActionable[]> {
  const out = await client.chat({
    messages: [
      { role: 'system', content: detectActionablesPrompt() },
      {
        role: 'user',
        content: JSON.stringify({ context: input.context ?? '', message: input.text }),
      },
    ],
    format: 'json',
    temperature: 0.1,
  });
  let items: Array<Record<string, unknown>> = [];
  try {
    const parsed = JSON.parse(out) as { items?: Array<Record<string, unknown>> };
    items = Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
  const result: DetectedActionable[] = [];
  for (const raw of items) {
    const category = String(raw.category ?? '');
    if (!VALID_CATEGORIES.has(category)) continue;
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    if (!title) continue;
    const confidenceRaw =
      typeof raw.confidence === 'number' ? raw.confidence : Number(raw.confidence);
    const confidence = Number.isFinite(confidenceRaw)
      ? Math.min(1, Math.max(0, confidenceRaw))
      : 0.5;
    const payload: SuggestionPayload = {};
    const str = (k: string): string | undefined =>
      typeof raw[k] === 'string' && raw[k] ? String(raw[k]) : undefined;
    payload.when = str('when');
    payload.due = str('due');
    payload.end = str('end');
    payload.to = str('to');
    payload.subject = str('subject');
    payload.body = str('body');
    payload.location = str('location');
    payload.notes = str('notes');
    result.push({ category: category as SuggestionCategory, title, confidence, payload });
  }
  return result;
}

/**
 * Spec the AI produces for a natural-language search. `ftsQuery` is an FTS5
 * MATCH expression we can run directly against the messages_fts virtual table;
 * dates are ISO-8601 strings the caller resolves to epoch ms.
 */
export interface NlSearchSpec {
  ftsQuery: string;
  after?: string;
  before?: string;
  unread?: boolean;
  explanation: string;
}

/**
 * Ask the model to turn a natural-language query into a structured search
 * spec. Returns null if the model produced unparseable JSON or junk — callers
 * are expected to fall back to plain FTS in that case.
 */
export async function buildNlSearchSpec(
  client: AiClient,
  query: string,
): Promise<NlSearchSpec | null> {
  const out = await client.chat({
    messages: [
      { role: 'system', content: nlSearchPrompt() },
      { role: 'user', content: query },
    ],
    format: 'json',
    temperature: 0.1,
    maxTokens: 256,
  });
  // Models love to wrap JSON in ```json fences; strip them defensively.
  const cleaned = out
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Partial<NlSearchSpec>;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return {
      ftsQuery: typeof parsed.ftsQuery === 'string' ? parsed.ftsQuery : '',
      after: typeof parsed.after === 'string' ? parsed.after : undefined,
      before: typeof parsed.before === 'string' ? parsed.before : undefined,
      unread: typeof parsed.unread === 'boolean' ? parsed.unread : undefined,
      explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
    };
  } catch {
    return null;
  }
}

export async function prioritizeInbox(
  client: AiClient,
  messages: Message[],
): Promise<Map<string, 'high' | 'medium' | 'low'>> {
  const out = await client.chat({
    messages: [
      { role: 'system', content: prioritizeInboxPrompt() },
      {
        role: 'user',
        content: JSON.stringify(
          messages.slice(0, 50).map((m) => ({
            id: m.id,
            subject: m.subject,
            from: m.from,
            snippet: m.snippet,
            unread: m.unread,
          })),
        ),
      },
    ],
    format: 'json',
    temperature: 0.1,
  });
  const map = new Map<string, 'high' | 'medium' | 'low'>();
  try {
    const parsed = JSON.parse(out) as {
      items?: Array<{ id: string; energy: 'high' | 'medium' | 'low' }>;
    };
    for (const it of parsed.items ?? []) map.set(it.id, it.energy);
  } catch {
    // ignore
  }
  return map;
}

export interface UnsubscribeVerdict {
  email: string;
  verdict: 'unsubscribe' | 'mute' | 'keep';
  confidence: number;
  reason: string;
}

/**
 * Ask the AI to classify a batch of candidate senders. The caller (main
 * process) is expected to feed the heuristic candidates from the local DB
 * \u2014 we never send the full message body, only the address, subject, and
 * trashed-vs-seen counters, so the model has zero access to message text.
 *
 * Returns at most `candidates.length` verdicts. If the model fails to
 * produce valid JSON we return an empty array (and the caller falls back
 * to the heuristic).
 */
export async function classifySendersForUnsubscribe(
  client: AiClient,
  candidates: Array<{
    email: string;
    sampleSubjects: string[];
    trashed: number;
    total: number;
    hasListUnsubscribe: boolean;
  }>,
): Promise<UnsubscribeVerdict[]> {
  if (candidates.length === 0) return [];
  const out = await client.chat({
    messages: [
      { role: 'system', content: classifySendersForUnsubscribePrompt() },
      { role: 'user', content: JSON.stringify(candidates.slice(0, 25)) },
    ],
    format: 'json',
    temperature: 0,
  });
  try {
    const parsed = JSON.parse(out) as { items?: UnsubscribeVerdict[] };
    return (parsed.items ?? []).filter(
      (v) =>
        v && typeof v.email === 'string' && ['unsubscribe', 'mute', 'keep'].includes(v.verdict),
    );
  } catch {
    return [];
  }
}
