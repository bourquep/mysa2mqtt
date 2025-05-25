/**
 * Base interface for all MQTT message payloads.
 *
 * This interface defines the common structure that all MQTT messages must contain, providing essential metadata for
 * message handling.
 */
export interface MsgBasePayload {
  /** The message type identifier */
  msg: number;
  /** Unix timestamp when the message was created */
  time: number;
  /** Version string of the message format */
  ver: string;
  /** Unique identifier for the device or message source */
  id: number;
}

/**
 * Generic typed message payload interface.
 *
 * Extends the base payload with a strongly-typed message identifier, ensuring type safety for specific message types.
 *
 * @typeParam T - The specific message type number
 */
export interface MsgPayload<T extends number> extends MsgBasePayload {
  /** The strongly-typed message type identifier */
  msg: T;
}
