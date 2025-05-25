/**
 * Interface representing a temperature setpoint change event for a Mysa device.
 *
 * This event is emitted when a device's target temperature setting is modified, providing both the previous and new
 * setpoint values for tracking and logging purposes. The change may be initiated by user interaction, scheduling, or
 * programmatic control through the API.
 */
export interface SetPointChange {
  /** Unique identifier of the device whose setpoint was changed */
  deviceId: string;
  /** The new temperature setpoint value after the change */
  newSetPoint: number;
  /** The previous temperature setpoint value before the change */
  previousSetPoint: number;
}
