/*
mysa2mqtt
Copyright (C) 2025 Pascal Bourque

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

import {
  Climate,
  ClimateAction,
  DeviceConfiguration,
  Logger,
  MqttSettings,
  OriginConfiguration,
  Sensor
} from 'mqtt2ha';
import { DeviceBase, FirmwareDevice, MysaApiClient, MysaDeviceMode, StateChange, Status } from 'mysa-js-sdk';
import { version } from './options';

export class Thermostat {
  private isStarted = false;
  private readonly mqttDevice: DeviceConfiguration;
  private readonly mqttOrigin: OriginConfiguration;
  private readonly mqttClimate: Climate;
  private readonly mqttTemperature: Sensor;
  private readonly mqttHumidity: Sensor;
  private readonly mqttPower: Sensor;

  private readonly mysaStatusUpdateHandler = this.handleMysaStatusUpdate.bind(this);
  private readonly mysaStateChangeHandler = this.handleMysaStateChange.bind(this);

  constructor(
    public readonly mysaApiClient: MysaApiClient,
    public readonly mysaDevice: DeviceBase,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: Logger,
    public readonly mysaDeviceFirmware?: FirmwareDevice,
    public readonly mysaDeviceSerialNumber?: string
  ) {
    this.mqttDevice = {
      identifiers: mysaDevice.Id,
      name: mysaDevice.Name,
      manufacturer: 'Mysa',
      model: mysaDevice.Model,
      sw_version: mysaDeviceFirmware?.InstalledVersion,
      serial_number: mysaDeviceSerialNumber
    };

    this.mqttOrigin = {
      name: 'mysa2mqtt',
      sw_version: version,
      support_url: 'https://github.com/bourquep/mysa2mqtt'
    };

    this.mqttClimate = new Climate(
      {
        mqtt: this.mqttSettings,
        logger: this.logger,
        component: {
          component: 'climate',
          device: this.mqttDevice,
          origin: this.mqttOrigin,
          unique_id: `mysa_${mysaDevice.Id}_climate`,
          name: 'Thermostat',
          min_temp: mysaDevice.MinSetpoint,
          max_temp: mysaDevice.MaxSetpoint,
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
            this.mysaApiClient.setDeviceState(
              this.mysaDevice.Id,
              undefined,
              message === 'off' ? 'off' : message === 'heat' ? 'heat' : undefined
            );
            break;

          case 'power_command_topic':
            this.mysaApiClient.setDeviceState(
              this.mysaDevice.Id,
              undefined,
              message === 'OFF' ? 'off' : message === 'ON' ? 'heat' : undefined
            );
            break;

          case 'temperature_command_topic':
            if (message === '') {
              this.mysaApiClient.setDeviceState(this.mysaDevice.Id, undefined, undefined);
            } else {
              this.mysaApiClient.setDeviceState(this.mysaDevice.Id, parseFloat(message), undefined);
            }
            break;
        }
      }
    );

    this.mqttTemperature = new Sensor({
      mqtt: this.mqttSettings,
      logger: this.logger,
      component: {
        component: 'sensor',
        device: this.mqttDevice,
        origin: this.mqttOrigin,
        unique_id: `mysa_${mysaDevice.Id}_temperature`,
        name: 'Current temperature',
        device_class: 'temperature',
        state_class: 'measurement',
        unit_of_measurement: '°C',
        suggested_display_precision: 1,
        force_update: true
      }
    });

    this.mqttHumidity = new Sensor({
      mqtt: this.mqttSettings,
      logger: this.logger,
      component: {
        component: 'sensor',
        device: this.mqttDevice,
        origin: this.mqttOrigin,
        unique_id: `mysa_${mysaDevice.Id}_humidity`,
        name: 'Current humidity',
        device_class: 'humidity',
        state_class: 'measurement',
        unit_of_measurement: '%',
        suggested_display_precision: 0,
        force_update: true
      }
    });

    this.mqttPower = new Sensor({
      mqtt: this.mqttSettings,
      logger: this.logger,
      component: {
        component: 'sensor',
        device: this.mqttDevice,
        origin: this.mqttOrigin,
        unique_id: `mysa_${mysaDevice.Id}_power`,
        name: 'Current power',
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
      const deviceStates = await this.mysaApiClient.getDeviceStates();
      const state = deviceStates.DeviceStatesObj[this.mysaDevice.Id];

      this.mqttClimate.currentTemperature = state.CorrectedTemp?.v;
      this.mqttClimate.currentHumidity = state.Humidity?.v;
      this.mqttClimate.currentMode = state.TstatMode?.v === 1 ? 'off' : state.TstatMode?.v === 3 ? 'heat' : undefined;
      this.mqttClimate.currentAction = this.computeCurrentAction(undefined, state.Duty?.v);
      this.mqttClimate.targetTemperature = this.mqttClimate.currentMode !== 'off' ? state.SetPoint?.v : undefined;
      await this.mqttClimate.writeConfig();

      await this.mqttTemperature.setState('state_topic', (state.CorrectedTemp?.v ?? 0).toFixed(2));
      await this.mqttTemperature.writeConfig();

      await this.mqttHumidity.setState('state_topic', (state.Humidity?.v ?? 0).toFixed(2));
      await this.mqttHumidity.writeConfig();

      // `state.Current.v` always has a non-zero value, even for thermostats that are off, so we can't use it to determine initial power state.
      await this.mqttPower.setState('state_topic', 'None');
      await this.mqttPower.writeConfig();

      this.mysaApiClient.emitter.on('statusChanged', this.mysaStatusUpdateHandler);
      this.mysaApiClient.emitter.on('stateChanged', this.mysaStateChangeHandler);

      await this.mysaApiClient.startRealtimeUpdates(this.mysaDevice.Id);
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

    await this.mysaApiClient.stopRealtimeUpdates(this.mysaDevice.Id);

    this.mysaApiClient.emitter.off('statusChanged', this.mysaStatusUpdateHandler);
    this.mysaApiClient.emitter.off('stateChanged', this.mysaStateChangeHandler);

    await this.mqttPower.setState('state_topic', 'None');
    await this.mqttTemperature.setState('state_topic', 'None');
    await this.mqttHumidity.setState('state_topic', 'None');
  }

  private async handleMysaStatusUpdate(status: Status) {
    if (!this.isStarted || status.deviceId !== this.mysaDevice.Id) {
      return;
    }

    this.mqttClimate.currentAction = this.computeCurrentAction(status.current, status.dutyCycle);
    this.mqttClimate.currentTemperature = status.temperature;
    this.mqttClimate.currentHumidity = status.humidity;
    this.mqttClimate.targetTemperature = this.mqttClimate.currentMode !== 'off' ? status.setPoint : undefined;

    if (this.mysaDevice.Voltage != null && status.current != null) {
      const watts = this.mysaDevice.Voltage * status.current;
      await this.mqttPower.setState('state_topic', watts.toFixed(2));
    } else {
      await this.mqttPower.setState('state_topic', 'None');
    }

    await this.mqttTemperature.setState('state_topic', status.temperature.toFixed(2));
    await this.mqttHumidity.setState('state_topic', status.humidity.toFixed(2));
  }

  private async handleMysaStateChange(state: StateChange) {
    if (!this.isStarted || state.deviceId !== this.mysaDevice.Id) {
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
        this.mqttClimate.targetTemperature = state.setPoint;
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
