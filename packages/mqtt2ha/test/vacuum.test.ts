import { describe, expect, it, vi } from 'vitest';
import { Vacuum } from '../src/components/vacuum';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('vacuum', 'v1', 'state');

function makeVacuum() {
  const vacuum = new Vacuum(
    { mqtt: mqttSettings, component: { component: 'vacuum', unique_id: 'v1', fan_speed_list: ['min', 'max'] } },
    ['state_topic'],
    vi.fn(async () => {}),
    ['command_topic', 'set_fan_speed_command_topic', 'send_command_topic'],
    vi.fn(async () => {})
  );
  return { vacuum, client: lastClient() };
}

function lastState(client: ReturnType<typeof lastClient>) {
  return JSON.parse(client.lastPayload(STATE)!);
}

describe('Vacuum', () => {
  it('publishes the activity as part of a JSON state payload', () => {
    const { vacuum, client } = makeVacuum();
    vacuum.activity = 'cleaning';
    expect(lastState(client)).toMatchObject({ state: 'cleaning' });
  });

  it('merges battery level and fan speed into the state payload', () => {
    const { vacuum, client } = makeVacuum();
    vacuum.activity = 'docked';
    vacuum.batteryLevel = 90;
    vacuum.fanSpeed = 'max';
    expect(lastState(client)).toEqual({ state: 'docked', battery_level: 90, fan_speed: 'max' });
  });

  it('maps a start command to the cleaning activity', () => {
    const { vacuum, client } = makeVacuum();
    client.deliver(stateTopic('vacuum', 'v1', 'command'), 'start');
    expect(vacuum.activity).toBe('cleaning');
    expect(lastState(client)).toMatchObject({ state: 'cleaning' });
  });

  it('applies a fan-speed command', () => {
    const { vacuum, client } = makeVacuum();
    client.deliver(stateTopic('vacuum', 'v1', 'set_fan_speed_command'), 'max');
    expect(vacuum.fanSpeed).toBe('max');
  });
});
