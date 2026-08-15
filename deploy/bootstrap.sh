#!/bin/bash
# EC2 user-data: base system setup for the TrackPulse backend host.
# Runs once on first boot as root. App deployment (image build/run, TLS
# cert issuance, nginx vhost) happens afterwards over SSH -- this only
# needs to prep the box: swap (CLIP inference is tight on 1GB RAM),
# Docker, nginx, and certbot.
set -ex

# 2GB swap -- t3.micro has 1GB RAM, PyTorch/transformers loading CLIP
# plus OpenCV can OOM without headroom.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' >> /etc/fstab
fi

dnf install -y docker nginx python3-pip
systemctl enable --now docker
usermod -aG docker ec2-user

# AL2023 has no certbot package in the base repo; pip install is the
# supported path here.
python3 -m pip install certbot certbot-nginx

systemctl enable --now nginx

touch /home/ec2-user/bootstrap-complete
