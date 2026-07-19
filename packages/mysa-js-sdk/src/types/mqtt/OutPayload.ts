import { MsgOutPayload } from './MsgOutPayload';
import { MsgTypeOutPayload } from './MsgTypeOutPayload';

/**
 * Union type representing all possible outgoing MQTT payload types.
 *
 * This type encompasses both message type-based payloads and message-based payloads that can be sent from Mysa devices
 * via MQTT.
 */
export type OutPayload = MsgTypeOutPayload | MsgOutPayload;
