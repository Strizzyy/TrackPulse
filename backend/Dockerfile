# TrackPulse backend -- built for a Hugging Face Docker Space (free CPU tier).
# HF Spaces serve on port 7860 and run the container as-is; the CLIP weights
# are baked into the image at build time so cold starts don't re-download them.

FROM python:3.11-slim

# opencv-python needs these system libs on slim images
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

# HF Spaces convention: run as non-root user 1000 with a writable home
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

COPY --chown=user pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY --chown=user . .

# Bake the CLIP model into the image (vision.load downloads to the local cache).
# Without this, every Space restart re-downloads ~600MB before serving.
RUN uv run python -c "from app.pipeline import vision; vision.load()"

EXPOSE 7860
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
