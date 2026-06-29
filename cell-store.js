/**
 * Cell Store - Normalized Database for Cell-Level Granular Saves
 * 
 * Replaces the JSON-blob approach with individual rows per group/task/subtask.
 * Enables atomic cell-level updates without read-modify-write race conditions.
 * 
 * Tables:
 *   boards        - Board metadata (id, workspace_id, name, position)
 *   board_groups  - Groups within boards (id, board_id, name, color, position, collapsed)
 *   tasks         - Individual tasks (id, group_id, name, owner, status, dueDate, priority, notes, budget, files, timeline*, position)
 *   subtasks      - Subtasks within tasks (id, task_id, name, owner, status, dueDate, priority, notes, position)
 */

const dataStore = require('./data-store');

// Get the pg pool from data-store
function getPool() {
    return dataStore.pool;
}

function isPostgres() {
    return dataStore.usePostgres;
}

// ===== SCHEMA INITIALIZATION =====
async function initCellStore() {
    const pool = getPool();
    if (!pool) {
        console.log('[CellStore] No PostgreSQL pool - cell store disabled');
        return false;
    }

    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS boards (
                id VARCHAR(100) NOT NULL,
                workspace_id VARCHAR(100) NOT NULL,
                name VARCHAR(500) DEFAULT 'Main Board',
                position INTEGER DEFAULT 0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (id, workspace_id)
            );

            CREATE TABLE IF NOT EXISTS board_groups (
                id VARCHAR(100) NOT NULL,
                board_id VARCHAR(100) NOT NULL,
                workspace_id VARCHAR(100) NOT NULL,
                name VARCHAR(500) DEFAULT 'New Group',
                color VARCHAR(20) DEFAULT '#579bfc',
                position INTEGER DEFAULT 0,
                collapsed BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (id, workspace_id)
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id VARCHAR(100) NOT NULL,
                group_id VARCHAR(100) NOT NULL,
                board_id VARCHAR(100) NOT NULL,
                workspace_id VARCHAR(100) NOT NULL,
                name VARCHAR(1000) DEFAULT 'New Task',
                owner VARCHAR(500) DEFAULT '',
                status VARCHAR(100) DEFAULT '',
                due_date VARCHAR(50) DEFAULT '',
                priority VARCHAR(50) DEFAULT '',
                notes TEXT DEFAULT '',
                budget NUMERIC DEFAULT 0,
                files INTEGER DEFAULT 0,
                timeline_start VARCHAR(50) DEFAULT '',
                timeline_end VARCHAR(50) DEFAULT '',
                position INTEGER DEFAULT 0,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_updated_by VARCHAR(500) DEFAULT '',
                subtasks_expanded BOOLEAN DEFAULT false,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (id, workspace_id)
            );

            CREATE TABLE IF NOT EXISTS subtasks (
                id VARCHAR(100) NOT NULL,
                task_id VARCHAR(100) NOT NULL,
                group_id VARCHAR(100) NOT NULL,
                board_id VARCHAR(100) NOT NULL,
                workspace_id VARCHAR(100) NOT NULL,
                name VARCHAR(1000) DEFAULT 'New Subtask',
                owner VARCHAR(500) DEFAULT '',
                status VARCHAR(100) DEFAULT '',
                due_date VARCHAR(50) DEFAULT '',
                priority VARCHAR(50) DEFAULT '',
                notes TEXT DEFAULT '',
                position INTEGER DEFAULT 0,
                last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                last_updated_by VARCHAR(500) DEFAULT '',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                PRIMARY KEY (id, workspace_id)
            );

            CREATE INDEX IF NOT EXISTS idx_board_groups_board ON board_groups(board_id, workspace_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(group_id, workspace_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_board ON tasks(board_id, workspace_id);
            CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id, workspace_id);
        `);
        console.log('[CellStore] Normalized tables initialized');
        return true;
    } catch (e) {
        console.error('[CellStore] Failed to init tables:', e.message);
        return false;
    }
}

// ===== MIGRATION: JSON blob → Normalized tables =====
async function migrateWorkspaceToNormalized(workspaceId) {
    const pool = getPool();
    if (!pool) return false;

    const sharedKey = `workspace_shared_${workspaceId}`;
    const blobData = await dataStore.readUserData(sharedKey, 'boards');
    if (!blobData || !blobData.boardGroups) {
        console.log(`[CellStore] No blob data to migrate for workspace ${workspaceId}`);
        return false;
    }

    // Check if already migrated (has data in normalized tables)
    const existingCheck = await pool.query(
        'SELECT COUNT(*) as cnt FROM tasks WHERE workspace_id = $1', [workspaceId]
    );
    if (parseInt(existingCheck.rows[0].cnt) > 0) {
        console.log(`[CellStore] Workspace ${workspaceId} already has normalized data, skipping migration`);
        return true;
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const boards = blobData.boards || [];
        const boardGroups = blobData.boardGroups || {};

        // Insert boards
        for (let bi = 0; bi < boards.length; bi++) {
            const board = boards[bi];
            await client.query(`
                INSERT INTO boards (id, workspace_id, name, position)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id, workspace_id) DO NOTHING
            `, [board.id, workspaceId, board.name || 'Board', bi]);
        }

        // Insert groups and tasks
        for (const [boardId, groups] of Object.entries(boardGroups)) {
            if (!Array.isArray(groups)) continue;

            // Ensure board exists
            await client.query(`
                INSERT INTO boards (id, workspace_id, name, position)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id, workspace_id) DO NOTHING
            `, [boardId, workspaceId, 'Board', 0]);

            for (let gi = 0; gi < groups.length; gi++) {
                const group = groups[gi];
                await client.query(`
                    INSERT INTO board_groups (id, board_id, workspace_id, name, color, position, collapsed)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (id, workspace_id) DO NOTHING
                `, [group.id, boardId, workspaceId, group.name || 'Group', group.color || '#579bfc', gi, group.collapsed || false]);

                const tasks = group.tasks || [];
                for (let ti = 0; ti < tasks.length; ti++) {
                    const task = tasks[ti];
                    await client.query(`
                        INSERT INTO tasks (id, group_id, board_id, workspace_id, name, owner, status, due_date, priority, notes, budget, files, timeline_start, timeline_end, position, last_updated, last_updated_by, subtasks_expanded)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
                        ON CONFLICT (id, workspace_id) DO NOTHING
                    `, [
                        task.id, group.id, boardId, workspaceId,
                        task.name || '', task.owner || '', task.status || '',
                        task.dueDate || '', task.priority || '', task.notes || '',
                        task.budget || 0, task.files || 0,
                        task.timelineStart || '', task.timelineEnd || '',
                        ti, task.lastUpdated || new Date().toISOString(),
                        task.lastUpdatedBy || '', task.subtasksExpanded || false
                    ]);

                    // Insert subtasks
                    const subtasks = task.subtasks || [];
                    for (let si = 0; si < subtasks.length; si++) {
                        const sub = subtasks[si];
                        await client.query(`
                            INSERT INTO subtasks (id, task_id, group_id, board_id, workspace_id, name, owner, status, due_date, priority, notes, position, last_updated, last_updated_by)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                            ON CONFLICT (id, workspace_id) DO NOTHING
                        `, [
                            sub.id, task.id, group.id, boardId, workspaceId,
                            sub.name || '', sub.owner || '', sub.status || '',
                            sub.dueDate || '', sub.priority || '', sub.notes || '',
                            si, sub.lastUpdated || new Date().toISOString(),
                            sub.lastUpdatedBy || ''
                        ]);
                    }
                }
            }
        }

        await client.query('COMMIT');
        console.log(`[CellStore] Migrated workspace ${workspaceId} to normalized tables`);
        return true;
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(`[CellStore] Migration failed for workspace ${workspaceId}:`, e.message);
        return false;
    } finally {
        client.release();
    }
}

// ===== CELL-LEVEL PATCH =====
// Updates a single field on a task, subtask, or group
async function patchCell({ workspaceId, boardId, groupId, taskId, subtaskId, field, value, userId, userName }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    const now = new Date().toISOString();

    try {
        if (subtaskId) {
            // Subtask field update
            const colMap = {
                name: 'name', owner: 'owner', status: 'status',
                dueDate: 'due_date', priority: 'priority', notes: 'notes'
            };
            const col = colMap[field];
            if (!col) return { success: false, error: `Invalid subtask field: ${field}` };

            await pool.query(`
                UPDATE subtasks SET ${col} = $1, last_updated = $2, last_updated_by = $3
                WHERE id = $4 AND workspace_id = $5
            `, [value, now, userName || '', subtaskId, workspaceId]);

        } else if (taskId) {
            // Task field update
            const colMap = {
                name: 'name', owner: 'owner', status: 'status',
                dueDate: 'due_date', priority: 'priority', notes: 'notes',
                budget: 'budget', files: 'files',
                timelineStart: 'timeline_start', timelineEnd: 'timeline_end',
                subtasksExpanded: 'subtasks_expanded'
            };
            const col = colMap[field];
            if (!col) return { success: false, error: `Invalid task field: ${field}` };

            // Type conversion for numeric/boolean fields
            let dbValue = value;
            if (field === 'budget') dbValue = parseFloat(value) || 0;
            if (field === 'files') dbValue = parseInt(value) || 0;
            if (field === 'subtasksExpanded') dbValue = value === true || value === 'true';

            await pool.query(`
                UPDATE tasks SET ${col} = $1, last_updated = $2, last_updated_by = $3
                WHERE id = $4 AND workspace_id = $5
            `, [dbValue, now, userName || '', taskId, workspaceId]);

        } else if (groupId) {
            // Group field update
            const colMap = { name: 'name', color: 'color', collapsed: 'collapsed' };
            const col = colMap[field];
            if (!col) return { success: false, error: `Invalid group field: ${field}` };

            let dbValue = value;
            if (field === 'collapsed') dbValue = value === true || value === 'true';

            await pool.query(`
                UPDATE board_groups SET ${col} = $1, updated_at = $2
                WHERE id = $3 AND workspace_id = $4
            `, [dbValue, now, groupId, workspaceId]);
        } else {
            return { success: false, error: 'Must specify groupId, taskId, or subtaskId' };
        }

        return { success: true, timestamp: now };
    } catch (e) {
        console.error('[CellStore] patchCell error:', e.message);
        return { success: false, error: e.message };
    }
}

// ===== STRUCTURAL OPERATIONS =====

async function createTask({ workspaceId, boardId, groupId, task, position }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        // If no position specified, add at end
        if (position === undefined || position === null) {
            const countRes = await pool.query(
                'SELECT COUNT(*) as cnt FROM tasks WHERE group_id = $1 AND workspace_id = $2',
                [groupId, workspaceId]
            );
            position = parseInt(countRes.rows[0].cnt);
        }

        await pool.query(`
            INSERT INTO tasks (id, group_id, board_id, workspace_id, name, owner, status, due_date, priority, notes, budget, files, timeline_start, timeline_end, position, last_updated, last_updated_by, subtasks_expanded)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        `, [
            task.id, groupId, boardId, workspaceId,
            task.name || 'New Task', task.owner || '', task.status || '',
            task.dueDate || '', task.priority || '', task.notes || '',
            task.budget || 0, task.files || 0,
            task.timelineStart || '', task.timelineEnd || '',
            position, task.lastUpdated || new Date().toISOString(),
            task.lastUpdatedBy || '', task.subtasksExpanded || false
        ]);

        return { success: true, task: { ...task, position } };
    } catch (e) {
        console.error('[CellStore] createTask error:', e.message);
        return { success: false, error: e.message };
    }
}

async function deleteTask({ workspaceId, taskId }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        // Delete subtasks first
        await pool.query('DELETE FROM subtasks WHERE task_id = $1 AND workspace_id = $2', [taskId, workspaceId]);
        // Delete task
        await pool.query('DELETE FROM tasks WHERE id = $1 AND workspace_id = $2', [taskId, workspaceId]);
        return { success: true };
    } catch (e) {
        console.error('[CellStore] deleteTask error:', e.message);
        return { success: false, error: e.message };
    }
}

async function moveTask({ workspaceId, taskId, fromGroupId, toGroupId, newPosition }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        // Update the task's group and position
        await pool.query(`
            UPDATE tasks SET group_id = $1, position = $2, last_updated = NOW()
            WHERE id = $3 AND workspace_id = $4
        `, [toGroupId, newPosition, taskId, workspaceId]);

        // Also update subtasks' group_id
        await pool.query(`
            UPDATE subtasks SET group_id = $1 WHERE task_id = $2 AND workspace_id = $3
        `, [toGroupId, taskId, workspaceId]);

        // Reindex positions in both groups
        await reindexGroupTasks(workspaceId, fromGroupId);
        if (fromGroupId !== toGroupId) {
            await reindexGroupTasks(workspaceId, toGroupId);
        }

        return { success: true };
    } catch (e) {
        console.error('[CellStore] moveTask error:', e.message);
        return { success: false, error: e.message };
    }
}

async function reindexGroupTasks(workspaceId, groupId) {
    const pool = getPool();
    if (!pool) return;

    const tasks = await pool.query(
        'SELECT id FROM tasks WHERE group_id = $1 AND workspace_id = $2 ORDER BY position',
        [groupId, workspaceId]
    );
    for (let i = 0; i < tasks.rows.length; i++) {
        await pool.query(
            'UPDATE tasks SET position = $1 WHERE id = $2 AND workspace_id = $3',
            [i, tasks.rows[i].id, workspaceId]
        );
    }
}

async function createGroup({ workspaceId, boardId, group, position }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        if (position === undefined || position === null) {
            const countRes = await pool.query(
                'SELECT COUNT(*) as cnt FROM board_groups WHERE board_id = $1 AND workspace_id = $2',
                [boardId, workspaceId]
            );
            position = parseInt(countRes.rows[0].cnt);
        }

        await pool.query(`
            INSERT INTO board_groups (id, board_id, workspace_id, name, color, position, collapsed)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [group.id, boardId, workspaceId, group.name || 'New Group', group.color || '#579bfc', position, group.collapsed || false]);

        return { success: true, group: { ...group, position } };
    } catch (e) {
        console.error('[CellStore] createGroup error:', e.message);
        return { success: false, error: e.message };
    }
}

async function deleteGroup({ workspaceId, groupId }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        // Delete all subtasks in this group
        await pool.query('DELETE FROM subtasks WHERE group_id = $1 AND workspace_id = $2', [groupId, workspaceId]);
        // Delete all tasks in this group
        await pool.query('DELETE FROM tasks WHERE group_id = $1 AND workspace_id = $2', [groupId, workspaceId]);
        // Delete the group
        await pool.query('DELETE FROM board_groups WHERE id = $1 AND workspace_id = $2', [groupId, workspaceId]);
        return { success: true };
    } catch (e) {
        console.error('[CellStore] deleteGroup error:', e.message);
        return { success: false, error: e.message };
    }
}

async function createSubtask({ workspaceId, boardId, groupId, taskId, subtask, position }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        if (position === undefined || position === null) {
            const countRes = await pool.query(
                'SELECT COUNT(*) as cnt FROM subtasks WHERE task_id = $1 AND workspace_id = $2',
                [taskId, workspaceId]
            );
            position = parseInt(countRes.rows[0].cnt);
        }

        await pool.query(`
            INSERT INTO subtasks (id, task_id, group_id, board_id, workspace_id, name, owner, status, due_date, priority, notes, position, last_updated, last_updated_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `, [
            subtask.id, taskId, groupId, boardId, workspaceId,
            subtask.name || 'New Subtask', subtask.owner || '', subtask.status || '',
            subtask.dueDate || '', subtask.priority || '', subtask.notes || '',
            position, subtask.lastUpdated || new Date().toISOString(),
            subtask.lastUpdatedBy || ''
        ]);

        return { success: true, subtask: { ...subtask, position } };
    } catch (e) {
        console.error('[CellStore] createSubtask error:', e.message);
        return { success: false, error: e.message };
    }
}

async function deleteSubtask({ workspaceId, subtaskId }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        await pool.query('DELETE FROM subtasks WHERE id = $1 AND workspace_id = $2', [subtaskId, workspaceId]);
        return { success: true };
    } catch (e) {
        console.error('[CellStore] deleteSubtask error:', e.message);
        return { success: false, error: e.message };
    }
}

// ===== READ: Load full board from normalized tables (for initial load) =====
async function loadWorkspaceBoard(workspaceId) {
    const pool = getPool();
    if (!pool) return null;

    try {
        // Load boards
        const boardsRes = await pool.query(
            'SELECT * FROM boards WHERE workspace_id = $1 ORDER BY position', [workspaceId]
        );
        if (boardsRes.rows.length === 0) return null;

        const boards = boardsRes.rows.map(b => ({ id: b.id, name: b.name }));

        // Load groups
        const groupsRes = await pool.query(
            'SELECT * FROM board_groups WHERE workspace_id = $1 ORDER BY position', [workspaceId]
        );

        // Load all tasks
        const tasksRes = await pool.query(
            'SELECT * FROM tasks WHERE workspace_id = $1 ORDER BY position', [workspaceId]
        );

        // Load all subtasks
        const subtasksRes = await pool.query(
            'SELECT * FROM subtasks WHERE workspace_id = $1 ORDER BY position', [workspaceId]
        );

        // Build subtask map: taskId -> [subtask, ...]
        const subtaskMap = {};
        for (const row of subtasksRes.rows) {
            if (!subtaskMap[row.task_id]) subtaskMap[row.task_id] = [];
            subtaskMap[row.task_id].push({
                id: row.id,
                name: row.name,
                owner: row.owner || '',
                status: row.status || '',
                dueDate: row.due_date || '',
                priority: row.priority || '',
                notes: row.notes || '',
                lastUpdated: row.last_updated ? row.last_updated.toISOString() : '',
                lastUpdatedBy: row.last_updated_by || ''
            });
        }

        // Build task map: groupId -> [task, ...]
        const taskMap = {};
        for (const row of tasksRes.rows) {
            if (!taskMap[row.group_id]) taskMap[row.group_id] = [];
            taskMap[row.group_id].push({
                id: row.id,
                name: row.name,
                owner: row.owner || '',
                status: row.status || '',
                dueDate: row.due_date || '',
                priority: row.priority || '',
                notes: row.notes || '',
                budget: parseFloat(row.budget) || 0,
                files: parseInt(row.files) || 0,
                timelineStart: row.timeline_start || '',
                timelineEnd: row.timeline_end || '',
                lastUpdated: row.last_updated ? row.last_updated.toISOString() : '',
                lastUpdatedBy: row.last_updated_by || '',
                subtasksExpanded: row.subtasks_expanded || false,
                subtasks: subtaskMap[row.id] || []
            });
        }

        // Build boardGroups: boardId -> [group with tasks, ...]
        const boardGroups = {};
        for (const row of groupsRes.rows) {
            if (!boardGroups[row.board_id]) boardGroups[row.board_id] = [];
            boardGroups[row.board_id].push({
                id: row.id,
                name: row.name,
                color: row.color || '#579bfc',
                collapsed: row.collapsed || false,
                tasks: taskMap[row.id] || []
            });
        }

        // Determine active board
        const activeBoard = boards[0]?.id || null;

        return {
            boards,
            boardGroups,
            activeBoard,
            groups: boardGroups[activeBoard] || [],
            _savedAt: new Date().toISOString(),
            _cellStore: true // Flag indicating data comes from normalized store
        };
    } catch (e) {
        console.error('[CellStore] loadWorkspaceBoard error:', e.message);
        return null;
    }
}

// ===== CHECK: Does this workspace have normalized data? =====
async function isWorkspaceNormalized(workspaceId) {
    const pool = getPool();
    if (!pool) return false;

    try {
        const res = await pool.query(
            'SELECT COUNT(*) as cnt FROM boards WHERE workspace_id = $1', [workspaceId]
        );
        return parseInt(res.rows[0].cnt) > 0;
    } catch (e) {
        return false;
    }
}

// ===== REORDER =====
async function reorderTasks({ workspaceId, groupId, taskIds }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        for (let i = 0; i < taskIds.length; i++) {
            await pool.query(
                'UPDATE tasks SET position = $1 WHERE id = $2 AND workspace_id = $3',
                [i, taskIds[i], workspaceId]
            );
        }
        return { success: true };
    } catch (e) {
        console.error('[CellStore] reorderTasks error:', e.message);
        return { success: false, error: e.message };
    }
}

async function reorderGroups({ workspaceId, boardId, groupIds }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        for (let i = 0; i < groupIds.length; i++) {
            await pool.query(
                'UPDATE board_groups SET position = $1 WHERE id = $2 AND workspace_id = $3',
                [i, groupIds[i], workspaceId]
            );
        }
        return { success: true };
    } catch (e) {
        console.error('[CellStore] reorderGroups error:', e.message);
        return { success: false, error: e.message };
    }
}

async function reorderSubtasks({ workspaceId, taskId, subtaskIds }) {
    const pool = getPool();
    if (!pool) return { success: false, error: 'No database' };

    try {
        for (let i = 0; i < subtaskIds.length; i++) {
            await pool.query(
                'UPDATE subtasks SET position = $1 WHERE id = $2 AND workspace_id = $3',
                [i, subtaskIds[i], workspaceId]
            );
        }
        return { success: true };
    } catch (e) {
        console.error('[CellStore] reorderSubtasks error:', e.message);
        return { success: false, error: e.message };
    }
}

module.exports = {
    initCellStore,
    migrateWorkspaceToNormalized,
    isWorkspaceNormalized,
    loadWorkspaceBoard,
    patchCell,
    createTask,
    deleteTask,
    moveTask,
    createGroup,
    deleteGroup,
    createSubtask,
    deleteSubtask,
    reorderTasks,
    reorderGroups,
    reorderSubtasks
};
