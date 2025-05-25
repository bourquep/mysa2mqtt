import { MsgPayload } from '../MsgBasePayload';
import { InMessageType } from './InMessageType';

/**
 * Interface representing a command to change the state of a Mysa device.
 *
 * This message type allows clients to modify device settings such as temperature setpoint and operating mode. The
 * command is structured with source and destination routing information along with the specific state changes to
 * apply.
 */
export interface ChangeDeviceState extends MsgPayload<InMessageType.CHANGE_DEVICE_STATE> {
  /** Source routing information for the command */
  src: {
    /** Reference identifier for the command source. Should correspond to the user id. */
    ref: string;
    /** Type identifier for the source. Should be 100. */
    type: number;
  };
  /** Destination routing information for the command */
  dest: {
    /** Reference identifier for the command destination (device) */
    ref: string;
    /** Type identifier for the destination. Should be 1. */
    type: number;
  };
  /** Unknown, should always be 2. */
  resp: number;
  /** Command payload containing the state changes to apply */
  body: {
    /** Array of command objects to execute */
    cmd: [
      {
        /** Optional temperature setpoint in the device's configured units */
        sp?: number;
        /** Optional device mode (e.g., heat, off) */
        md?: number;
        /** Unknown, should always be -1 */
        tm: number;
      }
    ];
    /**
     * Command type identifier. Must be 1 for BB-V1-X, 4 for BB-V2-X, and 5 for BB-V2-X-L. Devices don't seem to respond
     * to this command if it has the wrong type value for the device.
     */
    type: number;
    /** Command format version. Should be 1. */
    ver: number;
  };
}
