# TrackPulse backend — built for Hugging Face Spaces (Docker SDK), but this
# is a plain container: it runs the same way on Render, Fly.io, Cloud Run,
# or `docker run` locally. Build context is this `backend/` directory.
#
# Two stages: `builder` resolves the exact dependency versions pinned in
# uv.lock and pre-downloads the CLIP model weights (openai/clip-vit-base-patch32,
# ~600MB, ungated) so the first request never pays a cold-start download.
# `runtime` copies only the built venv + baked model cache, so the final
# image doesn't carry uv, apt build metadata, or pip's own cache.

FROM python:3.11-slim AS builder

RUN pip install --no-cache-dir uv

WORKDIR /app

# Install deps first so this layer is cached across app-code-only changes.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app

# Bake the CLIP weights into the image at build time (network access is
# available during `docker build`; HF_HOME must match the runtime value in
# the final stage below since vision.py reads it at import time).
ENV HF_HOME=/app/.hf_cache
RUN uv run python -c "from app.pipeline import vision; vision.load()"

FROM python:3.11-slim AS runtime

# opencv-python (non-headless) needs libGL at runtime; ffmpeg backs OpenCV's
# video decoding for the mp4 uploads this app scores frame-by-frame.
RUN apt-get update && apt-get install -y --no-install-recommends \
        ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Hugging Face Spaces runs containers as a non-root UID; matching that here
# means the same image behaves the same on Spaces and everywhere else.
RUN useradd -m -u 1000 appuser
WORKDIR /app

COPY --from=builder --chown=appuser:appuser /app/.venv /app/.venv
COPY --from=builder --chown=appuser:appuser /app/.hf_cache /app/.hf_cache
# app/data/*.json (circuits, sc_stats, silverstone) comes along with this --
# it's committed real data read by circuits.py/history.py, not build output.
COPY --from=builder --chown=appuser:appuser /app/app /app/app

ENV PATH="/app/.venv/bin:${PATH}" \
    HF_HOME=/app/.hf_cache \
    PYTHONUNBUFFERED=1

# Uploaded videos/frames land in backend/data/uploads at request time
# (UPLOAD_DIR in main.py, a sibling of app/ -- not app/data above). Ephemeral
# storage is fine for a demo; it resets whenever the container restarts,
# which is expected on free-tier hosting.
RUN mkdir -p /app/data/uploads && chown -R appuser:appuser /app/data

USER appuser

# 7860 is the Hugging Face Spaces convention; $PORT is honored for hosts
# (Render, Cloud Run, Railway) that inject their own port at runtime.
ENV PORT=7860
EXPOSE 7860

CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
