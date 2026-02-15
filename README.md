# Project Manager - מערכת ניהול משימות 📋

מערכת ניהול משימות מתקדמת דומה ל-Monday.com עם תמיכה מלאה בפרויקטים, הרשאות משתמשים, צבעים, ותרשימי גאנט.

## תכונות עיקריות ✨

- 🔐 **אימות ואבטחה** - מערכת התחברות והרשמה מאובטחת עם JWT
- 📁 **ניהול פרויקטים** - יצירה, עריכה ומחיקה של פרויקטים
- 👥 **ניהול הרשאות** - 4 רמות הרשאות: Owner, Admin, Member, Viewer
- ✅ **ניהול משימות** - משימות עם סטטוסים, עדיפויות וצבעים
- 🎨 **התאמה אישית** - צבעים מותאמים אישית לכל משימה ופרויקט
- 📊 **תרשים גאנט** - תצוגת ציר זמן עם תלויות בין משימות
- 💬 **תגובות** - מערכת תגובות למשימות
- 📝 **יומן פעילות** - מעקב אחר כל השינויים במערכת
- 🔗 **תלויות משימות** - הגדרת יחסי תלות בין משימות

## טכנולוגיות 🛠️

### Backend
- **Node.js** + **Express** - שרת API
- **PostgreSQL** - בסיס נתונים
- **JWT** - אימות משתמשים
- **bcryptjs** - הצפנת סיסמאות

### Frontend
- **HTML5** + **CSS3** + **Vanilla JavaScript**
- עיצוב responsive ומודרני
- תמיכה בשפה עברית (RTL)

## התקנה והפעלה 🚀

### דרישות מוקדמות
- Node.js 18 ומעלה
- PostgreSQL 14 ומעלה

### שלב 1: התקנת בסיס הנתונים

```bash
# התחברות ל-PostgreSQL
psql -U postgres

# יצירת בסיס נתונים
CREATE DATABASE project_manager;

# יציאה מ-psql
\q
```

### שלב 2: הגדרת הפרויקט

```bash
# שכפול או הורדת הפרויקט
cd project-manager

# התקנת תלויות
npm install

# העתקת קובץ הגדרות
cp .env.example .env
```

### שלב 3: עריכת קובץ .env

ערוך את קובץ `.env` והגדר את הערכים שלך:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=project_manager
DB_USER=your_username
DB_PASSWORD=your_password

JWT_SECRET=your-super-secret-key-change-this
PORT=3000
NODE_ENV=development

FRONTEND_URL=http://localhost:5173
```

### שלב 4: אתחול בסיס הנתונים

```bash
npm run init-db
```

### שלב 5: הפעלת השרת

```bash
# מצב פיתוח (עם hot reload)
npm run dev

# או מצב ייצור
npm start
```

השרת יעלה על: `http://localhost:3000`

### שלב 6: פתיחת הממשק

פתח את הקובץ `frontend/index.html` בדפדפן, או השתמש בשרת סטטי:

```bash
# התקנת שרת סטטי (אופציונלי)
npm install -g http-server

# הפעלה מתיקיית frontend
cd frontend
http-server -p 5173
```

גש ל: `http://localhost:5173`

## API Endpoints 📡

### Authentication
- `POST /api/auth/register` - הרשמת משתמש חדש
- `POST /api/auth/login` - התחברות
- `GET /api/auth/me` - קבלת פרטי המשתמש המחובר

### Projects
- `POST /api/projects` - יצירת פרויקט
- `GET /api/projects` - קבלת כל הפרויקטים
- `GET /api/projects/:projectId` - קבלת פרויקט ספציפי
- `PUT /api/projects/:projectId` - עדכון פרויקט
- `DELETE /api/projects/:projectId` - מחיקת פרויקט
- `POST /api/projects/:projectId/members` - הוספת חבר צוות
- `DELETE /api/projects/:projectId/members/:userId` - הסרת חבר צוות

### Tasks
- `POST /api/projects/:projectId/tasks` - יצירת משימה
- `GET /api/projects/:projectId/tasks` - קבלת כל המשימות
- `GET /api/projects/:projectId/tasks/:taskId` - קבלת משימה ספציפית
- `PUT /api/projects/:projectId/tasks/:taskId` - עדכון משימה
- `DELETE /api/projects/:projectId/tasks/:taskId` - מחיקת משימה
- `POST /api/projects/:projectId/tasks/:taskId/comments` - הוספת תגובה
- `POST /api/projects/:projectId/tasks/:taskId/dependencies` - הוספת תלות
- `GET /api/projects/:projectId/gantt` - קבלת נתוני גאנט

## מבנה התיקיות 📂

```
project-manager/
├── database/
│   ├── db.js              # חיבור לבסיס הנתונים
│   └── schema.sql         # סכמת בסיס הנתונים
├── middleware/
│   └── auth.js            # middleware לאימות והרשאות
├── routes/
│   ├── auth.js            # נתיבי אימות
│   ├── projects.js        # נתיבי פרויקטים
│   └── tasks.js           # נתיבי משימות
├── scripts/
│   └── init-db.js         # סקריפט אתחול DB
├── frontend/
│   └── index.html         # ממשק המשתמש
├── server.js              # שרת ראשי
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## הכנה להעלאה ל-GitHub 🐙

### שלב 1: אתחול Git

```bash
cd project-manager
git init
git add .
git commit -m "Initial commit: Project Manager system"
```

### שלב 2: יצירת repository ב-GitHub

1. גש ל-https://github.com/new
2. צור repository חדש בשם `project-manager`
3. **אל תאתחל** עם README, .gitignore או LICENSE

### שלב 3: חיבור והעלאה

```bash
git remote add origin https://github.com/YOUR_USERNAME/project-manager.git
git branch -M main
git push -u origin main
```

### שלב 4: הגנה על מידע רגיש

ודא שקובץ `.gitignore` כולל:
```
node_modules/
.env
*.log
```

**חשוב:** אף פעם אל תעלה את קובץ `.env` ל-Git!

## פריסה לשרת (Deployment) 🌐

### אופציה 1: VPS (DigitalOcean, AWS EC2, Linode)

#### 1. הכנת השרת

```bash
# חיבור לשרת
ssh root@your-server-ip

# עדכון מערכת
sudo apt update && sudo apt upgrade -y

# התקנת Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# התקנת PostgreSQL
sudo apt install postgresql postgresql-contrib -y

# התקנת nginx
sudo apt install nginx -y

# התקנת PM2 (מנהל תהליכים)
sudo npm install -g pm2
```

#### 2. הגדרת PostgreSQL

```bash
# החלפת משתמש ל-postgres
sudo -u postgres psql

# בתוך psql:
CREATE DATABASE project_manager;
CREATE USER project_user WITH ENCRYPTED PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE project_manager TO project_user;
\q
```

#### 3. העלאת הקוד

```bash
# יצירת תיקייה
mkdir -p /var/www/project-manager
cd /var/www/project-manager

# שכפול מ-GitHub
git clone https://github.com/YOUR_USERNAME/project-manager.git .

# התקנת תלויות
npm install --production

# יצירת קובץ .env
nano .env
```

הדבק את ההגדרות:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=project_manager
DB_USER=project_user
DB_PASSWORD=secure_password

JWT_SECRET=your-production-jwt-secret-very-long-and-random
PORT=3000
NODE_ENV=production

FRONTEND_URL=https://yourdomain.com
```

#### 4. אתחול בסיס הנתונים

```bash
npm run init-db
```

#### 5. הפעלת האפליקציה עם PM2

```bash
pm2 start server.js --name project-manager
pm2 save
pm2 startup
```

#### 6. הגדרת Nginx כ-Reverse Proxy

```bash
sudo nano /etc/nginx/sites-available/project-manager
```

הוסף:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Frontend
    location / {
        root /var/www/project-manager/frontend;
        try_files $uri $uri/ /index.html;
    }

    # API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

הפעלת ההגדרה:
```bash
sudo ln -s /etc/nginx/sites-available/project-manager /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 7. הגדרת SSL עם Let's Encrypt

```bash
# התקנת Certbot
sudo apt install certbot python3-certbot-nginx -y

# קבלת תעודה
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# חידוש אוטומטי
sudo certbot renew --dry-run
```

#### 8. הגדרת Firewall

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

### אופציה 2: Heroku (קל ומהיר)

#### 1. הכנת הפרויקט

הוסף קובץ `Procfile` בשורש הפרויקט:
```
web: node server.js
```

עדכן `package.json`:
```json
{
  "engines": {
    "node": "18.x"
  }
}
```

#### 2. פריסה

```bash
# התקנת Heroku CLI
# https://devcenter.heroku.com/articles/heroku-cli

# התחברות
heroku login

# יצירת אפליקציה
heroku create your-app-name

# הוספת PostgreSQL
heroku addons:create heroku-postgresql:mini

# הגדרת משתני סביבה
heroku config:set JWT_SECRET=your-secret-key
heroku config:set NODE_ENV=production

# העלאה
git push heroku main

# הרצת migration
heroku run npm run init-db

# פתיחת האפליקציה
heroku open
```

### אופציה 3: Docker

יצירת `Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

יצירת `docker-compose.yml`:
```yaml
version: '3.8'

services:
  db:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: project_manager
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DB_HOST=db
      - DB_PORT=5432
      - DB_NAME=project_manager
      - DB_USER=postgres
      - DB_PASSWORD=postgres
      - JWT_SECRET=your-secret-key
      - NODE_ENV=production
    depends_on:
      - db
    volumes:
      - ./frontend:/app/frontend

volumes:
  postgres_data:
```

הפעלה:
```bash
docker-compose up -d
```

## עדכונים (Updates) 🔄

### עדכון קוד בשרת

```bash
cd /var/www/project-manager
git pull origin main
npm install
pm2 restart project-manager
```

### עדכון אוטומטי עם GitHub Webhooks

1. צור endpoint ב-server:
```javascript
// הוסף ב-server.js
app.post('/api/webhook/deploy', (req, res) => {
  const secret = req.headers['x-hub-signature-256'];
  // Verify signature
  
  exec('cd /var/www/project-manager && git pull && npm install && pm2 restart project-manager', 
    (error, stdout, stderr) => {
      if (error) {
        console.error(`Error: ${error}`);
        return res.status(500).send('Deployment failed');
      }
      res.send('Deployed successfully');
    });
});
```

2. הגדר Webhook ב-GitHub:
   - Settings → Webhooks → Add webhook
   - URL: `https://yourdomain.com/api/webhook/deploy`
   - Content type: `application/json`
   - Events: `push`

## אבטחה 🔒

### המלצות אבטחה:

1. **סיסמאות חזקות** - השתמש ב-JWT secret חזק ואקראי
2. **HTTPS** - תמיד השתמש ב-SSL בייצור
3. **Rate Limiting** - הגבל כמות בקשות ל-API
4. **SQL Injection** - השתמש תמיד ב-parameterized queries (כבר מיושם)
5. **CORS** - הגדר רק את הדומיינים המורשים
6. **עדכונים** - עדכן תלויות באופן קבוע: `npm audit fix`

### הוספת Rate Limiting

```bash
npm install express-rate-limit
```

```javascript
// ב-server.js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## תמיכה ותיעוד 📚

### בדיקת בריאות המערכת
```bash
curl http://localhost:3000/health
```

### לוגים
```bash
# PM2 logs
pm2 logs project-manager

# Nginx logs
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### Backup של בסיס הנתונים
```bash
# יצירת backup
pg_dump -U project_user project_manager > backup_$(date +%Y%m%d).sql

# שחזור backup
psql -U project_user project_manager < backup_20240215.sql
```

## רישיון 📄

MIT License - אתה חופשי להשתמש, לשנות ולהפיץ את הקוד.

## צור קשר 💬

לשאלות ותמיכה, פתח issue ב-GitHub repository.

---

**בהצלחה! 🚀**
