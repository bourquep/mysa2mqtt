# mysa2mqtt

<!-- ALL-CONTRIBUTORS-BADGE:START - Do not remove or modify this section -->

[![All Contributors](https://img.shields.io/badge/all_contributors-1-orange.svg?style=flat-square)](#contributors-)

<!-- ALL-CONTRIBUTORS-BADGE:END -->

[![NPM Version](https://img.shields.io/npm/v/mysa2mqtt)](https://www.npmjs.com/package/mysa2mqtt)
[![Docker Hub](https://img.shields.io/docker/pulls/bourquep/mysa2mqtt)](https://hub.docker.com/r/bourquep/mysa2mqtt)
[![CodeQL](https://github.com/bourquep/mysa2mqtt/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/bourquep/mysa2mqtt/actions/workflows/github-code-scanning/codeql)
[![CI: lint, build and release](https://github.com/bourquep/mysa2mqtt/actions/workflows/ci.yml/badge.svg)](https://github.com/bourquep/mysa2mqtt/actions/workflows/ci.yml)

A Node.js application that bridges Mysa smart thermostats to MQTT, enabling integration with Home Assistant and other
home automation platforms.

## Features

- **MQTT Integration**: Exposes Mysa thermostats as MQTT devices compatible with Home Assistant's auto-discovery
- **Real-time Updates**: Live temperature, humidity, and power consumption monitoring
- **Full Control**: Set temperature, change modes (heat/off), and monitor thermostat status
- **Session Management**: Persistent authentication sessions to minimize API calls
- **Configurable Logging**: Support for JSON and pretty-printed log formats with adjustable levels
- **Graceful Shutdown**: Cleanly stops and marks entities offline on `SIGINT`/`SIGTERM` (Docker- and systemd-friendly)

## Supported hardware

Every model exposes a climate entity plus current-temperature and humidity sensors. A power sensor is created only for
models that actually measure power, and fan-speed control is exposed only for AC models. Capabilities are derived per
model (see `src/adapters/mysa/capabilities.ts`).

| Model Number | Description                                | Status                | Power sensor              | Notes                                                              |
| ------------ | ------------------------------------------ | --------------------- | ------------------------- | ----------------------------------------------------------------- |
| `BB-V1-x`    | Baseboard heater, V1                       | ✅ Tested and working | ✅ From measured current  |                                                                   |
| `BB-V2-x`    | Baseboard heater, V2                       | ⚠️ In progress        | ✅ Estimated, duty cycle  | Power = voltage × rated current × duty cycle                       |
| `BB-V2-x-L` | Baseboard heater LITE, V2                  | ⚠️ In progress        | ❌ Not created            | Device does not report power                                       |
| _(other)_    | In-floor heating                           | ⚠️ Should work, untested | ✅ When reported       | Unrecognized models are treated as heat-only baseboards           |
| `AC-V1-x`    | Mini-split heat pump / AC (IR controller)  | ⚠️ In progress        | ❌ Not created            | Heat/cool/dry/fan/auto + fan speed; swing/vane not controllable via the API |

## Disclaimer

This tool was developed without the consent of the Mysa Smart Thermostats company, and makes use of undocumented and
unsupported APIs. Use at your own risk, and be aware that Mysa may change the APIs at any time and break this tool
permanently.

## Prerequisites

- Node.js 22+
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

3. Run the tool:

   ```bash
   npm run dev
   ```

4. Run the checks (type-check, lint and unit tests):

   ```bash
   npm run typecheck
   npm run lint
   npm test
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

> [!IMPORTANT]
> The `M2M_TEMPERATURE_UNIT` option must match Home Assistant's unit system (Settings → General → Unit System)
> so setpoints and readings are interpreted correctly. If mismatched, climate entities will show incorrect values (e.g.
> 21°C treated as 21°F) and commands may result in unexpected temperatures.

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
| `-t, --temperature-unit`  | `M2M_TEMPERATURE_UNIT`  | `C`            | Temperature unit (`C` = Celsius, `F` = Fahrenheit)                      |

#### Adapters

`mysa2mqtt` is built around a small source-adapter architecture (see
[`docs/GENERAL_BRIDGE.md`](docs/GENERAL_BRIDGE.md)). The Mysa adapter is always enabled; additional adapters can be
turned on as needed.

| CLI Option                    | Environment Variable             | Default | Description                                                                                                      |
| ----------------------------- | -------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------- |
| `--system-sensors`            | `M2M_SYSTEM_SENSORS`             | `false` | Expose host system metrics (uptime, load, memory) as Home Assistant sensors (`true`/`false`)                    |
| `--tesla-wall-connector-host` | `M2M_TESLA_WALL_CONNECTOR_HOST`  | -       | Hostname/IP of a Tesla Wall Connector (Gen 3) to bridge (monitor-only — see below)                              |
| `--shelly-em-host`            | `M2M_SHELLY_EM_HOST`             | -       | Hostname/IP of a Shelly energy meter (Pro 3EM / EM / Gen1) to bridge — see below                                |
| `--shelly-plug-host`          | `M2M_SHELLY_PLUG_HOST`           | -       | Hostname/IP of a Shelly smart plug (Plus/Pro/Gen1) to bridge (power/energy + on/off control) — see below        |
| `--mysa-estimated-current`    | `M2M_MYSA_ESTIMATED_CURRENT`     | -       | Estimated current (A) used to compute power/energy for devices that don't report it (e.g. Lite models)          |
| `--mysa-energy-api`           | `M2M_MYSA_ENERGY_API`            | `false` | **Experimental.** Poll Mysa's cloud energy API; logs the raw response and best-effort publishes (`true`/`false`) |

#### Energy-only mode (safety switch)

| CLI Option       | Environment Variable | Default | Description                                                                                       |
| ---------------- | -------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| `--energy-only`  | `M2M_ENERGY_ONLY`    | `false` | Safety switch — publish **only** electricity-usage data: no control entities, no other telemetry. |

When `--energy-only true` is set, every adapter is restricted to publishing electricity-usage entities (power, energy,
cost). **No control surface** (thermostat climate entity, plug on/off switch, …) and **no non-energy telemetry**
(temperature, humidity, voltage/current, charging/session status, host metrics) are created at all — the entities are
never registered, so the guarantee is structural. Use this when you want the bridge to act purely as an energy monitor.

#### Tesla Wall Connector (EV charger)

Set `--tesla-wall-connector-host` to the LAN hostname/IP of a Gen 3 Wi-Fi Wall Connector to expose it in Home Assistant.
It reads the charger's local, unauthenticated JSON API (`/api/1/vitals`, `/api/1/lifetime`) and publishes **power,
current, grid voltage, session duration, handle temperature, lifetime energy**, plus **vehicle-connected** and
**charging** binary sensors. This is **monitor-only**: the Wall Connector's local API exposes no control (start/stop or
charge-rate), so no command entities are created.

#### Shelly energy meter

Set `--shelly-em-host` to the LAN hostname/IP of a Shelly energy meter (Gen2 `Pro 3EM`/`EM1` or a Gen1 `EM`/`3EM`) to
expose whole-circuit electricity usage in Home Assistant. The adapter auto-detects the device generation and publishes
**total power, current, voltage**, cumulative **energy** (kWh, `total_increasing`), returned/exported energy, and
**per-phase power** sensors. This is the recommended way to bring true whole-home/whole-circuit consumption onto the
bus.

#### Shelly smart plug

Set `--shelly-plug-host` to the LAN hostname/IP of a Shelly smart plug (Gen2 `Plus Plug S`/`Plus 1PM`/`Pro 1PM`, or a
Gen1 `Plug S`). The adapter auto-detects the generation and publishes **power**, cumulative **energy** (kWh), plus
**voltage/current/temperature** sensors **and a controllable on/off switch**. Under `--energy-only`, the switch and the
non-energy sensors are omitted and only power + energy (+ cost) are published.

### Power and energy

Power-capable thermostats expose a **Current power** (W) sensor and a cumulative **Energy** (kWh,
`total_increasing`) sensor suitable for the Home Assistant Energy dashboard. Power is measured directly on baseboard V1
units and estimated from the heating duty cycle on V2 units; energy is integrated from power over time and resets to zero
if the bridge restarts. AC controllers and "Lite" units don't measure power, so they get no power/energy sensors unless
you provide `--mysa-estimated-current` (which enables an estimate for duty-cycle devices such as the Lite).

#### Cost

| CLI Option        | Environment Variable | Default | Description                                                                            |
| ----------------- | -------------------- | ------- | -------------------------------------------------------------------------------------- |
| `--cost-per-kwh`  | `M2M_COST_PER_KWH`   | -       | Electricity rate per kWh. When set, energy adapters also publish a **Cost** sensor.    |
| `--currency`      | `M2M_CURRENCY`       | `$`     | Currency symbol used by cost sensors (only applies when `--cost-per-kwh` is set).      |

When `--cost-per-kwh` is **not** set, **no cost entity is created** — the bridge does not invent a rate it doesn't know,
leaving cost to be applied downstream (e.g. by the Home Assistant Energy dashboard). When it _is_ set, each energy
adapter publishes a `monetary` cost sensor of `energy × rate`.

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

## Contributing

If you want to contribute to this project, please read the [CONTRIBUTING.md](CONTRIBUTING.md) file for guidelines.

## License

`mysa2mqtt` is licensed under the MIT License. This is a permissive license that allows you to use, modify, and
redistribute this software in both private and commercial projects. You can change the code and distribute your changes
without being required to release your source code. The MIT License only requires that you include the original
copyright notice and license text in any copy of the software or substantial portion of it.

## Copyright

© 2025 Pascal Bourque

## Support

- **Issues**: Report bugs and feature requests on [GitHub Issues](https://github.com/bourquep/mysa2mqtt/issues)
- **Discussions**: Join the conversation on [GitHub Discussions](https://github.com/bourquep/mysa2mqtt/discussions)

## Acknowledgments

- [mysa-js-sdk](https://github.com/bourquep/mysa-js-sdk) - Mysa API client library
  - This library would not be possible without the amazing work by [@dlenski](https://github.com/dlenski) in his
    [mysotherm](https://github.com/dlenski/mysotherm) repository. He's the one who reversed-engineered the Mysa MQTT
    protocol which is being used by this library.

- [mqtt2ha](https://github.com/bourquep/mqtt2ha) - MQTT to Home Assistant bridge library
- [Commander.js](https://github.com/tj/commander.js) - Command-line argument parsing
- [Pino](https://github.com/pinojs/pino) - Fast JSON logger

## Contributors ✨

Thanks goes to these wonderful people ([emoji key](https://allcontributors.org/docs/en/emoji-key)):

<!-- ALL-CONTRIBUTORS-LIST:START - Do not remove or modify this section -->
<!-- prettier-ignore-start -->
<!-- markdownlint-disable -->
<table>
  <tbody>
    <tr>
      <td align="center" valign="top" width="14.28%"><a href="https://github.com/remiolivier"><img src="https://avatars.githubusercontent.com/u/1379047?v=4?s=100" width="100px;" alt="remiolivier"/><br /><sub><b>remiolivier</b></sub></a><br /><a href="https://github.com/bourquep/mysa2mqtt/commits?author=remiolivier" title="Code">💻</a></td>
    </tr>
  </tbody>
</table>

<!-- markdownlint-restore -->
<!-- prettier-ignore-end -->

<!-- ALL-CONTRIBUTORS-LIST:END -->

This project follows the [all-contributors](https://github.com/all-contributors/all-contributors) specification.
Contributions of any kind welcome!
