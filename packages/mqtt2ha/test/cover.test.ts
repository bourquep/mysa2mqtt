import { describe, expect, it, vi } from 'vitest';
import { Cover } from '../src/components/cover';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('cover', 'cv1', 'state');
const POSITION = stateTopic('cover', 'cv1', 'position');

function makeCover(component: Record<string, unknown> = {}) {
  const cover = new Cover(
    { mqtt: mqttSettings, component: { component: 'cover', unique_id: 'cv1', ...component } },
    ['state_topic', 'position_topic', 'tilt_status_topic'],
    vi.fn(async () => {}),
    ['command_topic', 'set_position_topic', 'tilt_command_topic'],
    vi.fn(async () => {})
  );
  return { cover, client: lastClient() };
}

describe('Cover', () => {
  it('publishes the mapped state payload', () => {
    const { cover, client } = makeCover({ state_open: 'up' });
    cover.currentState = 'open';
    expect(client.lastPayload(STATE)).toBe('up');
  });

  it('publishes the position', () => {
    const { cover, client } = makeCover();
    cover.position = 60;
    expect(client.lastPayload(POSITION)).toBe('60');
  });

  it('reacts to an OPEN command by moving to opening', () => {
    const { client } = makeCover();
    client.deliver(stateTopic('cover', 'cv1', 'command'), 'OPEN');
    expect(client.lastPayload(STATE)).toBe('opening');
  });

  it('applies a set-position command', () => {
    const { cover, client } = makeCover();
    client.deliver(stateTopic('cover', 'cv1', 'set_position'), '35');
    expect(cover.position).toBe(35);
    expect(client.lastPayload(POSITION)).toBe('35');
  });

  it('rejects a position command with trailing garbage', () => {
    const { cover, client } = makeCover();
    client.deliver(stateTopic('cover', 'cv1', 'set_position'), '35cm');
    expect(cover.position).toBeUndefined();
    expect(client.publishesFor(POSITION)).toHaveLength(0);
  });
});
