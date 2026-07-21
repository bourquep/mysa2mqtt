import { describe, expect, it, vi } from 'vitest';
import { Climate } from '../src/components/climate';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

function makeClimate(component: Record<string, unknown> = {}) {
  const onState = vi.fn(async () => {});
  const onCommand = vi.fn(async () => {});
  const climate = new Climate(
    {
      mqtt: mqttSettings,
      component: { component: 'climate', unique_id: 'c1', modes: ['off', 'heat'], ...component }
    },
    ['action_topic', 'mode_state_topic', 'current_temperature_topic', 'temperature_state_topic'],
    onState,
    ['mode_command_topic', 'power_command_topic', 'temperature_command_topic'],
    onCommand
  );
  return { climate, onState, onCommand, client: lastClient() };
}

describe('Climate', () => {
  it('publishes a discovery config with the selected state and command topics', async () => {
    const { climate, client } = makeClimate();
    await climate.writeConfig();
    const config = discoveryConfig(client, 'climate', 'c1');
    expect(config.component).toBe('climate');
    expect(config.mode_state_topic).toBe(stateTopic('climate', 'c1', 'mode_state'));
    expect(config.mode_command_topic).toBe(stateTopic('climate', 'c1', 'mode_command'));
    expect(config.modes).toEqual(['off', 'heat']);
  });

  it('publishes temperatures with one decimal place', () => {
    const { climate, client } = makeClimate();
    climate.currentTemperature = 19;
    expect(client.lastPayload(stateTopic('climate', 'c1', 'current_temperature'))).toBe('19.0');
    climate.targetTemperature = 21.5;
    expect(client.lastPayload(stateTopic('climate', 'c1', 'temperature_state'))).toBe('21.5');
  });

  it('tracks the mode and reflects the current action', () => {
    const { climate, client } = makeClimate();
    climate.currentMode = 'heat';
    expect(client.lastPayload(stateTopic('climate', 'c1', 'mode_state'))).toBe('heat');
    climate.currentAction = 'heating';
    expect(client.lastPayload(stateTopic('climate', 'c1', 'action'))).toBe('heating');
  });

  it('restores the last on-mode when powered on and off again', () => {
    const { climate, client } = makeClimate();
    climate.currentMode = 'heat';
    client.deliver(stateTopic('climate', 'c1', 'power_command'), 'OFF');
    expect(client.lastPayload(stateTopic('climate', 'c1', 'mode_state'))).toBe('off');
    client.deliver(stateTopic('climate', 'c1', 'power_command'), 'ON');
    expect(client.lastPayload(stateTopic('climate', 'c1', 'mode_state'))).toBe('heat');
  });

  it('applies a temperature command', () => {
    const { climate, client } = makeClimate();
    client.deliver(stateTopic('climate', 'c1', 'temperature_command'), '22.5');
    expect(climate.targetTemperature).toBe(22.5);
    expect(client.lastPayload(stateTopic('climate', 'c1', 'temperature_state'))).toBe('22.5');
  });
});
