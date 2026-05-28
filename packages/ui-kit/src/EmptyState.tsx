import { Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * Centered, low-stimulation empty state. The same pattern in every tab gives
 * the app a predictable "nothing here yet" experience.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <Center h="100%" p="xl">
      <Stack align="center" gap="sm" maw={420}>
        <ThemeIcon size={56} radius="xl" variant="light" color="gray">
          {icon}
        </ThemeIcon>
        <Title order={4} ta="center">
          {title}
        </Title>
        {description && (
          <Text c="dimmed" ta="center" size="sm">
            {description}
          </Text>
        )}
        {action}
      </Stack>
    </Center>
  );
}
