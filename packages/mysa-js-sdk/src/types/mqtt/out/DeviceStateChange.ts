import { MsgPayload } from '../MsgBasePayload';
import { OutMessageType } from './OutMessageType';

/**
 * Interface representing a device state change notification from a Mysa device.
 *
 * This message is sent when a device's operational state has been modified, either through user interaction, scheduled
 * changes, or external commands. It provides confirmation of the change and the resulting device state.
 */
export interface DeviceStateChange extends MsgPayload<OutMessageType.DEVICE_STATE_CHANGE> {
  /** Source information identifying the device that changed state */
  src: {
    /** Reference identifier for the device */
    ref: string;
    /** Type identifier for the source device */
    type: number;
  };
  /** State change data payload containing the new device state and change metadata */
  body: {
    /** Current device state parameters after the change */
    state: {
      /** Brightness level (0-100) */
      br: number;
      /** Unknown */
      ho: number;
      /** Unknown */
      lk: number;
      /** Device mode (1 = OFF, 2 = AUTO, 3 = HEAT, 4 = COOL, 5 = FAN_ONLY, 6 = DRY) */
      md: number;
      /** Temperature setpoint */
      sp: number;
      /** Optional fan speed (1 = auto, 3 = low, 5 = medium, 7 = high, 8 = max). AC only */
      fn?: number;
    };
    /** Success indicator for the state change operation (1 = success, 0 = failure) */
    success: number;
    /** Trigger source identifier indicating what initiated the state change */
    trig_src: number;
    /** State change type identifier */
    type: number;
  };
}
