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
      /** Device mode (1 = OFF, 3 = HEAT) */
      md: number;
      /** Temperature setpoint */
      sp: number;
    };
    /** Success indicator for the state change operation (1 = success, 0 = failure) */
    success: number;
    /** Trigger source identifier indicating what initiated the state change */
    trig_src: number;
    /** State change type identifier */
    type: number;
  };
}
