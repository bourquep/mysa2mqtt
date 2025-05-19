/*
mqtt2ha
Copyright (C) 2025 Pascal Bourque

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/**
 * Configuration for a physical device in Home Assistant Contains information used to identify and describe the device
 * in the Home Assistant device registry
 */
export interface DeviceConfiguration {
  /**
   * A list of identifiers that uniquely identify the device. Can be a single string or an array of strings. At least
   * one identifier is required to register the device in Home Assistant.
   */
  identifiers?: string | string[];

  /**
   * The name of the device as it will appear in the Home Assistant UI. This can be different from the names of
   * individual entities belonging to this device.
   */
  name?: string;

  /** The model identifier or product name of the device. Example: "Room Sensor v1" */
  model?: string;

  /** The manufacturer or brand name of the device. Example: "Acme Corp" */
  manufacturer?: string;

  /** The firmware or software version running on the device. Example: "1.2.3" */
  sw_version?: string;

  /** The hardware version or revision of the device. Example: "rev2" */
  hw_version?: string;

  /**
   * The suggested area/room where the device is installed. Home Assistant will automatically assign the device to this
   * area.
   */
  suggested_area?: string;

  /**
   * Identifier of a gateway or bridge device through which this device is connected. This creates a connection between
   * devices in the Home Assistant UI.
   */
  via_device?: string;

  /**
   * A URL to the device's web interface or configuration page. Can be either an http://, https:// or an internal
   * homeassistant:// URL. Example: "http://192.168.1.100" or "homeassistant://config/devices"
   */
  configuration_url?: string;
}
