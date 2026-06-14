import {
  IconAlertOctagon,
  IconArchive,
  IconClock,
  IconCornerUpLeft,
  IconCornerUpLeftDouble,
  IconCornerUpRight,
  IconFolderSymlink,
  IconMail,
  IconMailOpened,
  IconPrinter,
  IconSparkles,
  IconStar,
  IconStarFilled,
  IconTrash,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import type { Draft, MailActionId, Message } from '@gingermail/core';
import type { Api } from '../ipcBridge.js';

/**
 * Context every action's `run()` and `isAvailable()` receive. We pass the
 * full Message rather than just the id so isAvailable() can decide things
 * like "hide Reply All if there's no Cc and only one To".
 */
export interface MailActionContext {
  message: Message;
  api: Api;
  /** Renderer-side callbacks for UI-only side effects (opening Composer, etc.). */
  ui: {
    openCompose(draft: Draft, replyTo: Message): void;
    confirmDestructive(input: {
      title: string;
      body: string;
      confirmLabel: string;
    }): Promise<boolean>;
    notify(
      title: string,
      message: string,
      opts?: { color?: 'red' | 'green' | 'orange' | 'ginger'; undo?: () => Promise<void> | void },
    ): void;
    /** Re-fetch threads/messages after a server-side change. */
    reloadAfterMove(): void;
  };
}

export interface MailAction {
  id: MailActionId;
  /** Short verb shown in tooltips and the Settings drag-to-reorder UI. */
  label: string;
  /** Same icon used in the toolbar, hover-strip, context menu, and Settings. */
  icon: ReactNode;
  /** `useHotkeys` spec, e.g. 'mod+Backspace'. Omit for non-keyboard actions. */
  hotkey?: string;
  /** When true, the toolbar paints this action with a red colour. */
  destructive?: boolean;
  /** Decide whether this action makes sense for the given message. */
  isAvailable?: (ctx: MailActionContext) => boolean;
  run: (ctx: MailActionContext) => Promise<void>;
}

const SIZE = 16;

/**
 * Canonical mail-action registry. Order in this array does NOT decide the
 * order in the toolbar — that comes from `AppearanceSettings.mailToolbar`.
 * This array's order is the order used in the Settings drag-to-reorder UI's
 * "Hidden" column when an action has never been seen before.
 */
export const MAIL_ACTIONS: MailAction[] = [
  {
    id: 'reply',
    label: 'Reply',
    icon: <IconCornerUpLeft size={SIZE} />,
    hotkey: 'R',
    run: async ({ message, api, ui }) => {
      const draft = await api.mail.reply({ id: message.id, all: false });
      ui.openCompose(draft, message);
    },
  },
  {
    id: 'replyAll',
    label: 'Reply all',
    icon: <IconCornerUpLeftDouble size={SIZE} />,
    hotkey: 'shift+R',
    isAvailable: ({ message }) => {
      const recipients = (message.to?.length ?? 0) + (message.cc?.length ?? 0);
      return recipients > 1;
    },
    run: async ({ message, api, ui }) => {
      const draft = await api.mail.reply({ id: message.id, all: true });
      ui.openCompose(draft, message);
    },
  },
  {
    id: 'forward',
    label: 'Forward',
    icon: <IconCornerUpRight size={SIZE} />,
    hotkey: 'shift+F',
    run: async ({ message, api, ui }) => {
      const draft = await api.mail.forward({ id: message.id });
      ui.openCompose(draft, message);
    },
  },
  {
    id: 'archive',
    label: 'Archive',
    icon: <IconArchive size={SIZE} />,
    hotkey: 'E',
    run: async ({ message, api, ui }) => {
      try {
        const r = await api.mail.archive({ id: message.id });
        ui.notify('Archived', message.subject || '(no subject)', {
          undo: r.previousFolderId
            ? () =>
                api.mail.move({ id: r.newId, folderId: r.previousFolderId }).then(() => undefined)
            : undefined,
        });
        ui.reloadAfterMove();
      } catch (e) {
        ui.notify('Archive failed', (e as Error).message, { color: 'red' });
      }
    },
  },
  {
    id: 'trash',
    label: 'Move to trash',
    icon: <IconTrash size={SIZE} />,
    hotkey: 'mod+Backspace',
    destructive: true,
    run: async ({ message, api, ui }) => {
      const ok = await ui.confirmDestructive({
        title: 'Move to trash?',
        body: 'This message will be moved to the trash on the server.',
        confirmLabel: 'Move to trash',
      });
      if (!ok) return;
      try {
        const r = await api.mail.trash({ id: message.id });
        ui.notify('Moved to trash', message.subject || '(no subject)', {
          undo: r.previousFolderId
            ? () =>
                api.mail.move({ id: r.newId, folderId: r.previousFolderId }).then(() => undefined)
            : undefined,
        });
        ui.reloadAfterMove();
      } catch (e) {
        ui.notify('Trash failed', (e as Error).message, { color: 'red' });
      }
    },
  },
  {
    id: 'move',
    label: 'Move to folder',
    icon: <IconFolderSymlink size={SIZE} />,
    hotkey: 'V',
    // Move is wired through MailToolbar's folder picker popover; the run()
    // here only fires if the user invokes via right-click / hotkey, where
    // we need a UI step. Renderer wraps this through a popover before
    // calling api.mail.move() directly, so the registry's run() is a no-op
    // notice rather than a silent failure.
    run: async ({ ui }) => {
      ui.notify('Move to folder', 'Use the Move \u22ee menu in the toolbar to pick a folder.', {
        color: 'orange',
      });
    },
  },
  {
    id: 'markUnread',
    label: 'Mark as unread',
    icon: <IconMailOpened size={SIZE} />,
    hotkey: 'shift+U',
    run: async ({ message, api, ui }) => {
      await api.mail.markRead({ id: message.id, read: false });
      ui.notify('Marked unread', message.subject || '(no subject)');
    },
  },
  {
    id: 'flag',
    label: 'Flag',
    icon: <IconStar size={SIZE} />,
    hotkey: 'S',
    run: async ({ message, api, ui }) => {
      await api.mail.setFlag({ id: message.id, flag: message.flagged ? 'unstar' : 'star' });
      ui.notify(message.flagged ? 'Unflagged' : 'Flagged', message.subject || '(no subject)');
    },
  },
  {
    id: 'snooze',
    label: 'Snooze',
    icon: <IconClock size={SIZE} />,
    // Snooze is rendered as a Menu by MailToolbar so the picker UX matches
    // the existing SnoozeMenu in @gingermail/ui-kit. run() exists only for
    // hotkey/context-menu fallback, snoozing for 1 hour by default.
    hotkey: 'Z',
    run: async ({ message, api, ui }) => {
      const until = Date.now() + 60 * 60 * 1000;
      await api.mail.snooze({ id: message.id, until });
      ui.notify('Snoozed for 1h', message.subject || '(no subject)');
    },
  },
  {
    id: 'spam',
    label: 'Report spam',
    icon: <IconAlertOctagon size={SIZE} />,
    hotkey: 'shift+J',
    destructive: true,
    isAvailable: ({ message }) => {
      // Hide on messages already in the spam folder.
      return !(
        message.folderId.toLowerCase().includes('spam') ||
        message.folderId.toLowerCase().includes('junk')
      );
    },
    run: async ({ message, api, ui }) => {
      const ok = await ui.confirmDestructive({
        title: 'Report as spam?',
        body: 'GingerMail will tell the provider this is junk and move it accordingly.',
        confirmLabel: 'Report spam',
      });
      if (!ok) return;
      try {
        const r = await api.mail.markSpam({ id: message.id });
        ui.notify('Reported spam', message.subject || '(no subject)', {
          undo: r.previousFolderId
            ? () =>
                api.mail.move({ id: r.newId, folderId: r.previousFolderId }).then(() => undefined)
            : undefined,
        });
        ui.reloadAfterMove();
      } catch (e) {
        ui.notify('Spam report failed', (e as Error).message, { color: 'red' });
      }
    },
  },
  {
    id: 'print',
    label: 'Print',
    icon: <IconPrinter size={SIZE} />,
    hotkey: 'mod+P',
    run: async ({ message, api, ui }) => {
      try {
        await api.mail.print({ id: message.id });
      } catch (e) {
        ui.notify('Print failed', (e as Error).message, { color: 'red' });
      }
    },
  },
  {
    id: 'aiSummarise',
    label: 'Summarise with AI',
    icon: <IconSparkles size={SIZE} />,
    hotkey: 'mod+I',
    run: async ({ message, api, ui }) => {
      try {
        await api.ai.summarizeThread(message.threadId);
        ui.notify('AI summary', 'Opened the summary modal.', { color: 'ginger' });
      } catch (e) {
        ui.notify('AI is off', (e as Error).message, { color: 'orange' });
      }
    },
  },
];

export const MAIL_ACTION_BY_ID: Record<MailActionId, MailAction> = MAIL_ACTIONS.reduce(
  (acc, a) => {
    acc[a.id] = a;
    return acc;
  },
  {} as Record<MailActionId, MailAction>,
);

/** Icon variant used in the flag toolbar entry when the message is starred. */
export const FLAG_ON_ICON = <IconStarFilled size={SIZE} />;

/** Icon used to indicate "unread" in compact rows. */
export const READ_ICON = <IconMail size={SIZE} />;

/** Order = catalogue order; useful for the Settings drag-to-reorder Hidden column. */
export const ALL_ACTION_IDS: MailActionId[] = MAIL_ACTIONS.map((a) => a.id);

/**
 * Split the registry by the user's settings.
 *  - visible : ids in toolbar (in user-defined order)
 *  - overflow: ids in More menu (in user-defined order)
 *  - hidden  : everything else (cataloged so Settings can rehydrate it)
 */
export function partitionActions(settings: { visible: MailActionId[]; overflow: MailActionId[] }): {
  visible: MailActionId[];
  overflow: MailActionId[];
  hidden: MailActionId[];
} {
  const seen = new Set<MailActionId>([...settings.visible, ...settings.overflow]);
  const hidden = ALL_ACTION_IDS.filter((id) => !seen.has(id));
  return {
    visible: settings.visible.filter((id) => id in MAIL_ACTION_BY_ID),
    overflow: settings.overflow.filter((id) => id in MAIL_ACTION_BY_ID),
    hidden,
  };
}
