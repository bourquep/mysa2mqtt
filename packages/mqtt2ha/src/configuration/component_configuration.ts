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

import { AvailabilityConfiguration } from './availability_configuration';
import { DeviceConfiguration } from './device_configuration';

/**
 * Common configuration interface for Home Assistant MQTT components Contains the base configuration properties shared
 * by all MQTT components Used for automatic MQTT discovery in Home Assistant
 */
export interface BaseComponentConfiguration {
  /** The type of component. */
  component: string;

  /**
   * An ID that uniquely identifies this entity. If two entities have the same unique ID, Home Assistant will raise an
   * exception. Required when used with device-based discovery.
   */
  unique_id?: string;

  /** Used instead of name for automatic generation of entity_id. */
  object_id?: string;

  /**
   * The name of the entity. This will be used for the entity name in the Home Assistant UI. Can be set to null if only
   * the device name is relevant.
   */
  name?: string;

  /**
   * Information about the device this component is a part of to tie it into the device registry. Only works when
   * unique_id is set. At least one of identifiers or connections must be present to identify the device.
   */
  device?: DeviceConfiguration;

  /**
   * Sets the class of the device, changing the device state and icon that is displayed on the frontend. The
   * device_class can be null. Different components have different valid device classes.
   */
  device_class?: string;

  /**
   * The category of the entity
   *
   * - "config": For configuration related entities.
   * - "diagnostic": For read-only diagnostic entities.
   * - "system": For system related entities.
   */
  entity_category?: 'config' | 'diagnostic' | 'system';

  /** Icon to use for the entity in the frontend. Should be a Material Design Icon (format: mdi:icon-name). */
  icon?: string;

  /** Flag which defines if the entity should be enabled when first added. Default is true. */
  enabled_by_default?: boolean;

  /**
   * If set, it defines the number of seconds after the sensor’s state expires, if it’s not updated. After expiry, the
   * sensor’s state becomes unavailable. Default the sensors state never expires.
   */
  expire_after?: number;

  /**
   * Sends update events (which results in update of state object’s last_changed) even if the sensor’s state hasn’t
   * changed. Useful if you want to have meaningful value graphs in history or want to create an automation that
   * triggers on every incoming state message (not only when the sensor’s new state is different to the current one).
   */
  force_update?: boolean;

  /** Configures the availability settings of the entity. */
  availability?: AvailabilityConfiguration;

  /** Template to extract the JSON dictionary from the json_attributes_topic. */
  json_attributes_template?: string;

  /** Defines a template to extract the value from the payload. Useful when the payload isn't a simple value. */
  value_template?: string;

  /** The maximum QoS level to be used when receiving and publishing messages. Default is 0. */
  qos?: number;

  /**
   * Additional properties to serialize as part of the configuration payload. Typically used for command and state
   * topics.
   */
  [key: string]: unknown;
}

/** Valid types of components that can be created. Each type corresponds to a specific entity type in Home Assistant */
export type ComponentType = 'binary_sensor' | 'button' | 'sensor' | 'switch';

/**
 * Type-safe configuration interface for specific component types. Extends the base configuration with type-specific
 * component field.
 *
 * @typeParam T - The specific type of component being configured
 */
export interface ComponentConfiguration<T extends ComponentType> extends BaseComponentConfiguration {
  /** The type of component, constrained to valid component types */
  component: T;
}

/**
 * Internal configuration interface that includes resolved MQTT topics. Created by combining the base configuration with
 * automatically generated topic paths. Used when publishing the component configuration to Home Assistant.
 */
export interface ResolvedComponentConfiguration extends BaseComponentConfiguration {
  /** The MQTT topic where the component's attributes will be published */
  json_attributes_topic: string;
  /** Configuration for availability reporting, including the resolved availability topic */
  availability: AvailabilityConfiguration & { topic: string };
}
