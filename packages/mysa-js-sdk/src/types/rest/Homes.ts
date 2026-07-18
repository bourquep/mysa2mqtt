/** Home information object. */
export interface HomeBase {
  /** Unique home identifier */
  Id: string;
  /** User-assigned home name */
  Name?: string;
}

/**
 * Top-level interface for the homes REST API response.
 *
 * Contains the complete collection of homes associated with a user account, typically returned from API endpoints that
 * fetch home information.
 */
export interface Homes {
  /** Collection of all homes */
  Homes: HomeBase[];
}
