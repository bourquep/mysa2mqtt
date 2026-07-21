import { describe, expect, it, vi } from 'vitest';
import { AlarmControlPanel } from '../src/components/alarm_control_panel';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

function makeAlarm() {
  const callback = vi.fn(async () => {});
  const alarm = new AlarmControlPanel(
    { mqtt: mqttSettings, component: { component: 'alarm_control_panel', unique_id: 'a1' } },
    callback
  );
  return { alarm, callback, client: lastClient() };
}

describe('AlarmControlPanel', () => {
  it('publishes a discovery config with state and command topics', async () => {
    const { alarm, client } = makeAlarm();
    await alarm.writeConfig();
    const config = discoveryConfig(client, 'alarm_control_panel', 'a1');
    expect(config.component).toBe('alarm_control_panel');
    expect(config.state_topic).toBe(stateTopic('alarm_control_panel', 'a1', 'state'));
    expect(config.command_topic).toBe(stateTopic('alarm_control_panel', 'a1', 'command'));
  });

  it('reports an arming state', async () => {
    const { alarm, client } = makeAlarm();
    await alarm.setAlarmState('armed_away');
    expect(alarm.state).toBe('armed_away');
    expect(client.lastPayload(stateTopic('alarm_control_panel', 'a1', 'state'))).toBe('armed_away');
  });

  it('forwards commands to the callback', async () => {
    const { client, callback } = makeAlarm();
    client.deliver(stateTopic('alarm_control_panel', 'a1', 'command'), 'ARM_AWAY');
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith('command_topic', 'ARM_AWAY'));
  });
});
