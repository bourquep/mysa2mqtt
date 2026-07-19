import { CheckDeviceSettings } from './in/CheckDeviceSettings';
import { StartPublishingDeviceStatus } from './in/StartPublishingDeviceStatus';

/**
 * Union type representing all possible incoming MsgType-based MQTT payloads.
 *
 * This type encompasses payloads where the message type is specified in the `MsgType` field rather than the `msg`
 * field. These are typically configuration and control commands that use the legacy message format structure.
 */
export type MsgTypeInPayload = CheckDeviceSettings | StartPublishingDeviceStatus;
