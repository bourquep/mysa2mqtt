import { MsgOutPayload } from '@/types/mqtt/MsgOutPayload';
import { MsgTypeOutPayload } from '@/types/mqtt/MsgTypeOutPayload';
import { OutPayload } from '@/types/mqtt/OutPayload';

/**
 * Type guard function to determine if an OutPayload is a MsgType-based payload.
 *
 * Checks whether the payload uses the legacy MsgType field format for message type identification. This is used to
 * differentiate between different payload structures and ensure proper type narrowing in TypeScript.
 *
 * @param payload - The OutPayload to check
 * @returns True if the payload is a MsgTypeOutPayload, false otherwise
 */
export function isMsgTypeOutPayload(payload: OutPayload): payload is MsgTypeOutPayload {
  return 'MsgType' in payload;
}

/**
 * Type guard function to determine if an OutPayload is a message-based payload.
 *
 * Checks whether the payload uses the newer msg field format for message type identification. This is used to
 * differentiate between different payload structures and ensure proper type narrowing in TypeScript.
 *
 * @param payload - The OutPayload to check
 * @returns True if the payload is a MsgOutPayload, false otherwise
 */
export function isMsgOutPayload(payload: OutPayload): payload is MsgOutPayload {
  return 'msg' in payload;
}
