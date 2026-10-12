import { buildShadowStateUpdate, ShadowModeReceiveMap, ShadowModeSendMap } from '@/lib/ShadowStateUpdate';
import { DeviceBase } from '@/types/rest';
import { describe, expect, it } from 'vitest';

function device(model: string): DeviceBase {
  return { Id: '5443b2005580', Model: model };
}

describe('buildShadowStateUpdate', () => {
  it('returns undefined when there is nothing to change', () => {
    expect(buildShadowStateUpdate(device('BB-V1-1'), undefined, undefined)).toBeUndefined();
  });

  it('sends a set point in the heating section, tagged with the app source', () => {
    expect(buildShadowStateUpdate(device('BB-V1-1'), 5.5, undefined)).toEqual({
      source: 3,
      targetHeat: { setpoint: 5.5 }
    });
  });

  it('sends a mode using the shadow state encoding', () => {
    expect(buildShadowStateUpdate(device('BB-V2-0-L'), undefined, 'heat')).toEqual({ source: 3, modes: { mode: 4 } });
    expect(buildShadowStateUpdate(device('BB-V2-0-L'), undefined, 'off')).toEqual({ source: 3, modes: { mode: 0 } });
  });

  it('combines a set point and a mode in one update', () => {
    expect(buildShadowStateUpdate(device('INF-V1-0'), 21, 'heat')).toEqual({
      source: 3,
      modes: { mode: 4 },
      targetHeat: { setpoint: 21 }
    });
  });

  it('keeps a heating-only device in the heating section even when asked to cool', () => {
    expect(buildShadowStateUpdate(device('BB-V2-0'), 21, 'cool')).toEqual({
      source: 3,
      modes: { mode: 3 },
      targetHeat: { setpoint: 21 }
    });
  });

  describe('on a device that can cool', () => {
    it('uses the cooling section when switching to cool', () => {
      expect(buildShadowStateUpdate(device('AC-V1-0'), 23, 'cool')).toEqual({
        source: 3,
        modes: { mode: 3 },
        targetCool: { setpoint: 23 }
      });
    });

    it('uses the cooling section when the device is already cooling', () => {
      expect(buildShadowStateUpdate(device('AC-V1-0'), 23, undefined, 'cool')).toEqual({
        source: 3,
        targetCool: { setpoint: 23 }
      });
    });

    it('lets the requested mode win over the current one', () => {
      expect(buildShadowStateUpdate(device('AC-V1-0'), 20, 'heat', 'cool')).toEqual({
        source: 3,
        modes: { mode: 4 },
        targetHeat: { setpoint: 20 }
      });
    });

    it('uses the heating section in any other mode', () => {
      expect(buildShadowStateUpdate(device('AC-V1-0'), 20, undefined, 'heat')).toEqual({
        source: 3,
        targetHeat: { setpoint: 20 }
      });
    });
  });
});

describe('ShadowModeReceiveMap', () => {
  it('is the inverse of ShadowModeSendMap', () => {
    for (const [mode, value] of Object.entries(ShadowModeSendMap)) {
      expect(ShadowModeReceiveMap[value]).toBe(mode);
    }
  });
});
