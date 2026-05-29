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
import { getDeviceCapabilities, parseModel } from './capabilities';

describe('parseModel', () => {
  it('parses baseboard models', () => {
    expect(parseModel('BB-V1-1')).toEqual({ raw: 'BB-V1-1', family: 'BB', generation: 1, isLite: false });
    expect(parseModel('BB-V2-1')).toEqual({ raw: 'BB-V2-1', family: 'BB', generation: 2, isLite: false });
  });

  it('detects the Lite variant', () => {
    expect(parseModel('BB-V2-1-L')).toEqual({ raw: 'BB-V2-1-L', family: 'BB', generation: 2, isLite: true });
  });

  it('parses AC models', () => {
    expect(parseModel('AC-V1-1')).toEqual({ raw: 'AC-V1-1', family: 'AC', generation: 1, isLite: false });
  });

  it('treats unrecognized models as UNKNOWN (e.g. in-floor)', () => {
    expect(parseModel('IFH-V1-1')).toEqual({ raw: 'IFH-V1-1', family: 'UNKNOWN', generation: 1, isLite: false });
    expect(parseModel('unknown')).toEqual({ raw: 'unknown', family: 'UNKNOWN', generation: undefined, isLite: false });
    expect(parseModel('')).toEqual({ raw: '', family: 'UNKNOWN', generation: undefined, isLite: false });
  });

  it('is case-insensitive', () => {
    expect(parseModel('bb-v2-1-l')).toEqual({ raw: 'bb-v2-1-l', family: 'BB', generation: 2, isLite: true });
  });
});

describe('getDeviceCapabilities', () => {
  it('gives baseboard V1 a power sensor and no cooling/fan', () => {
    expect(getDeviceCapabilities('BB-V1-1')).toEqual({
      deviceType: 'BB',
      supportsCooling: false,
      supportsFan: false,
      reportsPower: true
    });
  });

  it('gives baseboard V2 a (duty-cycle estimated) power sensor', () => {
    expect(getDeviceCapabilities('BB-V2-1').reportsPower).toBe(true);
  });

  it('does not give the Lite variant a power sensor', () => {
    const caps = getDeviceCapabilities('BB-V2-1-L');
    expect(caps.deviceType).toBe('BB');
    expect(caps.reportsPower).toBe(false);
  });

  it('gives AC controllers cooling and fan, but no power sensor', () => {
    expect(getDeviceCapabilities('AC-V1-1')).toEqual({
      deviceType: 'AC',
      supportsCooling: true,
      supportsFan: true,
      reportsPower: false
    });
  });

  it('treats unknown/in-floor models as heat-only with a power sensor', () => {
    const caps = getDeviceCapabilities('IFH-V1-1');
    expect(caps.deviceType).toBe('BB');
    expect(caps.supportsCooling).toBe(false);
    expect(caps.reportsPower).toBe(true);
  });
});
