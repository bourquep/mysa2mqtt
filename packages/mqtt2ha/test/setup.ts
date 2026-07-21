import { beforeEach, vi } from 'vitest';

/** A single MQTT publish captured by the fake client. The payload is stored exactly as the client received it. */
export interface Published {
  topic: string;
  payload: string | Buffer;
  opts?: Record<string, unknown>;
}

/**
 * A minimal in-memory stand-in for the `mqtt` client. It records everything published, tracks subscriptions, and lets
 * tests drive the client's event handlers (`connect`, `message`, ...) synchronously.
 */
export class FakeMqttClient {
  readonly options: Record<string, unknown>;
  /** Every publish (async and sync) in one chronological history. */
  readonly publishes: Published[] = [];
  readonly subscriptions: string[] = [];
  private readonly handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }

  async publishAsync(topic: string, payload: string | Buffer, opts?: Record<string, unknown>) {
    this.publishes.push({ topic, payload, opts });
  }

  publish(topic: string, payload: string | Buffer, opts?: Record<string, unknown>) {
    this.publishes.push({ topic, payload, opts });
    return this;
  }

  async subscribeAsync(topic: string) {
    this.subscriptions.push(topic);
  }

  /** Fires every handler registered for `event`. */
  emit(event: string, ...args: unknown[]) {
    (this.handlers[event] ?? []).forEach((handler) => handler(...args));
  }

  /** Simulates the broker connection being established. */
  connect() {
    this.emit('connect');
  }

  /** Delivers an inbound command message on `topic`. */
  deliver(topic: string, message: string) {
    this.emit('message', topic, Buffer.from(message));
  }

  /** Every publish that targeted `topic`, oldest first, with payloads preserved as received. */
  publishesFor(topic: string): Published[] {
    return this.publishes.filter((p) => p.topic === topic);
  }

  /** The most recent payload published to `topic` as text, or `undefined` if none. */
  lastPayload(topic: string): string | undefined {
    const payload = this.publishesFor(topic).at(-1)?.payload;
    return payload === undefined ? undefined : payload.toString();
  }
}

/** Every fake client created since the last `beforeEach` reset, in creation order. */
export const createdClients: FakeMqttClient[] = [];

vi.mock('mqtt', () => ({
  connect: (options: Record<string, unknown>) => {
    const client = new FakeMqttClient(options);
    createdClients.push(client);
    return client;
  }
}));

beforeEach(() => {
  createdClients.length = 0;
});
