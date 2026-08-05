import { MysaTrackedSensor } from '@/api/MysaTrackedSensor';
import { buildFanSpeedSendMap, TrackedSensorReceiveMap, TrackedSensorSendMap } from '@/lib/DeviceCapabilities';
import { DeviceBase, SupportedCaps } from '@/types/rest';
import { describe, expect, it } from 'vitest';

/**
 * `SupportedCaps` as actually reported by an AC-V1-0 driving a DAIKIN mini-split (caps version 1.2, `CodeNum` "2009").
 *
 * The shape that matters: no device-wide `fanSpeeds` list, and a per-mode list that differs by mode — all four speeds
 * in heat and cool, `auto` only in auto and dry, and everything _but_ `auto` in fan-only.
 */
const AC_V1_0_CAPS: SupportedCaps = {
  tempRange: [16, 30],
  version: '1.2',
  keys: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 21, 39, 40],
  modes: {
    2: { temperatures: [16, 30], fanSpeeds: [1] }, // auto
    3: { temperatures: [16, 30], fanSpeeds: [1, 3, 5, 7] }, // heat
    4: { temperatures: [16, 30], fanSpeeds: [1, 3, 5, 7] }, // cool
    5: { temperatures: [25], fanSpeeds: [3, 5, 7] }, // fan_only
    6: { temperatures: [16, 30], fanSpeeds: [1] } // dry
  }
};

function device(overrides: Partial<DeviceBase> = {}): DeviceBase {
  return { Id: '5443b2005580', Model: 'AC-V1-0', ...overrides };
}

describe('buildFanSpeedSendMap', () => {
  describe('per-mode fan speeds', () => {
    it('uses the requested mode’s own list', () => {
      const map = buildFanSpeedSendMap(device({ SupportedCaps: AC_V1_0_CAPS }), 'cool');

      expect(map).toEqual({ auto: 1, low: 3, medium: 5, high: 7 });
    });

    it('offers only auto in a mode that supports nothing else', () => {
      const map = buildFanSpeedSendMap(device({ SupportedCaps: AC_V1_0_CAPS }), 'dry');

      expect(map).toEqual({ auto: 1 });
    });

    it('does not shift speeds in a mode whose list omits auto', () => {
      const map = buildFanSpeedSendMap(device({ SupportedCaps: AC_V1_0_CAPS }), 'fan_only');

      // Zipping [3, 5, 7] positionally against [auto, low, medium, high] would read 3 as `auto`, sending the fan to
      // low whenever auto was asked for. Mapping by value keeps 3 as `low` and leaves `auto` unsupported.
      expect(map).toEqual({ low: 3, medium: 5, high: 7 });
      expect(map.auto).toBeUndefined();
    });

    it('falls back to the union across modes when no mode is given', () => {
      const map = buildFanSpeedSendMap(device({ SupportedCaps: AC_V1_0_CAPS }));

      expect(map).toEqual({ auto: 1, low: 3, medium: 5, high: 7 });
    });

    it('falls back to the device-wide list for a mode that enumerates no speeds', () => {
      const caps: SupportedCaps = { ...AC_V1_0_CAPS, fanSpeeds: [1, 2, 4, 6], modes: { 4: { temperatures: [20] } } };

      expect(buildFanSpeedSendMap(device({ SupportedCaps: caps }), 'cool')).toEqual({
        auto: 1,
        low: 2,
        medium: 4,
        high: 6
      });
    });

    it('prefers the per-mode list over the device-wide one', () => {
      const caps: SupportedCaps = {
        ...AC_V1_0_CAPS,
        fanSpeeds: [1, 2, 4, 6],
        modes: { 6: { temperatures: [20], fanSpeeds: [1] } }
      };

      expect(buildFanSpeedSendMap(device({ SupportedCaps: caps }), 'dry')).toEqual({ auto: 1 });
    });

    it('ignores a per-mode list of unrecognized values rather than rejecting every speed', () => {
      const caps: SupportedCaps = { ...AC_V1_0_CAPS, modes: { 4: { temperatures: [20], fanSpeeds: [91, 92] } } };

      // Nothing in the list maps to a known speed, so the device-wide fallbacks still apply.
      expect(buildFanSpeedSendMap(device({ SupportedCaps: caps }), 'cool')).toEqual({
        auto: 1,
        low: 3,
        medium: 5,
        high: 7,
        max: 8
      });
    });
  });

  describe('device-wide fan speeds', () => {
    it('zips a device-wide list positionally', () => {
      const caps: SupportedCaps = { ...AC_V1_0_CAPS, fanSpeeds: [1, 2, 4, 6], modes: {} };

      expect(buildFanSpeedSendMap(device({ SupportedCaps: caps }))).toEqual({ auto: 1, low: 2, medium: 4, high: 6 });
    });
  });

  describe('CodeNum fallback', () => {
    it('uses the canonical map when CodeNum is the string the REST API actually returns', () => {
      // The REST API reports CodeNum as a string; a strict === against 1117 never matched, so these devices silently
      // fell back to the legacy map and every non-auto fan command was ignored by the unit.
      const map = buildFanSpeedSendMap(device({ CodeNum: '1117' }));

      expect(map).toEqual({ auto: 1, low: 2, medium: 4, high: 6 });
    });

    it('uses the canonical map when CodeNum is numeric', () => {
      expect(buildFanSpeedSendMap(device({ CodeNum: 1117 }))).toEqual({ auto: 1, low: 2, medium: 4, high: 6 });
    });

    it('uses the legacy map for any other device', () => {
      expect(buildFanSpeedSendMap(device({ CodeNum: '2009' }))).toEqual({
        auto: 1,
        low: 3,
        medium: 5,
        high: 7,
        max: 8
      });
    });

    it('uses the legacy map when no CodeNum is reported', () => {
      expect(buildFanSpeedSendMap(device())).toEqual({ auto: 1, low: 3, medium: 5, high: 7, max: 8 });
    });
  });
});

describe('tracked sensor maps', () => {
  // The raw values were decoded from a real INF-V1-0: the `tr` command field and the `trackedSnsr` status field share
  // an encoding, so a written value reads back unchanged. Anything that breaks that round trip would silently invert
  // the setting.
  it('round-trips every sensor through the send and receive maps', () => {
    for (const sensor of Object.keys(TrackedSensorSendMap) as MysaTrackedSensor[]) {
      expect(TrackedSensorReceiveMap[TrackedSensorSendMap[sensor]]).toBe(sensor);
    }
  });

  it('uses the raw values observed on the wire', () => {
    expect(TrackedSensorSendMap).toEqual({ floor: 3, ambient: 5 });
  });
});
