import { AI_VENDOR_HOSTS, redactPii } from '@gingermail/core';
import { classifySendersForUnsubscribePrompt, draftReplyPrompt, extractActionItemsPrompt, nlSearchPrompt, prioritizeInboxPrompt, summarizeThreadPrompt, } from './prompts.js';
/**
 * Guard against egress to anything other than the configured vendor host.
 * Throws (instead of returning) so callers don't accidentally swallow the
 * failure and silently fall through to a worse default.
 */
function assertCloudUrlAllowed(url, vendor, baseUrl) {
    let parsed;
    try {
        parsed = new URL(url);
    }
    catch {
        throw new Error(`[ai] refusing to call malformed URL`);
    }
    if (parsed.protocol !== 'https:') {
        throw new Error(`[ai] refusing non-HTTPS cloud call to ${parsed.hostname}`);
    }
    const allowed = new Set(AI_VENDOR_HOSTS[vendor]);
    try {
        const base = new URL(baseUrl);
        if (base.hostname)
            allowed.add(base.hostname);
    }
    catch {
        /* malformed baseUrl: vendor list only */
    }
    const ok = Array.from(allowed).some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
    if (!ok) {
        // Log the host explicitly but never the URL (URL may carry tokens).
        throw new Error(`[ai] refusing call to non-allowlisted host '${parsed.hostname}' (vendor=${vendor})`);
    }
}
/** Cloud AI client. Supports OpenAI-compatible, Anthropic, and Google Gemini. */
export class CloudAiClient {
    baseUrl;
    apiKey;
    modelName;
    vendor;
    privacy;
    constructor(baseUrl, apiKey, modelName, vendor, privacy = { redactPii: false }) {
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.modelName = modelName;
        this.vendor = vendor;
        this.privacy = privacy;
    }
    get provenance() {
        return `cloud:${this.vendor}:${this.modelName}`;
    }
    async chat(input) {
        const filtered = this.applyPrivacy(input);
        if (this.vendor === 'anthropic')
            return this.chatAnthropic(filtered);
        if (this.vendor === 'google')
            return this.chatGemini(filtered);
        return this.chatOpenAi(filtered);
    }
    /**
     * Apply main-process privacy posture to a request before it leaves the
     * machine. Today: opt-in PII redaction. Idempotent; safe to call twice.
     */
    applyPrivacy(input) {
        if (!this.privacy.redactPii)
            return input;
        return {
            ...input,
            messages: input.messages.map((m) => ({ ...m, content: redactPii(m.content).text })),
        };
    }
    async chatOpenAi(input) {
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
        if (!res.ok)
            throw new Error(`AI error: ${res.status} ${await res.text()}`);
        const json = (await res.json());
        return json.choices?.[0]?.message?.content ?? '';
    }
    async chatAnthropic(input) {
        const url = `${this.baseUrl.replace(/\/$/, '')}/messages`;
        assertCloudUrlAllowed(url, this.vendor, this.baseUrl);
        const system = input.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
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
        if (!res.ok)
            throw new Error(`AI error: ${res.status} ${await res.text()}`);
        const json = (await res.json());
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
    async chatGemini(input) {
        const base = this.baseUrl.replace(/\/$/, '');
        const url = `${base}/models/${encodeURIComponent(this.modelName)}:generateContent`;
        assertCloudUrlAllowed(url, this.vendor, this.baseUrl);
        const systemText = input.messages
            .filter((m) => m.role === 'system')
            .map((m) => m.content)
            .join('\n');
        const turns = input.messages.filter((m) => m.role !== 'system');
        const contents = [];
        for (const t of turns) {
            const role = t.role === 'assistant' ? 'model' : 'user';
            const prev = contents[contents.length - 1];
            if (prev && prev.role === role) {
                // Gemini rejects consecutive turns with the same role; merge instead.
                prev.parts.push({ text: t.content });
            }
            else {
                contents.push({ role, parts: [{ text: t.content }] });
            }
        }
        const body = {
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
        if (!res.ok)
            throw new Error(`AI error: ${res.status} ${await res.text()}`);
        const json = (await res.json());
        if (json.promptFeedback?.blockReason) {
            // Gemini blocked the prompt outright (safety filters). Surface the
            // reason so the caller can decide whether to fall back to heuristics
            // rather than silently returning an empty string.
            throw new Error(`Gemini blocked the prompt: ${json.promptFeedback.blockReason}`);
        }
        const parts = json.candidates?.[0]?.content?.parts ?? [];
        return parts.map((p) => p.text ?? '').join('');
    }
    async testConnection() {
        try {
            const out = await this.chat({ messages: [{ role: 'user', content: 'reply with the single word OK' }], maxTokens: 10 });
            return { ok: out.trim().length > 0, model: this.modelName };
        }
        catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }
}
/** Local Ollama client (http://localhost:11434/api/chat). */
export class OllamaClient {
    baseUrl;
    modelName;
    constructor(baseUrl, modelName) {
        this.baseUrl = baseUrl;
        this.modelName = modelName;
    }
    get provenance() {
        return `local:${this.modelName}`;
    }
    async chat(input) {
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
        if (!res.ok)
            throw new Error(`Ollama error: ${res.status} ${await res.text()}`);
        const json = (await res.json());
        return json.message?.content ?? '';
    }
    async testConnection() {
        try {
            const tagRes = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/tags`);
            if (!tagRes.ok)
                return { ok: false, error: `Ollama not reachable at ${this.baseUrl}` };
            return { ok: true, model: this.modelName };
        }
        catch (e) {
            return { ok: false, error: e instanceof Error ? e.message : String(e) };
        }
    }
    /**
     * Block until `/api/tags` responds 200 or the deadline expires. Returns
     * true on success, false on timeout. Useful when the caller has just
     * spawned the sidecar and needs to gate the first chat() call on it.
     */
    async waitForReady(timeoutMs = 30_000) {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
            try {
                const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/tags`);
                if (r.ok)
                    return true;
            }
            catch {
                // not ready yet
            }
            await new Promise((res) => setTimeout(res, 350));
        }
        return false;
    }
    /** Tag the locally-installed models (Ollama `/api/tags`). */
    async listInstalledModels() {
        const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/tags`);
        if (!r.ok)
            throw new Error(`Ollama not reachable at ${this.baseUrl}`);
        const json = (await r.json());
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
    async pullModel(name, onProgress) {
        const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/pull`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, stream: true }),
        });
        if (!r.ok || !r.body)
            throw new Error(`Pull failed: ${r.status} ${r.statusText}`);
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
            const { value, done } = await reader.read();
            if (done)
                break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                try {
                    const evt = JSON.parse(trimmed);
                    if (evt.error)
                        throw new Error(evt.error);
                    onProgress({ status: evt.status ?? 'pulling', completed: evt.completed, total: evt.total });
                }
                catch (e) {
                    // Swallow malformed lines so a single bad chunk doesn't abort the pull.
                    if (e instanceof Error && e.message && !e.message.includes('JSON'))
                        throw e;
                }
            }
        }
    }
    async deleteModel(name) {
        const r = await fetch(`${this.baseUrl.replace(/\/$/, '')}/api/delete`, {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!r.ok)
            throw new Error(`Delete failed: ${r.status} ${r.statusText}`);
    }
}
export function buildAiClient(settings) {
    if (settings.mode === 'off')
        return null;
    if (settings.mode === 'cloud' && settings.cloud?.apiKey) {
        return new CloudAiClient(settings.cloud.baseUrl, settings.cloud.apiKey, settings.cloud.model, settings.cloud.vendor, { redactPii: Boolean(settings.privacy?.redactPii) });
    }
    if (settings.mode === 'local' && settings.local) {
        return new OllamaClient(settings.local.baseUrl, settings.local.model);
    }
    return null;
}
// ---- High-level features ----
export async function summarizeThread(client, thread, messages) {
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
        const parsed = JSON.parse(out);
        return { summary: parsed.summary ?? '', actionItems: parsed.actionItems ?? [] };
    }
    catch {
        return { summary: out.trim(), actionItems: [] };
    }
}
export async function draftReply(client, thread, messages, opts) {
    const out = await client.chat({
        messages: [
            { role: 'system', content: draftReplyPrompt(opts.tone, opts.intent) },
            {
                role: 'user',
                content: JSON.stringify({
                    subject: thread.subject,
                    history: messages.map((m) => ({ from: m.from, text: m.body?.text ?? m.snippet, date: new Date(m.date).toISOString() })),
                }),
            },
        ],
        temperature: 0.4,
    });
    return out.trim();
}
export async function extractActionItems(client, message, listId) {
    const out = await client.chat({
        messages: [
            { role: 'system', content: extractActionItemsPrompt() },
            { role: 'user', content: JSON.stringify({ subject: message.subject, text: message.body?.text ?? message.snippet }) },
        ],
        format: 'json',
        temperature: 0.1,
    });
    let items = [];
    try {
        const parsed = JSON.parse(out);
        items = parsed.items ?? [];
    }
    catch {
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
/**
 * Ask the model to turn a natural-language query into a structured search
 * spec. Returns null if the model produced unparseable JSON or junk — callers
 * are expected to fall back to plain FTS in that case.
 */
export async function buildNlSearchSpec(client, query) {
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
    const cleaned = out.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/i, '').trim();
    try {
        const parsed = JSON.parse(cleaned);
        if (typeof parsed !== 'object' || parsed === null)
            return null;
        return {
            ftsQuery: typeof parsed.ftsQuery === 'string' ? parsed.ftsQuery : '',
            after: typeof parsed.after === 'string' ? parsed.after : undefined,
            before: typeof parsed.before === 'string' ? parsed.before : undefined,
            unread: typeof parsed.unread === 'boolean' ? parsed.unread : undefined,
            explanation: typeof parsed.explanation === 'string' ? parsed.explanation : '',
        };
    }
    catch {
        return null;
    }
}
export async function prioritizeInbox(client, messages) {
    const out = await client.chat({
        messages: [
            { role: 'system', content: prioritizeInboxPrompt() },
            {
                role: 'user',
                content: JSON.stringify(messages.slice(0, 50).map((m) => ({
                    id: m.id,
                    subject: m.subject,
                    from: m.from,
                    snippet: m.snippet,
                    unread: m.unread,
                }))),
            },
        ],
        format: 'json',
        temperature: 0.1,
    });
    const map = new Map();
    try {
        const parsed = JSON.parse(out);
        for (const it of parsed.items ?? [])
            map.set(it.id, it.energy);
    }
    catch {
        // ignore
    }
    return map;
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
export async function classifySendersForUnsubscribe(client, candidates) {
    if (candidates.length === 0)
        return [];
    const out = await client.chat({
        messages: [
            { role: 'system', content: classifySendersForUnsubscribePrompt() },
            { role: 'user', content: JSON.stringify(candidates.slice(0, 25)) },
        ],
        format: 'json',
        temperature: 0,
    });
    try {
        const parsed = JSON.parse(out);
        return (parsed.items ?? []).filter((v) => v && typeof v.email === 'string' && ['unsubscribe', 'mute', 'keep'].includes(v.verdict));
    }
    catch {
        return [];
    }
}
//# sourceMappingURL=client.js.map