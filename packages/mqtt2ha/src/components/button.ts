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
import { MqttClient } from 'mqtt';
import { ComponentSettings } from '../api/settings';
import { Subscriber } from '../api/subscriber';

/** Configuration interface for a button component */
export interface ButtonInfo extends ComponentConfiguration<'button'> {
  /** The payload to publish when the button is pressed. Default is "PRESS". */
  payload_press?: string;
  /** Whether to retain the last published state. Default is false. */
  retain?: boolean;
}

/**
 * Represents a button in Home Assistant A button is a momentary push button that triggers an action when pressed
 *
 * @typeParam TUserData - Type of custom user data that can be passed to command callbacks
 */
export class Button<TUserData> extends Subscriber<ButtonInfo, never, TUserData, string> {
  /**
   * Creates a new button instance
   *
   * @param settings - Configuration settings for the button
   * @param commandCallback - Callback function to handle button press events
   * @param userData - Optional user data to be passed to the command callback
   */
  constructor(
    settings: ComponentSettings<ButtonInfo>,
    commandCallback: (client: MqttClient, topicName: string, message: string, userData?: TUserData) => Promise<void>,
    userData?: TUserData
  ) {
    super(settings, ['command_topic'], commandCallback, userData);
  }
}
