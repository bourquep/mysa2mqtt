/** Represents a timestamped value with metadata */
export interface TimestampedValue<T = number> {
  /** Timestamp when the value was recorded */
  t: number;
  /** The actual value */
  v: T;
}

/** Represents the state of a single device */
export interface DeviceState {
  /** Device identifier */
  Device: string;
  /** Overall timestamp for the device state */
  Timestamp: number;
  /** Time the device has been on */
  OnTime?: TimestampedValue<number>;
  /** Temperature set point */
  SetPoint?: TimestampedValue<number>;
  /** Display brightness level */
  Brightness?: TimestampedValue<number>;
  /** Schedule mode setting */
  ScheduleMode?: TimestampedValue<number>;
  /** Hold time setting */
  HoldTime?: TimestampedValue<number>;
  /** Wi-Fi signal strength */
  Rssi?: TimestampedValue<number>;
  /** Thermostat mode */
  TstatMode?: TimestampedValue<number>;
  /** Available heap memory */
  FreeHeap?: TimestampedValue<number>;
  /** Sensor temperature reading */
  SensorTemp?: TimestampedValue<number>;
  /** Current mode */
  Mode?: TimestampedValue<number>;
  /** Voltage measurement */
  Voltage?: TimestampedValue<number>;
  /** Temperature corrected for calibration */
  CorrectedTemp?: TimestampedValue<number>;
  /** Duty cycle percentage */
  Duty?: TimestampedValue<number>;
  /** Heat sink temperature */
  HeatSink?: TimestampedValue<number>;
  /** Time the device has been off */
  OffTime?: TimestampedValue<number>;
  /** Connection status */
  Connected?: TimestampedValue<boolean>;
  /** Current consumption */
  Current?: TimestampedValue<number>;
  /** Humidity reading */
  Humidity?: TimestampedValue<number>;
  /** Lock status */
  Lock?: TimestampedValue<number>;
  /** Fan speed */
  FanSpeed?: TimestampedValue<number>;
}

/**
 * Collection of device states indexed by device ID
 *
 * Maps device ID strings to their corresponding device state objects, providing a lookup table for all devices
 * associated with a user account.
 */
export interface DeviceStatesObj {
  /** Device state objects indexed by their unique device ID strings */
  [deviceId: string]: DeviceState;
}

/** Top-level interface for the device states REST API response. */
export interface DeviceStates {
  DeviceStatesObj: DeviceStatesObj;
}
