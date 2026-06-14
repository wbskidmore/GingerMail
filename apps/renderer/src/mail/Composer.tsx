import { useState } from 'react';
import {
  Button,
  Group,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Tabs,
  TextInput,
  Textarea,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconBolt, IconSend, IconSparkles, IconTrash } from '@tabler/icons-react';
import type { Account, Draft, MessageHeader } from '@gingermail/core';
import { getApi } from '../ipcBridge.js';

interface ComposerProps {
  accounts: Account[];
  replyTo?: MessageHeader | null;
  /**
   * Pre-built draft from `mail.reply({all})` / `mail.forward()`. When set,
   * its fields seed the form so the user lands in a populated composer
   * instead of typing recipients and subject from scratch.
   */
  initialDraft?: Draft | null;
  onClose: () => void;
}

export function Composer({ accounts, replyTo, initialDraft, onClose }: ComposerProps) {
  const [accountId, setAccountId] = useState(
    initialDraft?.accountId ?? replyTo?.accountId ?? accounts[0]?.id ?? '',
  );
  const [to, setTo] = useState(
    initialDraft
      ? initialDraft.to.map((a) => a.email).join(', ')
      : replyTo
        ? replyTo.from.email
        : '',
  );
  const [cc, setCc] = useState(
    initialDraft?.cc ? initialDraft.cc.map((a) => a.email).join(', ') : '',
  );
  const [subject, setSubject] = useState(
    initialDraft?.subject ?? (replyTo ? prefixSubject(replyTo.subject) : ''),
  );
  const [body, setBody] = useState(initialDraft?.bodyText ?? '');
  const [sending, setSending] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [tab, setTab] = useState<'compose' | 'preview'>('compose');

  const accountOptions = accounts.map((a) => ({
    value: a.id,
    label: a.displayName ? `${a.displayName} <${a.emailAddress}>` : a.emailAddress,
  }));

  const send = async (): Promise<void> => {
    if (!accountId || !to) return;
    const draft: Draft = {
      accountId,
      to: to
        .split(',')
        .map((s) => ({ email: s.trim() }))
        .filter((a) => a.email),
      cc: cc ? cc.split(',').map((s) => ({ email: s.trim() })) : undefined,
      subject,
      bodyText: body,
      bodyHtml: `<div style="font-family: system-ui;">${escapeHtml(body).replace(/\n/g, '<br/>')}</div>`,
      inReplyTo: replyTo?.uid,
    };
    setSending(true);
    try {
      await getApi().mail.send(draft);
      notifications.show({ title: 'Sent', message: subject || '(no subject)', color: 'green' });
      onClose();
    } catch (e) {
      notifications.show({ title: 'Send failed', message: (e as Error).message, color: 'red' });
    } finally {
      setSending(false);
    }
  };

  const saveDraft = async (): Promise<void> => {
    if (!accountId) return;
    await getApi().mail.saveDraft({
      accountId,
      to: to.split(',').map((s) => ({ email: s.trim() })),
      subject,
      bodyText: body,
    });
    notifications.show({ title: 'Draft saved', message: subject || '(no subject)' });
    onClose();
  };

  const aiDraft = async (): Promise<void> => {
    if (!replyTo) {
      notifications.show({
        title: 'AI draft',
        message: 'Open a thread first so the AI has context.',
        color: 'orange',
      });
      return;
    }
    setAiBusy(true);
    try {
      const text = await getApi().ai.draftReply({ threadId: replyTo.threadId });
      setBody(text);
      notifications.show({ title: 'Draft ready', message: 'Tweak the [BRACKETS] before sending.' });
    } catch (e) {
      notifications.show({ title: 'AI is off', message: (e as Error).message, color: 'orange' });
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <Modal
      opened
      onClose={onClose}
      title={replyTo ? `Reply: ${replyTo.subject || '(no subject)'}` : 'New message'}
      size="xl"
      keepMounted={false}
      withCloseButton
      trapFocus
    >
      <Tabs value={tab} onChange={(v) => setTab((v as 'compose' | 'preview') ?? 'compose')}>
        <Tabs.List grow>
          <Tabs.Tab value="compose">Compose</Tabs.Tab>
          <Tabs.Tab value="preview">Preview</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="compose" pt="md">
          <Stack gap="sm">
            <Select
              label="From"
              data={accountOptions}
              value={accountId}
              onChange={(v) => v && setAccountId(v)}
              searchable
              nothingFoundMessage="No accounts. Add one in Settings."
            />
            <TextInput
              label="To"
              value={to}
              onChange={(e) => setTo(e.currentTarget.value)}
              placeholder="someone@example.com, another@example.com"
              required
            />
            <TextInput
              label="Cc"
              value={cc}
              onChange={(e) => setCc(e.currentTarget.value)}
              placeholder="optional"
            />
            <TextInput
              label="Subject"
              value={subject}
              onChange={(e) => setSubject(e.currentTarget.value)}
            />
            <Textarea
              label="Message"
              value={body}
              onChange={(e) => setBody(e.currentTarget.value)}
              placeholder="Write your message..."
              autosize
              minRows={8}
              maxRows={18}
            />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="preview" pt="md">
          <ScrollArea
            h={320}
            type="auto"
            p="md"
            style={{ background: 'var(--mantine-color-default)', borderRadius: 8 }}
          >
            <div style={{ fontFamily: 'system-ui', fontSize: 14, whiteSpace: 'pre-wrap' }}>
              <strong>Subject:</strong> {subject || '(no subject)'}
              <br />
              <strong>To:</strong> {to || '...'}
              <br />
              {cc && (
                <>
                  <strong>Cc:</strong> {cc}
                  <br />
                </>
              )}
              <hr />
              {body || <em>Nothing written yet.</em>}
            </div>
          </ScrollArea>
        </Tabs.Panel>
      </Tabs>

      <Group justify="space-between" mt="md">
        <Group gap="xs">
          <Button
            variant="subtle"
            leftSection={<IconSparkles size={14} />}
            loading={aiBusy}
            onClick={aiDraft}
            disabled={!replyTo}
          >
            AI draft
          </Button>
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={onClose}
          >
            Discard
          </Button>
        </Group>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconBolt size={14} />} onClick={saveDraft}>
            Save draft
          </Button>
          <Button
            leftSection={<IconSend size={14} />}
            loading={sending}
            disabled={!to || !accountId}
            onClick={send}
          >
            Send
          </Button>
        </Group>
      </Group>
    </Modal>
  );
}

function prefixSubject(subject: string): string {
  return /^re:/i.test(subject) ? subject : `Re: ${subject}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c);
}
