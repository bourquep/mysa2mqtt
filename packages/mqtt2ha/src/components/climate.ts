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
import { Subscriber } from '@/api/subscriber';
import { ComponentConfiguration } from '@/configuration/component_configuration';

export type ClimateAction = 'off' | 'heating' | 'cooling' | 'drying' | 'idle' | 'fan';

type StateTopicMap = {
  /**
   * The MQTT topic to subscribe for changes of the current action. Valid action values: `off`, `heating`, `cooling`,
   * `drying`, `idle`, `fan`.
   */
  action_topic: ClimateAction;

  /**
   * The MQTT topic on which to listen for the current humidity. A `"None"` value received will reset the current
   * humidity. Empty values (`''`) will be ignored.
   */
  current_humidity_topic: string;

  /**
   * The MQTT topic on which to listen for the current temperature. A `"None"` value received will reset the current
   * temperature. Empty values (`''`) will be ignored.
   */
  current_temperature_topic: string;

  /**
   * The MQTT topic to subscribe for changes of the HVAC fan mode. If this is not set, the fan mode works in optimistic
   * mode. A "None" payload resets the fan mode state. An empty payload is ignored.
   */
  fan_mode_state_topic: string;

  /**
   * The MQTT topic to subscribe for changes of the HVAC operation mode. If this is not set, the operation mode works in
   * optimistic mode. A "None" payload resets to an `unknown` state. An empty payload is ignored.
   */
  mode_state_topic: string;

  /**
   * The MQTT topic subscribed to receive climate speed based on presets. When preset 'none' is received or `None` the
   * `preset_mode` will be reset.
   */
  preset_mode_state_topic: string;

  /**
   * The MQTT topic to subscribe for changes of the HVAC swing horizontal mode. If this is not set, the swing horizontal
   * mode works in optimistic mode.
   */
  swing_horizontal_mode_state_topic: string;

  /**
   * The MQTT topic to subscribe for changes of the HVAC swing mode. If this is not set, the swing mode works in
   * optimistic mode.
   */
  swing_mode_state_topic: string;

  /**
   * The MQTT topic subscribed to receive the target humidity. If this is not set, the target humidity works in
   * optimistic mode. A `"None"` value received will reset the target humidity. Empty values (`''`) will be ignored.
   */
  target_humidity_state_topic: string;

  /**
   * The MQTT topic to subscribe for changes in the target high temperature. If this is not set, the target high
   * temperature works in optimistic mode.
   */
  temperature_high_state_topic: string;

  /**
   * The MQTT topic to subscribe for changes in the target low temperature. If this is not set, the target low
   * temperature works in optimistic mode.
   */
  temperature_low_state_topic: string;

  /**
   * The MQTT topic to subscribe for changes in the target temperature. If this is not set, the target temperature works
   * in optimistic mode. A `"None"` value received will reset the temperature set point. Empty values (`''`) will be
   * ignored.
   */
  temperature_state_topic: string;
};

type CommandTopicMap = {
  /** The MQTT topic to publish commands to change the fan mode. */
  fan_mode_command_topic: string;

  /** The MQTT topic to publish commands to change the HVAC operation mode. */
  mode_command_topic: string;

  /**
   * The MQTT topic to publish commands to change the HVAC power state. Sends the payload configured with `payload_on`
   * if the climate is turned on, or the payload configured with `payload_off` if the climate is turned off.
   */
  power_command_topic: string;

  /** The MQTT topic to publish commands to change the preset mode. */
  preset_mode_command_topic: string;

  /** The MQTT topic to publish commands to change the swing horizontal mode. */
  swing_horizontal_mode_command_topic: string;

  /** The MQTT topic to publish commands to change the swing mode. */
  swing_mode_command_topic: string;

  /** The MQTT topic to publish commands to change the target humidity. */
  target_humidity_command_topic: string;

  /** The MQTT topic to publish commands to change the target temperature. */
  temperature_command_topic: string;

  /** The MQTT topic to publish commands to change the high target temperature. */
  temperature_high_command_topic: string;

  /** The MQTT topic to publish commands to change the target low temperature. */
  temperature_low_command_topic: string;
};

/** Configuration interface for a climate component. */
export interface ClimateInfo extends ComponentConfiguration<'climate'> {
  /** A template to render the value received on the `action_topic` with. */
  action_template?: string;

  /** A template with which the value received on `current_humidity_topic` will be rendered. */
  current_humidity_template?: string;

  /** A template with which the value received on `current_temperature_topic` will be rendered. */
  current_temperature_template?: string;

  /** A template to render the value sent to the `fan_mode_command_topic` with. */
  fan_mode_command_template?: string;

  /** A template to render the value received on the `fan_mode_state_topic` with. */
  fan_mode_state_template?: string;

  /** A list of supported fan modes. Default: `["auto", "low", "medium", "high"]` */
  fan_modes?: string[];

  /** Set the initial target temperature. The default value depends on the temperature unit and will be 21° or 69.8°F. */
  initial?: number;

  /** The maximum target humidity percentage that can be set. Default: `99` */
  max_humidity?: number;

  /** Maximum set point available. The default value depends on the temperature unit, and will be 35°C or 95°F. */
  max_temp?: number;

  /** The minimum target humidity percentage that can be set. Default: `30` */
  min_humidity?: number;

  /** Minimum set point available. The default value depends on the temperature unit, and will be 7°C or 44.6°F. */
  min_temp?: number;

  /** A template to render the value sent to the `mode_command_topic` with. */
  mode_command_template?: string;

  /** A template to render the value received on the `mode_state_topic` with. */
  mode_state_template?: string;

  /**
   * A list of supported modes. Needs to be a subset of the default values. Default: ["auto", "off", "cool", "heat",
   * "dry", "fan_only"]
   */
  modes?: string[];

  /** Flag that defines if the climate works in optimistic mode. Default: `true` if no state topic defined, else `false`. */
  optimistic?: boolean;

  /** The payload sent to turn off the device. Default: `"OFF"` */
  payload_off?: string;

  /** The payload sent to turn the device on. Default: `"ON"` */
  payload_on?: string;

  /**
   * A template to render the value sent to the `power_command_topic` with. The `value` parameter is the payload set for
   * `payload_on` or `payload_off`.
   */
  power_command_template?: string;

  /**
   * The desired precision for this device. Can be used to match your actual thermostat's precision. Supported values
   * are `0.1`, `0.5` and `1.0`. Default: `0.1` for Celsius and `1.0` for Fahrenheit.
   */
  precision?: number;

  /** Defines a template to generate the payload to send to `preset_mode_command_topic`. */
  preset_mode_command_template?: string;

  /** Defines a template to extract the `preset_mode` value from the payload received on `preset_mode_state_topic`. */
  preset_mode_value_template?: string;

  /**
   * List of preset modes this climate is supporting. Common examples include `eco`, `away`, `boost`, `comfort`, `home`,
   * `sleep` and `activity`. Default: `[]`
   */
  preset_modes?: string[];

  /** Defines if published messages should have the retain flag set. Default: `false` */
  retain?: boolean;

  /** A template to render the value sent to the `swing_horizontal_mode_command_topic` with. */
  swing_horizontal_mode_command_template?: string;

  /** A template to render the value received on the `swing_horizontal_mode_state_topic` with. */
  swing_horizontal_mode_state_template?: string;

  /** A list of supported swing horizontal modes. Default: `["on", "off"]` */
  swing_horizontal_modes?: string[];

  /** A template to render the value sent to the `swing_mode_command_topic` with. */
  swing_mode_command_template?: string;

  /** A template to render the value received on the `swing_mode_state_topic` with. */
  swing_mode_state_template?: string;

  /** A list of supported swing modes. Default: `["on", "off"]` */
  swing_modes?: string[];

  /** Defines a template to generate the payload to send to `target_humidity_command_topic`. */
  target_humidity_command_template?: string;

  /** Defines a template to extract a value for the climate `target_humidity` state. */
  target_humidity_state_template?: string;

  /** A template to render the value sent to the `temperature_command_topic` with. */
  temperature_command_template?: string;

  /** A template to render the value sent to the `temperature_high_command_topic` with. */
  temperature_high_command_template?: string;

  /**
   * A template to render the value received on the `temperature_high_state_topic` with. A `"None"` value received will
   * reset the temperature high set point. Empty values ( `''`) will be ignored.
   */
  temperature_high_state_template?: string;

  /** A template to render the value sent to the `temperature_low_command_topic` with. */
  temperature_low_command_template?: string;

  /**
   * A template to render the value received on the `temperature_low_state_topic` with. A `"None"` value received will
   * reset the temperature low set point. Empty values ( `''`) will be ignored.
   */
  temperature_low_state_template?: string;

  /** A template to render the value received on the `temperature_state_topic` with. */
  temperature_state_template?: string;

  /**
   * Defines the temperature unit of the device, `C` or `F`. If this is not set, the temperature unit is set to the
   * system temperature unit.
   */
  temperature_unit?: string;

  /** Step size for temperature set point. Default: `1` */
  temp_step?: number;
}

/**
 * Represents a thermostat in Home Assistant.
 *
 * @typeParam TUserData - Type of custom user data that can be passed to command callbacks
 */
export class Climate<TUserData> extends Subscriber<ClimateInfo, StateTopicMap, CommandTopicMap, TUserData> {
  private _lastOnMode?: string;
  private _currentAction: ClimateAction = 'off';
  private _currentMode?: string;
  private _currentTemperature?: number;
  private _currentHumidity?: number;
  private _currentFanMode?: string;
  private _currentPresetMode?: string;
  private _currentSwingHorizontalMode?: string;
  private _currentSwingMode?: string;
  private _targetHumidity?: number;
  private _temperatureHigh?: number;
  private _temperatureLow?: number;
  private _targetTemperature?: number;

  get currentAction() {
    return this._currentAction;
  }

  set currentAction(action: ClimateAction) {
    this._currentAction = action;
    this.setStateSync('action_topic', action);
  }

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

  get currentTemperature() {
    return this._currentTemperature;
  }

  set currentTemperature(temperature: number | undefined) {
    this._currentTemperature = temperature;
    this.setStateSync('current_temperature_topic', temperature?.toFixed(1) ?? 'None');
  }

  get currentHumidity() {
    return this._currentHumidity;
  }

  set currentHumidity(humidity: number | undefined) {
    this._currentHumidity = humidity;
    this.setStateSync('current_humidity_topic', humidity?.toFixed(1) ?? 'None');
  }

  get currentFanMode() {
    return this._currentFanMode;
  }

  set currentFanMode(fanMode: string | undefined) {
    this._currentFanMode = fanMode;
    this.setStateSync('fan_mode_state_topic', fanMode ?? 'None');
  }

  get currentPresetMode() {
    return this._currentPresetMode;
  }

  set currentPresetMode(presetMode: string | undefined) {
    this._currentPresetMode = presetMode;
    this.setStateSync('preset_mode_state_topic', presetMode ?? 'None');
  }

  get currentSwingHorizontalMode() {
    return this._currentSwingHorizontalMode;
  }

  set currentSwingHorizontalMode(swingMode: string | undefined) {
    this._currentSwingHorizontalMode = swingMode;
    this.setStateSync('swing_horizontal_mode_state_topic', swingMode ?? 'None');
  }

  get currentSwingMode() {
    return this._currentSwingMode;
  }

  set currentSwingMode(swingMode: string | undefined) {
    this._currentSwingMode = swingMode;
    this.setStateSync('swing_mode_state_topic', swingMode ?? 'None');
  }

  get targetHumidity() {
    return this._targetHumidity;
  }

  set targetHumidity(humidity: number | undefined) {
    this._targetHumidity = humidity;
    this.setStateSync('target_humidity_state_topic', humidity?.toFixed(1) ?? 'None');
  }

  get temperatureHigh() {
    return this._temperatureHigh;
  }

  set temperatureHigh(temperature: number | undefined) {
    this._temperatureHigh = temperature;
    this.setStateSync('temperature_high_state_topic', temperature?.toFixed(1) ?? 'None');
  }

  get temperatureLow() {
    return this._temperatureLow;
  }

  set temperatureLow(temperature: number | undefined) {
    this._temperatureLow = temperature;
    this.setStateSync('temperature_low_state_topic', temperature?.toFixed(1) ?? 'None');
  }

  get targetTemperature() {
    return this._targetTemperature;
  }

  set targetTemperature(temperature: number | undefined) {
    this._targetTemperature = temperature;
    this.setStateSync('temperature_state_topic', temperature?.toFixed(1) ?? 'None');
  }

  /**
   * Creates a new climate instance
   *
   * @param settings - Configuration settings for the climate
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param userData - Optional user data to be passed to the command callback
   */
  constructor(
    settings: ComponentSettings<ClimateInfo>,
    stateTopicNames: Extract<keyof StateTopicMap, string>[],
    onStateChange: StateChangedHandler<StateTopicMap>,
    commandTopicNames: Extract<keyof CommandTopicMap, string>[],
    userData?: TUserData
  ) {
    super(
      settings,
      stateTopicNames,
      onStateChange,
      commandTopicNames,
      async (_, topicName, message) => {
        await this.handleCommand(topicName, message);
      },
      userData
    );
  }

  private async handleCommand<TTopicName extends keyof CommandTopicMap & string>(
    topicName: TTopicName,
    message: CommandTopicMap[TTopicName]
  ) {
    switch (topicName) {
      case 'fan_mode_command_topic':
        this.currentFanMode = message;
        break;

      case 'mode_command_topic':
        this.currentMode = message;
        break;

      case 'power_command_topic':
        if (message === (this.component.payload_on ?? 'ON')) {
          this.currentMode = this._lastOnMode;
        } else if (message === (this.component.payload_off ?? 'OFF')) {
          this.currentMode = 'off';
        } else {
          this.logger.warn("Received an unexpected payload on the 'power_command_topic':", message);
        }
        break;

      case 'preset_mode_command_topic':
        this.currentPresetMode = message;
        break;

      case 'swing_horizontal_mode_command_topic':
        this.currentSwingHorizontalMode = message;
        break;

      case 'swing_mode_command_topic':
        this.currentSwingMode = message;
        break;

      case 'target_humidity_command_topic':
        this.targetHumidity = parseFloat(message);
        break;

      case 'temperature_command_topic':
        this.targetTemperature = parseFloat(message);
        break;

      case 'temperature_high_command_topic':
        this.temperatureHigh = parseFloat(message);
        break;

      case 'temperature_low_command_topic':
        this.temperatureLow = parseFloat(message);
        break;

      default:
        this.logger.warn('Received an unexpected command topic:', topicName);
    }
  }
}
