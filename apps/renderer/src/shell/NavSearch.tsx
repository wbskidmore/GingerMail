import { useEffect, useRef, useState } from 'react';
import { TextInput, rem } from '@mantine/core';
import { useDebouncedValue, useHotkeys } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { getApi } from '../ipcBridge.js';

/**
 * Renderer-side global search input. Lives in its own dedicated row beneath
 * the title bar (the ActionBar). Kept out of the draggable title-bar region
 * on macOS so clicks near its left edge never get swallowed by window-drag
 * handling next to the traffic lights.
 *
 * Talks to `ai.nlSearch` unconditionally — the main process routes through
 * the configured AI client when one is available (cloud or local Ollama) and
 * falls back to plain SQLite FTS otherwise.
 */
export function NavSearch() {
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 350);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) return;
    let cancelled = false;
    void getApi()
      .ai.nlSearch(q)
      .then((r) => {
        if (cancelled) return;
        const count = r.messages.length;
        const matches = `${count} match${count === 1 ? '' : 'es'}`;
        notifications.show({
          title: r.usedAi ? `Search complete \u00b7 ${r.model ?? 'AI'}` : 'Search complete',
          message:
            r.usedAi && r.explanation
              ? `${matches} \u2014 ${r.explanation}`
              : `${matches} for "${q}"`,
          autoClose: 3000,
          color: r.usedAi ? 'ginger' : undefined,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        notifications.show({
          title: 'Search failed',
          message: err instanceof Error ? err.message : String(err),
          color: 'red',
          autoClose: 3500,
        });
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  useHotkeys([
    [
      'mod+F',
      () => {
        inputRef.current?.focus();
        inputRef.current?.select();
      },
    ],
  ]);

  return (
    <TextInput
      ref={inputRef}
      size="xs"
      radius="xl"
      value={query}
      onChange={(e) => setQuery(e.currentTarget.value)}
      leftSection={<IconSearch size={14} />}
      placeholder="Search mail, calendar, tasks..."
      w={rem(360)}
      aria-label="Search GingerMail"
    />
  );
}
