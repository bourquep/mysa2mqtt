/*
mqtt2ha
Copyright (C) 2025 Pascal Bourque

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
  return raw.replace(/[^A-Za-z0-9_]/g, (char) => {
    const bytes = new TextEncoder().encode(char);
    let escaped = '';
    for (let i = 0; i < bytes.length; i++) {
      escaped += `-${bytes[i].toString(16).toUpperCase().padStart(2, '0')}`;
    }
    return escaped;
  });
}
