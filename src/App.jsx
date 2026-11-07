import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import WeatherGlyph from "./WeatherGlyph.jsx";
import { gsap } from "gsap";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from "three";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const demoReadings = { temperature_c: 32.5, humidity_percent: 43.0, air_quality_raw: 142, pm10: 62.7, raining: false, device_time: "10:7" };
const forecastUrl = `https://api.open-meteo.com/v1/forecast?${new URLSearchParams({
  latitude: "13.0827",
  longitude: "80.2707",
  current: "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m",
  hourly: "temperature_2m,precipitation_probability,weather_code,is_day",
  daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
  timezone: "Asia/Kolkata",
  forecast_days: "7",
})}`;
const forecastTimezone = "Asia/Kolkata";

function weatherCodeInfo(code, isDay = true) {
  const value = Number(code);
  if (value === 0) return { label: isDay ? "Clear sky" : "Clear night", icon: isDay ? "sunny" : "night" };
  if (value === 1) return { label: "Mainly clear", icon: isDay ? "partly" : "night" };
  if (value === 2) return { label: "Partly cloudy", icon: "partly" };
  if (value === 3) return { label: "Overcast", icon: "cloudy" };
  if (value === 45 || value === 48) return { label: "Fog", icon: "fog" };
  if ([51, 53, 55, 56, 57].includes(value)) return { label: "Drizzle", icon: "drizzle" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return { label: "Rain showers", icon: "rain" };
  if ([71, 73, 75, 77, 85, 86].includes(value)) return { label: "Snow", icon: "snow" };
  if ([95, 96, 99].includes(value)) return { label: "Thunderstorm", icon: "storm" };
  return { label: "Conditions unavailable", icon: "cloudy" };
}

function forecastDate(value) {
  if (!value) return null;
  return new Date(value.length === 10 ? `${value}T12:00:00+05:30` : `${value}:00+05:30`);
}

function forecastHourLabel(value) {
  const date = forecastDate(value);
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", timeZone: forecastTimezone }).format(date) : "—";
}

function forecastClock(value) {
  const date = forecastDate(value);
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: forecastTimezone }).format(date) : "—";
}

function forecastDayLabel(value, today) {
  if (value === today) return "Today";
  const date = forecastDate(value);
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: forecastTimezone }).format(date) : "—";
}

function forecastBadgeLabel(status) {
  return { "LIVE FORECAST": "LIVE", "CACHED FORECAST": "CACHED", "FORECAST UNAVAILABLE": "OFFLINE" }[status] || status;
}
const pages = [
  { id: "sensors", label: "Sensors" },
  { id: "history", label: "History" },
  { id: "weather", label: "Weather" },
];
const sensorDetailPages = [
  { id: "temperature", name: "Temperature sensor", icon: "temperature", valueCaption: "CURRENT TEMPERATURE", metadata: "DHT11 · GPIO 18", key: "temperature_c", digits: 1, unit: "°C", field: "TEMP", apiField: "temperature_c", historyTitle: "Temperature readings", description: "A reading from the DHT11 sensor, sent by Python.", companion: { key: "humidity_percent", label: "Humidity · DHT11", digits: 0, unit: "%" } },
  { id: "humidity", name: "Humidity sensor", icon: "humidity", valueCaption: "CURRENT HUMIDITY", metadata: "DHT11 · GPIO 18", key: "humidity_percent", digits: 0, unit: "%", field: "HUMIDITY", apiField: "humidity_percent", historyTitle: "Humidity readings", description: "Relative humidity measured by the DHT11 and sent by Python.", companion: { key: "temperature_c", label: "Temperature · DHT11", digits: 1, unit: "°C" } },
  { id: "pm10", name: "PM10 sensor", icon: "wind", metadata: "PARTICULATE MATTER SENSOR", key: "pm10", digits: 1, unit: "", valueCaption: "SCALED READING", field: "PM1", apiField: "pm10", historyTitle: "PM10 readings", description: "The particulate reading returned by the Python sensor code, shown in its scaled units.", companion: { key: "air_quality_raw", label: "Air quality raw", digits: 0, unit: " ADC" } },
  { id: "rain", name: "Rain input", icon: "rain", metadata: "DIGITAL SENSOR · GPIO 7", key: "raining", unit: "", valueCaption: "DIGITAL INPUT STATE", field: "RAIN_DROP", apiField: "rain_detected", historyTitle: "Rain input history", description: "The digital rain input state read by Python on GPIO 7.", companion: { key: "humidity_percent", label: "Humidity · DHT11", digits: 0, unit: "%" } },
  { id: "air-quality", name: "Air quality sensor", icon: "air", metadata: "ANALOG SENSOR · CH 1", key: "air_quality_raw", digits: 0, unit: "ADC", valueCaption: "RAW ADC SIGNAL", field: "AQ", apiField: "air_quality_raw", historyTitle: "Raw sensor readings", description: "Raw analog sensor values from Python. This reading is not an AQI score.", companion: { key: "pm10", label: "PM10 · scaled", digits: 1, unit: "" } },
];
const sensorDetailById = Object.fromEntries(sensorDetailPages.map((sensor) => [sensor.id, sensor]));
const historyMetrics = [
  { key: "temperature_c", name: "Temperature", unit: "°C", digits: 1, area: "history-temperature" },
  { key: "humidity_percent", name: "Humidity", unit: "%", digits: 0, area: "history-humidity" },
  { key: "pm10", name: "PM10", unit: "scaled", digits: 1, area: "history-pm10" },
  { key: "air_quality_raw", name: "Air quality raw", unit: "ADC", digits: 0, area: "history-air" },
];

function pageFromHash() {
  const page = window.location.hash.slice(1);
  return sensorDetailById[page] || pages.some((item) => item.id === page) ? page : "sensors";
}

function number(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function forecastNumber(value, digits = 0) {
  return value === null || value === undefined || value === "" ? "—" : number(value, digits);
}

function time(value) {
  if (!value) return "--:--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

function makeSmoothPath(points) {
  if (!points.length) return "";
  return points.reduce((path, current, index) => {
    if (index === 0) return `M ${current.x} ${current.y}`;
    const previous = points[index - 1];
    const midpoint = (previous.x + current.x) / 2;
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${current.y}, ${current.x} ${current.y}`;
  }, "");
}

function WeatherScene() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let renderer;
    let resizeObserver;
    let animationFrame = 0;
    let disposed = false;
    const scene = new Scene();
    const camera = new PerspectiveCamera(55, 1, 0.1, 100);
    camera.position.z = 9;
    const sceneGroup = new Group();
    scene.add(sceneGroup);

    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
    } catch {
      return undefined;
    }

    const positions = [];
    const colors = [];
    for (let index = 0; index < 130; index += 1) {
      positions.push((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 8);
      const tint = Math.random();
      colors.push(0.42 + tint * 0.48, 0.54 + tint * 0.26, 0.68 + tint * 0.18);
    }
    const particleGeometry = new BufferGeometry();
    particleGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    particleGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    const particles = new Points(particleGeometry, new PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false, sizeAttenuation: true }));
    sceneGroup.add(particles);

    const weatherOrb = new Mesh(
      new SphereGeometry(1.35, 32, 24),
      new MeshBasicMaterial({ color: 0x64bfff, transparent: true, opacity: 0.038, wireframe: true }),
    );
    weatherOrb.position.set(5.5, 1.6, -3);
    sceneGroup.add(weatherOrb);

    const blueOrb = new Mesh(
      new SphereGeometry(1.9, 28, 20),
      new MeshBasicMaterial({ color: 0x63c6ff, transparent: true, opacity: 0.035, wireframe: true }),
    );
    blueOrb.position.set(-6.4, -3.4, -5);
    sceneGroup.add(blueOrb);

    const render = () => {
      if (disposed) return;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    const resize = () => {
      const width = canvas.clientWidth || window.innerWidth;
      const height = canvas.clientHeight || window.innerHeight;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    render();

    const motion = gsap.to(sceneGroup.rotation, { y: 0.14, x: 0.05, duration: 16, ease: "sine.inOut", yoyo: true, repeat: -1 });
    const orbMotion = gsap.to(weatherOrb.rotation, { y: Math.PI * 2, duration: 45, ease: "none", repeat: -1 });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      motion.kill();
      orbMotion.kill();
      particleGeometry.dispose();
      particles.material.dispose();
      weatherOrb.geometry.dispose();
      weatherOrb.material.dispose();
      blueOrb.geometry.dispose();
      blueOrb.material.dispose();
      renderer.dispose();
    };
  }, []);

  return <canvas ref={canvasRef} className="weather-scene" aria-hidden="true" />;
}

function useDashboardMotion(rootRef, activePage) {
  useEffect(() => {
    if (!rootRef.current) return undefined;
    const context = gsap.context(() => {
      gsap.fromTo(".weather-card", { autoAlpha: 0, y: 14, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.62, stagger: 0.07, ease: "power3.out" });
      gsap.fromTo(".temperature-curve", { strokeDashoffset: 1000 }, { strokeDashoffset: 0, duration: 1.45, delay: 0.25, ease: "power2.out" });
      gsap.fromTo(".weather-orb", { y: 3, rotation: -4 }, { y: -4, rotation: 3, duration: 3, repeat: -1, yoyo: true, ease: "sine.inOut" });
      gsap.fromTo(".weather-sheen", { xPercent: -120 }, { xPercent: 120, duration: 1.25, delay: 0.5, ease: "power1.inOut" });
    }, rootRef);
    return () => context.revert();
  }, [rootRef, activePage]);
}

function TemperatureChart({ readings, dataKey = "temperature_c", digits = 1, chartLabel = "Recent temperature readings", emptyLabel = "No readings yet" }) {
  const fillId = `sensor-chart-fill-${useId().replaceAll(":", "")}`;
  const valid = readings.filter((reading) => reading[dataKey] !== null && reading[dataKey] !== undefined && reading[dataKey] !== "" && Number.isFinite(Number(reading[dataKey])));
  if (!valid.length) return <div className="chart-empty">{emptyLabel}</div>;
  const values = valid.map((reading) => Number(reading[dataKey]));
  const min = Math.floor(Math.min(...values) - 1);
  const max = Math.ceil(Math.max(...values) + 1);
  const span = Math.max(max - min, 2);
  const points = values.map((value, index) => ({ x: 12 + (index / Math.max(values.length - 1, 1)) * 468, y: 128 - ((value - min) / span) * 102 }));
  const path = makeSmoothPath(points);
  const last = points[points.length - 1];
  return (
    <div className="chart-wrap">
      <div className="chart-labels-y"><span>{max.toFixed(digits)}</span><span>{((min + max) / 2).toFixed(digits)}</span><span>{min.toFixed(digits)}</span></div>
      <svg className="temperature-chart" viewBox="0 0 490 156" preserveAspectRatio="none" role="img" aria-label={chartLabel}>
        <defs><linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#83d4ff" stopOpacity=".2" /><stop offset="1" stopColor="#83d4ff" stopOpacity="0" /></linearGradient></defs>
        <path className="chart-grid-lines" d="M0 26H490M0 76H490M0 128H490" />
        <path className="chart-fill" d={`${path} L 480 145 L 12 145 Z`} fill={`url(#${fillId})`} />
        <path className="temperature-curve" d={path} pathLength="1000" />
        <circle className="chart-current-point" cx={last.x} cy={last.y} r="4.5" />
      </svg>
      <div className="chart-labels-x"><span>{time(valid[0].updated_at)}</span><span>{time(valid[Math.floor(valid.length / 2)].updated_at)}</span><span>{time(valid.at(-1).updated_at)}</span></div>
    </div>
  );
}

function RainInputHistory({ readings }) {
  const states = readings.map((reading) => reading.raining ?? reading.rain_detected ?? reading.RAIN_DROP).filter((value) => value !== null && value !== undefined).slice(-12);
  if (!states.length) return <div className="chart-empty">No rain input history yet</div>;
  return <div className="rain-input-history" role="img" aria-label="Recent rain input states">
    {states.map((value, index) => {
      const wet = value === true || value === 1 || value === "1";
      return <div className={`rain-input-history-item ${wet ? "is-wet" : "is-dry"}`} key={`${index}-${String(value)}`}><i /><span>{wet ? "WET" : "DRY"}</span></div>;
    })}
  </div>;
}

function SensorTile({ icon: Icon, iconProps, name, value, unit, caption, onClick }) {
  const Tile = onClick ? "button" : "article";
  return (
    <Tile className={`sensor-tile weather-card ${onClick ? "sensor-tile-button" : ""}`} onClick={onClick} type={onClick ? "button" : undefined} aria-label={onClick ? `Open ${name} details` : undefined}>
      <div className="sensor-tile-heading"><Icon size={20} {...iconProps} /><span>{name}</span></div>
      <strong>{value}<small>{unit}</small></strong>
      <span className="sensor-caption">{caption}</span>
    </Tile>
  );
}

function GaugeRing({ value }) {
  const normalized = Math.max(0, Math.min(Number(value) || 0, 1023));
  const circumference = 2 * Math.PI * 38;
  const progress = (normalized / 1023) * circumference;
  return (
    <div className="air-gauge-wrap">
      <svg className="air-gauge" viewBox="0 0 100 100" role="img" aria-label={`${Math.round(normalized)} raw analog air-quality sensor signal`}>
        <circle className="gauge-track" cx="50" cy="50" r="38" />
        <circle className="gauge-value" cx="50" cy="50" r="38" strokeDasharray={`${progress} ${circumference}`} />
        <circle className="gauge-marker" cx="50" cy="12" r="2.3" />
      </svg>
      <div className="gauge-center"><small>RAW SIGNAL</small><strong>{number(normalized)}</strong><span>ADC</span></div>
    </div>
  );
}

export default function App() {
  const rootRef = useRef(null);
  const [activePage, setActivePage] = useState(pageFromHash);
  const [payload, setPayload] = useState({ mode: "demo", latest: demoReadings, history: [] });
  const [forecastData, setForecastData] = useState(null);
  const [forecastStatus, setForecastStatus] = useState("LOADING");
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshReadings = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/readings", { cache: "no-store" });
      if (!response.ok) throw new Error(`Readings API returned ${response.status}`);
      const readings = await response.json();
      setPayload({
        ...readings,
        latest: readings.mode === "demo" ? demoReadings : readings.latest || demoReadings,
        apiUnavailable: false,
      });
    } catch {
      setPayload({ mode: "demo", latest: demoReadings, history: [], apiUnavailable: true });
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);
  const refreshForecast = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(forecastUrl, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error(`Forecast API returned ${response.status}`);
      const data = await response.json();
      if (!data.current || !data.hourly?.time?.length || !data.daily?.time?.length) throw new Error("Forecast response is incomplete");
      setForecastData(data);
      setForecastStatus("LIVE FORECAST");
      setForecastUpdatedAt(Date.now());
    } catch {
      setForecastStatus((current) => current === "LIVE FORECAST" || current === "CACHED FORECAST" ? "CACHED FORECAST" : "FORECAST UNAVAILABLE");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);
  useEffect(() => {
    refreshReadings();
    const interval = window.setInterval(() => refreshReadings(), 5000);
    return () => window.clearInterval(interval);
  }, [refreshReadings]);
  useEffect(() => {
    refreshForecast();
    const interval = window.setInterval(refreshForecast, 30 * 60 * 1000);
    return () => window.clearInterval(interval);
  }, [refreshForecast]);
  useEffect(() => {
    const updatePage = () => setActivePage(pageFromHash());
    window.addEventListener("hashchange", updatePage);
    return () => window.removeEventListener("hashchange", updatePage);
  }, []);
  useDashboardMotion(rootRef, activePage);

  const latest = payload.latest || demoReadings;
  const apiHistory = useMemo(() => Array.isArray(payload.history) ? payload.history.slice(-120) : [], [payload.history]);
  const history = apiHistory;
  const isLive = payload.mode === "live";
  const isStale = payload.mode === "stale";
  const raining = Boolean(latest.raining ?? latest.rain_detected);
  const temp = number(latest.temperature_c, 1);
  const statusText = isLive ? "LIVE SENSOR" : isStale ? "STALE DATA" : payload.apiUnavailable ? "API OFFLINE · SAMPLE DATA" : "WAITING FOR SENSOR";
  const sensorDetail = sensorDetailById[activePage];
  const detailSamples = sensorDetail && sensorDetail.id !== "rain" ? apiHistory.map((reading) => Number(reading[sensorDetail.key])).filter(Number.isFinite) : [];
  const detailLow = detailSamples.length ? Math.min(...detailSamples).toFixed(sensorDetail?.digits || 0) : "—";
  const detailHigh = detailSamples.length ? Math.max(...detailSamples).toFixed(sensorDetail?.digits || 0) : "—";
  const detailValue = sensorDetail?.id === "rain" ? (raining ? "WET" : "DRY") : sensorDetail ? number(latest[sensorDetail.key], sensorDetail.digits || 0) : "—";
  const detailCompanion = sensorDetail?.companion;
  const detailCompanionValue = detailCompanion ? number(latest[detailCompanion.key], detailCompanion.digits || 0) : "—";
  const sensorDetailStatus = isLive ? "LIVE PYTHON FEED" : isStale ? "LAST PYTHON READING" : "SAMPLE DATA";
  const latestApiReading = apiHistory.at(-1);
  const forecastCurrent = forecastData?.current;
  const forecastDaily = forecastData?.daily;
  const currentForecastWeather = forecastCurrent ? weatherCodeInfo(forecastCurrent.weather_code, forecastCurrent.is_day === 1) : null;
  const todayForecastIndex = forecastDaily?.time?.indexOf(forecastCurrent?.time?.slice(0, 10)) ?? -1;
  const todayForecast = todayForecastIndex >= 0 ? {
    high: forecastDaily.temperature_2m_max[todayForecastIndex],
    low: forecastDaily.temperature_2m_min[todayForecastIndex],
  } : null;
  const hourlyData = forecastData?.hourly;
  const nextForecastHourIndex = hourlyData?.time?.findIndex((hour) => forecastDate(hour) > new Date()) ?? -1;
  const hourlyForecast = nextForecastHourIndex >= 0 ? hourlyData.time.slice(nextForecastHourIndex, nextForecastHourIndex + 6).map((hour, offset) => {
    const index = nextForecastHourIndex + offset;
    return { time: forecastHourLabel(hour), temperature: hourlyData.temperature_2m[index], chance: hourlyData.precipitation_probability[index], ...weatherCodeInfo(hourlyData.weather_code[index], hourlyData.is_day[index] === 1) };
  }) : [];
  const dailyForecast = forecastDaily && forecastCurrent ? forecastDaily.time.map((day, index) => ({
    day: forecastDayLabel(day, forecastCurrent.time.slice(0, 10)),
    date: day,
    high: forecastDaily.temperature_2m_max[index],
    low: forecastDaily.temperature_2m_min[index],
    chance: forecastDaily.precipitation_probability_max[index],
    ...weatherCodeInfo(forecastDaily.weather_code[index], true),
  })) : [];
  const rainForecast = dailyForecast.slice(0, 3);
  const forecastTemperatureValues = dailyForecast.flatMap((day) => [Number(day.low), Number(day.high)]).filter(Number.isFinite);
  const forecastTemperatureMin = forecastTemperatureValues.length ? Math.floor(Math.min(...forecastTemperatureValues) - 1) : 20;
  const forecastTemperatureSpan = forecastTemperatureValues.length ? Math.max(2, Math.ceil(Math.max(...forecastTemperatureValues) + 1) - forecastTemperatureMin) : 16;
  const forecastSunrise = todayForecastIndex >= 0 ? forecastDaily.sunrise[todayForecastIndex] : null;
  const forecastSunset = todayForecastIndex >= 0 ? forecastDaily.sunset[todayForecastIndex] : null;

  function exportReadings() {
    const rows = [
      ["Weather API sensor readings"],
      ["Metric", "Value", "Unit"],
      ["Temperature", latest.temperature_c ?? "", "°C"],
      ["Humidity", latest.humidity_percent ?? "", "%"],
      ["PM10 sensor", latest.pm10 ?? "", "sensor units"],
      ["Air quality signal", latest.air_quality_raw ?? "", "raw ADC · not an AQI"],
      ["Rain detected", raining ? "Yes" : "No", "digital input"],
      ["Device time", latest.device_time ?? "", "RTC"],
      ["Updated", latest.updated_at || "", ""],
      ...history.map((reading) => [reading.updated_at || "", reading.temperature_c ?? "", "°C"]),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "weather-api-readings.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="weather-app" ref={rootRef}>
      <WeatherScene />
      <header className="app-header">
        <a className="brand-lockup" href="#sensors" aria-label="Weather API sensors"><span className="brand-symbol">W</span><span>Weather<small>STATION 01</small></span></a>
        <div className="header-context"><span className="context-dot" /> Chennai <i>/</i> Local sensor network</div>
        <nav className="app-nav" aria-label="Dashboard pages">
          {pages.map(({ id, label }) => {
            const isActive = activePage === id || (Boolean(sensorDetail) && id === "sensors");
            return <a key={id} href={`#${id}`} className={`app-nav-link ${isActive ? "active" : ""}`} aria-current={isActive ? "page" : undefined} onClick={() => setActivePage(id)}>{label}</a>;
          })}
        </nav>
        <div className="header-actions">
          <Badge className={`feed-badge ${isLive ? "feed-live" : "feed-demo"}`} variant="outline"><span />{statusText}</Badge>
          <Button className="header-icon-button" variant="ghost" size="icon" aria-label="Refresh weather readings" onClick={() => refreshReadings(true)} disabled={refreshing}><WeatherGlyph type="refresh" size={20} className={refreshing ? "spin" : ""} /></Button>
          <Button className="header-export" variant="outline" size="sm" onClick={exportReadings}><WeatherGlyph type="download" size={18} /> Export CSV</Button>
        </div>
      </header>

      <main className="dashboard-shell" id="dashboard">
        <div className={`dashboard-grid page-${activePage} ${sensorDetail ? "page-sensor-detail" : ""}`}>
          {activePage === "sensors" && <section className="sensors-card weather-card" aria-label="Station sensor readings">
            <div className="card-heading compact"><div><span className="eyebrow">STATION 01 · PYTHON PAYLOAD</span><h2>Sensor conditions</h2></div><span className="sensor-state-label">{isLive ? "PYTHON LIVE" : isStale ? "LAST PYTHON" : "SAMPLE PREVIEW"}</span></div>
            <div className="sensor-grid">
              <SensorTile icon={WeatherGlyph} iconProps={{ type: "humidity" }} name="Humidity" value={number(latest.humidity_percent)} unit="%" caption="HUMIDITY · DHT11" onClick={() => { window.location.hash = "humidity"; }} />
              <SensorTile icon={WeatherGlyph} iconProps={{ type: "wind" }} name="PM10 sensor" value={number(latest.pm10, 1)} unit="" caption="PM1 · SCALED VALUE" onClick={() => { window.location.hash = "pm10"; }} />
              <SensorTile icon={WeatherGlyph} iconProps={{ type: "temperature" }} name="Temperature sensor" value={number(latest.temperature_c, 1)} unit="°C" caption={isLive ? "LIVE PYTHON · DHT11 / GPIO 18" : isStale ? "LAST PYTHON READING" : "SAMPLE · temperature_c"} onClick={() => { window.location.hash = "temperature"; }} />
              <SensorTile icon={WeatherGlyph} iconProps={{ type: raining ? "rain" : "cloudy" }} name="Rain input" value={raining ? "WET" : "DRY"} unit="" caption="RAIN_DROP · GPIO 7" onClick={() => { window.location.hash = "rain"; }} />
              <SensorTile icon={WeatherGlyph} iconProps={{ type: "air" }} name="Air quality raw" value={number(latest.air_quality_raw)} unit="ADC" caption="AQ · ANALOG INPUT" onClick={() => { window.location.hash = "air-quality"; }} />
            </div>
            <p className="sensor-footnote">Python fields: TEMP · HUMIDITY · PM1 · AQ · RAIN_DROP · RTC. Device time: {latest.device_time || "—"} · API received: {latest.updated_at ? time(latest.updated_at) : "waiting"}</p>
          </section>}

          {sensorDetail && <section className="temperature-detail-card weather-card" aria-label={`${sensorDetail.name} details`}>
            <div className="temperature-detail-heading">
              <a className="temperature-back-link" href="#sensors" onClick={() => setActivePage("sensors")}><span aria-hidden="true">←</span> Back to sensors</a>
              <Badge className={`feed-badge ${isLive ? "feed-live" : "feed-demo"}`} variant="outline"><span />{sensorDetailStatus}</Badge>
            </div>
            <div className="temperature-detail-topline"><span className="eyebrow">STATION 01 · {sensorDetail.metadata}</span><h1>{sensorDetail.name}</h1><p>{sensorDetail.description}</p></div>
            <div className="temperature-detail-content">
              <div className="temperature-detail-current">
                <WeatherGlyph type={sensorDetail.icon} size={54} />
                <span className="temperature-detail-label">{sensorDetail.valueCaption || `CURRENT ${sensorDetail.name.toUpperCase()}`}</span>
                <div className={`temperature-detail-value ${sensorDetail.id === "rain" ? "temperature-detail-state" : ""}`}>{detailValue}{sensorDetail.unit && <small>{sensorDetail.unit}</small>}</div>
                <span className="temperature-detail-source">Python field <code>{sensorDetail.field}</code> → API <code>{sensorDetail.apiField}</code></span>
              </div>
              <div className="temperature-detail-chart-card">
                <div className="card-heading compact"><div><span className="eyebrow">RECENT SENSOR DATA</span><h2>{sensorDetail.historyTitle}</h2></div><span className="chart-period">LAST 12</span></div>
                {sensorDetail.id === "rain" ? <RainInputHistory readings={apiHistory.slice(-12)} /> : <TemperatureChart readings={apiHistory.slice(-12)} dataKey={sensorDetail.key} digits={sensorDetail.digits || 0} chartLabel={`Recent ${sensorDetail.name.toLowerCase()} readings`} emptyLabel="No Python API history yet" />}
                <div className="temperature-detail-update"><span>Last API reading</span><b>{latestApiReading?.device_time || (latestApiReading?.updated_at ? time(latestApiReading.updated_at) : "Waiting for Python API history")}</b></div>
              </div>
            </div>
            <div className="temperature-detail-stats">
              {sensorDetail.id === "rain" ? <>
                <div><span>INPUT PIN</span><b>GPIO 7</b></div>
                <div><span>RAIN STATE</span><b>{detailValue}</b></div>
                <div><span>HUMIDITY · DHT11</span><b>{detailCompanionValue}<small>{detailCompanion.unit}</small></b></div>
              </> : <>
                <div><span>LOW · RECORDED</span><b>{detailLow}{detailSamples.length > 0 && sensorDetail.unit && <small>{sensorDetail.unit}</small>}</b></div>
                <div><span>HIGH · RECORDED</span><b>{detailHigh}{detailSamples.length > 0 && sensorDetail.unit && <small>{sensorDetail.unit}</small>}</b></div>
                <div><span>{detailCompanion.label.toUpperCase()}</span><b>{detailCompanionValue}<small>{detailCompanion.unit}</small></b></div>
              </>}
            </div>
            <p className="temperature-detail-footnote">{isLive ? "Refreshing from the Python sensor every 5 seconds." : isStale ? "Showing the most recent Python sensor value received." : "Showing sample values until the Python sensor sends a reading."}{sensorDetail.id === "air-quality" ? " Raw ADC values are not converted to an AQI score." : ""}</p>
          </section>}

          {activePage === "history" && <>
            <section className="history-overview-card weather-card">
              <div><span className="eyebrow">STATION 01 · PYTHON API</span><h1>Sensor reading history</h1><p>{apiHistory.length ? `${apiHistory.length} recent API readings available · graphs show the latest 12.` : "Waiting for Python sensor readings at /api/readings."}</p></div>
              <Badge className={`feed-badge ${isLive ? "feed-live" : "feed-demo"}`} variant="outline"><span />{isLive ? "LIVE HISTORY" : isStale ? "LAST RECEIVED" : "NO API HISTORY"}</Badge>
            </section>
            {historyMetrics.map((metric) => {
              const value = latestApiReading?.[metric.key];
              return <section key={metric.key} className="history-metric-card weather-card" style={{ gridArea: metric.area }} aria-label={`${metric.name} API history`}>
                <div className="card-heading compact"><div><span className="eyebrow">PYTHON API · {metric.unit.toUpperCase()}</span><h2>{metric.name}</h2></div><span className="chart-period">LAST 12</span></div>
                <div className="history-metric-latest"><b>{value === null || value === undefined ? "—" : number(value, metric.digits)}</b><small>{metric.unit}</small><span>{latestApiReading?.updated_at ? `Latest · ${time(latestApiReading.updated_at)}` : "Latest received value"}</span></div>
                <TemperatureChart readings={apiHistory.slice(-12)} dataKey={metric.key} digits={metric.digits} chartLabel={`Recent ${metric.name.toLowerCase()} API readings`} emptyLabel="No Python API history yet" />
                <div className="chart-time-rail"><span>{apiHistory.length ? "OLDEST SHOWN" : "PYTHON API"}</span><span>{apiHistory.length ? "NEWEST SHOWN" : "WAITING FOR SENSOR"}</span></div>
              </section>;
            })}
            <section className="history-rain-card weather-card" style={{ gridArea: "history-rain" }} aria-label="Rain input API history">
              <div className="card-heading compact"><div><span className="eyebrow">PYTHON API · GPIO 7</span><h2>Rain input</h2></div><span className="chart-period">WET / DRY</span></div>
              <RainInputHistory readings={apiHistory.slice(-12)} />
              <div className="chart-time-rail"><span>{apiHistory.length ? "RECENT DIGITAL STATES" : "PYTHON API"}</span><span>{apiHistory.length ? "NEWEST SHOWN" : "WAITING FOR SENSOR"}</span></div>
            </section>
          </>}

          {activePage === "sensors" && <section className="air-card weather-card" aria-label="Air quality sensor overview">
            <div className="air-card-title"><div><span className="eyebrow">ANALOG SENSOR · CH 1</span><h2>Air quality overview</h2></div><div className="air-card-actions"><Badge variant="outline">RAW INPUT</Badge><button className="air-detail-button" type="button" onClick={() => { window.location.hash = "air-quality"; }}>Details <span aria-hidden="true">→</span></button></div></div>
            <div className="air-card-main">
              <GaugeRing value={latest.air_quality_raw} />
              <div className="air-readings">
                <div><i className="status-green" /><b>{number(latest.pm10, 1)}</b><span>PM10 · scaled units</span></div>
                <div><i className="status-yellow" /><b>{number(latest.humidity_percent)}%</b><span>Relative humidity</span></div>
                <div><i className={raining ? "status-red" : "status-green"} /><b>{raining ? "WET" : "DRY"}</b><span>Rain detector · GPIO 7</span></div>
                <div><i className="status-green" /><b>{number(latest.air_quality_raw)}</b><span>ADC raw value</span></div>
              </div>
            </div>
            <div className="air-card-footer"><span><i /> Sensor values only</span><span>NO AQI SCORE</span></div>
          </section>}

          {activePage === "weather" && <section className="current-card weather-card" aria-label="Current sensor conditions">
            <div className="current-card-top"><span className="location-line"><WeatherGlyph type="location" size={16} /> Chennai</span><span className="current-source-label">{isLive ? "LIVE SENSOR" : "SAMPLE SENSOR"}</span></div>
            <div className="current-condition-icon weather-orb"><WeatherGlyph type={raining ? "rain" : "partly"} size={72} /></div>
            <div className="current-temp"><span>{temp}</span><sup>°C</sup></div>
            <div className="current-condition-text">{raining ? "Rain detected" : isLive ? "Sensor dry" : "Partly cloudy"}</div>
            <div className="current-high-low">{todayForecast ? <>High {forecastNumber(todayForecast.high)}° <span>·</span> Low {forecastNumber(todayForecast.low)}° <small>today’s forecast</small></> : <small>{forecastStatus === "FORECAST UNAVAILABLE" ? "Today’s forecast unavailable" : "Loading today’s forecast…"}</small>}</div>
            <div className="current-updated">{time(latest.updated_at) === "--:--" ? "Waiting for sensor" : `Updated ${time(latest.updated_at)}`}</div>
            <div className="current-accent" />
          </section>}

          {activePage === "weather" && <section className="hourly-card weather-card" aria-label="Hourly weather forecast for Chennai">
            <div className="card-heading compact"><div><span className="eyebrow">NEXT HOURS · CHENNAI</span><h2>Hourly forecast</h2></div><Badge variant="outline">{forecastBadgeLabel(forecastStatus)}</Badge></div>
            <div className="hourly-list">
              {hourlyForecast.length ? hourlyForecast.map((hour, index) => <div className={`hourly-item ${index === 0 ? "selected" : ""}`} key={`${hour.time}-${index}`}><span>{hour.time}</span><WeatherGlyph type={hour.icon} size={27} label={`${hour.label} at ${hour.time}`} /><b>{forecastNumber(hour.temperature)}°</b><small>{forecastNumber(hour.chance)}% rain</small></div>) : <div className="forecast-empty">{forecastStatus === "FORECAST UNAVAILABLE" ? "Hourly forecast unavailable. Check your connection and refresh." : "Loading hourly forecast…"}</div>}
            </div>
          </section>}

          {activePage === "weather" && <section className="week-card weather-card" aria-label="Seven day weather forecast for Chennai">
            <div className="card-heading compact"><div><span className="eyebrow">WEEK AT A GLANCE</span><h2>7-day forecast</h2></div><Badge variant="outline">{forecastBadgeLabel(forecastStatus)}</Badge></div>
            <div className="week-list">
              {dailyForecast.length ? <>
              <div className="week-range-legend" aria-hidden="true"><span>DAY</span><span>SKY</span><span>LOW</span><span>DAILY RANGE · °C</span><span>HIGH</span></div>
              {dailyForecast.map((day, index) => {
                const low = Number(day.low);
                const high = Number(day.high);
                const left = Number.isFinite(low) ? Math.max(0, Math.min(100, ((low - forecastTemperatureMin) / forecastTemperatureSpan) * 100)) : 0;
                const width = Number.isFinite(low) && Number.isFinite(high) ? Math.max(4, Math.min(100 - left, ((high - low) / forecastTemperatureSpan) * 100)) : 0;
                return <div className={`week-row ${index === 0 ? "today" : ""}`} key={day.date}><span>{day.day}</span><WeatherGlyph className="week-icon" type={day.icon} size={24} label={`${day.label} on ${day.day}`} /><small className="week-low">{forecastNumber(day.low)}°</small><div className="week-temperature-range"><i /><b style={{ left: `${left}%`, width: `${width}%` }} /></div><strong>{forecastNumber(day.high)}°</strong></div>;
              })}</> : <div className="forecast-empty">{forecastStatus === "FORECAST UNAVAILABLE" ? "Seven-day forecast unavailable." : "Loading seven-day forecast…"}</div>}
            </div>
          </section>}

          {activePage === "weather" && <section className="rain-card weather-card" aria-label="Three day precipitation probability forecast">
            <div className="card-heading compact"><div><span className="eyebrow">NEXT 3 DAYS · CHENNAI</span><h2>Chance of rain</h2></div><WeatherGlyph type="rain" size={25} /></div>
            {rainForecast.length ? <div className="rain-bars">{rainForecast.map(({ day, date, chance }) => <div className="rain-bar-row" key={date}><span>{day}</span><div className="rain-track"><i style={{ width: `${Math.max(0, Math.min(100, Number(chance) || 0))}%` }} /></div><b>{forecastNumber(chance)}%</b></div>)}</div> : <div className="forecast-empty">{forecastStatus === "FORECAST UNAVAILABLE" ? "Rain probability unavailable." : "Loading rain probability…"}</div>}
            <div className="rain-scale"><span>0%</span><span>50%</span><span>100%</span></div>
          </section>}

          {activePage === "weather" && <section className="sun-card weather-card" aria-label="Sunrise and sunset for Chennai">
            <div className="card-heading compact"><div><span className="eyebrow">DAYLIGHT · CHENNAI</span><h2>Sunrise &amp; sunset</h2></div></div>
            <div className="sun-time"><WeatherGlyph type="sunrise" size={25} /><div><span>Sunrise <i>LOCAL TIME</i></span><b>{forecastSunrise ? forecastClock(forecastSunrise) : "—"}</b></div></div>
            <div className="sun-track"><i /></div>
            <div className="sun-time sunset"><WeatherGlyph type="sunset" size={25} /><div><span>Sunset <i>LOCAL TIME</i></span><b>{forecastSunset ? forecastClock(forecastSunset) : "—"}</b></div></div>
          </section>}

          {activePage === "weather" && <section className="api-card weather-card" aria-label="Weather data source">
            <WeatherGlyph type="radio" size={26} />
            <span className="eyebrow">DATA SOURCE</span>
            <h2>{statusText}</h2>
            <p>{isLive ? `Latest sensor update ${time(latest.updated_at)}` : isStale ? `Last sensor update ${time(latest.updated_at)}` : payload.apiUnavailable ? "Using clearly labeled sample readings while the API is offline." : "Waiting for the station to send sensor readings."}</p>
            <a className="forecast-credit" href="https://open-meteo.com/" target="_blank" rel="noreferrer">Forecast by Open-Meteo · updates every 30 min{forecastUpdatedAt ? ` · ${new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: forecastTimezone }).format(forecastUpdatedAt)}` : ""}</a>
          </section>}
        </div>

      <div className="dashboard-footnote"><span><WeatherGlyph type="radio" size={18} /> Sensor bridge {isLive ? "connected" : isStale ? "last reading received" : "not connected · preview values shown"}</span></div>
      </main>
      <footer className="site-footer"><span>WEATHER API <i>·</i> STATION 01</span><span>LOCAL SENSOR FEED · REFRESHES EVERY 5 SECONDS</span><span>BUILT FOR FIELD CONDITIONS</span></footer>
    </div>
  );
}
