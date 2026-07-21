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

import { ComponentConfiguration } from '@/configuration/component_configuration';
import { ComponentSettings } from '../api/settings';
import { Subscriber } from '../api/subscriber';

type StateTopicMap = {
  state_topic: string;
};

type CommandTopicMap = {
  command_topic: string;
};

/** Configuration interface for a siren component */
export interface SirenInfo extends ComponentConfiguration<'siren'> {
  /** A list of available tones the siren supports. When set, enables the selection of a tone. */
  available_tones?: string[];
  /** If true, assumes state changes immediately without waiting for confirmation. Default is false. */
  optimistic?: boolean;
  /** The payload to publish to turn the siren on. Default is "ON". */
  payload_on?: string;
  /** The payload to publish to turn the siren off. Default is "OFF". */
  payload_off?: string;
  /** The payload received on `state_topic` that represents an ON state. Default is "ON". */
  state_on?: string;
  /** The payload received on `state_topic` that represents an OFF state. Default is "OFF". */
  state_off?: string;
  /** Whether the siren supports a duration parameter when turned on. Default is true. */
  support_duration?: boolean;
  /** Whether the siren supports a volume parameter when turned on. Default is true. */
  support_volume_set?: boolean;
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/**
 * Represents a siren in Home Assistant. A siren is a stateful entity that can be turned on (optionally with a tone,
 * duration and volume) or off.
 */
export class Siren extends Subscriber<SirenInfo, StateTopicMap, CommandTopicMap> {
  private _isOn?: boolean;

  /** @returns Whether the siren is currently on. */
  get isOn() {
    return this._isOn;
  }

  /**
   * Creates a new siren instance
   *
   * @param settings - Configuration settings for the siren
   * @param commandCallback - Callback function to handle siren commands. The message is the raw command payload string;
   *   when tone/duration/volume are used it is a JSON-encoded string the caller is responsible for decoding.
   */
  constructor(
    settings: ComponentSettings<SirenInfo>,
    commandCallback: (topicName: string, message: string) => Promise<void>
  ) {
    super(settings, ['state_topic'], async () => {}, ['command_topic'], commandCallback);
  }

  /** Reports that the siren is on. */
  async on() {
    this._isOn = true;
    await this.setState('state_topic', this.component.state_on ?? 'ON');
  }

  /** Reports that the siren is off. */
  async off() {
    this._isOn = false;
    await this.setState('state_topic', this.component.state_off ?? 'OFF');
  }
}
