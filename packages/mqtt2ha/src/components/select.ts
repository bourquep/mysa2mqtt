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

/** Configuration interface for a select component */
export interface SelectInfo extends ComponentConfiguration<'select'> {
  /** The list of options that can be selected. */
  options: string[];
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/** Represents a select entity in Home Assistant. A select entity holds one value chosen from a fixed list of options. */
export class Select extends Subscriber<SelectInfo, StateTopicMap, CommandTopicMap> {
  private _selectedOption?: string;

  /** @returns The currently selected option. */
  get selectedOption() {
    return this._selectedOption;
  }

  /**
   * Creates a new select instance
   *
   * @param settings - Configuration settings for the select entity
   * @param commandCallback - Callback function to handle selection commands. The state is updated automatically before
   *   this callback is invoked.
   */
  constructor(
    settings: ComponentSettings<SelectInfo>,
    commandCallback: (topicName: string, message: string) => Promise<void>
  ) {
    super(
      settings,
      ['state_topic'],
      async () => {},
      ['command_topic'],
      async (topicName: string, message: string) => {
        await this.setSelectedOption(message);
        await commandCallback(topicName, message);
      }
    );
  }

  /**
   * Reports the currently selected option.
   *
   * @param option - The option to select. Must be one of the configured {@link SelectInfo.options}.
   */
  async setSelectedOption(option: string) {
    if (!this.component.options.includes(option)) {
      // Home Assistant only accepts a value present in the options list, so
      // publishing anything else would just be ignored.
      this.logger.warn(`Option '${option}' is not part of the configured 'options'; ignoring.`);
      return;
    }
    this._selectedOption = option;
    await this.setState('state_topic', option);
  }
}
