// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { CalendarEvent } from '@gingermail/core';
import { EventComposer } from './EventComposer.js';

const createEvent = vi.fn();
const updateEvent = vi.fn();

vi.mock('../ipcBridge.js', () => ({
  getApi: () => ({
    calendar: {
      createEvent: (...args: unknown[]) => createEvent(...args),
      updateEvent: (...args: unknown[]) => updateEvent(...args),
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

const existing: CalendarEvent = {
  id: 'acct:cal1:evt1',
  calendarId: 'acct:cal1',
  accountId: 'acct',
  title: 'Old title',
  start: Date.UTC(2026, 5, 23, 15, 0, 0),
  end: Date.UTC(2026, 5, 23, 16, 0, 0),
  allDay: false,
  status: 'confirmed',
};

describe('EventComposer', () => {
  beforeEach(() => {
    createEvent.mockReset().mockResolvedValue({ ...existing, id: 'local:new' });
    updateEvent.mockReset().mockImplementation(async (e) => e);
  });

  it('builds a create payload with title, guests, reminders, and the local account', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <EventComposer opened calendars={[]} onClose={() => {}} onSaved={() => {}} />,
      ),
    );

    await user.type(screen.getByPlaceholderText('Add a title'), 'Launch review');
    await user.type(screen.getByPlaceholderText(/add guest email/i), 'ada@x.com{enter}');
    await user.click(screen.getByRole('button', { name: /create event/i }));

    await waitFor(() => expect(createEvent).toHaveBeenCalledTimes(1));
    const payload = createEvent.mock.calls[0]![0];
    expect(payload).toMatchObject({
      title: 'Launch review',
      accountId: 'local',
      calendarId: 'local:default',
      attendees: [{ email: 'ada@x.com' }],
      reminders: [10],
      allDay: false,
    });
    expect(updateEvent).not.toHaveBeenCalled();
  });

  it('calls updateEvent with the existing id in edit mode', async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <EventComposer
          opened
          calendars={[]}
          event={existing}
          onClose={() => {}}
          onSaved={() => {}}
        />,
      ),
    );

    const title = screen.getByPlaceholderText('Add a title');
    await user.clear(title);
    await user.type(title, 'New title');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(updateEvent).toHaveBeenCalledTimes(1));
    const payload = updateEvent.mock.calls[0]![0];
    expect(payload.id).toBe('acct:cal1:evt1');
    expect(payload.title).toBe('New title');
    expect(createEvent).not.toHaveBeenCalled();
  });
});
