from typing import Dict, List

import httpx

SILVERSTONE_LAT = 52.0786
SILVERSTONE_LON = -1.0169
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"


async def get_precipitation_forecast(minutes_ahead: int = 15) -> Dict:
    """Free, no-API-key precipitation forecast. Fails soft: on any error
    (no network, rate limit, etc.) returns available=False so the caller
    can fall back to trend-only projection instead of crashing the request."""
    params = {
        "latitude": SILVERSTONE_LAT,
        "longitude": SILVERSTONE_LON,
        "minutely_15": "precipitation",
        "forecast_days": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        precip = data.get("minutely_15", {}).get("precipitation", [])
        steps = max(minutes_ahead // 15, 1)
        return {"available": True, "precipitation_mm": precip[:steps]}
    except Exception:
        return {"available": False, "precipitation_mm": []}


def project_condition(
    current_score: float,
    recent_slope: float,
    precipitation_mm: List[float],
    num_laps: int,
    avg_lap_time_sec: float,
) -> Dict:
    """Blend the visually-measured trend with the forecast direction. This
    is a transparent weighted extrapolation, not a trained model -- keep it
    that way, it's explainable and that's the point."""
    rain_signal = sum(precipitation_mm) / len(precipitation_mm) if precipitation_mm else 0.0
    lap_adjustment = 0.05 if rain_signal > 0.1 else -0.01
    adjusted_slope = recent_slope + lap_adjustment

    projected = []
    score = current_score
    for _ in range(num_laps):
        score = min(max(score + adjusted_slope, 0.0), 1.0)
        projected.append(round(score, 3))

    return {
        "horizon_laps": list(range(1, num_laps + 1)),
        "projected_wetness": projected,
        "rain_probability_pct": round(min(rain_signal * 100, 100), 1),
        "avg_lap_time_sec": avg_lap_time_sec,
    }
