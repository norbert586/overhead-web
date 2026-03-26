import { useState, useEffect } from 'react';
import { useSettings } from '../hooks/useSettings';

interface WeatherData {
  tempF:      number;
  condition:  string;
  windMph:    number;
  windDir:    string;
  humidity:   number;
}

const WMO: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
  45: 'Fog', 48: 'Icy fog',
  51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle',
  61: 'Light rain', 63: 'Rain', 65: 'Heavy rain',
  71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Light showers', 81: 'Rain showers', 82: 'Heavy showers',
  85: 'Snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Hail storm', 99: 'Severe hail storm',
};

function compassDir(deg: number): string {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export default function WeatherCard() {
  const { settings } = useSettings();
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [error,   setError  ] = useState(false);

  const lat = settings.latitude;
  const lon = settings.longitude;

  useEffect(() => {
    if (lat == null || lon == null) return;

    let cancelled = false;

    async function fetch_() {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m` +
          `&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto`,
        );
        if (!res.ok) throw new Error();
        const json = await res.json() as {
          current: {
            temperature_2m:       number;
            weather_code:         number;
            wind_speed_10m:       number;
            wind_direction_10m:   number;
            relative_humidity_2m: number;
          };
        };
        if (!cancelled) {
          setWeather({
            tempF:     Math.round(json.current.temperature_2m),
            condition: WMO[json.current.weather_code] ?? 'Unknown',
            windMph:   Math.round(json.current.wind_speed_10m),
            windDir:   compassDir(json.current.wind_direction_10m),
            humidity:  json.current.relative_humidity_2m,
          });
        }
      } catch {
        if (!cancelled) setError(true);
      }
    }

    fetch_();
    const timer = setInterval(fetch_, 10 * 60 * 1000); // refresh every 10 min
    return () => { cancelled = true; clearInterval(timer); };
  }, [lat, lon]);

  if (lat == null || lon == null) return null;

  return (
    <div className="stat-card weather-card">
      <div className="stat-card-header">Local Weather</div>

      {error && (
        <div className="weather-error">Unable to load weather</div>
      )}

      {!error && !weather && (
        <div className="weather-loading">Loading…</div>
      )}

      {weather && (
        <div className="weather-body">
          <div className="weather-primary">
            <span className="weather-temp">{weather.tempF}°</span>
            <span className="weather-condition">{weather.condition}</span>
          </div>
          <div className="weather-rows">
            <div className="stat-row">
              <span className="s-label">Wind</span>
              <span className="s-value">{weather.windMph} mph {weather.windDir}</span>
            </div>
            <div className="stat-row">
              <span className="s-label">Humidity</span>
              <span className="s-value">{weather.humidity}%</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
