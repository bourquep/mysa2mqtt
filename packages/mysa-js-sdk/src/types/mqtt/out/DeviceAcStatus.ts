import { MsgPayload } from '../MsgBasePayload';
import { OutMessageType } from './OutMessageType';

/**
 * Interface representing a status report from a Mysa AC device.
 *
 * AC-V1-0 devices send this message (type 30) with environmental readings and AC-specific operational parameters. This
 * is the AC equivalent of {@link DeviceV2Status} (type 40) used by baseboard devices.
 */
export interface DeviceAcStatus extends MsgPayload<OutMessageType.DEVICE_AC_STATUS> {
  /** Source information identifying the device sending the status */
  src: {
    /** Reference identifier for the device */
    ref: string;
    /** Type identifier for the source device */
    type: number;
  };
  /** Status data payload containing current device measurements and settings */
  body: {
    /** Ambient temperature reading from the device sensor (°C) */
    ambTemp: number;
    /** Relative humidity percentage */
    hum: number;
    /** Current temperature setpoint (°C) */
    stpt: number;
    /** Not present on AC devices (included for compatibility with DEVICE_V2_STATUS handler) */
    dtyCycle?: number;
    /** Operating mode (1=off, 2=auto, 3=heat, 4=cool, 5=fan_only, 6=dry) */
    mode?: number;
  };
}
