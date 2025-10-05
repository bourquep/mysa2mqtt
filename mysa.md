## High-level Architecture

```
+---------------------+         +-------------------+          +---------------------------+
|  Your Python app    |  REST   |  Mysa REST API    |          |  AWS IoT (MQTT over WSS) |
|  (library consumer) +-------->+  (devices/energy) |          |  wss://<iot-endpoint>/mqtt
|                     |         +-------------------+          +---------------------------+
|   ^          |                                                  ^                 |
|   |          | MQTT (WebSockets over TLS)                       |                 |
|   |          +--------------------------------------------------+                 |
|   |                                                                         MQTT |
|   |                                                                             \|/
|   |                                                                      +---------------+
|   +--------------------------------------------------------------------- +  Thermostat   |
|                                                                           +---------------+
```

* **REST** is used for device discovery and energy/history (e.g., `GET /devices/state`, `GET /energy/v3/...`).
* **Realtime** and **control** use **MQTT over secure WebSockets** to an **AWS IoT** endpoint:

  * Subscribe: `/v1/dev/{deviceId}/out`
  * Publish: `/v1/dev/{deviceId}/in`
  * QoS: **1**

## Connection & Auth Flow

Mysa’s app authenticates a user via **AWS Cognito** and then connects to **AWS IoT** over **WebSockets** with **SigV4** query-signed URL parameters.

1. **Authenticate** (Cognito User Pool) → obtain ID/Access token.
2. **Exchange** via Cognito **Identity Pool** → get temporary AWS creds (Access Key, Secret Key, Session Token).
3. **Presign** an AWS IoT **WebSocket** URL for service `iotdevicegateway`:
   * Host: `<account>-ats.iot.<region>.amazonaws.com`
   * Path: `/mqtt`
   * Query includes `X-Amz-Algorithm`, `X-Amz-Credential`, `X-Amz-Date`, `X-Amz-Security-Token`, `X-Amz-Signature`, etc.
4. **MQTT client** connects via **WSS** on **443**, `Sec-WebSocket-Protocol: mqtt`, TLS v1.2+.
5. **Subscribe** to `/v1/dev/{id}/out` and **publish** to `/v1/dev/{id}/in` with **QoS 1**.

## MQTT Topics & Semantics

### Topics

* **Status (device → cloud → client):**

  * ` /v1/dev/{deviceId}/out`
* **Commands (client → device):**

  * ` /v1/dev/{deviceId}/in`

> `{deviceId}` is a device identifier the REST API exposes via `/devices/state`. Cache a mapping `{id → friendly_name, model, rated_watts}`.

### QoS & Acks

* Use **QoS 1** for publish/subscribe.
* After you publish a command to `/in`, expect an **echo/ack** on `/out` with `body.success` and an updated `state`.


## Message Schemas

### 1) Realtime status (`/out`)

```jsonc
{
  "ver": "1.0",
  "src":  {"type": 1, "ref": "<deviceId>"},
  "time": 1712345678,                 // epoch seconds
  "msg":  40,                         // status message type (observed)
  "id":   8724654694500694114,        // message id
  "body": {
    "ambTemp": 19.1,                  // °C
    "hum": 41.5,                      // % (may be absent on some models)
    "stpt": 20.0,                     // target setpoint, °C
    "dtyCycle": 0.42                  // 0.0–1.0 (heater duty cycle)
  }
}
```

**Power** compute:

```
power_watts = round(dtyCycle * rated_watts)
```

> `rated_watts` can be stored per device in your library config.

### 2) Command (publish to `/in`)

Envelope and body are consistent across setpoint and mode changes:

```jsonc
{
  "ver": "1.0",
  "src":  {"type": 100, "ref": "<appRef>"},
  "dest": {"type": 1,   "ref": "<deviceId>"},
  "time": 1712345688,
  "msg":  44,
  "id":   1712345688123,
  "resp": 2,
  "body": {
    "ver": 1,
    "type": 4,
    "cmd": [ { "tm": -1, "sp": 20 } ]     // setpoint °C
  }
}
```

* **Setpoint command:** `cmd: [{ "tm": -1, "sp": <tempC> }]`
* **Mode command:**     `cmd: [{ "tm": -1, "md": <mode>  }]`

> `tm = -1` means “apply immediately” (observed).
> Modes observed: **`md=1` → heat**, **`md=3` → off**.

### 3) Command ack / echo (`/out`)

```jsonc
{
  "body": {
    "success": 1,
    "type": 4,
    "trig_src": 3,
    "state": { "md": 1, "sp": 20.0, "lk": 0, "ho": 1, "br": 100 }
  }
}
```

## REST Endpoints

* `GET /devices/state`

  * Discover devices and capabilities; map `{deviceId → friendlyName, model, firmware, ...}`.
* `GET /energy/v3/home/{id}`, `GET /energy/v3/device/{id}`

  * Historical energy/usage. (Realtime “power” still comes from `dtyCycle` heuristic in MQTT.)


## Python Library Design

### Package layout

```
mysa/
  __init__.py
  auth.py          # Cognito + Identity exchange (+ IoT endpoint lookup/presign)
  mqtt_client.py   # Paho-MQTT over WebSockets (AWS IoT SigV4)
  rest.py          # Device discovery + energy/history
  models.py        # dataclasses for Device, State, Command, Ack
  client.py        # High-level façade (discover, subscribe, setpoint, mode, etc.)
```

### Core models (dataclasses)

```python
from dataclasses import dataclass
from typing import Optional, Dict

@dataclass
class Device:
    id: str
    name: str
    model: str
    rated_watts: Optional[int] = None

@dataclass
class State:
    temperature_c: Optional[float] = None     # ambTemp
    humidity_pct: Optional[float] = None      # hum
    setpoint_c: Optional[float] = None        # stpt
    duty_cycle: Optional[float] = None        # dtyCycle (0..1)
    mode: Optional[str] = None                # "heat"/"off"/etc
    power_w: Optional[int] = None

MODE_MAP_NUM2STR = {1: "heat", 3: "off"}
MODE_MAP_STR2NUM = {"heat": 1, "off": 3}
```

### REST client (sketch)

```python
import httpx

class MysaRest:
    def __init__(self, base_url: str, jwt: str):
        self.base = base_url.rstrip("/")
        self.client = httpx.Client(headers={"Authorization": f"Bearer {jwt}"}, timeout=30)

    def list_devices(self) -> Dict[str, Device]:
        r = self.client.get(f"{self.base}/devices/state")
        r.raise_for_status()
        # map response into Device instances...
        ...
```

### MQTT over WSS

```python
import ssl, time
import paho.mqtt.client as mqtt

class MysaMqtt:
    def __init__(self, host: str, presigned_path_qs: str, port=443, keepalive=60):
        # host like: xxxxxxxx-ats.iot.<region>.amazonaws.com
        # presigned_path_qs is "/mqtt?...X-Amz-..." (no host, just path+query)
        self.client = mqtt.Client(transport="websockets")
        # Ensure 'mqtt' subprotocol
        self.client.ws_set_options(path=presigned_path_qs)
        self.client.tls_set(cert_reqs=ssl.CERT_REQUIRED)  # system CA trusts Amazon Root
        self.host, self.port, self.keepalive = host, port, keepalive

    def connect(self, on_message):
        self.client.on_message = on_message
        self.client.connect(self.host, self.port, self.keepalive)
        self.client.loop_start()

    def subscribe_device(self, device_id: str):
        topic = f"/v1/dev/{device_id}/out"
        self.client.subscribe(topic, qos=1)

    def publish_setpoint(self, device_id: str, temp_c: float):
        topic = f"/v1/dev/{device_id}/in"
        payload = {
            "ver":"1.0",
            "src":{"type":100,"ref":"python-lib"},
            "dest":{"type":1,"ref":device_id},
            "time": int(time.time()),
            "msg": 44, "id": int(time.time()*1000), "resp": 2,
            "body":{"ver":1,"type":4,"cmd":[{"tm":-1,"sp": float(temp_c)}]}
        }
        self.client.publish(topic, json.dumps(payload), qos=1)

    def publish_mode(self, device_id: str, mode: str):
        md = MODE_MAP_STR2NUM[mode]
        topic = f"/v1/dev/{device_id}/in"
        payload = { ... like above but "cmd":[{"tm":-1,"md": md}] }
        self.client.publish(topic, json.dumps(payload), qos=1)
```

### Parsing status & ack

```python
import json, math

def parse_out_message(topic: str, payload_str: str) -> State:
    js = json.loads(payload_str)
    body = js.get("body") or {}
    st = State()
    if "ambTemp" in body: st.temperature_c = body["ambTemp"]
    if "hum" in body:     st.humidity_pct = body["hum"]
    if "stpt" in body:    st.setpoint_c   = body["stpt"]
    if "dtyCycle" in body:
        st.duty_cycle = body["dtyCycle"]
    # Acks carry state as nested object:
    if "state" in body and isinstance(body["state"], dict):
        s = body["state"]
        if "sp" in s: st.setpoint_c = s["sp"]
        if "md" in s: st.mode = MODE_MAP_NUM2STR.get(s["md"], str(s["md"]))
    return st

def compute_power(state: State, rated_watts: int | None) -> None:
    if state.duty_cycle is not None and rated_watts:
        state.power_w = round(state.duty_cycle * rated_watts)
```

### Client façade

```python
class MysaClient:
    def __init__(self, auth, region="us-east-1"):
        self.auth = auth
        self.region = region
        self.devices: dict[str, Device] = {}
        self.states: dict[str, State] = {}

    def connect(self):
        # 1) obtain JWT for REST, 2) list devices, 3) presign WSS URL, 4) connect MQTT & subscribe
        ...

    def set_setpoint(self, device_id: str, temp_c: float):
        ...

    def set_mode(self, device_id: str, mode: str):
        ...
```

## Error Handling & Reconnect

* **Token expiry**: Cognito tokens & IoT presigned URLs expire; renew them and reconnect the MQTT client gracefully (backoff + resubscribe).
* **QoS 1**: Handle PUBACK timeouts by retrying publishes.
* **Ordering**: Don’t assume every echo arrives; keep a last-write-wins device state with timestamps.
* **Rate limiting**: Throttle commands (e.g., not more than 1 write per ~2–3 seconds per device).

## Power & Entities

* `sensor.temperature`    ← `ambTemp`
* `sensor.humidity`       ← `hum` (if present)
* `climate.setpoint`      ↔ `stpt` (via `sp` command)
* `sensor.power`          ← `round(dtyCycle * rated_watts)`
* `climate.mode`          ↔ `md` (`heat`/`off` mapping)

Persist `rated_watts` per device; optionally expose it as a configurable attribute.

## Currently Undefined

* Additional **`md`** values (beyond `1=heat`, `3=off`).
* Other message types (`msg` codes besides 40/44) and body variants.
* Device-specific fields across firmware versions.

## Implementation

* Obtain/refresh Cognito tokens (or test with captured presigned URL initially).
* Get temporary AWS creds & **presign** WSS `/mqtt`.
* Connect **paho-mqtt** (`transport="websockets"`, TLS).
* Subscribe `/v1/dev/+/out` (QoS 1).
* Publish setpoint/mode to `/v1/dev/{id}/in` (QoS 1).
* Parse `/out` status + command acks; update state.
* Compute `power` from `dtyCycle × rated_watts`.
* Expose a clean, typed API surface for apps/integrations.
