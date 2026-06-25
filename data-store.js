/**
 * Data Store - PostgreSQL Persistent Storage
 * Stores board data, archived tasks, and column state per user in PostgreSQL.
 * Data survives code deploys, server restarts, and container rebuilds.
 * 
 * Requires DATABASE_URL environment variable (provided by Render PostgreSQL addon).
 * Falls back to file-based storage if DATABASE_URL is not set (development mode).
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// PostgreSQL connection
// Supports Render's DATABASE_URL or docker-compose individual vars
let DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL && process.env.DB_HOST) {
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT || 5432;
    const db = process.env.DB_NAME || 'project_manager';
    const user = process.env.DB_USER || 'postgres';
    const pass = process.env.DB_PASSWORD || 'postgres';
    DATABASE_URL = `postgresql://${user}:${pass}@${host}:${port}/${db}`;
}

let pool = null;
let usePostgres = false;

// File-based fallback for local development
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');

if (DATABASE_URL) {
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000
    });
    usePostgres = true;
    console.log('[DataStore] Using PostgreSQL persistent storage');
} else {
    console.log('[DataStore] No DATABASE_URL found - using file-based storage (dev mode)');
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
}

/**
 * Initialize database tables
 */
async function initDatabase() {
    if (!usePostgres) return;
    
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS user_data (
                id SERIAL PRIMARY KEY,
                user_key VARCHAR(255) NOT NULL,
                data_type VARCHAR(50) NOT NULL,
                data JSONB NOT NULL DEFAULT '{}',
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(user_key, data_type)
            );
            
            CREATE INDEX IF NOT EXISTS idx_user_data_lookup 
                ON user_data(user_key, data_type);
        `);
        console.log('[DataStore] PostgreSQL tables initialized');
    } catch (e) {
        console.error('[DataStore] Failed to init database tables:', e.message);
        // Fall back to file-based if DB init fails
        usePostgres = false;
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    }
}

/**
 * Sanitize email for use as filename (file-based fallback only)
 */
function sanitizeKey(key) {
    return key.replace(/[^a-zA-Z0-9._@-]/g, '_');
}

function getUserDataPath(userKey, dataType) {
    const safeKey = sanitizeKey(userKey);
    return path.join(DATA_DIR, `${safeKey}.${dataType}.json`);
}

/**
 * Read user data
 */
async function readUserData(userKey, dataType) {
    if (usePostgres) {
        try {
            const result = await pool.query(
                'SELECT data FROM user_data WHERE user_key = $1 AND data_type = $2',
                [userKey, dataType]
            );
            return result.rows.length > 0 ? result.rows[0].data : null;
        } catch (e) {
            console.error(`[DataStore] PG read error (${dataType}):`, e.message);
            return null;
        }
    } else {
        // File-based fallback
        const filePath = getUserDataPath(userKey, dataType);
        try {
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
        } catch (e) {
            console.error(`[DataStore] File read error (${dataType}):`, e.message);
        }
        return null;
    }
}

/**
 * Write user data
 */
async function writeUserData(userKey, dataType, data) {
    if (usePostgres) {
        try {
            await pool.query(`
                INSERT INTO user_data (user_key, data_type, data, updated_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (user_key, data_type) 
                DO UPDATE SET data = $3, updated_at = NOW()
            `, [userKey, dataType, JSON.stringify(data)]);
            return true;
        } catch (e) {
            console.error(`[DataStore] PG write error (${dataType}):`, e.message);
            return false;
        }
    } else {
        // File-based fallback
        const filePath = getUserDataPath(userKey, dataType);
        try {
            fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
            return true;
        } catch (e) {
            console.error(`[DataStore] File write error (${dataType}):`, e.message);
            return false;
        }
    }
}

/**
 * Delete user data
 */
async function deleteUserData(userKey, dataType) {
    if (usePostgres) {
        try {
            await pool.query(
                'DELETE FROM user_data WHERE user_key = $1 AND data_type = $2',
                [userKey, dataType]
            );
            return true;
        } catch (e) {
            console.error(`[DataStore] PG delete error (${dataType}):`, e.message);
            return false;
        }
    } else {
        const filePath = getUserDataPath(userKey, dataType);
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return true;
        } catch (e) { return false; }
    }
}

/**
 * List all stored data (admin/debug)
 */
async function listAllData() {
    if (usePostgres) {
        try {
            const result = await pool.query(
                'SELECT user_key, data_type, updated_at FROM user_data ORDER BY updated_at DESC'
            );
            return result.rows;
        } catch (e) { return []; }
    } else {
        try {
            return fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
        } catch (e) { return []; }
    }
}

/**
 * Get database connection status
 */
function getStatus() {
    return {
        type: usePostgres ? 'postgresql' : 'file',
        connected: usePostgres ? (pool ? true : false) : true,
        dataDir: usePostgres ? null : DATA_DIR
    };
}

module.exports = {
    initDatabase,
    readUserData,
    writeUserData,
    deleteUserData,
    listAllData,
    getStatus,
    get pool() { return pool; },
    get usePostgres() { return usePostgres; }
};
