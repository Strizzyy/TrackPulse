"""Fuel effect on lap time.

This is the one genuinely *modelled* piece of the strategy stack -- everything
else (corner geometry, degradation, pit loss, safety-car rates) is measured off
real FastF1 sessions. The constants below are public, well-established F1
figures rather than a fit, and they live here as named module constants for the
same reason the safety-car earliness multipliers do in history.py: a strategist
should be able to see the number and disagree with it.

Two uses:
  - stripping fuel burn out of degradation regressions, so a stint that is
    getting faster on burn-off isn't read as a tyre that never wears
    (scripts/build_circuit_data.py)
  - projecting lap times forward in the race simulator (race_sim.py)
"""

# Regulation maximum race fuel load. Cars start a full race distance near this.
FUEL_START_KG = 110.0

# Lap-time penalty per kilogram carried. The usual quoted range is 0.03-0.035
# s/kg; the conservative end is used here.
SEC_PER_KG = 0.03


def burn_per_lap_kg(total_laps: int) -> float:
    """Burn the full load evenly across the race distance. Real burn is not
    perfectly even (safety cars, lift-and-coast), but across a whole race the
    average is what matters and the alternative is inventing a fuel map."""
    if not total_laps or total_laps <= 0:
        return 0.0
    return FUEL_START_KG / total_laps


def fuel_load_kg(lap_number: float, total_laps: int) -> float:
    """Fuel still on board at the start of a given lap (1-indexed)."""
    burn = burn_per_lap_kg(total_laps)
    remaining = FUEL_START_KG - burn * max(lap_number - 1, 0)
    return max(remaining, 0.0)


def fuel_time_penalty_sec(lap_number: float, total_laps: int) -> float:
    """Seconds this lap is slower than the same lap run on an empty tank.

    Subtract this from a measured lap time to get a fuel-corrected time that is
    comparable across a stint.
    """
    return fuel_load_kg(lap_number, total_laps) * SEC_PER_KG
