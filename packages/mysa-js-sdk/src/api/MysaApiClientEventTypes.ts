import { SetPointChange } from '@/api/events/SetPointChange';
import { StateChange } from '@/api/events/StateChange';
import { Status } from '@/api/events/Status';
import { MysaSession } from '@/api/MysaSession';
import { OutPayload } from '@/types/mqtt/OutPayload';

/**
 * Defines the event types and their parameters for the MysaApiClient.
 *
 * This type maps event names to their corresponding parameter arrays, providing type safety for event subscription and
 * emission in the Mysa API client's event system.
 */
export type MysaApiClientEventTypes = {
  /**
   * Event emitted when the session changes.
   *
   * @remarks
   * You should subscribe to this event and persist the session object whenever it changes.
   * @param session - The new session object or undefined if session was cleared.
   */
  sessionChanged: [session: MysaSession | undefined];

  /**
   * Event emitted when a device's status information is updated.
   *
   * This event provides comprehensive status information including temperature readings, operational state, and device
   * health data.
   *
   * @param status - The updated device status information
   */
  statusChanged: [status: Status];

  /**
   * Event emitted when a device's temperature setpoint is changed.
   *
   * This event is triggered when the target temperature for a device is modified, either through user interaction or
   * programmatic control.
   *
   * @param change - Details about the setpoint change including old and new values
   */
  setPointChanged: [change: SetPointChange];

  /**
   * Event emitted when a device's operational state changes.
   *
   * This event is triggered when device parameters such as mode, brightness, or other operational settings are
   * modified.
   *
   * @param change - Details about the state change including affected parameters
   */
  stateChanged: [change: StateChange];

  /**
   * Event emitted when a raw MQTT message is received from devices.
   *
   * This low-level event provides access to the unprocessed MQTT payload for advanced use cases that require direct
   * access to the raw device data.
   *
   * @param message - The raw outgoing MQTT payload from the device
   */
  rawRealtimeMessageReceived: [message: OutPayload];
};
