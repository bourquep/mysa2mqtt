import { MsgTypePayload } from '../MsgTypeBasePayload';
import { OutMessageType } from './OutMessageType';

/**
 * Interface representing a version 1 device status report from a Mysa device.
 *
 * This legacy status message format provides basic operational information about the device's current state, including
 * temperature readings, electrical parameters, and configuration settings. Version 1 status reports use the MsgType
 * field format.
 */
export interface DeviceV1Status extends MsgTypePayload<OutMessageType.DEVICE_V1_STATUS> {
  /** Main temperature sensor reading */
  MainTemp: number;
  /** Thermistor temperature sensor reading */
  ThermistorTemp: number;
  /** Combined/calculated temperature reading */
  ComboTemp: number;
  /** Relative humidity percentage reading */
  Humidity: number;
  /** Current electrical current draw in amperes */
  Current: number;
  /** Current temperature setpoint setting */
  SetPoint: number;
  /** Data stream identifier or status */
  Stream: number;
}
