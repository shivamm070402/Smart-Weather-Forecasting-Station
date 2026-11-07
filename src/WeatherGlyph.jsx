const symbols = {
  partly: "🌤️",
  sunny: "☀️",
  cloudy: "☁️",
  rain: "🌧️",
  drizzle: "🌦️",
  storm: "⛈️",
  snow: "❄️",
  fog: "🌫️",
  night: "🌙",
  location: "⌖",
  refresh: "↻",
  humidity: "💧",
  wind: "≋",
  air: "◉",
  history: "⌁",
  activity: "⌁",
  download: "↓",
  bell: "⌁",
  radio: "⌁",
  sunrise: "🌅",
  sunset: "🌇",
};

const illustratedTypes = new Set(["partly", "sunny", "cloudy", "rain", "drizzle", "sunrise", "sunset", "humidity", "wind", "temperature"]);

function WeatherArtwork({ type }) {
  const showSun = ["partly", "sunny", "sunrise", "sunset"].includes(type);
  const showCloud = ["partly", "cloudy", "rain", "drizzle"].includes(type);
  const showRain = ["rain", "drizzle"].includes(type);
  const showWind = type === "wind";
  const showDrop = type === "humidity";
  const showThermometer = type === "temperature";
  return (
    <svg className={`weather-art weather-art-${type}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {showSun && <g className="weather-sun" transform={type === "sunny" ? "translate(0 0)" : ["sunrise", "sunset"].includes(type) ? "translate(5 11) scale(.78)" : "translate(-5 -5) scale(.72)"}>
        <g className="weather-sun-rays" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round">
          <path d="M24 5v4M24 39v4M5 24h4M39 24h4M10 10l3 3M35 35l3 3M38 10l-3 3M13 35l-3 3" />
        </g>
        <circle className="weather-sun-disc" cx="24" cy="24" r="8.5" fill="currentColor" />
      </g>}
      {type === "sunny" && <g className="weather-heat-haze" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <path className="heat-wave heat-wave-one" d="M12 44q2-3 4 0t4 0" />
        <path className="heat-wave heat-wave-two" d="M23 45q2-3 4 0t4 0" />
        <path className="heat-wave heat-wave-three" d="M34 44q2-3 4 0t4 0" />
      </g>}
      {showCloud && <path className="weather-cloud" d="M10.5 33.5h24a7.5 7.5 0 0 0 .6-15 11.2 11.2 0 0 0-21-1.2 8.2 8.2 0 0 0-3.6 16.2Z" fill="currentColor" />}
      {showRain && <g className={`weather-rain-drops rain-${type}`} fill="none" stroke="currentColor" strokeWidth={type === "drizzle" ? "1.2" : "1.7"} strokeLinecap="round">
        <path className="weather-rain-drop drop-one" d="m14 34-1.5 4.2" />
        <path className="weather-rain-drop drop-two" d="m21 34-1.5 4.2" />
        <path className="weather-rain-drop drop-three" d="m28 34-1.5 4.2" />
        {type === "rain" && <>
          <path className="weather-rain-drop drop-four" d="m35 34-1.5 4.2" />
          <path className="weather-rain-drop drop-five" d="m17 39-1.5 4.2" />
          <path className="weather-rain-drop drop-six" d="m25 39-1.5 4.2" />
          <path className="weather-rain-drop drop-seven" d="m33 39-1.5 4.2" />
        </>}
      </g>}
      {(type === "sunrise" || type === "sunset") && <path className="weather-horizon" d="M8 34h32M13 34a11 11 0 0 1 22 0" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />}
      {showDrop && <path className="weather-humidity-drop" d="M24 5C21 11 13 20 13 28a11 11 0 0 0 22 0C35 20 27 11 24 5Z" fill="currentColor" />}
      {showThermometer && <g className="weather-thermometer">
        <path className="thermometer-outline" d="M21 26V11a3 3 0 0 1 6 0v15a8 8 0 1 1-6 0Z" fill="none" stroke="currentColor" strokeWidth="2.1" />
        <path className="thermometer-mercury" d="M24 14v18" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
        <circle className="thermometer-bulb" cx="24" cy="34" r="3.5" fill="currentColor" />
        <path className="thermometer-ticks" d="M28.5 16h3M28.5 21h3M28.5 26h3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </g>}
      {showWind && <g className="weather-wind-lines" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path className="wind-line wind-one" d="M7 14h22c6 0 6-8 0-8-2 0-3 .8-4 2.5" />
        <path className="wind-line wind-two" d="M5 24h32c5 0 5 7-1 7" />
        <path className="wind-line wind-three" d="M10 34h19c6 0 6 8 0 8-2 0-3-.8-4-2.5" />
      </g>}
    </svg>
  );
}

/** Native-looking weather symbols shared by the dashboard's weather cards. */
export default function WeatherGlyph({ type = "partly", size = 24, className = "", label }) {
  const fontSize = size > 40 ? size : Math.max(12, Math.round(size * 0.8));
  return (
    <span
      className={`weather-glyph ${className}`.trim()}
      data-weather-type={type}
      style={{ width: size, height: size, display: "grid", placeItems: "center", fontSize, lineHeight: 1 }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      {illustratedTypes.has(type) ? <WeatherArtwork type={type} /> : symbols[type] || "◦"}
    </span>
  );
}
