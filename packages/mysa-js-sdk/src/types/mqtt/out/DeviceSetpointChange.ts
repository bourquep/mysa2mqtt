import { MsgTypePayload } from '../MsgTypeBasePayload';
import { OutMessageType } from './OutMessageType';

/**
 * Interface representing a device setpoint change notification from a Mysa device.
 *
 * This message is sent when a device's temperature setpoint has been modified, providing information about the source
 * of the change and both the previous and new setpoint values for tracking and logging purposes.
 */
export interface DeviceSetpointChange extends MsgTypePayload<OutMessageType.DEVICE_SETPOINT_CHANGE> {
  /** Source identifier indicating what initiated the setpoint change (user, schedule, etc.) */
  Source: number;
  /** Previous temperature setpoint value before the change */
  Prev: number;
  /** New temperature setpoint value after the change */
  Next: number;
}
