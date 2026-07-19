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

import { BaseComponentConfiguration } from '../configuration/component_configuration';
import { Logger } from '../lib/logger';

/** Configuration settings for MQTT connection and behavior */
export interface MqttSettings {
  /** The hostname or IP address of the MQTT broker */
  host: string;
  /** The port number of the MQTT broker (default: 1883) */
  port?: number;
  /** Username for MQTT authentication */
  username?: string;
  /** Password for MQTT authentication */
  password?: string;
  /** Unique identifier for this MQTT client */
  client_name?: string;
  /** Whether to use TLS/SSL for the connection (default: false) */
  use_tls?: boolean;
  /** Path to the TLS private key file */
  tls_key?: string;
  /** Path to the TLS certificate file */
  tls_certfile?: string;
  /** Path to the TLS CA certificate file */
  tls_ca_cert?: string;
  /** The Home Assistant MQTT discovery prefix (default: "homeassistant") */
  discovery_prefix?: string;
  /** The prefix for state topics (default: "mqtt2ha") */
  state_prefix?: string;
}

/**
 * Settings for a Home Assistant MQTT component
 *
 * @typeParam T - The specific component configuration type extending BaseComponentConfiguration
 */
export interface ComponentSettings<T extends BaseComponentConfiguration> {
  /** MQTT connection and behavior settings */
  mqtt: MqttSettings;
  /** Whether to manually manage component availability instead of using LWT (default: false) */
  manual_availability?: boolean;
  /** Component-specific configuration */
  component: T;
  /** Optional logger for debugging and error reporting */
  logger?: Logger;
}
