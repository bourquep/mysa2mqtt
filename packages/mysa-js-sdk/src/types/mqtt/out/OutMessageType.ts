/**
 * Enumeration of message types for outgoing MQTT messages from devices to clients.
 *
 * These message types identify different kinds of status updates, notifications, and data reports that Mysa devices can
 * send via MQTT. The enum values correspond to specific numeric identifiers used in the MQTT protocol.
 */
export enum OutMessageType {
  //
  // When the message type is reported in the `MsgType` field of the payload.
  //

  /** Version 1 device status report with basic device information */
  DEVICE_V1_STATUS = 0,

  /** Notification that a device's temperature setpoint has been changed */
  DEVICE_SETPOINT_CHANGE = 1,

  /** Device log entry or diagnostic information */
  DEVICE_LOG = 4,

  /** Notification sent when a device completes its boot sequence */
  DEVICE_POST_BOOT = 10,

  //
  // When the message type is reported in the `msg` field of the payload.
  //

  /** Version 2 device status report with enhanced device information */
  DEVICE_V2_STATUS = 40,

  /** Notification that a device's operational state has changed */
  DEVICE_STATE_CHANGE = 44
}
