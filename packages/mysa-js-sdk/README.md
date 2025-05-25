# Mysa Smart Thermostat JavaScript SDK

[![NPM Version](https://img.shields.io/npm/v/mysa-js-sdk)](https://www.npmjs.com/package/mysa-js-sdk)
[![CodeQL](https://github.com/bourquep/mysa-js-sdk/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/bourquep/mysa-js-sdk/actions/workflows/github-code-scanning/codeql)
[![CI: lint, build and release](https://github.com/bourquep/mysa-js-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/bourquep/mysa-js-sdk/actions/workflows/ci.yml)

A JavaScript SDK for accessing Mysa smart thermostats.

## Description

This SDK provides a simple and intuitive way to interact with Mysa smart thermostats, allowing developers to easily
query and update data from their Mysa smart thermostats, including real-time updates.

## Disclaimer

This SDK was developed without the consent of the Mysa Smart Thermostats company, and makes use of undocumented and
unsupported APIs. Use at your own risk, and be aware that Mysa may change the APIs at any time and break this repository
permanently.

## Installation

### Prerequisites

- You must own at least one [Mysa Smart Thermostat](https://getmysa.com) or have credentials to access a working setup.
- Node.js version 22.4.0 or higher.

```bash
# Using npm
npm install mysa-js-sdk

# Using yarn
yarn add mysa-js-sdk

# Using pnpm
pnpm add mysa-js-sdk
```

### Running the Example Application

To run the [example](example/main.ts) application, you'll need to provide your Mysa credentials. Create a `.env` file in
the project root:

```
MYSA_USERNAME=your-email@example.com
MYSA_PASSWORD=your-password
```

Then, run the example:

```bash
npm run example
```

## Using

The Mysa SDK provides a simple interface to interact with Mysa smart thermostats.

### Basic Authentication

```typescript
import { MysaApiClient } from 'mysa-js-sdk';

const client = new MysaApiClient();

// Login with email and password
await client.login('your-email@example.com', 'your-password');

// Check if authenticated
if (client.isAuthenticated) {
  console.log('Successfully authenticated!');
}
```

### Retrieving Thermostat Data

Once authenticated, you can access your thermostat data:

```typescript
// Get all devices
const devices = await client.getDevices();

// Access individual devices
for (const [deviceId, device] of Object.entries(devices.DevicesObj)) {
  console.log(`Device: ${device.Name}`);
  console.log(`Model: ${device.Model}`);
  console.log(`Location: ${device.Location}`);
  console.log(`Voltage: ${device.Voltage}V`);
}

// Set device temperature and mode
await client.setDeviceState('device-id', 22, 'heat'); // Set to 22°C in heat mode
await client.setDeviceState('device-id', undefined, 'off'); // Turn off
```

### Real-time Updates

The SDK also supports real-time updates:

```typescript
// Listen for temperature and status changes
client.emitter.on('statusChanged', (status) => {
  console.log(`Device ${status.deviceId}:`);
  console.log(`  Temperature: ${status.temperature}°C`);
  console.log(`  Humidity: ${status.humidity}%`);
  console.log(`  Set Point: ${status.setPoint}°C`);
  if (status.current !== undefined) {
    console.log(`  Current: ${status.current}A`);
  }
});

// Listen for setpoint changes
client.emitter.on('setPointChanged', (change) => {
  console.log(`Setpoint changed from ${change.previousSetPoint}°C to ${change.newSetPoint}°C`);
});

// Listen for device state changes
client.emitter.on('stateChanged', (change) => {
  console.log(`Device mode changed to: ${change.mode}`);
  console.log(`New setpoint: ${change.setPoint}°C`);
});

// Start real-time updates for all devices
const devices = await client.getDevices();
for (const deviceId of Object.keys(devices.DevicesObj)) {
  await client.startRealtimeUpdates(deviceId);
}
```

### Error Handling

The SDK provides specific error types to handle API errors:

```typescript
import { MysaApiClient, MysaApiError, UnauthenticatedError } from 'mysa-js-sdk';

const client = new MysaApiClient();

try {
  await client.login('user@example.com', 'password');
  const devices = await client.getDevices();
} catch (error) {
  if (error instanceof UnauthenticatedError) {
    console.error('Authentication failed:', error.message);
  } else if (error instanceof MysaApiError) {
    console.error(`API Error ${error.status}: ${error.statusText}`);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Advanced Configuration

You can customize the client with various options:

```typescript
import { MysaApiClient } from 'mysa-js-sdk';
import { pino } from 'pino';

// Create a custom logger
const logger = pino({
  name: 'mysa-client',
  level: 'debug'
});

// Configure client with options
const client = new MysaApiClient(undefined, {
  logger: logger,
  fetcher: fetch // Custom fetch implementation if needed
});

// Or restore from a saved session
const savedSession = {
  username: 'user@example.com',
  idToken: 'eyJ...',
  accessToken: 'eyJ...',
  refreshToken: 'abc123...'
};

const clientWithSession = new MysaApiClient(savedSession, { logger });

// Listen for session changes to persist them
client.emitter.on('sessionChanged', (newSession) => {
  if (newSession) {
    // Save session to storage (file, database, etc.)
    localStorage.setItem('mysaSession', JSON.stringify(newSession));
  } else {
    // Session expired or logged out
    localStorage.removeItem('mysaSession');
  }
});
```

### Reference documentation

The complete reference documentation for the `mysa-js-sdk` library can be found at
[https://bourquep.github.io/mysa-js-sdk/](https://bourquep.github.io/mysa-js-sdk/).

## Contributing

If you want to contribute to this project, please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines.

## License

`mysa-js-sdk` is licensed under the MIT License. This is a permissive license that allows you to use, modify, and
redistribute this software in both private and commercial projects. You can change the code and distribute your changes
without being required to release your source code. The MIT License only requires that you include the original
copyright notice and license text in any copy of the software or substantial portion of it.

## Copyright

© 2025 Pascal Bourque

## Support

For bug reports and feature requests, please use the [GitHub Issues](https://github.com/bourquep/mysa-js-sdk/issues)
page.

For general questions and discussions, join our [Discussion Forum](https://github.com/bourquep/mysa-js-sdk/discussions).

## Acknowledgments

This library would not be possible without the amazing work by [@dlenski](https://github.com/dlenski) in his
[mysotherm](https://github.com/dlenski/mysotherm) repository. He's the one who reversed-engineered the Mysa MQTT
protocol which is being used by this library.
