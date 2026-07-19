import { MsgTypePayload } from '../MsgTypeBasePayload';
import { InMessageType } from './InMessageType';

/**
 * Interface representing a request to check and retrieve device settings.
 *
 * This message is sent to query a device for its current configuration and settings. The response typically includes
 * device parameters, modes, and other configuration data needed for proper device management.
 */
export interface CheckDeviceSettings extends MsgTypePayload<InMessageType.CHECK_DEVICE_SETTINGS> {
  /** Event type identifier specifying what kind of settings check to perform */
  EventType: number;
}
