from typing import Dict, List

import httpx

from app.pipeline import trend

SILVERSTONE_LAT = 52.0786
SILVERSTONE_LON = -1.0169
OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"

# Per-lap wetness adjustments, applied on top of the visually-measured slope.
# Stated constants rather than a fitted curve: the whole point of this module
# is that a strategist can see why the projection bends the way it does.
RAIN_FALLING_ADJUSTMENT = 0.05  # rain actually measured in the forecast window
RAIN_LIKELY_ADJUSTMENT = 0.02  # high chance of rain but none falling yet
DRYING_ADJUSTMENT = -0.01  # no rain signal: track sheds water lap on lap

RAIN_FALLING_MM = 0.1  # mm over the window that counts as "it is raining"
RAIN_LIKELY_PCT = 50.0  # probability at/above which we lean wet pre-emptively


async def get_precipitation_forecast(
    minutes_ahead: int = 15, lat: float = SILVERSTONE_LAT, lon: float = SILVERSTONE_LON
) -> Dict:
    """Free, no-API-key precipitation forecast. Fails soft: on any error
    (no network, rate limit, etc.) returns available=False so the caller
    can fall back to trend-only projection instead of crashing the request.

    Pulls two distinct signals at 15-minute resolution:
      precipitation             -- mm expected, i.e. how hard it will rain
      precipitation_probability -- percent chance, i.e. how likely at all
    These are not interchangeable. An earlier version reported mm * 100 under
    the name "rain_probability_pct", so 0.3mm of drizzle displayed as "30%".

    `lat`/`lon` default to Silverstone for the single-lap endpoint, which is
    Silverstone-only. The multi-circuit session/strategy endpoints must pass
    the selected circuit's own coordinates -- otherwise a Monaco or Suzuka
    session was silently scored against Silverstone's weather.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "minutely_15": "precipitation,precipitation_probability",
        "forecast_days": 1,
    }
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            data = resp.json()
        block = data.get("minutely_15", {})
        steps = max(minutes_ahead // 15, 1)
        return {
            "available": True,
            "precipitation_mm": (block.get("precipitation") or [])[:steps],
            "precipitation_probability_pct": (block.get("precipitation_probability") or [])[:steps],
        }
    except Exception:
        return {"available": False, "precipitation_mm": [], "precipitation_probability_pct": []}


def _mean(values: List[float]) -> float:
    usable = [v for v in values if v is not None]
    return sum(usable) / len(usable) if usable else 0.0


def weather_adjustment(
    precipitation_mm: List[float], precipitation_probability_pct: List[float] = None
) -> Dict:
    """The weather's own contribution to the per-lap wetness slope, split out
    so a caller can compute the NET slope (measured + weather) *before* it
    decides anything.

    Three-way branch so "raining now", "probably about to rain" and "dry" are
    distinguishable; previously anything short of measurable rain collapsed
    into the same drying assumption.

    `note` describes the weather term ONLY. It used to be the whole forecast
    rationale, which meant the no-rain branch printed "assuming the track keeps
    drying" underneath a curve that was climbing to fully wet -- the sentence
    described the -0.01 weather adjustment while the projection was dominated
    by a much larger measured slope pointing the other way.
    """
    rain_mm = _mean(precipitation_mm)
    rain_prob = _mean(precipitation_probability_pct or [])

    if rain_mm > RAIN_FALLING_MM:
        adjustment = RAIN_FALLING_ADJUSTMENT
        note = f"{rain_mm:.2f}mm forecast in the window -- weather pushing the track wetter."
    elif rain_prob >= RAIN_LIKELY_PCT:
        adjustment = RAIN_LIKELY_ADJUSTMENT
        note = f"{rain_prob:.0f}% chance of rain but none falling yet -- weather leaning wet."
    else:
        adjustment = DRYING_ADJUSTMENT
        note = "No meaningful rain signal -- weather alone would dry the track."

    return {
        "adjustment": adjustment,
        "note": note,
        "rain_mm": rain_mm,
        "rain_probability_pct": rain_prob,
    }


def project_condition(
    current_score: float,
    slope_per_lap: float,
    precipitation_mm: List[float],
    num_laps: int,
    avg_lap_time_sec: float,
    precipitation_probability_pct: List[float] = None,
) -> Dict:
    """Blend the visually-measured trend with the forecast direction. This
    is a transparent weighted extrapolation, not a trained model -- keep it
    that way, it's explainable and that's the point.

    `slope_per_lap` is the measured visual trend in wetness per LAP, from
    trend.compute_trend() or session.compute_session_trend() -- both report
    that unit, and the per-lap adjustments below are only meaningful against it.
    """
    weather_term = weather_adjustment(precipitation_mm, precipitation_probability_pct)
    rain_mm = weather_term["rain_mm"]
    rain_prob = weather_term["rain_probability_pct"]
    lap_adjustment = weather_term["adjustment"]
    weather_note = weather_term["note"]

    adjusted_slope = slope_per_lap + lap_adjustment

    projected_direction = trend.direction_for_slope(adjusted_slope)
    net_phrase = {
        "wetting": "track wetting up",
        "drying": "track drying out",
        "stable": "holding roughly steady",
    }[projected_direction]
    rationale = f"{weather_note} Net projection {adjusted_slope:+.3f}/lap -- {net_phrase}."

    projected = []
    score = current_score
    for _ in range(num_laps):
        score = min(max(score + adjusted_slope, 0.0), 1.0)
        projected.append(round(score, 3))

    return {
        "horizon_laps": list(range(1, num_laps + 1)),
        "projected_wetness": projected,
        # A real probability from the API, not mm rescaled. Keep it that way.
        "rain_probability_pct": round(rain_prob, 1),
        "precipitation_mm": round(rain_mm, 2),
        "measured_slope": round(slope_per_lap, 4),
        "weather_adjustment": lap_adjustment,
        # The net slope, and the direction every decision downstream is taken
        # from. Surfaced so the UI can show why a call disagrees with the raw
        # measured trend rather than looking arbitrary.
        "adjusted_slope": round(adjusted_slope, 4),
        "projected_direction": projected_direction,
        "forecast_rationale": rationale,
        "avg_lap_time_sec": avg_lap_time_sec,
    }
