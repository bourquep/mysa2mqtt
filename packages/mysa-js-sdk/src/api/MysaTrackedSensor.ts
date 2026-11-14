import { TrackedSensorReceiveMap } from '@/lib/DeviceCapabilities';
import { DeviceBase } from '@/types/rest';

/**
 * Union type representing the temperature sensor an in-floor heating thermostat regulates against.
 *
 * In-floor units (`INF-V1-0`) carry both an ambient air sensor in the wall unit and a probe embedded in the floor. The
 * Mysa app lets the owner pick which one drives the setpoint, and the device echoes that choice back in its status
 * messages as the raw `trackedSnsr` field.
 */
export type MysaTrackedSensor = 'ambient' | 'floor';

/**
 * Reads the sensor an in-floor heating thermostat is configured to regulate against from its device record.
 *
 * The device record returned by {@link MysaApiClient.getDevices} stores the selection as `Tracking`, with the same
 * encoding as the `trackedSnsr` field of real-time status messages. Unlike those messages, it is available without a
 * real-time connection, which makes it the only source of the selection on accounts where the real-time stream never
 * delivers anything. It is a snapshot: a later change made in the Mysa app shows up only in a fresh device record or a
 * real-time status message.
 *
 * @example
 *
 * ```typescript
 * const devices = await client.getDevices();
 * const trackedSensor = getDeviceTrackedSensor(devices.DevicesObj['device123']);
 * ```
 *
 * @param device - The device record to read.
 * @returns The configured sensor, or undefined when the record carries no recognized selection — as for every device
 *   that is not an in-floor thermostat.
 */
export function getDeviceTrackedSensor(device: DeviceBase): MysaTrackedSensor | undefined {
  return device.Tracking !== undefined ? TrackedSensorReceiveMap[device.Tracking] : undefined;
}
