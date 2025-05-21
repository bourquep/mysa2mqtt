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
  state_topic: {
    /** The current value of the sensor, can be numeric or string */
    state: string | number;
    /** Optional timestamp of when the sensor was last reset */
    last_reset?: string;
  };
};

/** Configuration interface for a sensor component */
export interface SensorInfo extends ComponentConfiguration<'sensor'> {
  /** Unit of measurement for the sensor's value (e.g., °C, hPa, %) */
  unit_of_measurement?: string;
  /** Classification of sensor state data (e.g., measurement, total, total_increasing) */
  state_class?: string;
  /** Template to extract the sensor value from the payload */
  value_template?: string;
  /** Template to extract the last reset time from the payload */
  last_reset_value_template?: string;
  /** Number of decimal places to display in the UI */
  suggested_display_precision?: number;
}

/** Represents a sensor in Home Assistant A sensor reports state values that can be either numeric or string */
export class Sensor extends Discoverable<SensorInfo, StateTopicMap> {
  /**
   * Creates a new sensor instance
   *
   * @param settings - Configuration settings for the sensor
   */
  constructor(settings: ComponentSettings<SensorInfo>) {
    super(settings, ['state_topic']);
  }
}
