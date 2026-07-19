/**
 * Interface representing the current status of a Mysa device.
 *
 * Contains real-time operational data and measurements from the device, including environmental readings and electrical
 * parameters. This data is typically received through status update events from the device.
 */
export interface Status {
  /** Unique identifier of the device reporting this status */
  deviceId: string;
  /** Current ambient temperature reading from the device sensor */
  temperature: number;
  /** Current relative humidity percentage reading from the device sensor */
  humidity: number;
  /** Current temperature setpoint setting */
  setPoint: number;
  /** Optional electrical current draw measurement in amperes */
  current?: number;
  /** Optional heating element duty cycle as a percentage (0-100) */
  dutyCycle?: number;
}
