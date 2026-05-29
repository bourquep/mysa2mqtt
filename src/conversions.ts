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

import { ClimateAction } from 'mqtt2ha';
import { MysaDeviceMode, MysaFanSpeedMode } from 'mysa-js-sdk';

/**
 * The physical category of a Mysa device, derived from its model identifier.
 *
 * `'AC'` covers mini-split heat pump / air conditioner units, while `'BB'` covers electric baseboard and in-floor
 * heating thermostats.
 */
export type DeviceType = 'AC' | 'BB';

/** Home Assistant climate modes exposed for heat-only (baseboard / in-floor) thermostats. */
export const HA_HEAT_ONLY_MODES: Partial<MysaDeviceMode>[] = ['off', 'heat'];

/** Home Assistant climate modes exposed for air conditioner / heat pump thermostats. */
export const HA_AC_MODES: Partial<MysaDeviceMode>[] = ['off', 'heat', 'cool', 'dry', 'fan_only', 'auto'];

/** Maps the raw `TstatMode` value reported by a Mysa device to its Home Assistant climate mode. */
export const MYSA_RAW_MODE_TO_DEVICE_MODE: Partial<Record<number, MysaDeviceMode>> = {
  1: 'off',
  2: 'auto',
  3: 'heat',
  4: 'cool',
  5: 'fan_only',
  6: 'dry'
};

/** Home Assistant fan modes exposed for air conditioner / heat pump thermostats. */
export const FAN_SPEED_MODES: Partial<MysaFanSpeedMode>[] = ['auto', 'low', 'medium', 'high', 'max'];

/** Maps the raw `FanSpeed` value reported by a Mysa device to its Home Assistant fan mode. */
export const MYSA_RAW_FAN_SPEED_TO_FAN_SPEED_MODE: Partial<Record<number, MysaFanSpeedMode>> = {
  1: 'auto',
  3: 'low',
  5: 'medium',
  7: 'high',
  8: 'max'
};

/**
 * Derives the device type from a Mysa model identifier.
 *
 * @param model - The Mysa device model identifier (e.g. `BB-V1-1`, `AC-V1-1`).
 * @returns `'AC'` for air conditioner / heat pump models, otherwise `'BB'`.
 */
export function deviceTypeFromModel(model: string): DeviceType {
  return model.startsWith('AC') ? 'AC' : 'BB';
}

/**
 * Resolves the Home Assistant climate mode requested through a `mode_command_topic` message, rejecting any mode the
 * device does not support.
 *
 * @param message - The raw payload received on the mode command topic.
 * @param isAC - Whether the target device is an air conditioner / heat pump.
 * @returns The validated {@link MysaDeviceMode}, or `undefined` if the requested mode is not supported.
 */
export function resolveCommandedMode(message: string, isAC: boolean): MysaDeviceMode | undefined {
  const messageAsMode = message as MysaDeviceMode;
  const supportedModes = isAC ? HA_AC_MODES : HA_HEAT_ONLY_MODES;
  return supportedModes.includes(messageAsMode) ? messageAsMode : undefined;
}

/**
 * Resolves the Mysa mode implied by a `power_command_topic` message.
 *
 * `OFF` always maps to `'off'`. `ON` maps to `'heat'` for heat-only devices; air conditioners have no unambiguous "on"
 * mode, so `ON` is ignored for them.
 *
 * @param message - The raw payload received on the power command topic (typically `ON` or `OFF`).
 * @param isAC - Whether the target device is an air conditioner / heat pump.
 * @returns The {@link MysaDeviceMode} to apply, or `undefined` to leave the mode unchanged.
 */
export function resolvePowerCommandMode(message: string, isAC: boolean): MysaDeviceMode | undefined {
  return message === 'OFF' ? 'off' : message === 'ON' && !isAC ? 'heat' : undefined;
}

/**
 * Resolves the Home Assistant fan mode requested through a `fan_mode_command_topic` message, rejecting unsupported
 * values.
 *
 * @param message - The raw payload received on the fan mode command topic.
 * @returns The validated {@link MysaFanSpeedMode}, or `undefined` if the requested fan mode is not supported.
 */
export function resolveCommandedFanMode(message: string): MysaFanSpeedMode | undefined {
  const messageAsMode = message as MysaFanSpeedMode;
  return FAN_SPEED_MODES.includes(messageAsMode) ? messageAsMode : undefined;
}

/**
 * Normalizes a temperature setpoint to the value that should be sent to the Mysa API, which always expects Celsius.
 *
 * When Home Assistant is configured in Fahrenheit, the incoming Celsius-equivalent value is snapped to the nearest 0.5
 * °C and clamped to the device's supported range to avoid rejected or surprising setpoints.
 *
 * @param temperature - The requested setpoint, already expressed in Celsius.
 * @param isCelsius - Whether Home Assistant is configured to use Celsius.
 * @param minSetpoint - The device's minimum supported setpoint, if known.
 * @param maxSetpoint - The device's maximum supported setpoint, if known.
 * @returns The normalized Celsius setpoint to send to the device.
 */
export function normalizeSetpointCelsius(
  temperature: number,
  isCelsius: boolean,
  minSetpoint: number | undefined,
  maxSetpoint: number | undefined
): number {
  if (isCelsius) {
    return temperature;
  }

  const snapHalfC = (c: number) => Math.round(c * 2) / 2;
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

  // Snap to 0.5 °C and clamp to device limits
  const setC = snapHalfC(temperature);
  return clamp(setC, minSetpoint ?? 0, maxSetpoint ?? 100);
}

/**
 * Estimates the instantaneous power draw of a Mysa device in watts.
 *
 * V1 devices report an actual current measurement, so power is `voltage × current`. V2 devices instead report a heating
 * duty cycle, so power is estimated as `voltage × maxCurrent × dutyCycle`. When neither measurement nor the data needed
 * to estimate it is available, `null` is returned.
 *
 * @param voltage - The device operating voltage, if known.
 * @param maxCurrent - The device maximum current rating as reported by the API (a string), if known.
 * @param current - The measured current draw in amperes (V1 devices), if available.
 * @param dutyCycle - The heating element duty cycle (V2 devices), if available.
 * @returns The power draw in watts, or `null` if it cannot be determined.
 */
export function computePowerWatts(
  voltage: number | undefined,
  maxCurrent: string | undefined,
  current: number | undefined,
  dutyCycle: number | undefined
): number | null {
  // V1 devices: use actual current measurement
  if (voltage != null && current != null) {
    return voltage * current;
  }

  // V2 devices: estimate power from duty cycle and MaxCurrent rating
  if (voltage != null && dutyCycle != null) {
    const parsedMaxCurrent = maxCurrent ? parseFloat(maxCurrent) : null;
    if (parsedMaxCurrent != null && !isNaN(parsedMaxCurrent)) {
      return voltage * parsedMaxCurrent * dutyCycle;
    }
  }

  return null;
}

/**
 * Computes the Home Assistant climate action (`heating`, `cooling`, `idle`, ...) for a device given its current mode
 * and available activity signals.
 *
 * For baseboard heaters in `heat` mode, the action reflects whether the element is actively drawing current (or running
 * a non-zero duty cycle); air conditioners report the action implied by their mode.
 *
 * @param currentMode - The device's current Home Assistant climate mode.
 * @param deviceType - The physical device type.
 * @param current - The measured current draw in amperes, if available.
 * @param dutyCycle - The heating element duty cycle, if available.
 * @returns The {@link ClimateAction} to report to Home Assistant.
 */
export function computeClimateAction(
  currentMode: string | undefined,
  deviceType: DeviceType,
  current?: number,
  dutyCycle?: number
): ClimateAction {
  const currentModeAsMode = currentMode as MysaDeviceMode;
  const mode = HA_AC_MODES.includes(currentModeAsMode) ? currentModeAsMode : undefined;

  switch (mode) {
    case 'off':
      return 'off';
    case 'heat':
      switch (deviceType) {
        case 'BB':
          if (current != null) {
            return current > 0 ? 'heating' : 'idle';
          }
          return (dutyCycle ?? 0) > 0 ? 'heating' : 'idle';
        default:
          return 'heating';
      }
    case 'cool':
      return 'cooling';
    case 'fan_only':
      return 'fan';
    case 'dry':
      return 'drying';
    default:
      return 'idle';
  }
}
