import { MysaDeviceMode, MysaFanSpeedMode } from '@/api/MysaDeviceMode';

/**
 * Interface representing a device state change event for a Mysa device.
 *
 * This event is emitted when a device's operational parameters are modified, such as changing the operating mode or
 * temperature setpoint. State changes can be initiated through user interaction, scheduling, or programmatic control
 * through the API.
 */
export interface StateChange {
  /** Unique identifier of the device whose state was changed */
  deviceId: string;
  /** The device's operating mode (e.g., 'heat', 'off'), if available */
  mode?: MysaDeviceMode;
  /** Current temperature setpoint after the state change */
  setPoint: number;
  /** Optional fan speed (1 = auto, 3 = low, 5 = medium, 7 = high, 8 = max). AC only */
  fanSpeed?: MysaFanSpeedMode;
}
