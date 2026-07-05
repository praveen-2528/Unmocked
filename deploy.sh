#!/bin/bash

# Exit on any error
set -e

echo "=================================================="
echo "    🚀 UnMocked - Amazon Linux EC2 Deployment     "
echo "=================================================="

echo "=> 1. Installing Node.js (18.x) and Build Tools..."
# Install Node 18 from NodeSource
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs gcc-c++ make

echo "=> 2. Installing PM2 Process Manager globally..."
sudo npm install -g pm2

echo "=> 3. Installing Root Dependencies..."
# Using --omit=dev for production since we'll just serve the pre-built dist folder
npm install --omit=dev

echo "=> 4. Installing Server Dependencies (with SQLite Native Build)..."
cd server
npm install --omit=dev
cd ..

echo "=> 5. Setting up PM2 to run the server..."
# Check if PM2 is already running the app to restart, else start
if pm2 show unmocked > /dev/null; then
  echo "Restarting existing PM2 process..."
  pm2 restart unmocked
else
  echo "Starting new PM2 process..."
  cd server
  pm2 start index.js --name "unmocked"
  cd ..
fi

echo "=> 6. Saving PM2 Process list..."
pm2 save

echo "=> 7. Configuring PM2 to start on boot..."
# This generates the startup script for PM2, it will output a command you need to run with sudo
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user || true
pm2 save

echo "=================================================="
echo " ✅ Deployment Complete!                          "
echo "                                                  "
echo " Make sure your EC2 Security Group has port 3001  "
echo " open if you want to access the app directly via: "
echo " http://<YOUR_EC2_PUBLIC_IP>:3001                 "
echo "                                                  "
echo " Note: To use Port 80, you can setup Nginx or run "
echo " sudo iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3001 "
echo "=================================================="
