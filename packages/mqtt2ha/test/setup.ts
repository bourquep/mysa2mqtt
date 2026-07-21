import { beforeEach, vi } from 'vitest';

/** A single MQTT publish captured by the fake client. */
export interface Published {
  topic: string;
  payload: string;
  opts?: Record<string, unknown>;
}

function toStringPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload;
  }
  if (Buffer.isBuffer(payload)) {
    return payload.toString();
  }
  return JSON.stringify(payload);
}

/**
 * A minimal in-memory stand-in for the `mqtt` client. It records everything published, tracks subscriptions, and lets
 * tests drive the client's event handlers (`connect`, `message`, ...) synchronously.
 */
export class FakeMqttClient {
  readonly options: Record<string, unknown>;
  readonly published: Published[] = [];
  readonly publishedSync: Published[] = [];
  readonly subscriptions: string[] = [];
  private readonly handlers: Record<string, Array<(...args: unknown[]) => void>> = {};

  constructor(options: Record<string, unknown>) {
    this.options = options;
  }

  on(event: string, handler: (...args: unknown[]) => void) {
    (this.handlers[event] ??= []).push(handler);
    return this;
  }

  async publishAsync(topic: string, payload: unknown, opts?: Record<string, unknown>) {
    this.published.push({ topic, payload: toStringPayload(payload), opts });
  }

  publish(topic: string, payload: unknown, opts?: Record<string, unknown>) {
    this.publishedSync.push({ topic, payload: toStringPayload(payload), opts });
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

  /** Every publish (async and sync) that targeted `topic`, oldest first. */
  publishesFor(topic: string): Published[] {
    return [...this.published, ...this.publishedSync].filter((p) => p.topic === topic);
  }

  /** The most recent payload published to `topic`, or `undefined` if none. */
  lastPayload(topic: string): string | undefined {
    return this.publishesFor(topic).at(-1)?.payload;
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
