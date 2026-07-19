/**
 * Enumeration of message types for incoming MQTT messages from clients to devices.
 *
 * These message types determine how commands and requests are interpreted by Mysa devices. The enum values correspond
 * to specific numeric identifiers used in the MQTT protocol.
 */
export enum InMessageType {
  //
  // When the message type is reported in the `MsgType` field of the payload.
  //

  /** Request to check and retrieve current device settings */
  CHECK_DEVICE_SETTINGS = 6,

  /** Command to start publishing periodic device status updates */
  START_PUBLISHING_DEVICE_STATUS = 11,

  //
  // When the message type is reported in the `msg` field of the payload.
  //

  /** Command to change the current state of a device (temperature, mode, etc.) */
  CHANGE_DEVICE_STATE = 44
}
