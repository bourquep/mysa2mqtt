import { describe, expect, it } from 'vitest';
import { Sensor } from '../src/components/sensor';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

describe('Sensor', () => {
  it('publishes a discovery config carrying sensor metadata and a state topic', async () => {
    const sensor = new Sensor({
      mqtt: mqttSettings,
      component: {
        component: 'sensor',
        unique_id: 's1',
        unit_of_measurement: '°C',
        state_class: 'measurement',
        suggested_display_precision: 1
      }
    });
    const client = lastClient();
    await sensor.writeConfig();

    const config = discoveryConfig(client, 'sensor', 's1');
    expect(config.component).toBe('sensor');
    expect(config.state_topic).toBe(stateTopic('sensor', 's1', 'state'));
    expect(config.unit_of_measurement).toBe('°C');
    expect(config.state_class).toBe('measurement');
    expect(config.suggested_display_precision).toBe(1);
  });

  it('publishes a state value', async () => {
    const sensor = new Sensor({ mqtt: mqttSettings, component: { component: 'sensor', unique_id: 's1' } });
    const client = lastClient();
    await sensor.setState('state_topic', '21.5');
    expect(client.lastPayload(stateTopic('sensor', 's1', 'state'))).toBe('21.5');
  });
});
