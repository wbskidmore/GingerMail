import {
  IPC_CHANNELS,
  defaultDetectionSettings,
  type DetectionMode,
  type DetectionSettings,
  type Suggestion,
  type SuggestionCategory,
} from '@gingermail/core';
import { buildAiClient, detectActionables } from '@gingermail/ai';
import { Notification, log } from '../electronShim.js';
import type { AppContext } from '../context.js';
import { effectiveAiSettings } from '../ipc/aiHandlers.js';
import { applySuggestion, autoSaveDraft, newSuggestionId } from './suggestionActions.js';

/** A message handed to the detection agent for scanning. */
export interface DetectionItem {
  source: 'chat' | 'mail';
  /** Provider message id (used for dedupe + linking). */
  sourceId: string;
  accountId: string;
  /** Human-readable context shown in the review panel (channel / sender). */
  sourceLabel?: string;
  /** The message text to scan. */
  text: string;
  /** Optional extra context (subject line, conversation name). */
  context?: string;
}

/**
 * Background "detection agent": scans incoming chat/mail messages with the
 * configured AI client (local Ollama by default) for actionable items, then
 * per-category either auto-creates the entity or queues a pending suggestion
 * for the review panel.
 *
 * A small serial queue (concurrency 1) keeps us from hammering a local model
 * when a burst of messages arrives. Empty/short messages are skipped cheaply.
 */
class DetectionAgent {
  private queue: Array<{ ctx: AppContext; item: DetectionItem }> = [];
  private active = 0;
  private readonly concurrency = 1;
  /** Cap the queue so a flood of messages can't grow it unbounded. */
  private readonly maxQueue = 200;

  enqueue(ctx: AppContext, item: DetectionItem): void {
    const det = detectionSettings(ctx);
    if (!det.enabled) return;
    if (item.source === 'chat' && !det.scanChat) return;
    if (item.source === 'mail' && !det.scanMail) return;
    if (!item.text || item.text.trim().length < 8) return;
    // If every category is off there is nothing to do.
    if (Object.values(det.categories).every((m) => m === 'off')) return;
    if (this.queue.length >= this.maxQueue) {
      log.warn('[detection] queue full, dropping item');
      return;
    }
    this.queue.push({ ctx, item });
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.active >= this.concurrency) return;
    const next = this.queue.shift();
    if (!next) return;
    this.active += 1;
    try {
      await this.process(next.ctx, next.item);
    } catch (err) {
      log.warn('[detection] process failed:', err);
    } finally {
      this.active -= 1;
      if (this.queue.length) void this.pump();
    }
  }

  private async process(ctx: AppContext, item: DetectionItem): Promise<void> {
    const det = detectionSettings(ctx);
    const client = buildAiClient(effectiveAiSettings(ctx));
    if (!client) return;

    const detected = await detectActionables(client, { text: item.text, context: item.context });
    if (!detected.length) return;

    let pendingCount = 0;
    for (const d of detected) {
      const mode = det.categories[d.category];
      if (mode === 'off') continue;

      const suggestion: Suggestion = {
        id: newSuggestionId(),
        source: item.source,
        sourceId: item.sourceId,
        accountId: item.accountId,
        sourceLabel: item.sourceLabel,
        category: d.category,
        title: d.title,
        payload: d.payload,
        confidence: d.confidence,
        status: mode === 'auto' ? 'auto-added' : 'pending',
        createdAt: Date.now(),
      };

      if (mode === 'auto') {
        const res = applySuggestion(ctx, suggestion);
        if (res.entityId) suggestion.createdEntityId = res.entityId;
        // Email auto-add: never send — try to persist as a draft instead.
        if (d.category === 'email' && res.draft) {
          const draftId = await autoSaveDraft(ctx, res.draft);
          if (draftId) suggestion.createdEntityId = draftId;
        }
        if (!res.ok) {
          // Couldn't auto-create (e.g. missing date) — fall back to asking.
          suggestion.status = 'pending';
        }
      }

      const inserted = ctx.db.insertSuggestions([suggestion]);
      if (inserted.length && suggestion.status === 'pending') pendingCount += 1;
    }

    // Tell the renderer to refresh the panel/badge whenever we touched anything.
    ctx.mainWindow?.webContents.send(IPC_CHANNELS.suggestionsChanged);

    if (pendingCount > 0) this.notify(ctx, pendingCount);
  }

  private notify(ctx: AppContext, count: number): void {
    const settings = ctx.getSettings();
    if (!settings.notifications.enabled) return;
    if (ctx.focusState.active) return; // Focus Mode suppresses detection pings.
    try {
      if (Notification.isSupported()) {
        new Notification({
          title: 'GingerMail found something',
          body: `${count} suggestion${count === 1 ? '' : 's'} waiting for review`,
        }).show();
      }
    } catch {
      /* notifications unavailable on this platform; non-fatal */
    }
  }
}

function detectionSettings(ctx: AppContext): DetectionSettings {
  return ctx.getSettings().ai.detection ?? defaultDetectionSettings;
}

export const detectionAgent = new DetectionAgent();

/** Convenience used by the sync layers. */
export function enqueueDetection(ctx: AppContext, item: DetectionItem): void {
  detectionAgent.enqueue(ctx, item);
}

// Re-export for callers that branch on mode without importing core directly.
export type { DetectionMode, SuggestionCategory };
