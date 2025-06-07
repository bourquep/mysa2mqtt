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

  /** The MQTT connection used for real-time updates. */
  private _mqttConnection?: mqtt.MqttClientConnection;

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
   * @param emailAddress - The email address of the user.
   * @param password - The password of the user.
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
   * @returns A promise that resolves to the list of devices.
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
   * @param deviceId - The ID of the device to get the serial number for.
   * @returns A promise that resolves to the serial number, or undefined if not found.
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
      id: now.unix(),
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
   * @param deviceId - The ID of the device to start receiving updates for.
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
   * @param deviceId - The ID of the device to stop receiving real-time updates for.
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

  private async getMqttConnection(): Promise<mqtt.MqttClientConnection> {
    if (this._mqttConnection) {
      return this._mqttConnection;
    }

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
    this._mqttConnection = client.new_connection(config);

    this._mqttConnection.on('closed', () => {
      this._logger.info('MQTT connection closed');
      this._mqttConnection = undefined;
    });

    await this._mqttConnection.connect();

    return this._mqttConnection;
  }

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
