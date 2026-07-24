import { describe, expect, it } from 'vitest';
import { Image } from '../src/components/image';
import { lastClient, mqttSettings, stateTopic } from './helpers';

describe('Image', () => {
  it('publishes raw image bytes on the image topic by default', async () => {
    const image = new Image({ mqtt: mqttSettings, component: { component: 'image', unique_id: 'img1' } });
    const client = lastClient();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    await image.publishImage(bytes);
    const publish = client.publishesFor(stateTopic('image', 'img1', 'image')).at(-1);
    expect(Buffer.isBuffer(publish?.payload)).toBe(true);
    expect(publish?.payload).toEqual(bytes);
    expect(publish?.opts).toMatchObject({ retain: true });
  });

  it('does not publish an image when configured for the url topic', async () => {
    const image = new Image({ mqtt: mqttSettings, component: { component: 'image', unique_id: 'img1' } }, 'url_topic');
    const client = lastClient();
    await image.publishImage(Buffer.from('bytes'));
    expect(client.publishesFor(stateTopic('image', 'img1', 'image'))).toHaveLength(0);
  });

  it('publishes a URL on the url topic', async () => {
    const image = new Image({ mqtt: mqttSettings, component: { component: 'image', unique_id: 'img1' } }, 'url_topic');
    const client = lastClient();
    await image.publishUrl('http://example.com/pic.jpg');
    expect(client.lastPayload(stateTopic('image', 'img1', 'url'))).toBe('http://example.com/pic.jpg');
  });

  it('does not publish a URL when configured for the image topic', async () => {
    const image = new Image({ mqtt: mqttSettings, component: { component: 'image', unique_id: 'img1' } });
    const client = lastClient();
    await image.publishUrl('http://example.com/pic.jpg');
    expect(client.publishesFor(stateTopic('image', 'img1', 'url'))).toHaveLength(0);
  });
});
