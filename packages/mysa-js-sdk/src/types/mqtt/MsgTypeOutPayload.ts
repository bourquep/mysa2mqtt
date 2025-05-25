import { DeviceLog } from './out/DeviceLog';
import { DevicePostBoot } from './out/DevicePostBoot';
import { DeviceSetpointChange } from './out/DeviceSetpointChange';
import { DeviceV1Status } from './out/DeviceV1Status';

/**
 * Union type representing all possible outgoing MsgType-based MQTT payloads.
 *
 * This type encompasses payloads where the message type is specified in the `MsgType` field rather than the `msg`
 * field. These include legacy device status reports, configuration change notifications, diagnostic logs, and system
 * events that use the older message format.
 */
export type MsgTypeOutPayload = DeviceV1Status | DeviceSetpointChange | DeviceLog | DevicePostBoot;
