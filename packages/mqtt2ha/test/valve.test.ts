import { describe, expect, it, vi } from 'vitest';
import { Valve } from '../src/components/valve';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('valve', 'vv1', 'state');
const POSITION = stateTopic('valve', 'vv1', 'position');

function makeValve(component: Record<string, unknown> = {}) {
  const valve = new Valve(
    { mqtt: mqttSettings, component: { component: 'valve', unique_id: 'vv1', ...component } },
    ['state_topic', 'position_topic'],
    vi.fn(async () => {}),
    ['command_topic', 'set_position_topic'],
    vi.fn(async () => {})
  );
  return { valve, client: lastClient() };
}

describe('Valve', () => {
  it('publishes the mapped state payload', () => {
    const { valve, client } = makeValve({ state_closed: 'shut' });
    valve.currentState = 'closed';
    expect(client.lastPayload(STATE)).toBe('shut');
  });

  it('reacts to an OPEN command by moving to opening', () => {
    const { client } = makeValve();
    client.deliver(stateTopic('valve', 'vv1', 'command'), 'OPEN');
    expect(client.lastPayload(STATE)).toBe('opening');
  });

  it('applies a set-position command and rejects one with trailing garbage', () => {
    const { valve, client } = makeValve();
    client.deliver(stateTopic('valve', 'vv1', 'set_position'), '80');
    expect(valve.position).toBe(80);
    client.deliver(stateTopic('valve', 'vv1', 'set_position'), '80percent');
    expect(valve.position).toBe(80);
  });
});
