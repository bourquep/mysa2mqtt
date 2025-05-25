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
