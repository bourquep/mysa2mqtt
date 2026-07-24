import type { MqttSettings } from '../src/api/settings';
import { createdClients, FakeMqttClient } from './setup';

/** MQTT connection settings used by every test. */
export const mqttSettings: MqttSettings = {
  host: 'localhost',
  port: 1883,
  client_name: 'test'
};

/** The most recently created fake client (each component constructs exactly one). */
export function lastClient(): FakeMqttClient {
  const client = createdClients.at(-1);
  if (!client) {
    throw new Error('No MQTT client has been created yet.');
  }
  return client;
}

/**
 * Builds the state/command topic a component publishes to or subscribes on. Assumes an identifier with no characters
 * that `cleanString` would escape and no device (the base path is then just `<component>/<identifier>`).
 *
 * @param component - The component type (e.g. `switch`).
 * @param identifier - The entity's `unique_id`.
 * @param suffix - The topic suffix (e.g. `state`, `command`, `position`).
 */
export function stateTopic(component: string, identifier: string, suffix: string): string {
  return `mqtt2ha/${component}/${identifier}/${suffix}`;
}

/**
 * Builds the discovery config topic for a component.
 *
 * @param component - The component type.
 * @param identifier - The entity's `unique_id`.
 */
export function configTopic(component: string, identifier: string): string {
  return `homeassistant/${component}/${identifier}/config`;
}

/** Parses the JSON discovery payload published to the config topic. */
export function discoveryConfig(
  client: FakeMqttClient,
  component: string,
  identifier: string
): Record<string, unknown> {
  const payload = client.lastPayload(configTopic(component, identifier));
  if (payload === undefined) {
    throw new Error('No discovery configuration was published.');
  }
  const parsed: unknown = JSON.parse(payload);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`Discovery configuration is not a JSON object: ${payload}`);
  }
  return parsed as Record<string, unknown>;
}
