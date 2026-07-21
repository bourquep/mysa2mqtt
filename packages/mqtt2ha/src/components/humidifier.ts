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

/** The current action a humidifier can report: `off`, actively `humidifying`, `drying`, or `idle`. */
export type HumidifierAction = 'off' | 'humidifying' | 'drying' | 'idle';

type StateTopicMap = {
  /** The MQTT topic to publish the on/off state on. */
  state_topic: string;

  /** The MQTT topic to publish the current humidity on. */
  current_humidity_topic: string;

  /** The MQTT topic to publish the target humidity on. */
  target_humidity_state_topic: string;

  /** The MQTT topic to publish the current mode on. */
  mode_state_topic: string;

  /** The MQTT topic to publish the current action on. Valid values: `off`, `humidifying`, `drying`, `idle`. */
  action_topic: HumidifierAction;
};

type CommandTopicMap = {
  /** The MQTT topic to subscribe for on/off commands. */
  command_topic: string;

  /** The MQTT topic to subscribe for target humidity commands. */
  target_humidity_command_topic: string;

  /** The MQTT topic to subscribe for mode commands. */
  mode_command_topic: string;
};

/** Configuration interface for a humidifier component. */
export interface HumidifierInfo extends ComponentConfiguration<'humidifier'> {
  /** The payload to turn the humidifier on. Default: `"ON"`. */
  payload_on?: string;
  /** The payload to turn the humidifier off. Default: `"OFF"`. */
  payload_off?: string;
  /** The minimum target humidity percentage that can be set. Default: `0`. */
  min_humidity?: number;
  /** The maximum target humidity percentage that can be set. Default: `100`. */
  max_humidity?: number;
  /** List of available modes this humidifier supports (e.g. `normal`, `eco`, `away`, `boost`, `sleep`). */
  modes?: string[];
  /** A template to render the value sent to `target_humidity_command_topic`. */
  target_humidity_command_template?: string;
  /** A template to render the value sent to `mode_command_topic`. */
  mode_command_template?: string;
  /** The payload received that resets the target humidity to unknown. Default: `"None"`. */
  payload_reset_humidity?: string;
  /** The payload received that resets the mode to unknown. Default: `"None"`. */
  payload_reset_mode?: string;
  /**
   * Flag that defines if the humidifier works in optimistic mode. Default: `true` if no state topic defined, else
   * `false`.
   */
  optimistic?: boolean;
  /** Defines if published messages should have the retain flag set. Default: `false`. */
  retain?: boolean;
}

/** Represents a humidifier (or dehumidifier) in Home Assistant. */
export class Humidifier extends Subscriber<HumidifierInfo, StateTopicMap, CommandTopicMap> {
  private _isOn?: boolean;
  private _currentHumidity?: number;
  private _targetHumidity?: number;
  private _currentMode?: string;
  private _currentAction?: HumidifierAction;

  /**
   * @returns Whether the humidifier is on. Setting a value publishes the configured on/off payload on the
   *   `state_topic`.
   */
  get isOn() {
    return this._isOn;
  }

  set isOn(isOn: boolean | undefined) {
    this._isOn = isOn;
    if (isOn !== undefined) {
      this.setStateSync(
        'state_topic',
        isOn ? (this.component.payload_on ?? 'ON') : (this.component.payload_off ?? 'OFF')
      );
    }
  }

  /**
   * @returns The measured current humidity, as a percentage. Setting it publishes the value on the
   *   `current_humidity_topic`; setting `undefined` publishes `"None"` to reset it.
   */
  get currentHumidity() {
    return this._currentHumidity;
  }

  set currentHumidity(humidity: number | undefined) {
    this._currentHumidity = humidity;
    this.setStateSync('current_humidity_topic', humidity?.toFixed(1) ?? 'None');
  }

  /**
   * @returns The target humidity, as a percentage. Setting it publishes the value on the `target_humidity_state_topic`;
   *   setting `undefined` publishes the configured `payload_reset_humidity`.
   */
  get targetHumidity() {
    return this._targetHumidity;
  }

  set targetHumidity(humidity: number | undefined) {
    this._targetHumidity = humidity;
    this.setStateSync(
      'target_humidity_state_topic',
      humidity?.toFixed(1) ?? this.component.payload_reset_humidity ?? 'None'
    );
  }

  /**
   * @returns The active mode. Setting it publishes the value on the `mode_state_topic`; setting `undefined` publishes
   *   the configured `payload_reset_mode`.
   */
  get currentMode() {
    return this._currentMode;
  }

  set currentMode(mode: string | undefined) {
    this._currentMode = mode;
    this.setStateSync('mode_state_topic', mode ?? this.component.payload_reset_mode ?? 'None');
  }

  /** @returns The current action. Setting a defined value publishes it on the `action_topic`. */
  get currentAction() {
    return this._currentAction;
  }

  set currentAction(action: HumidifierAction | undefined) {
    this._currentAction = action;
    if (action !== undefined) {
      this.setStateSync('action_topic', action);
    }
  }

  /**
   * Creates a new humidifier instance
   *
   * @param settings - Configuration settings for the humidifier
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param onCommand - Callback function to handle command messages
   */
  constructor(
    settings: ComponentSettings<HumidifierInfo>,
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
      case 'command_topic':
        if (message === (this.component.payload_on ?? 'ON')) {
          this.isOn = true;
        } else if (message === (this.component.payload_off ?? 'OFF')) {
          this.isOn = false;
        } else {
          this.logger.warn("Received an unexpected payload on the 'command_topic':", message);
        }
        break;

      case 'target_humidity_command_topic': {
        const humidity = parseFloat(message);
        if (Number.isNaN(humidity)) {
          this.logger.warn("Received a non-numeric payload on the 'target_humidity_command_topic':", message);
          break;
        }
        this.targetHumidity = humidity;
        break;
      }

      case 'mode_command_topic':
        this.currentMode = message;
        break;

      default:
        this.logger.warn('Received an unexpected command topic:', topicName);
    }
  }
}
