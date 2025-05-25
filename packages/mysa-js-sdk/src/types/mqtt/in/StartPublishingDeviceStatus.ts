import { MsgTypePayload } from '../MsgTypeBasePayload';
import { InMessageType } from './InMessageType';

/**
 * Interface representing a command to start publishing periodic device status updates.
 *
 * This message instructs a device to begin sending regular status reports at predefined intervals. The timeout
 * parameter controls how long the device should continue publishing status updates before stopping automatically.
 */
export interface StartPublishingDeviceStatus extends MsgTypePayload<InMessageType.START_PUBLISHING_DEVICE_STATUS> {
  /** Timeout duration in seconds for how long to continue publishing status updates */
  Timeout: number;
}
