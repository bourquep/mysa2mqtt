/** Error thrown when attempting to access the Mysa API without proper authentication. */
export class UnauthenticatedError extends Error {
  /**
   * The underlying failure that prevented authentication.
   *
   * Callers need it to tell a credential rejection apart from a transport or service failure, since both surface as
   * this error. Declared explicitly rather than passed to `super` so the SDK keeps compiling against its current lib,
   * which predates the two-argument `Error` constructor.
   */
  readonly cause?: unknown;

  /**
   * Creates a new UnauthenticatedError instance.
   *
   * @param message - The error message
   * @param cause - The underlying failure that prevented authentication, if any.
   */
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'UnauthenticatedError';
    this.cause = cause;
  }
}

/** Error thrown when a Mysa API request fails. */
export class MysaApiError extends Error {
  /** The HTTP status code returned by the API */
  readonly status: number;
  /** The HTTP status text returned by the API */
  readonly statusText: string;

  /**
   * Creates a new MysaApiError instance.
   *
   * @param apiResponse - The failed Response object from the API call
   */
  constructor(apiResponse: Response) {
    super(
      `Failed to call the '${apiResponse.url}' Mysa API endpoint. The server responded with a status of ${apiResponse.status} (${apiResponse.statusText}).`
    );
    this.name = 'MysaApiError';
    this.status = apiResponse.status;
    this.statusText = apiResponse.statusText;
  }
}

/** Error thrown when a device id does not match any device on the account. */
export class UnknownDeviceError extends Error {
  /**
   * Creates a new UnknownDeviceError instance.
   *
   * @param deviceId - The device id that could not be resolved
   */
  constructor(public readonly deviceId: string) {
    super(`Unknown device id '${deviceId}': no such device on this account.`);
    this.name = 'UnknownDeviceError';
  }
}

/** Error thrown when an MQTT publish ultimately fails after retry attempts. */
export class MqttPublishError extends Error {
  /**
   * Creates a new MqttPublishError instance.
   *
   * @param message - A human-readable description of the publish failure.
   * @param attempts - The number of attempts that were made before giving up.
   * @param original - The original error object thrown by the underlying MQTT library (optional).
   */
  constructor(
    message: string,
    public attempts: number,
    public original?: unknown
  ) {
    super(message);
    this.name = 'MqttPublishError';
  }
}
