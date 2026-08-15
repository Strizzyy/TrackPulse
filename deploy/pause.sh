#!/bin/bash
# Pause the TrackPulse backend to $0: stop the EC2 instance and release its
# Elastic IP. EC2 compute-hours stop billing the moment the instance is
# stopped, but the Elastic IP bills ~$0.005/hr *whether or not* it's
# attached to a running instance (AWS's public-IPv4 charge) -- releasing
# it is the only way to actually get to zero for that piece.
#
# The frontend (S3 + CloudFront) is left running on purpose: it costs
# ~$0 at rest (a few hundred KB of storage, no compute), so there's
# nothing to gain by tearing it down, and leaving it up means resume.sh
# doesn't have to recreate a bucket/distribution.
#
# The EBS root volume (20GB) is NOT deleted -- the built Docker image
# and everything on disk survives a stop, so resume doesn't need to
# rebuild the image from scratch. It bills a small amount for storage
# while paused if the account is outside its EBS free-tier window
# (~$1.60/mo for 20GB gp3 in ap-south-1) -- the one residual cost this
# script can't remove without also discarding the built image.
set -euo pipefail
cd "$(dirname "$0")/.."

export AWS_PROFILE=trackpulse-dev
export AWS_REGION=ap-south-1

INSTANCE_ID=$(cat deploy/.instance_id)
ALLOC_ID=$(cat deploy/.eip_alloc_id)

echo "Stopping instance $INSTANCE_ID ..."
aws ec2 stop-instances --instance-ids "$INSTANCE_ID" >/dev/null
aws ec2 wait instance-stopped --instance-ids "$INSTANCE_ID"
echo "Instance stopped."

echo "Releasing Elastic IP ($ALLOC_ID) ..."
aws ec2 release-address --allocation-id "$ALLOC_ID"

rm -f deploy/.eip_alloc_id deploy/.public_ip deploy/.public_dns deploy/.public_dns_sslip

cat <<'EOF'

Paused.
  - EC2 instance: stopped (no compute-hour charges while stopped)
  - Elastic IP: released (no public-IPv4 charge while paused)
  - EBS volume: kept, so the built image survives (small storage cost
    outside the free-tier window; see comment at the top of this script)
  - Frontend (S3 + CloudFront): left running, effectively free at rest,
    but will show connection errors until you run resume.sh -- the
    backend it points at is offline

Run deploy/resume.sh whenever you want it back.
EOF
