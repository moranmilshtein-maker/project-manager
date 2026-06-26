/**
 * Snapshot Store - Automatic Backup System
 * 
 * Creates hourly snapshots of ALL user data stored in PostgreSQL.
 * Snapshots are stored in a dedicated 'snapshots' table that is NEVER
 * touched by normal operations — only by this module.
 * 
 * Key guarantees:
 * - Snapshots survive deploys, crashes, container rebuilds
 * - New snapshot replaces old ONLY after validation passes
 * - If validation fails, the previous snapshot remains intact
 * - Super admin only: view, create, restore snapshots
 * 
 * Storage: PostgreSQL table 'data_snapshots' with columns:
 *   - id: SERIAL PRIMARY KEY
 *   - snapshot_data: JSONB (all user data)
 *   - user_count: INT (number of users in snapshot)
 *   - data_size_bytes: INT (approximate size)
 *   - created_at: TIMESTAMP
 *   - status: VARCHAR ('valid', 'creating', 'invalid')
 *   - metadata: JSONB (extra info: version, trigger reason, etc.)
 */

const { Pool } = require('pg');

// Use same DATABASE_URL as data-store
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
let initialized = false;

if (DATABASE_URL) {
    pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 3, // Separate pool, minimal connections for snapshot ops
        idleTimeoutMillis: 60000,
        connectionTimeoutMillis: 10000
    });
}

// Snapshot interval: 1 hour
const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;
let snapshotTimer = null;

/**
 * Initialize the snapshots table
 */
async function initSnapshotTable() {
    if (!pool) {
        console.log('[Snapshot] No database - snapshots disabled');
        return false;
    }
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS data_snapshots (
                id SERIAL PRIMARY KEY,
                snapshot_data JSONB NOT NULL DEFAULT '{}',
                user_count INTEGER NOT NULL DEFAULT 0,
                data_size_bytes INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                status VARCHAR(20) NOT NULL DEFAULT 'creating',
                metadata JSONB DEFAULT '{}'
            );
            
            CREATE INDEX IF NOT EXISTS idx_snapshots_status 
                ON data_snapshots(status, created_at DESC);
        `);
        initialized = true;
        console.log('[Snapshot] Table initialized');
        return true;
    } catch (e) {
        console.error('[Snapshot] Failed to init table:', e.message);
        return false;
    }
}

/**
 * Create a new snapshot of all user data
 * Process:
 * 1. Read ALL data from user_data table
 * 2. Package into snapshot object
 * 3. Validate the snapshot (not empty, valid JSON, reasonable size)
 * 4. Write to snapshots table with status='creating'
 * 5. Validate written data by re-reading
 * 6. Mark as 'valid'
 * 7. Delete old valid snapshots (keep only the latest valid one)
 * 
 * @param {string} trigger - What triggered this snapshot ('auto', 'manual')
 * @returns {object} Result with success flag and snapshot info
 */
async function createSnapshot(trigger = 'auto') {
    if (!pool || !initialized) {
        return { success: false, error: 'Snapshot system not initialized' };
    }

    console.log(`[Snapshot] Creating snapshot (trigger: ${trigger})...`);

    try {
        // Step 1: Read ALL user data
        const dataResult = await pool.query(
            'SELECT user_key, data_type, data, updated_at FROM user_data ORDER BY user_key, data_type'
        );

        if (dataResult.rows.length === 0) {
            console.log('[Snapshot] No data to snapshot');
            return { success: false, error: 'No data to snapshot' };
        }

        // Step 2: Package into structured snapshot
        const snapshotData = {};
        const userKeys = new Set();

        for (const row of dataResult.rows) {
            const key = row.user_key;
            userKeys.add(key);
            if (!snapshotData[key]) snapshotData[key] = {};
            snapshotData[key][row.data_type] = {
                data: row.data,
                updated_at: row.updated_at
            };
        }

        const userCount = userKeys.size;
        const snapshotJson = JSON.stringify(snapshotData);
        const dataSizeBytes = Buffer.byteLength(snapshotJson, 'utf8');

        // Step 3: Validate snapshot
        if (userCount === 0) {
            console.warn('[Snapshot] Validation failed: 0 users');
            return { success: false, error: 'Validation failed: empty snapshot' };
        }

        // Verify JSON is parseable
        try {
            JSON.parse(snapshotJson);
        } catch (e) {
            console.error('[Snapshot] Validation failed: invalid JSON');
            return { success: false, error: 'Validation failed: invalid JSON' };
        }

        // Step 4: Write to database with status='creating'
        const metadata = {
            trigger,
            version: process.env.APP_VERSION || 'unknown',
            timestamp: new Date().toISOString(),
            rowCount: dataResult.rows.length
        };

        const insertResult = await pool.query(`
            INSERT INTO data_snapshots (snapshot_data, user_count, data_size_bytes, status, metadata)
            VALUES ($1::jsonb, $2, $3, 'creating', $4::jsonb)
            RETURNING id, created_at
        `, [snapshotJson, userCount, dataSizeBytes, JSON.stringify(metadata)]);

        const newSnapshotId = insertResult.rows[0].id;
        const createdAt = insertResult.rows[0].created_at;

        // Step 5: Re-read and validate what was written
        const verifyResult = await pool.query(
            'SELECT user_count, data_size_bytes, status FROM data_snapshots WHERE id = $1',
            [newSnapshotId]
        );

        if (verifyResult.rows.length === 0) {
            console.error('[Snapshot] Verification failed: snapshot not found after insert');
            return { success: false, error: 'Verification failed' };
        }

        const written = verifyResult.rows[0];
        if (written.user_count !== userCount || written.data_size_bytes !== dataSizeBytes) {
            // Mark as invalid
            await pool.query("UPDATE data_snapshots SET status = 'invalid' WHERE id = $1", [newSnapshotId]);
            console.error('[Snapshot] Verification failed: data mismatch');
            return { success: false, error: 'Verification failed: data mismatch' };
        }

        // Step 6: Mark as valid
        await pool.query("UPDATE data_snapshots SET status = 'valid' WHERE id = $1", [newSnapshotId]);

        // Step 7: Delete old valid snapshots (keep only the latest 12 valid ones = 12 hours of history)
        await pool.query(`
            DELETE FROM data_snapshots 
            WHERE status = 'valid' 
            AND id NOT IN (
                SELECT id FROM data_snapshots 
                WHERE status = 'valid' 
                ORDER BY created_at DESC 
                LIMIT 12
            )
        `);

        // Also clean up any old 'creating' or 'invalid' entries older than 24h
        await pool.query(`
            DELETE FROM data_snapshots 
            WHERE status IN ('creating', 'invalid') 
            AND created_at < NOW() - INTERVAL '24 hours'
        `);

        console.log(`[Snapshot] ✓ Created snapshot #${newSnapshotId}: ${userCount} users, ${(dataSizeBytes / 1024).toFixed(1)}KB`);

        return {
            success: true,
            snapshot: {
                id: newSnapshotId,
                userCount,
                dataSizeBytes,
                createdAt,
                trigger
            }
        };
    } catch (e) {
        console.error('[Snapshot] Error creating snapshot:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Get the latest valid snapshot info (without full data)
 */
async function getLatestSnapshotInfo() {
    if (!pool || !initialized) return null;
    try {
        const result = await pool.query(`
            SELECT id, user_count, data_size_bytes, created_at, status, metadata
            FROM data_snapshots 
            WHERE status = 'valid'
            ORDER BY created_at DESC 
            LIMIT 1
        `);
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (e) {
        console.error('[Snapshot] Error getting latest info:', e.message);
        return null;
    }
}

/**
 * Get list of all valid snapshots (without data, just metadata)
 */
async function listSnapshots() {
    if (!pool || !initialized) return [];
    try {
        const result = await pool.query(`
            SELECT id, user_count, data_size_bytes, created_at, status, metadata
            FROM data_snapshots 
            WHERE status = 'valid'
            ORDER BY created_at DESC 
            LIMIT 12
        `);
        return result.rows;
    } catch (e) {
        console.error('[Snapshot] Error listing snapshots:', e.message);
        return [];
    }
}

/**
 * Restore data from a specific snapshot
 * This replaces ALL user_data with the snapshot data
 * 
 * @param {number} snapshotId - The snapshot ID to restore from
 * @returns {object} Result with success flag
 */
async function restoreFromSnapshot(snapshotId) {
    if (!pool || !initialized) {
        return { success: false, error: 'Snapshot system not initialized' };
    }

    try {
        // Get the snapshot data
        const result = await pool.query(
            'SELECT snapshot_data, user_count, status FROM data_snapshots WHERE id = $1',
            [snapshotId]
        );

        if (result.rows.length === 0) {
            return { success: false, error: 'Snapshot not found' };
        }

        const snapshot = result.rows[0];
        if (snapshot.status !== 'valid') {
            return { success: false, error: 'Snapshot is not valid' };
        }

        const snapshotData = snapshot.snapshot_data;

        // Create a pre-restore snapshot first (backup before restore)
        console.log('[Snapshot] Creating pre-restore backup...');
        const preBackup = await createSnapshot('pre-restore');
        if (!preBackup.success) {
            console.warn('[Snapshot] Could not create pre-restore backup, proceeding anyway');
        }

        // Restore: Replace all user_data with snapshot data
        // Use a transaction to ensure atomicity
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Clear existing user_data
            await client.query('DELETE FROM user_data');

            // Insert all data from snapshot
            let restoredRows = 0;
            for (const [userKey, dataTypes] of Object.entries(snapshotData)) {
                for (const [dataType, record] of Object.entries(dataTypes)) {
                    await client.query(`
                        INSERT INTO user_data (user_key, data_type, data, updated_at)
                        VALUES ($1, $2, $3::jsonb, $4)
                    `, [userKey, dataType, JSON.stringify(record.data), record.updated_at || new Date()]);
                    restoredRows++;
                }
            }

            await client.query('COMMIT');
            console.log(`[Snapshot] ✓ Restored ${restoredRows} records from snapshot #${snapshotId}`);

            return {
                success: true,
                restoredRows,
                userCount: Object.keys(snapshotData).length
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    } catch (e) {
        console.error('[Snapshot] Restore error:', e.message);
        return { success: false, error: e.message };
    }
}

/**
 * Get snapshot details (including data summary per user)
 */
async function getSnapshotDetails(snapshotId) {
    if (!pool || !initialized) return null;
    try {
        const result = await pool.query(
            'SELECT id, snapshot_data, user_count, data_size_bytes, created_at, status, metadata FROM data_snapshots WHERE id = $1',
            [snapshotId]
        );
        if (result.rows.length === 0) return null;

        const row = result.rows[0];
        const snapshotData = row.snapshot_data;

        // Build summary without exposing full data
        const userSummaries = {};
        for (const [userKey, dataTypes] of Object.entries(snapshotData)) {
            userSummaries[userKey] = {
                dataTypes: Object.keys(dataTypes),
                totalSize: JSON.stringify(dataTypes).length
            };

            // If boards data exists, count tasks
            if (dataTypes.boards && dataTypes.boards.data) {
                const boardsData = dataTypes.boards.data;
                let taskCount = 0;
                if (boardsData.boardGroups) {
                    for (const groups of Object.values(boardsData.boardGroups)) {
                        if (Array.isArray(groups)) {
                            for (const group of groups) {
                                if (group.tasks) taskCount += group.tasks.length;
                            }
                        }
                    }
                } else if (boardsData.groups) {
                    for (const group of boardsData.groups) {
                        if (group.tasks) taskCount += group.tasks.length;
                    }
                }
                userSummaries[userKey].taskCount = taskCount;
            }
        }

        return {
            id: row.id,
            userCount: row.user_count,
            dataSizeBytes: row.data_size_bytes,
            createdAt: row.created_at,
            status: row.status,
            metadata: row.metadata,
            userSummaries
        };
    } catch (e) {
        console.error('[Snapshot] Error getting details:', e.message);
        return null;
    }
}

/**
 * Start the automatic hourly snapshot scheduler
 */
function startScheduler() {
    if (!pool) {
        console.log('[Snapshot] No database - scheduler not started');
        return;
    }

    // Create first snapshot 5 minutes after startup (allow data to settle)
    setTimeout(async () => {
        try {
            await createSnapshot('startup');
        } catch (e) {
            console.error('[Snapshot] Startup snapshot failed:', e.message);
        }
    }, 5 * 60 * 1000);

    // Schedule hourly snapshots
    snapshotTimer = setInterval(async () => {
        try {
            await createSnapshot('auto');
        } catch (e) {
            console.error('[Snapshot] Scheduled snapshot failed:', e.message);
        }
    }, SNAPSHOT_INTERVAL_MS);

    console.log('[Snapshot] Scheduler started (every 60 minutes)');
}

/**
 * Stop the scheduler
 */
function stopScheduler() {
    if (snapshotTimer) {
        clearInterval(snapshotTimer);
        snapshotTimer = null;
    }
}

module.exports = {
    initSnapshotTable,
    createSnapshot,
    getLatestSnapshotInfo,
    listSnapshots,
    restoreFromSnapshot,
    getSnapshotDetails,
    startScheduler,
    stopScheduler
};
