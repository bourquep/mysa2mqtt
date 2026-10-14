import { MysaDeviceMode } from '@/api/MysaDeviceMode';
import { DeviceBase, ShadowStateUpdate } from '@/types/rest';

/**
 * Encoding of device commands for the REST `/state/{deviceId}/update` endpoint of Mysa's current backend.
 *
 * Internal to the SDK: these helpers are not re-exported from the package barrel.
 */

/** The `source` sent with every shadow state update; 3 is what the Mysa app sends, reported as "app" in change history. */
export const ShadowStateUpdateSource = 3;

/** Maps a {@link MysaDeviceMode} to the `modes.mode` value of the shadow state. Differs from the MQTT encoding. */
export const ShadowModeSendMap: Record<MysaDeviceMode, number> = {
  off: 0,
  auto: 1,
  cool: 3,
  heat: 4,
  fan_only: 7,
  dry: 8
};

/** Maps a shadow state `modes.mode` value back to a {@link MysaDeviceMode}. */
export const ShadowModeReceiveMap: Partial<Record<number, MysaDeviceMode>> = Object.fromEntries(
  Object.entries(ShadowModeSendMap).map(([mode, value]) => [value, mode as MysaDeviceMode])
);

/**
 * Whether a device can cool, and therefore keeps its cooling setpoint in a separate `targetCool` section.
 *
 * @param device - The device to test.
 * @returns True for air-conditioner controllers (AC-V1 family).
 */
export function isCoolingCapable(device: DeviceBase): boolean {
  return /^AC-/i.test(device.Model);
}

/**
 * Builds the body of a shadow state update that applies a setpoint and/or an operating mode.
 *
 * Heating-only devices keep their setpoint in `targetHeat`. Devices that can cool keep it in `targetCool` while
 * cooling, so the section is picked from the requested mode, or from the device's current mode when only a setpoint is
 * being changed.
 *
 * @param device - The device the update is aimed at.
 * @param setPoint - The setpoint to apply, in degrees Celsius, or undefined to leave it unchanged.
 * @param mode - The operating mode to apply, or undefined to leave it unchanged.
 * @param currentMode - The device's current mode, used to pick the setpoint section when `mode` is undefined.
 * @returns The update body, or undefined when there is nothing to change.
 */
export function buildShadowStateUpdate(
  device: DeviceBase,
  setPoint: number | undefined,
  mode: MysaDeviceMode | undefined,
  currentMode?: MysaDeviceMode
): ShadowStateUpdate | undefined {
  if (setPoint === undefined && mode === undefined) {
    return undefined;
  }

  const update: ShadowStateUpdate = { source: ShadowStateUpdateSource };

  if (mode !== undefined) {
    update.modes = { mode: ShadowModeSendMap[mode] };
  }

  if (setPoint !== undefined) {
    const isCooling = isCoolingCapable(device) && (mode ?? currentMode) === 'cool';
    update[isCooling ? 'targetCool' : 'targetHeat'] = { setpoint: setPoint };
  }

  return update;
}
