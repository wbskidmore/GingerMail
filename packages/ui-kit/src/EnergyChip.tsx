import { Badge, type MantineColor } from '@mantine/core';
import type { EnergyTag } from '@gingermail/core';

const LABELS: Record<EnergyTag, string> = {
  high: 'Focus',
  medium: 'Normal',
  low: 'Skim',
};

const COLORS: Record<EnergyTag, MantineColor> = {
  high: 'orange',
  medium: 'cyan',
  low: 'gray',
};

export function EnergyChip({ tag, size = 'xs' }: { tag?: EnergyTag; size?: 'xs' | 'sm' }) {
  if (!tag) return null;
  return (
    <Badge variant="light" color={COLORS[tag]} size={size} radius="sm" tt="none">
      {LABELS[tag]}
    </Badge>
  );
}
