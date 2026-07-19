/**
 * Interface representing an authenticated Mysa user session.
 *
 * Contains the authentication tokens and user information required to make authorized API calls to the Mysa service.
 * These tokens are typically obtained through the login process and used for subsequent API requests.
 */
export interface MysaSession {
  /** The username/email address of the authenticated user */
  username: string;
  /** JWT identity token containing user identity information */
  idToken: string;
  /** JWT access token used for authorizing API requests */
  accessToken: string;
  /** JWT refresh token used to obtain new access tokens when they expire */
  refreshToken: string;
}
