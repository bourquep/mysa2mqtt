import { ChangeDeviceState } from './in/ChangeDeviceState';

/**
 * Union type representing all possible incoming message-based MQTT payloads.
 *
 * This type encompasses payloads where the message type is specified in the `msg` field rather than the `MsgType`
 * field. Currently includes device state change commands.
 */
export type MsgInPayload = ChangeDeviceState;
