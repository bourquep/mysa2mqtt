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

/** Configuration interface for a number component */
export interface NumberInfo extends ComponentConfiguration<'number'> {
  /** The minimum value that can be set. Default is 1. */
  min?: number;
  /** The maximum value that can be set. Default is 100. */
  max?: number;
  /** The step size of the value. Default is 1. */
  step?: number;
  /** The display mode of the number field. Default is "auto". */
  mode?: 'auto' | 'box' | 'slider';
  /** The unit of measurement of the value (e.g., °C, %). */
  unit_of_measurement?: string;
  /**
   * The payload received on `state_topic` or sent to `command_topic` that resets the value to unknown. Default is
   * "None".
   */
  payload_reset?: string;
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/**
 * Represents a number entity in Home Assistant. A number entity holds a numeric value that can be read and set.
 *
 * The class is named {@link NumberEntity} rather than `Number` to avoid shadowing the built-in `Number` global.
 */
export class NumberEntity extends Subscriber<NumberInfo, StateTopicMap, CommandTopicMap> {
  private _value?: number;

  /** @returns The current numeric value. */
  get value() {
    return this._value;
  }

  /**
   * Creates a new number instance
   *
   * @param settings - Configuration settings for the number entity
   * @param commandCallback - Callback function to handle set commands. The state is updated automatically before this
   *   callback is invoked.
   */
  constructor(
    settings: ComponentSettings<NumberInfo>,
    commandCallback: (topicName: string, message: number) => Promise<void>
  ) {
    super(
      settings,
      ['state_topic'],
      async () => {},
      ['command_topic'],
      async (topicName: string, message: unknown) => {
        const value = typeof message === 'number' ? message : parseFloat(String(message));
        await this.setValue(value);
        await commandCallback(topicName, value);
      }
    );
  }

  /**
   * Reports the current numeric value.
   *
   * @param value - The numeric value to report.
   */
  async setValue(value: number) {
    this._value = value;
    await this.setState('state_topic', String(value));
  }
}
