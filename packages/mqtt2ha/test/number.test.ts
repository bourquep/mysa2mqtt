import { describe, expect, it, vi } from 'vitest';
import { NumberEntity } from '../src/components/number';
import { lastClient, mqttSettings, stateTopic } from './helpers';

const STATE = stateTopic('number', 'n1', 'state');
const COMMAND = stateTopic('number', 'n1', 'command');

function makeNumber() {
  const callback = vi.fn(async () => {});
  const number = new NumberEntity(
    { mqtt: mqttSettings, component: { component: 'number', unique_id: 'n1' } },
    callback
  );
  return { number, callback, client: lastClient() };
}

describe('NumberEntity', () => {
  it('publishes the current value', async () => {
    const { number, client } = makeNumber();
    await number.setValue(42);
    expect(number.value).toBe(42);
    expect(client.lastPayload(STATE)).toBe('42');
  });

  it('parses a numeric command and forwards the number', async () => {
    const { number, client, callback } = makeNumber();
    client.deliver(COMMAND, '7.5');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 7.5));
    expect(number.value).toBe(7.5);
  });

  it('rejects a non-numeric command without publishing or calling back', async () => {
    const { client, callback } = makeNumber();
    client.deliver(COMMAND, 'not-a-number');
    await Promise.resolve();
    expect(client.publishesFor(STATE)).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
  });

  it('refuses to publish a non-finite value passed directly', async () => {
    const { number, client } = makeNumber();
    await number.setValue(Number.POSITIVE_INFINITY);
    expect(client.publishesFor(STATE)).toHaveLength(0);
    expect(number.value).toBeUndefined();
  });
});
