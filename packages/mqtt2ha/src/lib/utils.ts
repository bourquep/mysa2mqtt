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
 * Returns a string that is safe to use as an MQTT topic by removing invalid characters. Replaces any character that is
 * not alphanumeric, underscore, or hyphen with a hyphen. This ensures the resulting string is valid for use in MQTT
 * topic paths.
 *
 * @example
 *
 * ```typescript
 * cleanString('Living Room/Temp'); // returns "Living-Room-Temp"
 * cleanString('Sensor#1'); // returns "Sensor-1"
 * ```
 *
 * @param raw - The string to be cleaned
 * @returns A cleaned string containing only alphanumeric characters, underscores, and hyphens
 */
export function cleanString(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, '-');
}
