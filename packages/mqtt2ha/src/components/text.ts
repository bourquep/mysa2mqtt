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

/** Configuration interface for a text component */
export interface TextInfo extends ComponentConfiguration<'text'> {
  /** The minimum allowed length of the text value. Default is 0. */
  min?: number;
  /** The maximum allowed length of the text value. Default is 255. */
  max?: number;
  /** The display mode of the text field. Default is "text". */
  mode?: 'text' | 'password';
  /** A regular expression the text value must match. */
  pattern?: string;
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/** Represents a text entity in Home Assistant. A text entity holds a free-form string value that can be read and set. */
export class Text extends Subscriber<TextInfo, StateTopicMap, CommandTopicMap> {
  private _value?: string;

  /** @returns The current text value. */
  get value() {
    return this._value;
  }

  /**
   * Creates a new text instance
   *
   * @param settings - Configuration settings for the text entity
   * @param commandCallback - Callback function to handle text set commands. The state is updated automatically before
   *   this callback is invoked.
   */
  constructor(
    settings: ComponentSettings<TextInfo>,
    commandCallback: (topicName: string, message: string) => Promise<void>
  ) {
    super(
      settings,
      ['state_topic'],
      async () => {},
      ['command_topic'],
      async (topicName: string, message: string) => {
        await this.setValue(message);
        await commandCallback(topicName, message);
      }
    );
  }

  /**
   * Reports the current text value.
   *
   * @param value - The text value to report.
   */
  async setValue(value: string) {
    this._value = value;
    await this.setState('state_topic', value);
  }
}
