export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email_address TEXT NOT NULL,
  color TEXT,
  created_at INTEGER NOT NULL,
  sync_interval_sec INTEGER NOT NULL DEFAULT 300,
  signature TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  config_json TEXT
);

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  role TEXT NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS folders_account_idx ON folders(account_id);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  uid TEXT NOT NULL,
  from_json TEXT NOT NULL,
  to_json TEXT NOT NULL,
  cc_json TEXT,
  bcc_json TEXT,
  subject TEXT NOT NULL DEFAULT '',
  snippet TEXT NOT NULL DEFAULT '',
  date INTEGER NOT NULL,
  unread INTEGER NOT NULL DEFAULT 1,
  flagged INTEGER NOT NULL DEFAULT 0,
  has_attachments INTEGER NOT NULL DEFAULT 0,
  labels_json TEXT,
  energy_tag TEXT,
  snoozed_until INTEGER,
  body_html TEXT,
  body_text TEXT,
  attachments_json TEXT,
  in_reply_to TEXT,
  references_json TEXT,
  raw_headers_json TEXT,
  -- RFC 2369 / 8058 unsubscribe metadata captured at fetch time.
  list_unsubscribe_http TEXT,    -- canonical https:// URL, if any
  list_unsubscribe_mailto TEXT,  -- mailto: URL, if any
  list_unsubscribe_post INTEGER NOT NULL DEFAULT 0, -- 1 if List-Unsubscribe-Post: List-Unsubscribe=One-Click is present
  -- 1 if the sender is muted at insert time. Locally-trashed: hidden
  -- from inbox / thread / search views, but the row stays so the user
  -- can audit it via Settings -> Muted senders (or Unmute later).
  muted INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS messages_folder_date_idx ON messages(folder_id, date DESC);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(thread_id);
CREATE INDEX IF NOT EXISTS messages_account_unread_idx ON messages(account_id, unread);
CREATE INDEX IF NOT EXISTS messages_snoozed_idx ON messages(snoozed_until);

CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
  subject,
  snippet,
  from_text,
  body_text,
  content='',
  tokenize='unicode61 remove_diacritics 1'
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  participants_json TEXT NOT NULL DEFAULT '[]',
  last_message_at INTEGER NOT NULL,
  unread INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  energy_tag TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS threads_account_last_idx ON threads(account_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS calendars (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  readonly INTEGER NOT NULL DEFAULT 0,
  primary_flag INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS calendar_events (
  id TEXT PRIMARY KEY,
  calendar_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT,
  location TEXT,
  start INTEGER NOT NULL,
  end INTEGER NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'confirmed',
  organizer_json TEXT,
  attendees_json TEXT,
  recurrence_rule TEXT,
  reminders_json TEXT,
  linked_message_id TEXT,
  linked_task_id TEXT,
  snoozed_until INTEGER,
  FOREIGN KEY (calendar_id) REFERENCES calendars(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS events_cal_start_idx ON calendar_events(calendar_id, start);
CREATE INDEX IF NOT EXISTS events_account_range_idx ON calendar_events(account_id, start, end);

CREATE TABLE IF NOT EXISTS task_lists (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  starred INTEGER NOT NULL DEFAULT 0,
  due INTEGER,
  completed_at INTEGER,
  energy_tag TEXT,
  snoozed_until INTEGER,
  linked_message_id TEXT,
  linked_event_id TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (list_id) REFERENCES task_lists(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS tasks_list_pos_idx ON tasks(list_id, position);
CREATE INDEX IF NOT EXISTS tasks_status_due_idx ON tasks(status, due);

CREATE TABLE IF NOT EXISTS scheduled_jobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  fire_at INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  fired_at INTEGER
);

CREATE INDEX IF NOT EXISTS sched_fire_idx ON scheduled_jobs(fire_at);

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

/* Sender-level user decisions for the unsubscribe / mute feature.
 *
 *   action = 'unsubscribed' : the user clicked Unsubscribe (we have a record
 *                             so we don't suggest the sender again).
 *   action = 'muted'        : the user opted to silently auto-trash new mail
 *                             from this sender. Local filter only.
 *   action = 'dismissed'    : the user clicked Dismiss on a suggestion. We
 *                             stop suggesting unless their behaviour shifts
 *                             dramatically (handled in the detection module).
 */
CREATE TABLE IF NOT EXISTS sender_actions (
  email TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('unsubscribed', 'muted', 'dismissed')),
  decided_at INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'user'
);

CREATE INDEX IF NOT EXISTS sender_actions_action_idx ON sender_actions(action);

/* Outbound mail queue. Every mail.send() writes a row here BEFORE the
 * provider is contacted, then the row is marked sent (or recorded with a
 * failure reason). This buys us:
 *   - crash resume: if the app dies between the SMTP submission and the
 *     local DB write, the row stays 'sending' and we can surface it as
 *     "Send may have succeeded - check your Sent folder" on next launch
 *     instead of silently double-sending or losing the draft.
 *   - idempotency: callers pass a stable client_id (composer-generated
 *     UUID). Re-submitting the same client_id returns the existing row's
 *     status without re-sending.
 *   - per-user retry: failed sends are retried with exponential backoff on
 *     the next refreshAll(), up to max_attempts.
 *
 * draft_json is the full Draft payload as JSON; we don't normalise it
 * across the columns because Draft can mutate and we want a frozen
 * snapshot of what the user actually clicked Send on.
 */
CREATE TABLE IF NOT EXISTS pending_sends (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  account_id TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at INTEGER NOT NULL,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS pending_sends_status_idx ON pending_sends(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS pending_sends_account_idx ON pending_sends(account_id);

CREATE INDEX IF NOT EXISTS messages_muted_idx ON messages(muted) WHERE muted = 1;
`;
export const CURRENT_SCHEMA_VERSION = 4;
//# sourceMappingURL=schema.js.map