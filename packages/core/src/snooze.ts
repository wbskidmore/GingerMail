export interface SnoozePreset {
  id: string;
  label: string;
  compute: (now: Date) => Date;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addHours(d: Date, h: number): Date {
  const x = new Date(d);
  x.setHours(x.getHours() + h);
  return x;
}

function nextWeekday(d: Date, hour: number): Date {
  const x = startOfDay(d);
  x.setDate(x.getDate() + 1);
  while (x.getDay() === 0 || x.getDay() === 6) {
    x.setDate(x.getDate() + 1);
  }
  x.setHours(hour, 0, 0, 0);
  return x;
}

export const SNOOZE_PRESETS: SnoozePreset[] = [
  { id: '1h', label: 'In 1 hour', compute: (now) => addHours(now, 1) },
  {
    id: 'this-evening',
    label: 'This evening (6pm)',
    compute: (now) => {
      const x = startOfDay(now);
      x.setHours(18);
      if (x.getTime() <= now.getTime()) {
        x.setDate(x.getDate() + 1);
      }
      return x;
    },
  },
  {
    id: 'tomorrow',
    label: 'Tomorrow morning (9am)',
    compute: (now) => {
      const x = startOfDay(now);
      x.setDate(x.getDate() + 1);
      x.setHours(9);
      return x;
    },
  },
  {
    id: 'next-weekday',
    label: 'Next workday (9am)',
    compute: (now) => nextWeekday(now, 9),
  },
  {
    id: 'next-week',
    label: 'Next Monday (9am)',
    compute: (now) => {
      const x = startOfDay(now);
      const day = x.getDay();
      const delta = (1 - day + 7) % 7 || 7;
      x.setDate(x.getDate() + delta);
      x.setHours(9);
      return x;
    },
  },
];

export function applySnoozePreset(presetId: string, now: Date = new Date()): number | null {
  const preset = SNOOZE_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  return preset.compute(now).getTime();
}
