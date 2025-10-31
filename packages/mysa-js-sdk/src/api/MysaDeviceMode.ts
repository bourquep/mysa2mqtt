/**
 * Union type representing the available operating modes for Mysa devices.
 *
 * Defines the possible operational states that a Mysa thermostat or heating device can be set to. These modes control
 * the device's heating behavior and power consumption.
 */
export type MysaDeviceMode = 'off' | 'heat' | 'cool' | 'dry' | 'fan_only' | 'auto';

/**
 * Union type representing the available fan speed modes for Mysa devices.
 *
 * Defines the possible fan speed states that a Mysa thermostat device can be set to.
 */
export type MysaFanSpeedMode = 'auto' | 'low' | 'medium' | 'high' | 'max';
