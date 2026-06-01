import type { IpcMainInvokeEvent } from 'electron';
import { ipcMain, log } from '../electronShim.js';
import {
  IPC_CHANNELS,
  type CuratedModelInfo,
  type InstalledModel,
  type LocalAiStatus,
  type Message,
  type MessageHeader,
  type MessageThread,
  type ModelPullProgress,
  type NlSearchResult,
  type Task,
} from '@gingermail/core';
import { CURATED_MODELS, OllamaSidecar, SIDECAR_HOST, SIDECAR_PORT } from '../ai/ollamaSidecar.js';
import { OllamaClient } from '@gingermail/ai';

/**
 * Same idempotent-handle wrapper as `register.ts` — see that file's comment.
 * Duplicating the helper (rather than exporting it) keeps each IPC module
 * self-contained, since they're commonly tested in isolation.
 *
 * Like the one in register.ts, this also applies the sender-guard so a
 * non-main-window webContents can't reach these handlers.
 */
import { isMainWindowSender, safeHandle } from './guards.js';
import { AiPullModelSchema, AiDeleteModelSchema, AiSetCloudKeySchema } from './schemas.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown;
function handle(channel: string, listener: IpcHandler): void {
  ipcMain.removeHandler(channel);
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isMainWindowSender(event)) {
      return { ok: false, error: { code: 'SENDER_DENIED', message: 'Unauthorized IPC sender' } };
    }
    return (listener as (e: IpcMainInvokeEvent, ...a: unknown[]) => unknown)(event, ...args);
  });
}
import {
  buildAiClient,
  buildNlSearchSpec,
  draftReply,
  extractActionItems,
  prioritizeInbox,
  summarizeThread,
} from '@gingermail/ai';
import type { AppContext } from '../context.js';

/**
 * Single sidecar instance shared across IPC handlers. Owned here (not by
 * `AppContext`) so the handlers module owns its own lifecycle and the
 * context stays free of dev-mode hot-reload races.
 */
const sidecar = new OllamaSidecar();

/** Start the sidecar in the background; callers may await this on quit. */
export function startOllamaSidecar(): Promise<void> {
  return sidecar.start({ timeoutMs: 20_000 }).catch((e) => {
    log.warn('[ollama-sidecar] start failed:', e);
  });
}

export function stopOllamaSidecar(): Promise<void> {
  return sidecar.stop().catch((e) => {
    log.warn('[ollama-sidecar] stop failed:', e);
  });
}

function localClient(): OllamaClient {
  return new OllamaClient(`http://${SIDECAR_HOST}:${SIDECAR_PORT}`, 'placeholder');
}

/**
 * Returns a copy of `settings.ai` with the cloud `apiKey` filled in from the
 * TokenVault (the OS keychain). `settings.ai.cloud.apiKey` is never read
 * directly from `prefs.json` any more — the prefs store doesn't even know
 * the key exists. This keeps cloud AI keys out of the world-readable
 * `~/Library/Application Support/GingerMail/prefs.json` file.
 */
export function effectiveAiSettings(ctx: AppContext): ReturnType<AppContext['getSettings']>['ai'] {
  const ai = ctx.getSettings().ai;
  if (ai.mode !== 'cloud' || !ai.cloud) return ai;
  const key = ctx.vault.readAppSecret('aiCloudApiKey');
  return { ...ai, cloud: { ...ai.cloud, apiKey: key ?? '' } };
}

export function handleAi(ctx: AppContext): void {
  handle(IPC_CHANNELS.aiSummarize, async (_e, threadId: string) => {
    const client = buildAiClient(effectiveAiSettings(ctx));
    if (!client) throw new Error('AI is off. Configure it in Settings.');
    const messages = ctx.db.listMessages({ threadId });
    const thread: MessageThread = synthesisThread(messages, threadId);
    const fullMessages = messages.map((m) => ctx.db.getMessage(m.id)).filter(Boolean) as Message[];
    return summarizeThread(client, thread, fullMessages);
  });

  handle(IPC_CHANNELS.aiDraftReply, async (_e, input: { threadId: string; tone?: string; intent?: string }) => {
    const client = buildAiClient(effectiveAiSettings(ctx));
    if (!client) throw new Error('AI is off. Configure it in Settings.');
    const messages = ctx.db.listMessages({ threadId: input.threadId });
    const thread = synthesisThread(messages, input.threadId);
    const fullMessages = messages.map((m) => ctx.db.getMessage(m.id)).filter(Boolean) as Message[];
    return draftReply(client, thread, fullMessages, { tone: input.tone, intent: input.intent });
  });

  handle(IPC_CHANNELS.aiExtractActions, async (_e, input: { messageId?: string; threadId?: string }) => {
    const client = buildAiClient(effectiveAiSettings(ctx));
    if (!client) throw new Error('AI is off. Configure it in Settings.');
    const taskLists = ctx.db.listTaskLists();
    const listId = taskLists[0]?.id ?? 'local:default';
    if (!taskLists.length) ctx.db.upsertTaskLists([{ id: 'local:default', accountId: 'local', name: 'Local tasks' }]);
    if (input.messageId) {
      const message = ctx.db.getMessage(input.messageId);
      if (!message) throw new Error('Message not found');
      const tasks: Task[] = await extractActionItems(client, message, listId);
      ctx.db.upsertTasks(tasks);
      return tasks;
    }
    if (input.threadId) {
      const heads = ctx.db.listMessages({ threadId: input.threadId, limit: 20 });
      const combined = heads.map((h) => ctx.db.getMessage(h.id)).filter(Boolean) as Message[];
      const tasks: Task[] = [];
      for (const m of combined) {
        const ts = await extractActionItems(client, m, listId);
        tasks.push(...ts);
      }
      ctx.db.upsertTasks(tasks);
      return tasks;
    }
    return [];
  });

  handle(IPC_CHANNELS.aiPrioritize, async () => {
    const client = buildAiClient(effectiveAiSettings(ctx));
    if (!client) throw new Error('AI is off. Configure it in Settings.');
    const heads = ctx.db.listMessages({ limit: 50 });
    const full = heads.map((h) => ctx.db.getMessage(h.id)).filter(Boolean) as Message[];
    const map = await prioritizeInbox(client, full);
    for (const [id, energy] of map) {
      ctx.db.setMessageFlags(id, { energyTag: energy });
    }
  });

  handle(IPC_CHANNELS.aiNlSearch, async (_e, query: string): Promise<NlSearchResult> => {
    const trimmed = (query ?? '').trim();
    const fallback = (): NlSearchResult => ({
      messages: trimmed ? ctx.db.searchMessages(trimmed, 100) : [],
      usedAi: false,
      query: trimmed,
    });
    if (!trimmed) return fallback();

    const client = buildAiClient(effectiveAiSettings(ctx));
    if (!client) return fallback();

    try {
      const spec = await buildNlSearchSpec(client, trimmed);
      if (!spec) {
        log.warn('[ai] NL search: model returned no usable spec, falling back to FTS');
        return fallback();
      }
      const after = spec.after ? Date.parse(spec.after) || undefined : undefined;
      const before = spec.before ? Date.parse(spec.before) || undefined : undefined;
      const messages = ctx.db.searchMessagesAdvanced(
        { ftsQuery: spec.ftsQuery, after, before, unread: spec.unread },
        100,
      );
      return {
        messages,
        usedAi: true,
        query: spec.ftsQuery || trimmed,
        explanation: spec.explanation || undefined,
        model: client.modelName,
      };
    } catch (err) {
      log.warn('[ai] NL search failed, falling back to FTS:', err);
      return fallback();
    }
  });

  handle(IPC_CHANNELS.aiTest, async () => {
    const client = buildAiClient(effectiveAiSettings(ctx));
    if (!client) return { ok: false, error: 'AI mode is off' };
    return client.testConnection();
  });

  // ---- Local AI / Ollama sidecar ----

  handle(IPC_CHANNELS.aiLocalStatus, async (): Promise<LocalAiStatus> => {
    const s = sidecar.status();
    // `binaryFound` is recomputed on every call so the settings panel
    // re-reflects state after a build that adds the bundled binary.
    let binaryFound = false;
    try {
      // Touch the sidecar resolver lazily; if the binary is missing it
      // reports lastError after the first start() attempt.
      const probe = await fetch(`http://${SIDECAR_HOST}:${SIDECAR_PORT}/api/tags`).catch(() => null);
      binaryFound = (probe?.ok ?? false) || s.running;
    } catch {
      binaryFound = false;
    }
    return {
      running: s.running,
      reusingExternal: s.reusingExternal,
      binaryFound,
      uptimeMs: s.uptimeMs,
      lastError: s.lastError,
    };
  });

  handle(IPC_CHANNELS.aiListAvailableModels, async (): Promise<CuratedModelInfo[]> => {
    return CURATED_MODELS.map((m) => ({ ...m }));
  });

  handle(IPC_CHANNELS.aiListInstalledModels, async (): Promise<InstalledModel[]> => {
    try {
      const client = localClient();
      return await client.listInstalledModels();
    } catch (e) {
      log.warn('[ai] listInstalledModels failed:', e);
      return [];
    }
  });

  safeHandle(IPC_CHANNELS.aiPullModel, AiPullModelSchema, async (input) => {
    const client = localClient();
    const send = (evt: ModelPullProgress): void => {
      ctx.mainWindow?.webContents.send(IPC_CHANNELS.aiPullProgress, evt);
    };
    try {
      await client.pullModel(input.name, ({ status, completed, total }) =>
        send({ name: input.name, status, completed, total }),
      );
      send({ name: input.name, status: 'success', done: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      send({ name: input.name, status: 'error', done: true, error: msg });
      throw e;
    }
  });

  safeHandle(IPC_CHANNELS.aiDeleteModel, AiDeleteModelSchema, async (input) => {
    const client = localClient();
    await client.deleteModel(input.name);
  });

  // ---- Cloud AI key vault (kept out of prefs.json) ----

  handle(IPC_CHANNELS.aiGetCloudKeyStatus, async (): Promise<{ configured: boolean; last4?: string }> => {
    const key = ctx.vault.readAppSecret('aiCloudApiKey');
    if (!key) return { configured: false };
    const last4 = key.slice(-4);
    return { configured: true, last4 };
  });

  safeHandle(IPC_CHANNELS.aiSetCloudKey, AiSetCloudKeySchema, async (input) => {
    const key = (input?.key ?? '').trim();
    if (!key) throw new Error('Key cannot be empty');
    if (key.length < 8 || key.length > 512) {
      throw new Error('Key looks malformed (expected 8-512 chars)');
    }
    ctx.vault.writeAppSecret('aiCloudApiKey', key);
  });

  handle(IPC_CHANNELS.aiClearCloudKey, async () => {
    ctx.vault.writeAppSecret('aiCloudApiKey', undefined);
  });
}

function synthesisThread(messages: MessageHeader[], threadId: string): MessageThread {
  return {
    id: threadId,
    accountId: messages[0]?.accountId ?? '',
    subject: messages[0]?.subject ?? '',
    participants: dedupAddresses(messages.flatMap((m) => [m.from, ...m.to])),
    messageIds: messages.map((m) => m.id),
    lastMessageAt: Math.max(0, ...messages.map((m) => m.date)),
    unread: messages.some((m) => m.unread),
    flagged: messages.some((m) => m.flagged),
  };
}

function dedupAddresses<T extends { email: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of items) {
    const key = it.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}
