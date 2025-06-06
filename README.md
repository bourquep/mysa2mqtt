# mysa2mqtt

A Node.js application that bridges Mysa smart thermostats to MQTT, enabling integration with Home Assistant and other
home automation platforms.

## Features

- **MQTT Integration**: Exposes Mysa thermostats as MQTT devices compatible with Home Assistant's auto-discovery
- **Real-time Updates**: Live temperature, humidity, and power consumption monitoring
- **Full Control**: Set temperature, change modes (heat/off), and monitor thermostat status
- **Session Management**: Persistent authentication sessions to minimize API calls
- **Configurable Logging**: Support for JSON and pretty-printed log formats with adjustable levels

## Prerequisites

- Node.js 18+
- A Mysa account with configured thermostats
- An MQTT broker (like Mosquitto)
- Optional: Home Assistant for auto-discovery

## Installation

### Option 1: Global Installation (Recommended)

Install globally via npm to use the `mysa2mqtt` command anywhere:

```bash
npm install -g mysa2mqtt
```

### Option 2: Run with npx (No Installation Required)

Run directly without installing:

```bash
npx mysa2mqtt --help
```

### Option 3: Development Setup

For development or custom modifications:

1. Clone the repository:

   ```bash
   git clone https://github.com/bourquep/mysa2mqtt.git
   cd mysa2mqtt
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:

   ```bash
   npm run build
   ```

## Quick Start

1. **Install the CLI tool**:

   ```bash
   npm install -g mysa2mqtt
   ```

2. **Run with basic configuration**:

   ```bash
   mysa2mqtt --mqtt-host your-mqtt-broker.local --mysa-username your-email@example.com --mysa-password your-password
   ```

   Or use npx without installation:

   ```bash
   npx mysa2mqtt --mqtt-host your-mqtt-broker.local --mysa-username your-email@example.com --mysa-password your-password
   ```

3. **For persistent configuration**, create a `.env` file:

   ```bash
   M2M_MQTT_HOST=your-mqtt-broker.local
   M2M_MYSA_USERNAME=your-mysa-email@example.com
   M2M_MYSA_PASSWORD=your-mysa-password
   ```

   Then simply run:

   ```bash
   mysa2mqtt
   ```

4. **Check Home Assistant** (if using auto-discovery):
   - Go to Settings → Devices & Services
   - Look for automatically discovered Mysa devices
   - Configure and add to your dashboard

## Configuration

The application can be configured using either command-line arguments or environment variables. Environment variables
take precedence over command-line defaults.

### Required Configuration

| CLI Option            | Environment Variable | Description                      |
| --------------------- | -------------------- | -------------------------------- |
| `-H, --mqtt-host`     | `M2M_MQTT_HOST`      | Hostname of the MQTT broker      |
| `-u, --mysa-username` | `M2M_MYSA_USERNAME`  | Your Mysa account username/email |
| `-p, --mysa-password` | `M2M_MYSA_PASSWORD`  | Your Mysa account password       |

### Optional Configuration

#### MQTT Settings

| CLI Option                | Environment Variable    | Default     | Description                             |
| ------------------------- | ----------------------- | ----------- | --------------------------------------- |
| `-P, --mqtt-port`         | `M2M_MQTT_PORT`         | `1883`      | Port of the MQTT broker                 |
| `-U, --mqtt-username`     | `M2M_MQTT_USERNAME`     | -           | Username for MQTT broker authentication |
| `-B, --mqtt-password`     | `M2M_MQTT_PASSWORD`     | -           | Password for MQTT broker authentication |
| `-N, --mqtt-client-name`  | `M2M_MQTT_CLIENT_NAME`  | `mysa2mqtt` | Name of the MQTT client                 |
| `-T, --mqtt-topic-prefix` | `M2M_MQTT_TOPIC_PREFIX` | `mysa2mqtt` | Prefix for MQTT topics                  |

#### Application Settings

| CLI Option                | Environment Variable    | Default        | Description                                                             |
| ------------------------- | ----------------------- | -------------- | ----------------------------------------------------------------------- |
| `-l, --log-level`         | `M2M_LOG_LEVEL`         | `info`         | Log level: `silent`, `fatal`, `error`, `warn`, `info`, `debug`, `trace` |
| `-f, --log-format`        | `M2M_LOG_FORMAT`        | `pretty`       | Log format: `pretty`, `json`                                            |
| `-s, --mysa-session-file` | `M2M_MYSA_SESSION_FILE` | `session.json` | Path to Mysa session file                                               |

## Usage Examples

### Using Environment Variables (.env file)

Create a `.env` file:

```bash
# Required
M2M_MQTT_HOST=mosquitto.local
M2M_MYSA_USERNAME=user@example.com
M2M_MYSA_PASSWORD=your-password

# Optional
M2M_MQTT_PORT=1883
M2M_MQTT_USERNAME=mqtt-user
M2M_MQTT_PASSWORD=mqtt-password
M2M_LOG_LEVEL=info
M2M_LOG_FORMAT=pretty
```

Then run:

```bash
mysa2mqtt
```

Or with npx:

```bash
npx mysa2mqtt
```

### Using Command Line Arguments

```bash
mysa2mqtt \
  --mqtt-host mosquitto.local \
  --mqtt-port 1883 \
  --mqtt-username mqtt-user \
  --mqtt-password mqtt-password \
  --mysa-username user@example.com \
  --mysa-password your-password \
  --log-level debug \
  --log-format json
```

Or with npx:

```bash
npx mysa2mqtt \
  --mqtt-host mosquitto.local \
  --mqtt-port 1883 \
  --mqtt-username mqtt-user \
  --mqtt-password mqtt-password \
  --mysa-username user@example.com \
  --mysa-password your-password \
  --log-level debug \
  --log-format json
```

### Mixed Configuration

You can combine both approaches. Environment variables will override command-line defaults:

```bash
# .env file
M2M_MQTT_HOST=mosquitto.local
M2M_MYSA_USERNAME=user@example.com
M2M_MYSA_PASSWORD=your-password

# Command line (will override .env if present)
mysa2mqtt --log-level debug --mqtt-port 8883
```

## Home Assistant Integration

When using Home Assistant, devices will be automatically discovered and appear in:

- **Settings → Devices & Services → MQTT**
- **Climate entities** for temperature control
- **Sensor entities** for power monitoring

## Troubleshooting

### Common Issues

1. **Authentication Failures**

   - Verify your Mysa username and password
   - Check if session.json exists and is valid
   - Try deleting session.json to force re-authentication

2. **MQTT Connection Issues**

   - Verify MQTT broker hostname and port
   - Check MQTT credentials if authentication is required
   - Ensure the MQTT broker is accessible from your network

3. **No Devices Found**
   - Ensure your Mysa thermostats are properly configured in the Mysa app
   - Check logs for API errors
   - Verify your Mysa account has active devices

### Debug Mode

Enable debug logging to get more detailed information:

```bash
mysa2mqtt --log-level debug
```

Or with npx:

```bash
npx mysa2mqtt --log-level debug
```

Or set in environment:

```bash
M2M_LOG_LEVEL=debug
```

### Log Formats

- **Pretty format** (default): Human-readable colored output
- **JSON format**: Structured logging suitable for log aggregation

## Docker Usage

### Option 1: Pre-built Image (Recommended)

Use the official pre-built Docker image:

```bash
docker run -d --name mysa2mqtt \
  -e M2M_MQTT_HOST=your-mqtt-broker \
  -e M2M_MYSA_USERNAME=your-email \
  -e M2M_MYSA_PASSWORD=your-password \
  bourquep/mysa2mqtt:latest
```

With additional configuration:

```bash
docker run -d --name mysa2mqtt \
  -e M2M_MQTT_HOST=your-mqtt-broker \
  -e M2M_MQTT_PORT=1883 \
  -e M2M_MQTT_USERNAME=mqtt-user \
  -e M2M_MQTT_PASSWORD=mqtt-password \
  -e M2M_MYSA_USERNAME=your-email \
  -e M2M_MYSA_PASSWORD=your-password \
  -e M2M_LOG_LEVEL=info \
  -v $(pwd)/session.json:/app/session.json \
  bourquep/mysa2mqtt:latest
```

### Option 2: Build Your Own Image

If you prefer to build your own image, create a `Dockerfile`:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# Install mysa2mqtt globally
RUN npm install -g mysa2mqtt

CMD ["mysa2mqtt"]
```

Build and run:

```bash
docker build -t mysa2mqtt .
docker run -d --name mysa2mqtt \
  -e M2M_MQTT_HOST=your-mqtt-broker \
  -e M2M_MYSA_USERNAME=your-email \
  -e M2M_MYSA_PASSWORD=your-password \
  mysa2mqtt
```

### Option 3: Use Official Node.js Image

Run directly with the official Node.js image:

```bash
docker run -d --name mysa2mqtt \
  -e M2M_MQTT_HOST=your-mqtt-broker \
  -e M2M_MYSA_USERNAME=your-email \
  -e M2M_MYSA_PASSWORD=your-password \
  node:22-alpine \
  sh -c "npm install -g mysa2mqtt && mysa2mqtt"
```

### Docker Compose

For easier management, create a `docker-compose.yml` file:

```yaml
services:
  mysa2mqtt:
    image: bourquep/mysa2mqtt:latest
    container_name: mysa2mqtt
    restart: unless-stopped
    environment:
      - M2M_MQTT_HOST=your-mqtt-broker
      - M2M_MYSA_USERNAME=your-email
      - M2M_MYSA_PASSWORD=your-password
      - M2M_LOG_LEVEL=info
    volumes:
      - ./session.json:/app/session.json
```

Then run:

```bash
docker-compose up -d
```

## Development

### Prerequisites

- Node.js 22+
- npm

### Setup

```bash
git clone https://github.com/bourquep/mysa2mqtt.git
cd mysa2mqtt
npm install
```

### Scripts

- `npm run dev` - Run the application in development mode
- `npm run build` - Build the CLI executable
- `npm run lint` - Run ESLint
- `npm run style-lint` - Check code formatting with Prettier

### Project Structure

```
src/
├── main.ts           # Application entry point
├── options.ts        # Command-line argument parsing
├── thermostat.ts     # Thermostat MQTT integration
├── session.ts        # Session management
└── logger.ts         # Logging utilities
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm run lint && npm run style-lint`
5. Submit a pull request

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Support

- **Issues**: Report bugs and feature requests on [GitHub Issues](https://github.com/bourquep/mysa2mqtt/issues)
- **Discussions**: Join the conversation on [GitHub Discussions](https://github.com/bourquep/mysa2mqtt/discussions)

## Acknowledgments

- [mysa-js-sdk](https://github.com/bourquep/mysa-js-sdk) - Mysa API client library
- [mqtt2ha](https://github.com/bourquep/mqtt2ha) - MQTT to Home Assistant bridge library
- [Commander.js](https://github.com/tj/commander.js) - Command-line argument parsing
- [Pino](https://github.com/pinojs/pino) - Fast JSON logger
