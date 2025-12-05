# Mysa2MQTT Home Assistant Add-on

Expose your Mysa smart thermostats to Home Assistant via MQTT. This add-on wraps the `mysa2mqtt` bridge and publishes
climate and sensor entities using MQTT discovery, so devices show up automatically in Home Assistant.

## Installation

1. In Home Assistant: Settings → Add-ons → Add-on Store → ⋮ (top right) → Repositories.
2. Add the repository URL: `https://github.com/bourquep/mysa2mqtt`.
3. Install **Mysa2MQTT** from the list and open the add-on.

## Configuration

Set your Mysa credentials and MQTT details, then save and start the add-on. Defaults are shown below:

```yaml
mqtt_host: core-mosquitto     # required; your MQTT broker host/IP
mqtt_port: 1883
mqtt_username: ""             # optional
mqtt_password: ""             # optional
mqtt_topic_prefix: mysa2mqtt
mqtt_client_name: mysa2mqtt
mysa_username: ""             # required; your Mysa account email
mysa_password: ""             # required; your Mysa account password
log_level: info               # silent|fatal|error|warn|info|debug|trace
log_format: pretty            # pretty|json
temperature_unit: C           # C|F; must match your Home Assistant unit system
```

Important notes:

- The Mysa session is stored at `/data/session.json` so you stay logged in across restarts.
- `temperature_unit` must match Home Assistant (Settings → System → General) to avoid incorrect setpoints.
- If your broker requires auth, set both `mqtt_username` and `mqtt_password`.

## Usage

After starting the add-on:

- Home Assistant should auto-discover the thermostats under Settings → Devices & Services → MQTT.
- Control heat/off modes and setpoints from the climate entities; power and temperature sensors are published as well.

## Troubleshooting

- Check the add-on logs for connection or authentication errors.
- Delete `/data/session.json` if you need to force a fresh Mysa login.
- Ensure your MQTT broker is reachable from Home Assistant and credentials are correct.

## Support

Issues and feature requests: https://github.com/bourquep/mysa2mqtt/issues
