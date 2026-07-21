import { describe, expect, it } from 'vitest';
import { Camera } from '../src/components/camera';
import { discoveryConfig, lastClient, mqttSettings, stateTopic } from './helpers';

const TOPIC = stateTopic('camera', 'cam1', 'topic');

describe('Camera', () => {
  it('publishes a discovery config with the image topic', async () => {
    const camera = new Camera({ mqtt: mqttSettings, component: { component: 'camera', unique_id: 'cam1' } });
    const client = lastClient();
    await camera.writeConfig();
    const config = discoveryConfig(client, 'camera', 'cam1');
    expect(config.component).toBe('camera');
    expect(config.topic).toBe(TOPIC);
  });

  it('publishes raw image bytes retained without stringifying them', async () => {
    const camera = new Camera({ mqtt: mqttSettings, component: { component: 'camera', unique_id: 'cam1' } });
    const client = lastClient();
    // Non-UTF-8 bytes (a JPEG SOI marker + a lone 0xC0) would be corrupted if stringified.
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xc0]);
    await camera.publishImage(bytes);
    const publish = client.publishesFor(TOPIC).at(-1);
    expect(Buffer.isBuffer(publish?.payload)).toBe(true);
    expect(publish?.payload).toEqual(bytes);
    expect(publish?.opts).toMatchObject({ retain: true });
  });

  it('base64-encodes a buffer when image_encoding is b64', async () => {
    const camera = new Camera({
      mqtt: mqttSettings,
      component: { component: 'camera', unique_id: 'cam1', image_encoding: 'b64' }
    });
    const client = lastClient();
    await camera.publishImage(Buffer.from('abc'));
    expect(client.lastPayload(TOPIC)).toBe(Buffer.from('abc').toString('base64'));
  });
});
