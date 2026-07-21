import { describe, expect, it, vi } from 'vitest';
import { Switch } from '../src/components/switch';
import { configTopic, discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

function makeSwitch(component: Record<string, unknown> = {}) {
  const callback = vi.fn(async () => {});
  const sw = new Switch(
    {
      mqtt: mqttSettings,
      component: { component: 'switch', unique_id: 'sw1', ...component }
    },
    callback
  );
  return { sw, callback, client: lastClient() };
}

describe('Switch', () => {
  it('publishes a discovery config with the command and state topics', async () => {
    const { sw, client } = makeSwitch();
    await sw.writeConfig();

    const config = discoveryConfig(client, 'switch', 'sw1');
    expect(config.component).toBe('switch');
    expect(config.command_topic).toBe(stateTopic('switch', 'sw1', 'command'));
    expect(config.state_topic).toBe(stateTopic('switch', 'sw1', 'state'));
    expect(client.publishesFor(configTopic('switch', 'sw1'))[0].opts).toMatchObject({ retain: true });
  });

  it('publishes ON/OFF payloads on the state topic', async () => {
    const { sw, client } = makeSwitch();
    await sw.on();
    expect(client.lastPayload(stateTopic('switch', 'sw1', 'state'))).toBe('ON');
    await sw.off();
    expect(client.lastPayload(stateTopic('switch', 'sw1', 'state'))).toBe('OFF');
  });

  it('subscribes to the command topic on connect', () => {
    const { client } = makeSwitch();
    client.connect();
    expect(client.subscriptions).toContain(stateTopic('switch', 'sw1', 'command'));
  });

  it('reacts to an incoming ON command and forwards it to the callback', async () => {
    const { client, callback } = makeSwitch();
    client.deliver(stateTopic('switch', 'sw1', 'command'), 'ON');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 'ON'));
    expect(client.lastPayload(stateTopic('switch', 'sw1', 'state'))).toBe('ON');
  });

  it('honors custom payload_on/payload_off', async () => {
    const { sw, client } = makeSwitch({ payload_on: 'on!', payload_off: 'off!' });
    await sw.on();
    expect(client.lastPayload(stateTopic('switch', 'sw1', 'state'))).toBe('on!');
  });
});
