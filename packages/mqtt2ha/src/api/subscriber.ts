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
import { Discoverable, StateChangedHandler } from './discoverable';
import { ComponentSettings } from './settings';

interface CommandTopicConfiguration {
  name: string;
  topic: string;
}

/**
 * A callback type for handling commands received via MQTT.
 *
 * @typeParam TCommandMap - A mapping of command topic names to their respective message types
 */
export type CommandCallback<TCommandMap extends Record<string, unknown>> = <
  TTopicName extends keyof TCommandMap & string
>(
  client: MqttClient,
  topicName: TTopicName,
  message: TCommandMap[TTopicName]
) => Promise<void>;

/**
 * A base class for Home Assistant MQTT entities that can receive commands. Extends Discoverable to add command handling
 * capabilities.
 *
 * @typeParam TComponentConfiguration - The configuration type specific to this component
 * @typeParam TStateMap - The type of state data this component can handle
 * @typeParam TCommandMessage - Type of command messages this component can receive
 */
export class Subscriber<
  TComponentConfiguration extends BaseComponentConfiguration,
  TStateMap extends Record<string, unknown>,
  TCommandMap extends Record<string, unknown>
> extends Discoverable<TComponentConfiguration, TStateMap> {
  /** List of MQTT topics for entity commands. */
  protected commandTopics: CommandTopicConfiguration[] = [];

  /**
   * Gets the complete configuration for this entity including command topic
   *
   * @returns The resolved component configuration with all required MQTT topics
   */
  protected override getConfig(): ResolvedComponentConfiguration {
    return {
      ...super.getConfig(),
      ...Object.fromEntries(Array.from(this.commandTopics.values()).map((cfg) => [cfg.name, cfg.topic]))
    };
  }

  private commandCallback: CommandCallback<TCommandMap>;

  /**
   * Creates a new subscribable entity
   *
   * @param settings - The component settings including MQTT configuration
   * @param stateTopicNames - Array of state topic names
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names
   * @param commandCallback - Callback function to handle received commands
   */
  constructor(
    settings: ComponentSettings<TComponentConfiguration>,
    stateTopicNames: Extract<keyof TStateMap, string>[],
    onStateChange: StateChangedHandler<TStateMap>,
    commandTopicNames: Extract<keyof TCommandMap, string>[],
    commandCallback: CommandCallback<TCommandMap>
  ) {
    if (commandTopicNames.length === 0) {
      throw new Error('No command topics provided');
    }

    super(settings, stateTopicNames, onStateChange, async () => {
      await this.subscribeToCommandTopics();
    });

    this.commandCallback = commandCallback;

    this.commandTopics = commandTopicNames.map((topicName) => ({
      name: topicName,
      topic: `${settings.mqtt.state_prefix || 'mqtt2ha'}/${this.baseTopicName}/${topicName.endsWith('_topic') ? topicName.slice(0, -6) : topicName}`
    }));

    this.mqttClient.on('message', async (topic, message) => {
      await this.handleCommandMessage(topic, message);
    });
  }

  private async subscribeToCommandTopics() {
    for (const topicConfiguration of this.commandTopics) {
      this.logger.debug(
        `Subscribing to command topic '${topicConfiguration.name}: ${topicConfiguration.topic}' for ${this.identifier}...`
      );
      await this.mqttClient.subscribeAsync(topicConfiguration.topic, { qos: 1 });
    }
  }

  private async handleCommandMessage(topic: string, message: Buffer<ArrayBufferLike>) {
    const commandTopic = this.commandTopics.find((t) => t.topic === topic);
    if (commandTopic) {
      const stringMessage = message.toString();
      this.logger.debug(`Received command message for ${this.identifier} on topic ${topic}: ${stringMessage}`);

      let parsedMessage: unknown;

      try {
        parsedMessage = JSON.parse(stringMessage);
      } catch {
        parsedMessage = stringMessage;
      }

      await this.commandCallback(
        this.mqttClient,
        commandTopic.name,
        parsedMessage as TCommandMap[(typeof commandTopic)['name']]
      );
    }
  }
}
