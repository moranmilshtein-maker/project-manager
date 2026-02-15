# 🚀 התקנה על Cloudways - מדריך שלב אחר שלב

## 📋 מה שתצטרך:
- ✅ חשבון Cloudways עם Custom Application Server
- ✅ פרטי הגישה לשרת (IP, Username, Password)

---

## 🔧 שלב 1: התחברות לשרת

### 1.1 פתח Terminal/SSH Client

**Windows:**
- הורד Putty: https://www.putty.org/
- או השתמש ב-PowerShell

**Mac/Linux:**
- פתח Terminal

### 1.2 התחבר לשרת:

```bash
ssh master@YOUR_SERVER_IP
```

הזן את הסיסמה כשתתבקש.

---

## 🎯 שלב 2: הכנת השרת (העתק פקודה אחר פקודה)

### 2.1 עדכון המערכת:
```bash
sudo apt update && sudo apt upgrade -y
```

### 2.2 התקנת Node.js 20:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

בדיקה:
```bash
node --version
npm --version
```

### 2.3 התקנת PostgreSQL:
```bash
sudo apt install postgresql postgresql-contrib -y
```

### 2.4 התקנת PM2:
```bash
sudo npm install -g pm2
```

### 2.5 התקנת Git (אם לא מותקן):
```bash
sudo apt install git -y
```

---

## 📥 שלב 3: הורדת הקוד

### 3.1 מעבר לתיקיית אפליקציות:
```bash
cd /home/master/applications
```

### 3.2 שכפול הפרויקט:
```bash
git clone https://github.com/moranmilshtein-maker/project-manager.git
cd project-manager
```

### 3.3 התקנת תלויות:
```bash
npm install --production
```

---

## 💾 שלב 4: הגדרת בסיס הנתונים

### 4.1 כניסה ל-PostgreSQL:
```bash
sudo -u postgres psql
```

### 4.2 יצירת DB ומשתמש (העתק שורה אחר שורה):
```sql
CREATE DATABASE project_manager;
CREATE USER project_user WITH ENCRYPTED PASSWORD 'P@ssw0rd123!Secure';
GRANT ALL PRIVILEGES ON DATABASE project_manager TO project_user;
\q
```

---

## ⚙️ שלב 5: הגדרת קובץ סביבה

### 5.1 יצירת קובץ .env:
```bash
cp .env.example .env
nano .env
```

### 5.2 ערוך את הערכים (השתמש בחיצים לנווט):
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=project_manager
DB_USER=project_user
DB_PASSWORD=P@ssw0rd123!Secure

JWT_SECRET=YourSuperSecretKeyChangeThis123456789
PORT=3000
NODE_ENV=production

FRONTEND_URL=http://YOUR_SERVER_IP
```

**לשמור:** `Ctrl+X` → `Y` → `Enter`

---

## 🗄️ שלב 6: אתחול בסיס הנתונים

```bash
npm run init-db
```

אם הכל עבד תראה:
```
✅ Database schema created successfully
✅ Database initialization complete!
```

---

## 🚀 שלב 7: הפעלת האפליקציה

### 7.1 הפעלה עם PM2:
```bash
pm2 start server.js --name project-manager
pm2 save
pm2 startup
```

### 7.2 העתק את הפקודה שמוצגת והרץ אותה (משהו כמו):
```bash
sudo env PATH=$PATH:/usr/bin...
```

---

## 🌐 שלב 8: הגדרת Nginx ב-Cloudways

### 8.1 חזור ל-Cloudways Dashboard

### 8.2 לך ל: **Application Settings** → **Application URL**

### 8.3 הוסף Application URL או השתמש בזה שיש

### 8.4 ערוך את Nginx Configuration:

לך ל: **Server Management** → **Settings & Packages** → **Nginx Config**

הוסף בתוך ה-`server` block:

```nginx
location /api {
    proxy_pass http://localhost:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
}

location / {
    root /home/master/applications/project-manager/frontend;
    try_files $uri $uri/ /index.html;
}
```

### 8.5 Restart Nginx:
```bash
sudo service nginx restart
```

---

## ✅ שלב 9: בדיקה

### 9.1 בדוק שהשרת רץ:
```bash
pm2 status
```

### 9.2 בדוק health:
```bash
curl http://localhost:3000/health
```

אמור להחזיר:
```json
{"status":"OK","timestamp":"..."}
```

### 9.3 פתח בדפדפן:
```
http://YOUR_SERVER_IP
```

או:
```
http://YOUR_DOMAIN.com
```

---

## 🎉 סיימת!

המערכת רצה וזמינה!

### פקודות שימושיות:

```bash
# צפייה בלוגים
pm2 logs project-manager

# הפעלה מחדש
pm2 restart project-manager

# עצירה
pm2 stop project-manager

# סטטוס
pm2 status

# עדכון קוד
cd /home/master/applications/project-manager
git pull
npm install --production
pm2 restart project-manager
```

---

## 🆘 פתרון בעיות

### השרת לא עולה:
```bash
pm2 logs project-manager
```

### שגיאת חיבור ל-DB:
```bash
sudo systemctl status postgresql
psql -U project_user -d project_manager -h localhost
```

### בעיות הרשאות:
```bash
sudo chown -R master:master /home/master/applications/project-manager
```

---

**צריך עזרה? שלח לי את השגיאה שאתה רואה!** 🚀
