#!/bin/bash
# Resume the TrackPulse backend after deploy/pause.sh. Because pause.sh
# releases the Elastic IP entirely (the only way to get to true $0 while
# paused), resuming can't just "start the instance" -- there's a new IP,
# which means a new sslip.io hostname, which means the old TLS cert no
# longer matches and nginx needs to point at a new one. This script
# re-does that whole chain end to end, including rebuilding and
# redeploying the frontend against the new backend URL.
#
# Takes a few minutes: instance boot, SSH becoming reachable, a fresh
# Let's Encrypt issuance, and a frontend rebuild + S3 sync + CloudFront
# invalidation.
set -euo pipefail
cd "$(dirname "$0")/.."

export AWS_PROFILE=trackpulse-dev
export AWS_REGION=ap-south-1

INSTANCE_ID=$(cat deploy/.instance_id)
KEY=deploy/trackpulse-backend-key.pem
BUCKET=$(cat deploy/.bucket_name)
DIST_ID=$(cat deploy/.distribution_id)
EMAIL="rahulapt12@gmail.com"

echo "Starting instance $INSTANCE_ID ..."
aws ec2 start-instances --instance-ids "$INSTANCE_ID" >/dev/null
aws ec2 wait instance-running --instance-ids "$INSTANCE_ID"

echo "Allocating a new Elastic IP ..."
ALLOC_JSON=$(aws ec2 allocate-address --domain vpc \
  --tag-specifications 'ResourceType=elastic-ip,Tags=[{Key=Name,Value=trackpulse-backend}]')
ALLOC_ID=$(echo "$ALLOC_JSON" | grep -o '"AllocationId": "[^"]*"' | cut -d'"' -f4)
PUBLIC_IP=$(echo "$ALLOC_JSON" | grep -o '"PublicIp": "[^"]*"' | cut -d'"' -f4)
echo "$ALLOC_ID" > deploy/.eip_alloc_id
echo "$PUBLIC_IP" > deploy/.public_ip

aws ec2 associate-address --instance-id "$INSTANCE_ID" --allocation-id "$ALLOC_ID" >/dev/null

DASHED_IP=$(echo "$PUBLIC_IP" | tr '.' '-')
PUBLIC_DNS="ec2-${DASHED_IP}.ap-south-1.compute.amazonaws.com"
SSLIP_DNS="${PUBLIC_IP}.sslip.io"
echo "$PUBLIC_DNS" > deploy/.public_dns
echo "$SSLIP_DNS" > deploy/.public_dns_sslip
echo "New backend address: https://$SSLIP_DNS"

echo "Waiting for SSH ..."
for i in $(seq 1 20); do
  if ssh -i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=5 -o BatchMode=yes \
    ec2-user@"$PUBLIC_DNS" "echo ok" >/dev/null 2>&1; then break; fi
  sleep 10
done

echo "Issuing a fresh TLS cert for $SSLIP_DNS ..."
ssh -i "$KEY" ec2-user@"$PUBLIC_DNS" "
  sudo systemctl stop nginx &&
  sudo certbot certonly --standalone -d $SSLIP_DNS --non-interactive --agree-tos -m $EMAIL
"

echo "Repointing nginx at the new hostname ..."
SCRATCH=$(mktemp -d)
sed "s/3\.109\.18\.197\.sslip\.io/$SSLIP_DNS/g" deploy/nginx-trackpulse.conf > "$SCRATCH/nginx-resume.conf"
scp -i "$KEY" "$SCRATCH/nginx-resume.conf" ec2-user@"$PUBLIC_DNS":/home/ec2-user/nginx-trackpulse.conf
ssh -i "$KEY" ec2-user@"$PUBLIC_DNS" "
  sudo cp /home/ec2-user/nginx-trackpulse.conf /etc/nginx/conf.d/trackpulse.conf &&
  sudo nginx -t && sudo systemctl restart nginx
"
rm -rf "$SCRATCH"

echo "Confirming the backend container came back up on its own (restart: unless-stopped) ..."
ssh -i "$KEY" ec2-user@"$PUBLIC_DNS" "sudo docker ps --filter name=trackpulse-backend"
curl -s -o /dev/null -w "backend check: HTTP %{http_code}\n" "https://$SSLIP_DNS/api/circuits"

echo "Rebuilding the frontend against the new backend URL ..."
echo "VITE_API_BASE=https://$SSLIP_DNS" > frontend/.env.production
( cd frontend && npm run build )
aws s3 sync frontend/dist "s3://$BUCKET/" --delete
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

cat <<EOF

Resumed.
  Backend:  https://$SSLIP_DNS
  Frontend: (same CloudFront URL as before, now pointing at the new backend)

frontend/.env.production was rewritten with the new backend URL -- commit
it if you want that reflected in git.
EOF
