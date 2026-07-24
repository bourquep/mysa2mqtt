import { describe, expect, it, vi } from 'vitest';
import { Update } from '../src/components/update';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('update', 'up1', 'state');

function makeUpdate() {
  const callback = vi.fn(async () => {});
  const update = new Update({ mqtt: mqttSettings, component: { component: 'update', unique_id: 'up1' } }, callback);
  return { update, callback, client: lastClient() };
}

describe('Update', () => {
  it('publishes a JSON payload with installed and latest versions', async () => {
    const { update, client } = makeUpdate();
    await update.setUpdateState({ installed_version: '1.0.0', latest_version: '1.2.0' });
    expect(JSON.parse(client.lastPayload(STATE)!)).toEqual({ installed_version: '1.0.0', latest_version: '1.2.0' });
  });

  it('accepts a plain version string', async () => {
    const { update, client } = makeUpdate();
    await update.setUpdateState('2.0.0');
    expect(client.lastPayload(STATE)).toBe('2.0.0');
  });

  it('forwards an install command to the callback', async () => {
    const { client, callback } = makeUpdate();
    client.deliver(stateTopic('update', 'up1', 'command'), 'install');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 'install'));
  });
});
