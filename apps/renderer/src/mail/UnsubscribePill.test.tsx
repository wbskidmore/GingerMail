// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { Message } from '@gingermail/core';
import { UnsubscribePill } from './UnsubscribePill.js';

const performMock = vi.fn();
const muteMock = vi.fn();

vi.mock('../ipcBridge.js', () => ({
  getApi: () => ({
    unsubscribe: {
      perform: (...args: unknown[]) => performMock(...args),
      mute: (...args: unknown[]) => muteMock(...args),
    },
  }),
}));

function wrap(children: React.ReactNode) {
  return (
    <MantineProvider>
      <Notifications />
      {children}
    </MantineProvider>
  );
}

const baseMessage: Message = {
  id: 'm1',
  accountId: 'a',
  folderId: 'inbox',
  threadId: 't1',
  uid: '1',
  from: { email: 'sender@news.example.com', name: 'News' },
  to: [{ email: 'me@example.com' }],
  subject: 'Weekly digest',
  snippet: '',
  date: Date.now(),
  unread: false,
  flagged: false,
  hasAttachments: false,
  labels: [],
  body: { text: '' },
  attachments: [],
};

describe('UnsubscribePill', () => {
  beforeEach(() => {
    performMock.mockReset();
    muteMock.mockReset();
  });

  it('renders nothing when the message has no list-unsubscribe headers', () => {
    const { container } = render(wrap(<UnsubscribePill message={baseMessage} />));
    expect(container.textContent).not.toMatch(/unsubscribe/i);
  });

  it('shows side-by-side Unsubscribe + Mute when headers are present, and confirms the destination URL before POSTing', async () => {
    const msg: Message = {
      ...baseMessage,
      listUnsubscribeHttp: 'https://news.example.com/u/abc',
      listUnsubscribePost: true,
    };
    performMock.mockResolvedValue({ ok: true, method: 'http' });
    render(wrap(<UnsubscribePill message={msg} />));
    const pill = await screen.findByLabelText(/unsubscribe or mute/i);
    fireEvent.click(pill);
    const unsubBtn = await screen.findByRole('button', { name: /^unsubscribe$/i });
    const muteBtn = await screen.findByRole('button', { name: /mute sender/i });
    expect(unsubBtn).toBeInTheDocument();
    expect(muteBtn).toBeInTheDocument();
    fireEvent.click(unsubBtn);
    // First click is the destination-confirmation step \u2014 nothing fires yet.
    expect(performMock).not.toHaveBeenCalled();
    // The URL is shown in the popover for the user to inspect.
    expect(await screen.findByText('https://news.example.com/u/abc')).toBeInTheDocument();
    // Now confirm.
    fireEvent.click(await screen.findByRole('button', { name: /^send$/i }));
    await waitFor(() =>
      expect(performMock).toHaveBeenCalledWith({
        email: 'sender@news.example.com',
        http: 'https://news.example.com/u/abc',
        mailto: undefined,
        oneClick: true,
      }),
    );
  });

  it('skips the destination confirmation when only a mailto link is available (no HTTPS POST happens)', async () => {
    const msg: Message = {
      ...baseMessage,
      listUnsubscribeMailto: 'mailto:unsub@news.example.com',
    };
    performMock.mockResolvedValue({ ok: true, method: 'mailto' });
    render(wrap(<UnsubscribePill message={msg} />));
    fireEvent.click(await screen.findByLabelText(/unsubscribe or mute/i));
    fireEvent.click(await screen.findByRole('button', { name: /^unsubscribe$/i }));
    await waitFor(() =>
      expect(performMock).toHaveBeenCalledWith({
        email: 'sender@news.example.com',
        http: undefined,
        mailto: 'mailto:unsub@news.example.com',
        oneClick: false,
      }),
    );
  });

  it('calls mute when the user picks Mute sender', async () => {
    const msg: Message = {
      ...baseMessage,
      listUnsubscribeMailto: 'mailto:unsub@news.example.com',
    };
    render(wrap(<UnsubscribePill message={msg} />));
    fireEvent.click(await screen.findByLabelText(/unsubscribe or mute/i));
    fireEvent.click(await screen.findByRole('button', { name: /mute sender/i }));
    await waitFor(() =>
      expect(muteMock).toHaveBeenCalledWith({ email: 'sender@news.example.com' }),
    );
  });
});
