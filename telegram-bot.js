/**
 * Telegram Bot - Due Date Notifications
 * Sends alerts when tasks are due tomorrow or overdue (status != done)
 */

const https = require('https');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

// Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '8502064849:AAFSQe5tlZXteSOy8pKX8spqyz4MqqLEKIc';
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '713355556';
const SYNC_FILE = path.join(__dirname, 'data', 'telegram-board-sync.json');

// In-memory store for synced board data
let syncedBoardData = null;
let lastSyncTime = null;

// Reference to dataStore (set externally via setDataStore)
let dataStore = null;

/**
 * Allow server.js to pass the dataStore reference for DB persistence
 */
function setDataStore(ds) {
    dataStore = ds;
}

/**
 * Persist board data to disk (and DB if available) so it survives server restarts
 */
async function persistBoardData() {
    // File-based persistence (works in dev and as fallback)
    try {
        const dir = path.dirname(SYNC_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SYNC_FILE, JSON.stringify({ boardData: syncedBoardData, lastSyncTime }, null, 2));
    } catch (e) {
        console.error('[Telegram] Failed to persist board data to file:', e.message);
    }
    
    // DB persistence (production - survives redeploys)
    if (dataStore) {
        try {
            await dataStore.writeUserData('__system__telegram', 'board_sync', { boardData: syncedBoardData, lastSyncTime });
        } catch (e) {
            console.error('[Telegram] Failed to persist board data to DB:', e.message);
        }
    }
}

/**
 * Load board data from disk/DB on startup
 */
async function loadPersistedBoardData() {
    // Try DB first (production - most reliable)
    if (dataStore) {
        try {
            const dbData = await dataStore.readUserData('__system__telegram', 'board_sync');
            if (dbData && dbData.boardData) {
                syncedBoardData = dbData.boardData;
                lastSyncTime = dbData.lastSyncTime || null;
                console.log(`[Telegram] Loaded persisted board data from DB (synced ${lastSyncTime || 'unknown time'})`);
                return;
            }
        } catch (e) {
            console.error('[Telegram] Failed to load from DB:', e.message);
        }
    }
    
    // Fallback: file-based
    try {
        if (fs.existsSync(SYNC_FILE)) {
            const raw = fs.readFileSync(SYNC_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed.boardData) {
                syncedBoardData = parsed.boardData;
                lastSyncTime = parsed.lastSyncTime || null;
                console.log(`[Telegram] Loaded persisted board data from file (synced ${lastSyncTime || 'unknown time'})`);
            }
        }
    } catch (e) {
        console.error('[Telegram] Failed to load persisted board data from file:', e.message);
    }
}

/**
 * Send a message via Telegram Bot API
 */
function sendTelegramMessage(text) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'HTML'
        });

        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${BOT_TOKEN}/sendMessage`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.ok) {
                        console.log('[Telegram] Message sent successfully');
                        resolve(result);
                    } else {
                        console.error('[Telegram] API error:', result.description);
                        reject(new Error(result.description));
                    }
                } catch (e) {
                    reject(e);
                }
            });
        });

        req.on('error', (e) => {
            console.error('[Telegram] Request error:', e.message);
            reject(e);
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Update synced board data (called from server endpoint)
 */
function updateBoardData(data) {
    syncedBoardData = data;
    lastSyncTime = new Date().toISOString();
    console.log(`[Telegram] Board data synced at ${lastSyncTime}`);
    persistBoardData(); // async, fire-and-forget
}

/**
 * Get all tasks and subtasks with due dates from board data
 */
function getAllTasksWithDueDates(boardData) {
    const tasks = [];
    
    if (!boardData || !boardData.groups) return tasks;

    for (const group of boardData.groups) {
        if (!group.tasks) continue;
        
        for (const task of group.tasks) {
            // Check main task
            if (task.dueDate && task.status !== 'done') {
                tasks.push({
                    name: task.name,
                    dueDate: task.dueDate,
                    status: task.status || '',
                    group: group.name,
                    type: 'task'
                });
            }

            // Check subtasks
            if (task.subtasks && Array.isArray(task.subtasks)) {
                for (const subtask of task.subtasks) {
                    if (subtask.dueDate && subtask.status !== 'done') {
                        tasks.push({
                            name: subtask.name,
                            dueDate: subtask.dueDate,
                            status: subtask.status || '',
                            group: group.name,
                            parentTask: task.name,
                            type: 'subtask'
                        });
                    }
                }
            }
        }
    }

    return tasks;
}

/**
 * Format status for display
 */
function formatStatus(status) {
    const statusMap = {
        'working_on_it': '🟠 Working on it',
        'stuck': '🔴 Stuck',
        'done': '✅ Done',
        '': '⚪ No status'
    };
    return statusMap[status] || `⚪ ${status}`;
}

/**
 * Check tasks and send notifications
 */
async function checkAndNotify() {
    if (!syncedBoardData) {
        console.log('[Telegram] No board data synced yet, skipping check');
        return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const tasks = getAllTasksWithDueDates(syncedBoardData);
    
    const overdueTasks = [];
    const dueTomorrowTasks = [];

    for (const task of tasks) {
        const dueDate = new Date(task.dueDate);
        dueDate.setHours(0, 0, 0, 0);

        if (dueDate < today) {
            overdueTasks.push(task);
        } else if (dueDate.getTime() === tomorrow.getTime()) {
            dueTomorrowTasks.push(task);
        }
    }

    // Send overdue notification
    if (overdueTasks.length > 0) {
        let message = `🔴 <b>משימות באיחור (${overdueTasks.length})</b>\n\n`;
        
        for (const task of overdueTasks) {
            const typeIcon = task.type === 'subtask' ? '↳' : '📋';
            message += `${typeIcon} <b>${task.name}</b>\n`;
            message += `   📅 Due: ${task.dueDate}\n`;
            message += `   ${formatStatus(task.status)}\n`;
            message += `   📁 ${task.group}`;
            if (task.parentTask) message += ` → ${task.parentTask}`;
            message += '\n\n';
        }

        try {
            await sendTelegramMessage(message);
        } catch (e) {
            console.error('[Telegram] Failed to send overdue notification:', e.message);
        }
    }

    // Send due tomorrow notification
    if (dueTomorrowTasks.length > 0) {
        let message = `🟡 <b>משימות ל-מחר (${dueTomorrowTasks.length})</b>\n\n`;
        
        for (const task of dueTomorrowTasks) {
            const typeIcon = task.type === 'subtask' ? '↳' : '📋';
            message += `${typeIcon} <b>${task.name}</b>\n`;
            message += `   📅 Due: ${task.dueDate}\n`;
            message += `   ${formatStatus(task.status)}\n`;
            message += `   📁 ${task.group}`;
            if (task.parentTask) message += ` → ${task.parentTask}`;
            message += '\n\n';
        }

        try {
            await sendTelegramMessage(message);
        } catch (e) {
            console.error('[Telegram] Failed to send tomorrow notification:', e.message);
        }
    }

    if (overdueTasks.length === 0 && dueTomorrowTasks.length === 0) {
        console.log('[Telegram] No overdue or due-tomorrow tasks found');
    }
}

/**
 * Initialize the cron scheduler
 * Runs every day at 08:00 AM Israel time
 */
function initScheduler() {
    // Load persisted board data on startup (async)
    loadPersistedBoardData();
    
    // Run at 08:00 every day (Israel timezone UTC+3)
    cron.schedule('0 8 * * *', () => {
        console.log('[Telegram] Running daily due-date check...');
        checkAndNotify();
    }, {
        timezone: 'Asia/Jerusalem'
    });

    console.log('[Telegram] Scheduler initialized - daily check at 08:00 (Israel time)');
}

/**
 * Manual trigger for testing
 */
async function triggerCheck() {
    console.log('[Telegram] Manual check triggered');
    await checkAndNotify();
}

module.exports = {
    updateBoardData,
    initScheduler,
    triggerCheck,
    sendTelegramMessage,
    setDataStore,
    getSyncStatus: () => ({ lastSyncTime, hasBoardData: !!syncedBoardData })
};
