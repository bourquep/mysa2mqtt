import { MysaSession } from '@/api/MysaSession';
import { EventEmitter } from '@/lib/EventEmitter';
import { parseMqttPayload, serializeMqttPayload } from '@/lib/PayloadParser';
import { isMsgOutPayload, isMsgTypeOutPayload } from '@/lib/PayloadTypeGuards';
import { ChangeDeviceState } from '@/types/mqtt/in/ChangeDeviceState';
import { InMessageType } from '@/types/mqtt/in/InMessageType';
import { StartPublishingDeviceStatus } from '@/types/mqtt/in/StartPublishingDeviceStatus';
import { OutMessageType } from '@/types/mqtt/out/OutMessageType';
import { Devices, DeviceStates, Firmwares } from '@/types/rest';
import { DescribeThingCommand, IoTClient } from '@aws-sdk/client-iot';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import {
  AuthenticationDetails,
  CognitoAccessToken,
  CognitoIdToken,
  CognitoRefreshToken,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession
} from 'amazon-cognito-identity-js';
import { iot, mqtt } from 'aws-iot-device-sdk-v2';
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration.js';
import { MysaApiError, UnauthenticatedError } from './Errors';
import { Logger, VoidLogger } from './Logger';
import { MysaApiClientEventTypes } from './MysaApiClientEventTypes';
import { MysaApiClientOptions } from './MysaApiClientOptions';
import { MysaDeviceMode } from './MysaDeviceMode';

dayjs.extend(duration);

const AwsRegion = 'us-east-1';
const CognitoUserPoolId = 'us-east-1_GUFWfhI7g';
const CognitoClientId = '19efs8tgqe942atbqmot5m36t3';
const CognitoIdentityPoolId = 'us-east-1:ebd95d52-9995-45da-b059-56b865a18379';
const CognitoLoginKey = `cognito-idp.${AwsRegion}.amazonaws.com/${CognitoUserPoolId}`;
const MqttEndpoint = 'a3q27gia9qg3zy-ats.iot.us-east-1.amazonaws.com';
const MysaApiBaseUrl = 'https://app-prod.mysa.cloud';
const RealtimeKeepAliveInterval = dayjs.duration(5, 'minutes');

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
 * const client = new MysaApiClient();
 *
 * await client.login('user@example.com', 'password');
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
  /** The current session object, if any. */
  private _cognitoUserSession?: CognitoUserSession;

  /** The current user object, if any. */
  private _cognitoUser?: CognitoUser;

  /** The logger instance used by the client. */
  private _logger: Logger;

  /** The fetcher function used by the client. */
  private _fetcher: typeof fetch;

  /** A promise that resolves to the MQTT connection used for real-time updates. */
  private _mqttConnectionPromise?: Promise<mqtt.MqttClientConnection>;

  /** The device IDs that are currently being updated in real-time, mapped to their respective timeouts. */
  private _realtimeDeviceIds: Map<string, NodeJS.Timeout> = new Map();

  /** The cached devices object, if any. */
  private _cachedDevices?: Devices;

  /**
   * Event emitter for client events.
   *
   * @see {@link MysaApiClientEventTypes} for the possible events and their payloads.
   */
  readonly emitter = new EventEmitter<MysaApiClientEventTypes>();

  /**
   * Gets the persistable session object.
   *
   * @returns The current persistable session object, if any.
   */
  get session(): MysaSession | undefined {
    if (!this._cognitoUserSession || !this._cognitoUser) {
      return undefined;
    }

    return {
      username: this._cognitoUser.getUsername(),
      idToken: this._cognitoUserSession.getIdToken().getJwtToken(),
      accessToken: this._cognitoUserSession.getAccessToken().getJwtToken(),
      refreshToken: this._cognitoUserSession.getRefreshToken().getToken()
    };
  }

  /**
   * Returns whether the client currently has an active session.
   *
   * @returns True if the client has an active session, false otherwise.
   */
  get isAuthenticated(): boolean {
    return !!this.session;
  }

  /**
   * Constructs a new instance of the MysaApiClient.
   *
   * @param session - The persistable session object, if any.
   * @param options - The options for the client.
   */
  constructor(session?: MysaSession, options?: MysaApiClientOptions) {
    this._logger = options?.logger || new VoidLogger();
    this._fetcher = options?.fetcher || fetch;

    if (session) {
      this._cognitoUser = new CognitoUser({
        Username: session.username,
        Pool: new CognitoUserPool({ UserPoolId: CognitoUserPoolId, ClientId: CognitoClientId })
      });
      this._cognitoUserSession = new CognitoUserSession({
        IdToken: new CognitoIdToken({ IdToken: session.idToken }),
        AccessToken: new CognitoAccessToken({ AccessToken: session.accessToken }),
        RefreshToken: new CognitoRefreshToken({ RefreshToken: session.refreshToken })
      });
    }
  }

  /**
   * Logs in the user with the given email address and password.
   *
   * This method authenticates the user with Mysa's Cognito user pool and establishes a session that can be used for
   * subsequent API calls. Upon successful login, a 'sessionChanged' event is emitted.
   *
   * @example
   *
   * ```typescript
   * try {
   *   await client.login('user@example.com', 'password123');
   *   console.log('Login successful!');
   * } catch (error) {
   *   console.error('Login failed:', error.message);
   * }
   * ```
   *
   * @param emailAddress - The email address of the user.
   * @param password - The password of the user.
   * @throws {@link Error} When authentication fails due to invalid credentials or network issues.
   */
  async login(emailAddress: string, password: string): Promise<void> {
    this._cognitoUser = undefined;
    this._cognitoUserSession = undefined;
    this.emitter.emit('sessionChanged', this.session);

    return new Promise((resolve, reject) => {
      const user = new CognitoUser({
        Username: emailAddress,
        Pool: new CognitoUserPool({ UserPoolId: CognitoUserPoolId, ClientId: CognitoClientId })
      });

      user.authenticateUser(new AuthenticationDetails({ Username: emailAddress, Password: password }), {
        onSuccess: (session) => {
          this._cognitoUser = user;
          this._cognitoUserSession = session;
          this.emitter.emit('sessionChanged', this.session);

          resolve();
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
   * @throws {@link UnauthenticatedError} When the user is not authenticated.
   */
  async getDevices(): Promise<Devices> {
    this._logger.debug(`Fetching devices...`);

    const session = await this.getFreshSession();

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
   * @throws {@link UnauthenticatedError} When the user is not authenticated.
   */
  async getDeviceSerialNumber(deviceId: string): Promise<string | undefined> {
    this._logger.debug(`Fetching serial number for device ${deviceId}...`);

    const session = await this.getFreshSession();

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
   * @throws {@link UnauthenticatedError} When the user is not authenticated.
   */
  async getDeviceFirmwares(): Promise<Firmwares> {
    this._logger.debug(`Fetching device firmwares...`);

    const session = await this.getFreshSession();

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
   * @throws {@link UnauthenticatedError} When the user is not authenticated.
   */
  async getDeviceStates(): Promise<DeviceStates> {
    this._logger.debug(`Fetching device states...`);

    const session = await this.getFreshSession();

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
   * ```
   *
   * @param deviceId - The ID of the device to control.
   * @param setPoint - The target temperature set point (optional).
   * @param mode - The operating mode to set ('off', 'heat', or undefined to leave unchanged).
   * @throws {@link UnauthenticatedError} When the user is not authenticated.
   * @throws {@link Error} When MQTT connection or command sending fails.
   */
  async setDeviceState(deviceId: string, setPoint?: number, mode?: MysaDeviceMode) {
    this._logger.debug(`Setting device state for '${deviceId}'`);

    if (!this._cachedDevices) {
      this._cachedDevices = await this.getDevices();
    }

    const device = this._cachedDevices.DevicesObj[deviceId];

    this._logger.debug(`Initializing MQTT connection...`);
    const mqttConnection = await this.getMqttConnection();

    const now = dayjs();

    this._logger.debug(`Sending request to set device state for '${deviceId}'...`);
    const payload = serializeMqttPayload<ChangeDeviceState>({
      msg: InMessageType.CHANGE_DEVICE_STATE,
      id: now.valueOf(),
      time: now.unix(),
      ver: '1.0',
      src: {
        ref: this.session!.username,
        type: 100
      },
      dest: {
        ref: deviceId,
        type: 1
      },
      resp: 2,
      body: {
        ver: 1,
        type: device.Model.startsWith('BB-V1')
          ? 1
          : device.Model.startsWith('BB-V2')
            ? device.Model.endsWith('-L')
              ? 5
              : 4
            : 0,
        cmd: [
          {
            tm: -1,
            sp: setPoint,
            md: mode === 'off' ? 1 : mode === 'heat' ? 3 : undefined
          }
        ]
      }
    });

    await mqttConnection.publish(`/v1/dev/${deviceId}/in`, payload, mqtt.QoS.AtLeastOnce);
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
    const mqttConnection = await this.getMqttConnection();

    this._logger.debug(`Subscribing to MQTT topic '/v1/dev/${deviceId}/out'...`);
    await mqttConnection.subscribe(`/v1/dev/${deviceId}/out`, mqtt.QoS.AtLeastOnce, (_, payload) => {
      this.processMqttMessage(payload);
    });

    this._logger.debug(`Sending request to start publishing device status for '${deviceId}'...`);
    const payload = serializeMqttPayload<StartPublishingDeviceStatus>({
      Device: deviceId,
      MsgType: InMessageType.START_PUBLISHING_DEVICE_STATUS,
      Timestamp: dayjs().unix(),
      Timeout: RealtimeKeepAliveInterval.asSeconds()
    });
    await mqttConnection.publish(`/v1/dev/${deviceId}/in`, payload, mqtt.QoS.AtLeastOnce);

    const timer = setInterval(async () => {
      this._logger.debug(`Sending request to keep-alive publishing device status for '${deviceId}'...`);
      const payload = serializeMqttPayload<StartPublishingDeviceStatus>({
        Device: deviceId,
        MsgType: InMessageType.START_PUBLISHING_DEVICE_STATUS,
        Timestamp: dayjs().unix(),
        Timeout: RealtimeKeepAliveInterval.asSeconds()
      });
      await mqttConnection.publish(`/v1/dev/${deviceId}/in`, payload, mqtt.QoS.AtLeastOnce);
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
    const mqttConnection = await this.getMqttConnection();

    this._logger.debug(`Unsubscribing to MQTT topic '/v1/dev/${deviceId}/out'...`);
    await mqttConnection.unsubscribe(`/v1/dev/${deviceId}/out`);

    clearInterval(timer);
    this._realtimeDeviceIds.delete(deviceId);
  }

  /**
   * Ensures a valid, non-expired session is available.
   *
   * This method checks if the current session is valid and not expired. If the session is expired, it automatically
   * refreshes it using the refresh token.
   *
   * @returns A promise that resolves to a valid CognitoUserSession.
   * @throws {@link UnauthenticatedError} When no session exists or refresh fails.
   */
  private async getFreshSession(): Promise<CognitoUserSession> {
    if (!this._cognitoUser || !this._cognitoUserSession) {
      throw new UnauthenticatedError('An attempt was made to access a resource without a valid session.');
    }

    if (
      this._cognitoUserSession.isValid() &&
      dayjs.unix(this._cognitoUserSession.getIdToken().getExpiration()).isAfter()
    ) {
      this._logger.debug('Session is valid, no need to refresh');
      return Promise.resolve(this._cognitoUserSession);
    }

    this._logger.debug('Session is not valid or expired, refreshing...');
    return new Promise<CognitoUserSession>((resolve, reject) => {
      this._cognitoUser!.refreshSession(this._cognitoUserSession!.getRefreshToken(), (error, session) => {
        if (error) {
          this._logger.error('Failed to refresh session:', error);
          reject(new UnauthenticatedError('Unable to refresh the authentication session.'));
        } else {
          this._logger.debug('Session refreshed successfully');
          this._cognitoUserSession = session;
          this.emitter.emit('sessionChanged', this.session);
          resolve(session);
        }
      });
    });
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
  private getMqttConnection(): Promise<mqtt.MqttClientConnection> {
    if (!this._mqttConnectionPromise) {
      this._mqttConnectionPromise = this.createMqttConnection().catch((err) => {
        this._mqttConnectionPromise = undefined;
        throw err;
      });
    }

    return this._mqttConnectionPromise;
  }

  /**
   * Creates a new MQTT connection using AWS IoT WebSocket connections with Cognito credentials.
   *
   * @returns A promise that resolves to an active MQTT connection.
   * @throws {@link Error} When connection establishment fails.
   */
  private async createMqttConnection(): Promise<mqtt.MqttClientConnection> {
    const session = await this.getFreshSession();
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

    const builder = iot.AwsIotMqttConnectionConfigBuilder.new_with_websockets()
      .with_credentials(AwsRegion, credentials.accessKeyId, credentials.secretAccessKey, credentials.sessionToken)
      .with_endpoint(MqttEndpoint)
      .with_client_id(`mysa-js-sdk-${dayjs().unix()}`) // Unique client ID
      .with_clean_session(true)
      .with_keep_alive_seconds(30)
      .with_ping_timeout_ms(3000)
      .with_protocol_operation_timeout_ms(60000);

    const config = builder.build();
    const client = new mqtt.MqttClient();
    const connection = client.new_connection(config);

    connection.on('connect', () => this._logger.debug('MQTT connect'));
    connection.on('connection_success', () => this._logger.debug('MQTT connection_success'));
    connection.on('connection_failure', (e) => this._logger.error('MQTT connection_failure', e));
    connection.on('interrupt', (e) => this._logger.warn('MQTT interrupt', e));
    connection.on('resume', (returnCode, sessionPresent) =>
      this._logger.info(`MQTT resume returnCode=${returnCode} sessionPresent=${sessionPresent}`)
    );
    connection.on('error', (e) => this._logger.error('MQTT error', e));

    connection.on('closed', () => {
      this._logger.info('MQTT connection closed');
      this._mqttConnectionPromise = undefined;
    });

    await connection.connect();

    return connection;
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
  private processMqttMessage(payload: ArrayBuffer) {
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
          case OutMessageType.DEVICE_V2_STATUS:
            this.emitter.emit('statusChanged', {
              deviceId: parsedPayload.src.ref,
              temperature: parsedPayload.body.ambTemp,
              humidity: parsedPayload.body.hum,
              setPoint: parsedPayload.body.stpt,
              dutyCycle: parsedPayload.body.dtyCycle
            });
            break;

          case OutMessageType.DEVICE_STATE_CHANGE:
            this.emitter.emit('stateChanged', {
              deviceId: parsedPayload.src.ref,
              mode: parsedPayload.body.state.md === 1 ? 'off' : parsedPayload.body.state.md === 3 ? 'heat' : undefined,
              setPoint: parsedPayload.body.state.sp
            });
            break;
        }
      }
    } catch (error) {
      this._logger.error('Error handling MQTT message:', error);
    }
  }
}
