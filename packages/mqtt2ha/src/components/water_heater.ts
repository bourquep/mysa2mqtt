/*
mqtt2ha
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

import { StateChangedHandler } from '@/api/discoverable';
import { ComponentSettings } from '@/api/settings';
import { CommandCallback, Subscriber } from '@/api/subscriber';
import { ComponentConfiguration } from '@/configuration/component_configuration';

/**
 * The operation modes a water heater can report: `off`, `eco`, `electric`, `gas`, `heat_pump`, `high_demand`,
 * `performance`.
 */
export type WaterHeaterMode = 'off' | 'eco' | 'electric' | 'gas' | 'heat_pump' | 'high_demand' | 'performance';

type StateTopicMap = {
  /** The MQTT topic to publish the current operation mode on. */
  mode_state_topic: string;

  /** The MQTT topic to publish the target temperature on. */
  temperature_state_topic: string;

  /** The MQTT topic to publish the current temperature on. */
  current_temperature_topic: string;
};

type CommandTopicMap = {
  /** The MQTT topic to subscribe for operation mode commands. */
  mode_command_topic: string;

  /** The MQTT topic to subscribe for target temperature commands. */
  temperature_command_topic: string;

  /** The MQTT topic to subscribe for power commands (`payload_on` / `payload_off`). */
  power_command_topic: string;
};

/** Configuration interface for a water heater component. */
export interface WaterHeaterInfo extends ComponentConfiguration<'water_heater'> {
  /**
   * A list of supported operation modes. Needs to be a subset of the default modes: `off`, `eco`, `electric`, `gas`,
   * `heat_pump`, `high_demand` and `performance`.
   */
  modes?: string[];
  /** Set the initial target temperature. The default value depends on the temperature unit. */
  initial?: number;
  /** Minimum set point available. Default: `43.3°C` or `110°F`. */
  min_temp?: number;
  /** Maximum set point available. Default: `60°C` or `140°F`. */
  max_temp?: number;
  /** Defines the temperature unit of the device, `C` or `F`. */
  temperature_unit?: string;
  /** The desired precision for this device. Supported values are `0.1`, `0.5` and `1.0`. */
  precision?: number;
  /** The payload sent to turn the device on. Default: `"ON"`. */
  payload_on?: string;
  /** The payload sent to turn the device off. Default: `"OFF"`. */
  payload_off?: string;
  /** A template to render the value received on `mode_state_topic`. */
  mode_state_template?: string;
  /** A template to render the value sent to `mode_command_topic`. */
  mode_command_template?: string;
  /** A template to render the value received on `temperature_state_topic`. */
  temperature_state_template?: string;
  /** A template to render the value sent to `temperature_command_topic`. */
  temperature_command_template?: string;
  /** A template to render the value received on `current_temperature_topic`. */
  current_temperature_template?: string;
  /** A template to render the value sent to `power_command_topic`. */
  power_command_template?: string;
  /**
   * Flag that defines if the water heater works in optimistic mode. Default: `true` if no state topic defined, else
   * `false`.
   */
  optimistic?: boolean;
  /** Defines if published messages should have the retain flag set. Default: `false`. */
  retain?: boolean;
}

/** Represents a water heater in Home Assistant. */
export class WaterHeater extends Subscriber<WaterHeaterInfo, StateTopicMap, CommandTopicMap> {
  private _lastOnMode?: string;
  private _currentMode?: string;
  private _targetTemperature?: number;
  private _currentTemperature?: number;

  /**
   * @returns The active operation mode. Setting a mode other than `off` also records it as the last "on" mode used to
   *   restore power, and publishes the value on the `mode_state_topic`.
   */
  get currentMode() {
    return this._currentMode;
  }

  set currentMode(mode: string | undefined) {
    if (mode !== 'off') {
      this._lastOnMode = mode;
    }
    this._currentMode = mode;
    this.setStateSync('mode_state_topic', mode ?? 'None');
  }

  /**
   * @returns The target temperature. Setting it publishes the value on the `temperature_state_topic`; setting
   *   `undefined` publishes `"None"` to reset it.
   */
  get targetTemperature() {
    return this._targetTemperature;
  }

  set targetTemperature(temperature: number | undefined) {
    this._targetTemperature = temperature;
    this.setStateSync('temperature_state_topic', temperature?.toFixed(1) ?? 'None');
  }

  /**
   * @returns The measured current temperature. Setting it publishes the value on the `current_temperature_topic`;
   *   setting `undefined` publishes `"None"` to reset it.
   */
  get currentTemperature() {
    return this._currentTemperature;
  }

  set currentTemperature(temperature: number | undefined) {
    this._currentTemperature = temperature;
    this.setStateSync('current_temperature_topic', temperature?.toFixed(1) ?? 'None');
  }

  /**
   * Creates a new water heater instance
   *
   * @param settings - Configuration settings for the water heater
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param onCommand - Callback function to handle command messages
   */
  constructor(
    settings: ComponentSettings<WaterHeaterInfo>,
    stateTopicNames: Extract<keyof StateTopicMap, string>[],
    onStateChange: StateChangedHandler<StateTopicMap>,
    commandTopicNames: Extract<keyof CommandTopicMap, string>[],
    onCommand: CommandCallback<CommandTopicMap>
  ) {
    super(settings, stateTopicNames, onStateChange, commandTopicNames, async (topicName, message) => {
      await this.handleCommand(topicName, message);
      await onCommand(topicName, message);
    });
  }

  private async handleCommand<TTopicName extends keyof CommandTopicMap & string>(
    topicName: TTopicName,
    message: CommandTopicMap[TTopicName]
  ) {
    switch (topicName) {
      case 'mode_command_topic':
        this.currentMode = message;
        break;

      case 'temperature_command_topic': {
        const temperature = parseFloat(message);
        if (Number.isNaN(temperature)) {
          this.logger.warn("Received a non-numeric payload on the 'temperature_command_topic':", message);
          break;
        }
        this.targetTemperature = temperature;
        break;
      }

      case 'power_command_topic':
        if (message === (this.component.payload_on ?? 'ON')) {
          // When the device has never reported an "on" mode, fall back to the
          // first configured non-off mode so a power-on never publishes an
          // undefined mode.
          this.currentMode = this._lastOnMode ?? this.component.modes?.find((mode) => mode !== 'off');
        } else if (message === (this.component.payload_off ?? 'OFF')) {
          this.currentMode = 'off';
        } else {
          this.logger.warn("Received an unexpected payload on the 'power_command_topic':", message);
        }
        break;

      default:
        this.logger.warn('Received an unexpected command topic:', topicName);
    }
  }
}
