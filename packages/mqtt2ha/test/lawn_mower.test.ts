import { describe, expect, it, vi } from 'vitest';
import { LawnMower } from '../src/components/lawn_mower';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const ACTIVITY = stateTopic('lawn_mower', 'lm1', 'activity_state');

function makeLawnMower() {
  const mower = new LawnMower(
    { mqtt: mqttSettings, component: { component: 'lawn_mower', unique_id: 'lm1' } },
    ['activity_state_topic'],
    vi.fn(async () => {}),
    ['start_mowing_command_topic', 'pause_command_topic', 'dock_command_topic'],
    vi.fn(async () => {})
  );
  return { mower, client: lastClient() };
}

describe('LawnMower', () => {
  it('publishes the current activity', () => {
    const { mower, client } = makeLawnMower();
    mower.activity = 'mowing';
    expect(client.lastPayload(ACTIVITY)).toBe('mowing');
  });

  it('maps the command topics to activities', () => {
    const { mower, client } = makeLawnMower();
    client.deliver(stateTopic('lawn_mower', 'lm1', 'start_mowing_command'), 'start');
    expect(mower.activity).toBe('mowing');
    client.deliver(stateTopic('lawn_mower', 'lm1', 'pause_command'), 'pause');
    expect(mower.activity).toBe('paused');
    client.deliver(stateTopic('lawn_mower', 'lm1', 'dock_command'), 'dock');
    expect(mower.activity).toBe('returning');
  });
});
