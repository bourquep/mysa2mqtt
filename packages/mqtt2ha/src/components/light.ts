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

import { StateChangedHandler } from '@/api/discoverable';
import { ComponentSettings } from '@/api/settings';
import { CommandCallback, Subscriber } from '@/api/subscriber';
import { ComponentConfiguration } from '@/configuration/component_configuration';

/** An RGB color. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

type StateTopicMap = {
  /** The MQTT topic to publish the on/off state on. */
  state_topic: string;

  /** The MQTT topic to publish the brightness on. */
  brightness_state_topic: string;

  /** The MQTT topic to publish the color temperature on. */
  color_temp_state_topic: string;

  /** The MQTT topic to publish the RGB color on, as a `r,g,b` string. */
  rgb_state_topic: string;

  /** The MQTT topic to publish the current effect on. */
  effect_state_topic: string;
};

type CommandTopicMap = {
  /** The MQTT topic to subscribe for on/off commands. */
  command_topic: string;

  /** The MQTT topic to subscribe for brightness commands. */
  brightness_command_topic: string;

  /** The MQTT topic to subscribe for color temperature commands. */
  color_temp_command_topic: string;

  /** The MQTT topic to subscribe for RGB color commands, as a `r,g,b` string. */
  rgb_command_topic: string;

  /** The MQTT topic to subscribe for effect commands. */
  effect_command_topic: string;
};

/**
 * Configuration interface for a light component using the default (topic-per-attribute) schema.
 *
 * The default schema exposes each controllable attribute (brightness, color temperature, RGB, effect) through its own
 * pair of state and command topics.
 */
export interface LightInfo extends ComponentConfiguration<'light'> {
  /** The payload to turn the light on. Default: `"ON"`. */
  payload_on?: string;
  /** The payload to turn the light off. Default: `"OFF"`. */
  payload_off?: string;
  /** Defines the maximum brightness value (i.e. 100%). Default: `255`. */
  brightness_scale?: number;
  /** When `true`, `color_temp` values are expressed in Kelvin rather than mireds. Default: `false`. */
  color_temp_kelvin?: boolean;
  /** The minimum color temperature in mireds. */
  min_mireds?: number;
  /** The maximum color temperature in mireds. */
  max_mireds?: number;
  /** The list of effects the light supports. */
  effect_list?: string[];
  /**
   * Defines when the payload sent to `command_topic` should be sent. One of `"last"`, `"first"` or `"brightness"`.
   * Default: `"last"`.
   */
  on_command_type?: 'first' | 'last' | 'brightness';
  /** Flag that defines if the light works in optimistic mode. Default: `true` if no state topic defined, else `false`. */
  optimistic?: boolean;
  /** Defines if published messages should have the retain flag set. Default: `false`. */
  retain?: boolean;
}

/** Represents a light in Home Assistant using the default (topic-per-attribute) schema. */
export class Light extends Subscriber<LightInfo, StateTopicMap, CommandTopicMap> {
  private _isOn?: boolean;
  private _brightness?: number;
  private _colorTemp?: number;
  private _rgb?: RgbColor;
  private _effect?: string;

  /** @returns Whether the light is on. Setting a value publishes the configured on/off payload on the `state_topic`. */
  get isOn() {
    return this._isOn;
  }

  set isOn(isOn: boolean | undefined) {
    this._isOn = isOn;
    if (isOn !== undefined) {
      this.setStateSync(
        'state_topic',
        isOn ? (this.component.payload_on ?? 'ON') : (this.component.payload_off ?? 'OFF')
      );
    }
  }

  /**
   * @returns The brightness (0 to `brightness_scale`, default 255). Setting a defined value publishes it on the
   *   `brightness_state_topic`.
   */
  get brightness() {
    return this._brightness;
  }

  set brightness(brightness: number | undefined) {
    this._brightness = brightness;
    if (brightness !== undefined) {
      this.setStateSync('brightness_state_topic', String(brightness));
    }
  }

  /**
   * @returns The color temperature (in mireds, or Kelvin when `color_temp_kelvin` is set). Setting a defined value
   *   publishes it on the `color_temp_state_topic`.
   */
  get colorTemp() {
    return this._colorTemp;
  }

  set colorTemp(colorTemp: number | undefined) {
    this._colorTemp = colorTemp;
    if (colorTemp !== undefined) {
      this.setStateSync('color_temp_state_topic', String(colorTemp));
    }
  }

  /** @returns The RGB color. Setting a defined value publishes it as a `r,g,b` string on the `rgb_state_topic`. */
  get rgb() {
    return this._rgb;
  }

  set rgb(rgb: RgbColor | undefined) {
    this._rgb = rgb;
    if (rgb !== undefined) {
      this.setStateSync('rgb_state_topic', `${rgb.r},${rgb.g},${rgb.b}`);
    }
  }

  /** @returns The active effect. Setting a defined value publishes it on the `effect_state_topic`. */
  get effect() {
    return this._effect;
  }

  set effect(effect: string | undefined) {
    this._effect = effect;
    if (effect !== undefined) {
      this.setStateSync('effect_state_topic', effect);
    }
  }

  /**
   * Creates a new light instance
   *
   * @param settings - Configuration settings for the light
   * @param stateTopicNames - Array of state topic names to expose
   * @param onStateChange - Callback function to handle state changes
   * @param commandTopicNames - Array of command topic names to subscribe to
   * @param onCommand - Callback function to handle command messages
   */
  constructor(
    settings: ComponentSettings<LightInfo>,
    stateTopicNames: Extract<keyof StateTopicMap, string>[],
    onStateChange: StateChangedHandler<StateTopicMap>,
    commandTopicNames: Extract<keyof CommandTopicMap, string>[],
    onCommand: CommandCallback<CommandTopicMap>
  ) {
    super(settings, stateTopicNames, onStateChange, commandTopicNames, async (topicName, message) => {
      await this.handleCommand(topicName, message);
      await onCommand(topicName, message);
    });
  }

  private async handleCommand<TTopicName extends keyof CommandTopicMap & string>(
    topicName: TTopicName,
    message: CommandTopicMap[TTopicName]
  ) {
    switch (topicName) {
      case 'command_topic':
        if (message === (this.component.payload_on ?? 'ON')) {
          this.isOn = true;
        } else if (message === (this.component.payload_off ?? 'OFF')) {
          this.isOn = false;
        } else {
          this.logger.warn("Received an unexpected payload on the 'command_topic':", message);
        }
        break;

      case 'brightness_command_topic': {
        // `Number('')` and `Number('  ')` are 0, so a blank payload must be rejected explicitly.
        const brightness = Number(message);
        if (message.trim() === '' || !Number.isFinite(brightness)) {
          this.logger.warn("Received a non-numeric payload on the 'brightness_command_topic':", message);
          break;
        }
        this.brightness = brightness;
        break;
      }

      case 'color_temp_command_topic': {
        const colorTemp = Number(message);
        if (message.trim() === '' || !Number.isFinite(colorTemp)) {
          this.logger.warn("Received a non-numeric payload on the 'color_temp_command_topic':", message);
          break;
        }
        this.colorTemp = colorTemp;
        break;
      }

      case 'rgb_command_topic': {
        const raw = message.split(',');
        const parts = raw.map((v) => (v.trim() === '' ? NaN : Number(v)));
        if (parts.length !== 3 || parts.some((v) => !Number.isFinite(v))) {
          this.logger.warn("Received an invalid RGB payload on the 'rgb_command_topic':", message);
          break;
        }
        const [r, g, b] = parts;
        this.rgb = { r, g, b };
        break;
      }

      case 'effect_command_topic':
        this.effect = message;
        break;

      default:
        this.logger.warn('Received an unexpected command topic:', topicName);
    }
  }
}
