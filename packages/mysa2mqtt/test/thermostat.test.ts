import { SupportedCaps } from 'mysa-js-sdk';
import { describe, expect, it, vi } from 'vitest';

// thermostat.ts pulls `version` from options.ts, whose module body parses process.argv and exits when the mandatory
// credential options are absent — which they are under vitest.
vi.mock('@/options', () => ({ version: '0.0.0-test' }));

const { buildFanModes } = await import('@/thermostat');

/**
 * `SupportedCaps` as actually reported by an AC-V1-0 driving a DAIKIN mini-split (caps version 1.2). No device-wide
 * `fanSpeeds` list, and a per-mode list that differs by mode.
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

describe('buildFanModes', () => {
  it('advertises the union across modes when no mode is given', () => {
    // This is what discovery publishes: Home Assistant's fan_modes list is fixed, so it has to cover every mode.
    expect(buildFanModes(AC_V1_0_CAPS)).toEqual(['auto', 'low', 'medium', 'high']);
  });

  it('reports every speed for a mode that supports them all', () => {
    expect(buildFanModes(AC_V1_0_CAPS, 'cool')).toEqual(['auto', 'low', 'medium', 'high']);
  });

  it('reports only auto for a mode that runs the fan at a fixed speed', () => {
    expect(buildFanModes(AC_V1_0_CAPS, 'dry')).toEqual(['auto']);
    expect(buildFanModes(AC_V1_0_CAPS, 'auto')).toEqual(['auto']);
  });

  it('omits auto for a mode that does not offer it', () => {
    expect(buildFanModes(AC_V1_0_CAPS, 'fan_only')).toEqual(['low', 'medium', 'high']);
  });

  it('falls back to the device-wide union for a mode that enumerates no speeds', () => {
    const caps: SupportedCaps = { ...AC_V1_0_CAPS, modes: { ...AC_V1_0_CAPS.modes, 6: { temperatures: [20] } } };

    expect(buildFanModes(caps, 'dry')).toEqual(['auto', 'low', 'medium', 'high']);
  });

  it('ignores a per-mode list of unrecognized values rather than rejecting every speed', () => {
    const caps: SupportedCaps = {
      ...AC_V1_0_CAPS,
      modes: { ...AC_V1_0_CAPS.modes, 4: { temperatures: [20], fanSpeeds: [91, 92] } }
    };

    // Carrying 91/92 through would leave nothing after the raw-value filter, and an empty list rejects every
    // fan-speed command for the mode. The SDK's send map falls through in the same situation.
    expect(buildFanModes(caps, 'cool')).toEqual(['auto', 'low', 'medium', 'high']);
  });

  it('prefers the device-wide list alone for a mode that enumerates none, matching the SDK send map', () => {
    const caps: SupportedCaps = {
      tempRange: [16, 30],
      version: '1.2',
      keys: [3, 4],
      fanSpeeds: [1, 2, 4],
      modes: { 4: { temperatures: [20] }, 5: { temperatures: [25], fanSpeeds: [7] } }
    };

    // `high` comes only from fan-only. Advertising it for cool would pass validation here and then fail in the
    // SDK, which builds cool's send map from the device-wide list alone.
    expect(buildFanModes(caps, 'cool')).toEqual(['auto', 'low', 'medium']);
  });

  it('falls back to the device-wide union for a mode the device does not report at all', () => {
    expect(buildFanModes(AC_V1_0_CAPS, 'off')).toEqual(['auto', 'low', 'medium', 'high']);
  });

  it('is permissive when the device reports no capabilities', () => {
    expect(buildFanModes(undefined)).toEqual(['auto', 'low', 'medium', 'high', 'max']);
  });

  it('advertises the canonical speeds when fan support is declared only through keys', () => {
    const caps: SupportedCaps = { tempRange: [16, 30], version: '1.2', keys: [3, 4], modes: {} };

    expect(buildFanModes(caps)).toEqual(['auto', 'low', 'medium', 'high']);
  });

  it('advertises auto only when the device declares no fan support', () => {
    const caps: SupportedCaps = { tempRange: [16, 30], version: '1.2', keys: [3], modes: {} };

    expect(buildFanModes(caps)).toEqual(['auto']);
  });
});
