/**
 * Brand information for air conditioning devices.
 *
 * Contains manufacturer and model details for AC units that are controlled through the Mysa system, including both
 * brand and OEM information.
 */
export interface BrandInfo {
  /** The brand name of the AC device */
  Brand: string;
  /** Unique identifier for the brand */
  Id: number;
  /** Remote control model number for the AC device */
  remoteModelNumber?: string;
  /** Original Equipment Manufacturer brand name */
  OEMBrand?: string;
}

/**
 * Supported capabilities and features for air conditioning devices.
 *
 * Defines the operational parameters and available functions for AC units, including temperature ranges, operating
 * modes, and supported control keys.
 */
export interface SupportedCaps {
  /** Temperature range as [minimum, maximum] in device units */
  tempRange: [number, number];
  /** Available operating modes with their supported temperature settings */
  modes: {
    [modeId: string]: {
      /** Array of available temperature setpoints for this mode */
      temperatures: number[];
    };
  };
  /** Version string of the capability definition */
  version: string;
  /** Array of supported remote control key codes */
  keys: number[];
}

/**
 * Device operating mode information.
 *
 * Represents the current or available operating mode for a device, identified by a numeric mode identifier.
 */
export interface ModeObj {
  /** Numeric identifier for the device operating mode */
  Id: number;
}

/**
 * Base interface for all Mysa device types.
 *
 * Defines the common properties and configuration parameters shared across different types of Mysa devices, including
 * thermostats, switches, and AC controllers. This interface encompasses both required core properties and optional
 * features that may vary depending on the specific device model and capabilities.
 */
export interface DeviceBase {
  /** Button digital input configuration value */
  ButtonDI?: number;
  /** Maximum current rating as a string value */
  MaxCurrent?: string;
  /** Device model identifier string */
  Model: string;
  /** Button average value configuration */
  ButtonAVE?: number;
  /** Operating voltage of the device */
  Voltage?: number;
  /** Button polling interval configuration */
  ButtonPolling?: number;
  /** Minimum brightness level (0-100) */
  MinBrightness?: number;
  /** User-assigned device name */
  Name?: string;
  /** Button low power mode configuration */
  ButtonLowPower?: number;
  /** Type of heater controlled by the device */
  HeaterType?: string;
  /** Button repeat delay configuration in milliseconds */
  ButtonRepeatDelay?: number;
  /** Button repeat start delay configuration in milliseconds */
  ButtonRepeatStart?: number;
  /** Display animation style setting */
  Animation?: string;
  /** Maximum brightness level (0-100) */
  MaxBrightness?: number;
  /** Array of user IDs allowed to control this device */
  AllowedUsers?: string[];
  /** Current button state indicator */
  ButtonState?: string;
  /** Home identifier that this device belongs to */
  Home?: string;
  /** Button sensitivity threshold configuration */
  ButtonThreshold?: number;
  /** Data format version used by the device */
  Format?: string;
  /** Time zone setting for the device */
  TimeZone?: string;
  /** Unix timestamp of when device was last paired */
  LastPaired?: number;
  /** Minimum temperature setpoint allowed */
  MinSetpoint?: number;
  /** Current operating mode of the device */
  Mode?: ModeObj;
  /** User ID of the device owner */
  Owner?: string;
  /** Maximum temperature setpoint allowed */
  MaxSetpoint?: number;
  /** Unique device identifier */
  Id: string;
  /** Optional zone assignment for the device */
  Zone?: string;
  /** Optional measured voltage reading from the device */
  MeasuredVoltage?: number;
  /** Optional duty cycle optimization setting */
  DutyCycleOpt?: number;
  /** Optional eco mode configuration */
  ecoMode?: number;
  /** Optional flag indicating if device has thermostatic control */
  IsThermostatic?: boolean;
  /** Optional flag indicating if device requires setup */
  SetupRequired?: boolean;
  /** Optional brand information for AC devices */
  Brand?: BrandInfo;
  /** Optional supported capabilities for AC devices */
  SupportedCaps?: SupportedCaps;
  /** Optional device code number */
  CodeNum?: number;
}

/**
 * Collection of devices indexed by their unique identifiers.
 *
 * Maps device ID strings to their corresponding device configuration objects, providing a lookup table for all devices
 * associated with a user account.
 */
export interface DevicesObj {
  /** Device objects indexed by their unique device ID strings */
  [deviceId: string]: DeviceBase;
}

/**
 * Top-level interface for the devices REST API response.
 *
 * Contains the complete collection of devices associated with a user account, typically returned from API endpoints
 * that fetch device information.
 */
export interface Devices {
  /** Collection of all devices indexed by their unique identifiers */
  DevicesObj: DevicesObj;
}
