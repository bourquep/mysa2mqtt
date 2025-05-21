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
import { Discoverable } from '../api/discoverable';
import { ComponentSettings } from '../api/settings';

type StateTopicMap = {
  state_topic: string;
};

/** Configuration interface for a binary sensor component */
export interface BinarySensorInfo extends ComponentConfiguration<'binary_sensor'> {
  /** The payload that represents an ON/active state. Default is "ON". */
  payload_on?: string;
  /** The payload that represents an OFF/inactive state. Default is "OFF". */
  payload_off?: string;
}

/**
 * Represents a binary sensor in Home Assistant. A binary sensor can only be in one of two states: ON/active or
 * OFF/inactive.
 */
export class BinarySensor extends Discoverable<BinarySensorInfo, StateTopicMap> {
  private _isOn?: boolean;

  /** @returns Returns the current state of the sensor. */
  get isOn() {
    return this._isOn;
  }

  /**
   * Creates a new binary sensor instance
   *
   * @param settings - Configuration settings for the binary sensor
   * @param isOn - Initial state of the sensor
   */
  constructor(settings: ComponentSettings<BinarySensorInfo>, isOn?: boolean) {
    super(settings, ['state_topic']);
    this._isOn = isOn;
  }

  /** Sets the sensor state to ON/active */
  async on() {
    await this.setState('state_topic', this.component.payload_on || 'ON');
    this._isOn = true;
  }

  /** Sets the sensor state to OFF/inactive */
  async off() {
    await this.setState('state_topic', this.component.payload_off || 'OFF');
    this._isOn = false;
  }

  /** Toggles the sensor state */
  async toggle() {
    if (this._isOn) {
      await this.off();
    } else {
      await this.on();
    }
  }
}
