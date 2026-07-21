import { describe, expect, it } from 'vitest';
import { BinarySensor } from '../src/components/binary_sensor';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

function makeSensor(component: Record<string, unknown> = {}, isOn?: boolean) {
  const sensor = new BinarySensor(
    { mqtt: mqttSettings, component: { component: 'binary_sensor', unique_id: 'bs1', ...component } },
    isOn
  );
  return { sensor, client: lastClient() };
}

const STATE = stateTopic('binary_sensor', 'bs1', 'state');

describe('BinarySensor', () => {
  it('publishes a discovery config with a state topic and no command topic', async () => {
    const { sensor, client } = makeSensor();
    await sensor.writeConfig();
    const config = discoveryConfig(client, 'binary_sensor', 'bs1');
    expect(config.component).toBe('binary_sensor');
    expect(config.state_topic).toBe(STATE);
    expect(config.command_topic).toBeUndefined();
  });

  it('publishes availability on writeConfig', async () => {
    const { sensor, client } = makeSensor();
    await sensor.writeConfig();
    expect(client.lastPayload(stateTopic('binary_sensor', 'bs1', 'availability'))).toBe('online');
  });

  it('exposes the initial state', () => {
    const { sensor } = makeSensor({}, true);
    expect(sensor.isOn).toBe(true);
  });

  it('sets ON and OFF', async () => {
    const { sensor, client } = makeSensor();
    await sensor.on();
    expect(client.lastPayload(STATE)).toBe('ON');
    await sensor.off();
    expect(client.lastPayload(STATE)).toBe('OFF');
  });

  it('reflects the new state in isOn synchronously, before the publish resolves', () => {
    const { sensor } = makeSensor({}, false);
    const pending = sensor.on();
    expect(sensor.isOn).toBe(true);
    return pending;
  });

  it('toggles based on current state', async () => {
    const { sensor, client } = makeSensor({}, false);
    await sensor.toggle();
    expect(sensor.isOn).toBe(true);
    expect(client.lastPayload(STATE)).toBe('ON');
    await sensor.toggle();
    expect(sensor.isOn).toBe(false);
    expect(client.lastPayload(STATE)).toBe('OFF');
  });

  it('honors custom payloads', async () => {
    const { sensor, client } = makeSensor({ payload_on: 'yes', payload_off: 'no' });
    await sensor.on();
    expect(client.lastPayload(STATE)).toBe('yes');
  });
});
