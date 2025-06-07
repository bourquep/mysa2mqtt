/** Configuration for the origin of an entity. */
export interface OriginConfiguration {
  /** The name of the application that is the origin of the discovered MQTT item. */
  name: string;

  /** Software version of the application that supplies the discovered MQTT item. */
  sw_version?: string;

  /** Support URL of the application that supplies the discovered MQTT item. */
  support_url?: string;
}
