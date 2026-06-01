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
import { parseEmporiaDevices, parseEmporiaUsages, perSecondKwhToWatts } from './usage';

describe('parseEmporiaDevices', () => {
  it('flattens devices and their channels', () => {
    const devices = parseEmporiaDevices({
      devices: [
        {
          deviceGid: 1234,
          locationProperties: { deviceName: 'Main Panel' },
          channels: [
            { channelNum: '1,2,3', name: 'Mains' },
            { channelNum: '1', name: 'Dryer' }
          ]
        }
      ]
    });
    expect(devices).toHaveLength(1);
    expect(devices[0]).toMatchObject({ deviceGid: 1234, name: 'Main Panel' });
    expect(devices[0].channels).toEqual([
      { channelNum: '1,2,3', name: 'Mains' },
      { channelNum: '1', name: 'Dryer' }
    ]);
  });

  it('skips devices without a numeric gid and tolerates missing channels', () => {
    const devices = parseEmporiaDevices({ devices: [{ deviceGid: 'x' }, { deviceGid: 7 }] });
    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({ deviceGid: 7, name: undefined, channels: [] });
  });

  it('returns empty for unrecognized payloads', () => {
    expect(parseEmporiaDevices(null)).toEqual([]);
    expect(parseEmporiaDevices({})).toEqual([]);
  });
});

describe('perSecondKwhToWatts', () => {
  it('converts per-second kWh into average watts', () => {
    // 1 W for 1 s = 1/3600/1000 kWh; the inverse must give back 1 W.
    expect(perSecondKwhToWatts(1 / 3_600_000)).toBeCloseTo(1, 6);
    expect(perSecondKwhToWatts(0.001 / 3600)).toBeCloseTo(1, 6);
  });
});

describe('parseEmporiaUsages', () => {
  it('extracts per-channel power as watts from per-second kWh usage', () => {
    const readings = parseEmporiaUsages({
      deviceListUsages: {
        devices: [
          {
            deviceGid: 1234,
            channelUsages: [
              { deviceGid: 1234, channelNum: '1,2,3', name: 'Mains', usage: 0.5 / 3600 },
              { deviceGid: 1234, channelNum: '1', name: 'Dryer', usage: 0.1 / 3600 }
            ]
          }
        ]
      }
    });
    expect(readings).toHaveLength(2);
    expect(readings[0]).toMatchObject({ deviceGid: 1234, channelNum: '1,2,3', name: 'Mains' });
    expect(readings[0].powerWatts).toBeCloseTo(500, 3);
    expect(readings[1].powerWatts).toBeCloseTo(100, 3);
  });

  it('walks nested devices', () => {
    const readings = parseEmporiaUsages({
      deviceListUsages: {
        devices: [
          {
            deviceGid: 1,
            channelUsages: [
              {
                deviceGid: 1,
                channelNum: '1',
                usage: 0.001 / 3600,
                nestedDevices: [
                  { channelUsages: [{ deviceGid: 2, channelNum: '1', name: 'Sub', usage: 0.002 / 3600 }] }
                ]
              }
            ]
          }
        ]
      }
    });
    const sub = readings.find((r) => r.deviceGid === 2);
    expect(sub?.powerWatts).toBeCloseTo(2, 3);
  });

  it('ignores channels without finite usage and returns empty for unrecognized payloads', () => {
    expect(parseEmporiaUsages({ deviceListUsages: { devices: [{ channelUsages: [{ channelNum: '1' }] }] } })).toEqual(
      []
    );
    expect(parseEmporiaUsages(null)).toEqual([]);
  });
});
