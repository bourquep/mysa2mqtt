import { MqttPublishError, MysaApiError } from '@/api/Errors';
import { MysaApiClient } from '@/api/MysaApiClient';
import { Devices } from '@/types/rest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const BB_ID = 'bb0000000001';
const AC_ID = 'ac0000000001';

const DEVICES: Devices = {
  DevicesObj: {
    [BB_ID]: { Id: BB_ID, Model: 'BB-V1-1' },
    [AC_ID]: { Id: AC_ID, Model: 'AC-V1-0' }
  }
} as unknown as Devices;

/** The private members the tests stub, so no Cognito login or AWS IoT connection is ever attempted. */
interface ClientInternals {
  _getFreshSession: () => Promise<unknown>;
  _getMqttConnection: () => Promise<unknown>;
  _publishWithRetry: (...args: unknown[]) => Promise<void>;
  _cognitoUser?: unknown;
}

/** The error the AWS IoT SDK reports when the broker drops the connection in response to a forbidden publish. */
const rejectedPublish = () =>
  new MqttPublishError(
    'MQTT publish failed after 1 attempts',
    1,
    new Error('Failed to publish: AWS_ERROR_MQTT_CANCELLED_FOR_CLEAN_SESSION')
  );

/** The error left after every retry of a publish that kept timing out. */
const transientPublishFailure = () =>
  new MqttPublishError('MQTT publish failed after 5 attempts', 5, { error_name: 'AWS_ERROR_MQTT_TIMEOUT' });

interface FetchCall {
  url: string;
  method: string;
  body?: unknown;
  authorization?: string;
}

function setup(options: { shadowMode?: number; updateStatus?: number } = {}) {
  const calls: FetchCall[] = [];

  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = input.toString();
    const headers = new Headers(init?.headers);
    calls.push({
      url,
      method: init?.method ?? 'GET',
      body: init?.body ? JSON.parse(init.body as string) : undefined,
      authorization: headers.get('Authorization') ?? undefined
    });

    if (url.endsWith('/devices')) {
      return Response.json(DEVICES);
    }
    if (url.endsWith('/update')) {
      return Response.json({ message: 'ok' }, { status: options.updateStatus ?? 200 });
    }
    if (url.includes('/state/')) {
      return Response.json({ modes: { desired: { mode: 4 }, reported: { mode: options.shadowMode ?? 4 } } });
    }
    return new Response(null, { status: 404 });
  });

  const client = new MysaApiClient({ username: 'user@example.com', password: 'password' }, { fetcher });
  const internals = client as unknown as ClientInternals;

  internals._cognitoUser = { getUsername: () => 'user-id' };
  vi.spyOn(internals, '_getFreshSession').mockResolvedValue({
    getIdToken: () => ({ getJwtToken: () => 'id-token' })
  });

  const connection = { subscribe: vi.fn().mockResolvedValue({}), unsubscribe: vi.fn().mockResolvedValue({}) };
  vi.spyOn(internals, '_getMqttConnection').mockResolvedValue(connection);
  const publish = vi.spyOn(internals, '_publishWithRetry').mockResolvedValue();

  const restUpdates = () => calls.filter((call) => call.url.endsWith('/update'));

  return { client, publish, calls, restUpdates };
}

describe('MysaApiClient.setDeviceState', () => {
  it('sends commands over MQTT when the broker accepts them', async () => {
    const { client, publish, restUpdates } = setup();

    await client.setDeviceState(BB_ID, 21);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][1]).toBe(`/v1/dev/${BB_ID}/in`);
    expect(restUpdates()).toEqual([]);
  });

  it('falls back to the REST API when the broker rejects the command', async () => {
    const { client, publish, restUpdates } = setup();
    publish.mockRejectedValueOnce(rejectedPublish());

    await client.setDeviceState(BB_ID, 5.5);

    expect(restUpdates()).toEqual([
      {
        url: `https://mysa-backend.mysa.cloud/state/${BB_ID}/update`,
        method: 'POST',
        body: { source: 3, targetHeat: { setpoint: 5.5 } },
        authorization: 'id-token'
      }
    ]);
  });

  it('sends later commands for a rejecting device straight to the REST API', async () => {
    const { client, publish, restUpdates } = setup();
    publish.mockRejectedValueOnce(rejectedPublish());

    await client.setDeviceState(BB_ID, 5.5);
    await client.setDeviceState(BB_ID, undefined, 'off');

    expect(publish).toHaveBeenCalledTimes(1);
    expect(restUpdates().map((call) => call.body)).toEqual([
      { source: 3, targetHeat: { setpoint: 5.5 } },
      { source: 3, modes: { mode: 0 } }
    ]);
  });

  it('keeps using MQTT after a merely transient failure', async () => {
    const { client, publish, restUpdates } = setup();
    publish.mockRejectedValueOnce(transientPublishFailure());

    await client.setDeviceState(BB_ID, 20);
    await client.setDeviceState(BB_ID, 21);

    expect(publish).toHaveBeenCalledTimes(2);
    expect(restUpdates()).toHaveLength(1);
  });

  it('falls back to the REST API when no MQTT connection can be established', async () => {
    const { client, restUpdates } = setup();
    vi.spyOn(client as unknown as ClientInternals, '_getMqttConnection').mockRejectedValueOnce(new Error('offline'));

    await client.setDeviceState(BB_ID, 19, 'heat');

    expect(restUpdates().map((call) => call.body)).toEqual([
      { source: 3, modes: { mode: 4 }, targetHeat: { setpoint: 19 } }
    ]);
  });

  it('does not fall back for a fan speed change, which has no REST equivalent', async () => {
    const { client, publish, restUpdates } = setup();
    publish.mockRejectedValueOnce(rejectedPublish());

    await expect(client.setDeviceState(AC_ID, undefined, undefined, 'auto')).rejects.toBeInstanceOf(MqttPublishError);
    expect(restUpdates()).toEqual([]);
  });

  it('still sends a fan speed change over MQTT for a rejecting device', async () => {
    const { client, publish } = setup();
    publish.mockRejectedValueOnce(rejectedPublish());

    await client.setDeviceState(AC_ID, 22);
    await client.setDeviceState(AC_ID, undefined, undefined, 'auto');

    expect(publish).toHaveBeenCalledTimes(2);
  });

  it('reads the current mode of a cooling-capable device to pick the set point section', async () => {
    const { client, publish, calls, restUpdates } = setup({ shadowMode: 3 });
    publish.mockRejectedValueOnce(rejectedPublish());

    await client.setDeviceState(AC_ID, 23);

    expect(calls.some((call) => call.method === 'GET' && call.url.endsWith(`/state/${AC_ID}`))).toBe(true);
    expect(restUpdates().map((call) => call.body)).toEqual([{ source: 3, targetCool: { setpoint: 23 } }]);
  });

  it('does not read the current state of a heating-only device', async () => {
    const { client, publish, calls } = setup();
    publish.mockRejectedValueOnce(rejectedPublish());

    await client.setDeviceState(BB_ID, 23);

    expect(calls.filter((call) => call.method === 'GET' && call.url.includes('/state/'))).toEqual([]);
  });

  it('reports a failed REST update', async () => {
    const { client, publish } = setup({ updateStatus: 500 });
    publish.mockRejectedValueOnce(rejectedPublish());

    await expect(client.setDeviceState(BB_ID, 21)).rejects.toBeInstanceOf(MysaApiError);
  });
});

describe('MysaApiClient.startRealtimeUpdates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops sending keep-alive requests to a device whose topic rejects publishes', async () => {
    const { client, publish, restUpdates } = setup();
    publish.mockRejectedValueOnce(rejectedPublish());

    await client.startRealtimeUpdates(BB_ID);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(publish).toHaveBeenCalledTimes(1);

    // The rejection seen by the status request also routes commands to the REST API.
    await client.setDeviceState(BB_ID, 21);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(restUpdates()).toHaveLength(1);

    await client.stopRealtimeUpdates(BB_ID);
  });

  it('keeps sending keep-alive requests to a device that accepts them', async () => {
    const { client, publish } = setup();

    await client.startRealtimeUpdates(BB_ID);
    await vi.advanceTimersByTimeAsync(15 * 60 * 1000);

    expect(publish).toHaveBeenCalledTimes(4);

    await client.stopRealtimeUpdates(BB_ID);
  });
});
