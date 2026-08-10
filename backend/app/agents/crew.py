import os
from typing import Dict, Optional

from crewai import LLM, Agent, Crew, Task

# Configurable so a teammate can swap models without touching code -- Qwen2.5
# is ungated on the Hub (unlike most Llama checkpoints, which need you to
# accept a license on the model page before your token can call them).
DEFAULT_MODEL = os.getenv("HF_LLM_MODEL", "huggingface/Qwen/Qwen2.5-7B-Instruct")


def _build_llm() -> Optional[LLM]:
    token = os.getenv("HF_TOKEN")
    if not token:
        return None
    return LLM(model=DEFAULT_MODEL, api_key=token, temperature=0.4)


def synthesize(signals: Dict) -> Optional[str]:
    """Chief Strategist: the one LLM call in the whole pipeline. Takes the
    already-computed vision/weather/history/rule-engine output (all real,
    already-run Python) and writes a race-engineer-style radio call.

    Returns None if HF_TOKEN isn't set or the call fails for any reason --
    the caller falls back to strategy.recommend()'s deterministic text.
    This must never be the thing that breaks a request.
    """
    try:
        llm = _build_llm()
        if llm is None:
            return None

        strategist = Agent(
            role="Chief Race Strategist",
            goal="Give the driver a short, decisive radio call based on the team's live signals.",
            backstory=(
                "You are the lead strategist on the Silverstone pit wall. Your Track Scout, "
                "Meteorologist, and Historian have just reported in. You talk like a real race "
                "engineer on team radio: short, direct, confident, no fluff, no hedging."
            ),
            llm=llm,
            verbose=False,
        )

        task = Task(
            description=(
                "Here is what the crew is seeing right now:\n"
                f"- Track Scout (vision): current condition is '{signals['current_label']}', "
                f"wetness score {signals['current_score']:.2f}, trend is {signals['trend_direction']} "
                f"({signals['trend_summary']}).\n"
                f"- Meteorologist: {signals['rain_probability_pct']}% rain signal over the next laps, "
                f"projected wetness trajectory {signals['projected_wetness']}.\n"
                f"- Historian: this track's historical Safety Car/VSC rate is {signals['sc_base_rate_pct']}%, "
                f"current estimated risk {signals['sc_risk_pct']}%. "
                f"{signals.get('sc_timing_note') or ''}\n"
                f"- Rule engine's baseline call: '{signals['rule_based_call']}' "
                f"(compound: {signals['compound']}, urgency: {signals['urgency']}, "
                f"pit window laps {signals.get('pit_window_laps')}).\n\n"
                "Write ONE radio call, 2-4 sentences, in the voice of a race engineer talking to "
                "the driver over team radio. Agree with the rule engine's call unless the signals "
                "clearly suggest otherwise -- if you override it, say why in one short clause. "
                "Include the tyre call AND, in your own words, when to expect the safety car "
                "window, so the driver knows what to plan around. Use lap numbers where you have "
                "them. Never invent a number the crew did not report. "
                "Output ONLY the radio call, nothing else."
            ),
            expected_output="A short race-engineer radio call, 1-3 sentences, no preamble.",
            agent=strategist,
        )

        crew = Crew(agents=[strategist], tasks=[task], verbose=False)
        result = crew.kickoff()
        text = str(result).strip()
        return text or None
    except Exception:
        return None
