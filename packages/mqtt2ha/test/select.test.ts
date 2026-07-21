import { describe, expect, it, vi } from 'vitest';
import { Select } from '../src/components/select';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('select', 'sel1', 'state');
const COMMAND = stateTopic('select', 'sel1', 'command');

function makeSelect() {
  const callback = vi.fn(async () => {});
  const select = new Select(
    { mqtt: mqttSettings, component: { component: 'select', unique_id: 'sel1', options: ['low', 'high'] } },
    callback
  );
  return { select, callback, client: lastClient() };
}

describe('Select', () => {
  it('publishes the options in the discovery config', async () => {
    const { select, client } = makeSelect();
    await select.writeConfig();
    expect(discoveryConfig(client, 'select', 'sel1').options).toEqual(['low', 'high']);
  });

  it('selects a valid option', async () => {
    const { select, client } = makeSelect();
    await select.setSelectedOption('high');
    expect(select.selectedOption).toBe('high');
    expect(client.lastPayload(STATE)).toBe('high');
  });

  it('ignores an option that is not configured', async () => {
    const { select, client } = makeSelect();
    await select.setSelectedOption('medium');
    expect(select.selectedOption).toBeUndefined();
    expect(client.publishesFor(STATE)).toHaveLength(0);
  });

  it('updates the selection from a command', async () => {
    const { select, client, callback } = makeSelect();
    client.deliver(COMMAND, 'low');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 'low'));
    expect(select.selectedOption).toBe('low');
  });
});
