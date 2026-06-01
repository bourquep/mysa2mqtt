/*
mysa2mqtt
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
 * The kind of data an adapter wants to publish, used by {@link OutputPolicy} to decide what may leave the bridge.
 *
 * - `'energy'` — electricity-usage / electrical measurements (power, energy, cost, current, voltage, frequency, …).
 * - `'telemetry'` — any other read-only data (temperature, humidity, charging/plug status, session, host metrics, …).
 * - `'control'` — anything that can change device state (climate command topics, switches, numbers, buttons, …).
 */
export type OutputCategory = 'energy' | 'telemetry' | 'control';

/**
 * The bridge-wide output policy — the "safety switch".
 *
 * In **energy-only** mode the bridge is guaranteed to publish nothing but electricity-usage data: no control surface
 * and no non-energy telemetry ever reach MQTT. Adapters consult this before creating any entity or registering any
 * command handler, so the guarantee holds across every current and future source. In the default (unrestricted) mode
 * everything is allowed and adapters behave as fully featured.
 */
export class OutputPolicy {
  /** @param energyOnly - When true, only `'energy'` output is permitted. */
  constructor(private readonly energyOnly: boolean = false) {}

  /**
   * Creates an unrestricted policy (the default; allows energy, telemetry, and control).
   *
   * @returns A permissive policy.
   */
  static unrestricted(): OutputPolicy {
    return new OutputPolicy(false);
  }

  /** @returns Whether the bridge is restricted to energy-only output. */
  get isEnergyOnly(): boolean {
    return this.energyOnly;
  }

  /**
   * Determines whether output of the given category may be published.
   *
   * @param category - The category of output.
   * @returns `true` if the category is permitted under the current policy.
   */
  allows(category: OutputCategory): boolean {
    return this.energyOnly ? category === 'energy' : true;
  }

  /** @returns Whether non-energy telemetry (temperature, humidity, status, …) may be published. */
  get allowsTelemetry(): boolean {
    return this.allows('telemetry');
  }

  /** @returns Whether control (command) entities may be created. */
  get allowsControl(): boolean {
    return this.allows('control');
  }
}
