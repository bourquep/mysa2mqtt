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

import { Climate, DeviceConfiguration, Logger, MqttSettings, OriginConfiguration, Sensor } from 'mqtt2ha';
import { DeviceBase, FirmwareDevice, MysaApiClient, StateChange, Status } from 'mysa-js-sdk';
import { version } from '../../version';
import { getDeviceCapabilities } from './capabilities';
import {
  computeClimateAction,
  computePowerWatts,
  DeviceType,
  FAN_SPEED_MODES,
  HA_AC_MODES,
  HA_HEAT_ONLY_MODES,
  MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE,
  MYSA_RAW_MODE_TO_DEVICE_MODE,
  normalizeSetpointCelsius,
  resolveCommandedFanMode,
  resolveCommandedMode,
  resolvePowerCommandMode
} from './conversions';
import { EnergyAccumulator } from './energy';

export class Thermostat {
  private isStarted = false;
  private readonly mqttDevice: DeviceConfiguration;
  private readonly mqttOrigin: OriginConfiguration;
  private readonly mqttClimate: Climate;
  private readonly mqttTemperature: Sensor;
  private readonly mqttHumidity: Sensor;
  /** Power sensor — only created for devices that can report power consumption (not AC controllers or "Lite" units). */
  private readonly mqttPower?: Sensor;
  /** Cumulative energy sensor — created alongside the power sensor; derived by integrating power over time. */
  private readonly mqttEnergy?: Sensor;

  private readonly energy = new EnergyAccumulator();
  /** Effective current rating used for power estimation (device's own, or the configured estimate as a fallback). */
  private readonly effectiveMaxCurrent?: string;

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
    public readonly temperatureUnit?: 'C' | 'F',
    estimatedCurrent?: number
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

    const capabilities = getDeviceCapabilities(mysaDevice.Model);
    this.deviceType = capabilities.deviceType;
    const isAC = this.deviceType === 'AC';

    // Use the device's own current rating, falling back to the configured estimate (e.g. for Lite units that don't
    // report one). With a current rating, duty-cycle-reporting heaters can have their power estimated.
    this.effectiveMaxCurrent =
      mysaDevice.MaxCurrent ?? (estimatedCurrent != null ? String(estimatedCurrent) : undefined);
    const canReportPower = capabilities.reportsPower || (!isAC && this.effectiveMaxCurrent != null);

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
          case 'mode_command_topic':
            this.mysaApiClient.setDeviceState(this.mysaDevice.Id, undefined, resolveCommandedMode(message, isAC));
            break;

          case 'power_command_topic':
            this.mysaApiClient.setDeviceState(this.mysaDevice.Id, undefined, resolvePowerCommandMode(message, isAC));
            break;

          case 'temperature_command_topic':
            if (message === '') {
              this.mysaApiClient.setDeviceState(this.mysaDevice.Id, undefined, undefined);
            } else {
              const temperature = normalizeSetpointCelsius(
                parseFloat(message),
                is_celsius,
                this.mysaDevice.MinSetpoint,
                this.mysaDevice.MaxSetpoint
              );
              this.mysaApiClient.setDeviceState(this.mysaDevice.Id, temperature, undefined);
            }
            break;

          case 'fan_mode_command_topic':
            this.mysaApiClient.setDeviceState(
              this.mysaDevice.Id,
              undefined,
              undefined,
              resolveCommandedFanMode(message)
            );
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

    if (canReportPower) {
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

      this.mqttEnergy = new Sensor({
        mqtt: this.mqttSettings,
        logger: this.logger,
        component: {
          component: 'sensor',
          device: this.mqttDevice,
          origin: this.mqttOrigin,
          unique_id: `mysa_${mysaDevice.Id}_energy`,
          name: 'Energy',
          device_class: 'energy',
          state_class: 'total_increasing',
          unit_of_measurement: 'kWh',
          suggested_display_precision: 3
        }
      });
    }
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
      this.mqttClimate.currentAction = computeClimateAction(
        this.mqttClimate.currentMode,
        this.deviceType,
        undefined,
        state.Duty?.v
      );
      this.mqttClimate.targetTemperature = this.mqttClimate.currentMode !== 'off' ? state.SetPoint?.v : undefined;

      await this.mqttClimate.writeConfig();

      await this.mqttTemperature.setState(
        'state_topic',
        state.CorrectedTemp != null ? state.CorrectedTemp.v.toFixed(2) : 'None'
      );
      await this.mqttTemperature.writeConfig();

      await this.mqttHumidity.setState('state_topic', state.Humidity != null ? state.Humidity.v.toFixed(2) : 'None');
      await this.mqttHumidity.writeConfig();

      if (this.mqttPower) {
        // `state.Current.v` always has a non-zero value, even for thermostats that are off, so we can't use it to determine initial power state.
        await this.mqttPower.setState('state_topic', 'None');
        await this.mqttPower.writeConfig();
      }

      if (this.mqttEnergy) {
        await this.mqttEnergy.setState('state_topic', this.energy.kwh.toFixed(3));
        await this.mqttEnergy.writeConfig();
      }

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

    // Stopping realtime updates can fail if the Mysa connection is already gone (e.g. during shutdown). Don't let that
    // prevent us from cleaning up the Home Assistant entities below.
    try {
      await this.mysaApiClient.stopRealtimeUpdates(this.mysaDevice.Id);
    } catch (error) {
      this.logger.warn('Failed to stop Mysa realtime updates', error);
    }

    this.mysaApiClient.emitter.off('statusChanged', this.mysaStatusUpdateHandler);
    this.mysaApiClient.emitter.off('stateChanged', this.mysaStateChangeHandler);

    await this.mqttTemperature.setState('state_topic', 'None');
    await this.mqttHumidity.setState('state_topic', 'None');
    if (this.mqttPower) {
      await this.mqttPower.setState('state_topic', 'None');
    }

    // Mark the Home Assistant entities unavailable so they show as offline (rather than stale) while the bridge is
    // stopped. On restart, `writeConfig()` will mark them available again. The energy total is left as-is (not reset to
    // "None") since it is a cumulative `total_increasing` value.
    const availability = [
      this.mqttClimate.setAvailability(false),
      this.mqttTemperature.setAvailability(false),
      this.mqttHumidity.setAvailability(false)
    ];
    if (this.mqttPower) {
      availability.push(this.mqttPower.setAvailability(false));
    }
    if (this.mqttEnergy) {
      availability.push(this.mqttEnergy.setAvailability(false));
    }
    await Promise.all(availability);
  }

  private async handleMysaStatusUpdate(status: Status) {
    if (!this.isStarted || status.deviceId !== this.mysaDevice.Id) {
      return;
    }

    this.mqttClimate.currentAction = computeClimateAction(
      this.mqttClimate.currentMode,
      this.deviceType,
      status.current,
      status.dutyCycle
    );
    this.mqttClimate.currentTemperature = status.temperature;
    this.mqttClimate.currentHumidity = status.humidity;
    this.mqttClimate.targetTemperature = this.mqttClimate.currentMode !== 'off' ? status.setPoint : undefined;

    // Power calculation: V1 devices report current, V2 devices report duty cycle (see `computePowerWatts`). Devices that
    // can't report power (AC controllers, "Lite" units without an estimated current) have no power sensor.
    if (this.mqttPower) {
      const watts = computePowerWatts(
        this.mysaDevice.Voltage,
        this.effectiveMaxCurrent,
        status.current,
        status.dutyCycle
      );
      await this.mqttPower.setState('state_topic', watts != null ? watts.toFixed(2) : 'None');

      // Integrate power into a cumulative energy total (kWh) for the Home Assistant Energy dashboard.
      if (watts != null && this.mqttEnergy) {
        const kwh = this.energy.addSample(watts, Date.now());
        await this.mqttEnergy.setState('state_topic', kwh.toFixed(3));
      }
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
          this.mqttClimate.currentAction = computeClimateAction(this.mqttClimate.currentMode, this.deviceType);
        }
        this.mqttClimate.targetTemperature = state.setPoint;
        this.mqttClimate.currentFanMode = state.fanSpeed;
        break;

      case 'dry':
      case 'fan_only':
        this.mqttClimate.currentMode = state.mode;
        this.mqttClimate.currentAction = computeClimateAction(this.mqttClimate.currentMode, this.deviceType);
        this.mqttClimate.currentFanMode = state.fanSpeed;
        break;
    }
  }
}
