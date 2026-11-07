"""Small standard-library server for the Weather API dashboard and sensor feed."""

from __future__ import annotations

import argparse
import json
import math
import threading
from collections import deque
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from time import time
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent
DIST_ROOT = ROOT / "dist"
WEB_ROOT = DIST_ROOT if DIST_ROOT.is_dir() else ROOT
MAX_HISTORY = 5000
LIVE_WINDOW_SECONDS = 25
EXPO_WEB_ORIGINS = {"http://localhost:8083", "http://127.0.0.1:8083"}
DEMO_READING = {
    "temperature_c": 32.5,
    "humidity_percent": 43.0,
    "air_quality_raw": 142,
    "pm10": 62.7,
    "raining": False,
    "device_time": "10:7",
    "updated_at": None,
}


class ReadingStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._history: deque[dict] = deque(maxlen=MAX_HISTORY)
        self._latest: dict | None = None

    def add(self, reading: dict) -> dict:
        with self._lock:
            self._latest = reading
            self._history.append(reading)
            return dict(reading)

    def snapshot(self) -> dict:
        with self._lock:
            if self._latest is None:
                return {"mode": "demo", "latest": dict(DEMO_READING), "history": []}

            age = max(0.0, time() - self._latest["received_epoch"])
            mode = "live" if age <= LIVE_WINDOW_SECONDS else "stale"
            latest = {key: value for key, value in self._latest.items() if key != "received_epoch"}
            history = [
                {key: value for key, value in item.items() if key != "received_epoch"}
                for item in self._history
            ]
            return {"mode": mode, "latest": latest, "history": history}


STORE = ReadingStore()


class DashboardHandler(SimpleHTTPRequestHandler):
    server_version = "WeatherAPI/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        origin = self.headers.get("Origin")
        if origin in EXPO_WEB_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path.rstrip("/") or "/"
        if path == "/api/readings":
            self.send_json(200, STORE.snapshot())
            return
        if path == "/api/health":
            snapshot = STORE.snapshot()
            self.send_json(200, {"ok": True, "mode": snapshot["mode"]})
            return
        super().do_GET()

    def do_POST(self) -> None:
        path = urlsplit(self.path).path.rstrip("/")
        if path != "/api/readings":
            self.send_json(404, {"error": "Unknown API route"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.send_json(400, {"error": "Invalid Content-Length"})
            return
        if content_length <= 0 or content_length > 65536:
            self.send_json(413, {"error": "Reading payload must be between 1 and 65536 bytes"})
            return

        try:
            payload = json.loads(self.rfile.read(content_length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("Expected a JSON object")
            reading = normalize_reading(payload)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            self.send_json(400, {"error": str(error)})
            return

        saved = STORE.add(reading)
        saved.pop("received_epoch", None)
        self.send_json(201, {"ok": True, "reading": saved})

    def do_OPTIONS(self) -> None:
        path = urlsplit(self.path).path.rstrip("/")
        origin = self.headers.get("Origin")
        if path != "/api/readings" or origin not in EXPO_WEB_ORIGINS:
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Accept")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def log_message(self, format_string: str, *args) -> None:
        super().log_message(format_string, *args)


def number_value(payload: dict, key: str, alias: str, low: float, high: float | None = None):
    value = payload.get(key, payload.get(alias))
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError(f"{key} must be numeric")
    try:
        result = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"{key} must be numeric") from error
    if not math.isfinite(result) or result < low or (high is not None and result > high):
        bound = f"between {low} and {high}" if high is not None else f"at least {low}"
        raise ValueError(f"{key} must be {bound}")
    return result


def normalize_reading(payload: dict) -> dict:
    rain_value = payload.get("raining", payload.get("rain_detected", payload.get("RAIN_DROP", False)))
    if isinstance(rain_value, bool):
        raining = rain_value
    elif rain_value in (0, 1, "0", "1"):
        raining = bool(int(rain_value))
    else:
        raise ValueError("raining must be true, false, 0, or 1")

    return {
        "temperature_c": number_value(payload, "temperature_c", "TEMP", -80, 80),
        "humidity_percent": number_value(payload, "humidity_percent", "HUMIDITY", 0, 100),
        "air_quality_raw": number_value(payload, "air_quality_raw", "AQ", 0),
        "pm10": number_value(payload, "pm10", "PM1", 0),
        "raining": raining,
        "device_time": payload.get("device_time", payload.get("RTC")),
        "updated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "received_epoch": time(),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Serve the Weather API dashboard and local readings API")
    parser.add_argument("--host", default="0.0.0.0", help="Interface to listen on (default: all interfaces for LAN/mobile access)")
    parser.add_argument("--port", type=int, default=8080, help="HTTP port (default: 8080)")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), DashboardHandler)
    print(f"Weather API dashboard: http://127.0.0.1:{args.port}")
    print("Sensor endpoint: POST /api/readings")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Weather API server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
