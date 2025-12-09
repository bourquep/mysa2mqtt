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
import {
  DeviceBase,
  FirmwareDevice,
  MysaApiClient,
  MysaDeviceMode,
  MysaFanSpeedMode,
  StateChange,
  Status
} from 'mysa-js-sdk';
import { version } from './options';

type DeviceType = 'AC' | 'BB';

const HA_HEAT_ONLY_MODES: Partial<MysaDeviceMode>[] = ['off', 'heat'];
const HA_AC_MODES: Partial<MysaDeviceMode>[] = ['off', 'heat', 'cool', 'dry', 'fan_only', 'auto'];
const MYSA_RAW_MODE_TO_DEVICE_MODE: Partial<Record<number, MysaDeviceMode>> = {
  1: 'off',
  2: 'auto',
  3: 'heat',
  4: 'cool',
  5: 'fan_only',
  6: 'dry'
};

const FAN_SPEED_MODES: Partial<MysaFanSpeedMode>[] = ['auto', 'low', 'medium', 'high', 'max'];
const MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE: Partial<Record<number, MysaFanSpeedMode>> = {
  1: 'auto',
  3: 'low',
  5: 'medium',
  7: 'high',
  8: 'max'
};

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

  private readonly deviceType: DeviceType;

  constructor(
    public readonly mysaApiClient: MysaApiClient,
    public readonly mysaDevice: DeviceBase,
    private readonly mqttSettings: MqttSettings,
    private readonly logger: Logger,
    public readonly mysaDeviceFirmware?: FirmwareDevice,
    public readonly mysaDeviceSerialNumber?: string,
    public readonly temperatureUnit?: 'C' | 'F'
  ) {
    const is_celsius = (temperatureUnit ?? 'C') === 'C';

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

    const isAC = mysaDevice.Model.startsWith('AC');
    this.deviceType = isAC ? 'AC' : 'BB';

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
          modes: isAC ? HA_AC_MODES : HA_HEAT_ONLY_MODES,
          fan_modes: isAC ? FAN_SPEED_MODES : undefined,
          precision: is_celsius ? 0.1 : 1.0,
          temp_step: is_celsius ? 0.5 : 1.0,
          temperature_unit: 'C',
          optimistic: true
        }
      },
      isAC
        ? [
            'action_topic',
            'current_humidity_topic',
            'current_temperature_topic',
            'mode_state_topic',
            'temperature_state_topic',
            'fan_mode_state_topic'
          ]
        : [
            'action_topic',
            'current_humidity_topic',
            'current_temperature_topic',
            'mode_state_topic',
            'temperature_state_topic'
          ],
      async () => {},
      isAC
        ? ['mode_command_topic', 'power_command_topic', 'temperature_command_topic', 'fan_mode_command_topic']
        : ['mode_command_topic', 'power_command_topic', 'temperature_command_topic'],
      async (topic, message) => {
        switch (topic) {
          case 'mode_command_topic': {
            const messageAsMode = message as MysaDeviceMode;
            const mode: MysaDeviceMode | undefined = isAC
              ? HA_AC_MODES.includes(messageAsMode)
                ? messageAsMode
                : undefined
              : HA_HEAT_ONLY_MODES.includes(messageAsMode)
                ? messageAsMode
                : undefined;
            this.mysaApiClient.setDeviceState(this.mysaDevice.Id, undefined, mode);
            break;
          }

          case 'power_command_topic':
            this.mysaApiClient.setDeviceState(
              this.mysaDevice.Id,
              undefined,
              message === 'OFF' ? 'off' : message === 'ON' && !isAC ? 'heat' : undefined
            );
            break;

          case 'temperature_command_topic':
            if (message === '') {
              this.mysaApiClient.setDeviceState(this.mysaDevice.Id, undefined, undefined);
            } else {
              let temperature = parseFloat(message);

              if (!is_celsius) {
                const snapHalfC = (c: number) => Math.round(c * 2) / 2;
                const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
                // Snap to 0.5 °C and clamp to device limits
                const setC = snapHalfC(temperature);
                temperature = clamp(setC, this.mysaDevice.MinSetpoint ?? 0, this.mysaDevice.MaxSetpoint ?? 100);
              }

              this.mysaApiClient.setDeviceState(this.mysaDevice.Id, temperature, undefined);
            }
            break;

          case 'fan_mode_command_topic': {
            const messageAsMode = message as MysaFanSpeedMode;
            const mode = FAN_SPEED_MODES.includes(messageAsMode) ? messageAsMode : undefined;
            this.mysaApiClient.setDeviceState(this.mysaDevice.Id, undefined, undefined, mode);
            break;
          }
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
        suggested_display_precision: is_celsius ? 0.1 : 0.0,
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
      this.mqttClimate.currentMode =
        MYSA_RAW_MODE_TO_DEVICE_MODE[state.TstatMode?.v as number] ?? this.mqttClimate.currentMode;
      this.mqttClimate.currentFanMode =
        MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE[state.FanSpeed?.v as number] ?? this.mqttClimate.currentFanMode;
      this.mqttClimate.currentAction = this.computeCurrentAction(undefined, state.Duty?.v);
      this.mqttClimate.targetTemperature = this.mqttClimate.currentMode !== 'off' ? state.SetPoint?.v : undefined;

      await this.mqttClimate.writeConfig();

      await this.mqttTemperature.setState(
        'state_topic',
        state.CorrectedTemp != null ? state.CorrectedTemp.v.toFixed(2) : 'None'
      );
      await this.mqttTemperature.writeConfig();

      await this.mqttHumidity.setState('state_topic', state.Humidity != null ? state.Humidity.v.toFixed(2) : 'None');
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
    if (!this.isStarted || status.deviceId !== this.mysaDevice. Id) {
      return;
    }
  
    this.mqttClimate.currentAction = this.computeCurrentAction(status. current, status.dutyCycle);
    this.mqttClimate.currentTemperature = status.temperature;
    this.mqttClimate.currentHumidity = status.humidity;
    this.mqttClimate.targetTemperature = this.mqttClimate.currentMode !== 'off' ? status.setPoint : undefined;
  
    // Power calculation:  V1 devices report current, V2 devices report duty cycle
    if (this.mysaDevice.Voltage != null && status. current != null) {
      // V1 devices: use actual current measurement
      const watts = this.mysaDevice.Voltage * status.current;
      await this. mqttPower.setState('state_topic', watts.toFixed(2));
    } else if (this.mysaDevice.Voltage != null && status.dutyCycle != null) {
      // V2 devices: estimate power from duty cycle and MaxCurrent rating
      const maxCurrent = this.mysaDevice.MaxCurrent ? parseFloat(this.mysaDevice.MaxCurrent) : null;
      if (maxCurrent != null && !isNaN(maxCurrent)) {
        const estimatedWatts = this.mysaDevice.Voltage * maxCurrent * status.dutyCycle;
        await this.mqttPower.setState('state_topic', estimatedWatts.toFixed(2));
      } else {
        // No MaxCurrent available - cannot estimate power
        await this.mqttPower.setState('state_topic', 'None');
      }
    } else {
      await this.mqttPower. setState('state_topic', 'None');
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
        this.mqttClimate.currentFanMode = undefined;
        break;

      case 'heat':
      case 'cool':
      case 'auto':
        this.mqttClimate.currentMode = state.mode;
        if (this.deviceType === 'AC') {
          this.mqttClimate.currentAction = this.computeCurrentAction();
        }
        this.mqttClimate.targetTemperature = state.setPoint;
        this.mqttClimate.currentFanMode = state.fanSpeed;
        break;

      case 'dry':
      case 'fan_only':
        this.mqttClimate.currentMode = state.mode;
        this.mqttClimate.currentAction = this.computeCurrentAction();
        this.mqttClimate.currentFanMode = state.fanSpeed;
        break;
    }
  }

  private computeCurrentAction(current?: number, dutyCycle?: number): ClimateAction {
    const currentModeAsMode = this.mqttClimate.currentMode as MysaDeviceMode;
    const mode = HA_AC_MODES.includes(currentModeAsMode) ? currentModeAsMode : undefined;

    switch (mode) {
      case 'off':
        return 'off';
      case 'heat':
        switch (this.deviceType) {
          case 'BB':
            if (current != null) {
              return current > 0 ? 'heating' : 'idle';
            }
            return (dutyCycle ?? 0) > 0 ? 'heating' : 'idle';
          default:
            return 'heating';
        }
      case 'cool':
        return 'cooling';
      case 'fan_only':
        return 'fan';
      case 'dry':
        return 'drying';
      default:
        return 'idle';
    }
  }
}
