import { describe, expect, it, vi } from 'vitest';
import { Humidifier } from '../src/components/humidifier';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('humidifier', 'h1', 'state');
const TARGET = stateTopic('humidifier', 'h1', 'target_humidity_state');
const MODE = stateTopic('humidifier', 'h1', 'mode_state');

function makeHumidifier(component: Record<string, unknown> = {}) {
  const humidifier = new Humidifier(
    { mqtt: mqttSettings, component: { component: 'humidifier', unique_id: 'h1', ...component } },
    ['state_topic', 'current_humidity_topic', 'target_humidity_state_topic', 'mode_state_topic', 'action_topic'],
    vi.fn(async () => {}),
    ['command_topic', 'target_humidity_command_topic', 'mode_command_topic'],
    vi.fn(async () => {})
  );
  return { humidifier, client: lastClient() };
}

describe('Humidifier', () => {
  it('publishes on/off and a one-decimal target humidity', () => {
    const { humidifier, client } = makeHumidifier();
    humidifier.isOn = true;
    expect(client.lastPayload(STATE)).toBe('ON');
    humidifier.targetHumidity = 55;
    expect(client.lastPayload(TARGET)).toBe('55.0');
  });

  it('uses the configured reset payloads when cleared', () => {
    const { humidifier, client } = makeHumidifier({ payload_reset_humidity: 'none', payload_reset_mode: 'unset' });
    humidifier.targetHumidity = undefined;
    expect(client.lastPayload(TARGET)).toBe('none');
    humidifier.currentMode = undefined;
    expect(client.lastPayload(MODE)).toBe('unset');
  });

  it('reacts to on and target-humidity commands', () => {
    const { humidifier, client } = makeHumidifier();
    client.deliver(stateTopic('humidifier', 'h1', 'command'), 'ON');
    expect(humidifier.isOn).toBe(true);
    client.deliver(stateTopic('humidifier', 'h1', 'target_humidity_command'), '48');
    expect(humidifier.targetHumidity).toBe(48);
  });

  it('ignores a non-numeric target humidity command', () => {
    const { humidifier, client } = makeHumidifier();
    client.deliver(stateTopic('humidifier', 'h1', 'target_humidity_command'), 'high');
    expect(humidifier.targetHumidity).toBeUndefined();
    expect(client.publishesFor(TARGET)).toHaveLength(0);
  });
});
