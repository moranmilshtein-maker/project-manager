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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== SECURITY: HTTPS enforcement in production =====
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
});

// Prevent caching of JS/CSS files during development
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css')) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
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

// Session store: token -> userKey (email:provider)
const sessions = new Map();

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

    const token = generateToken();
    sessions.set(token, key);

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

    const token = generateToken();
    sessions.set(token, key);

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
    return res.status(401).json({ error: 'User not found' });
  }

  res.json({ user: safeUser(user) });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  sessions.delete(token);
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

  const token = generateToken();
  sessions.set(token, key);

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
app.post('/api/auth/invite', (req, res) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const callerKey = sessions.get(token);
  if (!callerKey) return res.status(401).json({ error: 'Not authenticated' });

  const caller = users.get(callerKey);
  if (!caller || !['super_admin', 'admin'].includes(caller.role)) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  const { emails, role, message } = req.body;
  if (!emails || !Array.isArray(emails)) {
    return res.status(400).json({ error: 'Emails array is required' });
  }

  // Invited users can only be admin, member, or viewer — NEVER super_admin
  const safeRole = ['admin', 'member', 'viewer'].includes(role) ? role : 'member';

  const invited = [];
  const skipped = [];

  emails.forEach(rawEmail => {
    const email = (rawEmail || '').toLowerCase().trim();
    if (!email) return;
    
    const key = userKey(email, 'invited');
    // Check if this email already exists in ANY provider
    const existingUser = findUserByEmail(email);
    if (existingUser) {
      skipped.push(email);
      return;
    }

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
  });

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

app.use(express.static(path.join(__dirname, 'frontend')));

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

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CORS origin: ${ALLOWED_ORIGIN || '(dev: all origins allowed)'}`);
  console.log(`Security: bcrypt(${BCRYPT_ROUNDS} rounds), rate-limit(5/min auth, 100/min API), helmet`);
  console.log(`Users in store: ${users.size}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM: closing server');
  server.close(() => process.exit(0));
});
