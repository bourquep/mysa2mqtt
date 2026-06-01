/*
mysa2mqtt
Copyright (C) 2025 Pascal Bourque

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Pure helpers for the Emporia Vue cloud API.
 *
 * Emporia exposes a community-reverse-engineered cloud API at `https://api.emporiaenergy.com` (AWS Cognito auth via the
 * `authtoken` header). The two calls this adapter uses are:
 *
 * - `GET /customers/devices` → the device tree, each device having `deviceGid`, `locationProperties.deviceName`, and a
 *   list of `channels` (`{ channelNum, name }`). The whole-panel "mains" channel is reported as channel `"1,2,3"`.
 * - `GET /AppAPI?apiMethod=getDeviceListUsages&deviceGids=<gids>&instant=<iso>&scale=1S&energyUnit=KilowattHours` → a
 *   nested `deviceListUsages` structure with per-channel `usage` (energy in the requested unit over the `scale`).
 *
 * A per-second (`scale=1S`) usage in kWh is an energy-per-second figure; multiplying by 3600 yields **average power in
 * watts** for that second, which is what we publish as the channel's power. Helpers here are defensive: missing or
 * non-numeric fields become `undefined`/empty rather than throwing.
 */

/** A channel (circuit or mains) within an Emporia device. */
export interface EmporiaChannel {
  /** The channel number/identifier (e.g. `"1"`, `"1,2,3"` for mains). */
  channelNum: string;
  /** The human-readable channel/circuit name, if set. */
  name?: string;
}

/** An Emporia device (a Vue monitor) with its channels. */
export interface EmporiaDevice {
  /** The device's global id. */
  deviceGid: number;
  /** The device's display name. */
  name?: string;
  /** The device's channels (circuits + mains). */
  channels: EmporiaChannel[];
}

/** A normalized per-channel power reading. */
export interface EmporiaChannelReading {
  deviceGid: number;
  channelNum: string;
  name?: string;
  /** Average power over the sample interval, in watts. */
  powerWatts: number;
}

/** Number of seconds in an hour, to convert per-second kWh into average watts. */
const SECONDS_PER_HOUR = 3600;

/**
 * Returns the value only if it is a finite number, otherwise `undefined`.
 *
 * @param value - The value to check.
 * @returns The finite number, or `undefined`.
 */
function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Parses the `GET /customers/devices` response into a flat list of {@link EmporiaDevice}s.
 *
 * @param payload - The parsed devices response.
 * @returns The devices and their channels (empty if the payload is unrecognized).
 */
export function parseEmporiaDevices(payload: unknown): EmporiaDevice[] {
  const root = payload as { devices?: unknown[] } | null;
  if (root == null || !Array.isArray(root.devices)) {
    return [];
  }

  const devices: EmporiaDevice[] = [];
  for (const entry of root.devices) {
    const device = entry as {
      deviceGid?: number;
      locationProperties?: { deviceName?: string };
      channels?: { channelNum?: string; name?: string }[];
    };
    const gid = num(device.deviceGid);
    if (gid == null) {
      continue;
    }
    const channels: EmporiaChannel[] = Array.isArray(device.channels)
      ? device.channels
          .filter((c) => typeof c?.channelNum === 'string')
          .map((c) => ({ channelNum: c.channelNum as string, name: c.name }))
      : [];
    devices.push({ deviceGid: gid, name: device.locationProperties?.deviceName, channels });
  }
  return devices;
}

/**
 * Converts a per-second energy reading (kWh) into average power over that second, in watts.
 *
 * @param kwhPerSecond - Energy in kWh accrued over one second.
 * @returns The equivalent average power in watts.
 */
export function perSecondKwhToWatts(kwhPerSecond: number): number {
  return kwhPerSecond * 1000 * SECONDS_PER_HOUR;
}

/**
 * Extracts per-channel power readings from a `getDeviceListUsages` response (requested with `scale=1S`,
 * `energyUnit=KilowattHours`).
 *
 * The response nests usage as `deviceListUsages.devices[].channelUsages[]`, where each channel usage has `channelNum`,
 * `name`, and `usage` (kWh over the 1-second scale). Nested devices (e.g. when a channel hosts a sub-device) are walked
 * recursively.
 *
 * @param payload - The parsed usages response.
 * @returns The flattened per-channel readings (empty if unrecognized).
 */
export function parseEmporiaUsages(payload: unknown): EmporiaChannelReading[] {
  const root = payload as { deviceListUsages?: { devices?: unknown[] } } | null;
  const devices = root?.deviceListUsages?.devices;
  if (!Array.isArray(devices)) {
    return [];
  }

  const readings: EmporiaChannelReading[] = [];

  const walkChannel = (channel: unknown): void => {
    const c = channel as {
      deviceGid?: number;
      channelNum?: string;
      name?: string;
      usage?: number;
      nestedDevices?: unknown[];
    };
    const gid = num(c.deviceGid);
    const usage = num(c.usage);
    if (gid != null && typeof c.channelNum === 'string' && usage != null) {
      readings.push({
        deviceGid: gid,
        channelNum: c.channelNum,
        name: c.name,
        powerWatts: perSecondKwhToWatts(usage)
      });
    }
    if (Array.isArray(c.nestedDevices)) {
      for (const nested of c.nestedDevices) {
        const channelUsages = (nested as { channelUsages?: unknown[] }).channelUsages;
        if (Array.isArray(channelUsages)) {
          channelUsages.forEach(walkChannel);
        }
      }
    }
  };

  for (const device of devices) {
    const channelUsages = (device as { channelUsages?: unknown[] }).channelUsages;
    if (Array.isArray(channelUsages)) {
      channelUsages.forEach(walkChannel);
    }
  }

  return readings;
}
