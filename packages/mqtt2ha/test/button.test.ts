import { describe, expect, it, vi } from 'vitest';
import { Button } from '../src/components/button';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

function makeButton() {
  const callback = vi.fn(async () => {});
  const button = new Button({ mqtt: mqttSettings, component: { component: 'button', unique_id: 'btn1' } }, callback);
  return { button, callback, client: lastClient() };
}

describe('Button', () => {
  it('publishes a command-only discovery config (no state topic)', async () => {
    const { button, client } = makeButton();
    await button.writeConfig();
    const config = discoveryConfig(client, 'button', 'btn1');
    expect(config.component).toBe('button');
    expect(config.command_topic).toBe(stateTopic('button', 'btn1', 'command'));
    expect(config.state_topic).toBeUndefined();
  });

  it('forwards a press to the callback', async () => {
    const { client, callback } = makeButton();
    client.deliver(stateTopic('button', 'btn1', 'command'), 'PRESS');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 'PRESS'));
  });
});
