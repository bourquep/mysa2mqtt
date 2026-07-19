/**
 * Base interface for MQTT message payloads that use the MsgType field.
 *
 * This interface defines the common structure for MQTT messages where the message type is specified in the `MsgType`
 * field rather than the `msg` field. These are typically older message formats or specific device communications.
 */
export interface MsgTypeBasePayload {
  /** The message type identifier */
  MsgType: number;
  /** Unix timestamp when the message was created */
  Timestamp: number;
  /** Device identifier string */
  Device: string;
}

/**
 * Generic typed message payload interface for MsgType-based messages.
 *
 * Extends the base MsgType payload with a strongly-typed message identifier, ensuring type safety for specific message
 * types that use the MsgType field.
 *
 * @typeParam T - The specific message type number
 */
export interface MsgTypePayload<T extends number> extends MsgTypeBasePayload {
  /** The strongly-typed message type identifier */
  MsgType: T;
}
