import { describe, expect, it, vi } from 'vitest';
import { WaterHeater } from '../src/components/water_heater';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const MODE = stateTopic('water_heater', 'wh1', 'mode_state');
const TEMP = stateTopic('water_heater', 'wh1', 'temperature_state');

function makeWaterHeater(component: Record<string, unknown> = {}) {
  const heater = new WaterHeater(
    {
      mqtt: mqttSettings,
      component: { component: 'water_heater', unique_id: 'wh1', modes: ['off', 'eco'], ...component }
    },
    ['mode_state_topic', 'temperature_state_topic', 'current_temperature_topic'],
    vi.fn(async () => {}),
    ['mode_command_topic', 'temperature_command_topic', 'power_command_topic'],
    vi.fn(async () => {})
  );
  return { heater, client: lastClient() };
}

describe('WaterHeater', () => {
  it('publishes the mode and a one-decimal target temperature', () => {
    const { heater, client } = makeWaterHeater();
    heater.currentMode = 'eco';
    expect(client.lastPayload(MODE)).toBe('eco');
    heater.targetTemperature = 50;
    expect(client.lastPayload(TEMP)).toBe('50.0');
  });

  it('restores the last on-mode when powered on, defaulting to the first non-off mode', () => {
    const { client } = makeWaterHeater();
    client.deliver(stateTopic('water_heater', 'wh1', 'power_command'), 'ON');
    expect(client.lastPayload(MODE)).toBe('eco');
    client.deliver(stateTopic('water_heater', 'wh1', 'power_command'), 'OFF');
    expect(client.lastPayload(MODE)).toBe('off');
  });

  it('applies a temperature command and ignores a non-numeric one', () => {
    const { heater, client } = makeWaterHeater();
    client.deliver(stateTopic('water_heater', 'wh1', 'temperature_command'), '48.5');
    expect(heater.targetTemperature).toBe(48.5);
    client.deliver(stateTopic('water_heater', 'wh1', 'temperature_command'), 'warm');
    expect(heater.targetTemperature).toBe(48.5);
  });
});
