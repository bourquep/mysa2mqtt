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

/** The activity a lawn mower can report: `mowing`, `docked`, `paused`, in an `error` state, or `returning` to base. */
export type LawnMowerActivity = 'mowing' | 'docked' | 'paused' | 'error' | 'returning';

type StateTopicMap = {
  /**
   * The MQTT topic to publish the current activity on. Valid values: `mowing`, `docked`, `paused`, `error`,
   * `returning`.
   */
  activity_state_topic: LawnMowerActivity;
};

type CommandTopicMap = {
  /** The MQTT topic to subscribe for "start mowing" commands. */
  start_mowing_command_topic: string;

  /** The MQTT topic to subscribe for "pause" commands. */
  pause_command_topic: string;

  /** The MQTT topic to subscribe for "dock" commands. */
  dock_command_topic: string;
};

/** Configuration interface for a lawn mower component. */
export interface LawnMowerInfo extends ComponentConfiguration<'lawn_mower'> {
  /** A template to render the value sent to `start_mowing_command_topic`. */
  start_mowing_command_template?: string;
  /** A template to render the value sent to `pause_command_topic`. */
  pause_command_template?: string;
  /** A template to render the value sent to `dock_command_topic`. */
  dock_command_template?: string;
  /** A template to render the value received on `activity_state_topic`. */
  activity_value_template?: string;
  /**
   * Flag that defines if the lawn mower works in optimistic mode. Default: `true` if no state topic defined, else
   * `false`.
   */
  optimistic?: boolean;
  /** Defines if published messages should have the retain flag set. Default: `false`. */
  retain?: boolean;
}

/** Represents a robotic lawn mower in Home Assistant. */
export class LawnMower extends Subscriber<LawnMowerInfo, StateTopicMap, CommandTopicMap> {
  private _activity?: LawnMowerActivity;

  /** @returns The current activity. Setting a defined value publishes it on the `activity_state_topic`. */
  get activity() {
    return this._activity;
  }

  set activity(activity: LawnMowerActivity | undefined) {
    this._activity = activity;
    if (activity !== undefined) {
      this.setStateSync('activity_state_topic', activity);
    }
  }

  /**
   * Creates a new lawn mower instance
   *
   * @param settings - Configuration settings for the lawn mower
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param onCommand - Callback function to handle command messages
   */
  constructor(
    settings: ComponentSettings<LawnMowerInfo>,
    stateTopicNames: Extract<keyof StateTopicMap, string>[],
    onStateChange: StateChangedHandler<StateTopicMap>,
    commandTopicNames: Extract<keyof CommandTopicMap, string>[],
    onCommand: CommandCallback<CommandTopicMap>
  ) {
    super(settings, stateTopicNames, onStateChange, commandTopicNames, async (topicName, message) => {
      await this.handleCommand(topicName);
      await onCommand(topicName, message);
    });
  }

  private async handleCommand<TTopicName extends keyof CommandTopicMap & string>(topicName: TTopicName) {
    switch (topicName) {
      case 'start_mowing_command_topic':
        this.activity = 'mowing';
        break;

      case 'pause_command_topic':
        this.activity = 'paused';
        break;

      case 'dock_command_topic':
        this.activity = 'returning';
        break;

      default:
        this.logger.warn('Received an unexpected command topic:', topicName);
    }
  }
}
