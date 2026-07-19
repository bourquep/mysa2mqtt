import { MsgTypePayload } from '../MsgTypeBasePayload';
import { OutMessageType } from './OutMessageType';

/**
 * Interface representing a device post-boot notification from a Mysa device.
 *
 * This message is sent when a device has completed its boot sequence and is ready for normal operation. It serves as a
 * signal that the device has successfully initialized and is available for commands and status requests.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DevicePostBoot extends MsgTypePayload<OutMessageType.DEVICE_POST_BOOT> {}
