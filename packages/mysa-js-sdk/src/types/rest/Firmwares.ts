/** Device firmware information */
export interface FirmwareDevice {
  /** Device ID */
  Device: string;
  /** Device firmware version */
  InstalledVersion: string;
}

/**
 * Collection of firmware devices indexed by device ID
 *
 * Maps device ID strings to their corresponding firmware device objects, providing a lookup table for all devices
 * associated with a user account.
 */
export interface Firmwares {
  Firmware: Record<string, FirmwareDevice>;
}
