#!/bin/bash

echo "=============================="
echo "   Clearing ALL Cache Types   "
echo "=============================="

echo ""
echo "🔥 1) Clearing Vite cache..."
rm -rf node_modules/.vite
rm -rf dist
echo "✔ Vite cache cleared."

echo ""
echo "🔥 2) Clearing Node.js cache..."
npm cache clean --force
rm -rf node_modules
npm install
echo "✔ Node cache cleared."

echo ""
echo "🔥 3) Clearing PM2 cache & logs..."
pm2 flush
pm2 delete all
rm -rf ~/.pm2/logs/*
echo "✔ PM2 cache cleared."

echo ""
echo "🔥 4) Clearing Nginx cache..."
sudo rm -rf /var/cache/nginx/*
sudo /etc/init.d/nginx reload
echo "✔ Nginx cache cleared."

echo ""
echo "🔥 5) Cloudflare cache..."
echo "⚠ Cloudflare cache cannot be cleared from server."
echo "➡ Go to: Cloudflare Dashboard → Caching → Purge Everything"

echo ""
echo "🔥 6) Clearing Service Worker cache..."
echo "⚠ Service Worker cache must be cleared from browser DevTools."
echo "➡ Application → Service Workers → Unregister + Clear Storage"

echo ""
echo "=============================="
echo "   ALL CACHE CLEARED (local)  "
echo "=============================="
