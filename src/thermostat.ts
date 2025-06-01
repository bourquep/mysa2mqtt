import { Climate, DeviceConfiguration, Logger, MqttSettings, Sensor } from 'mqtt2ha';
import { DeviceBase, MysaApiClient, StateChange, Status } from 'mysa-js-sdk';

export class Thermostat {
  private isStarted = false;
  private mqttSettings: MqttSettings;
  private mqttDevice: DeviceConfiguration;
  private mqttClimate: Climate;
  private mqttPower: Sensor;

  constructor(
    public client: MysaApiClient,
    public device: DeviceBase,
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

    this.mqttClimate = new Climate(
      {
        mqtt: this.mqttSettings,
        logger: this.logger,
        component: {
          component: 'climate',
          device: this.mqttDevice,
          unique_id: `mysa_${device.Id}_climate`,
          name: 'Thermostat',
          min_temp: undefined, // TODO
          max_temp: undefined, // TODO
          modes: ['off', 'heat'], // TODO: AC
          precision: 0.1,
          temp_step: 0.5,
          temperature_unit: 'C', // TODO: Confirm that Mysa always works in C
          optimistic: true
        }
      },
      [
        'action_topic',
        'current_humidity_topic',
        'current_temperature_topic',
        'mode_state_topic',
        'temperature_state_topic'
      ],
      async () => {},
      ['mode_command_topic', 'power_command_topic', 'temperature_command_topic'],
      async (topic, message) => {
        switch (topic) {
          case 'mode_command_topic':
            this.client.setDeviceState(
              this.device.Id,
              undefined,
              message === 'off' ? 'off' : message === 'heat' ? 'heat' : undefined
            );
            break;

          case 'temperature_command_topic':
            if (message === '') {
              this.client.setDeviceState(this.device.Id, undefined, undefined);
            } else {
              this.client.setDeviceState(this.device.Id, parseFloat(message), undefined);
            }
            break;
        }
      }
    );

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
      this.mqttClimate.currentTemperature = undefined;
      this.mqttClimate.currentHumidity = undefined;
      this.mqttClimate.targetTemperature = undefined;
      this.mqttClimate.currentAction = 'off';
      this.mqttClimate.currentMode = undefined;
      await this.mqttClimate.writeConfig();

      await this.mqttPower.setState('state_topic', 'None');
      await this.mqttPower.writeConfig();

      this.client.emitter.on('statusChanged', this.handleMysaStatusUpdate.bind(this));
      this.client.emitter.on('stateChanged', this.handleMysaStateChange.bind(this));

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

    this.client.emitter.off('statusChanged', this.handleMysaStatusUpdate.bind(this));
    this.client.emitter.off('stateChanged', this.handleMysaStateChange.bind(this));

    await this.mqttPower.setState('state_topic', 'None');
  }

  private async handleMysaStatusUpdate(status: Status) {
    if (!this.isStarted || status.deviceId !== this.device.Id) {
      return;
    }

    if (this.mqttClimate.currentMode === 'heat') {
      this.mqttClimate.currentAction =
        status.current != null
          ? status.current > 0
            ? 'heating'
            : 'idle'
          : (status.dutyCycle ?? 0) > 0
            ? 'heating'
            : 'idle';
    }

    this.mqttClimate.currentTemperature = status.temperature;
    this.mqttClimate.currentHumidity = status.humidity;
    this.mqttClimate.targetTemperature = status.setPoint;

    if (status.current != null) {
      const watts = this.device.Voltage * status.current;
      await this.mqttPower.setState('state_topic', watts.toFixed(2));
    } else {
      await this.mqttPower.setState('state_topic', 'None');
    }
  }

  private async handleMysaStateChange(state: StateChange) {
    if (!this.isStarted || state.deviceId !== this.device.Id) {
      return;
    }

    switch (state.mode) {
      case 'off':
        this.mqttClimate.currentMode = 'off';
        this.mqttClimate.currentAction = 'off';
        break;

      case 'heat':
        this.mqttClimate.currentMode = 'heat';
        this.mqttClimate.currentAction = 'heating';
        break;
    }
  }
}
