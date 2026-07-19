import { Logger } from './Logger';

/** Configuration options for the Mysa API client. */
export interface MysaApiClientOptions {
  /**
   * Optional logger instance for client logging.
   *
   * @defaultValue A _void_ logger instance that does nothing.
   */
  logger?: Logger;

  /**
   * Optional fetch function to use for HTTP requests.
   *
   * @defaultValue The global `fetch` function.
   */
  fetcher?: typeof fetch;
}
