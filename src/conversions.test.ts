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

import { describe, expect, it } from 'vitest';
import {
  computeClimateAction,
  computePowerWatts,
  deviceTypeFromModel,
  MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE,
  MYSA_RAW_MODE_TO_DEVICE_MODE,
  normalizeSetpointCelsius,
  resolveCommandedFanMode,
  resolveCommandedMode,
  resolvePowerCommandMode
} from './conversions';

describe('deviceTypeFromModel', () => {
  it('classifies AC models as AC', () => {
    expect(deviceTypeFromModel('AC-V1-1')).toBe('AC');
    expect(deviceTypeFromModel('AC-V2-2')).toBe('AC');
  });

  it('classifies baseboard, in-floor and unknown models as BB', () => {
    expect(deviceTypeFromModel('BB-V1-1')).toBe('BB');
    expect(deviceTypeFromModel('BB-V2-1-L')).toBe('BB');
    expect(deviceTypeFromModel('unknown')).toBe('BB');
    expect(deviceTypeFromModel('')).toBe('BB');
  });
});

describe('resolveCommandedMode', () => {
  it('accepts all AC modes for AC devices', () => {
    for (const mode of ['off', 'heat', 'cool', 'dry', 'fan_only', 'auto']) {
      expect(resolveCommandedMode(mode, true)).toBe(mode);
    }
  });

  it('only accepts off/heat for heat-only devices', () => {
    expect(resolveCommandedMode('off', false)).toBe('off');
    expect(resolveCommandedMode('heat', false)).toBe('heat');
    expect(resolveCommandedMode('cool', false)).toBeUndefined();
    expect(resolveCommandedMode('auto', false)).toBeUndefined();
    expect(resolveCommandedMode('fan_only', false)).toBeUndefined();
  });

  it('rejects unknown modes', () => {
    expect(resolveCommandedMode('bogus', true)).toBeUndefined();
    expect(resolveCommandedMode('', false)).toBeUndefined();
  });
});

describe('resolvePowerCommandMode', () => {
  it('maps OFF to off regardless of device type', () => {
    expect(resolvePowerCommandMode('OFF', false)).toBe('off');
    expect(resolvePowerCommandMode('OFF', true)).toBe('off');
  });

  it('maps ON to heat only for heat-only devices', () => {
    expect(resolvePowerCommandMode('ON', false)).toBe('heat');
    expect(resolvePowerCommandMode('ON', true)).toBeUndefined();
  });

  it('ignores unrecognized payloads', () => {
    expect(resolvePowerCommandMode('on', false)).toBeUndefined();
    expect(resolvePowerCommandMode('', false)).toBeUndefined();
  });
});

describe('resolveCommandedFanMode', () => {
  it('accepts all supported fan modes', () => {
    for (const mode of ['auto', 'low', 'medium', 'high', 'max']) {
      expect(resolveCommandedFanMode(mode)).toBe(mode);
    }
  });

  it('rejects unsupported fan modes', () => {
    expect(resolveCommandedFanMode('turbo')).toBeUndefined();
    expect(resolveCommandedFanMode('')).toBeUndefined();
  });
});

describe('normalizeSetpointCelsius', () => {
  it('returns the value unchanged when Home Assistant uses Celsius', () => {
    expect(normalizeSetpointCelsius(21.3, true, 5, 30)).toBe(21.3);
    // No clamping or snapping is applied in Celsius mode, even out of range.
    expect(normalizeSetpointCelsius(99, true, 5, 30)).toBe(99);
  });

  it('snaps to the nearest 0.5 °C in Fahrenheit mode', () => {
    expect(normalizeSetpointCelsius(20.2, false, 0, 100)).toBe(20);
    expect(normalizeSetpointCelsius(20.3, false, 0, 100)).toBe(20.5);
    expect(normalizeSetpointCelsius(20.74, false, 0, 100)).toBe(20.5);
    expect(normalizeSetpointCelsius(20.75, false, 0, 100)).toBe(21);
  });

  it('clamps to the device range in Fahrenheit mode', () => {
    expect(normalizeSetpointCelsius(2, false, 5, 30)).toBe(5);
    expect(normalizeSetpointCelsius(35, false, 5, 30)).toBe(30);
  });

  it('snaps before clamping', () => {
    // 30.3 snaps to 30.5, then clamps to the 30 max.
    expect(normalizeSetpointCelsius(30.3, false, 5, 30)).toBe(30);
  });

  it('falls back to 0..100 limits when the device range is unknown', () => {
    expect(normalizeSetpointCelsius(-10, false, undefined, undefined)).toBe(0);
    expect(normalizeSetpointCelsius(150, false, undefined, undefined)).toBe(100);
  });
});

describe('computePowerWatts', () => {
  it('uses measured current for V1 devices (voltage × current)', () => {
    expect(computePowerWatts(120, undefined, 2.5, undefined)).toBe(300);
    expect(computePowerWatts(120, '12.5', 0, undefined)).toBe(0);
  });

  it('prefers current over duty cycle when both are present', () => {
    expect(computePowerWatts(120, '10', 2, 0.5)).toBe(240);
  });

  it('estimates power from duty cycle for V2 devices (voltage × maxCurrent × dutyCycle)', () => {
    expect(computePowerWatts(240, '12.5', undefined, 0.5)).toBe(1500);
    expect(computePowerWatts(240, '10', undefined, 0)).toBe(0);
  });

  it('parses the leading number out of a maxCurrent string', () => {
    expect(computePowerWatts(120, '12.5A', undefined, 1)).toBe(1500);
  });

  it('returns null when voltage is unknown', () => {
    expect(computePowerWatts(undefined, '10', 2.5, undefined)).toBeNull();
    expect(computePowerWatts(undefined, '10', undefined, 0.5)).toBeNull();
  });

  it('returns null when a V2 estimate lacks a usable maxCurrent', () => {
    expect(computePowerWatts(240, undefined, undefined, 0.5)).toBeNull();
    expect(computePowerWatts(240, '', undefined, 0.5)).toBeNull();
    expect(computePowerWatts(240, 'abc', undefined, 0.5)).toBeNull();
  });

  it('returns null when there is no current and no duty cycle', () => {
    expect(computePowerWatts(120, '10', undefined, undefined)).toBeNull();
  });
});

describe('computeClimateAction', () => {
  it('reports off when the mode is off', () => {
    expect(computeClimateAction('off', 'BB')).toBe('off');
    expect(computeClimateAction('off', 'AC')).toBe('off');
  });

  it('maps AC-style modes to their actions', () => {
    expect(computeClimateAction('cool', 'AC')).toBe('cooling');
    expect(computeClimateAction('fan_only', 'AC')).toBe('fan');
    expect(computeClimateAction('dry', 'AC')).toBe('drying');
  });

  it('treats heat on an AC device as actively heating', () => {
    expect(computeClimateAction('heat', 'AC')).toBe('heating');
  });

  it('derives heating vs idle from current for baseboard heaters', () => {
    expect(computeClimateAction('heat', 'BB', 1.5)).toBe('heating');
    expect(computeClimateAction('heat', 'BB', 0)).toBe('idle');
  });

  it('falls back to duty cycle when current is unavailable for baseboard heaters', () => {
    expect(computeClimateAction('heat', 'BB', undefined, 0.3)).toBe('heating');
    expect(computeClimateAction('heat', 'BB', undefined, 0)).toBe('idle');
    expect(computeClimateAction('heat', 'BB', undefined, undefined)).toBe('idle');
  });

  it('prefers current over duty cycle for baseboard heaters', () => {
    expect(computeClimateAction('heat', 'BB', 0, 0.9)).toBe('idle');
  });

  it('reports idle for auto, unknown or missing modes', () => {
    expect(computeClimateAction('auto', 'AC')).toBe('idle');
    expect(computeClimateAction('bogus', 'AC')).toBe('idle');
    expect(computeClimateAction(undefined, 'BB')).toBe('idle');
  });
});

describe('raw value maps', () => {
  it('maps raw TstatMode values to Home Assistant modes', () => {
    expect(MYSA_RAW_MODE_TO_DEVICE_MODE[1]).toBe('off');
    expect(MYSA_RAW_MODE_TO_DEVICE_MODE[2]).toBe('auto');
    expect(MYSA_RAW_MODE_TO_DEVICE_MODE[3]).toBe('heat');
    expect(MYSA_RAW_MODE_TO_DEVICE_MODE[4]).toBe('cool');
    expect(MYSA_RAW_MODE_TO_DEVICE_MODE[5]).toBe('fan_only');
    expect(MYSA_RAW_MODE_TO_DEVICE_MODE[6]).toBe('dry');
    expect(MYSA_RAW_MODE_TO_DEVICE_MODE[99]).toBeUndefined();
  });

  it('maps raw FanSpeed values to Home Assistant fan modes', () => {
    expect(MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE[1]).toBe('auto');
    expect(MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE[3]).toBe('low');
    expect(MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE[5]).toBe('medium');
    expect(MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE[7]).toBe('high');
    expect(MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE[8]).toBe('max');
    expect(MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE[2]).toBeUndefined();
  });
});
