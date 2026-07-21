import { describe, expect, it, vi } from 'vitest';
import { Lock } from '../src/components/lock';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('lock', 'lk1', 'state');

function makeLock(component: Record<string, unknown> = {}) {
  const callback = vi.fn(async () => {});
  const lock = new Lock(
    { mqtt: mqttSettings, component: { component: 'lock', unique_id: 'lk1', ...component } },
    callback
  );
  return { lock, callback, client: lastClient() };
}

describe('Lock', () => {
  it('reports locked and unlocked states', async () => {
    const { lock, client } = makeLock();
    await lock.locked();
    expect(lock.state).toBe('LOCKED');
    expect(client.lastPayload(STATE)).toBe('LOCKED');
    await lock.unlocked();
    expect(client.lastPayload(STATE)).toBe('UNLOCKED');
  });

  it('maps states through the configured payloads', async () => {
    const { lock, client } = makeLock({ state_locked: 'secured', state_jammed: 'stuck' });
    await lock.setLockState('LOCKED');
    expect(client.lastPayload(STATE)).toBe('secured');
    await lock.setLockState('JAMMED');
    expect(client.lastPayload(STATE)).toBe('stuck');
  });

  it('forwards commands to the callback', async () => {
    const { client, callback } = makeLock();
    client.deliver(stateTopic('lock', 'lk1', 'command'), 'LOCK');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 'LOCK'));
  });
});
