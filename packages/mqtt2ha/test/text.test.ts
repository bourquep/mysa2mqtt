import { describe, expect, it, vi } from 'vitest';
import { Text } from '../src/components/text';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('text', 'tx1', 'state');

function makeText() {
  const callback = vi.fn(async () => {});
  const text = new Text({ mqtt: mqttSettings, component: { component: 'text', unique_id: 'tx1' } }, callback);
  return { text, callback, client: lastClient() };
}

describe('Text', () => {
  it('publishes the current value', async () => {
    const { text, client } = makeText();
    await text.setValue('hello');
    expect(text.value).toBe('hello');
    expect(client.lastPayload(STATE)).toBe('hello');
  });

  it('updates its value from a command and forwards it', async () => {
    const { text, client, callback } = makeText();
    client.deliver(stateTopic('text', 'tx1', 'command'), 'world');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 'world'));
    expect(text.value).toBe('world');
    expect(client.lastPayload(STATE)).toBe('world');
  });
});
