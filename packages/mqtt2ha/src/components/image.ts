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
  /** The MQTT topic to publish the image data on. */
  image_topic: string;

  /** The MQTT topic to publish a URL pointing to the image on. */
  url_topic: string;
};

/** Configuration interface for an image component */
export interface ImageInfo extends ComponentConfiguration<'image'> {
  /**
   * The content type of the image, e.g. `image/jpeg` or `image/png`. Only used with an image topic. Default:
   * `image/jpeg`.
   */
  content_type?: string;

  /**
   * The encoding of the image payload received on the image topic. Use `"b64"` to publish base64-encoded images.
   * Defaults to publishing raw binary image data.
   */
  image_encoding?: 'b64';

  /** Defines a template to extract the image URL from a message received on the url topic. */
  url_template?: string;
}

/**
 * Represents an image in Home Assistant. An image entity displays a picture, published either as image data on an image
 * topic or as a URL on a URL topic. Exactly one of the two topics must be selected via the constructor.
 */
export class Image extends Discoverable<ImageInfo, StateTopicMap> {
  /**
   * Creates a new image instance
   *
   * @param settings - Configuration settings for the image
   * @param stateTopicName - Whether this image is fed by raw image data (`image_topic`) or by a URL (`url_topic`).
   *   Default: `image_topic`.
   */
  constructor(
    settings: ComponentSettings<ImageInfo>,
    stateTopicName: Extract<keyof StateTopicMap, string> = 'image_topic'
  ) {
    super(settings, [stateTopicName], async () => {});
  }

  /**
   * Publishes image data on the `image_topic`. Only valid when the image was constructed with the `image_topic` state
   * topic.
   *
   * @param image - The image data. A `Buffer` of raw image bytes, or a string (typically a base64-encoded image when
   *   {@link ImageInfo.image_encoding} is `"b64"`).
   */
  async publishImage(image: Buffer | string) {
    const topic = this.stateTopics.find((t) => t.name === 'image_topic');
    if (!topic) {
      this.logger.warn("Cannot publish image data: this image was not configured with the 'image_topic' state topic.");
      return;
    }

    // The image bytes bypass setState, which would JSON-stringify a Buffer and
    // corrupt the binary payload.
    const payload =
      this.component.image_encoding === 'b64' && Buffer.isBuffer(image) ? image.toString('base64') : image;
    await this.mqttClient.publishAsync(topic.topic, payload, { retain: true });
  }

  /**
   * Publishes an image URL on the `url_topic`. Only valid when the image was constructed with the `url_topic` state
   * topic.
   *
   * @param url - The URL pointing to the image.
   */
  async publishUrl(url: string) {
    const topic = this.stateTopics.find((t) => t.name === 'url_topic');
    if (!topic) {
      this.logger.warn("Cannot publish image URL: this image was not configured with the 'url_topic' state topic.");
      return;
    }

    await this.setState('url_topic', url);
  }
}
