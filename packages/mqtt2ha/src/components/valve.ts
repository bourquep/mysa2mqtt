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

/** The states a valve can report: fully `open`, `opening`, fully `closed`, or `closing`. */
export type ValveState = 'open' | 'opening' | 'closed' | 'closing';

type StateTopicMap = {
  /** The MQTT topic to publish the valve state on. Valid values: `open`, `opening`, `closed`, `closing`. */
  state_topic: string;

  /** The MQTT topic to publish the valve position (0-100) on. Only used when `reports_position` is `true`. */
  position_topic: string;
};

type CommandTopicMap = {
  /** The MQTT topic to subscribe for open/close/stop commands. */
  command_topic: string;

  /** The MQTT topic to subscribe for target position commands. Only used when `reports_position` is `true`. */
  set_position_topic: string;
};

/** Configuration interface for a valve component. */
export interface ValveInfo extends ComponentConfiguration<'valve'> {
  /** The payload to open the valve. Default: `"OPEN"`. */
  payload_open?: string;
  /** The payload to close the valve. Default: `"CLOSE"`. */
  payload_close?: string;
  /** The payload to stop the valve. Default: `"STOP"`. */
  payload_stop?: string;
  /** The payload received on `state_topic` that represents an open valve. Default: `"open"`. */
  state_open?: string;
  /** The payload received on `state_topic` that represents an opening valve. Default: `"opening"`. */
  state_opening?: string;
  /** The payload received on `state_topic` that represents a closed valve. Default: `"closed"`. */
  state_closed?: string;
  /** The payload received on `state_topic` that represents a closing valve. Default: `"closing"`. */
  state_closing?: string;
  /** Whether the valve reports its position. When `true`, the state topic carries a numeric position. Default: `false`. */
  reports_position?: boolean;
  /** Number which represents the fully-open position. Default: `100`. */
  position_open?: number;
  /** Number which represents the fully-closed position. Default: `0`. */
  position_closed?: number;
  /** Flag that defines if the valve works in optimistic mode. Default: `true` if no state topic defined, else `false`. */
  optimistic?: boolean;
  /** Defines if published messages should have the retain flag set. Default: `false`. */
  retain?: boolean;
}

/** Represents a valve in Home Assistant. A valve can be opened, closed, and optionally set to a position. */
export class Valve extends Subscriber<ValveInfo, StateTopicMap, CommandTopicMap> {
  private _currentState?: ValveState;
  private _position?: number;

  /** @returns The current valve state. Setting it publishes the configured payload for that state on the `state_topic`. */
  get currentState() {
    return this._currentState;
  }

  set currentState(state: ValveState | undefined) {
    this._currentState = state;
    if (state !== undefined) {
      const payloadMap: Record<ValveState, string> = {
        open: this.component.state_open ?? 'open',
        opening: this.component.state_opening ?? 'opening',
        closed: this.component.state_closed ?? 'closed',
        closing: this.component.state_closing ?? 'closing'
      };
      this.setStateSync('state_topic', payloadMap[state]);
    }
  }

  /**
   * @returns The current valve position (typically 0-100), used when `reports_position` is enabled. Setting a defined
   *   value publishes it on the `position_topic`.
   */
  get position() {
    return this._position;
  }

  set position(position: number | undefined) {
    this._position = position;
    if (position !== undefined) {
      this.setStateSync('position_topic', String(position));
    }
  }

  /**
   * Creates a new valve instance
   *
   * @param settings - Configuration settings for the valve
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param onCommand - Callback function to handle command messages
   */
  constructor(
    settings: ComponentSettings<ValveInfo>,
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
        if (message === (this.component.payload_open ?? 'OPEN')) {
          this.currentState = 'opening';
        } else if (message === (this.component.payload_close ?? 'CLOSE')) {
          this.currentState = 'closing';
        } else if (message !== (this.component.payload_stop ?? 'STOP')) {
          this.logger.warn("Received an unexpected payload on the 'command_topic':", message);
        }
        break;

      case 'set_position_topic': {
        const position = Number(message);
        if (!Number.isFinite(position)) {
          this.logger.warn("Received a non-numeric payload on the 'set_position_topic':", message);
          break;
        }
        this.position = position;
        break;
      }

      default:
        this.logger.warn('Received an unexpected command topic:', topicName);
    }
  }
}
