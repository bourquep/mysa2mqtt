import { MsgTypePayload } from '../MsgTypeBasePayload';
import { OutMessageType } from './OutMessageType';

/**
 * Interface representing a device log entry from a Mysa device.
 *
 * This message contains diagnostic information, error reports, or general logging data from the device. Log entries
 * include a severity level and a descriptive message for debugging and monitoring purposes.
 */
export interface DeviceLog extends MsgTypePayload<OutMessageType.DEVICE_LOG> {
  /** Log severity level (e.g., "INFO", "WARN", "ERROR", "DEBUG") */
  Level: string;
  /** Descriptive log message containing the actual log content */
  Message: string;
}
