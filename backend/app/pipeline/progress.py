"""In-memory job progress registry so the frontend can show a real progress
bar during the (long, synchronous) CLIP pass instead of a blind spinner.

The frontend generates a job_id, sends it with the upload, and polls
GET /api/progress/{job_id} every ~500ms while the request is in flight. The
endpoints publish stage + percent as they go; the vision loop reports every
frame it scores. Deliberately trivial -- a dict, no persistence: progress only
matters while the request is alive, and a lost entry just means the bar shows
"processing" without a percentage.
"""

import threading
import time
from typing import Dict, Optional

_lock = threading.Lock()
_jobs: Dict[str, Dict] = {}

# Drop finished jobs after this long so the dict can't grow forever.
_TTL_SEC = 300


def update(job_id: Optional[str], stage: str, done: int = 0, total: int = 0, pct: Optional[float] = None) -> None:
    """Publish progress. pct overrides done/total when given (0-100)."""
    if not job_id:
        return
    if pct is None:
        pct = (100.0 * done / total) if total else 0.0
    with _lock:
        _jobs[job_id] = {
            "stage": stage,
            "done": done,
            "total": total,
            "pct": round(max(0.0, min(100.0, pct)), 1),
            "updated": time.time(),
        }
        _evict()


def finish(job_id: Optional[str]) -> None:
    update(job_id, "done", pct=100.0)


def get(job_id: str) -> Optional[Dict]:
    with _lock:
        job = _jobs.get(job_id)
        return dict(job) if job else None


def _evict() -> None:
    now = time.time()
    for k in [k for k, v in _jobs.items() if now - v["updated"] > _TTL_SEC]:
        del _jobs[k]
