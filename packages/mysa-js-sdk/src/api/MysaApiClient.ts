import { MysaCredentials } from '@/api/MysaCredentials';
import { EventEmitter } from '@/lib/EventEmitter';
import { parseMqttPayload, serializeMqttPayload } from '@/lib/PayloadParser';
import { isMsgOutPayload, isMsgTypeOutPayload } from '@/lib/PayloadTypeGuards';
import { ChangeDeviceState } from '@/types/mqtt/in/ChangeDeviceState';
import { InMessageType } from '@/types/mqtt/in/InMessageType';
import { StartPublishingDeviceStatus } from '@/types/mqtt/in/StartPublishingDeviceStatus';
import { OutMessageType } from '@/types/mqtt/out/OutMessageType';
import { DeviceBase, Devices, DeviceStates, Firmwares, Homes } from '@/types/rest';
import { DescribeThingCommand, IoTClient } from '@aws-sdk/client-iot';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { AuthenticationDetails, CognitoUser, CognitoUserPool, CognitoUserSession } from 'amazon-cognito-identity-js';
import { auth, iot, mqtt } from 'aws-iot-device-sdk-v2';
import { hash } from 'crypto';
import dayjs, { Dayjs } from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import { customAlphabet } from 'nanoid';
import {
  MqttPublishError,
  MysaApiError,
  UnauthenticatedError,
  UnknownDeviceError,
  UnsupportedFanSpeedError
} from './Errors';
import { Logger, VoidLogger } from './Logger';
import { MysaApiClientEventTypes } from './MysaApiClientEventTypes';
import { MysaApiClientOptions } from './MysaApiClientOptions';
import { MysaDeviceMode, MysaFanSpeedMode } from './MysaDeviceMode';

dayjs.extend(duration);

const getRandomClientId = customAlphabet('1234567890abcdefghijklmnopqrstuvwxyz', 8);

/** Options for MQTT publish operations. */
export interface MqttPublishOptions {
  /** Maximum number of publish attempts before failing (default: 5). */
  maxAttempts?: number;
  /** Base delay in milliseconds used for exponential backoff calculation (default: 500). */
  baseDelayMs?: number;
}

const AwsRegion = 'us-east-1';
const CognitoUserPoolId = 'us-east-1_GUFWfhI7g';
const CognitoClientId = '19efs8tgqe942atbqmot5m36t3';
const CognitoIdentityPoolId = 'us-east-1:ebd95d52-9995-45da-b059-56b865a18379';
const CognitoLoginKey = `cognito-idp.${AwsRegion}.amazonaws.com/${CognitoUserPoolId}`;
const MqttEndpoint = 'a3q27gia9qg3zy-ats.iot.us-east-1.amazonaws.com';
const MysaApiBaseUrl = 'https://app-prod.mysa.cloud';
const RealtimeKeepAliveInterval = dayjs.duration(5, 'minutes');
const PublishAckTimeout = dayjs.duration(30, 'seconds');

/** Rolling window over which MQTT interrupts are counted for storm detection. */
const MqttInterruptWindow = dayjs.duration(30, 'seconds');
/** Number of interrupts within {@link MqttInterruptWindow} that triggers a forced connection reset. */
const MqttInterruptThreshold = 3;
/** Base delay for exponential backoff between consecutive forced MQTT resets. */
const MqttResetBaseDelay = dayjs.duration(1, 'second');
/** Maximum delay between consecutive forced MQTT resets. */
const MqttResetMaxDelay = dayjs.duration(30, 'seconds');
/** How long a connection must stay interrupt-free before the consecutive-reset counter is cleared. */
const MqttStabilityWindow = dayjs.duration(60, 'seconds');

/** Canonical fan-speed order, matching the positional layout of a device's `SupportedCaps.fanSpeeds`. */
const CanonicalFanSpeedOrder: MysaFanSpeedMode[] = ['auto', 'low', 'medium', 'high', 'max'];

/** Universal fan-speed `fn` mapping used when a device does not report its own `SupportedCaps.fanSpeeds`. */
const LegacyFanSpeedSendMap: Record<MysaFanSpeedMode, number> = { auto: 1, low: 3, medium: 5, high: 7, max: 8 };

/**
 * Receive-side `fn`-to-fan-speed mapping. Includes both the legacy universal values (3/5/7) and the AC-V1-X
 * CodeNum=1117 canonical values (2/4/6); the latter are unused by legacy devices, so there is no conflict.
 */
const FanSpeedReceiveMap: Record<number, MysaFanSpeedMode> = {
  1: 'auto',
  2: 'low', // CodeNum=1117 canonical low
  3: 'low', // legacy
  4: 'medium', // CodeNum=1117 canonical medium
  5: 'medium', // legacy
  6: 'high', // CodeNum=1117 canonical high
  7: 'high', // legacy
  8: 'max'
};

/**
 * Builds the send-side fan-speed `fn` mapping for a device.
 *
 * When the device reports `SupportedCaps.fanSpeeds`, its values are zipped positionally with
 * {@link CanonicalFanSpeedOrder} (e.g. `[1, 2, 4, 6]` → `{ auto: 1, low: 2, medium: 4, high: 6 }`). Otherwise the
 * {@link LegacyFanSpeedSendMap} is used, preserving backward compatibility.
 *
 * @param device - The device to build the mapping for.
 * @returns A partial map from fan-speed mode to the device-specific `fn` value.
 */
function buildFanSpeedSendMap(device: DeviceBase): Partial<Record<MysaFanSpeedMode, number>> {
  const fanSpeeds = device.SupportedCaps?.fanSpeeds;
  if (!fanSpeeds || fanSpeeds.length === 0) {
    return LegacyFanSpeedSendMap;
  }

  const map: Partial<Record<MysaFanSpeedMode, number>> = {};
  CanonicalFanSpeedOrder.forEach((name, index) => {
    if (index < fanSpeeds.length) {
      map[name] = fanSpeeds[index];
    }
  });
  return map;
}

/**
 * Main client for interacting with the Mysa API and real-time device communication.
 *
 * The MysaApiClient provides a comprehensive interface for authenticating with Mysa services, managing device data, and
 * receiving real-time updates from Mysa thermostats and heating devices. It handles both REST API calls for device
 * management and MQTT connections for live status updates and control commands.
 *
 * @example
 *
 * ```typescript
 * const client = new MysaApiClient({ username: 'user@example.com', password: 'password' });
 *
 * await client.login();
 * const devices = await client.getDevices();
 *
 * client.emitter.on('statusChanged', (status) => {
 *   console.log(`Device ${status.deviceId} temperature: ${status.temperature}°C`);
 * });
 *
 * for (const device of Object.entries(devices.DevicesObj)) {
 *   await client.startRealtimeUpdates(device[0]);
 * }
 * ```
 */
export class MysaApiClient {
  /** The credentials of the Mysa account this client authenticates as. */
  private _credentials: MysaCredentials;

  /** The current session object, if any. */
  private _cognitoUserSession?: CognitoUserSession;

  /** The current user object, if any. */
  private _cognitoUser?: CognitoUser;

  /** The in-flight session acquisition, if any, so that concurrent callers share a single refresh or login. */
  private _freshSessionPromise?: Promise<CognitoUserSession>;

  /** The logger instance used by the client. */
  private _logger: Logger;

  /** The fetcher function used by the client. */
  private _fetcher: typeof fetch;

  /** A promise that resolves to the MQTT connection used for real-time updates. */
  private _mqttConnectionPromise?: Promise<mqtt.MqttClientConnection>;

  /** Stable per-process MQTT client id (prevents collisions between multiple processes). */
  private _mqttClientId?: string;

  /** Expiration time of the credentials currently in use by the MQTT client. */
  private _mqttCredentialsExpiration?: Dayjs;

  /** Interrupt timestamps for storm / collision detection. */
  private _mqttInterrupts: number[] = [];

  /** Whether a forced MQTT reset is currently in progress (guards against re-entrancy). */
  private _mqttResetInProgress = false;

  /** Monotonic id of the current MQTT connection; used to ignore events from discarded connections. */
  private _mqttGeneration = 0;

  /** Consecutive forced resets without an intervening stable period; drives reset backoff. */
  private _mqttConsecutiveResets = 0;

  /** Timestamp (ms) of the most recent successful MQTT (re)connect, for interrupt dwell-time diagnostics. */
  private _mqttLastConnectionSuccessAt?: number;

  /** Timer that clears the consecutive-reset counter once a connection stays healthy. */
  private _mqttStabilityTimer?: NodeJS.Timeout;

  /** The device IDs that are currently being updated in real-time, mapped to their respective timeouts. */
  private _realtimeDeviceIds: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Raw topic filters registered via {@link startRawTopicCapture}, mapped to their message handlers. Re-subscribed on
   * every reconnect so a debug capture survives connection resets.
   */
  private _rawTopicCaptures: Map<string, (topic: string, payload: string) => void> = new Map();

  /** The cached devices object, if any. */
  private _cachedDevices?: Devices;

  /**
   * Event emitter for client events.
   *
   * @see {@link MysaApiClientEventTypes} for the possible events and their payloads.
   */
  readonly emitter = new EventEmitter<MysaApiClientEventTypes>();

  /**
   * Constructs a new instance of the MysaApiClient.
   *
   * @param credentials - The credentials of the Mysa account to authenticate as.
   * @param options - The options for the client.
   */
  constructor(credentials: MysaCredentials, options?: MysaApiClientOptions) {
    this._credentials = credentials;
    this._logger = options?.logger || new VoidLogger();
    this._fetcher = options?.fetcher || fetch;
  }

  /**
   * Ensures the client has a usable session, logging in with the credentials it was constructed with if needed.
   *
   * Calling this method is optional: the client authenticates on demand before its first API call, and re-authenticates
   * on its own whenever its session can no longer be refreshed. Call it explicitly at startup to fail fast on invalid
   * credentials instead of on the first API call. It is a no-op when the current session is still usable.
   *
   * @example
   *
   * ```typescript
   * try {
   *   await client.login();
   *   console.log('Login successful!');
   * } catch (error) {
   *   console.error('Login failed:', error.message);
   * }
   * ```
   *
   * @throws {@link UnauthenticatedError} When authentication fails due to invalid credentials or network issues.
   */
  async login(): Promise<void> {
    // Goes through _getFreshSession so that an explicit login shares any acquisition already in flight instead of
    // racing a concurrent API call into a second Cognito login.
    await this._getFreshSession();
  }

  /**
   * Authenticates with Mysa's Cognito user pool and replaces the current session, if any.
   *
   * @returns A promise that resolves to the newly established session.
   * @throws {@link Error} When authentication fails due to invalid credentials or network issues.
   */
  private _login(): Promise<CognitoUserSession> {
    this._cognitoUser = undefined;
    this._cognitoUserSession = undefined;
    this._mqttClientId = undefined;
    this._mqttInterrupts = [];
    this._mqttConsecutiveResets = 0;

    const { username, password } = this._credentials;

    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: username,
        Pool: new CognitoUserPool({ UserPoolId: CognitoUserPoolId, ClientId: CognitoClientId })
      });

      user.authenticateUser(new AuthenticationDetails({ Username: username, Password: password }), {
        onSuccess: (session) => {
          this._cognitoUser = user;
          this._cognitoUserSession = session;

          resolve(session);
        },
        onFailure: (err) => {
          reject(err);
        }
      });
    });
  }

  /**
   * Retrieves the list of devices associated with the user.
   *
   * This method fetches all Mysa devices linked to the authenticated user's account, including device information such
   * as models, locations, and configuration details.
   *
   * @example
   *
   * ```typescript
   * const devices = await client.getDevices();
   * for (const [deviceId, device] of Object.entries(devices.DevicesObj)) {
   *   console.log(`Device: ${device.DisplayName} (${device.Model})`);
   * }
   * ```
   *
   * @returns A promise that resolves to the list of devices.
   * @throws {@link MysaApiError} When the API request fails.
   * @throws {@link UnauthenticatedError} When the client cannot authenticate with its credentials.
   */
  async getDevices(): Promise<Devices> {
    this._logger.debug(`Fetching devices...`);

    const session = await this._getFreshSession();

    const response = await this._fetcher(`${MysaApiBaseUrl}/devices`, {
      headers: {
        Authorization: `${session.getIdToken().getJwtToken()}`
      }
    });

    if (!response.ok) {
      throw new MysaApiError(response);
    }

    return response.json();
  }

  /**
   * Retrieves the serial number for a specific device.
   *
   * This method uses AWS IoT's DescribeThing API to fetch the serial number attribute for the specified device. This
   * requires additional AWS IoT permissions and may not be available for all devices.
   *
   * @example
   *
   * ```typescript
   * const serialNumber = await client.getDeviceSerialNumber('device123');
   * if (serialNumber) {
   *   console.log(`Device serial: ${serialNumber}`);
   * } else {
   *   console.log('Serial number not available');
   * }
   * ```
   *
   * @param deviceId - The ID of the device to get the serial number for.
   * @returns A promise that resolves to the serial number, or undefined if not found.
   * @throws {@link UnauthenticatedError} When the client cannot authenticate with its credentials.
   */
  async getDeviceSerialNumber(deviceId: string): Promise<string | undefined> {
    this._logger.debug(`Fetching serial number for device ${deviceId}...`);

    const session = await this._getFreshSession();

    // Get AWS credentials for IoT client
    const credentialsProvider = fromCognitoIdentityPool({
      clientConfig: {
        region: AwsRegion
      },
      identityPoolId: CognitoIdentityPoolId,
      logins: {
        [CognitoLoginKey]: session.getIdToken().getJwtToken()
      }
    });

    const credentials = await credentialsProvider();
    const iotClient = new IoTClient({
      region: AwsRegion,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        sessionToken: credentials.sessionToken
      }
    });

    try {
      const command = new DescribeThingCommand({ thingName: deviceId });
      const response = await iotClient.send(command);
      return response.attributes?.['Serial'];
    } catch (error) {
      this._logger.warn(`Could not get serial number for device ${deviceId}:`, error);
      return undefined;
    }
  }

  /**
   * Retrieves firmware information for all devices.
   *
   * @returns A promise that resolves to the firmware information for all devices.
   * @throws {@link MysaApiError} When the API request fails.
   * @throws {@link UnauthenticatedError} When the client cannot authenticate with its credentials.
   */
  async getDeviceFirmwares(): Promise<Firmwares> {
    this._logger.debug(`Fetching device firmwares...`);

    const session = await this._getFreshSession();

    const response = await this._fetcher(`${MysaApiBaseUrl}/devices/firmware`, {
      headers: {
        Authorization: `${session.getIdToken().getJwtToken()}`
      }
    });

    if (!response.ok) {
      throw new MysaApiError(response);
    }

    return response.json();
  }

  /**
   * Retrieves the current state information for all devices.
   *
   * @returns A promise that resolves to the current state of all devices.
   * @throws {@link MysaApiError} When the API request fails.
   * @throws {@link UnauthenticatedError} When the client cannot authenticate with its credentials.
   */
  async getDeviceStates(): Promise<DeviceStates> {
    this._logger.debug(`Fetching device states...`);

    const session = await this._getFreshSession();

    const response = await this._fetcher(`${MysaApiBaseUrl}/devices/state`, {
      headers: {
        Authorization: `${session.getIdToken().getJwtToken()}`
      }
    });

    if (!response.ok) {
      throw new MysaApiError(response);
    }

    return response.json();
  }

  /**
   * Retrieves information about all homes associated with the user.
   *
   * @returns A promise that resolves to the homes information.
   * @throws {@link MysaApiError} When the API request fails.
   * @throws {@link UnauthenticatedError} When the client cannot authenticate with its credentials.
   */
  async getHomes(): Promise<Homes> {
    this._logger.debug(`Fetching homes...`);

    const session = await this._getFreshSession();

    const response = await this._fetcher(`${MysaApiBaseUrl}/homes`, {
      headers: {
        Authorization: `${session.getIdToken().getJwtToken()}`
      }
    });

    if (!response.ok) {
      throw new MysaApiError(response);
    }

    return response.json();
  }

  /**
   * Sets the state of a specific device by sending commands via MQTT.
   *
   * This method allows you to change the temperature set point and/or operating mode of a Mysa device. The command is
   * sent through the MQTT connection for real-time device control.
   *
   * @example
   *
   * ```typescript
   * // Set temperature to 22°C
   * await client.setDeviceState('device123', 22);
   *
   * // Turn device off
   * await client.setDeviceState('device123', undefined, 'off');
   *
   * // Set temperature and mode
   * await client.setDeviceState('device123', 20, 'heat');
   *
   * // Set fan speed
   * await client.setDeviceState('device123', undefined, undefined, 'auto');
   * ```
   *
   * @param deviceId - The ID of the device to control.
   * @param setPoint - The target temperature set point (optional).
   * @param mode - The operating mode to set (one of MysaDeviceMode values, or undefined to leave unchanged).
   * @param fanSpeed - The fan speed mode to set ('low', 'medium', 'high', 'max', 'auto', or undefined to leave
   *   unchanged).
   * @throws {@link UnauthenticatedError} When the client cannot authenticate with its credentials.
   * @throws {@link UnknownDeviceError} When the device id does not match any device on the account.
   * @throws {@link UnsupportedFanSpeedError} When the requested fan speed is not supported by the device.
   * @throws {@link Error} When MQTT connection or command sending fails.
   */
  async setDeviceState(deviceId: string, setPoint?: number, mode?: MysaDeviceMode, fanSpeed?: MysaFanSpeedMode) {
    this._logger.debug(`Setting device state for '${deviceId}'`);

    if (!this._cachedDevices) {
      this._cachedDevices = await this.getDevices();
    }

    // Own-property check: an inherited key such as 'constructor' would otherwise pass the guard below and fail later
    // with a TypeError on device.Model instead of UnknownDeviceError.
    if (!Object.prototype.hasOwnProperty.call(this._cachedDevices.DevicesObj, deviceId)) {
      throw new UnknownDeviceError(deviceId);
    }

    const device = this._cachedDevices.DevicesObj[deviceId];

    // Validate the session before reaching for a possibly cached MQTT connection. _getMqttConnection reuses
    // _mqttConnectionPromise without checking auth, so without this a command could be published on a still-open
    // connection after the session died — with no source ref to attribute it to.
    await this._getFreshSession();

    this._logger.debug(`Initializing MQTT connection...`);
    const mqttConnection = await this._getMqttConnection();

    const now = dayjs();

    this._logger.debug(`Sending request to set device state for '${deviceId}'...`);
    const modeMap = { off: 1, auto: 2, heat: 3, cool: 4, fan_only: 5, dry: 6 };
    const fanSpeedMap = buildFanSpeedSendMap(device);

    // Reject an unsupported fan speed (e.g. 'max' on a device whose SupportedCaps.fanSpeeds only covers auto/low/
    // medium/high) rather than silently publishing fn: undefined, which the caller would perceive as a no-op.
    if (fanSpeed !== undefined && fanSpeedMap[fanSpeed] === undefined) {
      throw new UnsupportedFanSpeedError(deviceId, fanSpeed, Object.keys(fanSpeedMap));
    }

    const payload = serializeMqttPayload<ChangeDeviceState>({
      msg: InMessageType.CHANGE_DEVICE_STATE,
      id: now.valueOf(),
      time: now.unix(),
      ver: '1.0',
      src: {
        ref: this._cognitoUser!.getUsername(),
        type: 100
      },
      dest: {
        ref: deviceId,
        type: 1
      },
      resp: 2,
      body: {
        ver: 1,
        type:
          device.Model.startsWith('BB-V1') || device.Model.startsWith('v1')
            ? 1
            : device.Model.startsWith('AC-V1')
              ? 2
              : device.Model.startsWith('BB-V2')
                ? device.Model.endsWith('-L')
                  ? 5
                  : 4
                : 0,
        cmd: [
          {
            tm: -1,
            sp: setPoint,
            md: mode ? modeMap[mode] : undefined,
            fn: fanSpeed ? fanSpeedMap[fanSpeed] : undefined
          }
        ]
      }
    });

    try {
      await this._publishWithRetry(mqttConnection, `/v1/dev/${deviceId}/in`, payload, mqtt.QoS.AtLeastOnce);
      this._logger.debug(`Device state publish succeeded for '${deviceId}'`);
    } catch (error) {
      this._logger.error(`Failed to set device state for '${deviceId}'`, error);
      throw error;
    }
  }

  /**
   * Starts receiving real-time updates for the specified device.
   *
   * This method establishes an MQTT subscription to receive live status updates from the device, including temperature,
   * humidity, set point changes, and other state information. The client will automatically send keep-alive messages to
   * maintain the connection.
   *
   * @example
   *
   * ```typescript
   * // Start receiving updates and listen for events
   * await client.startRealtimeUpdates('device123');
   *
   * client.emitter.on('statusChanged', (status) => {
   *   console.log(`Temperature: ${status.temperature}°C`);
   * });
   * ```
   *
   * @param deviceId - The ID of the device to start receiving updates for.
   * @throws {@link Error} When MQTT connection or subscription fails.
   */
  async startRealtimeUpdates(deviceId: string) {
    this._logger.info(`Starting real-time updates for device '${deviceId}'`);

    if (this._realtimeDeviceIds.has(deviceId)) {
      this._logger.debug(`Real-time updates for device '${deviceId}' already started`);
      return;
    }

    this._logger.debug(`Initializing MQTT connection...`);
    const mqttConnection = await this._getMqttConnection();

    this._logger.debug(`Subscribing to MQTT topic '/v1/dev/${deviceId}/out'...`);
    await mqttConnection.subscribe(`/v1/dev/${deviceId}/out`, mqtt.QoS.AtLeastOnce, (_, payload) => {
      this._processMqttMessage(payload);
    });

    this._logger.debug(`Sending request to start publishing device status for '${deviceId}'...`);
    const payload = serializeMqttPayload<StartPublishingDeviceStatus>({
      Device: deviceId,
      MsgType: InMessageType.START_PUBLISHING_DEVICE_STATUS,
      Timestamp: dayjs().unix(),
      Timeout: RealtimeKeepAliveInterval.asSeconds()
    });

    // A failed publish request must not abort startup (or, in the keep-alive
    // below, crash the process via an unhandled rejection): the subscription
    // above still delivers the device's autonomous periodic status reports
    // even when the request-driven status stream is unavailable.
    try {
      await this._publishWithRetry(mqttConnection, `/v1/dev/${deviceId}/in`, payload, mqtt.QoS.AtLeastOnce);
    } catch (error) {
      this._logger.warn(`Failed to request status publishing for '${deviceId}'; relying on periodic reports`, error);
    }

    const timer = setInterval(async () => {
      this._logger.debug(`Sending request to keep-alive publishing device status for '${deviceId}'...`);

      try {
        const connection = await this._getMqttConnection();
        const payload = serializeMqttPayload<StartPublishingDeviceStatus>({
          Device: deviceId,
          MsgType: InMessageType.START_PUBLISHING_DEVICE_STATUS,
          Timestamp: dayjs().unix(),
          Timeout: RealtimeKeepAliveInterval.asSeconds()
        });
        await this._publishWithRetry(connection, `/v1/dev/${deviceId}/in`, payload, mqtt.QoS.AtLeastOnce);
      } catch (error) {
        this._logger.warn(`Failed to keep-alive status publishing for '${deviceId}'`, error);
      }
    }, RealtimeKeepAliveInterval.subtract(10, 'seconds').asMilliseconds());

    this._realtimeDeviceIds.set(deviceId, timer);
  }

  /**
   * Stops receiving real-time updates for the specified device.
   *
   * This method unsubscribes from the MQTT topic for the specified device and clears any associated timers to stop the
   * keep-alive messages.
   *
   * @param deviceId - The ID of the device to stop receiving real-time updates for.
   * @throws {@link Error} When MQTT unsubscription fails.
   */
  async stopRealtimeUpdates(deviceId: string) {
    this._logger.info(`Stopping real-time updates for device '${deviceId}'`);

    const timer = this._realtimeDeviceIds.get(deviceId);
    if (!timer) {
      this._logger.warn(`No real-time updates are running for device '${deviceId}'`);
      return;
    }

    this._logger.debug(`Initializing MQTT connection...`);
    const mqttConnection = await this._getMqttConnection();

    this._logger.debug(`Unsubscribing to MQTT topic '/v1/dev/${deviceId}/out'...`);
    await mqttConnection.unsubscribe(`/v1/dev/${deviceId}/out`);

    clearInterval(timer);
    this._realtimeDeviceIds.delete(deviceId);
  }

  /**
   * Subscribes to raw MQTT topic filters and relays every message verbatim.
   *
   * Unlike {@link startRealtimeUpdates}, this performs no parsing, emits no typed events and sends no "start
   * publishing" request to the device — it simply forwards the full message topic and the decoded UTF-8 payload of
   * everything that arrives on the given filters. It exists to reverse-engineer device families the SDK does not model
   * yet, most notably the AWS IoT Device Shadow protocol used by the central-HVAC ST-V1 thermostats, where both the
   * topic (which shadow, and `accepted`/`rejected`/`delta`/`documents`) and the raw JSON body carry the information a
   * new implementation needs.
   *
   * The capture is passive: the device only publishes to its shadow topics when something drives a change (the Mysa
   * mobile app, a schedule, or the device itself), so exercise the thermostat while a capture is running.
   *
   * Registered filters are re-subscribed automatically after a reconnect.
   *
   * @param topicFilters - MQTT topic filters to subscribe to. Wildcards (`+`, `#`) are allowed, subject to the AWS IoT
   *   policy attached to the account's Cognito identity — a filter the policy forbids resolves with a non-zero
   *   `error_code`, which is logged rather than thrown so the remaining filters still subscribe.
   * @param handler - Invoked with the full message topic and the decoded UTF-8 payload for every message received.
   * @throws {@link Error} When the MQTT connection cannot be established.
   */
  async startRawTopicCapture(
    topicFilters: string[],
    handler: (topic: string, payload: string) => void
  ): Promise<void> {
    this._logger.info(`Starting raw topic capture for ${topicFilters.length} filter(s)`);

    const connection = await this._getMqttConnection();
    const decoder = new TextDecoder('utf-8');

    for (const filter of topicFilters) {
      this._rawTopicCaptures.set(filter, handler);
      this._logger.debug(`Subscribing to raw topic filter '${filter}'...`);
      try {
        const result = await connection.subscribe(filter, mqtt.QoS.AtLeastOnce, (topic, payload) => {
          handler(topic, decoder.decode(payload));
        });
        this._logger.debug(
          `Raw subscribe to '${filter}' granted (topic='${result.topic}', qos=${result.qos}, ` +
            `error_code=${result.error_code ?? 0})`
        );
      } catch (error) {
        // A rejected filter (e.g. denied by the IoT policy) must not abort the whole capture: keep the
        // registration so a reconnect retries it, and let the remaining filters subscribe.
        this._logger.warn(`Failed to subscribe to raw topic filter '${filter}'`, error);
      }
    }
  }

  /**
   * Ensures a valid, non-expired session is available.
   *
   * This method checks if the current session is valid and not expired. If the session is expired, it automatically
   * refreshes it using the refresh token. If there is no session yet, or if the refresh token has itself expired or
   * been revoked, the client logs back in with its credentials.
   *
   * Concurrent callers share a single in-flight acquisition, so a burst of API calls never triggers more than one
   * refresh or login.
   *
   * @returns A promise that resolves to a valid CognitoUserSession.
   * @throws {@link UnauthenticatedError} When neither refreshing nor logging back in succeeds.
   */
  private async _getFreshSession(): Promise<CognitoUserSession> {
    if (
      this._cognitoUser &&
      this._cognitoUserSession?.isValid() &&
      dayjs.unix(this._cognitoUserSession.getIdToken().getExpiration()).isAfter()
    ) {
      this._logger.debug('Session is valid, no need to refresh');
      return this._cognitoUserSession;
    }

    this._freshSessionPromise ??= this._acquireFreshSession().finally(() => {
      this._freshSessionPromise = undefined;
    });

    return this._freshSessionPromise;
  }

  /**
   * Refreshes the current session, falling back to a full login when it cannot be refreshed.
   *
   * @returns A promise that resolves to a valid CognitoUserSession.
   * @throws {@link UnauthenticatedError} When logging back in fails.
   */
  private async _acquireFreshSession(): Promise<CognitoUserSession> {
    if (this._cognitoUser && this._cognitoUserSession) {
      this._logger.debug('Session is not valid or expired, refreshing...');

      try {
        return await new Promise<CognitoUserSession>((resolve, reject) => {
          this._cognitoUser!.refreshSession(this._cognitoUserSession!.getRefreshToken(), (error, session) => {
            if (error) {
              reject(error);
            } else {
              this._logger.debug('Session refreshed successfully');
              this._cognitoUserSession = session;
              resolve(session);
            }
          });
        });
      } catch (error) {
        // The refresh token itself expired, was revoked, or was rotated away. Fall through to a full login.
        this._logger.warn('Failed to refresh session, logging back in:', error);
      }
    }

    try {
      this._logger.info('Logging in...');
      return await this._login();
    } catch (error) {
      this._logger.error('Failed to log in:', error);
      throw new UnauthenticatedError('Unable to establish an authentication session.', error);
    }
  }

  /**
   * Establishes and returns an MQTT connection for real-time communication.
   *
   * This method creates a new MQTT connection if one doesn't exist, using AWS IoT WebSocket connections with Cognito
   * credentials. The connection is cached and reused for subsequent calls.
   *
   * @returns A promise that resolves to an active MQTT connection.
   * @throws {@link Error} When connection establishment fails.
   */
  private _getMqttConnection(): Promise<mqtt.MqttClientConnection> {
    if (!this._mqttConnectionPromise) {
      this._mqttConnectionPromise = this._createMqttConnection().catch((err) => {
        this._mqttConnectionPromise = undefined;
        throw err;
      });
    }

    return this._mqttConnectionPromise;
  }

  /**
   * Determines whether an MQTT-related error is considered transient and worth retrying.
   *
   * Transient errors include timeouts, cancelled operations due to clean sessions, temporary connectivity loss, and
   * other recoverable network issues. Fatal errors (auth, permission, configuration) should not be retried at this
   * layer.
   *
   * @param err - The error object thrown by the underlying MQTT operation.
   * @returns True if the error appears transient and a retry should be attempted; false otherwise.
   */
  private _isTransientMqttError(err: unknown): boolean {
    if (!err || typeof err !== 'object') {
      return false;
    }

    const anyErr = err as { error_code?: unknown; error_name?: unknown; error?: unknown; message?: unknown };
    const code = anyErr.error_code || anyErr.error_name || anyErr.error;
    const msg = (anyErr.message || anyErr.error || '').toString();

    const transientMarkers = [
      'AWS_ERROR_MQTT_TIMEOUT',
      'AWS_ERROR_MQTT_NO_CONNECTION',
      'AWS_ERROR_MQTT_UNEXPECTED_HANGUP',
      'UNEXPECTED_HANGUP',
      'AWS_ERROR_MQTT_CONNECTION_DESTROYED',
      'Time limit between request and response',
      'timeout'
    ];

    return transientMarkers.some((m) => (code && String(code).includes(m)) || msg.includes(m));
  }

  /**
   * Publishes an MQTT message with exponential backoff retries for transient failures.
   *
   * Retries occur for errors classified by `_isTransientMqttError`. Between attempts the delay grows exponentially with
   * jitter to avoid thundering herds after broker recovery. If the connection is not currently marked as connected, a
   * reconnect is attempted; if that fails, the connection is rebuilt (fresh credentials) before the next retry.
   *
   * On final failure (after maxAttempts) a {@link MqttPublishError} is thrown including the number of attempts and
   * original error for higher-level handling.
   *
   * @remarks
   * Retry options fields:
   *
   * - MaxAttempts: Maximum number of publish attempts before failing (default: 5).
   * - BaseDelayMs: Base delay in milliseconds used for exponential backoff calculation (default: 500).
   *
   * @param connection - The active MQTT client connection used to send the publish.
   * @param topic - The MQTT topic to publish to.
   * @param payload - The serialized payload (binary buffer or Uint8Array).
   * @param qos - The desired MQTT QoS level for the publish.
   * @param opts - Retry options (defaults: maxAttempts=5, baseDelayMs=500).
   * @returns A promise that resolves when the publish succeeds, or rejects with {@link MqttPublishError}.
   */
  private async _publishWithRetry(
    connection: mqtt.MqttClientConnection,
    topic: string,
    payload: ArrayBuffer | Uint8Array,
    qos: mqtt.QoS,
    opts: MqttPublishOptions = {}
  ): Promise<void> {
    const maxAttempts = opts.maxAttempts ?? 5;
    const baseDelayMs = opts.baseDelayMs ?? 500;

    let attempt = 0;

    while (true) {
      attempt++;
      try {
        // Guard against publishes that never settle: a QoS1 publish the
        // broker silently ignores (e.g. an unauthorized topic) produces no
        // PUBACK and, in practice, no protocol-timeout rejection either —
        // the pending await would otherwise hang this call chain forever.
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(
            () =>
              reject(new Error(`MQTT publish timeout: no acknowledgement within ${PublishAckTimeout.asSeconds()}s`)),
            PublishAckTimeout.asMilliseconds()
          );
          connection.publish(topic, payload, qos).then(
            () => {
              clearTimeout(timer);
              resolve();
            },
            (err) => {
              clearTimeout(timer);
              reject(err);
            }
          );
        });
        return;
      } catch (err) {
        const isTransient = this._isTransientMqttError(err);

        if (!isTransient || attempt >= maxAttempts) {
          throw new MqttPublishError(`MQTT publish failed after ${attempt} attempts`, attempt, err);
        }

        // Apply jitter: delay is randomized between 75% and 125% of the base exponential backoff
        const JITTER_MIN_FACTOR = 0.75;
        const JITTER_RANGE = 0.5;
        const delay = baseDelayMs * Math.pow(2, attempt - 1) * (JITTER_MIN_FACTOR + Math.random() * JITTER_RANGE);

        this._logger.warn(
          `Transient MQTT publish error on '${topic}' (attempt ${attempt}/${maxAttempts}). Retrying in ${Math.round(
            delay
          )}ms`
        );

        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  /**
   * Creates a new MQTT connection using AWS IoT WebSocket connections with Cognito credentials.
   *
   * @returns A promise that resolves to an active MQTT connection.
   * @throws {@link Error} When connection establishment fails.
   */
  private async _createMqttConnection(): Promise<mqtt.MqttClientConnection> {
    const session = await this._getFreshSession();
    const credentialsProvider = fromCognitoIdentityPool({
      clientConfig: {
        region: AwsRegion
      },
      identityPoolId: CognitoIdentityPoolId,
      logins: {
        [CognitoLoginKey]: session.getIdToken().getJwtToken()
      },
      logger: this._logger
    });
    const credentials = await credentialsProvider();

    if (!credentials.expiration) {
      throw new Error('MQTT credentials do not have an expiration time.');
    }

    this._mqttCredentialsExpiration = dayjs(credentials.expiration);

    this._logger.debug(`MQTT credentials expiration: ${this._mqttCredentialsExpiration.format()}`);

    if (!this._mqttCredentialsExpiration.isAfter(dayjs())) {
      this._mqttCredentialsExpiration = undefined;
      throw new Error('MQTT credentials are already expired.');
    }

    // Per-process stable client id. Random suffix avoids collisions with other running processes.
    if (!this._mqttClientId) {
      const username = this._cognitoUser?.getUsername() ?? 'anon';
      const usernameHash = hash('sha1', username);
      this._mqttClientId = `mysa-js-sdk-${usernameHash}-${process.pid}-${getRandomClientId()}`;
    }

    const builder = iot.AwsIotMqttConnectionConfigBuilder.new_with_websockets()
      .with_credentials(AwsRegion, credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken)
      .with_endpoint(MqttEndpoint)
      .with_client_id(this._mqttClientId)
      // Clean sessions: the broker never persists our subscriptions or queues QoS1 messages while we
      // are disconnected. This makes every (re)connect re-subscribe deterministically (see the
      // `resume` handler) and — crucially — prevents the broker from dumping a backlog of queued
      // messages on reconnect, which during an interrupt storm compounded into the ~1000x message /
      // DB-growth reports. It also stops each forced reset from leaving an orphaned broker session.
      .with_clean_session(true)
      .with_keep_alive_seconds(30)
      .with_ping_timeout_ms(3000)
      .with_protocol_operation_timeout_ms(60000)
      // A less-aggressive minimum backoff keeps the native reconnect loop from hammering the broker
      // during a storm (a likely contributor to the self-collision hangups); the stable connection
      // only pings every 30s, so nothing depends on 1s reconnects.
      .with_reconnect_min_sec(3)
      .with_reconnect_max_sec(30);

    const config = builder.build();

    // `with_credentials` bakes the credentials fetched above into a static
    // signer. Cognito credentials expire after ~1 hour; if the connection
    // drops and the native reconnect loop is still retrying when they lapse,
    // every subsequent handshake fails with a stale signature and no JS event
    // is ever emitted (`interrupt` only fires when an *established* connection
    // drops) — the client wedges silently, forever. Override the handshake
    // transform so every (re)connect attempt signs with freshly refreshed
    // credentials instead.
    config.websocket_handshake_transform = async (request, done) => {
      try {
        const freshSession = await this._getFreshSession();
        const freshCredentialsProvider = fromCognitoIdentityPool({
          clientConfig: {
            region: AwsRegion
          },
          identityPoolId: CognitoIdentityPoolId,
          logins: {
            [CognitoLoginKey]: freshSession.getIdToken().getJwtToken()
          },
          logger: this._logger
        });
        const freshCredentials = await freshCredentialsProvider();
        if (freshCredentials.expiration) {
          this._mqttCredentialsExpiration = dayjs(freshCredentials.expiration);
        }

        await auth.aws_sign_request(request, {
          algorithm: auth.AwsSigningAlgorithm.SigV4,
          signature_type: auth.AwsSignatureType.HttpRequestViaQueryParams,
          provider: auth.AwsCredentialsProvider.newStatic(
            freshCredentials.accessKeyId,
            freshCredentials.secretAccessKey,
            freshCredentials.sessionToken
          ),
          region: AwsRegion,
          service: 'iotdevicegateway',
          signed_body_value: auth.AwsSignedBodyValue.EmptySha256,
          omit_session_token: true
        });
        done();
      } catch (error) {
        this._logger.error('Failed to sign MQTT websocket handshake with fresh credentials', error);
        done(3 /* AWS_ERROR_UNKNOWN: fail this attempt; the reconnect loop retries */);
      }
    };

    const client = new mqtt.MqttClient();
    const connection = client.new_connection(config);

    // Tag this connection with a generation. Events from a discarded connection (e.g. one we
    // disconnected during a forced reset, or whose native reconnect loop is still winding down)
    // are ignored, so a dying connection can never mutate current state or trigger a second reset.
    const generation = ++this._mqttGeneration;

    connection.on('connect', (sessionPresent) => {
      if (generation !== this._mqttGeneration) return;
      this._logger.debug(`MQTT connect (clientId=${this._mqttClientId}, sessionPresent=${sessionPresent})`);
    });

    connection.on('connection_success', (result) => {
      if (generation !== this._mqttGeneration) return;
      this._mqttLastConnectionSuccessAt = Date.now();
      this._logger.debug(
        `MQTT connection_success (clientId=${this._mqttClientId}, sessionPresent=${result?.session_present}, ` +
          `reasonCode=${result?.reason_code})`
      );
      // A connection that stays up long enough is considered recovered; arm the timer that clears
      // the reset backoff counter.
      this._armMqttStabilityTimer(generation);
    });

    connection.on('connection_failure', (e) => {
      if (generation !== this._mqttGeneration) return;
      this._logger.error(`MQTT connection_failure (clientId=${this._mqttClientId})`, e);
    });

    connection.on('interrupt', (e) => {
      if (generation !== this._mqttGeneration) return;

      // Dwell time since the last successful connect. A tiny value (tens of ms) is the signature of
      // an immediate server-side close (the storm) rather than a genuine network drop — logged to
      // help pin down the still-undiagnosed server-side trigger from live runs.
      const dwellMs =
        this._mqttLastConnectionSuccessAt !== undefined ? Date.now() - this._mqttLastConnectionSuccessAt : undefined;
      this._logger.warn(
        `MQTT interrupt (clientId=${this._mqttClientId}, dwellMs=${dwellMs ?? 'n/a'}, generation=${generation})`,
        e
      );

      // A storm keeps interrupting; don't let the stability timer clear the backoff counter mid-storm.
      this._clearMqttStabilityTimer();

      const now = Date.now();
      this._mqttInterrupts = this._mqttInterrupts.filter((t) => now - t < MqttInterruptWindow.asMilliseconds());
      this._mqttInterrupts.push(now);

      const areCredentialsExpired = !(this._mqttCredentialsExpiration?.isAfter(dayjs()) ?? false);
      const isStorm = this._mqttInterrupts.length >= MqttInterruptThreshold;

      if (isStorm || areCredentialsExpired) {
        const reason = isStorm
          ? `High interrupt rate (${this._mqttInterrupts.length} in ${MqttInterruptWindow.asSeconds()}s)`
          : 'Credentials expired';
        // Fire-and-forget: _resetMqttConnection is fully self-contained and never rejects, so an
        // unhandled rejection can't escape this event handler and crash the process.
        void this._resetMqttConnection(reason);
      }
    });

    connection.on('resume', async (returnCode, sessionPresent) => {
      if (generation !== this._mqttGeneration) return;
      this._logger.info(
        `MQTT resume returnCode=${returnCode} sessionPresent=${sessionPresent} clientId=${this._mqttClientId}`
      );

      // With clean sessions the broker never restores our subscriptions, so re-subscribe on every
      // resume. (sessionPresent is expected to always be false now; the guard is kept for safety.)
      if (!sessionPresent) {
        try {
          await this._resubscribeAll(connection);
        } catch (err) {
          this._logger.error('Failed to re-subscribe after resume', err);
        }
      }
    });

    connection.on('error', (e) => {
      if (generation !== this._mqttGeneration) return;
      this._logger.error(`MQTT error (clientId=${this._mqttClientId})`, e);
    });

    connection.on('closed', () => {
      if (generation !== this._mqttGeneration) return;
      this._logger.info('MQTT connection closed');
      this._clearMqttStabilityTimer();
      this._mqttConnectionPromise = undefined;
      this._mqttCredentialsExpiration = undefined;
    });

    await connection.connect();

    return connection;
  }

  /**
   * Re-subscribes every device currently receiving real-time updates on the given connection.
   *
   * Safe to call on every (re)connect: aws-crt replaces the per-topic callback on a duplicate subscribe, so this never
   * registers a message handler more than once.
   *
   * @param connection - The connection to (re-)establish subscriptions on.
   */
  private async _resubscribeAll(connection: mqtt.MqttClientConnection): Promise<void> {
    for (const deviceId of Array.from(this._realtimeDeviceIds.keys())) {
      const topic = `/v1/dev/${deviceId}/out`;
      this._logger.debug(`Re-subscribing to ${topic}`);
      await connection.subscribe(topic, mqtt.QoS.AtLeastOnce, (_topic, payload) => {
        this._processMqttMessage(payload);
      });
    }

    // Restore any raw debug-capture subscriptions (see startRawTopicCapture) so a capture keeps
    // flowing across reconnects.
    const decoder = new TextDecoder('utf-8');
    for (const [filter, handler] of Array.from(this._rawTopicCaptures.entries())) {
      this._logger.debug(`Re-subscribing to raw topic filter '${filter}'`);
      await connection.subscribe(filter, mqtt.QoS.AtLeastOnce, (topic, payload) => {
        handler(topic, decoder.decode(payload));
      });
    }
  }

  /**
   * Arms (or re-arms) the stability timer. When a connection stays interrupt-free for {@link MqttStabilityWindow}, the
   * consecutive-reset backoff counter is cleared so a future isolated storm still gets a fast first reset.
   *
   * @param generation - The connection generation that armed the timer; the callback is a no-op if the connection has
   *   since been replaced.
   */
  private _armMqttStabilityTimer(generation: number): void {
    this._clearMqttStabilityTimer();
    this._mqttStabilityTimer = setTimeout(() => {
      if (generation !== this._mqttGeneration) return;
      if (this._mqttConsecutiveResets > 0) {
        this._logger.debug('MQTT connection stable; clearing consecutive-reset counter');
        this._mqttConsecutiveResets = 0;
      }
    }, MqttStabilityWindow.asMilliseconds());
    // Don't keep the event loop alive solely for this bookkeeping timer.
    this._mqttStabilityTimer.unref?.();
  }

  /** Clears the stability timer, if armed. */
  private _clearMqttStabilityTimer(): void {
    if (this._mqttStabilityTimer) {
      clearTimeout(this._mqttStabilityTimer);
      this._mqttStabilityTimer = undefined;
    }
  }

  /**
   * Forcefully tears down the current MQTT connection and rebuilds it with a fresh client id and fresh credentials,
   * escaping interrupt storms that a plain native reconnect cannot.
   *
   * Repeatable and self-contained: only one reset runs at a time, consecutive resets without an intervening stable
   * period back off exponentially (up to {@link MqttResetMaxDelay}), and it never rejects — so it is safe to invoke
   * fire-and-forget from an event handler.
   *
   * @param reason - Human-readable reason for the reset, used in logs.
   */
  private async _resetMqttConnection(reason: string): Promise<void> {
    if (this._mqttResetInProgress) {
      return;
    }
    this._mqttResetInProgress = true;

    // Capture the connection to tear down before we clear the cached promise below.
    const connectionToClose = this._mqttConnectionPromise;

    try {
      this._mqttConsecutiveResets++;

      const delayMs = Math.min(
        MqttResetBaseDelay.asMilliseconds() * Math.pow(2, this._mqttConsecutiveResets - 1),
        MqttResetMaxDelay.asMilliseconds()
      );

      this._logger.warn(
        `${reason}. Forcing MQTT reset #${this._mqttConsecutiveResets} ` +
          `(new clientId, fresh credentials) after ${Math.round(delayMs)}ms...`
      );

      // Invalidate the current client id, credentials and interrupt history before rebuilding.
      this._mqttClientId = undefined;
      this._mqttCredentialsExpiration = undefined;
      this._mqttInterrupts = [];
      this._clearMqttStabilityTimer();

      // Clear the cached promise first so publishers calling _getMqttConnection() build a new
      // connection instead of reusing the one we're about to destroy.
      this._mqttConnectionPromise = undefined;

      // Tear down the old connection. Strip listeners so its native binding can be GC'd and so no
      // late event from it mutates current state (belt-and-suspenders with the generation guard).
      // Any in-flight publish rejecting with AWS_ERROR_MQTT_CONNECTION_DESTROYED is swallowed here.
      if (connectionToClose) {
        try {
          const connection = await connectionToClose;
          connection.removeAllListeners();
          await connection.disconnect();
        } catch (err) {
          this._logger.debug('Error tearing down old MQTT connection during reset (ignored)', err);
        }
      }

      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }

      const newConnection = await this._getMqttConnection();
      await this._resubscribeAll(newConnection);

      this._logger.info(`MQTT connection rebuilt successfully after reset #${this._mqttConsecutiveResets} (${reason})`);
    } catch (err) {
      this._logger.error('Failed to rebuild MQTT connection after reset', err);
    } finally {
      this._mqttResetInProgress = false;
    }
  }

  /**
   * Processes incoming MQTT messages and emits appropriate events.
   *
   * This method parses MQTT payloads and converts them into typed events that can be listened to via the client's event
   * emitter. It handles both v1 and v2 device message formats and emits events like 'statusChanged', 'setPointChanged',
   * and 'stateChanged'.
   *
   * @param payload - The raw MQTT message payload to process.
   */
  private _processMqttMessage(payload: ArrayBuffer) {
    try {
      const parsedPayload = parseMqttPayload(payload);

      this.emitter.emit('rawRealtimeMessageReceived', parsedPayload);

      if (isMsgTypeOutPayload(parsedPayload)) {
        switch (parsedPayload.MsgType) {
          case OutMessageType.DEVICE_V1_STATUS:
            this.emitter.emit('statusChanged', {
              deviceId: parsedPayload.Device,
              temperature: parsedPayload.MainTemp,
              humidity: parsedPayload.Humidity,
              setPoint: parsedPayload.SetPoint,
              current: parsedPayload.Current
            });
            break;

          case OutMessageType.DEVICE_SETPOINT_CHANGE:
            this.emitter.emit('setPointChanged', {
              deviceId: parsedPayload.Device,
              newSetPoint: parsedPayload.Next,
              previousSetPoint: parsedPayload.Prev
            });
            break;
        }
      } else if (isMsgOutPayload(parsedPayload)) {
        switch (parsedPayload.msg) {
          case OutMessageType.DEVICE_AC_STATUS:
          case OutMessageType.DEVICE_V2_STATUS:
            this.emitter.emit('statusChanged', {
              deviceId: parsedPayload.src.ref,
              temperature: parsedPayload.body.ambTemp,
              humidity: parsedPayload.body.hum,
              setPoint: parsedPayload.body.stpt,
              dutyCycle: parsedPayload.body.dtyCycle
            });
            break;

          case OutMessageType.DEVICE_STATE_CHANGE: {
            const modeMap: Record<number, MysaDeviceMode> = {
              1: 'off',
              2: 'auto',
              3: 'heat',
              4: 'cool',
              5: 'fan_only',
              6: 'dry'
            };
            this.emitter.emit('stateChanged', {
              deviceId: parsedPayload.src.ref,
              mode: parsedPayload.body.state.md ? modeMap[parsedPayload.body.state.md] : undefined,
              setPoint: parsedPayload.body.state.sp,
              fanSpeed:
                parsedPayload.body.state.fn !== undefined ? FanSpeedReceiveMap[parsedPayload.body.state.fn] : undefined
            });
            break;
          }
        }
      }
    } catch (error) {
      this._logger.error('Error handling MQTT message:', error);
    }
  }
}
