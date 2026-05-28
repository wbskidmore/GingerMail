import { useEffect, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  Modal,
  Progress,
  ScrollArea,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { IconCheck, IconCloudDownload, IconSparkles } from '@tabler/icons-react';
import type { CuratedModelInfo, InstalledModel, ModelPullProgress } from '@gingermail/core';
import { getApi } from '../ipcBridge.js';

interface LocalAiWizardProps {
  opened: boolean;
  onClose: () => void;
  /** Called after the user successfully installs a model so the caller
   *  can flip AppSettings.ai.mode to 'local' and set the chosen model. */
  onModelInstalled: (modelId: string) => void;
}

/**
 * First-launch wizard for the bundled Ollama sidecar. The user picks a
 * model from the curated list and we stream the pull progress live. Skip
 * leaves AI mode unchanged (falls back to cloud-or-off).
 *
 * Reachable later via Settings > AI > "Choose another model" so the user
 * can swap models without re-installing the app.
 */
export function LocalAiWizard({ opened, onClose, onModelInstalled }: LocalAiWizardProps) {
  const [models, setModels] = useState<CuratedModelInfo[]>([]);
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [pulling, setPulling] = useState<string | null>(null);
  const [progress, setProgress] = useState<ModelPullProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) return;
    let cancelled = false;
    void Promise.all([
      getApi().ai.listAvailableModels(),
      getApi().ai.listInstalledModels().catch(() => []),
    ]).then(([avail, inst]) => {
      if (cancelled) return;
      setModels(avail);
      setInstalled(inst);
    });
    return () => { cancelled = true; };
  }, [opened]);

  useEffect(() => {
    if (!opened) return;
    const unsub = getApi().ai.onPullProgress((evt: ModelPullProgress) => {
      setProgress(evt);
      if (evt.done && evt.error) setError(evt.error);
      if (evt.done && !evt.error) {
        setPulling(null);
        setError(null);
        onModelInstalled(evt.name);
        // Refresh the installed list so the green check next to the model appears.
        void getApi().ai.listInstalledModels().then(setInstalled);
      }
    });
    return unsub;
  }, [opened, onModelInstalled]);

  const isInstalled = (id: string): boolean => installed.some((m) => m.name === id || m.name.split(':')[0] === id.split(':')[0]);

  const start = async (id: string): Promise<void> => {
    setError(null);
    setPulling(id);
    setProgress({ name: id, status: 'starting' });
    try {
      await getApi().ai.pullModel({ name: id });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPulling(null);
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Set up local AI" size="lg" keepMounted={false}>
      <Stack gap="md">
        <Alert color="ginger" icon={<IconSparkles size={16} />} variant="light">
          GingerMail can run completely offline using a small language model on this Mac.
          Pick the one that best fits your storage and RAM \u2014 you can swap later in Settings.
        </Alert>
        <ScrollArea h={420} type="auto">
          <Stack gap="sm">
            {models.map((m) => {
              const installedHere = isInstalled(m.id);
              const pullingThis = pulling === m.id;
              return (
                <Card key={m.id} withBorder radius="md" p="sm">
                  <Group justify="space-between" align="flex-start" wrap="nowrap">
                    <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                      <Group gap="xs">
                        <Title order={5} style={{ margin: 0 }}>{m.displayName}</Title>
                        {m.recommended && <Badge color="ginger" variant="light" size="xs">Recommended</Badge>}
                        {m.starter && <Badge color="green" variant="light" size="xs">Starter</Badge>}
                      </Group>
                      <Group gap={6} mt={2}>
                        <Badge size="xs" variant="outline">{m.sizeGB.toFixed(1)} GB disk</Badge>
                        <Badge size="xs" variant="outline">~{m.ramGB.toFixed(1)} GB RAM</Badge>
                      </Group>
                      <Text size="xs" c="dimmed" mt={4}>{m.description}</Text>
                      {pullingThis && progress && (
                        <Stack gap={4} mt="xs">
                          <Text size="xs" c="dimmed">{progress.status}</Text>
                          {progress.total ? (
                            <Progress value={Math.round(((progress.completed ?? 0) / progress.total) * 100)} animated />
                          ) : (
                            <Progress value={5} animated striped />
                          )}
                        </Stack>
                      )}
                    </Stack>
                    <Group gap="xs" wrap="nowrap">
                      {installedHere ? (
                        <Badge color="green" variant="light" leftSection={<IconCheck size={12} />}>Installed</Badge>
                      ) : (
                        <Button
                          size="xs"
                          leftSection={<IconCloudDownload size={14} />}
                          loading={pullingThis}
                          disabled={pulling !== null && !pullingThis}
                          onClick={() => void start(m.id)}
                        >
                          Download
                        </Button>
                      )}
                    </Group>
                  </Group>
                </Card>
              );
            })}
          </Stack>
        </ScrollArea>
        {error && (
          <Alert color="red" variant="light" title="Download failed">{error}</Alert>
        )}
        <Group justify="space-between">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Skip for now
          </Button>
          <Text size="xs" c="dimmed">Models download from ollama.com over HTTPS.</Text>
        </Group>
      </Stack>
    </Modal>
  );
}
