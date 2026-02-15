# 📋 מערכת ניהול משימות - Project Manager

מערכת ניהול משימות מתקדמת בסגנון Monday.com עם תמיכה מלאה בעברית.

## 🎯 תכונות

- ✅ ניהול פרויקטים מלא
- 👥 4 רמות הרשאות (Owner, Admin, Member, Viewer)
- 🎨 צבעים מותאמים אישית לכל משימה ופרויקט
- 📊 תרשים גאנט עם תלויות משימות
- 💬 מערכת תגובות
- 🔐 אימות מאובטח עם JWT
- 📱 ממשק רספונסיבי בעברית

## 🛠️ טכנולוגיות

- **Backend:** Node.js + Express + PostgreSQL
- **Frontend:** HTML5 + CSS3 + JavaScript
- **אבטחה:** JWT + bcrypt
- **Deploy:** PM2 + Nginx

## 📦 התקנה

### דרישות מוקדמות
- Node.js 18+
- PostgreSQL 14+

### צעדי התקנה

1. **שכפול הפרויקט:**
```bash
git clone https://github.com/moranmilshtein-maker/project-manager.git
cd project-manager
```

2. **התקנת תלויות:**
```bash
npm install
```

3. **הגדרת משתני סביבה:**
```bash
cp .env.example .env
nano .env
```

ערוך את הערכים:
```env
DB_HOST=localhost
DB_USER=project_user
DB_PASSWORD=your_password
JWT_SECRET=your-secret-key
```

4. **אתחול בסיס הנתונים:**
```bash
npm run init-db
```

5. **הפעלה:**
```bash
npm start
```

האתר יהיה זמין ב: `http://localhost:3000`

## 🚀 פריסה לשרת

ראה את [QUICK_START.md](QUICK_START.md) להוראות פריסה מלאות.

## 📚 תיעוד API

ראה [API_DOCUMENTATION.md](API_DOCUMENTATION.md) לתיעוד מלא של ה-API.

## 📄 רישיון

MIT License

---

**נבנה עם ❤️ בישראל**
