"""Publish readings from the Raspberry Pi sensor loop to the Weather API."""

from __future__ import annotations

import json
import os
from urllib.error import URLError
from urllib.request import Request, urlopen


READINGS_URL = os.environ.get("WEATHER_API_URL", "http://127.0.0.1:8080/api/readings")


def _number_or_none(value):
    return None if value is None else float(value)


def send_reading(temperature, humidity, air_quality_raw, rain_drop, pm10, rtc_time=None):
    """Send one sensor sample. Returns True on success, False if the server is unreachable."""
    try:
        rain_detected = bool(int(rain_drop))
    except (TypeError, ValueError):
        rain_detected = bool(rain_drop)

    payload = {
        "temperature_c": _number_or_none(temperature),
        "humidity_percent": _number_or_none(humidity),
        "air_quality_raw": _number_or_none(air_quality_raw),
        "rain_detected": rain_detected,
        "pm10": _number_or_none(pm10),
        "device_time": None if rtc_time is None else str(rtc_time),
    }
    request = Request(
        READINGS_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=2) as response:
            return 200 <= response.status < 300
    except (URLError, TimeoutError, OSError):
        return False
