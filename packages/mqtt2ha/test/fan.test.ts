import { describe, expect, it, vi } from 'vitest';
import { Fan } from '../src/components/fan';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('fan', 'f1', 'state');
const PERCENTAGE = stateTopic('fan', 'f1', 'percentage_state');
const OSCILLATION = stateTopic('fan', 'f1', 'oscillation_state');

function makeFan(component: Record<string, unknown> = {}) {
  const fan = new Fan(
    { mqtt: mqttSettings, component: { component: 'fan', unique_id: 'f1', ...component } },
    [
      'state_topic',
      'percentage_state_topic',
      'preset_mode_state_topic',
      'oscillation_state_topic',
      'direction_state_topic'
    ],
    vi.fn(async () => {}),
    ['command_topic', 'percentage_command_topic', 'oscillation_command_topic'],
    vi.fn(async () => {})
  );
  return { fan, client: lastClient() };
}

describe('Fan', () => {
  it('publishes on/off state', () => {
    const { fan, client } = makeFan();
    fan.isOn = true;
    expect(client.lastPayload(STATE)).toBe('ON');
  });

  it('publishes a percentage and a reset payload', () => {
    const { fan, client } = makeFan({ payload_reset_percentage: 'unknown' });
    fan.percentage = 40;
    expect(client.lastPayload(PERCENTAGE)).toBe('40');
    fan.percentage = undefined;
    expect(client.lastPayload(PERCENTAGE)).toBe('unknown');
  });

  it('reacts to an on command and a percentage command', () => {
    const { fan, client } = makeFan();
    client.deliver(stateTopic('fan', 'f1', 'command'), 'ON');
    expect(fan.isOn).toBe(true);
    client.deliver(stateTopic('fan', 'f1', 'percentage_command'), '55');
    expect(fan.percentage).toBe(55);
  });

  it('rejects a percentage command with trailing garbage', () => {
    const { fan, client } = makeFan();
    client.deliver(stateTopic('fan', 'f1', 'percentage_command'), '55percent');
    expect(fan.percentage).toBeUndefined();
    expect(client.publishesFor(PERCENTAGE)).toHaveLength(0);
  });

  it('maps an oscillation command to a boolean', () => {
    const { fan, client } = makeFan();
    client.deliver(stateTopic('fan', 'f1', 'oscillation_command'), 'oscillate_on');
    expect(fan.oscillation).toBe(true);
    expect(client.lastPayload(OSCILLATION)).toBe('oscillate_on');
  });
});
