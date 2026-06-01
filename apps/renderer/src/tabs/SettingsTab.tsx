import { useEffect, useState } from 'react';
import {
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Code,
  Divider,
  Group,
  List,
  Modal,
  NumberInput,
  PasswordInput,
  Paper,
  ScrollArea,
  Select,
  Slider,
  Stack,
  Switch,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  Tooltip,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconBell,
  IconBrandApple,
  IconBrandDiscord,
  IconBrandGoogle,
  IconBrandSlack,
  IconBrandWindows,
  IconMessages,
  IconBrush,
  IconInbox,
  IconInfoCircle,
  IconKeyboard,
  IconLock,
  IconPlus,
  IconShield,
  IconSparkles,
  IconTrash,
  IconUsers,
} from '@tabler/icons-react';
import type { Account, AddAccountInput, AppSettings, DetectionMode, DetectionSettings, MailToolbarSettings, MutedSender, ProviderKind } from '@gingermail/core';
import { DEFAULT_MAIL_TOOLBAR, defaultChatSettings, defaultDetectionSettings } from '@gingermail/core';
import { AccountBadge } from '@gingermail/ui-kit';
import { useAppStore } from '../store.js';
import { getApi } from '../ipcBridge.js';
import { MailToolbarEditor } from '../settings/MailToolbarEditor.js';
import { LocalAiWizard } from '../onboarding/LocalAiWizard.js';
import { ShortcutsCheatSheet } from '../shell/ShortcutsCheatSheet.js';

export function SettingsTab() {
  return (
    <ScrollArea h="100%">
      <Box p="lg" maw={920} mx="auto">
        <Tabs defaultValue="accounts" variant="pills" radius="md" keepMounted={false} orientation="horizontal">
          <Tabs.List mb="md" grow>
            <Tabs.Tab value="accounts" leftSection={<IconUsers size={14} />}>Accounts</Tabs.Tab>
            <Tabs.Tab value="notifications" leftSection={<IconBell size={14} />}>Notifications</Tabs.Tab>
            <Tabs.Tab value="appearance" leftSection={<IconBrush size={14} />}>Appearance</Tabs.Tab>
            <Tabs.Tab value="ai" leftSection={<IconSparkles size={14} />}>AI</Tabs.Tab>
            <Tabs.Tab value="slack" leftSection={<IconMessages size={14} />}>Chat</Tabs.Tab>
            <Tabs.Tab value="privacy" leftSection={<IconShield size={14} />}>Privacy</Tabs.Tab>
            <Tabs.Tab value="help" leftSection={<IconKeyboard size={14} />}>Help</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="accounts"><AccountsSection /></Tabs.Panel>
          <Tabs.Panel value="notifications"><NotificationsSection /></Tabs.Panel>
          <Tabs.Panel value="appearance"><AppearanceSection /></Tabs.Panel>
          <Tabs.Panel value="ai"><AiSection /></Tabs.Panel>
          <Tabs.Panel value="slack"><SlackSection /></Tabs.Panel>
          <Tabs.Panel value="privacy"><PrivacySection /></Tabs.Panel>
          <Tabs.Panel value="help"><HelpSection /></Tabs.Panel>
        </Tabs>
      </Box>
    </ScrollArea>
  );
}

// ---- Accounts ----

function AccountsSection() {
  const accounts = useAppStore((s) => s.accounts);
  const refreshAccounts = useAppStore((s) => s.refreshAccounts);
  const [addKind, setAddKind] = useState<ProviderKind | null>(null);

  const connectOAuth = async (kind: 'gmail' | 'microsoft'): Promise<void> => {
    try {
      await getApi().accounts.beginOAuth(kind);
      await refreshAccounts();
      notifications.show({ title: 'Account connected', message: `Signed in to ${kind}`, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Sign-in failed', message: (e as Error).message, color: 'red' });
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Title order={5}>Add an account</Title>
          <Text size="sm" c="dimmed">Mail, calendar, and tasks all flow from whichever account you connect.</Text>
          <Group gap="sm" wrap="wrap">
            <Button leftSection={<IconBrandGoogle size={14} />} onClick={() => void connectOAuth('gmail')}>Gmail</Button>
            <Button leftSection={<IconBrandWindows size={14} />} onClick={() => void connectOAuth('microsoft')}>Outlook</Button>
            <Button variant="default" leftSection={<IconBrandApple size={14} />} onClick={() => setAddKind('apple-caldav')}>iCloud</Button>
            <Button variant="default" leftSection={<IconInbox size={14} />} onClick={() => setAddKind('imap-smtp')}>IMAP / SMTP</Button>
            <Button variant="subtle" leftSection={<IconInbox size={14} />} onClick={() => setAddKind('pop3')}>POP3</Button>
          </Group>
        </Stack>
      </Card>

      {accounts.length === 0 ? (
        <Alert variant="light" color="ginger" title="No accounts yet" icon={<IconInfoCircle size={16} />}>
          Pick a provider above to sign in. Once connected, every tab (Mail, Calendar, Tasks) will source its data from that account.
        </Alert>
      ) : (
        <Stack gap="xs">
          {accounts.map((a) => <AccountRow key={a.id} account={a} onRemove={async () => {
            await getApi().accounts.remove(a.id);
            await refreshAccounts();
          }} />)}
        </Stack>
      )}

      {addKind && <ManualAccountModal kind={addKind} onClose={async () => { setAddKind(null); await refreshAccounts(); }} />}
    </Stack>
  );
}

function AccountRow({ account, onRemove }: { account: Account; onRemove: () => Promise<void> }) {
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between">
        <AccountBadge displayName={account.displayName} emailAddress={account.emailAddress} color={account.color} />
        <Group gap="xs">
          <Badge variant="light" color="gray" tt="none">{account.kind}</Badge>
          <Tooltip label="Remove account">
            <Button
              size="xs"
              variant="subtle"
              color="red"
              leftSection={<IconTrash size={14} />}
              onClick={() => modals.openConfirmModal({
                title: 'Remove account?',
                children: <Text size="sm">Local cache for {account.emailAddress} will be deleted. The server account itself is untouched.</Text>,
                labels: { confirm: 'Remove', cancel: 'Cancel' },
                confirmProps: { color: 'red' },
                onConfirm: () => void onRemove(),
              })}
            >
              Remove
            </Button>
          </Tooltip>
        </Group>
      </Group>
    </Paper>
  );
}

function ManualAccountModal({ kind, onClose }: { kind: ProviderKind; onClose: () => void }) {
  const form = useForm<AddAccountInput>({
    initialValues: {
      kind,
      displayName: '',
      emailAddress: '',
      password: '',
      imapHost: kind === 'apple-caldav' ? 'imap.mail.me.com' : '',
      imapPort: 993,
      imapSecure: true,
      smtpHost: kind === 'apple-caldav' ? 'smtp.mail.me.com' : '',
      smtpPort: 587,
      smtpSecure: false,
      pop3Host: '',
      pop3Port: 995,
      pop3Secure: true,
    },
    validate: {
      emailAddress: (v) => (v && /.+@.+\..+/.test(v) ? null : 'Enter a valid email'),
      password: (v) => (v ? null : 'Password / app-specific password required'),
    },
  });

  const submit = form.onSubmit(async (values) => {
    try {
      await getApi().accounts.add(values);
      notifications.show({ title: 'Account added', message: values.emailAddress, color: 'green' });
      onClose();
    } catch (e) {
      notifications.show({ title: 'Connection failed', message: (e as Error).message, color: 'red' });
    }
  });

  const testConnection = async (): Promise<void> => {
    const r = await getApi().accounts.test(form.values);
    notifications.show({
      title: r.ok ? 'Connection OK' : 'Connection failed',
      message: r.ok ? 'Your credentials work.' : r.error ?? 'Unknown error',
      color: r.ok ? 'green' : 'red',
    });
  };

  return (
    <Modal opened onClose={onClose} title={`Add ${labelForKind(kind)} account`} size="md">
      <form onSubmit={submit}>
        <Stack gap="sm">
          <TextInput label="Display name" placeholder="William Skidmore" {...form.getInputProps('displayName')} />
          <TextInput label="Email address" placeholder="you@example.com" required {...form.getInputProps('emailAddress')} />
          <PasswordInput
            label={kind === 'apple-caldav' ? 'App-specific password' : 'Password'}
            description={kind === 'apple-caldav' ? 'Create one at appleid.apple.com -> Sign-in and Security' : undefined}
            required
            {...form.getInputProps('password')}
          />
          {kind === 'imap-smtp' && (
            <>
              <Divider label="Servers" labelPosition="left" />
              <Group grow>
                <TextInput label="IMAP host" {...form.getInputProps('imapHost')} />
                <NumberInput label="IMAP port" {...form.getInputProps('imapPort')} />
              </Group>
              <Group grow>
                <TextInput label="SMTP host" {...form.getInputProps('smtpHost')} />
                <NumberInput label="SMTP port" {...form.getInputProps('smtpPort')} />
              </Group>
              <Group>
                <Switch label="IMAP SSL/TLS" {...form.getInputProps('imapSecure', { type: 'checkbox' })} />
                <Switch label="SMTP SSL/TLS" {...form.getInputProps('smtpSecure', { type: 'checkbox' })} />
              </Group>
            </>
          )}
          {kind === 'pop3' && (
            <>
              <Divider label="Servers" labelPosition="left" />
              <Group grow>
                <TextInput label="POP3 host" {...form.getInputProps('pop3Host')} />
                <NumberInput label="POP3 port" {...form.getInputProps('pop3Port')} />
              </Group>
              <Group grow>
                <TextInput label="SMTP host" {...form.getInputProps('smtpHost')} />
                <NumberInput label="SMTP port" {...form.getInputProps('smtpPort')} />
              </Group>
            </>
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={testConnection}>Test connection</Button>
            <Button type="submit" leftSection={<IconPlus size={14} />}>Add account</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

// ---- Notifications ----

function NotificationsSection() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Switch
          label="Enable desktop notifications"
          description="When off, you'll only see events inside GingerMail."
          checked={settings.notifications.enabled}
          onChange={(e) => setSettings({ notifications: { ...settings.notifications, enabled: e.currentTarget.checked } })}
        />
        <Group grow>
          <NumberInput
            label="Batch mail notifications"
            description="Group new-mail pings into a digest every N minutes."
            min={1}
            value={settings.notifications.batchIntervalMin}
            onChange={(v) => setSettings({ notifications: { ...settings.notifications, batchIntervalMin: Number(v) || 15 } })}
          />
        </Group>
        <Switch
          label="Show unread count on dock / taskbar"
          description="Off by default to keep the dock low-stimulation."
          checked={settings.notifications.dockBadge}
          onChange={(e) => setSettings({ notifications: { ...settings.notifications, dockBadge: e.currentTarget.checked } })}
        />
        <Button variant="subtle" leftSection={<IconBell size={14} />} onClick={() => void getApi().notifications.test()}>
          Send a test notification
        </Button>
      </Stack>
    </Card>
  );
}

// ---- Appearance ----

function AppearanceSection() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  return (
    <Stack gap="md">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Select
            label="Theme"
            value={settings.appearance.themeMode}
            data={[
              { value: 'system', label: 'Follow OS' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(v) => v && setSettings({ appearance: { ...settings.appearance, themeMode: v as AppSettings['appearance']['themeMode'] } })}
          />
          <Select
            label="Density"
            value={settings.appearance.density}
            data={[
              { value: 'compact', label: 'Compact' },
              { value: 'cozy', label: 'Cozy (recommended)' },
              { value: 'spacious', label: 'Spacious' },
            ]}
            onChange={(v) => v && setSettings({ appearance: { ...settings.appearance, density: v as AppSettings['appearance']['density'] } })}
          />
          <Stack gap={4}>
            <Text size="sm" fw={500}>Base font size: {settings.appearance.baseFontSize}px</Text>
            <Slider
              min={11}
              max={22}
              step={1}
              value={settings.appearance.baseFontSize}
              onChange={(v) => setSettings({ appearance: { ...settings.appearance, baseFontSize: v } })}
              marks={[{ value: 11, label: '11' }, { value: 14, label: '14' }, { value: 18, label: '18' }, { value: 22, label: '22' }]}
            />
          </Stack>
          <Select
            label="Font family"
            description="Lexend boosts reading speed; OpenDyslexic uses weighted letterforms designed to reduce letter confusion."
            value={settings.appearance.fontFamily}
            data={[
              { value: 'system', label: 'System (San Francisco / Segoe UI)' },
              { value: 'lexend', label: 'Lexend (boosts reading speed)' },
              { value: 'dyslexic', label: 'OpenDyslexic (dyslexia-friendly)' },
            ]}
            onChange={(v) => v && setSettings({ appearance: { ...settings.appearance, fontFamily: v as AppSettings['appearance']['fontFamily'] } })}
          />
        </Stack>
      </Card>

      <AccessibilityCard />

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Title order={5}>Mail layout</Title>
          <Text size="sm" c="dimmed">
            You can also change these directly from the toolbar at the top of the Mail tab.
          </Text>
          <Select
            label="Default layout"
            description="Columns is Apple-Mail style; Stacked is Outlook classic; Focus hides folders for distraction-free reading."
            value={settings.appearance.mailLayout ?? 'columns'}
            data={[
              { value: 'columns', label: 'Columns (folders | list | message)' },
              { value: 'stacked', label: 'Stacked (folders | list on top, message below)' },
              { value: 'focus', label: 'Focus (folders hidden, wide reading pane)' },
            ]}
            onChange={(v) => v && setSettings({ appearance: { ...settings.appearance, mailLayout: v as AppSettings['appearance']['mailLayout'] } })}
          />
          <Select
            label="Folder organisation"
            description="By account keeps each login separate; Unified merges Inbox/Sent/etc. across accounts; Smart adds virtual mailboxes like Today, Unread, Starred."
            value={settings.appearance.mailFolderView ?? 'by-account'}
            data={[
              { value: 'by-account', label: 'By account (per-login folder tree)' },
              { value: 'unified', label: 'Unified (one Inbox across all accounts)' },
              { value: 'smart', label: 'Smart mailboxes (Today, Unread, Starred, …)' },
            ]}
            onChange={(v) => v && setSettings({ appearance: { ...settings.appearance, mailFolderView: v as AppSettings['appearance']['mailFolderView'] } })}
          />
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <MailToolbarEditor
          value={settings.appearance.mailToolbar ?? DEFAULT_MAIL_TOOLBAR}
          onChange={(next: MailToolbarSettings) =>
            setSettings({ appearance: { ...settings.appearance, mailToolbar: next } })
          }
        />
      </Card>
    </Stack>
  );
}

/**
 * Dedicated Accessibility card. Lives in the Appearance section but is its
 * own component so we can lift it into a top-level "Accessibility" tab in a
 * follow-up if the section grows. Every setting maps onto the data-* flags
 * applied in `store.ts > applySettingsToRoot`.
 */
function AccessibilityCard() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const a11y = settings.accessibility ?? {
    reduceMotion: 'system' as const,
    highContrast: 'system' as const,
    alwaysShowFocus: true,
    showShortcutHints: true,
  };
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Stack gap={4}>
          <Title order={5}>Accessibility</Title>
          <Text size="sm" c="dimmed">
            These options layer on top of your OS accessibility preferences. &lsquo;Follow system&rsquo;
            mirrors the OS; &lsquo;On&rsquo;/&lsquo;Off&rsquo; override it for GingerMail only.
          </Text>
        </Stack>
        <Select
          label="Reduce motion"
          description="Stops fade/slide transitions; useful for vestibular conditions and ADHD."
          value={a11y.reduceMotion}
          data={[
            { value: 'system', label: 'Follow system' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(v) => v && setSettings({ accessibility: { ...a11y, reduceMotion: v as 'system' | 'on' | 'off' } })}
        />
        <Select
          label="High contrast"
          description="Darkens body text and underlines every link / button for low-vision users."
          value={a11y.highContrast}
          data={[
            { value: 'system', label: 'Follow system' },
            { value: 'on', label: 'On' },
            { value: 'off', label: 'Off' },
          ]}
          onChange={(v) => v && setSettings({ accessibility: { ...a11y, highContrast: v as 'system' | 'on' | 'off' } })}
        />
        <Switch
          label="Always show focus indicators"
          description="Keep the visible focus ring even when navigating with the mouse."
          checked={a11y.alwaysShowFocus}
          onChange={(e) => setSettings({ accessibility: { ...a11y, alwaysShowFocus: e.currentTarget.checked } })}
        />
        <Switch
          label="Show keyboard shortcut hints"
          description="Display hotkeys next to menu items and toolbar buttons."
          checked={a11y.showShortcutHints}
          onChange={(e) => setSettings({ accessibility: { ...a11y, showShortcutHints: e.currentTarget.checked } })}
        />
      </Stack>
    </Card>
  );
}

// ---- AI ----

/**
 * Per-vendor sane defaults the Provider Select swaps in when the user
 * switches vendors. Kept module-level so the same table is consulted both
 * for the initial `cloud` fallback and for the "did the user customise
 * these?" check in the vendor-switch handler.
 */
const CLOUD_VENDOR_DEFAULTS: Record<'openai' | 'anthropic' | 'google', { baseUrl: string; model: string }> = {
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  anthropic: { baseUrl: 'https://api.anthropic.com/v1', model: 'claude-3-5-sonnet-latest' },
  google: { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-1.5-flash' },
};

function AiSection() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const [testing, setTesting] = useState<string | null>(null);

  const cloud = settings.ai.cloud ?? { ...CLOUD_VENDOR_DEFAULTS.openai, vendor: 'openai' as const };
  const local = settings.ai.local ?? { baseUrl: 'http://localhost:11434', model: 'llama3.1:8b' };

  return (
    <Stack gap="md">
      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Select
            label="AI mode"
            description="Off keeps everything 100% local. Cloud uses your own API key. Local talks to Ollama on this machine."
            value={settings.ai.mode}
            data={[
              { value: 'off', label: 'Off' },
              { value: 'cloud', label: 'Cloud (BYO API key)' },
              { value: 'local', label: 'Local (Ollama)' },
            ]}
            onChange={(v) => v && setSettings({ ai: { ...settings.ai, mode: v as AppSettings['ai']['mode'] } })}
          />
          {settings.ai.mode === 'cloud' && (
            <Stack gap="sm">
              <Select
                label="Provider"
                value={cloud.vendor}
                data={[
                  { value: 'openai', label: 'OpenAI / OpenAI-compatible' },
                  { value: 'anthropic', label: 'Anthropic' },
                  { value: 'google', label: 'Google (Gemini)' },
                ]}
                onChange={(v) => {
                  if (!v) return;
                  const vendor = v as 'openai' | 'anthropic' | 'google';
                  // When the user switches vendors, swap the base URL and
                  // model over to that vendor's defaults if (and only if)
                  // the current values still match the previous vendor's
                  // defaults. This avoids stomping on a customised base URL
                  // (e.g. a corporate OpenAI-compatible gateway) while
                  // still saving people from having to type the Gemini
                  // URL manually.
                  const isStillDefault = CLOUD_VENDOR_DEFAULTS[cloud.vendor]?.baseUrl === cloud.baseUrl
                    && CLOUD_VENDOR_DEFAULTS[cloud.vendor]?.model === cloud.model;
                  const nextCloud = isStillDefault
                    ? { ...cloud, vendor, ...CLOUD_VENDOR_DEFAULTS[vendor] }
                    : { ...cloud, vendor };
                  setSettings({ ai: { ...settings.ai, cloud: nextCloud } });
                }}
              />
              <TextInput
                label="Base URL"
                description={cloud.vendor === 'google' ? 'Gemini Generative Language API endpoint.' : undefined}
                value={cloud.baseUrl}
                onChange={(e) => setSettings({ ai: { ...settings.ai, cloud: { ...cloud, baseUrl: e.currentTarget.value } } })}
              />
              <TextInput
                label="Model"
                description={cloud.vendor === 'google'
                  ? 'e.g. gemini-1.5-flash (fast/cheap), gemini-1.5-pro (smarter), gemini-2.5-flash.'
                  : undefined}
                value={cloud.model}
                onChange={(e) => setSettings({ ai: { ...settings.ai, cloud: { ...cloud, model: e.currentTarget.value } } })}
              />
              <CloudAiKeyControl />
              <Alert variant="light" color="gray" icon={<IconLock size={14} />}>
                Stored in your OS keychain (macOS Keychain / Windows DPAPI / libsecret).
                Never written to <Code>prefs.json</Code> on disk.
                {cloud.vendor === 'google' && (
                  <> Get a key at <Code>aistudio.google.com/app/apikey</Code>.</>
                )}
              </Alert>
            </Stack>
          )}
          {settings.ai.mode === 'local' && (
            <Stack gap="sm">
              <TextInput
                label="Ollama base URL"
                value={local.baseUrl}
                onChange={(e) => setSettings({ ai: { ...settings.ai, local: { ...local, baseUrl: e.currentTarget.value } } })}
              />
              <TextInput
                label="Model"
                description="Use the Local AI card below to install or switch models."
                value={local.model}
                onChange={(e) => setSettings({ ai: { ...settings.ai, local: { ...local, model: e.currentTarget.value } } })}
              />
            </Stack>
          )}
          <Group justify="flex-end">
            <Button
              variant="subtle"
              onClick={async () => {
                setTesting('testing...');
                try {
                  const r = await getApi().ai.testConnection();
                  setTesting(r.ok ? `Connected to ${r.model ?? settings.ai.mode}` : `Error: ${r.error}`);
                } catch (e) {
                  setTesting(`Error: ${(e as Error).message}`);
                }
              }}
              disabled={settings.ai.mode === 'off'}
            >
              Test connection
            </Button>
          </Group>
          {testing && <Text size="xs" c="dimmed">{testing}</Text>}
        </Stack>
      </Card>

      <LocalAiCard
        currentModel={local.model}
        onSelectModel={(name) => setSettings({ ai: { ...settings.ai, mode: 'local', local: { ...local, model: name } } })}
      />

      <DetectionAgentsCard />

      <Card withBorder radius="md" p="lg">
        <Stack gap="xs">
          <Group gap="xs">
            <ThemeIcon variant="light" color="ginger" size="sm"><IconSparkles size={14} /></ThemeIcon>
            <Title order={6} m={0}>What the AI can do</Title>
          </Group>
          <List size="sm" spacing={4}>
            <List.Item>Summarise an email thread into 3-5 calm bullets + action items.</List.Item>
            <List.Item>Draft a reply matching the tone of the latest message.</List.Item>
            <List.Item>Tag inbox messages with an energy level (Focus / Normal / Skim).</List.Item>
            <List.Item>Extract action items straight into your Tasks tab.</List.Item>
            <List.Item>Natural-language inbox search.</List.Item>
          </List>
        </Stack>
      </Card>
    </Stack>
  );
}

// ---- Detection agents ----

const DETECTION_MODE_OPTIONS = [
  { value: 'ask', label: 'Ask first' },
  { value: 'auto', label: 'Auto-add' },
  { value: 'off', label: 'Off' },
];

const DETECTION_CATEGORIES: Array<{ key: keyof DetectionSettings['categories']; label: string; help: string }> = [
  { key: 'email', label: 'Emails to send', help: 'Auto-add saves a draft — it never sends on its own.' },
  { key: 'reminder', label: 'Reminders', help: 'Time-based nudges.' },
  { key: 'event', label: 'Calendar events', help: 'Meetings/appointments with a date & time.' },
  { key: 'task', label: 'Tasks', help: 'Concrete to-dos.' },
];

function DetectionAgentsCard() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const det: DetectionSettings = settings.ai.detection ?? defaultDetectionSettings;

  const update = (patch: Partial<DetectionSettings>): void => {
    setSettings({ ai: { ...settings.ai, detection: { ...det, ...patch } } });
  };
  const setCategory = (key: keyof DetectionSettings['categories'], mode: DetectionMode): void => {
    update({ categories: { ...det.categories, [key]: mode } });
  };

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Stack gap={2}>
          <Title order={5}>Detection agents</Title>
          <Text size="xs" c="dimmed">
            Let the AI scan incoming messages for things you might want to act on — emails, reminders,
            events, and tasks — then auto-add them or ask you first, per category. With Local (Ollama)
            AI this all stays on this device.
          </Text>
        </Stack>

        <Switch
          label="Enable detection agents"
          checked={det.enabled}
          onChange={(e) => update({ enabled: e.currentTarget.checked })}
        />

        {settings.ai.mode === 'off' && det.enabled && (
          <Alert variant="light" color="yellow" icon={<IconInfoCircle size={14} />}>
            AI mode is Off, so nothing will be scanned. Turn on Cloud or Local AI above.
          </Alert>
        )}

        <Group gap="lg">
          <Switch
            label="Scan chat (Slack & Discord)"
            checked={det.scanChat}
            disabled={!det.enabled}
            onChange={(e) => update({ scanChat: e.currentTarget.checked })}
          />
          <Switch
            label="Scan mail"
            checked={det.scanMail}
            disabled={!det.enabled}
            onChange={(e) => update({ scanMail: e.currentTarget.checked })}
          />
        </Group>

        <Divider label="Per-category handling" labelPosition="left" />

        <Stack gap="sm">
          {DETECTION_CATEGORIES.map((cat) => (
            <Group key={cat.key} justify="space-between" wrap="nowrap" align="flex-start">
              <Stack gap={0}>
                <Text size="sm" fw={500}>{cat.label}</Text>
                <Text size="xs" c="dimmed">{cat.help}</Text>
              </Stack>
              <Select
                w={140}
                disabled={!det.enabled}
                data={DETECTION_MODE_OPTIONS}
                value={det.categories[cat.key]}
                onChange={(v) => v && setCategory(cat.key, v as DetectionMode)}
              />
            </Group>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}

// ---- Local AI status + model management ----

function LocalAiCard({ currentModel, onSelectModel }: { currentModel: string; onSelectModel: (name: string) => void }) {
  const [status, setStatus] = useState<{ running: boolean; reusingExternal: boolean; binaryFound: boolean; uptimeMs: number; lastError?: string } | null>(null);
  const [installed, setInstalled] = useState<Array<{ name: string; sizeBytes: number; modifiedAt: number }>>([]);
  const [pulling, setPulling] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const refresh = async (): Promise<void> => {
    const s = await getApi().ai.localStatus();
    setStatus(s);
    if (s.running) {
      const inst = await getApi().ai.listInstalledModels().catch(() => []);
      setInstalled(inst);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 5_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start">
          <Stack gap={2}>
            <Title order={5}>Local AI (Ollama)</Title>
            <Text size="xs" c="dimmed">
              Runs models on this device. No data leaves your machine. The runtime ships with the app; pick a model below.
            </Text>
          </Stack>
          <Badge
            color={status?.running ? 'green' : status?.lastError ? 'red' : 'gray'}
            variant="light"
          >
            {status?.running ? (status.reusingExternal ? 'Reusing system Ollama' : 'Running') : status?.lastError ? 'Error' : 'Not running'}
          </Badge>
        </Group>
        {status?.lastError && (
          <Alert color="red" variant="light">{status.lastError}</Alert>
        )}
        <Group gap="xs">
          <Button leftSection={<IconSparkles size={14} />} onClick={() => setWizardOpen(true)} variant="default" size="xs">
            Choose / install a model
          </Button>
          <Button variant="subtle" size="xs" onClick={() => void refresh()}>Refresh</Button>
        </Group>
        <Stack gap={4}>
          <Text size="xs" fw={600} c="dimmed">Installed models</Text>
          {installed.length === 0 && <Text size="xs" c="dimmed">No models installed yet.</Text>}
          {installed.map((m) => (
            <Group key={m.name} justify="space-between" wrap="nowrap"
              style={{ padding: '6px 8px', borderRadius: 6, background: 'var(--mantine-color-default-hover)' }}
            >
              <Stack gap={0}>
                <Text size="sm" fw={currentModel === m.name ? 600 : 400}>{m.name}</Text>
                <Text size="xs" c="dimmed">{(m.sizeBytes / 1024 / 1024 / 1024).toFixed(2)} GB</Text>
              </Stack>
              <Group gap={4}>
                {currentModel === m.name ? (
                  <Badge color="ginger" variant="light">Current</Badge>
                ) : (
                  <Button size="xs" variant="subtle" onClick={() => onSelectModel(m.name)}>
                    Use this
                  </Button>
                )}
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  loading={pulling === m.name}
                  onClick={async () => {
                    setPulling(m.name);
                    try {
                      await getApi().ai.deleteModel({ name: m.name });
                      await refresh();
                    } finally {
                      setPulling(null);
                    }
                  }}
                >
                  Delete
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      </Stack>
      <LocalAiWizard
        opened={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onModelInstalled={(name) => {
          onSelectModel(name);
          void refresh();
        }}
      />
    </Card>
  );
}

// ---- Privacy ----

function PrivacySection() {
  return (
    <Stack gap="lg">
      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Title order={5}>Where your data lives</Title>
          <Text size="sm">
            Mail, events, and tasks are cached locally in an encrypted SQLite database under your user data folder (run <Code>gingermail --print-paths</Code> to see the exact location).
          </Text>
          <Text size="sm">Credentials live in the OS keychain when available (macOS Keychain, Windows DPAPI, libsecret on Linux).</Text>
          <Text size="sm">AI requests only ever go to the endpoint you configure on the AI tab; nothing is forwarded to a GingerMail server (there is no such server).</Text>
          <Anchor href="https://github.com/williamskidmore/gingermail/blob/main/docs/PACKAGING.md" target="_blank" size="sm">
            See packaging / signing notes
          </Anchor>
        </Stack>
      </Card>
      <MutedSendersCard />
    </Stack>
  );
}

function MutedSendersCard() {
  const [muted, setMuted] = useState<MutedSender[]>([]);
  const refresh = async (): Promise<void> => {
    try {
      const list = await getApi().unsubscribe.listMuted();
      setMuted(list);
    } catch {
      setMuted([]);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="sm">
        <Title order={5}>Muted senders</Title>
        <Text size="sm" c="dimmed">
          New mail from these senders is hidden from your inbox, threads, and search as soon as it syncs. This is a
          local-only filter &mdash; the sender is not notified and your unsubscribe state on their server is unchanged.
          Unmuting brings their mail back instantly.
        </Text>
        {muted.length === 0 ? (
          <Text size="sm" c="dimmed">No muted senders yet.</Text>
        ) : (
          <Stack gap="xs">
            {muted.map((m) => (
              <Group key={m.email} justify="space-between" wrap="nowrap">
                <Stack gap={0}>
                  <Text size="sm">{m.email}</Text>
                  <Text size="xs" c="dimmed">Muted {new Date(m.mutedAt).toLocaleString()}</Text>
                </Stack>
                <Button
                  size="xs"
                  variant="light"
                  color="gray"
                  onClick={async () => {
                    await getApi().unsubscribe.unmute({ email: m.email });
                    await refresh();
                  }}
                >
                  Unmute
                </Button>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/**
 * Cloud-AI API key control. Never renders the actual key — only its
 * presence/last-4 — and writes/clears through the dedicated vault IPC
 * channel so secrets never live in prefs.json on disk.
 */
function CloudAiKeyControl() {
  const [status, setStatus] = useState<{ configured: boolean; last4?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = async (): Promise<void> => {
    try {
      const s = await getApi().ai.getCloudKeyStatus();
      setStatus(s);
      setEditing(!s.configured);
    } catch {
      setStatus({ configured: false });
      setEditing(true);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const save = async (): Promise<void> => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await getApi().ai.setCloudKey({ key: value.trim() });
      setValue('');
      await refresh();
      notifications.show({ message: 'API key saved to OS keychain', color: 'green' });
    } catch (e) {
      notifications.show({ message: `Could not save key: ${(e as Error).message}`, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const clear = async (): Promise<void> => {
    setBusy(true);
    try {
      await getApi().ai.clearCloudKey();
      await refresh();
      notifications.show({ message: 'API key removed from keychain', color: 'gray' });
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return <Text size="xs" c="dimmed">Loading key status&hellip;</Text>;
  }

  if (status.configured && !editing) {
    return (
      <Group gap="xs" align="flex-end">
        <TextInput
          label="API key"
          value={`\u2022\u2022\u2022\u2022 ${status.last4 ?? ''}`}
          readOnly
          style={{ flex: 1 }}
        />
        <Button variant="default" onClick={() => setEditing(true)} disabled={busy}>Replace</Button>
        <Button variant="subtle" color="red" onClick={() => void clear()} disabled={busy}>Clear</Button>
      </Group>
    );
  }

  return (
    <Group gap="xs" align="flex-end">
      <PasswordInput
        label="API key"
        placeholder={status.configured ? 'Replacement key' : 'Paste your key'}
        value={value}
        onChange={(e) => setValue(e.currentTarget.value)}
        style={{ flex: 1 }}
        autoComplete="off"
        spellCheck={false}
      />
      <Button onClick={() => void save()} disabled={busy || !value.trim()}>
        Save to keychain
      </Button>
      {status.configured && (
        <Button variant="subtle" onClick={() => { setEditing(false); setValue(''); }}>Cancel</Button>
      )}
    </Group>
  );
}

// ---- Slack ----

function SlackSection() {
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const [workspaces, setWorkspaces] = useState<Account[]>([]);
  const [token, setToken] = useState('');
  const [discordToken, setDiscordToken] = useState('');
  const [busy, setBusy] = useState(false);
  const chat = settings.chat ?? defaultChatSettings;

  const refresh = async (): Promise<void> => {
    try {
      setWorkspaces(await getApi().slack.listWorkspaces());
    } catch {
      setWorkspaces([]);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);

  const connectToken = async (): Promise<void> => {
    if (!token.trim()) return;
    setBusy(true);
    try {
      const account = await getApi().slack.connectToken({ token: token.trim() });
      setToken('');
      await refresh();
      notifications.show({ title: 'Slack connected', message: account.displayName, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Could not connect', message: (e as Error).message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const connectOAuth = async (): Promise<void> => {
    setBusy(true);
    try {
      const account = await getApi().slack.beginOAuth();
      await refresh();
      notifications.show({ title: 'Slack connected', message: account.displayName, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Sign-in failed', message: (e as Error).message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  const connectDiscord = async (): Promise<void> => {
    if (!discordToken.trim()) return;
    setBusy(true);
    try {
      const account = await getApi().discord.connectToken({ token: discordToken.trim() });
      setDiscordToken('');
      await refresh();
      notifications.show({ title: 'Discord connected', message: account.displayName, color: 'green' });
    } catch (e) {
      notifications.show({ title: 'Could not connect', message: (e as Error).message, color: 'red' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" color="ginger" size="sm"><IconBrandSlack size={14} /></ThemeIcon>
            <Title order={5} m={0}>Connect a workspace</Title>
          </Group>
          <Text size="sm" c="dimmed">
            GingerMail talks to the Slack Web API directly &mdash; no embedded browser, nothing leaves your machine except
            calls to Slack. Paste a user token to get started, or sign in with OAuth if your build has a Slack app configured.
          </Text>
          <PasswordInput
            label="Slack token"
            description="A user token (starts with xoxp-). Stored in your OS keychain, never written to disk in plaintext."
            placeholder="xoxp-…"
            value={token}
            onChange={(e) => setToken(e.currentTarget.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Group justify="flex-end">
            <Button variant="subtle" leftSection={<IconBrandSlack size={14} />} onClick={() => void connectOAuth()} disabled={busy}>
              Sign in with Slack
            </Button>
            <Button leftSection={<IconPlus size={14} />} onClick={() => void connectToken()} loading={busy} disabled={!token.trim()}>
              Connect token
            </Button>
          </Group>
        </Stack>
      </Card>

      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" color="ginger" size="sm"><IconBrandDiscord size={14} /></ThemeIcon>
            <Title order={5} m={0}>Connect a Discord bot</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Create a bot at <Code>discord.com/developers</Code>, enable the <Code>Message Content</Code> intent,
            invite it to your server, then paste its bot token here. New messages arrive in real time over Discord&apos;s
            Gateway. A bot only sees servers it has been invited to (personal DMs stay private).
          </Text>
          <PasswordInput
            label="Discord bot token"
            description="Stored in your OS keychain, never written to disk in plaintext."
            placeholder="Bot token…"
            value={discordToken}
            onChange={(e) => setDiscordToken(e.currentTarget.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Group justify="flex-end">
            <Button leftSection={<IconPlus size={14} />} onClick={() => void connectDiscord()} loading={busy} disabled={!discordToken.trim()}>
              Connect bot
            </Button>
          </Group>
        </Stack>
      </Card>

      {workspaces.length === 0 ? (
        <Alert variant="light" color="ginger" title="No workspaces yet" icon={<IconInfoCircle size={16} />}>
          Once connected, your DMs, group messages, and channels show up under the Chat tab &mdash; with mentions and direct
          messages floated to the top so nothing important gets lost.
        </Alert>
      ) : (
        <Stack gap="xs">
          {workspaces.map((w) => (
            <Paper key={w.id} withBorder radius="md" p="sm">
              <Group justify="space-between">
                <Group gap="xs">
                  <ThemeIcon variant="light" color={w.kind === 'discord' ? 'indigo' : 'grape'} size="sm">
                    {w.kind === 'discord' ? <IconBrandDiscord size={14} /> : <IconBrandSlack size={14} />}
                  </ThemeIcon>
                  <AccountBadge displayName={w.displayName} emailAddress={w.emailAddress} color={w.color} />
                </Group>
                <Group gap="xs">
                  <Badge variant="light" color="gray" tt="none">{w.kind}</Badge>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    leftSection={<IconTrash size={14} />}
                    onClick={() => modals.openConfirmModal({
                      title: 'Disconnect?',
                      children: <Text size="sm">Removes the cached messages and token for {w.displayName}. Your {w.kind === 'discord' ? 'Discord bot' : 'Slack account'} is untouched.</Text>,
                      labels: { confirm: 'Disconnect', cancel: 'Cancel' },
                      confirmProps: { color: 'red' },
                      onConfirm: async () => {
                        await getApi().slack.disconnect({ accountId: w.id });
                        await refresh();
                      },
                    })}
                  >
                    Disconnect
                  </Button>
                </Group>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}

      <Card withBorder radius="md" p="lg">
        <Stack gap="md">
          <Title order={5}>Chat behaviour</Title>
          <Switch
            label="Enable chat"
            description="Turn the Chat tab and background sync on or off."
            checked={chat.enabled}
            onChange={(e) => setSettings({ chat: { ...chat, enabled: e.currentTarget.checked } })}
          />
          <NumberInput
            label="Check for new messages every (seconds)"
            description="How often GingerMail polls Slack in the background. Discord arrives in real time, so this only affects Slack."
            min={15}
            max={600}
            value={chat.pollIntervalSec}
            onChange={(v) => setSettings({ chat: { ...chat, pollIntervalSec: Number(v) || 60 } })}
          />
          <Switch
            label="Notify on direct messages"
            description="Quiet by design: DMs ping, channel chatter never does."
            checked={chat.notifyOnDirectMessage}
            onChange={(e) => setSettings({ chat: { ...chat, notifyOnDirectMessage: e.currentTarget.checked } })}
          />
          <Switch
            label="Notify on @-mentions"
            description="Ping when someone mentions you in a channel. Focus Mode suppresses all chat pings."
            checked={chat.notifyOnMention}
            onChange={(e) => setSettings({ chat: { ...chat, notifyOnMention: e.currentTarget.checked } })}
          />
        </Stack>
      </Card>
    </Stack>
  );
}

// ---- Help ----

function HelpSection() {
  const showHints = useAppStore((s) => s.settings.accessibility?.showShortcutHints ?? true);
  return (
    <Stack gap="md">
      <Card withBorder radius="md" p="lg">
        <Stack gap="sm">
          <Group gap="xs">
            <ThemeIcon variant="light" color="ginger" size="sm"><IconKeyboard size={14} /></ThemeIcon>
            <Title order={5} m={0}>Keyboard shortcuts</Title>
          </Group>
          <Text size="sm" c="dimmed">
            Press <Code>?</Code> anywhere to pop this list up as an overlay. Number keys jump between tabs so you can run the
            whole app &mdash; mail, calendar, tasks, and Slack &mdash; without reaching for the mouse.
          </Text>
          {showHints ? (
            <ShortcutsCheatSheet />
          ) : (
            <Alert variant="light" color="gray" icon={<IconInfoCircle size={16} />}>
              Shortcut hints are turned off in Appearance → Accessibility. The shortcuts still work; turn hints back on to see
              them listed here and next to menu items.
            </Alert>
          )}
        </Stack>
      </Card>
    </Stack>
  );
}

function labelForKind(kind: ProviderKind): string {
  switch (kind) {
    case 'gmail': return 'Gmail';
    case 'microsoft': return 'Outlook';
    case 'apple-caldav': return 'iCloud';
    case 'pop3': return 'POP3';
    default: return 'IMAP/SMTP';
  }
}
