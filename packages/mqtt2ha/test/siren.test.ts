import { describe, expect, it, vi } from 'vitest';
import { Siren } from '../src/components/siren';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('siren', 'sr1', 'state');

function makeSiren(component: Record<string, unknown> = {}) {
  const callback = vi.fn(async () => {});
  const siren = new Siren(
    { mqtt: mqttSettings, component: { component: 'siren', unique_id: 'sr1', ...component } },
    callback
  );
  return { siren, callback, client: lastClient() };
}

describe('Siren', () => {
  it('exposes available tones in the discovery config', async () => {
    const { siren, client } = makeSiren({ available_tones: ['bleep', 'wail'] });
    await siren.writeConfig();
    const config = discoveryConfig(client, 'siren', 'sr1');
    expect(config.available_tones).toEqual(['bleep', 'wail']);
  });

  it('reports on and off states', async () => {
    const { siren, client } = makeSiren();
    await siren.on();
    expect(siren.isOn).toBe(true);
    expect(client.lastPayload(STATE)).toBe('ON');
    await siren.off();
    expect(siren.isOn).toBe(false);
    expect(client.lastPayload(STATE)).toBe('OFF');
  });

  it('honors a custom state_on payload', async () => {
    const { siren, client } = makeSiren({ state_on: 'sounding' });
    await siren.on();
    expect(client.lastPayload(STATE)).toBe('sounding');
  });

  it('forwards the raw command payload to the callback', () => {
    const { client, callback } = makeSiren();
    // Command payloads arrive as raw strings; a component that expects JSON decodes it itself.
    const payload = JSON.stringify({ state: 'ON', tone: 'wail' });
    client.deliver(stateTopic('siren', 'sr1', 'command'), payload);
    expect(callback).toHaveBeenCalledWith('command_topic', payload);
  });
});
