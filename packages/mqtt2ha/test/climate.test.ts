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

  it('restores the last on-mode when powered on and off again', async () => {
    const { climate, client } = makeClimate();
    climate.currentMode = 'heat';
    client.deliver(stateTopic('climate', 'c1', 'power_command'), 'OFF');
    await vi.waitFor(() => expect(client.lastPayload(stateTopic('climate', 'c1', 'mode_state'))).toBe('off'));
    client.deliver(stateTopic('climate', 'c1', 'power_command'), 'ON');
    await vi.waitFor(() => expect(client.lastPayload(stateTopic('climate', 'c1', 'mode_state'))).toBe('heat'));
  });

  it('applies a temperature command', async () => {
    const { climate, client } = makeClimate();
    client.deliver(stateTopic('climate', 'c1', 'temperature_command'), '22.5');
    await vi.waitFor(() => {
      expect(climate.targetTemperature).toBe(22.5);
      expect(client.lastPayload(stateTopic('climate', 'c1', 'temperature_state'))).toBe('22.5');
    });
  });

  it('applies the commanded state only after the command callback succeeds when not optimistic', async () => {
    const { climate, client, onCommand } = makeClimate();
    let released: () => void = () => {};
    const pending = new Promise<void>((resolve) => {
      released = resolve;
    });
    onCommand.mockImplementationOnce(async () => {
      await pending;
    });

    client.deliver(stateTopic('climate', 'c1', 'temperature_command'), '22.5');
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalledWith('temperature_command_topic', '22.5'));
    // The callback is still in flight, so the state must not have been published yet.
    expect(client.lastPayload(stateTopic('climate', 'c1', 'temperature_state'))).toBeUndefined();

    released();
    await vi.waitFor(() => expect(client.lastPayload(stateTopic('climate', 'c1', 'temperature_state'))).toBe('22.5'));
  });

  it('does not apply or forward a non-numeric temperature command', async () => {
    const { client, onCommand } = makeClimate();
    client.deliver(stateTopic('climate', 'c1', 'temperature_command'), 'not-a-number');
    await Promise.resolve();
    await vi.waitFor(() => expect(onCommand).not.toHaveBeenCalled());
    expect(client.lastPayload(stateTopic('climate', 'c1', 'temperature_state'))).toBeUndefined();
  });

  it('does not forward an unrecognized power command payload to the callback', async () => {
    const { client, onCommand } = makeClimate();
    client.deliver(stateTopic('climate', 'c1', 'power_command'), 'MAYBE');
    await Promise.resolve();
    await vi.waitFor(() => expect(onCommand).not.toHaveBeenCalled());
    expect(client.lastPayload(stateTopic('climate', 'c1', 'mode_state'))).toBeUndefined();
  });

  it('publishes the commanded state before the callback runs when optimistic', async () => {
    const { climate, client, onCommand } = makeClimate({ optimistic: true });
    let sawStateBeforeCallback = false;
    onCommand.mockImplementationOnce(async () => {
      sawStateBeforeCallback = client.lastPayload(stateTopic('climate', 'c1', 'temperature_state')) === '22.5';
    });

    client.deliver(stateTopic('climate', 'c1', 'temperature_command'), '22.5');
    await vi.waitFor(() => expect(onCommand).toHaveBeenCalled());
    expect(sawStateBeforeCallback).toBe(true);
    expect(climate.targetTemperature).toBe(22.5);
  });
});
