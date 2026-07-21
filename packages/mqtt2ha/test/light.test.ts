import { describe, expect, it, vi } from 'vitest';
import { Light } from '../src/components/light';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('light', 'l1', 'state');
const BRIGHTNESS = stateTopic('light', 'l1', 'brightness_state');
const RGB = stateTopic('light', 'l1', 'rgb_state');

function makeLight() {
  const light = new Light(
    { mqtt: mqttSettings, component: { component: 'light', unique_id: 'l1' } },
    ['state_topic', 'brightness_state_topic', 'color_temp_state_topic', 'rgb_state_topic', 'effect_state_topic'],
    vi.fn(async () => {}),
    [
      'command_topic',
      'brightness_command_topic',
      'color_temp_command_topic',
      'rgb_command_topic',
      'effect_command_topic'
    ],
    vi.fn(async () => {})
  );
  return { light, client: lastClient() };
}

describe('Light', () => {
  it('publishes on/off, brightness and RGB', () => {
    const { light, client } = makeLight();
    light.isOn = true;
    expect(client.lastPayload(STATE)).toBe('ON');
    light.brightness = 128;
    expect(client.lastPayload(BRIGHTNESS)).toBe('128');
    light.rgb = { r: 10, g: 20, b: 30 };
    expect(client.lastPayload(RGB)).toBe('10,20,30');
  });

  it('parses on, brightness and RGB commands', () => {
    const { light, client } = makeLight();
    client.deliver(stateTopic('light', 'l1', 'command'), 'ON');
    expect(light.isOn).toBe(true);
    client.deliver(stateTopic('light', 'l1', 'brightness_command'), '200');
    expect(light.brightness).toBe(200);
    client.deliver(stateTopic('light', 'l1', 'rgb_command'), '1,2,3');
    expect(light.rgb).toEqual({ r: 1, g: 2, b: 3 });
  });

  it('ignores a malformed RGB command', () => {
    const { light, client } = makeLight();
    client.deliver(stateTopic('light', 'l1', 'rgb_command'), '1,2');
    expect(light.rgb).toBeUndefined();
    expect(client.publishesFor(RGB)).toHaveLength(0);
  });

  it('rejects a brightness command with trailing garbage', () => {
    const { light, client } = makeLight();
    client.deliver(stateTopic('light', 'l1', 'brightness_command'), '200watts');
    expect(light.brightness).toBeUndefined();
    expect(client.publishesFor(BRIGHTNESS)).toHaveLength(0);
  });
});
