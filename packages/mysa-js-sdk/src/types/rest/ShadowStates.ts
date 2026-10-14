/**
 * A section of a device's shadow state that is both requested by clients and reported by the device.
 *
 * Only `reported` reflects what the device has actually applied; `desired` is what was last requested.
 */
export interface ShadowStateSection<T> {
  /** The values last requested by a client (the Mysa app, a schedule, or this SDK). */
  desired?: Partial<T>;
  /** The values last reported by the device itself. */
  reported?: Partial<T>;
}

/** The setpoint-related fields of the `targetHeat` and `targetCool` shadow state sections. */
export interface ShadowTarget {
  /** The target temperature, in degrees Celsius regardless of the thermostat's display units. */
  setpoint: number;
  /** The lowest setpoint accepted by the thermostat, in degrees Celsius. */
  lockoutMin: number;
  /** The highest setpoint accepted by the thermostat, in degrees Celsius. */
  lockoutMax: number;
}

/** The fields of the `modes` shadow state section. */
export interface ShadowModes {
  /**
   * The operating mode: 0 = off, 1 = auto, 3 = cool, 4 = heat, 7 = fan only, 8 = dry.
   *
   * This enum differs from the one used by the MQTT protocol and the legacy `/devices/state` endpoint.
   */
  mode: number;
}

/**
 * The state of a single device, as returned by the `GET /state/{deviceId}` endpoint of Mysa's current backend.
 *
 * Only the sections the SDK relies on are typed; the document carries many more (telemetry, power, physical interface,
 * ...) whose shape varies by device model.
 */
export interface ShadowState {
  /** The heating setpoint section. */
  targetHeat?: ShadowStateSection<ShadowTarget>;
  /** The cooling setpoint section, present on devices that can cool. */
  targetCool?: ShadowStateSection<ShadowTarget>;
  /** The operating mode section. */
  modes?: ShadowStateSection<ShadowModes>;
  /** Any other section returned by the API. */
  [section: string]: unknown;
}

/**
 * The body of a `POST /state/{deviceId}/update` request to Mysa's current backend.
 *
 * Only the sections to change are sent, each with only the fields to change.
 */
export interface ShadowStateUpdate {
  /** Identifies where the change originates. Always 3, which is what the Mysa app sends and reports as "app". */
  source: number;
  /** The heating setpoint to apply. */
  targetHeat?: Pick<ShadowTarget, 'setpoint'>;
  /** The cooling setpoint to apply. */
  targetCool?: Pick<ShadowTarget, 'setpoint'>;
  /** The operating mode to apply. */
  modes?: ShadowModes;
}
