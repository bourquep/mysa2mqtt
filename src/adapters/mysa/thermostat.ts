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
import { OutputPolicy } from '../../bridge/output-policy';
import { PowerEnergyPublisher } from '../../energy/power-energy-publisher';
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

export class Thermostat {
  private isStarted = false;
  private readonly mqttDevice: DeviceConfiguration;
  private readonly mqttOrigin: OriginConfiguration;
  /** Climate (control) entity — created only when the policy permits control. */
  private readonly mqttClimate?: Climate;
  /** Temperature sensor — created only when the policy permits non-energy telemetry. */
  private readonly mqttTemperature?: Sensor;
  /** Humidity sensor — created only when the policy permits non-energy telemetry. */
  private readonly mqttHumidity?: Sensor;
  /**
   * Power + energy (+ optional cost) publisher — only created for devices that can report power consumption (not AC
   * controllers or "Lite" units without an estimated current). Always permitted, even in energy-only mode.
   */
  private readonly powerEnergy?: PowerEnergyPublisher;

  /** Effective current rating used for power estimation (device's own, or the configured estimate as a fallback). */
  private readonly effectiveMaxCurrent?: string;
  /** Current operating mode, tracked locally so power/action logic works even when no climate entity is published. */
  private currentMode?: string;

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
    estimatedCurrent?: number,
    private readonly policy: OutputPolicy = OutputPolicy.unrestricted(),
    costPerKwh?: number,
    currency?: string
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

    // The climate entity is the device's control surface — created only when control is permitted.
    if (this.policy.allowsControl) {
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
    }

    // Temperature and humidity are non-energy telemetry — created only when telemetry is permitted.
    if (this.policy.allowsTelemetry) {
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
    }

    // Power + energy (+ optional cost) is electricity-usage data — always published when the device can report it.
    if (canReportPower) {
      this.powerEnergy = new PowerEnergyPublisher({
        mqtt: this.mqttSettings,
        logger: this.logger,
        device: this.mqttDevice,
        origin: this.mqttOrigin,
        uniqueIdPrefix: `mysa_${mysaDevice.Id}`,
        costPerKwh,
        currency
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

      this.currentMode = MYSA_RAW_MODE_TO_DEVICE_MODE[state.TstatMode?.v as number] ?? this.currentMode;

      if (this.mqttClimate) {
        this.mqttClimate.currentTemperature = state.CorrectedTemp?.v;
        this.mqttClimate.currentHumidity = state.Humidity?.v;
        this.mqttClimate.currentMode = this.currentMode ?? this.mqttClimate.currentMode;
        this.mqttClimate.currentFanMode =
          MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE[state.FanSpeed?.v as number] ?? this.mqttClimate.currentFanMode;
        this.mqttClimate.currentAction = computeClimateAction(
          this.currentMode,
          this.deviceType,
          undefined,
          state.Duty?.v
        );
        this.mqttClimate.targetTemperature = this.currentMode !== 'off' ? state.SetPoint?.v : undefined;
        await this.mqttClimate.writeConfig();
      }

      if (this.mqttTemperature) {
        await this.mqttTemperature.setState(
          'state_topic',
          state.CorrectedTemp != null ? state.CorrectedTemp.v.toFixed(2) : 'None'
        );
        await this.mqttTemperature.writeConfig();
      }

      if (this.mqttHumidity) {
        await this.mqttHumidity.setState('state_topic', state.Humidity != null ? state.Humidity.v.toFixed(2) : 'None');
        await this.mqttHumidity.writeConfig();
      }

      if (this.powerEnergy) {
        // `state.Current.v` always has a non-zero value, even for thermostats that are off, so we can't use it to
        // determine the initial power state; start power at None and energy at zero.
        await this.powerEnergy.writeConfig();
        await this.powerEnergy.updatePower(undefined);
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

    await this.mqttTemperature?.setState('state_topic', 'None');
    await this.mqttHumidity?.setState('state_topic', 'None');

    // Mark the Home Assistant entities unavailable so they show as offline (rather than stale) while the bridge is
    // stopped. On restart, `writeConfig()` will mark them available again. The energy total is left as-is (not reset to
    // "None") since it is a cumulative `total_increasing` value.
    await Promise.all([
      this.mqttClimate?.setAvailability(false) ?? Promise.resolve(),
      this.mqttTemperature?.setAvailability(false) ?? Promise.resolve(),
      this.mqttHumidity?.setAvailability(false) ?? Promise.resolve(),
      this.powerEnergy?.setUnavailable() ?? Promise.resolve()
    ]);
  }

  private async handleMysaStatusUpdate(status: Status) {
    if (!this.isStarted || status.deviceId !== this.mysaDevice.Id) {
      return;
    }

    if (this.mqttClimate) {
      this.mqttClimate.currentAction = computeClimateAction(
        this.currentMode,
        this.deviceType,
        status.current,
        status.dutyCycle
      );
      this.mqttClimate.currentTemperature = status.temperature;
      this.mqttClimate.currentHumidity = status.humidity;
      this.mqttClimate.targetTemperature = this.currentMode !== 'off' ? status.setPoint : undefined;
    }

    // Power calculation: V1 devices report current, V2 devices report duty cycle (see `computePowerWatts`). Devices that
    // can't report power (AC controllers, "Lite" units without an estimated current) have no power/energy publisher.
    if (this.powerEnergy) {
      const watts = computePowerWatts(
        this.mysaDevice.Voltage,
        this.effectiveMaxCurrent,
        status.current,
        status.dutyCycle
      );
      // The publisher integrates power into a cumulative energy total (and cost) for the Energy dashboard.
      await this.powerEnergy.updatePower(watts ?? undefined);
    }

    await this.mqttTemperature?.setState('state_topic', status.temperature.toFixed(2));
    await this.mqttHumidity?.setState('state_topic', status.humidity.toFixed(2));
  }

  private async handleMysaStateChange(state: StateChange) {
    if (!this.isStarted || state.deviceId !== this.mysaDevice.Id) {
      return;
    }

    // Track the mode locally so power/action logic works regardless of whether a climate entity is published.
    if (state.mode != null) {
      this.currentMode = state.mode;
    }

    const climate = this.mqttClimate;
    if (!climate) {
      return;
    }

    switch (state.mode) {
      case 'off':
        climate.currentMode = 'off';
        climate.currentAction = 'off';
        climate.targetTemperature = undefined;
        climate.currentFanMode = undefined;
        break;

      case 'heat':
      case 'cool':
      case 'auto':
        climate.currentMode = state.mode;
        if (this.deviceType === 'AC') {
          climate.currentAction = computeClimateAction(climate.currentMode, this.deviceType);
        }
        climate.targetTemperature = state.setPoint;
        climate.currentFanMode = state.fanSpeed;
        break;

      case 'dry':
      case 'fan_only':
        climate.currentMode = state.mode;
        climate.currentAction = computeClimateAction(climate.currentMode, this.deviceType);
        climate.currentFanMode = state.fanSpeed;
        break;
    }
  }
}
