# AWS Deployment — EC2 + S3 + nginx + CloudFront

Architecture (per plan): FastAPI backend on **EC2** behind **nginx**, static frontend
on **S3**, both unified behind **CloudFront** which gives the free HTTPS URL
(`https://xxxx.cloudfront.net`) and routes by path:

```
browser ── https ──> CloudFront
                       ├── default:            S3 bucket   (frontend dist/)
                       └── /api/* , /media/*:  EC2 :80     (nginx -> uvicorn :8000)
```

Because everything shares the CloudFront origin, the frontend is built with
`VITE_API_BASE=""` (relative URLs) — no CORS, no mixed-content problems.

---

## 1. EC2 backend

**Launch**: Ubuntu 24.04, `t3.medium` (4GB RAM — CLIP needs it; t3.micro will OOM),
30GB gp3 disk (torch is big). Security group: allow 22 (your IP) and 80 (anywhere —
CloudFront will call it).

```bash
sudo apt update && sudo apt install -y nginx git curl
curl -LsSf https://astral.sh/uv/install.sh | sh && source ~/.bashrc

git clone https://github.com/Strizzyy/TrackPulse.git
cd TrackPulse/backend
uv sync
cp .env.example .env        # then edit: add HF_TOKEN (optional but enables the agent)
```

**Run uvicorn as a service** (survives reboots/SSH drops):

```bash
sudo tee /etc/systemd/system/trackpulse.service > /dev/null <<'EOF'
[Unit]
Description=TrackPulse backend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/ubuntu/TrackPulse/backend
ExecStart=/home/ubuntu/.local/bin/uv run uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl enable --now trackpulse
```

First start downloads CLIP (~1–2 min). Check: `curl localhost:8000/api/circuits`.

**nginx** (config is in this folder):

```bash
sudo cp ~/TrackPulse/deploy/nginx.conf /etc/nginx/sites-available/trackpulse
sudo ln -sf /etc/nginx/sites-available/trackpulse /etc/nginx/sites-enabled/trackpulse
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Check from your laptop: `http://<EC2-public-IP>/api/circuits` should return JSON.

> The nginx config already sets `client_max_body_size 300M` (video uploads) and
> 300s proxy timeouts (CLIP is slow) — don't skip it, defaults break both.

---

## 2. S3 frontend

Build locally with a **relative** API base so requests go through CloudFront:

```powershell
cd TrackPulse\frontend
$env:VITE_API_BASE = ""
npm run build
```

Create the bucket (any region) and upload:

```powershell
aws s3 mb s3://trackpulse-frontend
aws s3 sync dist/ s3://trackpulse-frontend --delete
```

Leave the bucket **private** — CloudFront will access it via Origin Access Control
(next step). No static-website-hosting toggle needed.

---

## 3. CloudFront

Create a distribution:

- **Origin 1 (default)**: the S3 bucket → choose **Origin access control (OAC)**,
  let the console create the OAC and copy the generated bucket policy into the
  bucket (the console offers a one-click "copy policy" banner).
- **Origin 2**: the EC2 **public IPv4 DNS** (e.g. `ec2-x-x-x-x.compute.amazonaws.com`),
  protocol **HTTP only**, port 80.
- **Default behavior** → S3 origin, GET/HEAD, caching enabled, and set
  **Default root object**: `index.html`.
- **Behavior `/api/*`** → EC2 origin:
  - Allowed methods: **GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE**
  - Cache policy: **CachingDisabled**
  - Origin request policy: **AllViewerExceptHostHeader**
- **Behavior `/media/*`** → EC2 origin: GET/HEAD, CachingDisabled (frames are
  per-session, don't cache them).

**⚠ The one real gotcha — CloudFront's origin response timeout.** Default is 30s;
CLIP analysis of a lap takes 60–120s on CPU, so `/api/analyze` will 504 through
CloudFront. Two-part fix:

1. In each EC2 behavior's origin settings, raise **Origin response timeout** to
   **60s** (the console maximum).
2. Request a quota increase to **180s**: Service Quotas → CloudFront →
   "Origin response timeout" → request 180. Usually approved within a day, free.
   Until it's approved, demo with short clips (30–40s of footage ≈ under 60s of
   analysis) or hit the EC2 IP directly for the heavy uploads.

Deploying the distribution takes ~5–10 minutes. Your URL: `https://xxxx.cloudfront.net`.

---

## 4. Redeploying updates

- **Frontend**: `npm run build` (with `VITE_API_BASE=""`) → `aws s3 sync dist/ s3://trackpulse-frontend --delete` →
  `aws cloudfront create-invalidation --distribution-id XXXX --paths "/*"`
- **Backend**: `ssh` in → `cd TrackPulse && git pull && sudo systemctl restart trackpulse`

## 5. Cost discipline

- `t3.medium` ≈ $1/day running — **stop the instance when not demoing** (stopped ≈ pennies).
  Note: stopping changes the public DNS → update the CloudFront EC2 origin after a
  restart, or allocate an **Elastic IP** (free while attached) and use that instead.
- S3 + CloudFront at demo traffic: effectively $0 (free-tier allowances cover it).
- Set a **billing alarm** at $5 (CloudWatch → Billing) before anything else.
