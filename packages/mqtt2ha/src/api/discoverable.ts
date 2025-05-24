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

import { connect, MqttClient } from 'mqtt';
import { BaseComponentConfiguration, ResolvedComponentConfiguration } from '../configuration/component_configuration';
import { Logger, VoidLogger } from '../lib/logger';
import { cleanString } from '../lib/utils';
import { ComponentSettings } from './settings';

/**
 * A function type for handling state changes.
 *
 * @typeParam TStateMap - A mapping of state topic names to their respective message types
 */
export type StateChangedHandler<TStateMap extends Record<string, unknown>> = <
  TStateName extends keyof TStateMap & string
>(
  topicName: TStateName,
  message: TStateMap[TStateName]
) => Promise<void>;

interface StateTopicConfiguration {
  name: string;
  topic: string;
}

/**
 * Base class for Home Assistant MQTT discoverable entities. Handles the MQTT discovery protocol and provides common
 * functionality for all entity types.
 *
 * @typeParam TComponentConfiguration - The configuration type specific to this component
 * @typeParam TState - The type of state data this component can handle
 */
export class Discoverable<
  TComponentConfiguration extends BaseComponentConfiguration,
  TStateMap extends Record<string, unknown>
> {
  /** The component settings including MQTT configuration */
  protected settings: ComponentSettings<TComponentConfiguration>;
  /** The component configuration containing entity-specific settings */
  protected component: TComponentConfiguration;
  /** The MQTT client instance used for communication */
  protected mqttClient: MqttClient;
  /** Logger instance for debugging and error reporting */
  protected logger: Logger;
  /** Unique identifier for this entity */
  protected identifier: string;
  /** Base MQTT topic name for this entity */
  protected baseTopicName: string;
  /** MQTT topic for entity configuration */
  protected configTopic: string;
  /** List of MQTT topics for entity state */
  protected stateTopics: StateTopicConfiguration[];
  /** MQTT topic for entity attributes */
  protected attributesTopic: string;
  /** MQTT topic for entity availability status */
  protected availabilityTopic: string;
  /** Flag indicating whether configuration has been written to MQTT */
  protected wroteConfiguration = false;
  /** Callback function to handle state changes */
  protected stateChangedHandler: StateChangedHandler<TStateMap>;

  /**
   * Gets the complete configuration for this entity including MQTT topics
   *
   * @returns The resolved component configuration with all required MQTT topics
   */
  protected getConfig(): ResolvedComponentConfiguration {
    return {
      ...this.component,
      json_attributes_topic: this.attributesTopic,
      availability: this.component.availability
        ? { ...this.component.availability, topic: this.availabilityTopic }
        : { topic: this.availabilityTopic },
      ...Object.fromEntries(Array.from(this.stateTopics.values()).map((cfg) => [cfg.name, cfg.topic]))
    };
  }

  /**
   * Creates a new discoverable entity
   *
   * @param settings - The component settings including MQTT configuration
   * @param stateTopicNames - Array of state topic names
   * @param onStateChange - Callback to be called when state changes
   * @param onConnect - Optional callback to be called when MQTT connection is established
   */
  constructor(
    settings: ComponentSettings<TComponentConfiguration>,
    stateTopicNames: Extract<keyof TStateMap, string>[],
    onStateChange: StateChangedHandler<TStateMap>,
    onConnect?: () => void
  ) {
    if (stateTopicNames.length === 0) {
      throw new Error('No state topics provided');
    }

    this.settings = settings;
    this.component = settings.component;
    this.logger = settings.logger ?? new VoidLogger();

    this.stateChangedHandler = onStateChange;

    // Build topic strings
    const identifier = this.component.unique_id ?? this.component.object_id ?? this.component.name;

    if (!identifier) {
      throw new Error('Entity must have a unique_id, object_id, or name');
    }

    this.identifier = identifier;

    this.baseTopicName = `${this.component.component}${this.component.device?.name ? `/${cleanString(this.component.device.name)}` : ''}/${cleanString(identifier)}`;

    const discoveryPrefix = settings.mqtt.discovery_prefix || 'homeassistant';
    const statePrefix = settings.mqtt.state_prefix || 'mqtt2ha';

    this.configTopic = `${discoveryPrefix}/${this.baseTopicName}/config`;
    this.attributesTopic = `${statePrefix}/${this.baseTopicName}/attributes`;
    this.availabilityTopic = `${statePrefix}/${this.baseTopicName}/availability`;

    this.stateTopics = stateTopicNames.map((topicName) => ({
      name: topicName,
      topic: `${statePrefix}/${this.baseTopicName}/${topicName.endsWith('_topic') ? topicName.slice(0, -6) : topicName}`
    }));

    this.logger.debug(`Creating MQTT client for ${identifier}...`);
    const client = connect({
      host: settings.mqtt.host,
      port: settings.mqtt.port,
      username: settings.mqtt.username,
      password: settings.mqtt.password,
      clientId: `${settings.mqtt.client_name}-${identifier}`,
      protocol: settings.mqtt.use_tls ? 'mqtts' : 'mqtt',
      will: !this.settings.manual_availability
        ? {
            topic: this.availabilityTopic,
            payload: this.component.availability?.payload_not_available ?? 'offline',
            retain: true
          }
        : undefined
    });

    client.on('error', (error) => {
      this.logger.error(`MQTT client error for ${identifier}`, error);
    });

    this.mqttClient = client;

    if (onConnect) {
      this.mqttClient.on('connect', onConnect);
    }
  }

  /**
   * Writes the entity's configuration to MQTT for Home Assistant discovery Also sets the entity's initial availability
   * state if not manually managed
   */
  async writeConfig() {
    this.logger.debug(`Writing configuration for ${this.identifier}...`);
    await this.mqttClient.publishAsync(this.configTopic, JSON.stringify(this.getConfig()), { retain: true });
    this.wroteConfiguration = true;

    if (!this.settings.manual_availability) {
      await this.setAvailability(true);
    }
  }

  /**
   * Sets additional attributes for the entity
   *
   * @param attributes - Key-value pairs of attributes to set
   */
  async setAttributes(attributes: Record<string, unknown>) {
    this.logger.debug(`Setting attributes for ${this.identifier}...`);
    await this.mqttClient.publishAsync(this.attributesTopic, JSON.stringify(attributes), { retain: true });
  }

  /**
   * Sets the availability state of the entity
   *
   * @param availability - True if the entity is available, false otherwise
   */
  async setAvailability(availability: boolean) {
    this.logger.debug(`Setting availability for ${this.identifier}...`);
    await this.mqttClient.publishAsync(
      this.availabilityTopic,
      availability
        ? (this.component.availability?.payload_available ?? 'online')
        : (this.component.availability?.payload_not_available ?? 'offline'),
      { retain: true }
    );
  }

  /**
   * Sets the state of the entity
   *
   * @param topicName - The name of the MQTT topic to publish the state to
   * @param state - The new state to set
   */
  setStateSync<K extends Extract<keyof TStateMap, string>>(topicName: K, state: TStateMap[K]) {
    const topicConfiguration = this.stateTopics.find((cfg) => cfg.name === topicName);

    if (!topicConfiguration) {
      this.logger.debug(
        `Topic '${topicName}' is not part of the 'stateTopicNames' provided to this class constructor.`
      );
      return;
    }

    this.logger.debug(`Setting ${topicConfiguration.name} state for ${this.identifier}...`);
    this.mqttClient.publish(topicConfiguration.topic, typeof state === 'string' ? state : JSON.stringify(state), {
      retain: true
    });

    this.stateChangedHandler(topicName, state);
  }

  /**
   * Sets the state of the entity
   *
   * @param topicName - The name of the MQTT topic to publish the state to
   * @param state - The new state to set
   */
  async setState<K extends Extract<keyof TStateMap, string>>(topicName: K, state: TStateMap[K]) {
    const topicConfiguration = this.stateTopics.find((cfg) => cfg.name === topicName);

    if (!topicConfiguration) {
      this.logger.debug(
        `Topic '${topicName}' is not part of the 'stateTopicNames' provided to this class constructor.`
      );
      return;
    }

    this.logger.debug(`Setting ${topicConfiguration.name} state for ${this.identifier}...`);
    await this.mqttClient.publishAsync(
      topicConfiguration.topic,
      typeof state === 'string' ? state : JSON.stringify(state),
      { retain: true }
    );

    this.stateChangedHandler(topicName, state);
  }
}
