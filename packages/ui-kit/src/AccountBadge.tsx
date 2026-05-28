import { Avatar, Group, Stack, Text } from '@mantine/core';

export interface AccountBadgeProps {
  displayName: string;
  emailAddress: string;
  color?: string;
}

/** Compact account row used in the mail sidebar and account list. */
export function AccountBadge({ displayName, emailAddress, color }: AccountBadgeProps) {
  const initials = displayName
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || emailAddress.slice(0, 1).toUpperCase();

  return (
    <Group gap="sm" wrap="nowrap">
      <Avatar color={color ?? 'ginger'} radius="xl" size="sm">
        {initials}
      </Avatar>
      <Stack gap={0}>
        <Text size="sm" fw={500} lineClamp={1}>
          {displayName || emailAddress}
        </Text>
        <Text size="xs" c="dimmed" lineClamp={1}>
          {emailAddress}
        </Text>
      </Stack>
    </Group>
  );
}
