import { MysaTrackedSensor } from '@/api/MysaTrackedSensor';

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
  /** Optional heating element duty cycle, as a fraction between 0.0 and 1.0 */
  dutyCycle?: number;
  /** Optional floor-probe temperature reading, reported only by in-floor heating thermostats (INF-V1-0) */
  floorTemperature?: number;
  /**
   * Which sensor the device regulates against, as selected by the owner in the Mysa app. Reported only by in-floor
   * heating thermostats (INF-V1-0), which have both an ambient sensor and a floor probe; undefined for every other
   * device family, and for an in-floor unit reporting a selection this SDK does not recognize.
   */
  trackedSensor?: MysaTrackedSensor;
}
