/**
 * Union type representing the temperature sensor an in-floor heating thermostat regulates against.
 *
 * In-floor units (`INF-V1-0`) carry both an ambient air sensor in the wall unit and a probe embedded in the floor. The
 * Mysa app lets the owner pick which one drives the setpoint, and the device echoes that choice back in its status
 * messages as the raw `trackedSnsr` field.
 */
export type MysaTrackedSensor = 'ambient' | 'floor';
