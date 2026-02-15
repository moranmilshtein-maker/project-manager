# API Documentation - תיעוד API 📚

## Base URL
```
Production: https://yourdomain.com/api
Development: http://localhost:3000/api
```

## Authentication
כל הבקשות למעט `/auth/register` ו-`/auth/login` דורשות JWT token בheader:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

## 🔐 Authentication Endpoints

### Register New User
יצירת משתמש חדש במערכת.

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123",
  "full_name": "John Doe"
}
```

**Response:** `201 Created`
```json
{
  "message": "User created successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "full_name": "John Doe"
  }
}
```

**Errors:**
- `400` - Validation error
- `409` - User already exists

---

### Login
התחברות למערכת וקבלת token.

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:** `200 OK`
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "user@example.com",
    "full_name": "John Doe",
    "avatar_url": null
  }
}
```

**Errors:**
- `401` - Invalid credentials

---

### Get Current User
קבלת פרטי המשתמש המחובר.

**Endpoint:** `GET /api/auth/me`

**Headers:**
```
Authorization: Bearer YOUR_TOKEN
```

**Response:** `200 OK`
```json
{
  "user": {
    "id": 1,
    "email": "user@example.com",
    "full_name": "John Doe",
    "avatar_url": null,
    "created_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## 📁 Projects Endpoints

### Create Project
יצירת פרויקט חדש. היוצר הופך אוטומטית ל-owner.

**Endpoint:** `POST /api/projects`

**Request Body:**
```json
{
  "name": "My New Project",
  "description": "Project description here",
  "color": "#667eea"
}
```

**Response:** `201 Created`
```json
{
  "project": {
    "id": 1,
    "name": "My New Project",
    "description": "Project description here",
    "color": "#667eea",
    "owner_id": 1,
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Get All Projects
קבלת כל הפרויקטים שהמשתמש חבר בהם.

**Endpoint:** `GET /api/projects`

**Response:** `200 OK`
```json
{
  "projects": [
    {
      "id": 1,
      "name": "My Project",
      "description": "Description",
      "color": "#667eea",
      "owner_id": 1,
      "role": "owner",
      "owner_name": "John Doe",
      "task_count": "12",
      "member_count": "5",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### Get Single Project
קבלת פרטי פרויקט מסוים כולל חברים וסטטוסים.

**Endpoint:** `GET /api/projects/:projectId`

**Permissions:** viewer ומעלה

**Response:** `200 OK`
```json
{
  "project": {
    "id": 1,
    "name": "My Project",
    "description": "Description",
    "color": "#667eea",
    "owner_id": 1,
    "owner_name": "John Doe",
    "owner_email": "john@example.com",
    "members": [
      {
        "role": "owner",
        "id": 1,
        "email": "john@example.com",
        "full_name": "John Doe",
        "avatar_url": null
      }
    ],
    "statuses": [
      {
        "id": 1,
        "project_id": 1,
        "name": "To Do",
        "color": "#E9ECEF",
        "position": 0
      }
    ]
  }
}
```

---

### Update Project
עדכון פרטי הפרויקט.

**Endpoint:** `PUT /api/projects/:projectId`

**Permissions:** admin ומעלה

**Request Body:**
```json
{
  "name": "Updated Project Name",
  "description": "New description",
  "color": "#51cf66"
}
```

**Response:** `200 OK`

---

### Delete Project
מחיקת פרויקט. פעולה בלתי הפיכה!

**Endpoint:** `DELETE /api/projects/:projectId`

**Permissions:** owner בלבד

**Response:** `200 OK`
```json
{
  "message": "Project deleted successfully"
}
```

---

### Add Member to Project
הוספת חבר צוות לפרויקט.

**Endpoint:** `POST /api/projects/:projectId/members`

**Permissions:** admin ומעלה

**Request Body:**
```json
{
  "email": "member@example.com",
  "role": "member"
}
```

**Roles:**
- `viewer` - צפייה בלבד
- `member` - צפייה ועריכת משימות
- `admin` - ניהול מלא מעט מחיקת פרויקט
- `owner` - שליטה מלאה

**Response:** `201 Created`
```json
{
  "message": "Member added successfully"
}
```

---

### Remove Member from Project
הסרת חבר צוות מהפרויקט.

**Endpoint:** `DELETE /api/projects/:projectId/members/:userId`

**Permissions:** admin ומעלה

**Note:** לא ניתן להסיר את ה-owner.

**Response:** `200 OK`

---

## ✅ Tasks Endpoints

### Create Task
יצירת משימה חדשה בפרויקט.

**Endpoint:** `POST /api/projects/:projectId/tasks`

**Permissions:** member ומעלה

**Request Body:**
```json
{
  "title": "Task title",
  "description": "Detailed description",
  "status_id": 1,
  "priority": "high",
  "color": "#ff6b6b",
  "start_date": "2024-01-15",
  "due_date": "2024-01-30",
  "assigned_to": 2,
  "estimated_hours": 8.5
}
```

**Priority Options:**
- `low`
- `medium`
- `high`
- `urgent`

**Response:** `201 Created`
```json
{
  "task": {
    "id": 1,
    "project_id": 1,
    "title": "Task title",
    "description": "Detailed description",
    "status_id": 1,
    "priority": "high",
    "color": "#ff6b6b",
    "start_date": "2024-01-15",
    "due_date": "2024-01-30",
    "assigned_to": 2,
    "created_by": 1,
    "position": 0,
    "estimated_hours": 8.5,
    "actual_hours": null,
    "created_at": "2024-01-15T10:30:00.000Z",
    "updated_at": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Get All Tasks
קבלת כל המשימות של פרויקט עם אפשרות לסינון.

**Endpoint:** `GET /api/projects/:projectId/tasks`

**Query Parameters:**
- `status_id` - סינון לפי סטטוס
- `assigned_to` - סינון לפי משתמש מוקצה
- `priority` - סינון לפי עדיפות

**Example:**
```
GET /api/projects/1/tasks?status_id=2&priority=high
```

**Response:** `200 OK`
```json
{
  "tasks": [
    {
      "id": 1,
      "project_id": 1,
      "title": "Task title",
      "description": "Description",
      "status_id": 1,
      "priority": "high",
      "color": "#ff6b6b",
      "start_date": "2024-01-15",
      "due_date": "2024-01-30",
      "assigned_to": 2,
      "assigned_to_name": "Jane Smith",
      "created_by": 1,
      "created_by_name": "John Doe",
      "status_name": "In Progress",
      "status_color": "#4DABF7",
      "position": 0,
      "estimated_hours": 8.5,
      "actual_hours": 5.0,
      "dependencies": [
        {
          "id": 2,
          "type": "finish-to-start"
        }
      ],
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ]
}
```

---

### Get Single Task
קבלת פרטי משימה מסוימת כולל תגובות ותלויות.

**Endpoint:** `GET /api/projects/:projectId/tasks/:taskId`

**Response:** `200 OK`
```json
{
  "task": {
    "id": 1,
    "title": "Task title",
    "dependencies": [
      {
        "id": 1,
        "task_id": 1,
        "depends_on_task_id": 2,
        "dependency_type": "finish-to-start",
        "task_title": "Previous Task",
        "created_at": "2024-01-15T10:30:00.000Z"
      }
    ],
    "comments": [
      {
        "id": 1,
        "task_id": 1,
        "user_id": 1,
        "user_name": "John Doe",
        "avatar_url": null,
        "comment": "This is a comment",
        "created_at": "2024-01-15T11:00:00.000Z",
        "updated_at": "2024-01-15T11:00:00.000Z"
      }
    ]
  }
}
```

---

### Update Task
עדכון פרטי משימה.

**Endpoint:** `PUT /api/projects/:projectId/tasks/:taskId`

**Permissions:** member ומעלה

**Request Body:** (כל השדות אופציונליים)
```json
{
  "title": "Updated title",
  "description": "Updated description",
  "status_id": 2,
  "priority": "urgent",
  "color": "#51cf66",
  "start_date": "2024-01-16",
  "due_date": "2024-02-01",
  "assigned_to": 3,
  "estimated_hours": 10,
  "actual_hours": 6.5,
  "position": 1
}
```

**Response:** `200 OK`

---

### Delete Task
מחיקת משימה.

**Endpoint:** `DELETE /api/projects/:projectId/tasks/:taskId`

**Permissions:** member ומעלה

**Response:** `200 OK`

---

### Add Task Dependency
הוספת תלות בין משימות (לתרשים גאנט).

**Endpoint:** `POST /api/projects/:projectId/tasks/:taskId/dependencies`

**Request Body:**
```json
{
  "depends_on_task_id": 5,
  "dependency_type": "finish-to-start"
}
```

**Dependency Types:**
- `finish-to-start` - המשימה מתחילה כש-depends_on נגמרת
- `start-to-start` - שתיהן מתחילות ביחד
- `finish-to-finish` - שתיהן נגמרות ביחד
- `start-to-finish` - המשימה נגמרת כש-depends_on מתחילה

**Response:** `201 Created`

---

### Add Comment to Task
הוספת תגובה למשימה.

**Endpoint:** `POST /api/projects/:projectId/tasks/:taskId/comments`

**Request Body:**
```json
{
  "comment": "This is my comment text"
}
```

**Response:** `201 Created`

---

### Get Gantt Chart Data
קבלת נתונים לתרשים גאנט.

**Endpoint:** `GET /api/projects/:projectId/gantt`

**Response:** `200 OK`
```json
{
  "gantt_data": [
    {
      "id": 1,
      "title": "Task 1",
      "start_date": "2024-01-15",
      "due_date": "2024-01-30",
      "color": "#667eea",
      "priority": "high",
      "assigned_to_name": "John Doe",
      "status_name": "In Progress",
      "dependencies": [2, 3]
    }
  ]
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation failed",
  "errors": [
    {
      "field": "email",
      "message": "Invalid email format"
    }
  ]
}
```

### 401 Unauthorized
```json
{
  "error": "Access token required"
}
```

### 403 Forbidden
```json
{
  "error": "Requires admin role or higher"
}
```

### 404 Not Found
```json
{
  "error": "Project not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limiting
- 100 requests per 15 minutes per IP
- Header: `X-RateLimit-Remaining`

## Pagination
כרגע לא מיושמת pagination. בעתיד יתווסף תמיכה ב:
```
?page=1&limit=50
```

---

**צור קשר:** פתח Issue ב-GitHub לשאלות או הצעות! 💬
