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

/** The rotation direction a fan can report. */
export type FanDirection = 'forward' | 'reverse';

type StateTopicMap = {
  /** The MQTT topic to publish the on/off state on. */
  state_topic: string;

  /** The MQTT topic to publish the fan speed percentage (0-100) on. */
  percentage_state_topic: string;

  /** The MQTT topic to publish the preset mode on. */
  preset_mode_state_topic: string;

  /** The MQTT topic to publish the oscillation state on. */
  oscillation_state_topic: string;

  /** The MQTT topic to publish the direction on. */
  direction_state_topic: string;
};

type CommandTopicMap = {
  /** The MQTT topic to subscribe for on/off commands. */
  command_topic: string;

  /** The MQTT topic to subscribe for speed percentage commands. */
  percentage_command_topic: string;

  /** The MQTT topic to subscribe for preset mode commands. */
  preset_mode_command_topic: string;

  /** The MQTT topic to subscribe for oscillation commands. */
  oscillation_command_topic: string;

  /** The MQTT topic to subscribe for direction commands. */
  direction_command_topic: string;
};

/** Configuration interface for a fan component. */
export interface FanInfo extends ComponentConfiguration<'fan'> {
  /** The payload to turn the fan on. Default: `"ON"`. */
  payload_on?: string;
  /** The payload to turn the fan off. Default: `"OFF"`. */
  payload_off?: string;
  /** The payload to enable oscillation. Default: `"oscillate_on"`. */
  payload_oscillation_on?: string;
  /** The payload to disable oscillation. Default: `"oscillate_off"`. */
  payload_oscillation_off?: string;
  /** The payload received that resets the percentage to unknown. Default: `"None"`. */
  payload_reset_percentage?: string;
  /** The payload received that resets the preset mode to unknown. Default: `"None"`. */
  payload_reset_preset_mode?: string;
  /** The minimum of the numeric output range (`off` not included, so `speed_range_min - 1` represents 0%). Default: `1`. */
  speed_range_min?: number;
  /** The maximum of the numeric output range. Default: `100`. */
  speed_range_max?: number;
  /** List of preset modes this fan supports. */
  preset_modes?: string[];
  /** Flag that defines if the fan works in optimistic mode. Default: `true` if no state topic defined, else `false`. */
  optimistic?: boolean;
  /** Defines if published messages should have the retain flag set. Default: `false`. */
  retain?: boolean;
}

/** Represents a fan in Home Assistant. */
export class Fan extends Subscriber<FanInfo, StateTopicMap, CommandTopicMap> {
  private _isOn?: boolean;
  private _percentage?: number;
  private _presetMode?: string;
  private _oscillation?: boolean;
  private _direction?: FanDirection;

  /** @returns Whether the fan is on. Setting a value publishes the configured on/off payload on the `state_topic`. */
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
   * @returns The fan speed as a percentage (0-100). Setting a defined value publishes it on the
   *   `percentage_state_topic`; setting `undefined` publishes the configured `payload_reset_percentage`.
   */
  get percentage() {
    return this._percentage;
  }

  set percentage(percentage: number | undefined) {
    this._percentage = percentage;
    this.setStateSync(
      'percentage_state_topic',
      percentage !== undefined ? String(percentage) : (this.component.payload_reset_percentage ?? 'None')
    );
  }

  /**
   * @returns The active preset mode. Setting it publishes the value on the `preset_mode_state_topic`; setting
   *   `undefined` publishes the configured `payload_reset_preset_mode`.
   */
  get presetMode() {
    return this._presetMode;
  }

  set presetMode(presetMode: string | undefined) {
    this._presetMode = presetMode;
    this.setStateSync('preset_mode_state_topic', presetMode ?? this.component.payload_reset_preset_mode ?? 'None');
  }

  /**
   * @returns Whether the fan is oscillating. Setting a defined value publishes the configured oscillation on/off
   *   payload on the `oscillation_state_topic`.
   */
  get oscillation() {
    return this._oscillation;
  }

  set oscillation(oscillation: boolean | undefined) {
    this._oscillation = oscillation;
    if (oscillation !== undefined) {
      this.setStateSync(
        'oscillation_state_topic',
        oscillation
          ? (this.component.payload_oscillation_on ?? 'oscillate_on')
          : (this.component.payload_oscillation_off ?? 'oscillate_off')
      );
    }
  }

  /** @returns The rotation direction. Setting a defined value publishes it on the `direction_state_topic`. */
  get direction() {
    return this._direction;
  }

  set direction(direction: FanDirection | undefined) {
    this._direction = direction;
    if (direction !== undefined) {
      this.setStateSync('direction_state_topic', direction);
    }
  }

  /**
   * Creates a new fan instance
   *
   * @param settings - Configuration settings for the fan
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param onCommand - Callback function to handle command messages
   */
  constructor(
    settings: ComponentSettings<FanInfo>,
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

      case 'percentage_command_topic': {
        const percentage = Number(message);
        if (message.trim() === '' || !Number.isFinite(percentage)) {
          this.logger.warn("Received a non-numeric payload on the 'percentage_command_topic':", message);
          break;
        }
        this.percentage = percentage;
        break;
      }

      case 'preset_mode_command_topic':
        this.presetMode = message;
        break;

      case 'oscillation_command_topic':
        this.oscillation = message === (this.component.payload_oscillation_on ?? 'oscillate_on');
        break;

      case 'direction_command_topic':
        this.direction = message as FanDirection;
        break;

      default:
        this.logger.warn('Received an unexpected command topic:', topicName);
    }
  }
}
