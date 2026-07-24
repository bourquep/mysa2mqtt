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

import { ComponentConfiguration } from '@/configuration/component_configuration';
import { Discoverable } from '../api/discoverable';
import { ComponentSettings } from '../api/settings';

type StateTopicMap = {
  topic: string;
};

/** Configuration interface for a camera component */
export interface CameraInfo extends ComponentConfiguration<'camera'> {
  /**
   * The encoding of the images received on the image topic. Use `"b64"` to publish base64-encoded images. Defaults to
   * publishing raw binary image data.
   */
  image_encoding?: 'b64';
}

/**
 * Represents a camera in Home Assistant. A camera publishes still images, either as raw binary payloads or as
 * base64-encoded strings when {@link CameraInfo.image_encoding} is `"b64"`.
 */
export class Camera extends Discoverable<CameraInfo, StateTopicMap> {
  /**
   * Creates a new camera instance
   *
   * @param settings - Configuration settings for the camera
   */
  constructor(settings: ComponentSettings<CameraInfo>) {
    super(settings, ['topic'], async () => {});
  }

  /**
   * Publishes an image frame.
   *
   * @param image - The image data. A `Buffer` of raw image bytes, or a string (typically a base64-encoded image when
   *   {@link CameraInfo.image_encoding} is `"b64"`).
   */
  async publishImage(image: Buffer | string) {
    // The image bytes bypass setState, which would JSON-stringify a Buffer and
    // corrupt the binary payload. Publishing is retained so the last frame is
    // available immediately when Home Assistant (re)subscribes.
    const payload =
      this.component.image_encoding === 'b64' && Buffer.isBuffer(image) ? image.toString('base64') : image;
    await this.mqttClient.publishAsync(this.stateTopics[0].topic, payload, { retain: true });
  }
}
