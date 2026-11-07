# Weather API Dashboard

A sensor dashboard for the Weather API project. The repository contains a React website, a small Python HTTP API, an iPhone-style web view, and a separate Expo / React Native app. Sensor readings come from the Python sensor loop; weather forecasts are a separate data source.

## How the system works

```text
Python sensor loop on the device
  └─ weather_api_bridge.send_reading(...)
       └─ POST http://<computer>:8080/api/readings
            └─ server.py validates and stores the reading in memory
                 ├─ React website polls GET /api/readings every 5 seconds
                 └─ React Native app polls the same endpoint every 5 seconds
```

The website uses Vite during development and is served by `server.py` after a production build. The Expo app is a separate mobile target. The iPhone-style web view is available at `/iphone.html`.

## Sensor fields

The bridge translates the values from the Python sensor loop into the API payload:

| Python variable | API field | Dashboard display | Meaning |
| --- | --- | --- | --- |
| `TEMP` | `temperature_c` | Temperature | Degrees Celsius |
| `HUMIDITY` | `humidity_percent` | Humidity | Relative humidity percent |
| `AQ` | `air_quality_raw` | Air quality raw | Raw ADC reading; it is not an AQI score |
| `RAIN_DROP` | `rain_detected` (stored as `raining`) | Rain input | `true` means rain detected; `false` means dry |
| `PM1` | `pm10` | PM10 sensor | Scaled reading from `get_pm10()` in the supplied sensor script |
| `RTC` | `device_time` | Device time | Time string from the device RTC |

The server adds `updated_at` when it receives a reading. This is the API receive time in UTC; it is separate from the device's `RTC` value.

The dashboard's sample preview is based on the supplied example log:

- Temperature: **32.5 °C**
- Humidity: **43.0%**
- Air quality raw: **142 ADC**
- PM10: **62.7** scaled units
- Rain: **dry**
- Device time: **10:7**

Sample values are shown when no live sensor data is available. They are not presented as live readings.

## API

### `POST /api/readings`

The bridge sends one JSON object per sensor-loop update. Example:

```json
{
  "temperature_c": 32.5,
  "humidity_percent": 43.0,
  "air_quality_raw": 142,
  "rain_detected": false,
  "pm10": 62.7,
  "device_time": "10:7"
}
```

On success, the server returns HTTP `201` with the normalized reading and its `updated_at` timestamp. Numeric sensor values are checked for valid ranges; invalid readings return HTTP `400` with an error message. `GET /api/readings` returns a snapshot in this shape:

```json
{
  "mode": "live",
  "latest": {
    "temperature_c": 32.5,
    "humidity_percent": 43.0,
    "air_quality_raw": 142,
    "raining": false,
    "pm10": 62.7,
    "device_time": "10:7",
    "updated_at": "<UTC receive timestamp>"
  },
  "history": []
}
```

`GET /api/health` returns whether the API is responding and its current data mode.

### Data modes and history

- **demo**: the server has not received a sensor payload since it started; the dashboard uses the clearly labeled sample values.
- **live**: the most recent payload arrived within the last 25 seconds.
- **stale**: a payload was received, but there has been no update for more than 25 seconds; the last received values remain visible.

The server keeps up to 5,000 readings in memory. The dashboard charts use actual API history, generally showing the latest 12 points. History is cleared when `server.py` restarts; it is not persisted to disk.

## Run the website

Requirements: Python 3.10+ and Node.js/npm.

Install the web dependencies once:

```powershell
npm install
```

Open two terminals in the project folder (`D:\Weather API\weather-api`). Start the API in the first:

```powershell
py server.py --host 0.0.0.0 --port 8080
```

Start the Vite development server in the second:

```powershell
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173` for the main dashboard or `http://localhost:5173/iphone.html` for the iPhone-style web view. On a phone on the same Wi-Fi, use the computer's LAN IP in place of `localhost`. Vite proxies `/api` requests to the Python server on port `8080`.

For the production website:

```powershell
npm run build
py server.py --host 0.0.0.0 --port 8080
```

Then open `http://localhost:8080` or `http://localhost:8080/iphone.html`. When `dist/` exists, `server.py` serves the built website from that folder.

## Connect the Python sensor script

`weather_api_bridge.py` uses only Python's standard library. Copy it next to the sensor script on the Raspberry Pi (or other sensor computer). Set the API address to the computer running `server.py`:

```bash
export WEATHER_API_URL="http://<computer-LAN-IP>:8080/api/readings"
```

Import the helper and call it inside the existing sensor loop after those variables are read:

```python
from weather_api_bridge import send_reading

# TEMP, HUMIDITY, AQ, RAIN_DROP, PM1, and RTC have been read here.
send_reading(TEMP, HUMIDITY, AQ, RAIN_DROP, PM1, RTC)
```

`send_reading` posts JSON to the API and returns `True` on success or `False` if the server cannot be reached. It uses a short timeout so a network issue does not hold the sensor loop for long. If the send fails, check that the API server is running, the URL uses the computer's reachable LAN IP, and both devices can reach each other.

## Run the React Native app

The native app lives in `mobile-native/` and uses the same sensor API. Create its environment file from the example:

```powershell
cd mobile-native
npm install
Copy-Item .env.example .env
```

Edit `.env` and set `EXPO_PUBLIC_WEATHER_API_URL` to the computer running `server.py`:

| Target | API URL example |
| --- | --- |
| Physical phone on the same Wi-Fi | `http://<computer-LAN-IP>:8080/api/readings` |
| Android emulator | `http://10.0.2.2:8080/api/readings` |
| iOS simulator | `http://127.0.0.1:8080/api/readings` |

Start Expo:

```powershell
npm start
```

Scan the QR code with Expo Go, or press `a` for an Android emulator. Run `npm run web -- --port 8083` to use the Expo web target; the Python server allows browser requests from port `8083`. iOS simulator builds require macOS.

The app polls sensor data every five seconds and supports pull-to-refresh. If `EXPO_PUBLIC_WEATHER_API_URL` is unset or the API is unreachable, it shows labeled sample readings. To export the Expo web bundle:

```powershell
npx expo export --platform web --output-dir dist-web
```

## Forecasts

Sensor readings and weather forecasts are separate. The main React dashboard and the React Native app request weather forecasts from Open-Meteo; the sensor values still come from `/api/readings`. The dedicated `iphone.html` web view currently labels its hourly and seven-day outlook as sample forecast content.

## Project files

```text
server.py                 Python API and production web server
weather_api_bridge.py     Helper called by the Python sensor loop
src/App.jsx               Main React dashboard
src/IPhoneWeatherApp.jsx  iPhone-style web view
mobile-native/App.js      Expo / React Native app
```
