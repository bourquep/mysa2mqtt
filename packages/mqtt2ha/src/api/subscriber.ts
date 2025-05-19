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

import { MqttClient } from 'mqtt';
import { BaseComponentConfiguration, ResolvedComponentConfiguration } from '../configuration/component_configuration';
import { Discoverable } from './discoverable';
import { ComponentSettings } from './settings';

/**
 * A base class for Home Assistant MQTT entities that can receive commands. Extends Discoverable to add command handling
 * capabilities.
 *
 * @typeParam TComponentConfiguration - The configuration type specific to this component
 * @typeParam TState - The type of state data this component can handle
 * @typeParam TUserData - Type of custom user data that can be passed to command callbacks
 * @typeParam TCommandMessage - Type of command messages this component can receive
 */
export class Subscriber<
  TComponentConfiguration extends BaseComponentConfiguration,
  TState,
  TUserData,
  TCommandMessage
> extends Discoverable<TComponentConfiguration, TState> {
  /** MQTT topic where commands for this entity are received */
  protected commandTopic: string;

  /**
   * Gets the complete configuration for this entity including command topic
   *
   * @returns The resolved component configuration with all required MQTT topics
   */
  protected override getConfig(): ResolvedComponentConfiguration {
    return {
      ...super.getConfig(),
      command_topic: this.commandTopic
    };
  }

  /**
   * Creates a new subscribable entity
   *
   * @param settings - The component settings including MQTT configuration
   * @param commandCallback - Callback function to handle received commands
   * @param userData - Optional user data to be passed to the command callback
   */
  constructor(
    settings: ComponentSettings<TComponentConfiguration>,
    commandCallback: (client: MqttClient, message: TCommandMessage, userData?: TUserData) => Promise<void>,
    userData?: TUserData
  ) {
    super(settings, () => {
      this.logger.debug(`Subscribing to command topic ${this.commandTopic} for ${this.identifier}...`);
      this.mqttClient.subscribe(this.commandTopic, { qos: 1 });
    });

    this.commandTopic = `${settings.mqtt.state_prefix || 'mqtt2ha'}/${this.baseTopicName}/command`;

    // Attach callback
    this.mqttClient.on('message', async (topic, message) => {
      if (topic === this.commandTopic) {
        const stringMessage = message.toString();
        this.logger.debug(`Received command message for ${this.identifier} on topic ${topic}: ${stringMessage}`);

        let parsedMessage: TCommandMessage;

        try {
          parsedMessage = JSON.parse(stringMessage);
        } catch {
          parsedMessage = stringMessage as unknown as TCommandMessage;
        }

        await commandCallback(this.mqttClient, parsedMessage, userData);
      }
    });
  }
}
