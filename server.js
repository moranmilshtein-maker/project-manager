const express = require('express');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const querystring = require('querystring');
require('dotenv').config();
const cors = require('cors');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const dataStore = require('./data-store');
const workspaceStore = require('./workspace-store');
const snapshotStore = require('./snapshot-store');
let emailService;
try {
  emailService = require('./email-service');
} catch (e) {
  console.warn('[Email] Failed to load email-service module:', e.message);
  emailService = { sendInviteEmail: async () => ({ success: false, error: 'Module not loaded' }), sendNotificationEmail: async () => ({ success: false, error: 'Module not loaded' }), sendBulkNotification: async () => [] };
}
let telegramBot;
try {
  telegramBot = require('./telegram-bot');
  telegramBot.setDataStore(dataStore);
} catch (e) {
  console.warn('[Telegram] Failed to load telegram-bot module:', e.message);
  telegramBot = { initScheduler: () => {}, updateBoardData: () => {}, triggerCheck: async () => {}, sendTelegramMessage: async () => {}, setDataStore: () => {}, getSyncStatus: () => ({ lastSyncTime: null, hasBoardData: false }) };
}

const app = express();
const PORT = process.env.PORT || 3000;

// ===== SECURITY: Helmet — HTTP security headers =====
app.use(helmet({
  contentSecurityPolicy: false,  // disabled for SPA inline scripts
  crossOriginEmbedderPolicy: false
}));

// ===== SECURITY: CORS — restrict to specific origin =====
const ALLOWED_ORIGIN = process.env.FRONTEND_URL;
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (server-to-server, mobile apps, curl)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGIN && origin === ALLOWED_ORIGIN) {
      return callback(null, true);
    }
    // In development, allow localhost
    if (!ALLOWED_ORIGIN || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(new Error('CORS: Origin not allowed'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== SECURITY: HTTPS enforcement in production =====
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Prevent caching of HTML/JS/CSS files
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html') || req.path === '/') {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.set('Surrogate-Control', 'no-store');
  }
  next();
});

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// ===== SECURITY: Rate Limiting =====
// Auth endpoints: 5 requests per minute per IP
const authLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 5,               // 5 attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 1 minute.' },
  keyGenerator: (req) => {
    // Use IP + email combo to prevent per-account brute force
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;
    const email = (req.body?.email || '').toLowerCase().trim();
    return `${ip}:${email}`;
  }
});

// General API rate limiter: 100 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});

// Apply general rate limit to all API routes
app.use('/api/', apiLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// ===== Server-Side User Store =====
// All user data lives here - frontend never sees passwords

// ===== SECURITY: bcrypt password hashing with salt =====
const BCRYPT_ROUNDS = 12;

function hashPasswordSync(password) {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

async function hashPasswordAsync(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  // Support legacy SHA-256 hashes during migration
  if (hash && hash.length === 64 && !hash.startsWith('$2')) {
    return crypto.createHash('sha256').update(password).digest('hex') === hash;
  }
  return bcrypt.compareSync(password, hash);
}

async function verifyPasswordAsync(password, hash) {
  // Support legacy SHA-256 hashes during migration
  if (hash && hash.length === 64 && !hash.startsWith('$2')) {
    return crypto.createHash('sha256').update(password).digest('hex') === hash;
  }
  return bcrypt.compare(password, hash);
}

const SUPER_ADMIN_EMAIL = 'moran.milshtein@gmail.com';

// In-memory user store (will persist as long as server runs)
// Key format: "email:provider" to keep each login method as a separate identity
const users = new Map();

// Helper: build user store key
function userKey(email, provider) {
  return `${email}:${provider || 'local'}`;
}

// Helper: find user by email only (for lookups that need to search across providers)
function findUserByEmail(email) {
  for (const [key, user] of users) {
    if (user.email === email) return user;
  }
  return null;
}

// Helper: find user store key by user ID
function findUserKeyById(userId) {
  for (const [key, user] of users) {
    if (user.id === userId) return key;
  }
  return null;
}

// Helper: find user by email and specific provider
function findUserByEmailAndProvider(email, provider) {
  return users.get(userKey(email, provider)) || null;
}

// Helper: get client IP from request
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
}

// Seed Super Admin - ONLY local provider gets super_admin
// Uses bcrypt with salt (not plain SHA-256)
users.set(userKey(SUPER_ADMIN_EMAIL, 'local'), {
  id: crypto.randomUUID(),
  fullName: 'מורן מילשטיין',
  email: SUPER_ADMIN_EMAIL,
  passwordHash: hashPasswordSync('t1Xvzd*%WuPbqHHl'),
  role: 'super_admin',
  provider: 'local',
  picture: '',
  workspace: 'Main workspace',
  createdAt: new Date().toISOString(),
  lastLoginAt: null,
  lastLoginIP: null
});

// Generate session token
function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// User persistence - save/load users from data store
const USER_DATA_KEY = '__system__users';
const USER_SAVE_DEBOUNCE = 5000;
let userSaveTimer = null;

function scheduleSaveUsers() {
  if (userSaveTimer) return;
  userSaveTimer = setTimeout(async () => {
    userSaveTimer = null;
    await persistUsers();
  }, USER_SAVE_DEBOUNCE);
}

async function persistUsers() {
  try {
    const userData = Object.fromEntries(users);
    await dataStore.writeUserData(USER_DATA_KEY, 'users', userData);
  } catch (e) {
    console.error('[Users] Failed to persist:', e.message);
  }
}

async function loadUsers() {
  try {
    const data = await dataStore.readUserData(USER_DATA_KEY, 'users');
    if (data && typeof data === 'object') {
      let count = 0;
      for (const [key, userData] of Object.entries(data)) {
        if (!users.has(key)) {
          users.set(key, userData);
          count++;
        } else {
          // Seeded user exists — merge ALL persisted data on top of seed.
          // DB data always wins EXCEPT for role and passwordHash (security).
          const existing = users.get(key);
          const protectedFields = ['role', 'passwordHash'];
          for (const [field, value] of Object.entries(userData)) {
            if (protectedFields.includes(field)) continue; // Keep seed security fields
            if (value !== null && value !== undefined) {
              existing[field] = value;
            }
          }
        }
      }
      console.log(`[Users] Restored ${count} users from persistent storage`);
    }
  } catch (e) {
    console.error('[Users] Failed to load:', e.message);
  }
}

// Session store: token -> userKey (email:provider)
const sessions = new Map();

// Session persistence - save/load sessions from data store
const SESSION_DATA_KEY = '__system__sessions';
const SESSION_SAVE_DEBOUNCE = 5000; // Save at most every 5 seconds
let sessionSaveTimer = null;

function scheduleSaveSessiones() {
  if (sessionSaveTimer) return; // Already scheduled
  sessionSaveTimer = setTimeout(async () => {
    sessionSaveTimer = null;
    await persistSessions();
  }, SESSION_SAVE_DEBOUNCE);
}

async function persistSessions() {
  try {
    const sessionData = Object.fromEntries(sessions);
    await dataStore.writeUserData(SESSION_DATA_KEY, 'sessions', sessionData);
  } catch (e) {
    console.error('[Sessions] Failed to persist:', e.message);
  }
}

async function loadSessions() {
  try {
    const data = await dataStore.readUserData(SESSION_DATA_KEY, 'sessions');
    if (data && typeof data === 'object') {
      let count = 0;
      for (const [token, userKey] of Object.entries(data)) {
        // Only restore session if user exists
        if (users.has(userKey)) {
          sessions.set(token, userKey);
          count++;
        }
      }
      console.log(`[Sessions] Restored ${count} sessions from persistent storage`);
    }
  } catch (e) {
    console.error('[Sessions] Failed to load:', e.message);
  }
}

// Helper: get safe user object (no password)
function safeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    provider: user.provider || 'local',
    picture: user.picture || '',
    workspace: user.workspace,
    activeWorkspaceId: user.activeWorkspaceId || null,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt || null,
    lastLoginIP: user.lastLoginIP || null,
    lastLoginMethod: user.lastLoginMethod || null,
    loginHistory: user.loginHistory || []
  };
}

// Helper: record login metadata with method tracking
function recordLogin(user, req, method) {
  const loginEntry = {
    at: new Date().toISOString(),
    ip: getClientIP(req),
    method: method || user.provider || 'local'
  };
  if (!user.loginHistory) user.loginHistory = [];
  user.loginHistory.push(loginEntry);
  if (user.loginHistory.length > 50) user.loginHistory = user.loginHistory.slice(-50);
  user.lastLoginAt = loginEntry.at;
  user.lastLoginIP = loginEntry.ip;
  user.lastLoginMethod = loginEntry.method;
}

// Middleware: require Super Admin
function requireSuperAdmin(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });
  const user = users.get(key);
  if (!user || user.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super Admin access required' });
  }
  req.callerKey = key;
  req.callerEmail = user.email;
  req.caller = user;
  next();
}

// ===== Auth API =====

// Register (email+password only, always 'local' provider)
// Rate limited: 5 attempts per minute
app.post('/api/auth/register', authLimiter, async (req, res) => {
  try {
    const { fullName, email: rawEmail, password } = req.body;
    const email = (rawEmail || '').toLowerCase().trim();

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    // Password validation - Sprint 1.2 strong password rules
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain an uppercase letter' });
    }
    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain a lowercase letter' });
    }
    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain a number' });
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return res.status(400).json({ error: 'Password must contain a special character' });
    }
    
    const key = userKey(email, 'local');
    if (users.has(key)) {
      return res.status(409).json({ error: 'Email already exists in the system' });
    }

    // All new registrations get 'member' role — super admin is pre-seeded only
    const role = 'member';

    const user = {
      id: crypto.randomUUID(),
      fullName: fullName.trim(),
      email,
      passwordHash: await hashPasswordAsync(password),
      role,
      provider: 'local',
      picture: '',
      workspace: 'Main workspace',
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      lastLoginIP: null
    };

    users.set(key, user);
    recordLogin(user, req, 'register');
    scheduleSaveUsers();

    // Create a default workspace for the new user
    const defaultWs = workspaceStore.createWorkspace(
      user.id, user.fullName, user.email, 'My Workspace'
    );
    user.activeWorkspaceId = defaultWs.id;

    // Initialize shared board data with default groups
    const defBoardId = 'board_' + Date.now();
    const defBoardData = {
      boards: [{ id: defBoardId, name: 'Main Table', archived: false }],
      activeBoard: defBoardId,
      boardGroups: {
        [defBoardId]: [
          { id: 'g_' + Date.now() + '_1', name: 'To-Do', color: '#6161ff', collapsed: false, tasks: [] },
          { id: 'g_' + Date.now() + '_2', name: 'In Progress', color: '#ff7575', collapsed: false, tasks: [] },
          { id: 'g_' + Date.now() + '_3', name: 'Completed', color: '#00c875', collapsed: false, tasks: [] }
        ]
      },
      groups: []
    };
    await dataStore.writeUserData(`workspace_shared_${defaultWs.id}`, 'boards', defBoardData);

    await workspaceStore.persistWorkspaces();

    const token = generateToken();
    sessions.set(token, key);
    scheduleSaveSessiones();

    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login (email+password only — looks up 'local' provider)
// Rate limited: 5 attempts per minute
app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body;
    const email = (rawEmail || '').toLowerCase().trim();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const key = userKey(email, 'local');
    const user = users.get(key);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordValid = await verifyPasswordAsync(password, user.passwordHash);
    if (!passwordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Auto-upgrade legacy SHA-256 hash to bcrypt on successful login
    if (user.passwordHash.length === 64 && !user.passwordHash.startsWith('$2')) {
      user.passwordHash = await hashPasswordAsync(password);
      console.log(`Upgraded password hash for ${email} from SHA-256 to bcrypt`);
    }

    recordLogin(user, req, 'email');
    scheduleSaveUsers();

    const token = generateToken();
    sessions.set(token, key);
    scheduleSaveSessiones();
    res.json({ success: true, token, user: safeUser(user) });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get current user by token
app.get('/api/auth/me', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);

  if (!key) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = users.get(key);
  if (!user) {
    sessions.delete(token);
    scheduleSaveSessiones();
    return res.status(401).json({ error: 'User not found' });
  }

  res.json({ user: safeUser(user) });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  sessions.delete(token);
  scheduleSaveSessiones();
  res.json({ success: true });
});

// OAuth user creation/login (called from frontend after OAuth redirect)
// Each provider creates a SEPARATE user identity (email:provider key)
// OAuth users are ALWAYS 'member' — NEVER super_admin
// Rate limited: 5 attempts per minute
app.post('/api/auth/oauth-login', authLimiter, (req, res) => {
  const { email: rawEmail, fullName, picture, provider } = req.body;
  const email = (rawEmail || '').toLowerCase().trim();
  const oauthProvider = provider || 'oauth';

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  const key = userKey(email, oauthProvider);
  let user = users.get(key);
  
  if (!user) {
    // Create new OAuth user — ALWAYS 'member', never super_admin, regardless of email
    user = {
      id: crypto.randomUUID(),
      fullName: (fullName || email.split('@')[0]).trim(),
      email,
      passwordHash: '', // OAuth users have no password
      role: 'member',
      provider: oauthProvider,
      picture: picture || '',
      workspace: 'Main workspace',
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
      lastLoginIP: null,
      loginHistory: []
    };
    users.set(key, user);
  } else {
    // Existing OAuth user: update picture if available
    if (picture) user.picture = picture;
    // Update fullName if user has no name yet (was created from invited)
    if (!user.fullName || user.fullName === email.split('@')[0]) {
      user.fullName = (fullName || user.fullName).trim();
    }
  }

  // Record login
  recordLogin(user, req, oauthProvider);
  scheduleSaveUsers();

  const token = generateToken();
  sessions.set(token, key);
  scheduleSaveSessiones();

  res.json({ success: true, token, user: safeUser(user) });
});

// ===== Admin Dashboard API =====

// Get all users with filtering, sorting, pagination (Super Admin only)
app.get('/api/admin/users', requireSuperAdmin, (req, res) => {
  let userList = [];
  users.forEach(u => {
    userList.push(safeUser(u));
  });

  // Filtering
  const { search, role, provider, sort, order, page, limit: rawLimit } = req.query;

  if (search) {
    const s = search.toLowerCase();
    userList = userList.filter(u =>
      (u.fullName || '').toLowerCase().includes(s) ||
      (u.email || '').toLowerCase().includes(s) ||
      (u.lastLoginIP || '').includes(s)
    );
  }
  if (role && role !== 'all') {
    userList = userList.filter(u => u.role === role);
  }
  if (provider && provider !== 'all') {
    userList = userList.filter(u => u.provider === provider);
  }

  // Sorting
  const sortField = sort || 'createdAt';
  const sortOrder = order === 'asc' ? 1 : -1;
  userList.sort((a, b) => {
    const va = a[sortField] || '';
    const vb = b[sortField] || '';
    if (va < vb) return -1 * sortOrder;
    if (va > vb) return 1 * sortOrder;
    return 0;
  });

  // Pagination
  const total = userList.length;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(rawLimit) || 10));
  const totalPages = Math.ceil(total / pageSize);
  const start = (pageNum - 1) * pageSize;
  const paged = userList.slice(start, start + pageSize);

  res.json({
    users: paged,
    pagination: { page: pageNum, limit: pageSize, total, totalPages }
  });
});

// Update user role (Super Admin only)
app.post('/api/admin/update-role', requireSuperAdmin, (req, res) => {
  const { email: targetEmail, role, provider: targetProvider } = req.body;
  const email = (targetEmail || '').toLowerCase().trim();

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required' });
  }

  const validRoles = ['admin', 'member', 'viewer'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Allowed: admin, member, viewer' });
  }

  // Find user by email+provider if provided, otherwise search by email
  let target = null;
  if (targetProvider) {
    target = users.get(userKey(email, targetProvider));
  }
  if (!target) {
    // Fallback: find any user with this email
    for (const [key, u] of users) {
      if (u.email === email && u.provider === (targetProvider || u.provider)) {
        target = u;
        break;
      }
    }
  }
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Super admin (local provider) can NEVER be changed
  if (target.email === SUPER_ADMIN_EMAIL && target.provider === 'local') {
    return res.status(403).json({ error: 'Cannot change Super Admin role' });
  }

  target.role = role;
  res.json({ success: true, user: safeUser(target) });
});

// Get all users (for invite count, etc) - only returns safe data
app.get('/api/auth/users', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const userList = [];
  users.forEach(u => userList.push(safeUser(u)));
  res.json({ users: userList });
});

// Invite user (creates a placeholder) — invited users are NEVER super_admin
app.post('/api/auth/invite', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const callerKey = sessions.get(token);
  if (!callerKey) return res.status(401).json({ error: 'Not authenticated' });

  const caller = users.get(callerKey);
  if (!caller || !['super_admin', 'admin'].includes(caller.role)) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const { emails, role, message, workspaceId, boardId } = req.body;
  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'Emails array is required' });
  }

  // Invited users can only be admin, member, or viewer — NEVER super_admin
  const safeRole = ['admin', 'member', 'viewer'].includes(role) ? role : 'member';

  const invited = [];
  const skipped = [];

  for (const rawEmail of emails) {
    const email = (rawEmail || '').toLowerCase().trim();
    if (!email) continue;
    
    // Check if this email already exists in ANY provider
    const existingUser = findUserByEmail(email);
    
    if (existingUser && workspaceId) {
      // User exists — add directly to workspace if not already a member
      const existingMembership = workspaceStore.getMembership(existingUser.id, workspaceId);
      if (!existingMembership) {
        workspaceStore.addMembership(existingUser.id, existingUser.fullName, existingUser.email, workspaceId, safeRole, boardId || null);
        invited.push(email);
      } else {
        skipped.push(email);
      }
    } else if (existingUser) {
      skipped.push(email);
    } else {
      // New user — create invited record
      const key = userKey(email, 'invited');
      const user = {
        id: crypto.randomUUID(),
        fullName: email.split('@')[0],
        email,
        passwordHash: '',
        role: safeRole,
        provider: 'invited',
        picture: '',
        workspace: 'Main workspace',
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
        lastLoginIP: null
      };
      users.set(key, user);
      invited.push(email);

      // Create workspace invite if workspace selected
      if (workspaceId) {
        const workspace = workspaceStore.getWorkspace(workspaceId);
        if (workspace) {
          const wsInvite = workspaceStore.createWorkspaceInvite(workspaceId, caller.id, caller.fullName, email, safeRole);
          // Also store in admin invites for tracking
          invites.set(wsInvite.token, {
            email,
            inviterEmail: caller.email,
            inviterName: caller.fullName,
            orgName: workspace.name,
            workspaceId,
            boardId: boardId || null,
            role: safeRole,
            createdAt: new Date().toISOString(),
            expiresAt: wsInvite.expiresAt,
            used: false
          });
          // Send invite email
          try {
            await emailService.sendInviteEmail(email, caller.fullName, workspace.name, wsInvite.token);
          } catch (e) {
            console.warn('[Invite] Email send failed:', e.message);
          }
        }
      }
    }
  }

  scheduleSaveUsers();
  if (workspaceId) {
    await workspaceStore.persistWorkspaces();
    await persistAdminInvites();
  }

  res.json({ success: true, invited, skipped, totalUsers: users.size });
});

// Update user role (generic endpoint)
app.post('/api/auth/update-role', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const callerKey = sessions.get(token);
  if (!callerKey) return res.status(401).json({ error: 'Not authenticated' });

  const caller = users.get(callerKey);
  if (!caller) return res.status(401).json({ error: 'Not authenticated' });

  const { email: targetEmail, role, provider: targetProvider } = req.body;
  const email = (targetEmail || '').toLowerCase().trim();
  
  // Find target user
  let target = null;
  if (targetProvider) {
    target = users.get(userKey(email, targetProvider));
  }
  if (!target) {
    for (const [key, u] of users) {
      if (u.email === email) { target = u; break; }
    }
  }
  if (!target) return res.status(404).json({ error: 'User not found' });

  // Super admin (local) can NEVER be changed
  if (target.email === SUPER_ADMIN_EMAIL && target.provider === 'local') {
    return res.status(403).json({ error: 'Cannot change Super Admin role' });
  }
  if (caller.role === 'super_admin' || (caller.role === 'admin' && target.role !== 'super_admin')) {
    target.role = role;
    return res.json({ success: true, user: safeUser(target) });
  }

  res.status(403).json({ error: 'Permission denied' });
});

// ===== Google OAuth 2.0 Routes =====

app.get('/auth/google', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.status(500).json({ error: 'Google OAuth not configured' });
  }

  const params = querystring.stringify({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'consent'
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('Google OAuth error:', error);
    return res.redirect('/?auth_error=' + encodeURIComponent(error));
  }

  if (!code) {
    return res.redirect('/?auth_error=no_code');
  }

  try {
    const tokenData = await exchangeGoogleCode(code);
    if (!tokenData || !tokenData.access_token) {
      return res.redirect('/?auth_error=token_exchange_failed');
    }

    const userInfo = await getGoogleUserInfo(tokenData.access_token);
    if (!userInfo || !userInfo.email) {
      return res.redirect('/?auth_error=user_info_failed');
    }

    const userData = encodeURIComponent(JSON.stringify({
      email: userInfo.email,
      fullName: userInfo.name || userInfo.email.split('@')[0],
      picture: userInfo.picture || '',
      provider: 'google'
    }));

    res.redirect(`/?google_user=${userData}`);
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect('/?auth_error=callback_failed');
  }
});

function exchangeGoogleCode(code) {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      code, client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code'
    });
    const options = {
      hostname: 'oauth2.googleapis.com', path: '/token', method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { const p = JSON.parse(data); p.error ? reject(new Error(p.error_description || p.error)) : resolve(p); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function getGoogleUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'www.googleapis.com', path: '/oauth2/v2/userinfo', method: 'GET', headers: { 'Authorization': `Bearer ${accessToken}` } };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ===== Facebook OAuth Routes =====

app.get('/auth/facebook', (req, res) => {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

  if (!appId || !redirectUri) {
    return res.status(500).json({ error: 'Facebook OAuth not configured' });
  }

  const params = querystring.stringify({
    client_id: appId, redirect_uri: redirectUri,
    scope: 'email,public_profile', response_type: 'code',
    state: Math.random().toString(36).substring(7)
  });

  res.redirect(`https://www.facebook.com/v25.0/dialog/oauth?${params}`);
});

app.get('/auth/facebook/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    console.error('Facebook OAuth error:', error, error_description);
    return res.redirect('/?auth_error=' + encodeURIComponent(error_description || error));
  }

  if (!code) return res.redirect('/?auth_error=no_code');

  try {
    const tokenData = await exchangeFacebookCode(code);
    if (!tokenData || !tokenData.access_token) return res.redirect('/?auth_error=fb_token_exchange_failed');

    const userInfo = await getFacebookUserInfo(tokenData.access_token);
    if (!userInfo || !userInfo.email) return res.redirect('/?auth_error=fb_user_info_failed');

    const userData = encodeURIComponent(JSON.stringify({
      email: userInfo.email,
      fullName: userInfo.name || userInfo.email.split('@')[0],
      picture: userInfo.picture && userInfo.picture.data ? userInfo.picture.data.url : '',
      provider: 'facebook'
    }));

    res.redirect(`/?facebook_user=${userData}`);
  } catch (err) {
    console.error('Facebook OAuth callback error:', err);
    res.redirect('/?auth_error=fb_callback_failed');
  }
});

function exchangeFacebookCode(code) {
  return new Promise((resolve, reject) => {
    const params = querystring.stringify({ client_id: process.env.FACEBOOK_APP_ID, client_secret: process.env.FACEBOOK_APP_SECRET, redirect_uri: process.env.FACEBOOK_REDIRECT_URI, code });
    const options = { hostname: 'graph.facebook.com', path: `/v25.0/oauth/access_token?${params}`, method: 'GET' };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { const p = JSON.parse(data); p.error ? reject(new Error(p.error.message)) : resolve(p); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

function getFacebookUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const params = querystring.stringify({ fields: 'id,name,email,picture.type(large)', access_token: accessToken });
    const options = { hostname: 'graph.facebook.com', path: `/v25.0/me?${params}`, method: 'GET' };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { const p = JSON.parse(data); p.error ? reject(new Error(p.error.message)) : resolve(p); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.end();
  });
}

// ===== Static & SPA =====

if (process.env.DATABASE_URL) {
  try {
    app.use('/api/auth-db', require('./routes/auth'));
    app.use('/api/projects', require('./routes/projects'));
    app.use('/api/projects', require('./routes/tasks'));
    console.log('Database routes loaded successfully');
  } catch (err) {
    console.warn('Could not load database routes:', err.message);
  }
}

// ===== Telegram Bot - Due Date Notifications =====

// Sync board data from frontend to server (for due-date checking)
app.post('/api/board/sync', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const { boardData } = req.body;
  if (!boardData) return res.status(400).json({ error: 'boardData is required' });

  telegramBot.updateBoardData(boardData);
  res.json({ success: true, message: 'Board data synced for notifications' });
});

// Get sync status
app.get('/api/board/sync-status', (req, res) => {
  res.json(telegramBot.getSyncStatus());
});

// Manual trigger for testing (Super Admin only)
app.post('/api/telegram/check-now', requireSuperAdmin, async (req, res) => {
  try {
    await telegramBot.triggerCheck();
    res.json({ success: true, message: 'Check triggered, notifications sent if applicable' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Test bot connection
app.post('/api/telegram/test', requireSuperAdmin, async (req, res) => {
  try {
    await telegramBot.sendTelegramMessage('🧪 בדיקת חיבור — הבוט פעיל ומחובר!');
    res.json({ success: true, message: 'Test message sent' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Initialize Telegram bot scheduler
telegramBot.initScheduler();

// ===== Board Data Persistence API =====
// Store/retrieve board data, archived tasks, and column state per user on the server
// This ensures data survives code deploys, localStorage clears, and browser changes
// WORKSPACE BOARD DATA IS SHARED: all members of a workspace read/write the same data

// Helper: get user ID from session key
function getUserFromSession(token) {
  const key = sessions.get(token);
  if (!key) return null;
  const user = users.get(key);
  return user ? { key, user } : null;
}

// Helper: check if user is member of workspace
function isWorkspaceMember(userId, workspaceId) {
  if (!workspaceId) return true; // default workspace accessible to all
  return !!workspaceStore.getMembership(userId, workspaceId);
}

// GET /api/user-data/boards - Get board data (SHARED per workspace)
app.get('/api/user-data/boards', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const user = users.get(key);
  const wsId = req.query.workspaceId;
  
  if (wsId) {
    // Workspace board data is SHARED — stored under workspace key
    if (!isWorkspaceMember(user.id, wsId)) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }
    const sharedKey = `workspace_shared_${wsId}`;
    let data = await dataStore.readUserData(sharedKey, 'boards');
    
    // Migration: if no shared data exists, try to load from the workspace owner's personal data
    if (!data) {
      const ws = workspaceStore.getWorkspace(wsId);
      if (ws && ws.ownerId) {
        const ownerKey = findUserKeyById(ws.ownerId);
        if (ownerKey) {
          const ownerData = await dataStore.readUserData(ownerKey, `ws_${wsId}_boards`);
          if (ownerData) {
            // Migrate owner's data to shared storage
            await dataStore.writeUserData(sharedKey, 'boards', ownerData);
            data = ownerData;
            console.log(`[Migration] Migrated workspace ${wsId} board data from owner to shared storage`);
          }
        }
      }
    }
    
    // CLEANUP: Remove boardGroups keys that don't have a matching board (stale data)
    if (data && data.boardGroups && data.boards) {
      const boardIds = new Set(data.boards.map(b => b.id));
      let cleaned = false;
      for (const bgId of Object.keys(data.boardGroups)) {
        if (!boardIds.has(bgId)) {
          delete data.boardGroups[bgId];
          cleaned = true;
        }
      }
      if (cleaned) {
        const fixKey = `workspace_shared_${wsId}`;
        await dataStore.writeUserData(fixKey, 'boards', data);
        console.log(`[Cleanup] Removed stale boardGroups keys for workspace ${wsId}`);
      }
    }

    // Board-level permission: if user only has access to a specific board, filter
    if (data) {
      const membership = workspaceStore.getMembership(user.id, wsId);
      if (membership && membership.boardId && data.boards) {
        // User only has access to a specific board
        const allowedBoardId = membership.boardId;
        data = JSON.parse(JSON.stringify(data)); // deep clone to not mutate shared
        data.boards = data.boards.filter(b => b.id === allowedBoardId);
        if (data.boardGroups) {
          const filteredGroups = {};
          if (data.boardGroups[allowedBoardId]) {
            filteredGroups[allowedBoardId] = data.boardGroups[allowedBoardId];
          }
          data.boardGroups = filteredGroups;
        }
        data.activeBoard = allowedBoardId;
      }
    }
    
    res.json({ success: true, data: data });
  } else {
    // Personal board data (no workspace) — per user
    const data = await dataStore.readUserData(key, 'boards');
    res.json({ success: true, data: data });
  }
});

// PUT /api/user-data/boards - Save board data (SHARED per workspace)
app.put('/api/user-data/boards', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'data is required' });

  const user = users.get(key);
  const wsId = req.query.workspaceId || req.body.workspaceId;
  
  if (wsId) {
    // Workspace board data is SHARED
    if (!isWorkspaceMember(user.id, wsId)) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }
    const sharedKey = `workspace_shared_${wsId}`;
    
    // SAFETY: Never overwrite real data with empty/default data
    const hasRealContent = data.boardGroups && Object.keys(data.boardGroups).length > 0 &&
      Object.values(data.boardGroups).some(groups => groups && groups.length > 0 && 
        groups.some(g => g.tasks && g.tasks.length > 0));
    
    if (!hasRealContent) {
      const existing = await dataStore.readUserData(sharedKey, 'boards');
      if (existing && existing.boardGroups) {
        const existingHasContent = Object.values(existing.boardGroups).some(groups => 
          groups && groups.length > 0 && groups.some(g => g.tasks && g.tasks.length > 0));
        if (existingHasContent) {
          console.log(`[Safety] Blocked empty overwrite of shared workspace ${wsId} boards`);
          return res.json({ success: true, blocked: true });
        }
      }
    }
    
    // CLEANUP: Remove stale boardGroups keys on save
    if (data.boardGroups && data.boards) {
      const boardIds = new Set(data.boards.map(b => b.id));
      for (const bgId of Object.keys(data.boardGroups)) {
        if (!boardIds.has(bgId)) {
          delete data.boardGroups[bgId];
          console.log(`[Cleanup] Removed stale boardGroup key ${bgId} on save for workspace ${wsId}`);
        }
      }
    }
    
    const success = await dataStore.writeUserData(sharedKey, 'boards', data);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to save data' });
    }
  } else {
    // Personal board data (no workspace)
    const success = await dataStore.writeUserData(key, 'boards', data);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to save data' });
    }
  }
});

// GET /api/user-data/archived - Get archived tasks (SHARED per workspace)
app.get('/api/user-data/archived', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const user = users.get(key);
  const wsId = req.query.workspaceId;
  
  if (wsId) {
    if (!isWorkspaceMember(user.id, wsId)) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }
    const sharedKey = `workspace_shared_${wsId}`;
    const data = await dataStore.readUserData(sharedKey, 'archived');
    res.json({ success: true, data: data || [] });
  } else {
    const data = await dataStore.readUserData(key, 'archived');
    res.json({ success: true, data: data || [] });
  }
});

// PUT /api/user-data/archived - Save archived tasks (SHARED per workspace)
app.put('/api/user-data/archived', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const user = users.get(key);
  const { data } = req.body;
  if (!Array.isArray(data) && data !== null) return res.status(400).json({ error: 'data must be an array' });

  const wsId = req.query.workspaceId || req.body.workspaceId;
  
  if (wsId) {
    if (!isWorkspaceMember(user.id, wsId)) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }
    const sharedKey = `workspace_shared_${wsId}`;
    const success = await dataStore.writeUserData(sharedKey, 'archived', data || []);
    if (success) { res.json({ success: true }); }
    else { res.status(500).json({ error: 'Failed to save data' }); }
  } else {
    const success = await dataStore.writeUserData(key, 'archived', data || []);
    if (success) { res.json({ success: true }); }
    else { res.status(500).json({ error: 'Failed to save data' }); }
  }
});

// GET /api/user-data/columns - Get column state (SHARED per workspace)
app.get('/api/user-data/columns', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const user = users.get(key);
  const wsId = req.query.workspaceId;
  
  if (wsId) {
    if (!isWorkspaceMember(user.id, wsId)) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }
    const sharedKey = `workspace_shared_${wsId}`;
    const data = await dataStore.readUserData(sharedKey, 'columns');
    res.json({ success: true, data: data });
  } else {
    const data = await dataStore.readUserData(key, 'columns');
    res.json({ success: true, data: data });
  }
});

// PUT /api/user-data/columns - Save column state (SHARED per workspace)
app.put('/api/user-data/columns', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const user = users.get(key);
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: 'data is required' });

  const wsId = req.query.workspaceId || req.body.workspaceId;
  
  if (wsId) {
    if (!isWorkspaceMember(user.id, wsId)) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }
    const sharedKey = `workspace_shared_${wsId}`;
    const success = await dataStore.writeUserData(sharedKey, 'columns', data);
    if (success) { res.json({ success: true }); }
    else { res.status(500).json({ error: 'Failed to save data' }); }
  } else {
    const success = await dataStore.writeUserData(key, 'columns', data);
    if (success) { res.json({ success: true }); }
    else { res.status(500).json({ error: 'Failed to save data' }); }
  }
});

// GET /api/user-data/person-filters - Get person filter state (per user per workspace)
app.get('/api/user-data/person-filters', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const wsId = req.query.workspaceId || 'default';
  const data = await dataStore.readUserData(key, `person_filters_${wsId}`);
  res.json({ success: true, data: data || {} });
});

// PUT /api/user-data/person-filters - Save person filter state (per user per workspace)
app.put('/api/user-data/person-filters', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const { data, workspaceId } = req.body;
  if (!data) return res.status(400).json({ error: 'data is required' });

  const wsId = workspaceId || 'default';
  const success = await dataStore.writeUserData(key, `person_filters_${wsId}`, data);
  if (success) { res.json({ success: true }); }
  else { res.status(500).json({ error: 'Failed to save data' }); }
});

// GET /api/user-data/task-details - Get task details panel data (SHARED per workspace)
app.get('/api/user-data/task-details', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const user = users.get(key);
  const workspaceId = req.query.workspaceId || 'default';
  
  if (workspaceId !== 'default') {
    if (!isWorkspaceMember(user.id, workspaceId)) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }
    const sharedKey = `workspace_shared_${workspaceId}`;
    let data = await dataStore.readUserData(sharedKey, 'task_details');
    
    // Migration: try owner's personal data
    if (!data) {
      const ws = workspaceStore.getWorkspace(workspaceId);
      if (ws && ws.ownerId) {
        const ownerKey = findUserKeyById(ws.ownerId);
        if (ownerKey) {
          const ownerData = await dataStore.readUserData(ownerKey, `task_details_${workspaceId}`);
          if (ownerData) {
            await dataStore.writeUserData(sharedKey, 'task_details', ownerData);
            data = ownerData;
            console.log(`[Migration] Migrated workspace ${workspaceId} task details from owner to shared`);
          }
        }
      }
    }
    
    res.json({ success: true, data: data || {} });
  } else {
    const data = await dataStore.readUserData(key, 'task_details_default');
    res.json({ success: true, data: data || {} });
  }
});

// PUT /api/user-data/task-details - Save task details panel data (SHARED per workspace)
app.put('/api/user-data/task-details', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const user = users.get(key);
  const { data, workspaceId } = req.body;
  if (!data) return res.status(400).json({ error: 'data is required' });

  const wsId = workspaceId || 'default';
  
  if (wsId !== 'default') {
    if (!isWorkspaceMember(user.id, wsId)) {
      return res.status(403).json({ error: 'Not a member of this workspace' });
    }
    const sharedKey = `workspace_shared_${wsId}`;
    const success = await dataStore.writeUserData(sharedKey, 'task_details', data);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to save task details data' });
    }
  } else {
    const success = await dataStore.writeUserData(key, 'task_details_default', data);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: 'Failed to save task details data' });
    }
  }
});

// GET /api/user-data/notifications - Get user's notifications for workspace
app.get('/api/user-data/notifications', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const workspaceId = req.query.workspaceId || 'default';
  const storageKey = `notifications_${workspaceId}`;
  const data = await dataStore.readUserData(key, storageKey);
  res.json({ success: true, data: data || [] });
});

// PUT /api/user-data/notifications - Save user's notifications for workspace
app.put('/api/user-data/notifications', async (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const { data, workspaceId } = req.body;
  if (!data) return res.status(400).json({ error: 'data is required' });

  const storageKey = `notifications_${workspaceId || 'default'}`;
  // Keep only last 50 notifications
  const trimmed = Array.isArray(data) ? data.slice(0, 50) : [];
  const success = await dataStore.writeUserData(key, storageKey, trimmed);
  if (success) {
    res.json({ success: true });
  } else {
    res.status(500).json({ error: 'Failed to save notifications' });
  }
});

// GET /api/user-data/status - Get storage status (admin/debug)
app.get('/api/user-data/status', (req, res) => {
  res.json(dataStore.getStatus());
});

// GET /api/user-data/debug-list - List all stored data keys (admin only, temporary)
app.get('/api/user-data/debug-list', requireSuperAdmin, async (req, res) => {
  const list = await dataStore.listAllData();
  res.json({ success: true, records: list });
});

// ===== SNAPSHOT API (Super Admin Only) =====

// GET /api/snapshots - List all valid snapshots
app.get('/api/snapshots', requireSuperAdmin, async (req, res) => {
  try {
    const snapshots = await snapshotStore.listSnapshots();
    res.json({ success: true, snapshots });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/snapshots/latest - Get latest snapshot info
app.get('/api/snapshots/latest', requireSuperAdmin, async (req, res) => {
  try {
    const info = await snapshotStore.getLatestSnapshotInfo();
    res.json({ success: true, snapshot: info });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/snapshots/:id - Get snapshot details (with user summaries)
app.get('/api/snapshots/:id', requireSuperAdmin, async (req, res) => {
  try {
    const details = await snapshotStore.getSnapshotDetails(parseInt(req.params.id));
    if (!details) return res.status(404).json({ success: false, error: 'Snapshot not found' });
    res.json({ success: true, snapshot: details });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/snapshots/create - Manually create a snapshot
app.post('/api/snapshots/create', requireSuperAdmin, async (req, res) => {
  try {
    const result = await snapshotStore.createSnapshot('manual');
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/snapshots/:id/restore - Restore from a snapshot
app.post('/api/snapshots/:id/restore', requireSuperAdmin, async (req, res) => {
  try {
    const result = await snapshotStore.restoreFromSnapshot(parseInt(req.params.id));
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== WORKSPACE API =====

// Middleware: authenticate and attach user to request
function requireAuth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });
  const user = users.get(key);
  if (!user) return res.status(401).json({ error: 'User not found' });
  req.user = user;
  req.userKey = key;
  next();
}

// Middleware: require workspace permission
function requireWorkspacePermission(permission) {
  return (req, res, next) => {
    const workspaceId = req.params.workspaceId || req.body.workspaceId;
    if (!workspaceId) return res.status(400).json({ error: 'workspaceId is required' });
    if (!workspaceStore.hasPermission(req.user.id, workspaceId, permission)) {
      return res.status(403).json({ error: `Permission denied: ${permission}` });
    }
    req.workspaceId = workspaceId;
    next();
  };
}

// GET /api/workspaces - Get all workspaces for current user
app.get('/api/workspaces', requireAuth, (req, res) => {
  const workspaceList = workspaceStore.getUserWorkspaces(req.user.id);
  res.json({ success: true, workspaces: workspaceList });
});

// POST /api/workspaces - Create a new workspace
app.post('/api/workspaces', requireAuth, async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Workspace name is required' });

    const workspace = workspaceStore.createWorkspace(
      req.user.id,
      req.user.fullName,
      req.user.email,
      name,
      description || ''
    );

    // Initialize shared board data with default groups (To-Do, In Progress, Completed)
    const defaultBoardId = 'board_' + Date.now();
    const defaultBoardData = {
      boards: [{ id: defaultBoardId, name: 'Main Table', archived: false }],
      activeBoard: defaultBoardId,
      boardGroups: {
        [defaultBoardId]: [
          { id: 'g_' + Date.now() + '_1', name: 'To-Do', color: '#6161ff', collapsed: false, tasks: [] },
          { id: 'g_' + Date.now() + '_2', name: 'In Progress', color: '#ff7575', collapsed: false, tasks: [] },
          { id: 'g_' + Date.now() + '_3', name: 'Completed', color: '#00c875', collapsed: false, tasks: [] }
        ]
      },
      groups: []
    };
    const sharedKey = `workspace_shared_${workspace.id}`;
    await dataStore.writeUserData(sharedKey, 'boards', defaultBoardData);

    await workspaceStore.persistWorkspaces();
    res.json({ success: true, workspace });
  } catch (e) {
    console.error('[Workspace] Create error:', e);
    res.status(500).json({ success: false, error: 'Failed to create workspace: ' + e.message });
  }
});

// POST /api/workspaces/join/:token - Accept workspace invitation (MUST be before :workspaceId)
app.post('/api/workspaces/join/:token', requireAuth, async (req, res) => {
  const invite = workspaceStore.getWorkspaceInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid invite link' });
  if (invite.used) return res.status(410).json({ error: 'Invite already used' });
  if (new Date(invite.expiresAt) < new Date()) return res.status(410).json({ error: 'Invite expired' });

  const existing = workspaceStore.getMembership(req.user.id, invite.workspaceId);
  if (existing) {
    return res.status(409).json({ error: 'Already a member of this workspace', role: existing.role });
  }

  // Get boardId from admin invite if available
  const adminInvite = invites.get(req.params.token);
  const inviteBoardId = adminInvite ? adminInvite.boardId : null;

  workspaceStore.addMembership(
    req.user.id, req.user.fullName, req.user.email,
    invite.workspaceId, invite.role, inviteBoardId
  );
  workspaceStore.useWorkspaceInvite(req.params.token);
  await workspaceStore.persistWorkspaces();

  // Also mark admin invite as used (if this token exists in both systems)
  if (adminInvite) adminInvite.used = true;

  const workspace = workspaceStore.getWorkspace(invite.workspaceId);
  res.json({ success: true, workspace: { ...workspace, role: invite.role } });
});

// GET /api/workspaces/invite/:token - Verify invite (public, MUST be before :workspaceId)
app.get('/api/workspaces/invite/:token', (req, res) => {
  const invite = workspaceStore.getWorkspaceInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid invite link' });
  if (invite.used) return res.status(410).json({ error: 'Invite already used' });
  if (new Date(invite.expiresAt) < new Date()) return res.status(410).json({ error: 'Invite expired' });

  const workspace = workspaceStore.getWorkspace(invite.workspaceId);
  res.json({
    valid: true,
    workspaceName: workspace ? workspace.name : 'Unknown',
    inviterName: invite.inviterName,
    role: invite.role,
    email: invite.targetEmail
  });
});

// GET /api/workspaces/:workspaceId - Get workspace details
app.get('/api/workspaces/:workspaceId', requireAuth, (req, res) => {
  const workspace = workspaceStore.getWorkspace(req.params.workspaceId);
  if (!workspace) return res.status(404).json({ error: 'Workspace not found' });
  
  // Must be a member to view
  const role = workspaceStore.getUserRole(req.user.id, req.params.workspaceId);
  if (!role) return res.status(403).json({ error: 'Not a member of this workspace' });

  res.json({ success: true, workspace: { ...workspace, role } });
});

// PUT /api/workspaces/:workspaceId - Update workspace
app.put('/api/workspaces/:workspaceId', requireAuth, requireWorkspacePermission('workspace.settings'), async (req, res) => {
  const { name, description, color } = req.body;
  const updated = workspaceStore.updateWorkspace(req.params.workspaceId, { name, description, color });
  if (!updated) return res.status(404).json({ error: 'Workspace not found' });

  await workspaceStore.persistWorkspaces();
  res.json({ success: true, workspace: updated });
});

// DELETE /api/workspaces/:workspaceId - Delete workspace (owner only)
app.delete('/api/workspaces/:workspaceId', requireAuth, requireWorkspacePermission('workspace.delete'), async (req, res) => {
  workspaceStore.deleteWorkspace(req.params.workspaceId);
  await workspaceStore.persistWorkspaces();
  res.json({ success: true });
});

// GET /api/workspaces/:workspaceId/members - Get all members
app.get('/api/workspaces/:workspaceId/members', requireAuth, requireWorkspacePermission('board.view'), async (req, res) => {
  const workspaceId = req.params.workspaceId;
  
  // Auto-reconcile: find registered users who were invited but never added as members
  // Scan admin invites (in-memory)
  for (const [token, invite] of invites) {
    if (invite.workspaceId === workspaceId && invite.email) {
      for (const [key, user] of users.entries()) {
        if (user.email === invite.email) {
          const existing = workspaceStore.getMembership(user.id, workspaceId);
          if (!existing) {
            workspaceStore.addMembership(user.id, user.fullName, user.email, workspaceId, invite.role || 'member');
            invite.used = true;
            console.log(`[Reconcile] Auto-added ${user.email} to workspace ${workspaceId} (from admin invite)`);
          }
          break;
        }
      }
    }
  }

  // Scan workspace invites (persisted — survives server restarts)
  const allWsInvites = workspaceStore.getAllWorkspaceInvites(workspaceId);
  for (const invite of allWsInvites) {
    if (invite.targetEmail) {
      for (const [key, user] of users.entries()) {
        if (user.email === invite.targetEmail) {
          const existing = workspaceStore.getMembership(user.id, workspaceId);
          if (!existing) {
            workspaceStore.addMembership(user.id, user.fullName, user.email, workspaceId, invite.role || 'member');
            invite.used = true;
            console.log(`[Reconcile] Auto-added ${user.email} to workspace ${workspaceId} (from workspace invite)`);
          }
          break;
        }
      }
    }
  }

  // Persist any changes from reconciliation
  await workspaceStore.persistWorkspaces();
  await persistAdminInvites();

  const members = workspaceStore.getWorkspaceMembers(workspaceId);
  // Enrich members with profile picture from user store
  const enrichedMembers = members.map(m => {
    const user = findUserByEmail(m.userEmail);
    return { ...m, picture: (user && user.picture) || '' };
  });
  res.json({ success: true, members: enrichedMembers });
});

// POST /api/workspaces/:workspaceId/invite - Invite user to workspace
app.post('/api/workspaces/:workspaceId/invite', requireAuth, requireWorkspacePermission('workspace.invite'), async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const inviteRole = role || 'member';
  if (!workspaceStore.isValidRole(inviteRole)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${workspaceStore.VALID_ROLES.join(', ')}` });
  }

  // Cannot invite as owner
  if (inviteRole === 'owner') {
    return res.status(400).json({ error: 'Cannot invite as owner. Transfer ownership instead.' });
  }

  // Check if user's role allows assigning this role
  const callerRole = workspaceStore.getUserRole(req.user.id, req.params.workspaceId);
  if (!workspaceStore.hasHigherOrEqualRole(callerRole, inviteRole)) {
    return res.status(403).json({ error: 'Cannot assign a role higher than your own' });
  }

  // Check if already a member
  const existingByEmail = findUserByEmail(email.toLowerCase().trim());
  if (existingByEmail) {
    const existingMembership = workspaceStore.getMembership(existingByEmail.id, req.params.workspaceId);
    if (existingMembership) {
      return res.status(409).json({ error: 'User is already a workspace member' });
    }
    // User is registered but not a member — add directly without invite email
    workspaceStore.addMembership(existingByEmail.id, existingByEmail.fullName, existingByEmail.email, req.params.workspaceId, inviteRole);
    await workspaceStore.persistWorkspaces();
    console.log(`[Workspace] Auto-added registered user ${existingByEmail.email} to workspace ${req.params.workspaceId} as ${inviteRole}`);
    return res.json({
      success: true,
      autoAdded: true,
      member: { userId: existingByEmail.id, userName: existingByEmail.fullName, userEmail: existingByEmail.email, role: inviteRole }
    });
  }

  const workspace = workspaceStore.getWorkspace(req.params.workspaceId);
  const invite = workspaceStore.createWorkspaceInvite(
    req.params.workspaceId,
    req.user.id,
    req.user.fullName,
    email,
    inviteRole
  );

  await workspaceStore.persistWorkspaces();

  // Also track in admin invites map (for admin dashboard visibility)
  invites.set(invite.token, {
    email: email.toLowerCase().trim(),
    inviterEmail: req.user.email,
    inviterName: req.user.fullName,
    orgName: workspace.name,
    workspaceId: req.params.workspaceId,
    boardId: null,
    role: inviteRole,
    createdAt: new Date().toISOString(),
    expiresAt: invite.expiresAt,
    used: false
  });
  await persistAdminInvites();

  // Try sending email (silent fail if email service not configured)
  try {
    await emailService.sendInviteEmail(
      email,
      req.user.fullName,
      workspace.name,
      invite.token
    );
  } catch (e) {
    console.warn('[Workspace] Email send failed:', e.message);
  }

  res.json({
    success: true,
    invite: {
      token: invite.token,
      email: invite.targetEmail,
      role: invite.role,
      expiresAt: invite.expiresAt,
      workspaceName: workspace.name
    }
  });
});

// POST /api/workspaces/:workspaceId/members/add - Add existing registered user directly (admin/owner only)
app.post('/api/workspaces/:workspaceId/members/add', requireAuth, requireWorkspacePermission('workspace.invite'), async (req, res) => {
  const { email, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const addRole = role || 'member';
  if (!workspaceStore.isValidRole(addRole)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${workspaceStore.VALID_ROLES.join(', ')}` });
  }
  if (addRole === 'owner') {
    return res.status(400).json({ error: 'Cannot add as owner. Transfer ownership instead.' });
  }

  // Find registered user
  let targetUser = null;
  for (const [key, user] of users.entries()) {
    if (user.email === email.toLowerCase().trim()) {
      targetUser = user;
      break;
    }
  }
  if (!targetUser) {
    return res.status(404).json({ error: 'User not registered. Send an invite instead.' });
  }

  // Check if already a member
  const existing = workspaceStore.getMembership(targetUser.id, req.params.workspaceId);
  if (existing) {
    return res.status(409).json({ error: 'User is already a workspace member' });
  }

  workspaceStore.addMembership(targetUser.id, targetUser.fullName, targetUser.email, req.params.workspaceId, addRole);
  await workspaceStore.persistWorkspaces();

  console.log(`[Workspace] Directly added ${targetUser.email} to workspace ${req.params.workspaceId} as ${addRole}`);
  res.json({ success: true, member: { userId: targetUser.id, fullName: targetUser.fullName, email: targetUser.email, role: addRole } });
});

// GET /api/workspaces/:workspaceId/invites - Get pending invites
app.get('/api/workspaces/:workspaceId/invites', requireAuth, requireWorkspacePermission('workspace.invite'), (req, res) => {
  const invites = workspaceStore.getWorkspacePendingInvites(req.params.workspaceId);
  res.json({ success: true, invites });
});

// DELETE /api/workspaces/:workspaceId/invites/:token - Revoke invite
app.delete('/api/workspaces/:workspaceId/invites/:token', requireAuth, requireWorkspacePermission('workspace.invite'), async (req, res) => {
  workspaceStore.revokeWorkspaceInvite(req.params.token);
  await workspaceStore.persistWorkspaces();
  res.json({ success: true });
});

// PUT /api/workspaces/:workspaceId/members/:userId/role - Change member role
app.put('/api/workspaces/:workspaceId/members/:userId/role', requireAuth, requireWorkspacePermission('workspace.change_role'), async (req, res) => {
  const { role: newRole } = req.body;
  if (!newRole || !workspaceStore.isValidRole(newRole)) {
    return res.status(400).json({ error: `Invalid role. Must be one of: ${workspaceStore.VALID_ROLES.join(', ')}` });
  }

  const targetMembership = workspaceStore.getMembership(req.params.userId, req.params.workspaceId);
  if (!targetMembership) return res.status(404).json({ error: 'Member not found' });

  // Cannot change owner's role (only owner can transfer ownership)
  if (targetMembership.role === 'owner' && req.user.id !== targetMembership.userId) {
    return res.status(403).json({ error: 'Cannot change owner role' });
  }

  // Admin cannot promote to owner
  const callerRole = workspaceStore.getUserRole(req.user.id, req.params.workspaceId);
  if (newRole === 'owner' && callerRole !== 'owner') {
    return res.status(403).json({ error: 'Only the owner can transfer ownership' });
  }

  // If transferring ownership, demote current owner to admin
  if (newRole === 'owner' && callerRole === 'owner') {
    workspaceStore.updateMembershipRole(req.user.id, req.params.workspaceId, 'admin');
  }

  workspaceStore.updateMembershipRole(req.params.userId, req.params.workspaceId, newRole);
  await workspaceStore.persistWorkspaces();

  res.json({ success: true, userId: req.params.userId, newRole });
});

// DELETE /api/workspaces/:workspaceId/members/:userId - Remove member
app.delete('/api/workspaces/:workspaceId/members/:userId', requireAuth, requireWorkspacePermission('workspace.remove_member'), async (req, res) => {
  const targetMembership = workspaceStore.getMembership(req.params.userId, req.params.workspaceId);
  if (!targetMembership) return res.status(404).json({ error: 'Member not found' });

  // Cannot remove the owner
  if (targetMembership.role === 'owner') {
    return res.status(403).json({ error: 'Cannot remove workspace owner' });
  }

  // Admin cannot remove other admins (only owner can)
  const callerRole = workspaceStore.getUserRole(req.user.id, req.params.workspaceId);
  if (targetMembership.role === 'admin' && callerRole !== 'owner') {
    return res.status(403).json({ error: 'Only owner can remove admins' });
  }

  workspaceStore.removeMembership(req.params.userId, req.params.workspaceId);
  await workspaceStore.persistWorkspaces();

  res.json({ success: true });
});

// POST /api/workspaces/:workspaceId/leave - Leave workspace (self)
app.post('/api/workspaces/:workspaceId/leave', requireAuth, async (req, res) => {
  const membership = workspaceStore.getMembership(req.user.id, req.params.workspaceId);
  if (!membership) return res.status(404).json({ error: 'Not a member of this workspace' });

  // Owner cannot leave (must transfer ownership first)
  if (membership.role === 'owner') {
    return res.status(403).json({ error: 'Owner cannot leave. Transfer ownership first.' });
  }

  workspaceStore.removeMembership(req.user.id, req.params.workspaceId);
  await workspaceStore.persistWorkspaces();

  res.json({ success: true });
});

// GET /api/workspaces/:workspaceId/permissions - Get current user's permissions in workspace
app.get('/api/workspaces/:workspaceId/permissions', requireAuth, (req, res) => {
  const role = workspaceStore.getUserRole(req.user.id, req.params.workspaceId);
  if (!role) return res.status(403).json({ error: 'Not a member' });

  const permissions = {};
  for (const [perm, roles] of Object.entries(workspaceStore.PERMISSIONS)) {
    permissions[perm] = roles.includes(role);
  }

  res.json({ success: true, role, permissions });
});

// ===== Email & Invite System =====

// Invite store: token -> { email, inviterEmail, orgName, boardId, createdAt, expiresAt, used }
const invites = new Map();

// Persist admin invites to database
const INVITES_DATA_KEY = '__system__admin_invites';

async function persistAdminInvites() {
  const data = Object.fromEntries(invites);
  await dataStore.writeUserData(INVITES_DATA_KEY, 'invites', data);
}

async function loadAdminInvites() {
  try {
    const data = await dataStore.readUserData(INVITES_DATA_KEY, 'invites');
    if (data) {
      for (const [key, value] of Object.entries(data)) {
        invites.set(key, value);
      }
      console.log(`[Invites] Loaded ${invites.size} admin invites from database`);
    }
  } catch (e) {
    console.error('[Invites] Failed to load:', e.message);
  }
}

// Email preferences store: userKey -> { invites: bool, notifications: bool, updates: bool }
const emailPreferences = new Map();

// Check if user exists (any authenticated user — for invite flow hint)
app.get('/api/users/check', requireAuth, (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.json({ exists: false });
  for (const [key, user] of users.entries()) {
    if (user.email === email) {
      return res.json({ exists: true, fullName: user.fullName });
    }
  }
  res.json({ exists: false });
});

// Check if user exists (Super Admin - for invite wizard)
app.get('/api/admin/check-user', requireSuperAdmin, (req, res) => {
  const email = (req.query.email || '').toLowerCase().trim();
  if (!email) return res.json({ exists: false });
  for (const [key, user] of users.entries()) {
    if (user.email === email) {
      return res.json({ exists: true, fullName: user.fullName, email: user.email });
    }
  }
  res.json({ exists: false });
});

// Send invite email (Super Admin only)
app.post('/api/invites/send', requireSuperAdmin, async (req, res) => {
  const { email, orgName, boardId, workspaceId, role } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const inviteRole = role || 'member';
  let inviteToken;
  let wsInvite = null;

  // If workspace is selected, create a workspace invite (so the join flow works)
  if (workspaceId) {
    const workspace = workspaceStore.getWorkspace(workspaceId);
    if (workspace) {
      wsInvite = workspaceStore.createWorkspaceInvite(
        workspaceId,
        req.caller.id || 'super_admin',
        req.caller.fullName,
        email.toLowerCase().trim(),
        inviteRole
      );
      inviteToken = wsInvite.token;
      await workspaceStore.persistWorkspaces();
    }
  }

  // Fallback: generate standalone token if no workspace invite was created
  if (!inviteToken) {
    inviteToken = crypto.randomBytes(24).toString('hex');
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

  // Also store in admin invites map (for admin dashboard tracking)
  invites.set(inviteToken, {
    email: email.toLowerCase().trim(),
    inviterEmail: req.caller.email,
    inviterName: req.caller.fullName,
    orgName: orgName || 'Main workspace',
    workspaceId: workspaceId || null,
    boardId: boardId || null,
    role: inviteRole,
    createdAt: new Date().toISOString(),
    expiresAt,
    used: false
  });
  await persistAdminInvites();

  const result = await emailService.sendInviteEmail(
    email,
    req.caller.fullName,
    orgName || 'Main workspace',
    inviteToken
  );

  if (result.success) {
    res.json({ success: true, message: `Invite sent to ${email}`, inviteToken, expiresAt });
  } else {
    res.status(500).json({ error: `Failed to send invite: ${result.error}` });
  }
});

// Verify invite token
app.get('/api/invites/verify/:token', (req, res) => {
  const invite = invites.get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid invite link' });
  if (invite.used) return res.status(410).json({ error: 'Invite already used' });
  if (new Date(invite.expiresAt) < new Date()) return res.status(410).json({ error: 'Invite expired' });

  res.json({
    valid: true,
    email: invite.email,
    orgName: invite.orgName,
    inviterName: invite.inviterName
  });
});

// Mark invite as used (called after successful registration with invite)
app.post('/api/invites/use/:token', async (req, res) => {
  const invite = invites.get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid invite' });
  invite.used = true;
  await persistAdminInvites();

  // If invite has a workspaceId, add the new user to that workspace
  if (invite.workspaceId) {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const userKey = sessions.get(token);
    const user = userKey ? users.get(userKey) : null;
    if (user) {
      const existingMembership = workspaceStore.getMembership(user.id, invite.workspaceId);
      if (!existingMembership) {
        workspaceStore.addMembership(user.id, user.fullName, user.email, invite.workspaceId, invite.role || 'member');
        workspaceStore.persistWorkspaces().catch(() => {});
      }
    }
  }

  res.json({ success: true });
});

// Get all pending invites (Super Admin)
app.get('/api/invites', requireSuperAdmin, async (req, res) => {
  const list = [];
  let changed = false;
  invites.forEach((invite, token) => {
    // Auto-detect if invited user has already registered
    if (!invite.used) {
      const invitedEmail = (invite.email || '').toLowerCase().trim();
      for (const [key, user] of users.entries()) {
        if (user.email === invitedEmail) {
          // User exists — mark invite as accepted
          invite.used = true;
          changed = true;
          break;
        }
      }
    }
    list.push({ ...invite, token: token.substring(0, 8) + '...' });
  });
  if (changed) await persistAdminInvites();
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(list);
});

// Send notification email (Super Admin)
app.post('/api/email/send-notification', requireSuperAdmin, async (req, res) => {
  const { recipients, subject, bodyText, orgName, ctaText, ctaLink } = req.body;
  if (!recipients || !recipients.length || !subject || !bodyText) {
    return res.status(400).json({ error: 'recipients, subject, and bodyText are required' });
  }

  // Build recipient list with email preferences
  const recipientList = recipients.map(r => {
    const prefs = emailPreferences.get(userKey(r.email, r.provider || 'local'));
    return { ...r, emailPrefs: prefs || {} };
  });

  const results = await emailService.sendBulkNotification(recipientList, subject, bodyText, orgName, ctaText, ctaLink);
  res.json({ success: true, results });
});

// Get email preferences for a user
app.get('/api/email/preferences', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const prefs = emailPreferences.get(key) || { invites: true, notifications: true, updates: true };
  res.json(prefs);
});

// Update email preferences
app.put('/api/email/preferences', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const key = sessions.get(token);
  if (!key) return res.status(401).json({ error: 'Not authenticated' });

  const { invites: inv, notifications, updates } = req.body;
  const prefs = emailPreferences.get(key) || { invites: true, notifications: true, updates: true };
  
  if (typeof inv === 'boolean') prefs.invites = inv;
  if (typeof notifications === 'boolean') prefs.notifications = notifications;
  if (typeof updates === 'boolean') prefs.updates = updates;
  
  emailPreferences.set(key, prefs);
  res.json({ success: true, preferences: prefs });
});

// Get all users' email preferences (Super Admin - for admin dashboard)
app.get('/api/admin/email-preferences', requireSuperAdmin, (req, res) => {
  const result = [];
  users.forEach((user, key) => {
    const prefs = emailPreferences.get(key) || { invites: true, notifications: true, updates: true };
    result.push({
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      emailPrefs: prefs
    });
  });
  res.json(result);
});

// Update a user's email preferences (Super Admin)
app.put('/api/admin/email-preferences/:email', requireSuperAdmin, (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const user = findUserByEmail(email);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const key = userKey(user.email, user.provider || 'local');
  const { invites: inv, notifications, updates } = req.body;
  const prefs = emailPreferences.get(key) || { invites: true, notifications: true, updates: true };

  if (typeof inv === 'boolean') prefs.invites = inv;
  if (typeof notifications === 'boolean') prefs.notifications = notifications;
  if (typeof updates === 'boolean') prefs.updates = updates;

  emailPreferences.set(key, prefs);
  res.json({ success: true, preferences: prefs });
});

// ===== ADMIN: TDP DATA RECOVERY =====
// GET /api/admin/tdp-data/:workspaceId - Get raw TDP data for a workspace (super admin only)
app.get('/api/admin/tdp-data/:workspaceId', requireSuperAdmin, async (req, res) => {
  try {
    const wsId = req.params.workspaceId;
    const sharedKey = `workspace_shared_${wsId}`;
    const data = await dataStore.readUserData(sharedKey, 'task_details');
    if (!data) {
      return res.json({ success: true, data: null, message: 'No TDP data found for this workspace' });
    }
    const messages = data.messages || {};
    const totalMessages = Object.values(messages).reduce((sum, arr) => sum + arr.length, 0);
    const totalImages = Object.values(messages).reduce((sum, arr) => sum + arr.filter(m => m.image && m.image.length > 10).length, 0);
    res.json({ 
      success: true, 
      summary: { messageKeys: Object.keys(messages).length, totalMessages, totalImages },
      data 
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/admin/tdp-data/:workspaceId - Restore TDP data for a workspace (super admin only)
app.put('/api/admin/tdp-data/:workspaceId', requireSuperAdmin, async (req, res) => {
  try {
    const wsId = req.params.workspaceId;
    const { data } = req.body;
    if (!data) return res.status(400).json({ error: 'data is required' });
    const sharedKey = `workspace_shared_${wsId}`;
    await dataStore.writeUserData(sharedKey, 'task_details', data);
    res.json({ success: true, message: `TDP data restored for workspace ${wsId}` });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/admin/tdp-restore-from-personal/:workspaceId - Restore from personal backup (super admin only)
app.post('/api/admin/tdp-restore-from-personal/:workspaceId', requireSuperAdmin, async (req, res) => {
  try {
    const wsId = req.params.workspaceId;
    const { userKey } = req.body; // e.g. "moran.milshtein@gmail.com:local"
    if (!userKey) return res.status(400).json({ error: 'userKey is required' });
    
    // Read from personal storage
    const personalData = await dataStore.readUserData(userKey, `task_details_${wsId}`);
    if (!personalData) {
      return res.status(404).json({ success: false, error: 'No personal backup found' });
    }
    
    // Write to shared workspace storage
    const sharedKey = `workspace_shared_${wsId}`;
    await dataStore.writeUserData(sharedKey, 'task_details', personalData);
    
    const messages = personalData.messages || {};
    const totalMessages = Object.values(messages).reduce((sum, arr) => sum + arr.length, 0);
    const totalImages = Object.values(messages).reduce((sum, arr) => sum + arr.filter(m => m.image && m.image.length > 10).length, 0);
    
    res.json({ 
      success: true, 
      message: `Restored from personal backup: ${totalMessages} messages, ${totalImages} images`,
      summary: { messageKeys: Object.keys(messages).length, totalMessages, totalImages }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/admin/tdp-data-all - List all TDP data keys (super admin only)  
app.get('/api/admin/tdp-data-all', requireSuperAdmin, async (req, res) => {
  try {
    // Query the database for all task_details entries
    if (dataStore.pool && dataStore.usePostgres) {
      const result = await dataStore.pool.query(
        "SELECT user_key, data_type, updated_at, pg_column_size(data) as data_size FROM user_data WHERE data_type LIKE '%task_details%' ORDER BY updated_at DESC"
      );
      res.json({ success: true, entries: result.rows });
    } else {
      // File-based fallback
      const fs = require('fs');
      const files = fs.readdirSync(path.join(__dirname, 'data')).filter(f => f.includes('task_details'));
      res.json({ success: true, entries: files.map(f => ({ user_key: f, data_type: 'task_details' })) });
    }
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ===== @MENTION NOTIFICATIONS =====
// In-memory store for mention notifications (per user)
// Structure: { userId: [{ id, senderName, senderPicture, taskTitle, messageText, taskId, groupId, subtaskId, timestamp, workspaceId }] }
const mentionNotifications = new Map();

// POST /api/mentions/notify - Send mention notifications to tagged users
app.post('/api/mentions/notify', requireAuth, async (req, res) => {
  try {
    const { workspaceId, boardId, taskId, groupId, subtaskId, taskTitle, messageText, senderName, senderPicture, mentions, timestamp } = req.body;
    if (!workspaceId || !mentions || mentions.length === 0) {
      return res.json({ success: true }); // Nothing to notify
    }
    
    const senderId = req.user.id;
    
    // Resolve mention targets
    let targetUserIds = [];
    const isAll = mentions.some(m => m.userId === '__all__');
    
    if (isAll) {
      // Get all workspace members with board access
      const memberships = await workspaceStore.getWorkspaceMembers(workspaceId);
      targetUserIds = memberships
        .filter(m => m.userId !== senderId && (!m.boardId || m.boardId === boardId))
        .map(m => m.userId);
    } else {
      targetUserIds = mentions
        .filter(m => m.userId !== senderId && m.userId !== '__all__')
        .map(m => m.userId);
    }
    
    // Create notification for each target user
    const notification = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      senderName,
      senderPicture: senderPicture || '',
      taskTitle: taskTitle || '',
      messageText: (messageText || '').substring(0, 200),
      taskId: taskId || '',
      groupId: groupId || '',
      subtaskId: subtaskId || null,
      timestamp: timestamp || new Date().toISOString(),
      workspaceId
    };
    
    targetUserIds.forEach(userId => {
      if (!mentionNotifications.has(userId)) {
        mentionNotifications.set(userId, []);
      }
      const userNotifs = mentionNotifications.get(userId);
      userNotifs.push(notification);
      // Keep max 50 notifications
      if (userNotifs.length > 50) {
        mentionNotifications.set(userId, userNotifs.slice(-50));
      }
    });
    
    res.json({ success: true, notifiedCount: targetUserIds.length });
  } catch (e) {
    console.error('[Mentions] notify error:', e);
    res.json({ success: false, error: e.message });
  }
});

// GET /api/mentions/check - Check for new mention notifications
app.get('/api/mentions/check', requireAuth, (req, res) => {
  try {
    const userId = req.user.id;
    const since = parseInt(req.query.since) || 0;
    const workspaceId = req.query.workspaceId;
    
    const userNotifs = mentionNotifications.get(userId) || [];
    
    // Filter by workspace and timestamp
    const newMentions = userNotifs.filter(n => {
      const notifTime = new Date(n.timestamp).getTime();
      return notifTime > since && (!workspaceId || n.workspaceId === workspaceId);
    });
    
    // Clear delivered notifications
    if (newMentions.length > 0) {
      const remaining = userNotifs.filter(n => {
        const notifTime = new Date(n.timestamp).getTime();
        return notifTime <= since || (workspaceId && n.workspaceId !== workspaceId);
      });
      mentionNotifications.set(userId, remaining);
    }
    
    res.json({ success: true, mentions: newMentions });
  } catch (e) {
    res.json({ success: true, mentions: [] });
  }
});

// ===== VERSION ENDPOINT (for update popup) =====
const APP_VERSION = '60';
app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION });
});

// Serve index.html with dynamic cache-busting timestamp
app.get('/', (req, res) => {
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, 'frontend', 'index.html'), 'utf8');
  const ts = Date.now();
  html = html.replace(/\?v=\d+/g, `?v=${ts}`);
  res.set('Content-Type', 'text/html');
  res.send(html);
});
app.use(express.static(path.join(__dirname, 'frontend'), { etag: false, lastModified: false }));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/auth')) return next();
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

app.use((req, res) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'API route not found' });
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CORS origin: ${ALLOWED_ORIGIN || '(dev: all origins allowed)'}`);
  console.log(`Security: bcrypt(${BCRYPT_ROUNDS} rounds), rate-limit(5/min auth, 100/min API), helmet`);
  console.log(`Users in store: ${users.size}`);
  // Initialize database tables
  try {
    await dataStore.initDatabase();
    console.log(`Storage: ${dataStore.getStatus().type}`);
  } catch (e) {
    console.error('[Startup] Database init failed:', e.message);
  }
  // Load persisted data
  try {
    await loadUsers();
    await loadSessions();
  } catch (e) {
    console.error('[Startup] Failed to load users/sessions:', e.message);
  }
  // Load workspace data from persistent storage
  try {
    await workspaceStore.loadWorkspaces();
  } catch (e) {
    console.error('[Startup] Failed to load workspaces:', e.message);
  }
  // Load admin invites from persistent storage
  try {
    await loadAdminInvites();
  } catch (e) {
    console.error('[Startup] Failed to load admin invites:', e.message);
  }
  // Initialize snapshot system
  try {
    await snapshotStore.initSnapshotTable();
    snapshotStore.startScheduler();
  } catch (e) {
    console.error('[Startup] Failed to init snapshots:', e.message);
  }
  console.log(`Startup complete. Users: ${users.size}, Sessions: ${sessions.size}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM: closing server');
  server.close(() => process.exit(0));
});

// Prevent crash from unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err.message, err.stack);
  // Give time to log, then exit gracefully
  setTimeout(() => process.exit(1), 1000);
});
