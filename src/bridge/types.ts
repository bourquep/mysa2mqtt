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
 * A source adapter bridges one upstream system (Mysa, Zigbee, Z-Wave, ...) to MQTT / Home Assistant.
 *
 * An adapter owns its connection to the upstream system and the Home Assistant entities it publishes. It is constructed
 * with whatever configuration it needs (typically by {@link buildAdapters}), then driven entirely through this lifecycle
 * by the {@link BridgeManager}: {@link start} once, then {@link stop} on shutdown.
 *
 * Keeping every source behind this small contract is what lets `mysa2mqtt` grow from a single-vendor bridge into a
 * general one — see `docs/GENERAL_BRIDGE.md`.
 */
export interface SourceAdapter {
  /** Stable, machine-readable identifier for the adapter, e.g. `'mysa'`. Used in logs and entity ids. */
  readonly id: string;

  /** Human-readable name for the adapter, e.g. `'Mysa'`. Used in log messages. */
  readonly displayName: string;

  /**
   * Connects to the upstream system and begins bridging its devices to MQTT.
   *
   * Should reject if the adapter cannot start (e.g. authentication failed) so the {@link BridgeManager} can report it.
   *
   * @returns A promise that resolves once the adapter is up and bridging.
   */
  start(): Promise<void>;

  /**
   * Stops bridging and releases all resources (timers, connections, subscriptions), marking its Home Assistant entities
   * unavailable where applicable. Must be safe to call even if {@link start} failed or was never called.
   *
   * @returns A promise that resolves once the adapter has shut down.
   */
  stop(): Promise<void>;
}
