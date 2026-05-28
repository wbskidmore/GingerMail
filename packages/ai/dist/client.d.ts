import { type AiSettings, type Message, type MessageThread, type Task } from '@gingermail/core';
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
    testConnection(): Promise<{
        ok: boolean;
        error?: string;
        model?: string;
    }>;
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
export declare class CloudAiClient implements AiClient {
    private readonly baseUrl;
    private readonly apiKey;
    readonly modelName: string;
    private readonly vendor;
    private readonly privacy;
    constructor(baseUrl: string, apiKey: string, modelName: string, vendor: 'openai' | 'anthropic' | 'google', privacy?: CloudClientPrivacy);
    get provenance(): string;
    chat(input: CompletionInput): Promise<string>;
    /**
     * Apply main-process privacy posture to a request before it leaves the
     * machine. Today: opt-in PII redaction. Idempotent; safe to call twice.
     */
    private applyPrivacy;
    private chatOpenAi;
    private chatAnthropic;
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
    private chatGemini;
    testConnection(): Promise<{
        ok: boolean;
        error?: string;
        model?: string;
    }>;
}
/** Local Ollama client (http://localhost:11434/api/chat). */
export declare class OllamaClient implements AiClient {
    private readonly baseUrl;
    readonly modelName: string;
    constructor(baseUrl: string, modelName: string);
    get provenance(): string;
    chat(input: CompletionInput): Promise<string>;
    testConnection(): Promise<{
        ok: boolean;
        error?: string;
        model?: string;
    }>;
    /**
     * Block until `/api/tags` responds 200 or the deadline expires. Returns
     * true on success, false on timeout. Useful when the caller has just
     * spawned the sidecar and needs to gate the first chat() call on it.
     */
    waitForReady(timeoutMs?: number): Promise<boolean>;
    /** Tag the locally-installed models (Ollama `/api/tags`). */
    listInstalledModels(): Promise<Array<{
        name: string;
        sizeBytes: number;
        modifiedAt: number;
    }>>;
    /**
     * Stream a model download. The provided callback is invoked for every
     * NDJSON line Ollama emits; the renderer translates these into a Mantine
     * `Progress` bar. Resolves when the server closes the stream.
     */
    pullModel(name: string, onProgress: (evt: {
        status: string;
        completed?: number;
        total?: number;
    }) => void): Promise<void>;
    deleteModel(name: string): Promise<void>;
}
export declare function buildAiClient(settings: AiSettings): AiClient | null;
export declare function summarizeThread(client: AiClient, thread: MessageThread, messages: Message[]): Promise<{
    summary: string;
    actionItems: string[];
}>;
export declare function draftReply(client: AiClient, thread: MessageThread, messages: Message[], opts: {
    tone?: string;
    intent?: string;
}): Promise<string>;
export declare function extractActionItems(client: AiClient, message: Message, listId: string): Promise<Task[]>;
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
export declare function buildNlSearchSpec(client: AiClient, query: string): Promise<NlSearchSpec | null>;
export declare function prioritizeInbox(client: AiClient, messages: Message[]): Promise<Map<string, 'high' | 'medium' | 'low'>>;
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
export declare function classifySendersForUnsubscribe(client: AiClient, candidates: Array<{
    email: string;
    sampleSubjects: string[];
    trashed: number;
    total: number;
    hasListUnsubscribe: boolean;
}>): Promise<UnsubscribeVerdict[]>;
//# sourceMappingURL=client.d.ts.map