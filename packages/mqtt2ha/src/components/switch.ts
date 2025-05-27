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

/** Configuration interface for a switch component */
export interface SwitchInfo extends ComponentConfiguration<'switch'> {
  /** The payload to publish for turning the switch on. Default is "ON". */
  payload_on?: string;
  /** The payload to publish for turning the switch off. Default is "OFF". */
  payload_off?: string;
  /** If true, assumes state changes immediately without waiting for confirmation. Default is false. */
  optimistic?: boolean;
}

/** Represents a switch in Home Assistant A switch is a stateful toggle that can be turned on or off */
export class Switch extends Subscriber<SwitchInfo, StateTopicMap, CommandTopicMap> {
  /**
   * Creates a new switch instance
   *
   * @param settings - Configuration settings for the switch
   * @param commandCallback - Callback function to handle switch state changes
   */
  constructor(
    settings: ComponentSettings<SwitchInfo>,
    commandCallback: (topicName: string, message: string) => Promise<void>
  ) {
    super(
      settings,
      ['state_topic'],
      async () => {},
      ['command_topic'],
      async (topicName: string, message: string) => {
        if (message === (this.component.payload_on || 'ON')) {
          await this.on();
        } else if (message === (this.component.payload_off || 'OFF')) {
          await this.off();
        }
        await commandCallback(topicName, message);
      }
    );
  }

  /** Turns the switch on Publishes the configured ON payload or "ON" if not configured */
  async on() {
    await this.setState('state_topic', this.component.payload_on || 'ON');
  }

  /** Turns the switch off Publishes the configured OFF payload or "OFF" if not configured */
  async off() {
    await this.setState('state_topic', this.component.payload_off || 'OFF');
  }
}
