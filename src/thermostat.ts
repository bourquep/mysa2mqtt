import { DeviceConfiguration, Logger, MqttSettings, Sensor } from 'mqtt2ha';
import { DeviceBase, MysaApiClient, StateChange, Status } from 'mysa-js-sdk';

export class Thermostat {
  private isStarted = false;
  private mqttSettings: MqttSettings;
  private mqttDevice: DeviceConfiguration;
  private mqttPower: Sensor;

  constructor(
    private client: MysaApiClient,
    private device: DeviceBase,
    private logger: Logger
  ) {
    this.mqttSettings = {
      host: process.env.MYSA_2_MQTT_BROKER_HOST || 'localhost',
      port: parseInt(process.env.MYSA_2_MQTT_BROKER_PORT || '1883'),
      username: process.env.MYSA_2_MQTT_BROKER_USERNAME,
      password: process.env.MYSA_2_MQTT_BROKER_PASSWORD,
      client_name: 'mysa2mqtt',
      state_prefix: 'mysa2mqtt'
    };

    this.mqttDevice = {
      identifiers: device.Id,
      name: device.Name,
      manufacturer: 'Mysa',
      model: device.Model,
      hw_version: undefined, // TODO
      sw_version: undefined // TODO
    };

    this.mqttPower = new Sensor({
      mqtt: this.mqttSettings,
      logger: this.logger,
      component: {
        component: 'sensor',
        device: this.mqttDevice,
        unique_id: `mysa_${device.Id}_power`,
        device_class: 'power',
        state_class: 'measurement',
        unit_of_measurement: 'W',
        suggested_display_precision: 0,
        force_update: true
      }
    });
  }

  async start() {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;

    try {
      await this.mqttPower.setState('state_topic', 'None');
      await this.mqttPower.writeConfig();

      this.client.emitter.on('statusChanged', this.handleStatusUpdate.bind(this));
      this.client.emitter.on('stateChanged', this.handleStateChange.bind(this));

      await this.client.startRealtimeUpdates(this.device.Id);
    } catch (error) {
      this.isStarted = false;
      throw error;
    }
  }

  async stop() {
    if (!this.isStarted) {
      return;
    }

    this.isStarted = false;
    await this.client.stopRealtimeUpdates(this.device.Id);
    this.client.emitter.off('statusChanged', this.handleStatusUpdate.bind(this));
    this.client.emitter.off('stateChanged', this.handleStateChange.bind(this));
  }

  private async handleStatusUpdate(status: Status) {
    if (status.deviceId !== this.device.Id) {
      return;
    }

    if (status.current != null) {
      const watts = this.device.Voltage * status.current;
      await this.mqttPower.setState('state_topic', watts.toFixed(2));
    } else {
      await this.mqttPower.setState('state_topic', 'None');
    }
  }

  private async handleStateChange(state: StateChange) {
    // Handle state change logic here
  }
}
