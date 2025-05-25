import { InPayload } from '@/types/mqtt/InPayload';
import { OutPayload } from '@/types/mqtt/OutPayload';

/**
 * Parses an MQTT payload from binary data into a typed OutPayload object.
 *
 * Converts the raw ArrayBuffer received from MQTT messages into a structured TypeScript object representing device
 * status, state changes, or other outgoing message types from Mysa devices.
 *
 * @param payload - The raw binary MQTT message payload as ArrayBuffer
 * @returns The parsed payload as a typed OutPayload object
 * @throws Error if the payload cannot be decoded or parsed as valid JSON
 */
export function parseMqttPayload(payload: ArrayBuffer): OutPayload {
  try {
    const decoder = new TextDecoder('utf-8');
    const jsonString = decoder.decode(payload);
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Error parsing MQTT payload:', error);
    throw new Error('Failed to parse MQTT payload');
  }
}

/**
 * Serializes an InPayload object into binary data for MQTT transmission.
 *
 * Converts a typed TypeScript payload object into the binary ArrayBuffer format required for sending commands and
 * requests to Mysa devices via MQTT.
 *
 * @typeParam T - The specific InPayload type being serialized
 * @param payload - The typed payload object to serialize
 * @returns The serialized payload as ArrayBuffer ready for MQTT transmission
 */
export function serializeMqttPayload<T extends InPayload>(payload: T): ArrayBuffer {
  const jsonString = JSON.stringify(payload);
  const encoder = new TextEncoder();
  return encoder.encode(jsonString);
}
