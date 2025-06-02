import { Climate, ClimateAction, DeviceConfiguration, Logger, MqttSettings, Sensor } from 'mqtt2ha';
import { DeviceBase, FirmwareDevice, MysaApiClient, MysaDeviceMode, StateChange, Status } from 'mysa-js-sdk';

export class Thermostat {
  private isStarted = false;
  private mqttSettings: MqttSettings;
  private mqttDevice: DeviceConfiguration;
  private mqttClimate: Climate;
  private mqttPower: Sensor;

  private readonly mysaStatusUpdateHandler = this.handleMysaStatusUpdate.bind(this);
  private readonly mysaStateChangeHandler = this.handleMysaStateChange.bind(this);

  constructor(
    public client: MysaApiClient,
    public device: DeviceBase,
    private logger: Logger,
    public deviceFirmware?: FirmwareDevice
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
      sw_version: deviceFirmware?.InstalledVersion
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
          min_temp: device.MinSetpoint,
          max_temp: device.MaxSetpoint,
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

          case 'power_command_topic':
            this.client.setDeviceState(
              this.device.Id,
              undefined,
              message === 'OFF' ? 'off' : message === 'ON' ? 'heat' : undefined
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
      const deviceStates = await this.client.getDeviceStates();
      const state = deviceStates.DeviceStatesObj[this.device.Id];

      this.mqttClimate.currentTemperature = state.CorrectedTemp.v;
      this.mqttClimate.currentHumidity = state.Humidity.v;
      this.mqttClimate.currentMode = state.TstatMode.v === 1 ? 'off' : state.TstatMode.v === 3 ? 'heat' : undefined;
      this.mqttClimate.currentAction = this.computeCurrentAction(undefined, state.Duty.v);
      this.mqttClimate.targetTemperature = this.mqttClimate.currentMode !== 'off' ? state.SetPoint.v : undefined;

      await this.mqttClimate.writeConfig();

      // `state.Current.v` always has a non-zero value, even for thermostats that are off, so we can't use it to determine initial power state.
      await this.mqttPower.setState('state_topic', 'None');
      await this.mqttPower.writeConfig();

      this.client.emitter.on('statusChanged', this.mysaStatusUpdateHandler);
      this.client.emitter.on('stateChanged', this.mysaStateChangeHandler);

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

    this.client.emitter.off('statusChanged', this.mysaStatusUpdateHandler);
    this.client.emitter.off('stateChanged', this.mysaStateChangeHandler);

    await this.mqttPower.setState('state_topic', 'None');
  }

  private async handleMysaStatusUpdate(status: Status) {
    if (!this.isStarted || status.deviceId !== this.device.Id) {
      return;
    }

    this.mqttClimate.currentAction = this.computeCurrentAction(status.current, status.dutyCycle);
    this.mqttClimate.currentTemperature = status.temperature;
    this.mqttClimate.currentHumidity = status.humidity;
    this.mqttClimate.targetTemperature = this.mqttClimate.currentMode !== 'off' ? status.setPoint : undefined;

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
        this.mqttClimate.targetTemperature = undefined;
        break;

      case 'heat':
        this.mqttClimate.currentMode = 'heat';
        break;
    }
  }

  private computeCurrentAction(current?: number, dutyCycle?: number): ClimateAction {
    const mode: MysaDeviceMode | undefined =
      this.mqttClimate.currentMode === 'heat' ? 'heat' : this.mqttClimate.currentMode === 'off' ? 'off' : undefined;

    switch (mode) {
      case 'off':
        return 'off';

      case 'heat':
        if (current != null) {
          return current > 0 ? 'heating' : 'idle';
        }
        return (dutyCycle ?? 0) > 0 ? 'heating' : 'idle';

      default:
        return 'idle';
    }
  }
}
