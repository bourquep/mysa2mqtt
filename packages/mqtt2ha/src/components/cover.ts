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

/** The states a cover can report: fully `open`, `opening`, fully `closed`, `closing`, or `stopped` mid-travel. */
export type CoverState = 'open' | 'opening' | 'closed' | 'closing' | 'stopped';

type StateTopicMap = {
  /** The MQTT topic to publish the cover state on. Valid values: `open`, `opening`, `closed`, `closing`, `stopped`. */
  state_topic: string;

  /** The MQTT topic to publish the cover position (0-100) on. */
  position_topic: string;

  /** The MQTT topic to publish the cover tilt position (0-100) on. */
  tilt_status_topic: string;
};

type CommandTopicMap = {
  /** The MQTT topic to subscribe for open/close/stop commands. */
  command_topic: string;

  /** The MQTT topic to subscribe for target position commands. */
  set_position_topic: string;

  /** The MQTT topic to subscribe for target tilt commands. */
  tilt_command_topic: string;
};

/** Configuration interface for a cover component. */
export interface CoverInfo extends ComponentConfiguration<'cover'> {
  /** The payload to open the cover. Default: `"OPEN"`. */
  payload_open?: string;
  /** The payload to close the cover. Default: `"CLOSE"`. */
  payload_close?: string;
  /** The payload to stop the cover. Default: `"STOP"`. */
  payload_stop?: string;
  /** The payload received on `state_topic` that represents an open cover. Default: `"open"`. */
  state_open?: string;
  /** The payload received on `state_topic` that represents an opening cover. Default: `"opening"`. */
  state_opening?: string;
  /** The payload received on `state_topic` that represents a closed cover. Default: `"closed"`. */
  state_closed?: string;
  /** The payload received on `state_topic` that represents a closing cover. Default: `"closing"`. */
  state_closing?: string;
  /** The payload received on `state_topic` that represents a stopped cover. Default: `"stopped"`. */
  state_stopped?: string;
  /** Number which represents the fully-open position. Default: `100`. */
  position_open?: number;
  /** Number which represents the fully-closed position. Default: `0`. */
  position_closed?: number;
  /** Flag that defines if the cover works in optimistic mode. Default: `true` if no state topic defined, else `false`. */
  optimistic?: boolean;
  /** A template to render the position received on `position_topic`. */
  position_template?: string;
  /** A template to render the value sent to `set_position_topic`. */
  set_position_template?: string;
  /** The minimum tilt value. Default: `0`. */
  tilt_min?: number;
  /** The maximum tilt value. Default: `100`. */
  tilt_max?: number;
  /** The tilt value that represents a fully-closed tilt. Default: value of `tilt_min`. */
  tilt_closed_value?: number;
  /** The tilt value that represents a fully-open tilt. Default: value of `tilt_max`. */
  tilt_opened_value?: number;
  /** Defines if published messages should have the retain flag set. Default: `false`. */
  retain?: boolean;
}

/** Represents a cover (blind, shutter, garage door, etc.) in Home Assistant. */
export class Cover extends Subscriber<CoverInfo, StateTopicMap, CommandTopicMap> {
  private _currentState?: CoverState;
  private _position?: number;
  private _tiltPosition?: number;

  /** @returns The current cover state. Setting it publishes the configured payload for that state on the `state_topic`. */
  get currentState() {
    return this._currentState;
  }

  set currentState(state: CoverState | undefined) {
    this._currentState = state;
    if (state !== undefined) {
      const payloadMap: Record<CoverState, string> = {
        open: this.component.state_open ?? 'open',
        opening: this.component.state_opening ?? 'opening',
        closed: this.component.state_closed ?? 'closed',
        closing: this.component.state_closing ?? 'closing',
        stopped: this.component.state_stopped ?? 'stopped'
      };
      this.setStateSync('state_topic', payloadMap[state]);
    }
  }

  /**
   * @returns The current cover position (typically 0-100). Setting a defined value publishes it on the
   *   `position_topic`.
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
   * @returns The current cover tilt position (typically 0-100). Setting a value publishes it on the
   *   `tilt_status_topic`.
   */
  get tiltPosition() {
    return this._tiltPosition;
  }

  set tiltPosition(tilt: number | undefined) {
    this._tiltPosition = tilt;
    if (tilt !== undefined) {
      this.setStateSync('tilt_status_topic', String(tilt));
    }
  }

  /**
   * Creates a new cover instance
   *
   * @param settings - Configuration settings for the cover
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param onCommand - Callback function to handle command messages
   */
  constructor(
    settings: ComponentSettings<CoverInfo>,
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
        } else if (message === (this.component.payload_stop ?? 'STOP')) {
          this.currentState = 'stopped';
        } else {
          this.logger.warn("Received an unexpected payload on the 'command_topic':", message);
        }
        break;

      case 'set_position_topic': {
        const position = parseFloat(message);
        if (Number.isNaN(position)) {
          this.logger.warn("Received a non-numeric payload on the 'set_position_topic':", message);
          break;
        }
        this.position = position;
        break;
      }

      case 'tilt_command_topic': {
        const tilt = parseFloat(message);
        if (Number.isNaN(tilt)) {
          this.logger.warn("Received a non-numeric payload on the 'tilt_command_topic':", message);
          break;
        }
        this.tiltPosition = tilt;
        break;
      }

      default:
        this.logger.warn('Received an unexpected command topic:', topicName);
    }
  }
}
