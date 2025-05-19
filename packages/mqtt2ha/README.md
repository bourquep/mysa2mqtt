# MQTT2HA

[![NPM Version](https://img.shields.io/npm/v/mqtt2ha)](https://www.npmjs.com/package/mqtt2ha)
[![CodeQL](https://github.com/bourquep/mqtt2ha/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/bourquep/mqtt2ha/actions/workflows/github-code-scanning/codeql)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A JavaScript/TypeScript library to create MQTT entities that are automatically discovered by Home Assistant.

## Features

- Easy creation of Home Assistant MQTT entities
- Automatic MQTT discovery configuration
- Supported entity types:
  - Binary Sensors
  - Buttons
  - Sensors
  - Switches
- TypeScript support with full type definitions
- Configurable availability reporting

## Installation

```bash
npm install mqtt2ha
```

## Requirements

- Node.js >= 22.4.0
- A running MQTT broker
- Home Assistant with MQTT integration enabled and discovery enabled

## Quick Start

See [example.ts](./test-environment/example.ts) for usage examples.

Here's a simple example of creating a motion sensor:

```typescript
import { BinarySensor, MqttSettings, DeviceConfiguration } from 'mqtt2ha';

// MQTT connection settings
const mqttSettings: MqttSettings = {
  host: 'localhost',
  port: 1883,
  username: 'your_username',
  password: 'your_password',
  client_name: 'my-mqtt-client'
};

// Device configuration
const device: DeviceConfiguration = {
  name: 'Room Sensor',
  manufacturer: 'My Company',
  model: 'Room Sensor v1',
  identifiers: 'room_sensor_1'
};

// Create a motion sensor
const motionSensor = new BinarySensor({
  mqtt: mqttSettings,
  component: {
    component: 'binary_sensor',
    name: 'Motion Sensor',
    device_class: 'motion',
    unique_id: 'motion_sensor_1',
    device
  }
});

// Write configuration to MQTT (required for discovery)
await motionSensor.writeConfig();

// Publish state changes
await motionSensor.setState(true);
```

### Reference documentation

The complete reference documentation for the `mqtt2ha` library can be found at
[https://bourquep.github.io/mqtt2ha/](https://bourquep.github.io/mqtt2ha/).

## Contributing

If you want to contribute to this project, please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines.

## License

`mqtt2ha` is licensed under the MIT License. This is a permissive license that allows you to use, modify, and
redistribute this software in both private and commercial projects. You can change the code and distribute your changes
without being required to release your source code. The MIT License only requires that you include the original
copyright notice and license text in any copy of the software or substantial portion of it.

## Copyright

© 2025 Pascal Bourque

## Support

For bug reports and feature requests, please use the [GitHub Issues](https://github.com/bourquep/mqtt2ha/issues) page.

For general questions and discussions, join our [Discussion Forum](https://github.com/bourquep/mqtt2ha/discussions).

## Acknowledgments

- [Home Assistant](https://www.home-assistant.io/) for their excellent home automation platform
- [MQTT.js](https://github.com/mqttjs/MQTT.js) for the robust MQTT client implementation
- [ha-mqtt-discoverable](https://github.com/unixorn/ha-mqtt-discoverable) for their excellent Python MQTT discovery
  implementation
