import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";

const API_URL = process.env.EXPO_PUBLIC_WEATHER_API_URL?.trim();
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast?latitude=13.0827&longitude=80.2707&current=temperature_2m%2Crelative_humidity_2m%2Capparent_temperature%2Cis_day%2Cprecipitation%2Cweather_code%2Cwind_speed_10m&hourly=temperature_2m%2Cprecipitation_probability%2Cweather_code%2Cis_day&daily=weather_code%2Ctemperature_2m_max%2Ctemperature_2m_min%2Cprecipitation_probability_max%2Csunrise%2Csunset&timezone=Asia%2FKolkata&forecast_days=7";
const FORECAST_TIMEZONE = "Asia/Kolkata";

const SAMPLE_READING = {
  temperature_c: 32.5,
  humidity_percent: 43.0,
  air_quality_raw: 142,
  pm10: 62.7,
  raining: false,
  device_time: "10:7",
};

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
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { hour: "numeric", timeZone: FORECAST_TIMEZONE }).format(date) : "—";
}

function forecastClock(value) {
  const date = forecastDate(value);
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: FORECAST_TIMEZONE }).format(date) : "—";
}

function forecastDayLabel(value, today) {
  if (value === today) return "Today";
  const date = forecastDate(value);
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat("en-IN", { weekday: "short", timeZone: FORECAST_TIMEZONE }).format(date) : "—";
}

function forecastBadgeLabel(status) {
  return { "LIVE FORECAST": "LIVE", "CACHED FORECAST": "CACHED", "FORECAST UNAVAILABLE": "OFFLINE" }[status] || status;
}
const SENSOR_DETAILS = {
  temperature: { id: "temperature", label: "Temperature sensor", icon: "temperature", iconFallback: "🌡️", valueCaption: "CURRENT TEMPERATURE", metadata: "DHT11 · GPIO 18", key: "temperature_c", digits: 1, unit: "°C", field: "TEMP", apiField: "temperature_c", historyTitle: "Temperature readings", description: "A reading from the DHT11 sensor, sent by Python.", companion: { key: "humidity_percent", label: "DHT11 HUMIDITY", digits: 0, unit: "%" } },
  humidity: { id: "humidity", label: "Humidity sensor", icon: "humidity", iconFallback: "💧", valueCaption: "CURRENT HUMIDITY", metadata: "DHT11 · GPIO 18", key: "humidity_percent", digits: 0, unit: "%", field: "HUMIDITY", apiField: "humidity_percent", historyTitle: "Humidity readings", description: "Relative humidity measured by the DHT11 and sent by Python.", companion: { key: "temperature_c", label: "DHT11 TEMPERATURE", digits: 1, unit: "°C" } },
  pm10: { id: "pm10", label: "PM10 sensor", icon: "wind", iconFallback: "≋", metadata: "PARTICULATE MATTER SENSOR", key: "pm10", digits: 1, unit: "", valueCaption: "SCALED READING", field: "PM1", apiField: "pm10", historyTitle: "PM10 readings", description: "The particulate reading returned by the Python sensor code, shown in its scaled units.", companion: { key: "air_quality_raw", label: "RAW ADC INPUT", digits: 0, unit: " ADC" } },
  rain: { id: "rain", label: "Rain input", icon: "rain", iconFallback: "🌧️", metadata: "DIGITAL SENSOR · GPIO 7", key: "raining", unit: "", valueCaption: "DIGITAL INPUT STATE", field: "RAIN_DROP", apiField: "rain_detected", historyTitle: "Rain input history", description: "The digital rain input state read by Python on GPIO 7.", companion: { key: "humidity_percent", label: "DHT11 HUMIDITY", digits: 0, unit: "%" } },
  "air-quality": { id: "air-quality", label: "Air quality sensor", icon: "air", iconFallback: "◉", valueCaption: "RAW ADC SIGNAL", metadata: "ANALOG SENSOR · CH 1", key: "air_quality_raw", digits: 0, unit: "ADC", field: "AQ", apiField: "air_quality_raw", historyTitle: "Raw sensor readings", description: "Raw analog sensor values from Python. This is not an AQI score.", companion: { key: "pm10", label: "PM10 · SCALED", digits: 1, unit: "" } },
};
const HISTORY_METRICS = [
  { key: "temperature_c", label: "Temperature", unit: "°C", digits: 1 },
  { key: "humidity_percent", label: "Humidity", unit: "%", digits: 0 },
  { key: "pm10", label: "PM10", unit: "SCALED", digits: 1 },
  { key: "air_quality_raw", label: "Air quality raw", unit: "ADC", digits: 0 },
];

function displayNumber(value, digits = 0) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : "—";
}

function forecastNumber(value, digits = 0) {
  return value === null || value === undefined || value === "" ? "—" : displayNumber(value, digits);
}

function weatherIconGlyph(icon) {
  return { night: "🌙", fog: "🌫️", snow: "❄️", storm: "⛈️" }[icon] || "☁️";
}

function rainReading(reading) {
  return reading.raining ?? reading.rain_detected ?? reading.RAIN_DROP;
}

function readingTime(value) {
  if (!value) return "Waiting for sensor";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Latest sensor reading";
  return `Updated ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(parsed)}`;
}

function SectionHeading({ eyebrow, title, trailing }) {
  return (
    <View style={styles.sectionHeading}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {trailing ? <Text style={styles.trailingLabel}>{trailing}</Text> : null}
    </View>
  );
}

function SensorTile({ icon, iconMotion, label, value, note, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={onPress ? `Open ${label} details` : undefined} style={({ pressed }) => [styles.sensorTile, pressed && onPress ? styles.sensorTilePressed : null]}>
      <LiveIcon type={iconMotion} style={styles.sensorIcon}>{icon}</LiveIcon>
      <Text style={styles.sensorLabel}>{label}</Text>
      <Text style={styles.sensorValue}>{value}</Text>
      <Text style={styles.sensorNote}>{note}</Text>
    </Pressable>
  );
}

function FallingStreak({ index, size }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const fall = Animated.loop(Animated.sequence([
      Animated.delay(index * 210),
      Animated.timing(progress, { toValue: 1, duration: 880, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(progress, { toValue: 0, duration: 1, useNativeDriver: true }),
    ]));
    fall.start();
    return () => fall.stop();
  }, [index, progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [0, size * 0.21] });
  const opacity = progress.interpolate({ inputRange: [0, 0.12, 0.8, 1], outputRange: [0, 1, 0.85, 0] });
  return <Animated.View style={[styles.rainStreak, { left: `${15 + index * 23}%`, top: size * 0.63, width: Math.max(1, size * 0.03), height: Math.max(4, size * 0.13), opacity, transform: [{ translateY }, { rotate: "24deg" }] }]} />;
}

const NATIVE_WEATHER_TYPES = ["sunny", "partly", "cloudy", "rain", "drizzle", "sunrise", "sunset", "temperature"];
const SUN_RAY_SLOTS = [
  { left: "47%", top: 0, rotate: "0deg" },
  { left: "47%", bottom: 0, rotate: "0deg" },
  { left: 0, top: "47%", rotate: "90deg" },
  { right: 0, top: "47%", rotate: "90deg" },
  { left: "13%", top: "12%", rotate: "-45deg" },
  { right: "13%", top: "12%", rotate: "45deg" },
  { left: "13%", bottom: "12%", rotate: "45deg" },
  { right: "13%", bottom: "12%", rotate: "-45deg" },
];

function NativeWeatherIcon({ type, style }) {
  const phase = useRef(new Animated.Value(0)).current;
  const iconStyle = StyleSheet.flatten(style) || {};
  const { fontSize = 24, color, textShadowColor, textShadowRadius, textAlign, ...layoutStyle } = iconStyle;
  const size = Math.max(16, Number(fontSize) || 24);
  useEffect(() => {
    const rhythm = Animated.loop(Animated.sequence([
      Animated.timing(phase, { toValue: 1, duration: type === "sunny" ? 2300 : 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(phase, { toValue: 0, duration: type === "sunny" ? 2300 : 3000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    rhythm.start();
    return () => rhythm.stop();
  }, [phase, type]);

  const cloudDrift = phase.interpolate({ inputRange: [0, 1], outputRange: [-size * 0.025, size * 0.025] });
  const sunPulse = phase.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.035] });
  const rayRotate = phase.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "3deg"] });
  const mercuryHeight = phase.interpolate({ inputRange: [0, 1], outputRange: [size * 0.16, size * 0.32] });
  const hasSun = ["sunny", "partly", "sunrise", "sunset"].includes(type);
  const hasCloud = ["partly", "cloudy", "rain", "drizzle"].includes(type);
  const hasRain = ["rain", "drizzle"].includes(type);
  const horizon = ["sunrise", "sunset"].includes(type);
  const hasThermometer = type === "temperature";
  const isSunny = type === "sunny";
  const sunLeft = type === "sunny" ? size * 0.24 : type === "partly" ? size * 0.12 : size * 0.3;
  const sunTop = isSunny ? size * 0.24 : type === "partly" ? size * 0.13 : size * 0.28;
  const sunSize = size * (isSunny ? 0.48 : 0.42);
  const cloudScale = size * (isSunny || horizon ? 0 : 0.78);
  const cloudLeft = size * (type === "partly" ? 0.22 : 0.11);
  const cloudTop = size * (type === "partly" ? 0.44 : hasRain ? 0.21 : 0.32);

  return (
    <View style={[layoutStyle, { width: size, height: size, overflow: "visible" }]}>
      {hasSun && <Animated.View style={[styles.nativeSun, { left: sunLeft, top: sunTop, width: sunSize, height: sunSize, transform: [{ scale: sunPulse }] }]}>
        <Animated.View style={[styles.nativeSunRays, { left: -sunSize * 0.25, top: -sunSize * 0.25, width: sunSize * 1.5, height: sunSize * 1.5, transform: [{ rotate: rayRotate }] }]}>
          {SUN_RAY_SLOTS.map((slot, index) => <View key={index} style={[styles.nativeSunRay, { left: slot.left, right: slot.right, top: slot.top, bottom: slot.bottom, width: Math.max(1, size * 0.035), height: Math.max(3, size * 0.12), transform: [{ rotate: slot.rotate }] }]} />)}
        </Animated.View>
        <View style={styles.nativeSunDisc} />
      </Animated.View>}
      {hasCloud && <Animated.View style={[styles.nativeCloud, { left: cloudLeft, top: cloudTop, width: cloudScale, height: cloudScale * 0.61, transform: [{ translateX: cloudDrift }] }]}>
        <View style={[styles.nativeCloudBase, { backgroundColor: "#edf6ff" }]} />
        <View style={[styles.nativeCloudLobe, styles.nativeCloudLobeLeft, { backgroundColor: "#edf6ff", width: cloudScale * 0.43, height: cloudScale * 0.43 }]} />
        <View style={[styles.nativeCloudLobe, styles.nativeCloudLobeCenter, { backgroundColor: "#edf6ff", width: cloudScale * 0.55, height: cloudScale * 0.55 }]} />
        <View style={[styles.nativeCloudLobe, styles.nativeCloudLobeRight, { backgroundColor: "#edf6ff", width: cloudScale * 0.4, height: cloudScale * 0.4 }]} />
      </Animated.View>}
      {hasRain && [0, 1, 2, 3].map((index) => <FallingStreak key={index} index={index} size={size} />)}
      {horizon && <View style={[styles.nativeHorizon, { left: size * 0.13, top: size * 0.69, width: size * 0.74 }]} />}
      {hasThermometer && <>
        <View style={[styles.nativeThermometerTube, { left: size * 0.39, top: size * 0.08, width: Math.max(3, size * 0.22), height: size * 0.62 }]} />
        <Animated.View style={[styles.nativeMercury, { left: size * 0.47, bottom: size * 0.3, width: Math.max(1.5, size * 0.06), height: mercuryHeight }]} />
        <Animated.View style={[styles.nativeThermometerBulb, { left: size * 0.31, top: size * 0.57, width: size * 0.38, height: size * 0.38, transform: [{ scale: sunPulse }] }]} />
        {[0, 1, 2].map((index) => <View key={index} style={[styles.nativeThermometerTick, { left: size * 0.63, top: size * (0.25 + index * 0.14), width: size * 0.1 }]} />)}
      </>}
    </View>
  );
}

function LiveIcon({ children, style, type = "default" }) {
  if (NATIVE_WEATHER_TYPES.includes(type)) return <NativeWeatherIcon type={type} style={style} />;

  const motion = useRef(new Animated.Value(0)).current;
  const startDelay = useRef(Math.round(Math.random() * 900)).current;

  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.delay(startDelay),
      Animated.timing(motion, { toValue: 1, duration: 1450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(motion, { toValue: 0, duration: 1450, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [motion, startDelay]);

  const float = motion.interpolate({ inputRange: [0, 1], outputRange: [1, -1] });
  const drift = motion.interpolate({ inputRange: [0, 1], outputRange: [-2.5, 2.5] });
  const fall = motion.interpolate({ inputRange: [0, 1], outputRange: [-2, 4] });
  const scale = motion.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.08] });
  const rotate = motion.interpolate({ inputRange: [0, 1], outputRange: ["-6deg", "6deg"] });
  const gentleRotate = motion.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "3deg"] });
  let transform;
  if (["sunny", "sunrise", "sunset"].includes(type)) transform = [{ rotate }, { scale }];
  else if (["rain", "drizzle"].includes(type)) transform = [{ translateY: float }];
  else if (["cloudy", "partly"].includes(type)) transform = [{ translateX: drift }, { translateY: float }];
  else if (["wind", "sensors"].includes(type)) transform = [{ translateX: drift }, { rotate: gentleRotate }];
  else if (type === "humidity") transform = [{ translateY: fall }, { scale }];
  else if (["air", "signal", "weather"].includes(type)) transform = [{ scale }];
  else if (type === "history") transform = [{ rotate: gentleRotate }];
  else if (type === "location") transform = [{ translateY: float }, { scale }];
  else transform = [{ translateY: float }, { scale }];
  return <Animated.Text style={[style, { transform }]}>{children}</Animated.Text>;
}

function App() {
  const [activePage, setActivePage] = useState("sensors");
  const [snapshot, setSnapshot] = useState({ mode: "demo", latest: SAMPLE_READING, history: [] });
  const [forecastData, setForecastData] = useState(null);
  const [forecastStatus, setForecastStatus] = useState("LOADING");
  const [forecastUpdatedAt, setForecastUpdatedAt] = useState(null);
  const [apiState, setApiState] = useState("CONNECTING");
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef(null);
  const refreshValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [activePage]);

  const loadReadings = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    if (!API_URL) {
      setApiState("API URL NEEDED");
      setSnapshot({ mode: "demo", latest: SAMPLE_READING, history: [] });
      if (manual) setRefreshing(false);
      return;
    }

    try {
      const response = await fetch(API_URL, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Readings API returned ${response.status}`);
      const payload = await response.json();
      setSnapshot({
        mode: payload.mode || "demo",
        latest: payload.mode === "demo" ? SAMPLE_READING : payload.latest || SAMPLE_READING,
        history: Array.isArray(payload.history) ? payload.history : [],
      });
      setApiState(payload.mode === "live" ? "LIVE SENSOR" : payload.mode === "stale" ? "STALE DATA" : "WAITING FOR SENSOR");
    } catch {
      setSnapshot({ mode: "demo", latest: SAMPLE_READING, history: [] });
      setApiState("API OFFLINE · SAMPLE DATA");
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  const loadForecast = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(FORECAST_URL, { headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error(`Forecast API returned ${response.status}`);
      const data = await response.json();
      if (!data.current || !data.hourly?.time?.length || !data.daily?.time?.length) throw new Error("Forecast response is incomplete");
      setForecastData(data);
      setForecastStatus("LIVE FORECAST");
      setForecastUpdatedAt(Date.now());
    } catch {
      setForecastStatus((current) => current === "LIVE FORECAST" || current === "CACHED FORECAST" ? "CACHED FORECAST" : "FORECAST UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    loadReadings();
    if (!API_URL) return undefined;
    const interval = setInterval(() => loadReadings(), 5000);
    return () => clearInterval(interval);
  }, [loadReadings]);

  useEffect(() => {
    loadForecast();
    const interval = setInterval(loadForecast, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadForecast]);

  useEffect(() => {
    if (!refreshing) {
      refreshValue.setValue(0);
      return undefined;
    }
    const spin = Animated.loop(Animated.timing(refreshValue, { toValue: 1, duration: 720, easing: Easing.linear, useNativeDriver: true }));
    spin.start();
    return () => spin.stop();
  }, [refreshing, refreshValue]);

  const latest = snapshot.latest || SAMPLE_READING;
  const raining = Boolean(latest.raining ?? latest.rain_detected);
  const temperature = displayNumber(latest.temperature_c, 1);
  const apiHistory = useMemo(() => Array.isArray(snapshot.history) ? snapshot.history.slice(-120) : [], [snapshot.history]);
  const latestApiReading = apiHistory.at(-1);
  const forecastCurrent = forecastData?.current;
  const forecastDaily = forecastData?.daily;
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
  const sensorDetail = SENSOR_DETAILS[activePage];
  const detailSamples = sensorDetail && sensorDetail.id !== "rain" ? apiHistory.map((item) => Number(item[sensorDetail.key])).filter(Number.isFinite) : [];
  const detailMinimum = detailSamples.length ? Math.min(...detailSamples) : null;
  const detailMaximum = detailSamples.length ? Math.max(...detailSamples) : null;
  const detailValue = sensorDetail?.id === "rain" ? (raining ? "WET" : "DRY") : sensorDetail ? displayNumber(latest[sensorDetail.key], sensorDetail.digits || 0) : "—";
  const detailCompanion = sensorDetail?.companion;
  const detailCompanionValue = detailCompanion ? displayNumber(latest[detailCompanion.key], detailCompanion.digits || 0) : "—";

  const refreshRotation = refreshValue.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  return (
    <View style={styles.stage}>
      <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={palette.background} />
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>W</Text></View>
          <View><Text style={styles.brandTitle}>Weather</Text><Text style={styles.brandSub}>STATION 01</Text></View>
        </View>
        <View style={styles.topbarActions}>
          <View style={styles.statusPill}><View style={[styles.statusDot, apiState === "LIVE SENSOR" && styles.statusDotLive]} /><Text style={styles.statusText}>{apiState}</Text></View>
          <Pressable onPress={() => loadReadings(true)} style={styles.refreshButton} accessibilityRole="button" accessibilityLabel="Refresh weather readings">
            <Animated.Text style={[styles.refreshGlyph, { transform: [{ rotate: refreshRotation }] }]}>↻</Animated.Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadReadings(true)} tintColor={palette.sky} colors={[palette.sky]} />}
      >
        {activePage === "sensors" && <View style={styles.panel}>
            <SectionHeading eyebrow="STATION 01 · PYTHON PAYLOAD" title="Sensor conditions" trailing={snapshot.mode === "live" ? "PYTHON LIVE" : snapshot.mode === "stale" ? "LAST PYTHON" : "SAMPLE PREVIEW"} />
          <View style={styles.sensorGrid}>
              <SensorTile icon="💧" iconMotion="humidity" label="Humidity" value={`${displayNumber(latest.humidity_percent)}%`} note="HUMIDITY · DHT11" onPress={() => setActivePage("humidity")} />
              <SensorTile icon="≋" iconMotion="wind" label="PM10 sensor" value={displayNumber(latest.pm10, 1)} note="PM1 · SCALED VALUE" onPress={() => setActivePage("pm10")} />
              <SensorTile icon="🌡️" iconMotion="temperature" label="Temperature sensor" value={`${displayNumber(latest.temperature_c, 1)}°C`} note="TEMP · DHT11 / GPIO 18" onPress={() => setActivePage("temperature")} />
              <SensorTile icon={raining ? "🌧️" : "☁️"} iconMotion={raining ? "rain" : "cloudy"} label="Rain input" value={raining ? "WET" : "DRY"} note="RAIN_DROP · GPIO 7" onPress={() => setActivePage("rain")} />
              <SensorTile icon="◉" iconMotion="air" label="Air quality raw" value={`${displayNumber(latest.air_quality_raw)} ADC`} note="AQ · ANALOG INPUT" onPress={() => setActivePage("air-quality")} />
          </View>
            <Text style={styles.sensorFootnote}>Python fields · TEMP · HUMIDITY · PM1 · AQ · RAIN_DROP · RTC</Text>
            <Text style={styles.sensorTimestamp}>Device time: {latest.device_time || "—"}  ·  API received: {latest.updated_at ? readingTime(latest.updated_at) : "Waiting for sensor"}</Text>
        </View>}

        {sensorDetail && <View style={styles.temperatureDetailPanel}>
          <Pressable onPress={() => setActivePage("sensors")} accessibilityRole="button" style={styles.temperatureBackButton}><Text style={styles.temperatureBackArrow}>‹</Text><Text style={styles.temperatureBackText}>Back to sensors</Text></Pressable>
          <View style={styles.temperatureDetailIntro}><Text style={styles.eyebrow}>STATION 01 · {sensorDetail.metadata}</Text><Text style={styles.temperatureDetailTitle}>{sensorDetail.label}</Text><Text style={styles.temperatureDetailSubtitle}>{sensorDetail.description}</Text></View>
          <View style={styles.temperatureHero}>
            <View style={styles.temperatureHeroHeader}><LiveIcon type={sensorDetail.icon} style={styles.temperatureHeroIcon}>{sensorDetail.iconFallback}</LiveIcon><Text style={styles.temperatureHeroLabel}>{sensorDetail.valueCaption || `CURRENT ${sensorDetail.label.toUpperCase()}`}</Text><View style={styles.temperatureLivePill}><View style={[styles.statusDot, snapshot.mode === "live" && styles.statusDotLive]} /><Text style={styles.temperatureLiveText}>{snapshot.mode === "live" ? "LIVE" : snapshot.mode === "stale" ? "LAST VALUE" : "SAMPLE"}</Text></View></View>
            <View style={styles.temperatureHeroValueLine}><Text style={[styles.temperatureHeroValue, sensorDetail.id === "rain" && styles.temperatureHeroState]}>{detailValue}</Text>{sensorDetail.unit ? <Text style={styles.temperatureHeroUnit}>{sensorDetail.unit}</Text> : null}</View>
            <Text style={styles.temperatureHeroSource}>Python field <Text style={styles.temperatureCode}>{sensorDetail.field}</Text>  →  API <Text style={styles.temperatureCode}>{sensorDetail.apiField}</Text></Text>
          </View>
          <View style={styles.temperatureDetailStats}>{sensorDetail.id === "rain" ? <>
            <View style={styles.temperatureDetailStat}><Text style={styles.temperatureDetailStatLabel}>INPUT PIN</Text><Text style={styles.temperatureDetailStatValue}>GPIO 7</Text></View>
            <View style={styles.temperatureDetailStat}><Text style={styles.temperatureDetailStatLabel}>RAIN STATE</Text><Text style={styles.temperatureDetailStatValue}>{detailValue}</Text></View>
            <View style={styles.temperatureDetailStat}><Text style={styles.temperatureDetailStatLabel}>{detailCompanion.label}</Text><Text style={styles.temperatureDetailStatValue}>{detailCompanionValue}{detailCompanion.unit}</Text></View>
          </> : <>
            <View style={styles.temperatureDetailStat}><Text style={styles.temperatureDetailStatLabel}>LOW · RECORDED</Text><Text style={styles.temperatureDetailStatValue}>{detailMinimum === null ? "—" : `${detailMinimum.toFixed(sensorDetail.digits || 0)}${sensorDetail.unit}`}</Text></View>
            <View style={styles.temperatureDetailStat}><Text style={styles.temperatureDetailStatLabel}>HIGH · RECORDED</Text><Text style={styles.temperatureDetailStatValue}>{detailMaximum === null ? "—" : `${detailMaximum.toFixed(sensorDetail.digits || 0)}${sensorDetail.unit}`}</Text></View>
            <View style={styles.temperatureDetailStat}><Text style={styles.temperatureDetailStatLabel}>{detailCompanion.label}</Text><Text style={styles.temperatureDetailStatValue}>{detailCompanionValue}{detailCompanion.unit}</Text></View>
          </>}</View>
          <View style={styles.panel}>
            <SectionHeading eyebrow="PYTHON SENSOR FEED" title={sensorDetail.historyTitle} trailing="LAST 12" />
            {sensorDetail.id === "rain" ? (() => {
              const rainStates = apiHistory.map(rainReading).filter((value) => value !== null && value !== undefined).slice(-12);
              return rainStates.length ? <View style={styles.rainHistoryRow}>{rainStates.map((value, index) => {
                const wet = value === true || value === 1 || value === "1";
                return <View key={`${index}-${String(value)}`} style={styles.rainHistoryItem}><View style={[styles.rainHistoryBar, wet && styles.rainHistoryBarWet]} /><Text style={[styles.rainHistoryLabel, wet && styles.rainHistoryLabelWet]}>{wet ? "WET" : "DRY"}</Text></View>;
              })}</View> : <Text style={styles.emptyText}>No Python API rain history yet.</Text>;
            })() : detailSamples.length ? <View style={styles.temperatureDetailChart}>
              <View style={styles.chartGridLine} /><View style={[styles.chartGridLine, styles.chartGridMiddle]} />
              <View style={styles.chartBars}>{detailSamples.slice(-12).map((value, index, values) => {
                const minimum = Math.min(...values);
                const range = Math.max(...values) - minimum || 1;
                const height = 28 + ((value - minimum) / range) * 62;
                return <View key={`${index}-${value}`} style={[styles.chartBar, { height: `${height}%`, opacity: index === values.length - 1 ? 1 : 0.62 }]} />;
              })}</View>
            </View> : <Text style={styles.emptyText}>No Python API history yet for this reading.</Text>}
            {sensorDetail.id !== "rain" && detailSamples.length ? <View style={styles.chartLabels}><Text style={styles.chartLabel}>OLDER</Text><Text style={styles.chartLabel}>RECENT</Text></View> : null}
            <View style={styles.temperatureDetailUpdated}><Text style={styles.temperatureDetailStatLabel}>LAST API READING</Text><Text style={styles.temperatureDetailUpdatedValue}>{latestApiReading?.device_time || (latestApiReading?.updated_at ? readingTime(latestApiReading.updated_at) : "Waiting for Python API history")}</Text></View>
          </View>
          <Text style={styles.temperatureDetailFootnote}>{snapshot.mode === "live" ? "Refreshing from the Python sensor every 5 seconds." : snapshot.mode === "stale" ? "Showing the most recent Python sensor value received." : "Showing sample values until the Python sensor sends a reading."}{sensorDetail.id === "air-quality" ? " Raw ADC values are not an AQI score." : ""}</Text>
        </View>}

        {activePage === "history" && <>
          <View style={styles.panel}>
            <SectionHeading eyebrow="STATION 01 · PYTHON API" title="Sensor reading history" trailing={apiHistory.length ? `${apiHistory.length} READINGS` : "NO API HISTORY"} />
            <Text style={styles.historyIntro}>{apiHistory.length ? "Graphs show the latest readings received by the Weather API." : "Waiting for Python sensor readings at the API endpoint."}</Text>
          </View>
          {HISTORY_METRICS.map((metric) => {
            const values = apiHistory.map((item) => item[metric.key]).filter((value) => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value))).map(Number).slice(-12);
            const minimum = values.length ? Math.min(...values) : 0;
            const range = values.length ? Math.max(...values) - minimum || 1 : 1;
            const latestValue = latestApiReading?.[metric.key];
            return <View key={metric.key} style={styles.panel}>
              <SectionHeading eyebrow={`PYTHON API · ${metric.unit}`} title={metric.label} trailing="LAST 12" />
              <View style={styles.historyLatestRow}><Text style={styles.historyLatestLabel}>LATEST RECEIVED</Text><Text style={styles.historyLatestValue}>{latestValue === null || latestValue === undefined ? "—" : `${displayNumber(latestValue, metric.digits)}${metric.unit}`}</Text></View>
              {values.length ? <View style={styles.chartWrap}>
                <View style={styles.chartGridLine} /><View style={[styles.chartGridLine, styles.chartGridMiddle]} />
                <View style={styles.chartBars}>{values.map((value, index) => {
                  const height = 28 + ((value - minimum) / range) * 62;
                  return <View key={`${index}-${value}`} style={[styles.chartBar, { height: `${height}%`, opacity: index === values.length - 1 ? 1 : 0.62 }]} />;
                })}</View>
              </View> : <Text style={styles.emptyText}>No Python API history yet for this reading.</Text>}
              {values.length ? <View style={styles.chartLabels}><Text style={styles.chartLabel}>OLDER</Text><Text style={styles.chartLabel}>RECENT</Text></View> : null}
              <Text style={styles.historyUpdated}>{latestApiReading?.updated_at ? `Last API update ${readingTime(latestApiReading.updated_at)}` : "Waiting for API timestamps"}</Text>
            </View>;
          })}
          <View style={styles.panel}>
            <SectionHeading eyebrow="PYTHON API · GPIO 7" title="Rain input" trailing="WET / DRY" />
            {apiHistory.some((item) => rainReading(item) !== null && rainReading(item) !== undefined) ? <View style={styles.rainHistoryRow}>{apiHistory.map(rainReading).filter((value) => value !== null && value !== undefined).slice(-12).map((value, index) => {
              const wet = value === true || value === 1 || value === "1";
              return <View key={`${index}-${String(value)}`} style={styles.rainHistoryItem}><View style={[styles.rainHistoryBar, wet && styles.rainHistoryBarWet]} /><Text style={[styles.rainHistoryLabel, wet && styles.rainHistoryLabelWet]}>{wet ? "WET" : "DRY"}</Text></View>;
            })}</View> : <Text style={styles.emptyText}>No Python API rain history yet.</Text>}
            {apiHistory.length ? <Text style={styles.historyUpdated}>{latestApiReading?.updated_at ? `Last API update ${readingTime(latestApiReading.updated_at)}` : "Digital input history · GPIO 7"}</Text> : null}
          </View>
        </>}

        {activePage === "sensors" && <View style={styles.panel}>
          <View style={styles.airHeadingRow}><SectionHeading eyebrow="ANALOG SENSOR · CH 1" title="Air quality overview" trailing="RAW INPUT" /><Pressable onPress={() => setActivePage("air-quality")} accessibilityRole="button" style={styles.airDetailButton}><Text style={styles.airDetailButtonText}>DETAILS →</Text></Pressable></View>
          <View style={styles.airOverviewMain}>
            <View style={styles.airGauge}>
              <View style={styles.airGaugeInner}>
                <Text style={styles.airGaugeLabel}>RAW SIGNAL</Text>
                <Text style={styles.airGaugeValue}>{displayNumber(latest.air_quality_raw)}</Text>
                <Text style={styles.airGaugeUnit}>ADC</Text>
              </View>
            </View>
            <View style={styles.airMetrics}>
              <View style={styles.airMetric}><View style={styles.metricDot} /><Text style={styles.airMetricValue}>{displayNumber(latest.pm10, 1)}</Text><Text style={styles.airMetricLabel}>PM10 · SCALED</Text></View>
              <View style={styles.airMetric}><View style={[styles.metricDot, styles.metricDotYellow]} /><Text style={styles.airMetricValue}>{displayNumber(latest.humidity_percent)}%</Text><Text style={styles.airMetricLabel}>HUMIDITY</Text></View>
              <View style={styles.airMetric}><View style={[styles.metricDot, raining && styles.metricDotRed]} /><Text style={styles.airMetricValue}>{raining ? "WET" : "DRY"}</Text><Text style={styles.airMetricLabel}>RAIN INPUT</Text></View>
              <View style={styles.airMetric}><View style={styles.metricDot} /><Text style={styles.airMetricValue}>{displayNumber(latest.air_quality_raw)}</Text><Text style={styles.airMetricLabel}>RAW ADC</Text></View>
            </View>
          </View>
          <Text style={styles.airOverviewNote}>Sensor values only · no AQI score</Text>
        </View>}

        {activePage === "weather" && <>
        <View style={styles.heroCard}>
          <View style={styles.heroGlow} />
          <View style={styles.heroTopline}><LiveIcon type="location" style={styles.location}>⌖</LiveIcon><Text style={styles.locationText}>Chennai</Text><Text style={styles.sourceLabel}>{snapshot.mode === "live" ? "LIVE SENSOR" : "SAMPLE SENSOR"}</Text></View>
          <LiveIcon type={raining ? "rain" : "partly"} style={styles.heroWeatherIcon}>{raining ? "🌧️" : "🌤️"}</LiveIcon>
          <View style={styles.tempLine}><Text style={styles.temperature}>{temperature}</Text><Text style={styles.degree}>°</Text></View>
          <Text style={styles.condition}>{raining ? "Rain detected" : snapshot.mode === "live" ? "Sensor dry" : "No rain detected"}</Text>
          <Text style={styles.highLow}>{todayForecast ? `High ${forecastNumber(todayForecast.high)}°  ·  Low ${forecastNumber(todayForecast.low)}°` : forecastStatus === "FORECAST UNAVAILABLE" ? "Today’s forecast unavailable" : "Loading today’s forecast…"}</Text>
          <Text style={styles.updated}>{readingTime(latest.updated_at)}</Text>
        </View>

        <View style={styles.forecastIntro}><Text style={styles.eyebrow}>LIVE MODEL · CHENNAI</Text><Text style={styles.forecastTitle}>Weather forecast</Text></View>
        <View style={styles.panel}>
          <SectionHeading eyebrow="NEXT HOURS · CHENNAI" title="Hourly forecast" trailing={forecastBadgeLabel(forecastStatus)} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hourlyRow}>
            {hourlyForecast.length ? hourlyForecast.map((hour, index) => <View key={`${hour.time}-${index}`} style={[styles.hourCard, index === 0 && styles.hourCardSelected]}>
              <Text style={styles.hourTime}>{hour.time}</Text><LiveIcon type={hour.icon} style={styles.hourIcon}>{weatherIconGlyph(hour.icon)}</LiveIcon><Text style={styles.hourTemp}>{forecastNumber(hour.temperature)}°</Text><Text style={styles.hourRain}>{forecastNumber(hour.chance)}% rain</Text>
            </View>) : <Text style={styles.forecastEmpty}>{forecastStatus === "FORECAST UNAVAILABLE" ? "Hourly forecast unavailable. Check your connection." : "Loading hourly forecast…"}</Text>}
          </ScrollView>
        </View>

        <View style={styles.panel}>
          <SectionHeading eyebrow="WEEK AT A GLANCE" title="7-day forecast" trailing={forecastBadgeLabel(forecastStatus)} />
          {dailyForecast.length ? <>
          <View style={styles.weekRangeLegend}><Text style={styles.weekRangeDayLabel}>DAY</Text><View style={styles.weekRangeSpacer} /><Text style={styles.weekRangeLowLabel}>LOW</Text><Text style={styles.weekRangeLabel}>DAILY RANGE · °C</Text><Text style={styles.weekRangeHighLabel}>HIGH</Text></View>
          {dailyForecast.map((day, index) => {
            const low = Number(day.low);
            const high = Number(day.high);
            const left = Number.isFinite(low) ? Math.max(0, Math.min(100, ((low - forecastTemperatureMin) / forecastTemperatureSpan) * 100)) : 0;
            const width = Number.isFinite(low) && Number.isFinite(high) ? Math.max(4, Math.min(100 - left, ((high - low) / forecastTemperatureSpan) * 100)) : 0;
            return <View key={day.date} style={[styles.weekRow, index === dailyForecast.length - 1 && styles.weekRowLast]}>
              <Text style={[styles.weekDay, index === 0 && styles.weekDayToday]}>{day.day}</Text>
              <LiveIcon type={day.icon} style={styles.weekIcon}>{weatherIconGlyph(day.icon)}</LiveIcon>
              <Text style={styles.weekLow}>{forecastNumber(day.low)}°</Text>
              <View style={styles.rangeTrack}><View style={[styles.rangeFill, { left: `${left}%`, width: `${width}%` }]} /></View>
              <Text style={styles.weekHigh}>{forecastNumber(day.high)}°</Text>
            </View>;
          })}</> : <Text style={styles.forecastEmpty}>{forecastStatus === "FORECAST UNAVAILABLE" ? "Seven-day forecast unavailable." : "Loading seven-day forecast…"}</Text>}
        </View>

        <View style={styles.panel}>
          <SectionHeading eyebrow="NEXT 3 DAYS · CHENNAI" title="Chance of rain" trailing={forecastBadgeLabel(forecastStatus)} />
          {rainForecast.length ? <View style={styles.rainChanceList}>
            {rainForecast.map(({ day, date, chance }) => <View key={date} style={styles.rainChanceRow}>
              <Text style={styles.rainChanceDay}>{day}</Text>
              <View style={styles.rainChanceTrack}><View style={[styles.rainChanceFill, { width: `${Math.max(0, Math.min(100, Number(chance) || 0))}%` }]} /></View>
              <Text style={styles.rainChanceValue}>{forecastNumber(chance)}%</Text>
            </View>)}
          </View> : <Text style={styles.forecastEmpty}>{forecastStatus === "FORECAST UNAVAILABLE" ? "Rain probability unavailable." : "Loading rain probability…"}</Text>}
        </View>

        <View style={styles.daylightRow}>
          <View style={[styles.panel, styles.daylightCard]}><LiveIcon type="sunrise" style={styles.daylightIcon}>🌅</LiveIcon><Text style={styles.eyebrow}>SUNRISE · LOCAL</Text><Text style={styles.daylightTime}>{forecastSunrise ? forecastClock(forecastSunrise) : "—"}</Text><View style={styles.daylightRule} /><Text style={styles.eyebrow}>SUNSET · LOCAL</Text><Text style={styles.daylightTime}>{forecastSunset ? forecastClock(forecastSunset) : "—"}</Text></View>
          <View style={[styles.panel, styles.apiCard]}><LiveIcon type="signal" style={styles.apiIcon}>⌁</LiveIcon><Text style={styles.eyebrow}>DATA SOURCE</Text><Text style={styles.apiStatus}>{apiState}</Text><Text style={styles.apiDescription}>{API_URL ? "Polling the Weather API every 5 seconds." : "Set EXPO_PUBLIC_WEATHER_API_URL to connect your sensor server."}</Text></View>
        </View>
        <Text style={styles.forecastCredit}>Forecast by Open-Meteo · updates every 30 min{forecastUpdatedAt ? ` · ${new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: FORECAST_TIMEZONE }).format(forecastUpdatedAt)}` : ""} · CC BY 4.0</Text>
        <Text style={styles.footer}>WEATHER API  ·  STATION 01</Text>
        </>}
      </ScrollView>

      <View style={styles.tabbar}>
        <Pressable style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: activePage === "sensors" || Boolean(sensorDetail) }} onPress={() => setActivePage("sensors")}><LiveIcon type="sensors" style={[styles.tabIcon, (activePage === "sensors" || Boolean(sensorDetail)) && styles.tabActive]}>⌁</LiveIcon><Text style={[styles.tabLabel, (activePage === "sensors" || Boolean(sensorDetail)) && styles.tabActive]}>Sensors</Text></Pressable>
        <Pressable style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: activePage === "history" }} onPress={() => setActivePage("history")}><LiveIcon type="history" style={[styles.tabIcon, activePage === "history" && styles.tabActive]}>⌁</LiveIcon><Text style={[styles.tabLabel, activePage === "history" && styles.tabActive]}>History</Text></Pressable>
        <Pressable style={styles.tabItem} accessibilityRole="tab" accessibilityState={{ selected: activePage === "weather" }} onPress={() => setActivePage("weather")}><LiveIcon type="weather" style={[styles.tabIcon, activePage === "weather" && styles.tabActive]}>◉</LiveIcon><Text style={[styles.tabLabel, activePage === "weather" && styles.tabActive]}>Weather</Text></Pressable>
      </View>
      {refreshing ? <ActivityIndicator style={styles.refreshIndicator} size="small" color={palette.sky} /> : null}
      </View>
    </View>
  );
}

const palette = {
  background: "#07152d",
  panel: "#102b52",
  raised: "#163963",
  text: "#f4f8ff",
  soft: "#c8d9ed",
  muted: "#8ca8c7",
  sky: "#9ce1ff",
  line: "rgba(216,235,255,0.12)",
};

const styles = StyleSheet.create({
  stage: { flex: 1, width: "100%", alignItems: "center", backgroundColor: "#040d1c" },
  screen: { flex: 1, width: "100%", maxWidth: 460, backgroundColor: palette.background, paddingTop: 8, borderLeftWidth: 1, borderRightWidth: 1, borderColor: "rgba(216,235,255,0.08)" },
  topbar: { minHeight: 60, paddingHorizontal: 20, paddingBottom: 10, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "#1d5889", borderWidth: 1, borderColor: "rgba(175,229,255,0.28)" },
  brandMarkText: { color: palette.sky, fontSize: 16, fontWeight: "800" },
  brandTitle: { color: palette.text, fontWeight: "700", fontSize: 14 },
  brandSub: { color: palette.muted, fontSize: 8, letterSpacing: 1.1, marginTop: 2 },
  topbarActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusPill: { flexDirection: "row", alignItems: "center", gap: 5, maxWidth: 145, paddingHorizontal: 9, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,0.035)" },
  statusDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: "#f4c679" },
  statusDotLive: { backgroundColor: "#65e7a1" },
  statusText: { color: palette.soft, fontSize: 8, fontWeight: "700" },
  refreshButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 18, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,0.05)" },
  refreshGlyph: { color: palette.sky, fontSize: 22, lineHeight: 24 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 2, paddingBottom: 18, gap: 12 },
  heroCard: { minHeight: 242, padding: 20, overflow: "hidden", borderRadius: 28, borderWidth: 1, borderColor: "rgba(211,237,255,0.22)", backgroundColor: "#2865a3", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 10 }, elevation: 5 },
  heroGlow: { position: "absolute", width: 230, height: 230, borderRadius: 120, right: -70, top: -58, backgroundColor: "rgba(153,220,255,0.14)" },
  heroTopline: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  location: { color: palette.text, fontSize: 13, fontWeight: "700", marginRight: 4 },
  locationText: { flex: 1, color: palette.text, fontSize: 13, fontWeight: "700" },
  sourceLabel: { color: "rgba(244,248,255,0.7)", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  heroWeatherIcon: { position: "absolute", top: 60, right: 25, fontSize: 72, textShadowColor: "rgba(255,215,132,0.35)", textShadowRadius: 16 },
  nativeSun: { position: "absolute", alignItems: "center", justifyContent: "center", zIndex: 1 },
  nativeSunRays: { position: "absolute", alignItems: "center", justifyContent: "center", overflow: "visible" },
  nativeSunRay: { position: "absolute", borderRadius: 8, backgroundColor: "#ffd36c" },
  nativeSunDisc: { width: "67%", height: "67%", borderRadius: 999, backgroundColor: "#ffd36c", borderWidth: 1, borderColor: "rgba(255,246,196,0.75)", shadowColor: "#ffc653", shadowOpacity: 0.72, shadowRadius: 7, elevation: 3 },
  nativeCloud: { position: "absolute", overflow: "visible", zIndex: 2, shadowColor: "#8dbfe8", shadowOpacity: 0.3, shadowRadius: 4, elevation: 2 },
  nativeCloudBase: { position: "absolute", bottom: 0, left: 0, width: "100%", height: "52%", borderRadius: 999 },
  nativeCloudLobe: { position: "absolute", borderRadius: 999 },
  nativeCloudLobeLeft: { left: "8%", top: "28%" },
  nativeCloudLobeCenter: { left: "27%", top: 0 },
  nativeCloudLobeRight: { right: "7%", top: "30%" },
  nativeHorizon: { position: "absolute", height: 1.5, borderRadius: 2, backgroundColor: "#ffd36c", zIndex: 4 },
  nativeThermometerTube: { position: "absolute", borderWidth: 1.3, borderColor: "#ffd0b8", borderRadius: 20, zIndex: 1 },
  nativeMercury: { position: "absolute", borderRadius: 5, backgroundColor: "#ff795f", zIndex: 2 },
  nativeThermometerBulb: { position: "absolute", borderWidth: 1, borderColor: "#ffd0b8", borderRadius: 999, backgroundColor: "#ff795f", shadowColor: "#ff795f", shadowOpacity: 0.5, shadowRadius: 4, zIndex: 3 },
  nativeThermometerTick: { position: "absolute", height: 1, backgroundColor: "#ffb89d", zIndex: 2 },
  rainStreak: { position: "absolute", borderRadius: 2, backgroundColor: "#73d8ff", zIndex: 3 },
  tempLine: { flexDirection: "row", alignItems: "flex-start", marginTop: 26 },
  temperature: { color: "#fff", fontSize: 78, lineHeight: 84, fontWeight: "300", letterSpacing: -5 },
  degree: { color: "#fff", fontSize: 26, marginTop: 7, marginLeft: 2, fontWeight: "300" },
  condition: { color: "#fff", fontSize: 16, fontWeight: "600", marginTop: 0 },
  highLow: { color: "rgba(245,250,255,0.84)", fontSize: 11, fontWeight: "600", marginTop: 7 },
  sampleHint: { color: "rgba(221,237,255,0.62)", fontSize: 9, fontWeight: "400" },
  updated: { color: "rgba(221,237,255,0.68)", fontSize: 9, marginTop: 10 },
  panel: { padding: 15, borderRadius: 22, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel, shadowColor: "#000", shadowOpacity: 0.14, shadowRadius: 14, shadowOffset: { width: 0, height: 7 }, elevation: 3 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: palette.line },
  eyebrow: { color: palette.muted, fontSize: 8, fontWeight: "800", letterSpacing: 1 },
  sectionTitle: { color: palette.text, fontSize: 15, fontWeight: "700", marginTop: 4, letterSpacing: -0.2 },
  trailingLabel: { color: "rgba(206,228,249,0.52)", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  historyIntro: { color: palette.muted, fontSize: 10, lineHeight: 16, marginTop: 11 },
  historyLatestRow: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 13 },
  historyLatestLabel: { flex: 1, color: palette.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.6 },
  historyLatestValue: { color: palette.text, fontSize: 22, fontWeight: "700", letterSpacing: -0.4 },
  historyUpdated: { color: palette.muted, fontSize: 8, marginTop: 9 },
  sensorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  sensorTile: { width: "48.6%", minHeight: 104, padding: 11, borderRadius: 15, borderWidth: 1, borderColor: "rgba(226,241,255,0.09)", backgroundColor: "rgba(5,21,49,0.27)" },
  sensorTilePressed: { borderColor: "rgba(156,225,255,0.5)", backgroundColor: "rgba(35,83,130,0.48)" },
  sensorIcon: { color: palette.sky, fontSize: 15, height: 19 },
  sensorLabel: { color: "rgba(221,236,255,0.69)", fontSize: 9, marginTop: 1 },
  sensorValue: { color: palette.text, fontSize: 19, fontWeight: "700", marginTop: 2 },
  sensorNote: { color: "rgba(194,217,241,0.46)", fontSize: 6, fontWeight: "700", letterSpacing: 0.55, marginTop: 3 },
  sensorFootnote: { color: "rgba(211,230,250,0.57)", fontSize: 9, marginTop: 11 },
  sensorTimestamp: { color: palette.muted, fontSize: 8, lineHeight: 13, marginTop: 5 },
  temperatureDetailPanel: { gap: 12 },
  temperatureBackButton: { alignSelf: "flex-start", minHeight: 30, flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 8 },
  temperatureBackArrow: { color: palette.sky, fontSize: 25, lineHeight: 27 },
  temperatureBackText: { color: palette.sky, fontSize: 11, fontWeight: "600" },
  temperatureDetailIntro: { paddingHorizontal: 2, paddingBottom: 2 },
  temperatureDetailTitle: { color: palette.text, fontSize: 23, fontWeight: "700", marginTop: 5, letterSpacing: -0.6 },
  temperatureDetailSubtitle: { color: palette.muted, fontSize: 10, marginTop: 5 },
  temperatureHero: { minHeight: 187, padding: 17, borderRadius: 22, borderWidth: 1, borderColor: "rgba(211,237,255,0.18)", backgroundColor: "#1b4b7e", overflow: "hidden" },
  temperatureHeroHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  temperatureHeroIcon: { color: "#ffc09e", fontSize: 18, width: 23 },
  temperatureHeroLabel: { flex: 1, color: "rgba(224,241,255,0.72)", fontSize: 8, fontWeight: "800", letterSpacing: 0.8 },
  temperatureLivePill: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "rgba(216,235,255,0.13)", backgroundColor: "rgba(4,19,42,0.2)" },
  temperatureLiveText: { color: "#dceeff", fontSize: 7, fontWeight: "800", letterSpacing: 0.5 },
  temperatureHeroValueLine: { flexDirection: "row", alignItems: "flex-start", marginTop: 11 },
  temperatureHeroValue: { color: "#fff", fontSize: 69, lineHeight: 74, fontWeight: "300", letterSpacing: -4 },
  temperatureHeroState: { fontSize: 50, letterSpacing: -1 },
  temperatureHeroUnit: { color: "#dceeff", fontSize: 21, marginTop: 7, marginLeft: 3, fontWeight: "300" },
  temperatureHeroSource: { color: "rgba(224,241,255,0.62)", fontSize: 8, marginTop: 3 },
  temperatureCode: { color: "#c6eaff", fontFamily: "monospace", fontWeight: "700" },
  temperatureDetailStats: { flexDirection: "row", gap: 7 },
  temperatureDetailStat: { flex: 1, minHeight: 65, paddingHorizontal: 10, paddingVertical: 10, justifyContent: "center", borderRadius: 15, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.panel },
  temperatureDetailStatLabel: { color: palette.muted, fontSize: 7, fontWeight: "800", letterSpacing: 0.45 },
  temperatureDetailStatValue: { color: palette.text, fontSize: 17, fontWeight: "700", marginTop: 6 },
  temperatureDetailChart: { height: 116, position: "relative", justifyContent: "space-between", overflow: "hidden", marginTop: 13, paddingVertical: 4 },
  temperatureDetailUpdated: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 9, paddingTop: 9, borderTopWidth: 1, borderTopColor: palette.line },
  temperatureDetailUpdatedValue: { color: palette.soft, fontSize: 9, fontWeight: "600", textAlign: "right" },
  temperatureDetailFootnote: { color: "rgba(194,217,241,0.54)", fontSize: 8, paddingHorizontal: 2 },
  rainHistoryRow: { height: 116, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6, paddingVertical: 9 },
  rainHistoryItem: { flex: 1, alignItems: "center", gap: 9 },
  rainHistoryBar: { width: "100%", height: 8, borderRadius: 99, backgroundColor: "rgba(167,195,222,0.4)" },
  rainHistoryBarWet: { backgroundColor: "#65cfff" },
  rainHistoryLabel: { color: palette.muted, fontSize: 6, fontWeight: "800" },
  rainHistoryLabelWet: { color: palette.sky },
  airHeadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  airDetailButton: { paddingHorizontal: 8, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: palette.line, backgroundColor: "rgba(255,255,255,0.035)" },
  airDetailButtonText: { color: palette.sky, fontSize: 7, fontWeight: "800", letterSpacing: 0.4 },
  chartWrap: { height: 115, overflow: "hidden", marginTop: 13, justifyContent: "space-between", paddingVertical: 4 },
  chartGridLine: { position: "absolute", left: 0, right: 0, top: 8, height: 1, backgroundColor: "rgba(220,238,255,0.09)" },
  chartGridMiddle: { top: 56 },
  chartBars: { height: "100%", flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 4, paddingHorizontal: 2 },
  chartBar: { flex: 1, minHeight: 8, borderTopLeftRadius: 5, borderTopRightRadius: 5, backgroundColor: "#96defd" },
  chartLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  chartLabel: { color: palette.muted, fontSize: 7, fontWeight: "700", letterSpacing: 0.6 },
  currentHistory: { color: palette.muted, fontSize: 9, marginTop: 10 },
  currentHistoryValue: { color: palette.text, fontWeight: "700" },
  emptyText: { color: palette.muted, fontSize: 11, paddingVertical: 24 },
  forecastIntro: { paddingHorizontal: 4, paddingTop: 5, paddingBottom: 0 },
  forecastTitle: { color: palette.text, fontSize: 21, fontWeight: "700", marginTop: 4, letterSpacing: -0.5 },
  hourlyRow: { gap: 7, paddingTop: 12, paddingBottom: 2 },
  hourCard: { width: 66, alignItems: "center", justifyContent: "center", paddingVertical: 9, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.035)" },
  hourCardSelected: { backgroundColor: "rgba(105,189,236,0.19)", borderWidth: 1, borderColor: "rgba(173,225,255,0.16)" },
  hourTime: { color: "rgba(226,240,255,0.76)", fontSize: 8, fontWeight: "600" },
  hourIcon: { fontSize: 22, marginVertical: 8 },
  hourTemp: { color: palette.text, fontSize: 12, fontWeight: "700" },
  hourRain: { color: palette.muted, fontSize: 7, marginTop: 4 },
  forecastEmpty: { color: palette.muted, fontSize: 10, lineHeight: 16, paddingVertical: 18, textAlign: "center" },
  forecastCredit: { color: palette.muted, fontSize: 8, lineHeight: 14, textAlign: "center", paddingHorizontal: 8, paddingTop: 3 },
  weekRow: { minHeight: 43, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: "rgba(225,240,255,0.07)" },
  weekRowLast: { borderBottomWidth: 0 },
  weekRangeLegend: { minHeight: 22, flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: palette.line },
  weekRangeDayLabel: { width: 42, color: palette.muted, fontSize: 6, fontWeight: "800", letterSpacing: 0.35 },
  weekRangeSpacer: { width: 25 },
  weekRangeLowLabel: { width: 23, color: palette.muted, fontSize: 6, fontWeight: "800", textAlign: "right" },
  weekRangeLabel: { flex: 1, color: palette.muted, fontSize: 6, fontWeight: "800", textAlign: "center", letterSpacing: 0.35 },
  weekRangeHighLabel: { width: 25, color: palette.muted, fontSize: 6, fontWeight: "800", textAlign: "right" },
  weekDay: { width: 42, color: "rgba(235,245,255,0.86)", fontSize: 11 },
  weekDayToday: { fontWeight: "800", color: "#fff" },
  weekIcon: { width: 25, fontSize: 17, textAlign: "center" },
  rangeTrack: { flex: 1, height: 4, borderRadius: 4, overflow: "hidden", backgroundColor: "rgba(223,238,255,0.14)" },
  rangeFill: { position: "absolute", top: 0, bottom: 0, borderRadius: 4, backgroundColor: "#f5c77d" },
  weekHigh: { width: 25, color: palette.text, fontSize: 11, textAlign: "right", fontWeight: "700" },
  weekLow: { width: 23, color: "rgba(224,239,255,0.58)", fontSize: 11, textAlign: "right" },
  airOverviewMain: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 14, paddingBottom: 11 },
  airGauge: { width: 94, height: 94, borderRadius: 50, borderWidth: 3, borderColor: "#43c75b", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,21,49,0.28)" },
  airGaugeInner: { alignItems: "center", justifyContent: "center", gap: 2 },
  airGaugeLabel: { color: palette.muted, fontSize: 6, fontWeight: "800", letterSpacing: 0.65 },
  airGaugeValue: { color: "#58d36d", fontSize: 18, fontWeight: "700" },
  airGaugeUnit: { color: palette.muted, fontSize: 7, fontWeight: "700" },
  airMetrics: { flex: 1, flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 12, borderLeftWidth: 1, borderLeftColor: palette.line, paddingLeft: 13 },
  airMetric: { width: "46%", minHeight: 39, paddingLeft: 10 },
  metricDot: { position: "absolute", left: 0, top: 5, width: 6, height: 6, borderRadius: 4, backgroundColor: "#39cf5a" },
  metricDotYellow: { backgroundColor: "#f4d44b" },
  metricDotRed: { backgroundColor: "#ff594f" },
  airMetricValue: { color: palette.text, fontSize: 12, fontWeight: "700" },
  airMetricLabel: { color: palette.muted, fontSize: 6, fontWeight: "700", letterSpacing: 0.25, marginTop: 3 },
  airOverviewNote: { borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 8, color: palette.muted, fontSize: 8 },
  rainChanceList: { gap: 14, paddingTop: 18, paddingBottom: 7 },
  rainChanceRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  rainChanceDay: { width: 53, color: palette.soft, fontSize: 9 },
  rainChanceTrack: { flex: 1, height: 8, overflow: "hidden", borderWidth: 1, borderColor: "rgba(126,212,255,0.32)", borderRadius: 10, backgroundColor: "rgba(222,241,255,0.05)" },
  rainChanceFill: { height: "100%", backgroundColor: "#5cbcff" },
  rainChanceValue: { width: 29, color: palette.text, fontSize: 9, textAlign: "right", fontWeight: "700" },
  rainChanceNote: { color: palette.muted, fontSize: 8, marginBottom: 2 },
  daylightRow: { flexDirection: "row", gap: 9 },
  daylightCard: { flex: 1, minHeight: 170 },
  apiCard: { flex: 1, minHeight: 170 },
  daylightIcon: { fontSize: 22, marginBottom: 9 },
  daylightRule: { height: 1, backgroundColor: palette.line, marginVertical: 8 },
  daylightTime: { color: palette.text, fontWeight: "700", fontSize: 13, marginTop: 3 },
  apiIcon: { color: palette.sky, fontSize: 25, marginBottom: 4 },
  apiStatus: { color: palette.text, fontSize: 11, fontWeight: "700", marginTop: 12 },
  apiDescription: { color: palette.muted, fontSize: 9, lineHeight: 14, marginTop: 7 },
  footer: { color: "rgba(179,205,232,0.39)", textAlign: "center", fontSize: 8, letterSpacing: 1.2, paddingVertical: 7 },
  tabbar: { minHeight: 61, paddingHorizontal: 22, paddingTop: 9, paddingBottom: 6, flexDirection: "row", alignItems: "center", justifyContent: "space-around", borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: "#0a1b36" },
  tabItem: { minWidth: 55, alignItems: "center", justifyContent: "center", gap: 2 },
  tabIcon: { color: "rgba(199,222,246,0.52)", fontSize: 20, fontWeight: "700" },
  tabLabel: { color: "rgba(199,222,246,0.52)", fontSize: 8, fontWeight: "600" },
  tabActive: { color: palette.sky },
  refreshIndicator: { position: "absolute", top: 70, right: 20 },
});

export default App;
