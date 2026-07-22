/**
 * Interface representing the credentials of a Mysa account.
 *
 * The client authenticates with these credentials on demand, and re-authenticates with them whenever its session can no
 * longer be refreshed. They are held for the lifetime of the client.
 */
export interface MysaCredentials {
  /** The email address of the Mysa account. */
  username: string;
  /** The password of the Mysa account. */
  password: string;
}
