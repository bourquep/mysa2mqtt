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

export type VacuumState = 'cleaning' | 'docked' | 'returning' | 'paused' | 'idle' | 'error';

/** The JSON payload published on a vacuum's state topic. */
export interface VacuumStatePayload {
  /** The current activity of the vacuum. */
  state: VacuumState;
  /** The current battery level, as a percentage (0-100). */
  battery_level?: number;
  /** The current fan speed. Must be one of the configured {@link VacuumInfo.fan_speed_list}. */
  fan_speed?: string;
}

type StateTopicMap = {
  state_topic: VacuumStatePayload;
};

type CommandTopicMap = {
  /** The MQTT topic to subscribe for the primary commands (start, stop, pause, etc.). */
  command_topic: string;

  /** The MQTT topic to subscribe for fan-speed commands. */
  set_fan_speed_command_topic: string;

  /** The MQTT topic to subscribe for custom commands. */
  send_command_topic: string;
};

/** Configuration interface for a vacuum component. */
export interface VacuumInfo extends ComponentConfiguration<'vacuum'> {
  /**
   * List of features the vacuum supports (e.g. `start`, `stop`, `pause`, `return_home`, `battery`, `status`, `locate`,
   * `clean_spot`, `fan_speed`, `send_command`).
   */
  supported_features?: string[];
  /** List of possible fan speeds. */
  fan_speed_list?: string[];
  /** The payload to send to start the vacuum. Default: `"start"`. */
  payload_start?: string;
  /** The payload to send to stop the vacuum. Default: `"stop"`. */
  payload_stop?: string;
  /** The payload to send to pause the vacuum. Default: `"pause"`. */
  payload_pause?: string;
  /** The payload to send to tell the vacuum to return to base. Default: `"return_to_base"`. */
  payload_return_to_base?: string;
  /** The payload to send to locate the vacuum. Default: `"locate"`. */
  payload_locate?: string;
  /** The payload to send to tell the vacuum to clean a spot. Default: `"clean_spot"`. */
  payload_clean_spot?: string;
  /** Defines if published messages should have the retain flag set. Default: `false`. */
  retain?: boolean;
}

/** Represents a robotic vacuum in Home Assistant (state-based schema). */
export class Vacuum extends Subscriber<VacuumInfo, StateTopicMap, CommandTopicMap> {
  private _state: VacuumStatePayload = { state: 'idle' };

  /** @returns The last published vacuum state payload. */
  get state() {
    return this._state;
  }

  get activity() {
    return this._state.state;
  }

  set activity(activity: VacuumState) {
    this._state = { ...this._state, state: activity };
    this.setStateSync('state_topic', this._state);
  }

  get batteryLevel() {
    return this._state.battery_level;
  }

  set batteryLevel(batteryLevel: number | undefined) {
    this._state = { ...this._state, battery_level: batteryLevel };
    this.setStateSync('state_topic', this._state);
  }

  get fanSpeed() {
    return this._state.fan_speed;
  }

  set fanSpeed(fanSpeed: string | undefined) {
    this._state = { ...this._state, fan_speed: fanSpeed };
    this.setStateSync('state_topic', this._state);
  }

  /**
   * Creates a new vacuum instance
   *
   * @param settings - Configuration settings for the vacuum
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param onCommand - Callback function to handle command messages
   */
  constructor(
    settings: ComponentSettings<VacuumInfo>,
    stateTopicNames: Extract<keyof StateTopicMap, string>[],
    onStateChange: StateChangedHandler<StateTopicMap>,
    commandTopicNames: Extract<keyof CommandTopicMap, string>[],
    onCommand: CommandCallback<CommandTopicMap>
  ) {
    super(settings, stateTopicNames, onStateChange, commandTopicNames, onCommand);
  }

  /**
   * Reports the full vacuum state payload at once.
   *
   * @param payload - The state payload to publish.
   */
  async setVacuumState(payload: VacuumStatePayload) {
    this._state = payload;
    await this.setState('state_topic', payload);
  }
}
