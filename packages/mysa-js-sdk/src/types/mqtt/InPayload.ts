import { MsgInPayload } from './MsgInPayload';
import { MsgTypeInPayload } from './MsgTypeInPayload';

/**
 * Union type representing all possible incoming MQTT payload types.
 *
 * This type encompasses both message type-based payloads and message-based payloads that can be received from Mysa
 * devices via MQTT.
 */
export type InPayload = MsgTypeInPayload | MsgInPayload;
