# TrackPulse — AWS deployment (2026-08-15)

Deployed under a dedicated `trackpulse-dev` IAM user (account `113831184294`,
region `ap-south-1`), kept separate from the account's other project
(`nowcart-dev`). Policy: `iam-policy-trackpulse-dev.json`.

## Live URLs

- Frontend: https://d2jwudtuujhq9x.cloudfront.net
- Backend API: https://3.109.18.197.sslip.io (docs at `/docs`)

## What's running

**Backend** — single EC2 `t3.micro` (free-tier eligible), Elastic IP
`3.109.18.197`, instance id in `deploy/.instance_id`.
- Docker container `trackpulse-backend`, `--restart unless-stopped`, bound to
  `127.0.0.1:7860` only (not exposed directly).
- nginx terminates TLS on 443 and reverse-proxies to the container
  (`/etc/nginx/conf.d/trackpulse.conf`, sourced from
  `deploy/nginx-trackpulse.conf`), `proxy_read_timeout 300s` because CLIP
  inference on a free-tier CPU is slow.
- TLS cert is Let's Encrypt for `3.109.18.197.sslip.io` — **Let's Encrypt
  refuses to issue for `*.amazonaws.com`**, so the EC2 instance's own public
  DNS name doesn't work for this; `sslip.io` (magic DNS: `<ip>.sslip.io`
  resolves to `<ip>`, no registration needed) is the workaround. Renews via
  a cron job (`/etc/cron.d/certbot-renew`, daily 03:00, reloads nginx).
- 2GB swapfile (`/swapfile`) — 1GB RAM is tight for PyTorch/transformers
  loading CLIP plus OpenCV; without it the container can OOM.
- `HF_TOKEN` comes from `backend/.env`, copied to the instance at
  `~/trackpulse-backend/.env` and passed via `--env-file`. Not baked into
  the image.
- Uploaded video/frames persist at `~/trackpulse-uploads` on the host
  (mounted into the container) rather than the container's writable layer —
  survives container restarts, still wiped if the instance is replaced.

**Frontend** — S3 bucket `trackpulse-frontend-113831184294` (private,
`BucketOwnerEnforced`, no public access) behind CloudFront distribution
`E2Q6M7KIXZUAFG`, read access scoped to that one distribution via Origin
Access Control (`deploy/s3-bucket-policy.json`). Built with
`frontend/.env.production` → `VITE_API_BASE=https://3.109.18.197.sslip.io`.

## Redeploying after a code change

**Backend:**
```bash
cd backend
tar -czf /tmp/trackpulse-backend.tar.gz Dockerfile pyproject.toml uv.lock app .env
scp -i ../deploy/trackpulse-backend-key.pem /tmp/trackpulse-backend.tar.gz ec2-user@3.109.18.197.sslip.io:/home/ec2-user/
ssh -i ../deploy/trackpulse-backend-key.pem ec2-user@3.109.18.197.sslip.io "
  rm -rf ~/trackpulse-backend && mkdir ~/trackpulse-backend &&
  tar -xzf trackpulse-backend.tar.gz -C ~/trackpulse-backend &&
  cd ~/trackpulse-backend &&
  sudo docker build -t trackpulse-backend . &&
  sudo docker rm -f trackpulse-backend &&
  sudo docker run -d --name trackpulse-backend --restart unless-stopped \
    -p 127.0.0.1:7860:7860 --env-file .env \
    -v /home/ec2-user/trackpulse-uploads:/app/data/uploads \
    trackpulse-backend
"
```
(SSH is only open to the IP that created the security group rule —
`49.200.56.118/32` at deploy time. If your IP changed, add a new ingress
rule for port 22 on security group in `deploy/.sg_id` first, using the
`trackpulse-dev` profile.)

**Frontend:**
```bash
cd frontend && npm run build
aws s3 sync dist s3://trackpulse-frontend-113831184294/ --delete --profile trackpulse-dev
aws cloudfront create-invalidation --distribution-id E2Q6M7KIXZUAFG --paths "/*" --profile trackpulse-dev
```

## Known constraints of this setup

- **Backend is a single instance, no auto-recovery beyond Docker's own
  restart policy.** If the EC2 instance itself dies, nothing brings it back
  automatically. Fine for a demo, not production-grade.
- **CLIP inference is slow on a `t3.micro`** (burstable CPU, 1GB RAM +
  swap). The nginx proxy timeout is set to 300s to accommodate this; very
  large uploads may still be slow.
- **Public IPv4 charge**: AWS bills ~$0.005/hr for the Elastic IP regardless
  of Fargate/EC2 choice, covered by free tier only in an account's first 12
  months. This account has prior usage (`nowcart-dev`), so this may be a
  real ~$3.65/month charge — check Billing → Free Tier to confirm. Every
  other resource here (EC2 instance-hours, S3, CloudFront) is within
  standard free-tier limits at this traffic scale.
- **Uploaded videos/frames are not backed up** — they live on the instance's
  EBS volume, not S3. Replacing the instance loses them (matches the
  original Hugging Face Spaces deployment's "ephemeral storage" behaviour,
  see `backend/README.md`).

## Pausing for an extended period (no cost) and resuming

`deploy/pause.sh` stops the EC2 instance and **releases** its Elastic IP —
release is required for real $0, since AWS bills the public-IPv4 charge
whether or not the IP is attached to a running instance. The EBS volume
(built Docker image, uploaded data) is kept, so resuming doesn't mean
rebuilding from scratch. The frontend (S3 + CloudFront) is left running —
it costs ~$0 at rest either way.

```bash
./deploy/pause.sh
```

Because the Elastic IP is released, the backend's address changes on
resume (new IP → new `sslip.io` hostname → new TLS cert). `deploy/resume.sh`
does the whole chain: start the instance, allocate a new IP, issue a fresh
Let's Encrypt cert, repoint nginx, confirm the container came back up on
its own (`--restart unless-stopped` survives the stop/start), then rebuild
and redeploy the frontend against the new backend URL.

```bash
./deploy/resume.sh
```

Takes a few minutes end to end. The one thing this doesn't automate:
`frontend/.env.production` gets rewritten with the new backend URL — commit
that if you want git to reflect it.

## Cost monitoring

`trackpulse-dev` has no billing access by default — two one-time steps:

1. **Root-only**: Console → account name (top right) → **Account** →
   "IAM User and Role Access to Billing Information" → Activate. No IAM
   policy can substitute for this; it has to be the root user.
2. Add the `CostMonitoring` statement in `iam-policy-trackpulse-dev.json`
   to the attached policy (console → IAM → Policies → edit JSON).

Once both are in place, an AWS Budget with email alerts can be created —
see the account's Billing → Budgets console, or ask for it to be created
via CLI (`aws budgets create-budget`).

## Teardown (if this deployment is ever decommissioned)

```bash
export AWS_PROFILE=trackpulse-dev AWS_REGION=ap-south-1
aws cloudfront get-distribution-config --id E2Q6M7KIXZUAFG   # disable first, CloudFront requires this before delete
aws ec2 terminate-instances --instance-ids $(cat deploy/.instance_id)
aws ec2 release-address --allocation-id $(cat deploy/.eip_alloc_id)
aws s3 rm s3://trackpulse-frontend-113831184294 --recursive
aws s3api delete-bucket --bucket trackpulse-frontend-113831184294
aws ec2 delete-security-group --group-id $(cat deploy/.sg_id)
aws ec2 delete-key-pair --key-name trackpulse-backend-key
```
Then delete the CloudFront distribution itself via console once disabled
(deletion requires `Enabled: false` and a propagated config first), and
delete the `trackpulse-dev` IAM user/policy from the console if no longer
needed.
