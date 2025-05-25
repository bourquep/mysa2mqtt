import { DeviceStateChange } from './out/DeviceStateChange';
import { DeviceV2Status } from './out/DeviceV2Status';

/**
 * Union type representing all possible outgoing message-based MQTT payloads.
 *
 * This type encompasses payloads where the message type is specified in the `msg` field rather than the `MsgType`
 * field. Includes device status reports and state change notifications.
 */
export type MsgOutPayload = DeviceV2Status | DeviceStateChange;
