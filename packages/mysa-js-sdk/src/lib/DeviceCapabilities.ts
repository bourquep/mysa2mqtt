/*
mysa-js-sdk
Copyright (C) 2025-2026 Pascal Bourque

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

import { MysaDeviceMode, MysaFanSpeedMode } from '@/api/MysaDeviceMode';
import { DeviceBase, SupportedCaps } from '@/types/rest';

/**
 * Interpretation of a device's reported `SupportedCaps`.
 *
 * Internal to the SDK: these helpers are not re-exported from the package barrel.
 */

/** Canonical fan-speed order, matching the positional layout of a device's `SupportedCaps.fanSpeeds`. */
export const CanonicalFanSpeedOrder: MysaFanSpeedMode[] = ['auto', 'low', 'medium', 'high', 'max'];

/** Universal fan-speed `fn` mapping used when a device does not report its own `SupportedCaps.fanSpeeds`. */
export const LegacyFanSpeedSendMap: Record<MysaFanSpeedMode, number> = {
  auto: 1,
  low: 3,
  medium: 5,
  high: 7,
  max: 8
};

/**
 * AC-V1-X (`CodeNum` 1117) canonical fan-speed `fn` mapping. These devices use `1/2/4/6` for auto/low/medium/high but
 * frequently omit an explicit `SupportedCaps.fanSpeeds` list, so the legacy `1/3/5/7` map would send `fn` values they
 * ignore. Used as the no-`fanSpeeds` fallback for CodeNum=1117 devices.
 */
export const CanonicalFanSpeedSendMap: Partial<Record<MysaFanSpeedMode, number>> = {
  auto: 1,
  low: 2,
  medium: 4,
  high: 6
};

/** `CodeNum` for AC-V1-X thermostats that use the canonical `1/2/4/6` fan-speed `fn` values. */
export const CANONICAL_FAN_SPEED_CODE_NUM = 1117;

/**
 * Receive-side `fn`-to-fan-speed mapping. Includes both the legacy universal values (3/5/7) and the AC-V1-X
 * CodeNum=1117 canonical values (2/4/6); the latter are unused by legacy devices, so there is no conflict.
 */
export const FanSpeedReceiveMap: Record<number, MysaFanSpeedMode> = {
  1: 'auto',
  2: 'low', // CodeNum=1117 canonical low
  3: 'low', // legacy
  4: 'medium', // CodeNum=1117 canonical medium
  5: 'medium', // legacy
  6: 'high', // CodeNum=1117 canonical high
  7: 'high', // legacy
  8: 'max'
};

/** Raw `md` values for each mode. Doubles as the key into `SupportedCaps.modes`, which is indexed by the same value. */
export const ModeSendMap: Record<MysaDeviceMode, number> = { off: 1, auto: 2, heat: 3, cool: 4, fan_only: 5, dry: 6 };

/**
 * Maps a set of raw `fn` values onto fan speeds by value, via {@link FanSpeedReceiveMap}.
 *
 * Unlike the positional reading of a top-level `SupportedCaps.fanSpeeds` list, this is order-independent, which is what
 * a per-mode list requires: a mode that omits a speed (e.g. fan-only offering `[3, 5, 7]` — low/medium/high, with no
 * `auto`) would have every speed shifted by one if it were zipped against {@link CanonicalFanSpeedOrder}.
 *
 * @param rawSpeeds - The raw `fn` values the device accepts.
 * @returns A partial map from fan speed to `fn` value, empty when no value is recognized.
 */
export function mapFanSpeedsByValue(rawSpeeds: number[]): Partial<Record<MysaFanSpeedMode, number>> {
  const map: Partial<Record<MysaFanSpeedMode, number>> = {};

  for (const rawSpeed of rawSpeeds) {
    const fanSpeed = FanSpeedReceiveMap[rawSpeed];
    // First value wins, so a list carrying both the legacy and the canonical encoding of one speed is deterministic.
    if (fanSpeed !== undefined && map[fanSpeed] === undefined) {
      map[fanSpeed] = rawSpeed;
    }
  }

  return map;
}

/**
 * Collects the union of every mode's `fanSpeeds` list.
 *
 * @param supportedCaps - The device's supported capabilities, if reported.
 * @returns The raw `fn` values accepted by at least one mode.
 */
export function collectModeFanSpeeds(supportedCaps: SupportedCaps | undefined): number[] {
  const rawSpeeds = new Set<number>();

  for (const modeCaps of Object.values(supportedCaps?.modes ?? {})) {
    for (const rawSpeed of modeCaps.fanSpeeds ?? []) {
      rawSpeeds.add(rawSpeed);
    }
  }

  return [...rawSpeeds];
}

/**
 * Builds the send-side fan-speed `fn` mapping for a device, for the mode the command will leave it in.
 *
 * Sources are consulted from most to least specific:
 *
 * 1. The target mode's own `SupportedCaps.modes[md].fanSpeeds`, mapped by value. A device can accept different speeds per
 *    mode — an AC-V1-0 offers all four in heat and cool, but only `auto` in dry — and only this list reflects that.
 * 2. The device-wide `SupportedCaps.fanSpeeds`, zipped positionally with {@link CanonicalFanSpeedOrder}, so that a list of
 *    `1, 2, 4, 6` reads as auto, low, medium and high respectively.
 * 3. The union of every mode's list, mapped by value — for devices that enumerate speeds per mode but publish no
 *    device-wide list, and for callers that did not name a mode.
 * 4. Failing all of those, CodeNum=1117 (AC-V1-X) devices use the {@link CanonicalFanSpeedSendMap} (they use canonical `fn`
 *    values even without enumerating them) and every other device the {@link LegacyFanSpeedSendMap}, preserving backward
 *    compatibility.
 *
 * @param device - The device to build the mapping for.
 * @param mode - The mode the device will be in, when known. Without it the mapping cannot be mode-specific and falls
 *   through to the device-wide sources.
 * @returns A partial map from fan speed to the device-specific `fn` value.
 */
export function buildFanSpeedSendMap(
  device: DeviceBase,
  mode?: MysaDeviceMode
): Partial<Record<MysaFanSpeedMode, number>> {
  const supportedCaps = device.SupportedCaps;

  const modeFanSpeeds = mode !== undefined ? supportedCaps?.modes?.[ModeSendMap[mode]]?.fanSpeeds : undefined;
  if (modeFanSpeeds && modeFanSpeeds.length > 0) {
    const map = mapFanSpeedsByValue(modeFanSpeeds);
    // An empty map means the device enumerated `fn` values this SDK does not know. Fall through rather than reject
    // every fan command for it.
    if (Object.keys(map).length > 0) {
      return map;
    }
  }

  const fanSpeeds = supportedCaps?.fanSpeeds;
  if (fanSpeeds && fanSpeeds.length > 0) {
    const map: Partial<Record<MysaFanSpeedMode, number>> = {};
    CanonicalFanSpeedOrder.forEach((name, index) => {
      if (index < fanSpeeds.length) {
        map[name] = fanSpeeds[index];
      }
    });
    return map;
  }

  const unionFanSpeeds = collectModeFanSpeeds(supportedCaps);
  if (unionFanSpeeds.length > 0) {
    const map = mapFanSpeedsByValue(unionFanSpeeds);
    if (Object.keys(map).length > 0) {
      return map;
    }
  }

  // CodeNum=1117 (AC-V1-X) devices use canonical fn values (1/2/4/6) but frequently omit an explicit
  // SupportedCaps.fanSpeeds list. The legacy map (1/3/5/7) would send fn values these devices ignore, so
  // fall back to the canonical map for them; all other no-fanSpeeds devices keep the legacy universal map.
  // CodeNum is compared numerically because the REST API reports it as a string.
  return Number(device.CodeNum) === CANONICAL_FAN_SPEED_CODE_NUM ? CanonicalFanSpeedSendMap : LegacyFanSpeedSendMap;
}
