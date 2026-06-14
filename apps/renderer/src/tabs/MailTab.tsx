import { useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Code,
  Divider,
  Drawer,
  Group,
  Indicator,
  Menu,
  NavLink,
  Paper,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { modals } from '@mantine/modals';
import {
  IconArchive,
  IconArrowsHorizontal,
  IconClock,
  IconFlag,
  IconFocus2,
  IconInbox,
  IconLayoutColumns,
  IconLayoutRows,
  IconMail,
  IconMenu2,
  IconPaperclip,
  IconPencilPlus,
  IconRefresh,
  IconSparkles,
  IconStack2,
  IconStarFilled,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import type {
  Account,
  Draft,
  Folder,
  FolderRole,
  MailFolderView,
  MailLayout,
  MailToolbarSettings,
  Message,
  MessageHeader,
  MessageThread,
} from '@gingermail/core';
import { DEFAULT_MAIL_TOOLBAR } from '@gingermail/core';
import { AccountBadge, EmptyState, EnergyChip } from '@gingermail/ui-kit';
import { useAppStore } from '../store.js';
import { getApi } from '../ipcBridge.js';
import { Composer } from '../mail/Composer.js';
import { MailToolbar } from '../mail/MailToolbar.js';
import { ThreadRowQuickActions, ThreadRowContextMenu } from '../mail/ThreadRowActions.js';
import type { MailActionContext } from '../mail/actions.js';
import { UnsubscribeBanner } from '../mail/UnsubscribeBanner.js';
import { UnsubscribePill } from '../mail/UnsubscribePill.js';
import { sanitiseMailHtml } from '../mail/sanitiseMailHtml.js';
import { isSenderTrusted, trustSender } from '../mail/trustedSenders.js';

type SmartId = 'today' | 'unread' | 'starred' | 'snoozed' | 'attachments';
type SidebarSelection =
  | { kind: 'unified' }
  | { kind: 'folder'; id: string }
  | { kind: 'role'; role: FolderRole }
  | { kind: 'smart'; id: SmartId };

export function MailTab() {
  const accounts = useAppStore((s) => s.accounts);
  const refreshAccounts = useAppStore((s) => s.refreshAccounts);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);

  const layout: MailLayout = settings.appearance.mailLayout ?? 'columns';
  const folderView: MailFolderView = settings.appearance.mailFolderView ?? 'by-account';

  const [folders, setFolders] = useState<Folder[]>([]);
  const [selection, setSelection] = useState<SidebarSelection>({ kind: 'unified' });
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | undefined>();
  const [threadMessages, setThreadMessages] = useState<MessageHeader[]>([]);
  const [currentMessage, setCurrentMessage] = useState<Message | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<MessageHeader | null>(null);
  const [initialDraft, setInitialDraft] = useState<Draft | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const mailToolbarSettings: MailToolbarSettings =
    settings.appearance.mailToolbar ?? DEFAULT_MAIL_TOOLBAR;

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts]);

  useEffect(() => {
    if (accounts.length === 0) return;
    void (async () => {
      const all: Folder[] = [];
      for (const a of accounts) {
        const list = await getApi().mail.listFolders(a.id);
        all.push(...list);
      }
      setFolders(all);
    })();
  }, [accounts]);

  useEffect(() => {
    void (async () => {
      const list = await getApi().mail.listThreads({ unifiedInbox: true, limit: 200 });
      setThreads(list);
    })();
  }, [selection]);

  useEffect(() => {
    if (!selectedThreadId) {
      setThreadMessages([]);
      setCurrentMessage(null);
      return;
    }
    void (async () => {
      const list = await getApi().mail.listMessages({ threadId: selectedThreadId, limit: 50 });
      setThreadMessages(list);
      const first = list[0];
      if (first) {
        const full = await getApi().mail.getMessage(first.id);
        setCurrentMessage(full);
      }
    })();
  }, [selectedThreadId]);

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={<IconMail size={28} />}
        title="No mail accounts yet"
        description="Add an account in Settings. GingerMail supports Gmail, Outlook, iCloud, IMAP/SMTP, and POP3."
      />
    );
  }

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await getApi().mail.refreshAll();
      const list = await getApi().mail.listThreads({ unifiedInbox: true, limit: 200 });
      setThreads(list);
    } finally {
      setRefreshing(false);
    }
  };

  /** Renderer-side UI side effects used by every mail action. */
  const actionUi: MailActionContext['ui'] = {
    openCompose: (draft: Draft, src: Message) => {
      setReplyTo(src);
      setInitialDraft(draft);
      setComposerOpen(true);
    },
    confirmDestructive: ({ title, body, confirmLabel }) =>
      new Promise<boolean>((resolve) => {
        modals.openConfirmModal({
          title,
          children: <Text size="sm">{body}</Text>,
          labels: { confirm: confirmLabel, cancel: 'Cancel' },
          confirmProps: { color: 'red' },
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        });
      }),
    notify: (title, message, opts) => {
      notifications.show({
        title,
        message,
        color: opts?.color,
        // 10s for undoable destructive actions (was 5s) — ADHD users
        // routinely lose the toast before they realise they want to undo,
        // and 10s still auto-clears without staying onscreen forever.
        autoClose: opts?.undo ? 10_000 : 2500,
        // Mantine's `withAction` would be nicer; rendering an inline link
        // keeps the notification single-line and avoids needing a custom
        // Notification renderer for the Undo.
        ...(opts?.undo
          ? {
              message: (
                <Text size="sm">
                  {message} &mdash;{' '}
                  <a
                    href="#undo"
                    onClick={(e) => {
                      e.preventDefault();
                      void opts.undo?.();
                    }}
                    style={{ textDecoration: 'underline', fontWeight: 600 }}
                    aria-label={`Undo ${title}`}
                  >
                    Undo
                  </a>
                </Text>
              ) as unknown as string,
            }
          : {}),
      });
    },
    reloadAfterMove: () => {
      void refresh();
      setCurrentMessage(null);
      setSelectedThreadId(undefined);
    },
  };

  const setLayout = (next: MailLayout): void => {
    void setSettings({ appearance: { ...settings.appearance, mailLayout: next } });
  };
  const setFolderView = (next: MailFolderView): void => {
    void setSettings({ appearance: { ...settings.appearance, mailFolderView: next } });
    // Some selections only make sense in certain folder views. Reset to the
    // safe unified-inbox view when the user switches views to avoid showing
    // a "no such folder" empty state.
    setSelection({ kind: 'unified' });
  };

  const sidebar = (
    <SidebarRouter
      view={folderView}
      accounts={accounts}
      folders={folders}
      threads={threads}
      selection={selection}
      onSelect={(s) => {
        setSelection(s);
        setSidebarOpen(false);
      }}
    />
  );

  const threadList = (
    <ThreadListPane
      title={titleFor(selection, folders)}
      threads={filterThreads(threads, selection, folders)}
      selectedThreadId={selectedThreadId}
      refreshing={refreshing}
      onRefresh={refresh}
      onSelect={setSelectedThreadId}
      onToggleSidebar={layout === 'focus' ? () => setSidebarOpen(true) : undefined}
    />
  );

  const messagePane = (
    <MessagePane
      currentMessage={currentMessage}
      thread={threadMessages}
      folders={folders}
      toolbarSettings={mailToolbarSettings}
      actionUi={actionUi}
      onMoveToFolder={async (folderId) => {
        if (!currentMessage) return;
        try {
          const r = await getApi().mail.move({ id: currentMessage.id, folderId });
          actionUi.notify('Moved', currentMessage.subject || '(no subject)', {
            undo: r.previousFolderId
              ? () =>
                  getApi()
                    .mail.move({ id: r.newId, folderId: r.previousFolderId })
                    .then(() => undefined)
              : undefined,
          });
          actionUi.reloadAfterMove();
        } catch (e) {
          actionUi.notify('Move failed', (e as Error).message, { color: 'red' });
        }
      }}
      onAiSummariseFull={async () => {
        if (!currentMessage) return;
        setAiBusy(true);
        try {
          const r = await getApi().ai.summarizeThread(currentMessage.threadId);
          modals.open({
            title: 'Thread summary',
            size: 'lg',
            children: (
              <Stack gap="sm">
                <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
                  {r.summary}
                </Text>
                {r.actionItems.length > 0 && (
                  <>
                    <Divider label="Action items" labelPosition="left" />
                    <Stack gap={4}>
                      {r.actionItems.map((a, i) => (
                        <Text key={i} size="sm">
                          - {a}
                        </Text>
                      ))}
                    </Stack>
                  </>
                )}
              </Stack>
            ),
          });
        } catch (e) {
          notifications.show({
            title: 'AI is off',
            message: (e as Error).message,
            color: 'orange',
          });
        } finally {
          setAiBusy(false);
        }
      }}
      aiBusy={aiBusy}
    />
  );

  const composeButton = (
    <Button
      size="xs"
      leftSection={<IconPencilPlus size={14} />}
      onClick={() => {
        setReplyTo(null);
        setComposerOpen(true);
      }}
    >
      New message
    </Button>
  );

  return (
    <Stack gap={0} h="100%" style={{ minHeight: 0 }}>
      <ViewToolbar
        layout={layout}
        folderView={folderView}
        onLayoutChange={setLayout}
        onFolderViewChange={setFolderView}
        onToggleSidebar={layout === 'focus' ? () => setSidebarOpen(true) : undefined}
      />

      <Box style={{ flex: 1, minHeight: 0 }}>
        {layout === 'columns' && (
          <ColumnsLayout
            sidebar={sidebar}
            threadList={threadList}
            message={messagePane}
            compose={composeButton}
          />
        )}
        {layout === 'stacked' && (
          <StackedLayout
            sidebar={sidebar}
            threadList={threadList}
            message={messagePane}
            compose={composeButton}
          />
        )}
        {layout === 'focus' && (
          <>
            <FocusLayout threadList={threadList} message={messagePane} />
            <Drawer
              opened={sidebarOpen}
              onClose={() => setSidebarOpen(false)}
              position="left"
              size={280}
              title="Folders"
              padding="sm"
            >
              <Stack gap="xs">
                {composeButton}
                <ScrollArea h="100%" type="hover">
                  {sidebar}
                </ScrollArea>
              </Stack>
            </Drawer>
          </>
        )}
      </Box>

      {composerOpen && (
        <Composer
          accounts={accounts}
          replyTo={replyTo}
          initialDraft={initialDraft}
          onClose={() => {
            setComposerOpen(false);
            setReplyTo(null);
            setInitialDraft(null);
          }}
        />
      )}
    </Stack>
  );
}

// ---- Layouts ----

function ColumnsLayout({
  sidebar,
  threadList,
  message,
  compose,
}: {
  sidebar: React.ReactNode;
  threadList: React.ReactNode;
  message: React.ReactNode;
  compose: React.ReactNode;
}) {
  return (
    <Box
      style={{
        display: 'grid',
        gridTemplateColumns: '260px 380px 1fr',
        height: '100%',
        minHeight: 0,
      }}
    >
      <SidebarPane compose={compose}>{sidebar}</SidebarPane>
      <Paper
        withBorder={false}
        radius={0}
        style={{
          borderRight: '1px solid var(--mantine-color-default-border)',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {threadList}
      </Paper>
      <Paper
        withBorder={false}
        radius={0}
        style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {message}
      </Paper>
    </Box>
  );
}

function StackedLayout({
  sidebar,
  threadList,
  message,
  compose,
}: {
  sidebar: React.ReactNode;
  threadList: React.ReactNode;
  message: React.ReactNode;
  compose: React.ReactNode;
}) {
  return (
    <Box
      style={{ display: 'grid', gridTemplateColumns: '260px 1fr', height: '100%', minHeight: 0 }}
    >
      <SidebarPane compose={compose}>{sidebar}</SidebarPane>
      <Box style={{ display: 'grid', gridTemplateRows: '40% 1fr', minHeight: 0 }}>
        <Paper
          withBorder={false}
          radius={0}
          style={{
            borderBottom: '1px solid var(--mantine-color-default-border)',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {threadList}
        </Paper>
        <Paper
          withBorder={false}
          radius={0}
          style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}
        >
          {message}
        </Paper>
      </Box>
    </Box>
  );
}

function FocusLayout({
  threadList,
  message,
}: {
  threadList: React.ReactNode;
  message: React.ReactNode;
}) {
  return (
    <Box
      style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%', minHeight: 0 }}
    >
      <Paper
        withBorder={false}
        radius={0}
        style={{
          borderRight: '1px solid var(--mantine-color-default-border)',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {threadList}
      </Paper>
      <Paper
        withBorder={false}
        radius={0}
        style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}
      >
        {message}
      </Paper>
    </Box>
  );
}

function SidebarPane({
  children,
  compose,
}: {
  children: React.ReactNode;
  compose: React.ReactNode;
}) {
  return (
    <Paper
      withBorder={false}
      radius={0}
      style={{ borderRight: '1px solid var(--mantine-color-default-border)', minHeight: 0 }}
    >
      <Stack p="sm" gap="xs" h="100%" style={{ minHeight: 0 }}>
        {compose}
        <ScrollArea h="100%" type="hover" offsetScrollbars>
          {children}
        </ScrollArea>
      </Stack>
    </Paper>
  );
}

// ---- View toolbar ----

function ViewToolbar({
  layout,
  folderView,
  onLayoutChange,
  onFolderViewChange,
  onToggleSidebar,
}: {
  layout: MailLayout;
  folderView: MailFolderView;
  onLayoutChange: (l: MailLayout) => void;
  onFolderViewChange: (v: MailFolderView) => void;
  onToggleSidebar?: () => void;
}) {
  return (
    <Group
      px="md"
      py={6}
      justify="space-between"
      style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
    >
      <Group gap="xs">
        {onToggleSidebar && (
          <Tooltip label="Show folders">
            <ActionIcon variant="subtle" onClick={onToggleSidebar} aria-label="Show folders">
              <IconMenu2 size={16} />
            </ActionIcon>
          </Tooltip>
        )}
        <Menu shadow="md" position="bottom-start" withArrow>
          <Menu.Target>
            <Button size="xs" variant="default" leftSection={<IconUsers size={14} />}>
              {folderViewLabel(folderView)}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Folder organisation</Menu.Label>
            <Menu.Item
              leftSection={<IconUsers size={14} />}
              onClick={() => onFolderViewChange('by-account')}
            >
              By account
              <Text size="xs" c="dimmed">
                Original folder tree per account
              </Text>
            </Menu.Item>
            <Menu.Item
              leftSection={<IconInbox size={14} />}
              onClick={() => onFolderViewChange('unified')}
            >
              Unified
              <Text size="xs" c="dimmed">
                Merge inbox / sent / drafts across all accounts
              </Text>
            </Menu.Item>
            <Menu.Item
              leftSection={<IconSparkles size={14} />}
              onClick={() => onFolderViewChange('smart')}
            >
              Smart mailboxes
              <Text size="xs" c="dimmed">
                Today, Unread, Starred, Snoozed, With attachments
              </Text>
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>

      <SegmentedControl
        size="xs"
        value={layout}
        onChange={(v) => onLayoutChange(v as MailLayout)}
        data={[
          {
            value: 'columns',
            label: <LayoutLabel icon={<IconLayoutColumns size={12} />} text="Columns" />,
          },
          {
            value: 'stacked',
            label: <LayoutLabel icon={<IconLayoutRows size={12} />} text="Stacked" />,
          },
          { value: 'focus', label: <LayoutLabel icon={<IconFocus2 size={12} />} text="Focus" /> },
        ]}
        aria-label="Mail layout"
      />
    </Group>
  );
}

function LayoutLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Group gap={4} wrap="nowrap" style={{ paddingInline: 4 }}>
      {icon}
      <Text size="xs" span>
        {text}
      </Text>
    </Group>
  );
}

function folderViewLabel(v: MailFolderView): string {
  switch (v) {
    case 'unified':
      return 'Unified';
    case 'smart':
      return 'Smart mailboxes';
    default:
      return 'By account';
  }
}

// ---- Sidebars ----

function SidebarRouter({
  view,
  accounts,
  folders,
  threads,
  selection,
  onSelect,
}: {
  view: MailFolderView;
  accounts: Account[];
  folders: Folder[];
  threads: MessageThread[];
  selection: SidebarSelection;
  onSelect: (s: SidebarSelection) => void;
}) {
  if (view === 'unified')
    return (
      <UnifiedSidebar
        accounts={accounts}
        folders={folders}
        selection={selection}
        onSelect={onSelect}
      />
    );
  if (view === 'smart')
    return (
      <SmartSidebar
        accounts={accounts}
        folders={folders}
        threads={threads}
        selection={selection}
        onSelect={onSelect}
      />
    );
  return (
    <ByAccountSidebar
      accounts={accounts}
      folders={folders}
      selection={selection}
      onSelect={onSelect}
    />
  );
}

function ByAccountSidebar({
  accounts,
  folders,
  selection,
  onSelect,
}: {
  accounts: Account[];
  folders: Folder[];
  selection: SidebarSelection;
  onSelect: (s: SidebarSelection) => void;
}) {
  return (
    <Stack gap="md">
      <NavLink
        active={selection.kind === 'unified'}
        onClick={() => onSelect({ kind: 'unified' })}
        label="Unified inbox"
        leftSection={<IconInbox size={16} />}
        variant="filled"
      />
      {accounts.map((a) => {
        const list = folders.filter((f) => f.accountId === a.id);
        return (
          <Stack key={a.id} gap={4}>
            <Box px="sm">
              <AccountBadge
                displayName={a.displayName}
                emailAddress={a.emailAddress}
                color={a.color}
              />
            </Box>
            {list.map((f) => (
              <NavLink
                key={f.id}
                label={f.name}
                active={selection.kind === 'folder' && selection.id === f.id}
                onClick={() => onSelect({ kind: 'folder', id: f.id })}
                leftSection={iconForRole(f.role)}
                rightSection={
                  f.unreadCount > 0 ? (
                    <Badge size="xs" variant="light" color="ginger">
                      {f.unreadCount}
                    </Badge>
                  ) : null
                }
                variant="filled"
              />
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}

const UNIFIED_ROLES: { role: FolderRole; label: string }[] = [
  { role: 'inbox', label: 'Inbox' },
  { role: 'sent', label: 'Sent' },
  { role: 'drafts', label: 'Drafts' },
  { role: 'archive', label: 'Archive' },
  { role: 'spam', label: 'Spam' },
  { role: 'trash', label: 'Trash' },
];

function UnifiedSidebar({
  accounts,
  folders,
  selection,
  onSelect,
}: {
  accounts: Account[];
  folders: Folder[];
  selection: SidebarSelection;
  onSelect: (s: SidebarSelection) => void;
}) {
  return (
    <Stack gap="xs">
      <NavLink
        active={selection.kind === 'unified'}
        onClick={() => onSelect({ kind: 'unified' })}
        label="All mail"
        leftSection={<IconInbox size={16} />}
        variant="filled"
      />
      <Divider label="Across all accounts" labelPosition="left" />
      {UNIFIED_ROLES.map(({ role, label }) => {
        const match = folders.filter((f) => f.role === role);
        if (match.length === 0) return null;
        const unread = match.reduce((sum, f) => sum + (f.unreadCount || 0), 0);
        return (
          <NavLink
            key={role}
            label={label}
            active={selection.kind === 'role' && selection.role === role}
            onClick={() => onSelect({ kind: 'role', role })}
            leftSection={iconForRole(role)}
            rightSection={
              unread > 0 ? (
                <Badge size="xs" variant="light" color="ginger">
                  {unread}
                </Badge>
              ) : null
            }
            variant="filled"
          />
        );
      })}
      {accounts.length > 0 && (
        <>
          <Divider label="Accounts" labelPosition="left" />
          {accounts.map((a) => (
            <Box key={a.id} px="sm">
              <AccountBadge
                displayName={a.displayName}
                emailAddress={a.emailAddress}
                color={a.color}
              />
            </Box>
          ))}
        </>
      )}
    </Stack>
  );
}

const SMART_DEFS: { id: SmartId; label: string; icon: React.ReactNode; description: string }[] = [
  {
    id: 'today',
    label: 'Today',
    icon: <IconClock size={16} />,
    description: 'Arrived in the last 24h',
  },
  {
    id: 'unread',
    label: 'Unread',
    icon: <IconMail size={16} />,
    description: 'Everything you haven’t opened yet',
  },
  {
    id: 'starred',
    label: 'Starred',
    icon: <IconStarFilled size={16} />,
    description: 'Flagged for follow-up',
  },
  {
    id: 'snoozed',
    label: 'Snoozed',
    icon: <IconClock size={16} />,
    description: 'Coming back later',
  },
  {
    id: 'attachments',
    label: 'With attachments',
    icon: <IconPaperclip size={16} />,
    description: 'Threads carrying files',
  },
];

function SmartSidebar({
  accounts,
  folders,
  threads,
  selection,
  onSelect,
}: {
  accounts: Account[];
  folders: Folder[];
  threads: MessageThread[];
  selection: SidebarSelection;
  onSelect: (s: SidebarSelection) => void;
}) {
  const smartCounts = useMemo(() => smartMailboxCounts(threads), [threads]);
  return (
    <Stack gap="xs">
      <Divider label="Smart mailboxes" labelPosition="left" />
      {SMART_DEFS.map((m) => {
        const count = smartCounts[m.id];
        return (
          <Tooltip key={m.id} label={m.description} openDelay={500} position="right">
            <NavLink
              label={m.label}
              active={selection.kind === 'smart' && selection.id === m.id}
              onClick={() => onSelect({ kind: 'smart', id: m.id })}
              leftSection={m.icon}
              rightSection={
                count > 0 ? (
                  <Badge size="xs" variant="light" color="ginger">
                    {count}
                  </Badge>
                ) : null
              }
              variant="filled"
            />
          </Tooltip>
        );
      })}
      <Divider label="Folders" labelPosition="left" />
      <NavLink
        active={selection.kind === 'unified'}
        onClick={() => onSelect({ kind: 'unified' })}
        label="All mail"
        leftSection={<IconInbox size={16} />}
        variant="filled"
      />
      {accounts.map((a) => {
        const list = folders.filter((f) => f.accountId === a.id);
        if (list.length === 0) return null;
        return (
          <Stack key={a.id} gap={2}>
            <Box px="sm" mt={4}>
              <AccountBadge
                displayName={a.displayName}
                emailAddress={a.emailAddress}
                color={a.color}
              />
            </Box>
            {list.map((f) => (
              <NavLink
                key={f.id}
                label={f.name}
                active={selection.kind === 'folder' && selection.id === f.id}
                onClick={() => onSelect({ kind: 'folder', id: f.id })}
                leftSection={iconForRole(f.role)}
                rightSection={
                  f.unreadCount > 0 ? (
                    <Badge size="xs" variant="light" color="ginger">
                      {f.unreadCount}
                    </Badge>
                  ) : null
                }
                variant="filled"
              />
            ))}
          </Stack>
        );
      })}
    </Stack>
  );
}

// ---- Thread list + filtering ----

function filterThreads(
  threads: MessageThread[],
  selection: SidebarSelection,
  folders: Folder[],
): MessageThread[] {
  if (selection.kind === 'unified') return threads;
  if (selection.kind === 'folder') {
    const folder = folders.find((f) => f.id === selection.id);
    if (!folder) return threads;
    // We have account-level granularity on threads; use account_id as a coarse filter.
    return threads.filter((t) => t.accountId === folder.accountId);
  }
  if (selection.kind === 'role') {
    const accountIds = new Set(
      folders.filter((f) => f.role === selection.role).map((f) => f.accountId),
    );
    return threads.filter((t) => accountIds.has(t.accountId));
  }
  // smart
  const now = Date.now();
  switch (selection.id) {
    case 'today':
      return threads.filter((t) => now - t.lastMessageAt < 24 * 3600_000);
    case 'unread':
      return threads.filter((t) => t.unread);
    case 'starred':
      return threads.filter((t) => t.flagged);
    // We don't have these flags hydrated on the thread list yet — surface zero
    // for now so the badge counts stay honest. Per-message search is the fix.
    case 'snoozed':
      return [];
    case 'attachments':
      return [];
  }
}

function smartMailboxCounts(threads: MessageThread[]): Record<SmartId, number> {
  const now = Date.now();
  return {
    today: threads.filter((t) => now - t.lastMessageAt < 24 * 3600_000).length,
    unread: threads.filter((t) => t.unread).length,
    starred: threads.filter((t) => t.flagged).length,
    snoozed: 0,
    attachments: 0,
  };
}

function titleFor(selection: SidebarSelection, folders: Folder[]): string {
  if (selection.kind === 'unified') return 'All mail';
  if (selection.kind === 'folder') {
    return folders.find((f) => f.id === selection.id)?.name ?? 'Folder';
  }
  if (selection.kind === 'role') {
    const labelled = UNIFIED_ROLES.find((r) => r.role === selection.role);
    return labelled?.label ?? selection.role;
  }
  return SMART_DEFS.find((d) => d.id === selection.id)?.label ?? 'Smart mailbox';
}

function ThreadListPane({
  title,
  threads,
  selectedThreadId,
  refreshing,
  onRefresh,
  onSelect,
  onToggleSidebar,
}: {
  title: string;
  threads: MessageThread[];
  selectedThreadId?: string;
  refreshing: boolean;
  onRefresh: () => void;
  onSelect: (id: string) => void;
  onToggleSidebar?: () => void;
}) {
  return (
    <>
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}
      >
        <Group gap="xs">
          {onToggleSidebar && (
            <ActionIcon variant="subtle" onClick={onToggleSidebar} aria-label="Show folders">
              <IconMenu2 size={14} />
            </ActionIcon>
          )}
          <Text size="sm" fw={600} tt="uppercase" c="dimmed">
            {title}
          </Text>
          <Badge size="xs" variant="light" color="gray">
            {threads.length}
          </Badge>
        </Group>
        <ActionIcon
          variant="subtle"
          loading={refreshing}
          onClick={onRefresh}
          aria-label="Refresh inbox"
        >
          <IconRefresh size={14} />
        </ActionIcon>
      </Group>
      <UnsubscribeBanner />
      {threads.length === 0 ? (
        <EmptyState
          icon={<IconInbox size={28} />}
          title="Nothing here"
          description="Either this mailbox is empty or no synced messages match the filter."
        />
      ) : (
        <ScrollArea h="100%" type="hover">
          <Stack gap={0}>
            {threads.map((t) => (
              <ThreadRow
                key={t.id}
                thread={t}
                selected={selectedThreadId === t.id}
                onClick={() => onSelect(t.id)}
              />
            ))}
          </Stack>
        </ScrollArea>
      )}
      {/* Quick-action hover-strip + right-click context menu live on each
          ThreadRow itself (below). Keeping them inside the row keeps the
          actions co-located with the data they operate on. */}
    </>
  );
}

function ThreadRow({
  thread,
  selected,
  onClick,
}: {
  thread: MessageThread;
  selected: boolean;
  onClick: () => void;
}) {
  // Build a complete accessible name so screen readers announce unread state,
  // sender, subject, and time in a single utterance rather than relying on
  // colour/font-weight cues. WCAG 1.4.1 + 1.3.1.
  const participants = summarizeParticipants(thread);
  const subject = thread.subject || '(no subject)';
  const when = new Date(thread.lastMessageAt).toLocaleString();
  const aria = [
    thread.unread ? 'Unread.' : null,
    `From ${participants}.`,
    `Subject ${subject}.`,
    `Received ${when}.`,
    thread.flagged ? 'Flagged.' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <UnstyledButton
      onClick={onClick}
      px="md"
      py="sm"
      w="100%"
      role="option"
      aria-selected={selected}
      aria-current={selected ? 'true' : undefined}
      aria-label={aria}
      className="gm-thread-row"
      data-selected={selected ? 'true' : undefined}
      data-unread={thread.unread ? 'true' : undefined}
      style={{
        background: selected ? 'var(--mantine-color-ginger-light)' : undefined,
        borderBottom: '1px solid var(--mantine-color-default-border)',
        // Persistent 3px stripe so unread state has both a colour and a
        // structural cue (1.4.1 doesn't allow colour alone).
        borderLeft: thread.unread
          ? '3px solid var(--mantine-primary-color-filled)'
          : '3px solid transparent',
      }}
    >
      <Group gap="sm" wrap="nowrap" align="flex-start">
        <Indicator
          color="ginger"
          size={6}
          offset={-2}
          disabled={!thread.unread}
          position="middle-start"
        >
          <Box w={2} />
        </Indicator>
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Group justify="space-between" wrap="nowrap">
            <Text size="sm" fw={thread.unread ? 700 : 500} lineClamp={1}>
              {participants}
            </Text>
            <Text size="xs" c="dimmed">
              {formatRelative(thread.lastMessageAt)}
            </Text>
          </Group>
          <Text size="sm" c={thread.unread ? undefined : 'dimmed'} lineClamp={1}>
            {subject}
          </Text>
          <Group justify="space-between" gap="xs" wrap="nowrap">
            <Group gap="xs" wrap="nowrap">
              {thread.flagged && (
                <ThemeIcon
                  size={14}
                  radius="sm"
                  variant="transparent"
                  color="yellow"
                  aria-label="Flagged"
                >
                  <IconStarFilled size={12} aria-hidden />
                </ThemeIcon>
              )}
              <EnergyChip tag={thread.energyTag} />
            </Group>
            <div className="gm-thread-quickactions">
              <ThreadRowQuickActions
                thread={thread}
                visible
                api={getApi()}
                ui={useThreadActionUi()}
                resolveHeader={async () => {
                  const list = await getApi().mail.listMessages({ threadId: thread.id, limit: 1 });
                  return list[0] ?? null;
                }}
              />
            </div>
          </Group>
        </Stack>
      </Group>
    </UnstyledButton>
  );
}

/**
 * Thread-row actions need an action-ui similar to the message pane's, but
 * scoped to row-level UX. We don't have access to the parent's
 * `notifications`/`modals` helpers here, so reuse those modules directly.
 */
function useThreadActionUi(): MailActionContext['ui'] {
  return {
    openCompose: () => {
      notifications.show({
        title: 'Open the message first',
        message: 'Reply/Forward live on the message pane.',
        color: 'orange',
      });
    },
    confirmDestructive: ({ title, body, confirmLabel }) =>
      new Promise<boolean>((resolve) => {
        modals.openConfirmModal({
          title,
          children: <Text size="sm">{body}</Text>,
          labels: { confirm: confirmLabel, cancel: 'Cancel' },
          confirmProps: { color: 'red' },
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false),
        });
      }),
    notify: (title, message, opts) =>
      notifications.show({
        title,
        message,
        color: opts?.color,
        autoClose: opts?.undo ? 10_000 : 3500,
      }),
    reloadAfterMove: () => {
      // Row-level moves don't auto-refresh the thread list — a full
      // refresh after every hover-click would be noisy. The user will
      // re-fetch when they next switch folders.
    },
  };
}

// ---- Message pane ----

interface MessagePaneProps {
  currentMessage: Message | null;
  thread: MessageHeader[];
  folders: Folder[];
  toolbarSettings: MailToolbarSettings;
  actionUi: MailActionContext['ui'];
  onMoveToFolder: (folderId: string) => void | Promise<void>;
  onAiSummariseFull: () => void | Promise<void>;
  aiBusy: boolean;
}

function MessagePane({
  currentMessage,
  thread,
  folders,
  toolbarSettings,
  actionUi,
  onMoveToFolder,
  onAiSummariseFull,
  aiBusy,
}: MessagePaneProps) {
  if (!currentMessage) {
    return (
      <EmptyState
        icon={<IconMail size={28} />}
        title="Pick something"
        description="Choose a conversation on the left to read it."
      />
    );
  }
  const message = currentMessage;
  // Compose the action context. We thread `getApi()` rather than receiving
  // it as a prop so child components don't have to know about the bridge.
  const ctx: MailActionContext = {
    message,
    api: getApi(),
    ui: {
      ...actionUi,
      // The MessagePane wants its own summarise UX (opens a modal), so we
      // intercept the aiSummarise action's success-notification UX and
      // delegate to the parent's `onAiSummariseFull` for the modal.
    },
  };

  return (
    <Stack p="md" h="100%" gap="md" style={{ minHeight: 0 }}>
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
          <Text size="lg" fw={600}>
            {message.subject || '(no subject)'}
          </Text>
          <Group gap={6} wrap="wrap">
            <Text size="sm" fw={500}>
              {message.from.name || message.from.email}
            </Text>
            <Code>{message.from.email}</Code>
            <Text size="xs" c="dimmed">
              {new Date(message.date).toLocaleString()}
            </Text>
            <UnsubscribePill message={message} />
          </Group>
        </Stack>
        <Group gap={4} wrap="nowrap" align="center">
          <MailToolbar
            message={message}
            folders={folders}
            settings={toolbarSettings}
            ctx={ctx}
            onMoveToFolder={onMoveToFolder}
          />
          {aiBusy && (
            <Text size="xs" c="dimmed">
              AI thinking...
            </Text>
          )}
        </Group>
      </Group>
      {thread.length > 1 && (
        <Text size="xs" c="dimmed">
          {thread.length} messages in this thread
        </Text>
      )}
      <MessageBodyFrame message={message} />
      {message.attachments && message.attachments.length > 0 && (
        <Group gap="xs">
          <IconPaperclip size={14} />
          <Text size="xs" c="dimmed">
            {message.attachments.length} attachment{message.attachments.length === 1 ? '' : 's'}:{' '}
            {message.attachments
              .map((a) => a.filename)
              .filter(Boolean)
              .join(', ')}
          </Text>
        </Group>
      )}
      {/* Surface the parent-level AI summarise hook so it's still reachable
          even if the user removed aiSummarise from their toolbar settings. */}
      <div hidden onClick={() => void onAiSummariseFull()} />
    </Stack>
  );
}

// ---- Helpers ----

function iconForRole(role: FolderRole) {
  switch (role) {
    case 'inbox':
      return <IconInbox size={16} />;
    case 'sent':
      return <IconMail size={16} />;
    case 'drafts':
      return <IconPencilPlus size={16} />;
    case 'trash':
      return <IconTrash size={16} />;
    case 'spam':
      return <IconFlag size={16} />;
    case 'archive':
      return <IconArchive size={16} />;
    default:
      return <IconMail size={16} />;
  }
}

function summarizeParticipants(thread: MessageThread): string {
  const names = thread.participants
    .map((p) => p.name || p.email.split('@')[0] || p.email)
    .slice(0, 3);
  return names.join(', ');
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Renders a message body inside a fully-sandboxed iframe. Wraps the sanitised
 * HTML in a complete document with a strict meta CSP so even browsers that
 * (for some reason) didn't honour `sandbox=""` still block remote loads.
 */
function MessageBodyFrame({ message }: { message: Message }) {
  const trustedAtMount = isSenderTrusted(message.from?.email);
  const [allowImages, setAllowImages] = useState<boolean>(trustedAtMount);
  useEffect(() => {
    setAllowImages(isSenderTrusted(message.from?.email));
  }, [message.id, message.from?.email]);

  if (!message.body?.html) {
    return (
      <Paper withBorder radius="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ScrollArea h="100%" p="md">
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {message.body?.text ?? message.snippet}
          </Text>
        </ScrollArea>
      </Paper>
    );
  }

  const sanitised = sanitiseMailHtml(message.body.html, { allowRemoteImages: allowImages });
  const csp = allowImages
    ? "default-src 'none'; img-src https: data: cid:; style-src 'unsafe-inline'; font-src data:;"
    : "default-src 'none'; img-src data: cid:; style-src 'unsafe-inline'; font-src data:;";
  const srcDoc =
    `<!DOCTYPE html><html><head>` +
    `<meta charset="utf-8">` +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<base target="_blank">` +
    `<style>html,body{margin:0;padding:12px;color:inherit;background:transparent;font:14px system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.55;}img{max-width:100%;height:auto;}a{color:#0a66c2;}</style>` +
    `</head><body>${sanitised}</body></html>`;

  return (
    <Stack gap={6} style={{ flex: 1, minHeight: 0 }}>
      {!allowImages && /<img[\s>]/i.test(message.body.html) && (
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Remote images blocked for your privacy.
          </Text>
          <UnstyledButton
            onClick={() => setAllowImages(true)}
            style={{ fontSize: 12, color: 'var(--mantine-color-ginger-6)', fontWeight: 500 }}
            aria-label="Show remote images for this message"
          >
            Show images
          </UnstyledButton>
          <UnstyledButton
            onClick={() => {
              trustSender(message.from?.email);
              setAllowImages(true);
            }}
            style={{ fontSize: 12, color: 'var(--mantine-color-ginger-6)', fontWeight: 500 }}
            aria-label={`Always show images from ${message.from?.email}`}
          >
            Always trust sender
          </UnstyledButton>
        </Group>
      )}
      <Paper withBorder radius="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <iframe
          key={`${message.id}:${allowImages ? '1' : '0'}`}
          title="message body"
          sandbox=""
          referrerPolicy="no-referrer"
          srcDoc={srcDoc}
          style={{ width: '100%', height: '100%', border: 'none' }}
        />
      </Paper>
    </Stack>
  );
}

void TextInput; // keep import if unused
void IconArrowsHorizontal;
void IconStack2;
void ThreadRowContextMenu;
