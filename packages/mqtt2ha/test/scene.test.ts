import { describe, expect, it, vi } from 'vitest';
import { Scene } from '../src/components/scene';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

describe('Scene', () => {
  it('publishes a command-only discovery config', async () => {
    const scene = new Scene(
      { mqtt: mqttSettings, component: { component: 'scene', unique_id: 'sc1' } },
      vi.fn(async () => {})
    );
    const client = lastClient();
    await scene.writeConfig();
    const config = discoveryConfig(client, 'scene', 'sc1');
    expect(config.component).toBe('scene');
    expect(config.command_topic).toBe(stateTopic('scene', 'sc1', 'command'));
    expect(config.state_topic).toBeUndefined();
  });

  it('forwards activation to the callback', async () => {
    const callback = vi.fn(async () => {});
    new Scene({ mqtt: mqttSettings, component: { component: 'scene', unique_id: 'sc1' } }, callback);
    const client = lastClient();
    client.deliver(stateTopic('scene', 'sc1', 'command'), 'ON');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 'ON'));
  });
});
