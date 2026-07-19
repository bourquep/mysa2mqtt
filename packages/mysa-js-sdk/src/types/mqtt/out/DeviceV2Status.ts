import { MsgPayload } from '../MsgBasePayload';
import { OutMessageType } from './OutMessageType';

/**
 * Interface representing a version 2 device status report from a Mysa device.
 *
 * This enhanced status message provides comprehensive information about the device's current operational state,
 * including environmental readings and system parameters. Version 2 status reports include additional data compared to
 * version 1 reports.
 */
export interface DeviceV2Status extends MsgPayload<OutMessageType.DEVICE_V2_STATUS> {
  /** Source information identifying the device sending the status */
  src: {
    /** Reference identifier for the device */
    ref: string;
    /** Type identifier for the source device */
    type: number;
  };
  /** Status data payload containing current device measurements and settings */
  body: {
    /** Ambient temperature reading from the device sensor */
    ambTemp: number;
    /** Current duty cycle percentage of the heating element */
    dtyCycle: number;
    /** Relative humidity percentage reading from the device sensor */
    hum: number;
    /** Current temperature setpoint setting */
    stpt: number;
  };
}
