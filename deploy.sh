#!/bin/bash
# تحديث المشروع على الخادم: سحب التعديلات، تثبيت الحزم، ترحيل قاعدة البيانات، البناء، ثم إعادة التشغيل عبر aaPanel/pm2.
# التشغيل: bash deploy.sh   (أو من مهمة Cron في aaPanel: echo $(date); bash /www/wwwroot/PMPro2/cpmp/deploy.sh)
set -e

APP_DIR="${APP_DIR:-/www/wwwroot/PMPro2/cpmp}"
APP_NAME="${APP_NAME:-cpmp}"   # اسم المشروع في aaPanel

SCRIPT="/www/server/nodejs/vhost/scripts/${APP_NAME}.sh"

# إذا ظهر "npm: command not found" فعّل السطر التالي وعدّل رقم نسخة Node
# export PATH="/www/server/nodejs/v20.18.0/bin:$PATH"

cd "$APP_DIR"

echo ">> Clearing cache..."
bash clear-cache.sh

echo ">> Pulling latest changes..."
git pull
echo ">> Now at: $(git log -1 --oneline)"

rm -rf node_modules

echo ">> Installing dependencies..."
npm install

# ينشئ جداول المدفوعات والأعمدة الجديدة إن لم تكن موجودة. آمن عند التكرار (IF NOT EXISTS).
# إن فشل يتوقف النشر قبل البناء وإعادة التشغيل.
echo ">> Running payments migration..."
npm run db:migrate-payments

echo ">> Building..."
npm run build

echo ">> Starting application..."
if [ ! -f "$SCRIPT" ]; then
  echo "!! Start script not found: $SCRIPT"
  exit 1
fi
nohup bash "$SCRIPT" >/dev/null 2>&1 &
sleep 3

echo ">> Restarting application..."
# يعيد تشغيل التطبيق إذا كان يعمل، أو يشغّله إذا كان متوقفاً، حسب ecosystem.config.cjs
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

echo ">> Done."
pm2 list
echo "Application deployed!"
