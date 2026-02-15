# Quick Start Guide - התחלה מהירה 🚀

## התקנה מהירה (5 דקות)

### 1. שכפול הפרויקט
```bash
git clone https://github.com/YOUR_USERNAME/project-manager.git
cd project-manager
```

### 2. התקנת תלויות
```bash
npm install
```

### 3. הגדרת PostgreSQL
```bash
# התחברות ל-PostgreSQL
sudo -u postgres psql

# יצירת DB ומשתמש
CREATE DATABASE project_manager;
CREATE USER project_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE project_manager TO project_user;
\q
```

### 4. הגדרת קובץ סביבה
```bash
cp .env.example .env
nano .env
```

ערוך את הערכים:
```env
DB_HOST=localhost
DB_USER=project_user
DB_PASSWORD=your_password
JWT_SECRET=create-a-random-secret-key-here
```

### 5. אתחול DB
```bash
npm run init-db
```

### 6. הפעלה
```bash
npm run dev
```

✅ השרת רץ על: `http://localhost:3000`
✅ פתח את `frontend/index.html` בדפדפן

---

## פריסה לשרת - מדריך מהיר

### אופציה A: Docker (מומלץ)
```bash
# בנייה והפעלה
docker-compose up -d

# בדיקת סטטוס
docker-compose ps

# לוגים
docker-compose logs -f
```

### אופציה B: VPS ידני

1. **התקנת תלויות בשרת**
```bash
# Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# PM2
sudo npm install -g pm2

# Nginx
sudo apt install nginx -y
```

2. **העלאת קוד**
```bash
cd /var/www
git clone https://github.com/YOUR_USERNAME/project-manager.git
cd project-manager
npm install --production
```

3. **הגדרת .env**
```bash
cp .env.example .env
nano .env
# ערוך ערכים לפי הצורך
```

4. **אתחול DB**
```bash
npm run init-db
```

5. **הפעלה עם PM2**
```bash
pm2 start server.js --name project-manager
pm2 save
pm2 startup
```

6. **הגדרת Nginx**
```bash
sudo cp nginx/nginx.conf /etc/nginx/sites-available/project-manager
sudo ln -s /etc/nginx/sites-available/project-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

7. **SSL עם Let's Encrypt**
```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

---

## עדכון גרסה חדשה

### בפיתוח
```bash
git pull
npm install
npm run dev
```

### בייצור
```bash
# עם סקריפט אוטומטי
./scripts/deploy.sh

# או ידני
cd /var/www/project-manager
git pull
npm install --production
pm2 restart project-manager
```

---

## פתרון בעיות נפוצות

### השרת לא עולה
```bash
# בדוק לוגים
pm2 logs project-manager

# אפס והתחל מחדש
pm2 delete project-manager
pm2 start server.js --name project-manager
```

### שגיאת חיבור ל-DB
```bash
# בדוק שהשירות רץ
sudo systemctl status postgresql

# בדוק חיבור
psql -U project_user -d project_manager -h localhost
```

### בעיות הרשאות
```bash
# תן הרשאות לתיקייה
sudo chown -R $USER:$USER /var/www/project-manager

# הרשאות לסקריפטים
chmod +x scripts/*.sh
```

---

## פקודות שימושיות

```bash
# PM2
pm2 list                    # רשימת תהליכים
pm2 logs project-manager    # צפייה בלוגים
pm2 restart project-manager # הפעלה מחדש
pm2 stop project-manager    # עצירה
pm2 delete project-manager  # מחיקה

# Docker
docker-compose up -d        # הפעלה ברקע
docker-compose down         # כיבוי
docker-compose restart      # הפעלה מחדש
docker-compose logs -f      # לוגים

# Database
pg_dump -U project_user project_manager > backup.sql  # גיבוי
psql -U project_user project_manager < backup.sql     # שחזור

# Nginx
sudo nginx -t               # בדיקת תצורה
sudo systemctl restart nginx # הפעלה מחדש
sudo tail -f /var/log/nginx/error.log # לוגים
```

---

## עזרה נוספת

- 📖 README מלא: `README.md`
- 🐛 דיווח על באגים: פתח Issue ב-GitHub
- 💬 שאלות: צור Discussion ב-GitHub

**בהצלחה!** 🎉
