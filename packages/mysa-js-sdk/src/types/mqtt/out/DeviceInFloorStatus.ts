import { MsgPayload } from '../MsgBasePayload';
import { OutMessageType } from './OutMessageType';

/**
 * Interface representing a periodic status report from a Mysa in-floor heating thermostat.
 *
 * In-floor units (`INF-V1-0`) publish their telemetry every few seconds as message type 17 rather than the
 * {@link DeviceV2Status} (type 40) sent by baseboard devices. The body carries the same ambient readings plus the
 * floor-probe temperature and the binary heating-relay state.
 */
export interface DeviceInFloorStatus extends MsgPayload<OutMessageType.DEVICE_IN_FLOOR_STATUS> {
  /** Source information identifying the device sending the status */
  src: {
    /** Reference identifier for the device */
    ref: string;
    /** Type identifier for the source device */
    type: number;
  };
  /** Status data payload containing current device measurements and settings */
  body: {
    /** Ambient temperature reading from the device sensor (°C) */
    ambTemp: number;
    /** Floor-probe temperature reading (°C) */
    flrSnsrTemp?: number;
    /** Relative humidity percentage */
    hum: number;
    /** Current temperature setpoint (°C) */
    stpt: number;
    /** Binary heating-relay state (0 = off, 1 = energized) */
    heatStat?: number;
    /**
     * Reported duty cycle. Observed to stay pinned at a constant value regardless of the relay state on this message
     * type, so {@link heatStat} is the reliable indicator of whether the device is heating.
     */
    dutyCycle?: number;
    /** Which sensor the thermostat regulates against (3 = floor probe, 5 = ambient air) */
    trackedSnsr?: number;
    /** Line voltage (V) */
    lineVtg?: number;
  };
}
