import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import WeatherGlyph from "./WeatherGlyph.jsx";

const demoReading = {
  temperature_c: 32.5,
  humidity_percent: 43.0,
  air_quality_raw: 142,
  pm10: 62.7,
  raining: false,
  device_time: "10:7",
};

const hourly = [
  { time: "Now", temperature: 23, weather: "partly" },
  { time: "10 AM", temperature: 27, weather: "sunny" },
  { time: "12 PM", temperature: 30, weather: "sunny" },
  { time: "2 PM", temperature: 31, weather: "partly" },
  { time: "4 PM", temperature: 29, weather: "cloudy" },
  { time: "6 PM", temperature: 27, weather: "partly" },
];

const week = [
  { day: "Today", weather: "partly", high: 31, low: 23 },
  { day: "Fri", weather: "cloudy", high: 30, low: 22 },
  { day: "Sat", weather: "sunny", high: 32, low: 24 },
  { day: "Sun", weather: "partly", high: 29, low: 22 },
  { day: "Mon", weather: "rain", high: 30, low: 23 },
  { day: "Tue", weather: "sunny", high: 31, low: 24 },
  { day: "Wed", weather: "cloudy", high: 29, low: 22 },
];

function formatNumber(value, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function formatUpdated(value, deviceTime) {
  if (deviceTime) return `Device time ${deviceTime}`;
  if (!value) return "Waiting for sensor";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Latest sensor reading";
  return `Updated ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date)}`;
}

function smoothPath(values) {
  if (!values.length) return "";
  const min = Math.min(...values) - 1;
  const max = Math.max(...values) + 1;
  const range = Math.max(max - min, 2);
  const points = values.map((value, index) => ({
    x: 10 + (index / Math.max(values.length - 1, 1)) * 280,
    y: 74 - ((value - min) / range) * 56,
  }));
  return points.reduce((path, point, index) => {
    if (!index) return `M ${point.x} ${point.y}`;
    const previous = points[index - 1];
    const midpoint = (previous.x + point.x) / 2;
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`;
  }, "");
}

function ReadingPill({ icon: Icon, iconProps, label, value }) {
  return (
    <div className="iphone-reading-pill">
      <Icon size={16} strokeWidth={1.8} {...iconProps} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function IPhoneWeatherApp() {
  const rootRef = useRef(null);
  const [payload, setPayload] = useState({ mode: "demo", latest: demoReading, history: [] });
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const response = await fetch("/api/readings", { cache: "no-store" });
      if (!response.ok) throw new Error("Weather sensor API is unavailable");
      const readings = await response.json();
      setPayload({
        ...readings,
        latest: readings.mode === "demo" ? demoReading : readings.latest || demoReading,
        apiUnavailable: false,
      });
    } catch {
      setPayload({ mode: "demo", latest: demoReading, history: [], apiUnavailable: true });
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(() => refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const context = gsap.context(() => {
      const intro = gsap.timeline({ defaults: { ease: "power3.out" } });
      intro
        .from(".iphone-topbar", { y: -12, autoAlpha: 0, duration: 0.42 })
        .from(".iphone-hero", { y: 18, autoAlpha: 0, duration: 0.58 }, "-=.18")
        .from(".iphone-hourly, .iphone-seven-day, .iphone-sensors, .iphone-history, .iphone-small-cards", { y: 16, autoAlpha: 0, duration: 0.5, stagger: 0.075 }, "-=.25")
        .from(".iphone-tabbar", { y: 10, autoAlpha: 0, duration: 0.38 }, "-=.16");

      gsap.to(".iphone-condition-art", { y: -6, duration: 3.2, ease: "sine.inOut", repeat: -1, yoyo: true });
      gsap.fromTo(".iphone-chart-line", { strokeDashoffset: 1000 }, { strokeDashoffset: 0, duration: 1.35, delay: 0.55, ease: "power2.out" });
      gsap.fromTo(".iphone-temp-range b", { scaleX: 0 }, { scaleX: 1, duration: 0.52, delay: 0.36, stagger: 0.06, transformOrigin: "left center", ease: "power2.out" });
    }, rootRef);

    return () => context.revert();
  }, []);

  const latest = payload.latest || demoReading;
  const history = useMemo(() => {
    const source = Array.isArray(payload.history) ? payload.history : [];
    return source.slice(-12).map((reading) => Number(reading.temperature_c)).filter(Number.isFinite);
  }, [payload.history, payload.mode]);
  const rainDetected = Boolean(latest.raining ?? latest.rain_detected);
  const temperature = formatNumber(latest.temperature_c, 1);
  const feedLabel = payload.mode === "live" ? "LIVE SENSOR" : payload.mode === "stale" ? "LAST READING" : "SAMPLE WEATHER";
  const path = smoothPath(history);

  return (
    <div className="iphone-stage">
      <main className="iphone-weather" id="top" aria-label="iPhone-style weather app" ref={rootRef}>
        <div className="iphone-sky-glow iphone-sky-glow-one" />
        <div className="iphone-sky-glow iphone-sky-glow-two" />
        <header className="iphone-topbar">
          <span className="iphone-location"><WeatherGlyph type="location" size={17} /> Chennai</span>
          <button className="iphone-refresh" type="button" onClick={() => refresh(true)} aria-label="Refresh sensor readings" disabled={refreshing}>
            <WeatherGlyph type="refresh" size={21} className={refreshing ? "iphone-spin" : ""} />
          </button>
        </header>

        <section className="iphone-hero" aria-label="Current conditions">
          <div className="iphone-hero-heading">
            <p>MY LOCATION</p>
          <div className={`iphone-feed-state ${payload.mode === "live" ? "is-live" : payload.mode === "stale" ? "is-stale" : ""}`}><i />{feedLabel}</div>
          </div>
          <div className="iphone-condition-art" aria-hidden="true"><WeatherGlyph type={rainDetected ? "rain" : "partly"} size={96} /></div>
          <div className="iphone-temp-line"><span>{temperature}</span><sup>°</sup></div>
          <p className="iphone-condition">{rainDetected ? "Rain detected" : "No rain detected"}</p>
          <p className="iphone-hi-low">H: 31° <span>·</span> L: 22° <small>sample outlook</small></p>
          <div className="iphone-updated">{formatUpdated(latest.updated_at, latest.device_time)}</div>
        </section>

        <section className="iphone-panel iphone-sensors" id="sensors" aria-label="Weather station sensor readings">
          <div className="iphone-panel-heading"><h2>Sensor conditions</h2><span>{payload.mode === "live" ? "LIVE" : payload.mode === "stale" ? "LAST READING" : "SAMPLE PREVIEW"}</span></div>
          <div className="iphone-sensor-grid">
            <ReadingPill icon={WeatherGlyph} iconProps={{ type: "humidity" }} label="Humidity" value={`${formatNumber(latest.humidity_percent)}%`} />
            <ReadingPill icon={WeatherGlyph} iconProps={{ type: "wind" }} label="PM10 sensor" value={formatNumber(latest.pm10, 1)} />
            <ReadingPill icon={WeatherGlyph} iconProps={{ type: "air" }} label="Air quality raw" value={formatNumber(latest.air_quality_raw)} />
            <ReadingPill icon={WeatherGlyph} iconProps={{ type: rainDetected ? "rain" : "cloudy" }} label="Rain input" value={rainDetected ? "WET" : "DRY"} />
          </div>
          <p className="iphone-note"><WeatherGlyph type="activity" size={16} /> Air signal is raw ADC data, not an AQI score.</p>
        </section>

        <section className="iphone-panel iphone-history" id="history" aria-label="Recent temperature sensor history">
          <div className="iphone-panel-heading"><h2>Temperature history</h2><span>LAST 12 READINGS</span></div>
          {path ? (
            <div className="iphone-chart-wrap">
              <svg viewBox="0 0 300 88" preserveAspectRatio="none" role="img" aria-label="Recent temperature readings">
                <defs><linearGradient id="iphone-chart-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#d8efff" stopOpacity=".35" /><stop offset="1" stopColor="#d8efff" stopOpacity="0" /></linearGradient></defs>
                <path className="iphone-chart-grid" d="M0 20H300M0 48H300M0 76H300" />
                <path d={`${path} L 290 84 L 10 84 Z`} fill="url(#iphone-chart-fill)" />
                <path className="iphone-chart-line" d={path} pathLength="1000" />
              </svg>
              <div className="iphone-chart-labels"><span>OLDER</span><span>RECENT</span></div>
            </div>
          ) : <p className="iphone-no-history">No temperature history is available yet.</p>}
        </section>

        <section className="iphone-panel iphone-hourly" aria-label="Sample hourly outlook">
          <div className="iphone-panel-heading"><h2>Hourly forecast</h2><span>OUTLOOK PREVIEW</span></div>
          <div className="iphone-hourly-row">
            {hourly.map(({ time, temperature: hourTemp, weather }, index) => (
              <div className={`iphone-hour-item ${index === 0 ? "selected" : ""}`} key={time}>
                <span>{time}</span><WeatherGlyph type={weather} size={25} label={`${weather} at ${time}`} /><b>{index === 0 ? temperature : hourTemp}°</b>
              </div>
            ))}
          </div>
        </section>

        <section className="iphone-panel iphone-seven-day" aria-label="Sample seven day forecast">
          <div className="iphone-panel-heading"><h2>7-day forecast</h2><span>SAMPLE</span></div>
          <div className="iphone-week-list">
            {week.map(({ day, weather, high, low }, index) => (
              <div className={`iphone-week-row ${index === 0 ? "today" : ""}`} key={day}>
                <span>{day}</span><WeatherGlyph className="iphone-week-icon" type={weather} size={24} label={`${weather} on ${day}`} />
                <div className="iphone-temp-range"><i /><b style={{ left: `${((low - 20) / 16) * 100}%`, width: `${Math.max(22, ((high - low) / 16) * 100)}%` }} /></div>
                <strong>{high}°</strong><small>{low}°</small>
              </div>
            ))}
          </div>
        </section>

        <section className="iphone-small-cards" aria-label="Sample daylight information">
          <article className="iphone-panel iphone-daylight"><WeatherGlyph type="sunrise" size={26} /><div><span>Sunrise · sample</span><b>05:57 AM</b></div><div><span>Sunset · sample</span><b>06:26 PM</b></div></article>
          <article className="iphone-panel iphone-precip"><WeatherGlyph type="rain" size={24} /><div><span>Rain outlook · sample</span><b>Forecast unavailable</b></div></article>
        </section>

        {payload.apiUnavailable && <p className="iphone-api-note">Showing sample values while the sensor API is offline.</p>}
        <nav className="iphone-tabbar" aria-label="Weather app sections">
          <a className="active" href="#top"><WeatherGlyph type="partly" size={24} /><span>Weather</span></a>
          <a href="#sensors"><WeatherGlyph type="humidity" size={23} /><span>Sensors</span></a>
          <a href="#history"><WeatherGlyph type="history" size={23} /><span>History</span></a>
        </nav>
      </main>
    </div>
  );
}

export default IPhoneWeatherApp;
