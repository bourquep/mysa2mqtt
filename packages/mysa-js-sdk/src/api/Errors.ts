/** Error thrown when attempting to access the Mysa API without proper authentication. */
export class UnauthenticatedError extends Error {
  /**
   * Creates a new UnauthenticatedError instance.
   *
   * @param message - The error message
   */
  constructor(message: string) {
    super(message);
    this.name = 'UnauthenticatedError';
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
