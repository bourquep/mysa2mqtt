/*
mqtt2ha
Copyright (C) 2025-2026 Pascal Bourque

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Returns a string that is safe to use as an MQTT topic and as a Home Assistant discovery `node_id`/`object_id` by
 * escaping every character that is not alphanumeric or an underscore. This is a reversible, collision-free encoding:
 * unsupported characters (including a literal hyphen) are percent-style escaped as `-XX`, where `XX` is the uppercase
 * hex value of each UTF-8 byte. A hyphen is used as the escape sigil rather than `%` because Home Assistant only
 * accepts `[A-Za-z0-9_-]` in discovery ids.
 *
 * Because the encoding is injective, distinct inputs always produce distinct outputs, so entities whose names differ
 * only in punctuation no longer collide onto the same discovery topic.
 *
 * @example
 *
 * ```typescript
 * cleanString('Living Room/Temp'); // returns "Living-20Room-2FTemp"
 * cleanString('Sensor#1'); // returns "Sensor-231"
 * cleanString('a/b'); // returns "a-2Fb"
 * cleanString('a b'); // returns "a-20b" (no longer collides with 'a/b')
 * ```
 *
 * @param raw - The string to be cleaned
 * @returns A cleaned string containing only alphanumeric characters, underscores, and hyphens
 */
export function cleanString(raw: string): string {
  // Encode the whole string to UTF-8 up front so surrogate pairs (astral code
  // points such as emoji) resolve correctly before escaping; matching per
  // UTF-16 code unit would split them and collapse every astral character to
  // the same replacement-byte sequence, reintroducing collisions.
  const bytes = new TextEncoder().encode(raw);
  let result = '';
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    const isSafe =
      (byte >= 0x30 && byte <= 0x39) || // 0-9
      (byte >= 0x41 && byte <= 0x5a) || // A-Z
      (byte >= 0x61 && byte <= 0x7a) || // a-z
      byte === 0x5f; // _
    result += isSafe ? String.fromCharCode(byte) : `-${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return result;
}

/**
 * Wraps an async function so that its invocations run one at a time, in call order. Each call waits for the previous
 * one to settle before starting, turning overlapping calls into a serial queue.
 *
 * This is used to serialize command handling per component: a component that awaits a device command before publishing
 * its confirmed state could otherwise let an older command publish after a newer one (a slow command completing last),
 * leaving Home Assistant showing a stale state. Serializing guarantees each command is fully applied and published
 * before the next one begins.
 *
 * A rejection from one call is isolated so it does not wedge the queue: the returned promise still rejects (so the
 * caller can observe and log the failure), but the internal chain swallows it so later calls keep running.
 *
 * @param fn - The async function to serialize
 * @returns A function with the same signature whose calls are queued and run sequentially
 */
export function serializeAsync<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  let tail: Promise<unknown> = Promise.resolve();
  return (...args: TArgs) => {
    const run = tail.then(() => fn(...args));
    tail = run.catch(() => undefined);
    return run;
  };
}
