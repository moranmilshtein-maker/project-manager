// ===== Monday.com Dashboard - Full Application =====
// Sprint 1.0 - Feb 19, 2026

// ===== Data Store =====
const STATUS_OPTIONS = [
    { id: 'working', label: 'Working on it', color: '#fdab3d' },
    { id: 'done', label: 'Done', color: '#00c875' },
    { id: 'stuck', label: 'Stuck', color: '#e2445c' },
    { id: 'waiting', label: 'Waiting for review', color: '#9d99b9' },
    { id: '', label: '', color: '#c4c4c4' }
];

const PRIORITY_OPTIONS = [
    { id: 'critical', label: 'Critical', color: '#333333' },
    { id: 'high', label: 'High', color: '#e2445c' },
    { id: 'medium', label: 'Medium', color: '#cab641' },
    { id: 'low', label: 'Low', color: '#579bfc' },
    { id: '', label: '', color: '#c4c4c4' }
];

const GROUP_COLORS = [
    '#784bd1', '#00c875', '#0073ea', '#e2445c', '#fdab3d', '#ff642e', '#579bfc', '#cab641', '#9d99b9'
];

const USER_ROLES = ['super_admin', 'admin', 'member', 'viewer'];
const ROLE_LABELS = {
    super_admin: 'Super Admin',
    admin: 'Admin',
    member: 'Member',
    viewer: 'Viewer'
};
const ROLE_DESCRIPTIONS = {
    admin: 'Manage users and settings',
    member: 'Create, edit and collaborate',
    viewer: 'View only, no edits (free)'
};

// ===== Auth State =====
let currentUser = null;
let authToken = null;

// Helper: Generate proper initials from full name (first letter of first name + first letter of last name)
function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
}

// Helper: Generate avatar HTML - shows picture if available, otherwise initials
function getAvatarHTML(user, size, extraClass) {
    size = size || 32;
    extraClass = extraClass || '';
    const initials = getInitials(user.fullName || user.email);
    if (user.picture) {
        return `<img src="${user.picture}" alt="${initials}" class="user-avatar user-avatar-img ${extraClass}" style="width:${size}px;height:${size}px;" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\'user-avatar user-avatar-initials ${extraClass}\' style=\'width:${size}px;height:${size}px;font-size:${Math.round(size*0.34)}px;\'>${initials}</div>'">`;
    }
    return `<div class="user-avatar user-avatar-initials ${extraClass}" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.34)}px;">${initials}</div>`;
}

// Helper: Get avatar for "Last Updated" column - shows picture or initials circle
// Uses the same style as the Owner column avatar
function getUpdatedAvatarHTML(ownerName) {
    if (!ownerName) return '';
    // Try to find member in cached workspace members by name
    const member = cachedWorkspaceMembers.find(m => 
        m.userName === ownerName || getInitials(m.userName || m.userEmail) === ownerName
    );
    const initials = getInitials(ownerName);
    if (member && member.picture) {
        return `<img src="${member.picture}" class="updated-avatar-img" title="${escapeHtml(ownerName)}" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'updated-avatar\\' title=\\'${escapeHtml(ownerName)}\\'>${initials}</div>'">`; 
    }
    return `<div class="updated-avatar" title="${escapeHtml(ownerName)}">${initials}</div>`;
}

// Auth token management - only token stored in localStorage, no passwords
function saveAuthToken() {
    try {
        if (authToken) {
            localStorage.setItem('numiAuthToken', authToken);
        } else {
            localStorage.removeItem('numiAuthToken');
        }
    } catch (e) { /* ignore */ }
}

function loadAuthToken() {
    try {
        authToken = localStorage.getItem('numiAuthToken') || null;
    } catch (e) { authToken = null; }
}

// Helper: API call with auth header
function authFetch(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    if (authToken) {
        options.headers['Authorization'] = 'Bearer ' + authToken;
    }
    if (!options.headers['Content-Type'] && options.body) {
        options.headers['Content-Type'] = 'application/json';
    }
    return fetch(url, options);
}

// ===== Generate unique ID =====
let idCounter = Date.now();
function newId() { return ++idCounter; }

// ===== Format helpers =====
function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
}

function formatTimeline(start, end) {
    if (!start || !end) return '';
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '';
    
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const startMonth = months[startDate.getMonth()];
    const endMonth = months[endDate.getMonth()];
    const startDay = startDate.getDate();
    const endDay = endDate.getDate();
    
    if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
        // Same month: "Jul 1 - 31"
        return `${startMonth} ${startDay} - ${endDay}`;
    } else {
        // Different months: "Jun 25 - Jul 31"
        return `${startMonth} ${startDay} - ${endMonth} ${endDay}`;
    }
}

// Real timestamp for lastUpdated - returns ISO string
function nowISO() {
    return new Date().toISOString();
}

// Format lastUpdated for display: shows relative time in English (Sprint 1.2 Task 8)
// Rules:
// - Less than 1 hour: show minutes only (e.g. "3 minutes")
// - 1 hour or more but less than 1 day: show hours and minutes (e.g. "2 hours 15 minutes")
// - 1 day or more: show days and hours (e.g. "3 days 5 hours")
// - Resets on every new update
function formatLastUpdated(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr; // fallback for legacy strings
    const now = new Date();
    const diffMs = now - d;
    if (diffMs < 0) return 'Just now';

    const totalMinutes = Math.floor(diffMs / 60000);
    const totalHours = Math.floor(diffMs / 3600000);
    const totalDays = Math.floor(diffMs / 86400000);

    if (totalMinutes < 1) return 'Just now';

    // Less than 1 hour: minutes only
    if (totalHours < 1) {
        return totalMinutes === 1 ? '1 minute' : `${totalMinutes} minutes`;
    }

    // Less than 1 day: hours and minutes
    if (totalDays < 1) {
        const hours = totalHours;
        const mins = totalMinutes - (hours * 60);
        const hoursLabel = hours === 1 ? '1 hour' : `${hours} hours`;
        if (mins === 0) return hoursLabel;
        return `${hoursLabel} ${mins} min`;
    }

    // 1 day or more: days and hours
    const days = totalDays;
    const hours = totalHours - (days * 24);
    const daysLabel = days === 1 ? '1 day' : `${days} days`;
    if (hours === 0) return daysLabel;
    const hoursLabel = hours === 1 ? '1 hour' : `${hours} hours`;
    return `${daysLabel} ${hoursLabel}`;
}

// Calculate days between two dates
function daysBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return Math.round((d2 - d1) / 86400000);
}

// Check if a date string is today
function isToday(dateStr) {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

// Check if a date is overdue (past and task not done)
function isOverdue(dateStr, status) {
    if (!dateStr || status === 'done') return false;
    const d = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < now;
}

// Get days overdue
function daysOverdue(dateStr) {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.floor((now - d) / 86400000);
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== Initial Board Data =====
// Each board has its own 'groups' array stored inside boardData.boardGroups[boardId]
// boardData.groups is a REFERENCE to the active board's groups (set by switchBoard)
let boardData = {
    name: '\u05E0\u05D9\u05E1\u05D9\u05D5\u05DF',
    archivedGroups: [],
    boards: [
        { id: 'board1', name: '\u05E0\u05D9\u05E1\u05D9\u05D5\u05DF', color: '#0073ea', archived: false, createdAt: null }
    ],
    activeBoard: 'board1',
    boardGroups: {
        'board1': [
            {
                id: 'g1',
                name: 'To-Do',
                color: '#784bd1',
                collapsed: false,
                tasks: []
            },
            {
                id: 'g_wolby_setup',
                name: '\u05D5\u05D5\u05DC\u05D1\u05D9 - \u05D4\u05E7\u05DE\u05D4',
                color: '#784bd1',
                collapsed: false,
                tasks: [
                    { id: 101, name: '\u05E9\u05D9\u05D5\u05DA \u05D2\u05D5\u05D2\u05DC \u05D0\u05E0\u05DC\u05D9\u05D8\u05D9\u05E7\u05E1', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 102, name: '\u05D4\u05E7\u05DE\u05EA \u05D2\u05D5\u05D2\u05DC \u05D8\u05D0\u05D2 \u05DE\u05E0\u05D2\u05F3\u05E8', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 103, name: '\u05E9\u05D9\u05D5\u05DA \u05D2\u05D5\u05D2\u05DC \u05D0\u05D3\u05E1', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 104, name: '\u05D4\u05E7\u05DE\u05EA \u05D2\u05D5\u05D2\u05DC \u05DE\u05E8\u05E6\u05F3\u05E0\u05D8', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 105, name: '\u05D4\u05E7\u05DE\u05EA \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7 \u05D1\u05D9\u05D6\u05E0\u05E1', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 106, name: '\u05D0\u05D9\u05DE\u05D5\u05EA \u05D3\u05D5\u05DE\u05D9\u05D9\u05DF \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 107, name: '\u05D7\u05D9\u05D1\u05D5\u05E8 \u05D2\u05D5\u05D2\u05DC \u05E1\u05E8\u05E6\u05F3 \u05E7\u05D5\u05E0\u05E1\u05D5\u05DC', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 108, name: '\u05D4\u05D8\u05DE\u05E2\u05EA \u05E7\u05DC\u05D0\u05E8\u05D9\u05D8\u05D9', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 109, name: '\u05D7\u05D9\u05D1\u05D5\u05E8 \u05D1\u05D5\u05E1 \u05E7\u05D5 \u05E4\u05D9\u05D9\u05DC\u05D5\u05D8', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 110, name: '\u05D4\u05E7\u05DE\u05EA \u05E2\u05E8\u05D5\u05E5 \u05D9\u05D5\u05D8\u05D9\u05D5\u05D1', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 111, name: '\u05D4\u05E7\u05DE\u05EA \u05E2\u05E8\u05D5\u05E5 \u05D8\u05D9\u05E7\u05D8\u05D5\u05E7', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 112, name: '\u05E9\u05D9\u05D5\u05DA \u05D0\u05D9\u05E0\u05E1\u05D8\u05D2\u05E8\u05DD', owner: '', status: 'done', dueDate: '2025-06-16', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 113, name: '\u05E9\u05D9\u05D5\u05DA \u05E2\u05DE\u05D5\u05D3 \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7 \u05E2\u05E1\u05E7\u05D9', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 114, name: '\u05D4\u05E7\u05DE\u05EA \u05D2\u05D5\u05D2\u05DC \u05E2\u05E1\u05E7\u05D9\u05DD', owner: '', status: 'working', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 115, name: '\u05D4\u05E7\u05DE\u05EA \u05D0\u05E4\u05DC \u05DE\u05E4\u05D5\u05EA', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 116, name: '\u05D4\u05E7\u05DE\u05EA \u05DB\u05DC\u05D9 \u05D5\u05D5\u05D1\u05DE\u05D0\u05E1\u05D8\u05E8 \u05E9\u05DC \u05D1\u05D9\u05E0\u05D2', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 117, name: '\u05D4\u05E7\u05DE\u05EA \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7 \u05DE\u05E8\u05E6\u05F3\u05E0\u05D8', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 118, name: '\u05E9\u05D9\u05DE\u05D5\u05E9 \u05D1\u05DB\u05DC\u05D9 \u05DC\u05EA\u05E7\u05E0\u05D4 13', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 119, name: '\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D3\u05E3 \u05DE\u05D3\u05D9\u05E0\u05D9\u05D5\u05EA \u05E4\u05E8\u05D8\u05D9\u05D5\u05EA', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 120, name: '\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D3\u05E3 \u05EA\u05E7\u05E0\u05D5\u05DF', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 121, name: '\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D3\u05E3 \u05DE\u05D3\u05D9\u05E0\u05D9\u05D5\u05EA \u05D4\u05D7\u05D6\u05E8\u05D9\u05DD', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 122, name: '\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D4\u05E6\u05D4\u05E8\u05EA \u05E0\u05D2\u05D9\u05E9\u05D5\u05EA', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 123, name: '\u05D4\u05EA\u05E7\u05E0\u05EA \u05E4\u05D9\u05D3 \u05D3\u05D9\u05E0\u05D0\u05DE\u05D9 \u05DC\u05D2\u05D5\u05D2\u05DC \u05D5\u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 124, name: '\u05D4\u05E7\u05DE\u05EA \u05D7\u05E9\u05D1\u05D5\u05DF \u05DE\u05D5\u05D3\u05E2\u05D5\u05EA \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 125, name: '\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05DE\u05E8\u05D4 \u05D8\u05DC\u05E4\u05D5\u05DF | \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
                    { id: 126, name: '\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05DE\u05E8\u05D4 \u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4 | \u05E7\u05D0\u05E1\u05D8\u05D5\u05DD \u05E2\u05DD \u05D8\u05D0\u05D2 \u05DE\u05E0\u05D2\u05F3\u05E8 | \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false }
                ]
            },
            {
                id: 'g2',
                name: 'Completed',
                color: '#00c875',
                collapsed: false,
                tasks: []
            }
        ]
    },
    groups: [] // Will be set by initBoardGroups()
};

// Initialize boardData.groups to point to the active board's groups
function initBoardGroups() {
    if (!boardData.boardGroups) boardData.boardGroups = {};
    // Migration: if boardData.groups has data but boardGroups doesn't have the active board, migrate
    const activeId = boardData.activeBoard || 'board1';
    if (!boardData.boardGroups[activeId] && boardData.groups && boardData.groups.length > 0) {
        boardData.boardGroups[activeId] = boardData.groups;
    }
    // Ensure all boards have a groups entry
    if (boardData.boards) {
        boardData.boards.forEach(b => {
            if (!boardData.boardGroups[b.id]) {
                boardData.boardGroups[b.id] = [];
            }
        });
    }
    // Set active groups reference
    boardData.groups = boardData.boardGroups[activeId] || [];
}

// ============================================================
// TASK 1 FIX: Robust Add Task - No More Overwriting Bug
// ============================================================
// Track active inline-add inputs so we can prevent double-fire
// and ensure new tasks never collide with existing rows
let activeAddTaskInputs = new Set();

// ============================================================
// TASK 2 & 3: Selection State (checkbox + floating bar)
// ============================================================
let selectedTasks = new Set(); // stores "groupId::taskId"
let selectedSubtasks = new Set(); // stores "groupId::taskId::subtaskId"

function getSelectedKey(groupId, taskId) {
    return `${groupId}::${taskId}`;
}

function isTaskSelected(groupId, taskId) {
    return selectedTasks.has(getSelectedKey(groupId, taskId));
}

function getSelectedTaskObjects() {
    const results = [];
    selectedTasks.forEach(key => {
        const [gid, tid] = key.split('::');
        const group = boardData.groups.find(g => g.id === gid);
        if (group) {
            const task = group.tasks.find(t => String(t.id) === tid);
            if (task) results.push({ group, task });
        }
    });
    return results;
}

function getSelectedSubtaskObjects() {
    const results = [];
    selectedSubtasks.forEach(key => {
        const parts = key.split('::');
        const [gid, tid, sid] = parts;
        const group = boardData.groups.find(g => g.id === gid);
        if (group) {
            const task = group.tasks.find(t => String(t.id) === tid);
            if (task && task.subtasks) {
                const subtask = task.subtasks.find(s => String(s.id) === sid);
                if (subtask) results.push({ group, task, subtask });
            }
        }
    });
    return results;
}

function updateFloatingBar() {
    const bar = document.getElementById('floatingBar');
    if (!bar) return;
    const taskCount = selectedTasks.size;
    const subtaskCount = selectedSubtasks.size;
    const totalCount = taskCount + subtaskCount;
    if (totalCount === 0) {
        bar.classList.remove('active');
        return;
    }
    bar.classList.add('active');
    const countEl = document.getElementById('floatingBarCount');
    if (countEl) {
        if (subtaskCount > 0 && taskCount === 0) {
            countEl.textContent = `${subtaskCount} Subitem${subtaskCount > 1 ? 's' : ''} selected`;
        } else if (subtaskCount > 0 && taskCount > 0) {
            countEl.textContent = `${taskCount} Task${taskCount > 1 ? 's' : ''} + ${subtaskCount} Subitem${subtaskCount > 1 ? 's' : ''} selected`;
        } else {
            countEl.textContent = `${taskCount} Task${taskCount > 1 ? 's' : ''} selected`;
        }
    }
}

// Subtask checkbox handler
function onSubtaskCheckboxChange(groupId, taskId, subtaskId, checkbox) {
    const key = `${groupId}::${taskId}::${subtaskId}`;
    if (checkbox.checked) {
        selectedSubtasks.add(key);
    } else {
        selectedSubtasks.delete(key);
    }
    updateFloatingBar();
    updateCheckboxStyles();
}

// TASK 3: Single checkbox selects a specific single task
function onTaskCheckboxChange(groupId, taskId, checkbox) {
    const key = getSelectedKey(groupId, taskId);
    if (checkbox.checked) {
        selectedTasks.add(key);
    } else {
        selectedTasks.delete(key);
    }
    // Also select/deselect subtasks of this task
    const group = boardData.groups.find(g => String(g.id) === String(groupId));
    if (group) {
        const task = group.tasks.find(t => String(t.id) === String(taskId));
        if (task && task.subtasks) {
            task.subtasks.forEach(sub => {
                const subKey = `${groupId}::${taskId}::${sub.id}`;
                if (checkbox.checked) {
                    selectedSubtasks.add(subKey);
                } else {
                    selectedSubtasks.delete(subKey);
                }
            });
            // Update subtask checkboxes in DOM
            const taskRow = document.querySelector(`tr[data-task-id="${taskId}"][data-group-id="${groupId}"]`);
            if (taskRow) {
                let sibling = taskRow.nextElementSibling;
                while (sibling && sibling.classList.contains('subtask-row')) {
                    const cb = sibling.querySelector('.subtask-checkbox');
                    if (cb) cb.checked = checkbox.checked;
                    sibling = sibling.nextElementSibling;
                }
            }
        }
    }
    updateFloatingBar();
    updateGroupHeaderCheckbox(groupId);
    updateCheckboxStyles();
}

function updateGroupHeaderCheckbox(groupId) {
    const group = boardData.groups.find(g => g.id === groupId);
    if (!group) return;
    const groupEl = document.querySelector(`.group-tbody[data-group-id="${groupId}"]`);
    if (!groupEl) return;
    const headerCb = groupEl.querySelector('.group-select-checkbox');
    if (!headerCb) return;
    const allChecked = group.tasks.length > 0 && group.tasks.every(t => isTaskSelected(groupId, t.id));
    const someChecked = group.tasks.some(t => isTaskSelected(groupId, t.id));
    headerCb.checked = allChecked;
    headerCb.indeterminate = someChecked && !allChecked;
}

// TASK 2: Master checkbox toggles all tasks in the group
function toggleAllGroupsCheckbox(checkbox) {
    boardData.groups.forEach(group => {
        group.tasks.forEach(t => {
            const key = getSelectedKey(group.id, t.id);
            if (checkbox.checked) selectedTasks.add(key);
            else selectedTasks.delete(key);
        });
    });
    document.querySelectorAll('tbody tr[data-task-id] input[type="checkbox"]').forEach(cb => {
        cb.checked = checkbox.checked;
    });
    updateFloatingBar();
    updateCheckboxStyles();
}

function toggleGroupCheckbox(groupId, checkbox) {
    const group = boardData.groups.find(g => g.id === groupId);
    if (!group) return;
    group.tasks.forEach(t => {
        const key = getSelectedKey(groupId, t.id);
        if (checkbox.checked) {
            selectedTasks.add(key);
        } else {
            selectedTasks.delete(key);
        }
        // Also select/deselect subtasks
        if (t.subtasks) {
            t.subtasks.forEach(sub => {
                const subKey = `${groupId}::${t.id}::${sub.id}`;
                if (checkbox.checked) {
                    selectedSubtasks.add(subKey);
                } else {
                    selectedSubtasks.delete(subKey);
                }
            });
        }
    });
    // Update individual checkboxes in DOM
    const groupEl = document.querySelector(`.group-tbody[data-group-id="${groupId}"]`);
    if (groupEl) {
        groupEl.querySelectorAll('tbody tr[data-task-id] input[type="checkbox"]').forEach(cb => {
            cb.checked = checkbox.checked;
        });
        groupEl.querySelectorAll('tbody tr.subtask-row .subtask-checkbox').forEach(cb => {
            cb.checked = checkbox.checked;
        });
    }
    updateFloatingBar();
    updateCheckboxStyles();
}

// TASK 2/3: Red checkbox accent when selected
function updateCheckboxStyles() {
    document.querySelectorAll('tbody tr[data-task-id]').forEach(row => {
        const cb = row.querySelector('input[type="checkbox"]');
        if (!cb) return;
        if (cb.checked) {
            row.classList.add('task-selected');
            cb.classList.add('cb-selected');
        } else {
            row.classList.remove('task-selected');
            cb.classList.remove('cb-selected');
        }
    });
    // Header checkboxes
    document.querySelectorAll('thead input[type="checkbox"]').forEach(cb => {
        if (cb.checked || cb.indeterminate) {
            cb.classList.add('cb-selected');
        } else {
            cb.classList.remove('cb-selected');
        }
    });
    // Subtask checkboxes
    document.querySelectorAll('tr.subtask-row').forEach(row => {
        const cb = row.querySelector('.subtask-checkbox');
        if (!cb) return;
        if (cb.checked) {
            row.classList.add('task-selected');
            cb.classList.add('cb-selected');
        } else {
            row.classList.remove('task-selected');
            cb.classList.remove('cb-selected');
        }
    });
}

// ============================================================
// TASK 2: Floating Bar Actions
// ============================================================
function floatingBarDuplicate() {
    const items = getSelectedTaskObjects();
    const subItems = getSelectedSubtaskObjects();
    if (items.length === 0 && subItems.length === 0) return;
    items.forEach(({ group, task }) => {
        const clone = { ...task, id: newId(), name: task.name + ' (copy)', lastUpdated: nowISO(),
            subtasks: (task.subtasks || []).map(s => ({ ...s, id: newId() })),
            subtasksExpanded: false };
        group.tasks.push(clone);
    });
    subItems.forEach(({ task, subtask }) => {
        const clone = { ...subtask, id: newId(), name: subtask.name + ' (copy)', lastUpdated: nowISO() };
        task.subtasks.push(clone);
        task.lastUpdated = nowISO();
    });
    clearSelection();
    renderBoard();
}

function floatingBarDelete() {
    const subItems = getSelectedSubtaskObjects();
    if (subItems.length > 0 && selectedTasks.size === 0) {
        floatingBarDeleteSubtasks();
    } else {
        floatingBarPermanentDelete();
    }
}

function floatingBarDeleteSubtasks() {
    const subItems = getSelectedSubtaskObjects();
    const count = subItems.length;
    if (count === 0) return;
    if (!confirm(`PERMANENTLY delete ${count} selected subitem(s)? This cannot be undone.`)) return;
    subItems.forEach(({ task, subtask }) => {
        task.subtasks = task.subtasks.filter(s => s.id !== subtask.id);
        task.lastUpdated = nowISO();
    });
    clearSelection();
    renderBoard();
    showToast(`${count} subitem(s) permanently deleted`);
}

function floatingBarExportCSV() {
    const items = getSelectedTaskObjects();
    const subItems = getSelectedSubtaskObjects();
    if (items.length === 0 && subItems.length === 0) return;
    const headers = ['Type', 'Task', 'Owner', 'Status', 'Due Date', 'Priority', 'Notes', 'Budget', 'Timeline Start', 'Timeline End'];
    let csv = headers.join(',') + '\n';
    items.forEach(({ task }) => {
        const status = getStatusInfo(task.status);
        const priority = getPriorityInfo(task.priority);
        csv += [
            '"Task"',
            `"${(task.name || '').replace(/"/g, '""')}"`,
            `"${task.owner || ''}"`,
            `"${status.label || ''}"`,
            `"${task.dueDate || ''}"`,
            `"${priority.label || ''}"`,
            `"${(task.notes || '').replace(/"/g, '""')}"`,
            task.budget || 0,
            `"${task.timelineStart || ''}"`,
            `"${task.timelineEnd || ''}"`
        ].join(',') + '\n';
    });
    subItems.forEach(({ subtask }) => {
        const status = getStatusInfo(subtask.status);
        csv += [
            '"Subitem"',
            `"${(subtask.name || '').replace(/"/g, '""')}"`,
            `"${subtask.owner || ''}"`,
            `"${status.label || ''}"`,
            `"${subtask.dueDate || ''}"`,
            '""',
            '""',
            '0',
            '""',
            '""'
        ].join(',') + '\n';
    });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, 'tasks_export.csv');
}

function floatingBarExportExcel() {
    const items = getSelectedTaskObjects();
    const subItems = getSelectedSubtaskObjects();
    if (items.length === 0 && subItems.length === 0) return;
    let table = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table>';
    table += '<tr><th>Type</th><th>Task</th><th>Owner</th><th>Status</th><th>Due Date</th><th>Priority</th><th>Notes</th><th>Budget</th><th>Timeline Start</th><th>Timeline End</th></tr>';
    items.forEach(({ task }) => {
        const status = getStatusInfo(task.status);
        const priority = getPriorityInfo(task.priority);
        table += `<tr><td>Task</td><td>${escapeHtml(task.name)}</td><td>${task.owner || ''}</td><td>${status.label || ''}</td><td>${task.dueDate || ''}</td><td>${priority.label || ''}</td><td>${escapeHtml(task.notes || '')}</td><td>${task.budget || 0}</td><td>${task.timelineStart || ''}</td><td>${task.timelineEnd || ''}</td></tr>`;
    });
    subItems.forEach(({ subtask }) => {
        const status = getStatusInfo(subtask.status);
        table += `<tr><td>Subitem</td><td>${escapeHtml(subtask.name)}</td><td>${subtask.owner || ''}</td><td>${status.label || ''}</td><td>${subtask.dueDate || ''}</td><td></td><td></td><td>0</td><td></td><td></td></tr>`;
    });
    table += '</table></body></html>';
    const blob = new Blob([table], { type: 'application/vnd.ms-excel' });
    downloadBlob(blob, 'tasks_export.xls');
}

function downloadBlob(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(link.href), 100);
}

function floatingBarArchive() {
    floatingBarArchive30();
}

// Move selected tasks/subtasks to another task as subitems (via picker)
function floatingBarMove(event) {
    const items = getSelectedTaskObjects();
    const subItems = getSelectedSubtaskObjects();
    if (items.length === 0 && subItems.length === 0) return;
    
    closeMoveToMenu();
    
    const menu = document.createElement('div');
    menu.className = 'move-to-menu';
    menu.id = 'moveToMenu';
    
    let html = '<div class="move-to-header">Move as subitem to:</div>';
    html += '<div class="move-to-search"><input type="text" placeholder="Search task..." id="moveToSearch"></div>';
    html += '<div class="move-to-list" id="moveToList">';
    
    // Collect IDs of selected tasks to exclude them from targets
    const selectedIds = new Set(items.map(i => String(i.task.id)));
    
    boardData.groups.forEach(group => {
        group.tasks.forEach(t => {
            if (selectedIds.has(String(t.id))) return; // skip selected tasks as targets
            html += `<div class="move-to-item" data-task-id="${t.id}" data-group-id="${group.id}" onclick="executeFloatingBarMove('${t.id}', '${group.id}')">
                <span class="move-to-group-dot" style="background:${group.color}"></span>
                <span class="move-to-task-name">${escapeHtml(t.name)}</span>
                <span class="move-to-group-name">${escapeHtml(group.name)}</span>
            </div>`;
        });
    });
    
    html += '</div>';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    
    // Position near the Move button
    const btn = event.currentTarget;
    const rect = btn.getBoundingClientRect();
    let top = rect.top - 310;
    let left = rect.left;
    if (top < 10) top = rect.bottom + 4;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 288;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    
    setTimeout(() => {
        const searchInput = document.getElementById('moveToSearch');
        if (searchInput) {
            searchInput.focus();
            searchInput.addEventListener('input', function() {
                filterMoveToList(this.value);
            });
        }
    }, 50);
    
    setTimeout(() => document.addEventListener('click', closeMoveToMenuOnClick), 10);
}

function executeFloatingBarMove(targetTaskId, targetGroupId) {
    closeMoveToMenu();
    
    const items = getSelectedTaskObjects();
    const subItems = getSelectedSubtaskObjects();
    
    // Move selected tasks as subtasks of target
    items.forEach(({ group, task }) => {
        convertTaskToSubtask(String(task.id), String(group.id), targetTaskId, targetGroupId);
    });
    
    // Move selected subtasks to target
    subItems.forEach(({ group, task, subtask }) => {
        moveSubtaskToTask(String(subtask.id), String(task.id), String(group.id), targetTaskId, targetGroupId);
    });
    
    clearSelection();
    renderBoard();
    saveToStorage();
}

// Convert selected subtasks back to regular tasks (promote to task)
function floatingBarConvert() {
    const subItems = getSelectedSubtaskObjects();
    const items = getSelectedTaskObjects();
    
    if (subItems.length === 0 && items.length === 0) return;
    
    // Convert subtasks to tasks (promote)
    subItems.forEach(({ group, task, subtask }) => {
        if (!task || !task.subtasks) return;
        const subIdx = task.subtasks.findIndex(s => String(s.id) === String(subtask.id));
        if (subIdx === -1) return;
        
        // Remove from subtasks
        task.subtasks.splice(subIdx, 1);
        task.lastUpdated = nowISO();
        
        // Add as a regular task in the same group
        group.tasks.push({
            id: subtask.id,
            name: subtask.name,
            owner: subtask.owner || '',
            status: subtask.status || '',
            dueDate: subtask.dueDate || '',
            priority: subtask.priority || '',
            notes: subtask.notes || '',
            budget: subtask.budget || 0,
            files: subtask.files || 0,
            timelineStart: subtask.timelineStart || '',
            timelineEnd: subtask.timelineEnd || '',
            lastUpdated: nowISO(),
            subtasks: [],
            subtasksExpanded: false
        });
    });
    
    // Convert tasks to subtasks — need a target, use first non-selected task in same group
    // Actually for tasks: "Convert" doesn't make sense without a target, so just show toast
    if (items.length > 0 && subItems.length === 0) {
        showToast('Select subtasks to convert them to tasks, or use "Move" to nest tasks');
        return;
    }
    
    const count = subItems.length;
    clearSelection();
    renderBoard();
    saveToStorage();
    showToast(`${count} subitem${count > 1 ? 's' : ''} converted to task${count > 1 ? 's' : ''}`);
}

function clearSelection() {
    selectedTasks.clear();
    selectedSubtasks.clear();
    updateFloatingBar();
    updateCheckboxStyles();
}

// ===== Toast notification =====
function showToast(message, duration = 3000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);z-index:2000;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast-msg';
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ===== Render Functions =====
function getStatusInfo(statusId) {
    return STATUS_OPTIONS.find(s => s.id === statusId) || STATUS_OPTIONS[STATUS_OPTIONS.length - 1];
}

function getPriorityInfo(priorityId) {
    return PRIORITY_OPTIONS.find(p => p.id === priorityId) || PRIORITY_OPTIONS[PRIORITY_OPTIONS.length - 1];
}

function canEdit() {
    if (!currentUser) return false;
    return ['super_admin', 'admin', 'member'].includes(currentUser.role);
}

function renderBoard() {
    const container = document.getElementById('tableContent');
    if (!container) return;
    activeAddTaskInputs.clear();

    // Update board title to match active board
    updateBoardTitle();

    let html = '';

    // Single table with sticky thead + all groups as tbody sections
    html += `<div class="table-scroll-wrapper">
        <table class="board-table" id="mainBoardTable">
            ${getColGroupHTML()}
            <thead class="sticky-thead">
                <tr>
                    <th class="group-color-cell" data-col="color"><div class="group-color-bar" style="background:transparent"></div></th>
                    <th style="width:36px" data-col="checkbox"></th>
                    ${getOrderedColumns().map(col => getHeaderHTML(col)).join('')}
                    <th class="col-add" data-col="add"><span class="material-icons-outlined" style="font-size:16px">add</span></th>
                </tr>
            </thead>`;

    boardData.groups.forEach(group => {
        html += renderGroup(group);
    });

    html += `</table></div>`;

    if (canEdit()) {
        html += `
            <button class="add-group-btn" onclick="addNewGroup()">
                <span class="material-icons-outlined" style="font-size:18px">add</span>
                Add new group
            </button>
        `;
    }

    container.innerHTML = html;

    // Restore checkbox states from selectedTasks
    selectedTasks.forEach(key => {
        const [gid, tid] = key.split('::');
        const row = document.querySelector(`tr[data-task-id="${tid}"][data-group-id="${gid}"]`);
        if (row) {
            const cb = row.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = true;
        }
    });

    // Restore subtask checkbox states from selectedSubtasks
    selectedSubtasks.forEach(key => {
        const [gid, tid, sid] = key.split('::');
        const row = document.querySelector(`tr.subtask-row[data-subtask-id="${sid}"][data-parent-task="${tid}"][data-group-id="${gid}"]`);
        if (row) {
            const cb = row.querySelector('.subtask-checkbox');
            if (cb) cb.checked = true;
        }
    });

    // Update header checkboxes
    boardData.groups.forEach(g => updateGroupHeaderCheckbox(g.id));
    updateFloatingBar();
    updateCheckboxStyles();
    updateInviteCount();
    saveToStorage();
}

// ============================================================
// COLUMN ORDER SYSTEM (Sprint 1.2 Task 16)
// Columns are rendered in the order defined by columnState.order
// ============================================================

const DEFAULT_COL_ORDER = ['task', 'owner', 'status', 'duedate', 'priority', 'notes', 'budget', 'files', 'timeline', 'updated'];

function getOrderedColumns() {
    if (columnState.order && columnState.order.length > 0) {
        // Filter to only include valid draggable columns (exclude color, checkbox, add)
        const valid = columnState.order.filter(c => DEFAULT_COL_ORDER.includes(c));
        // Add any missing columns
        DEFAULT_COL_ORDER.forEach(c => { if (!valid.includes(c)) valid.push(c); });
        return valid;
    }
    return DEFAULT_COL_ORDER;
}

const COL_WIDTHS = {
    color: 6, checkbox: 36, task: 400, owner: 80, status: 120,
    duedate: 100, priority: 110, notes: 120, budget: 90,
    files: 70, timeline: 140, updated: 140, add: 36
};

function getColGroupHTML() {
    const cols = getOrderedColumns();
    let html = '<colgroup>';
    html += `<col style="width:${COL_WIDTHS.color}px">`;
    html += `<col style="width:${COL_WIDTHS.checkbox}px">`;
    cols.forEach(col => {
        const w = columnState.widths[col] || COL_WIDTHS[col] || 100;
        html += `<col style="width:${w}px">`;
    });
    html += `<col style="width:${COL_WIDTHS.add}px">`;
    html += '</colgroup>';
    return html;
}

function getHeaderHTML(col) {
    const w = columnState.widths[col] ? ` style="width:${columnState.widths[col]}px;min-width:${columnState.widths[col]}px"` : '';
    switch(col) {
        case 'task': {
            const tw = columnState.widths[col] ? Math.min(750, Math.max(180, columnState.widths[col])) : null;
            const taskW = tw ? ` style="width:${tw}px;min-width:180px;max-width:750px"` : ' style="min-width:180px;max-width:750px"';
            return `<th class="col-task" data-col="task" draggable="true"${taskW}><div class="th-content" data-tooltip="The task name and main identifier">Task</div><div class="col-resize-handle"></div></th>`;
        }
        case 'owner': return `<th data-col="owner" draggable="true"${w}><div class="th-content" data-tooltip="Person responsible for this task">Owner</div><div class="col-resize-handle"></div></th>`;
        case 'status': return `<th data-col="status" draggable="true"${w}><div class="th-content" data-tooltip="Current progress status of the task">Status</div><div class="col-resize-handle"></div></th>`;
        case 'duedate': return `<th data-col="duedate" draggable="true"${w}><div class="th-content" data-tooltip="Deadline for task completion">Due date</div><div class="col-resize-handle"></div></th>`;
        case 'priority': return `<th data-col="priority" draggable="true"${w}><div class="th-content" data-tooltip="Urgency level: Critical, High, Medium, or Low">Priority</div><div class="col-resize-handle"></div></th>`;
        case 'notes': return `<th data-col="notes" draggable="true"${w}><div class="th-content" data-tooltip="Additional notes and comments">Notes</div><div class="col-resize-handle"></div></th>`;
        case 'budget': return `<th data-col="budget" draggable="true"${w}><div class="th-content" data-tooltip="Allocated budget for this task">Budget</div><div class="col-resize-handle"></div></th>`;
        case 'files': return `<th data-col="files" draggable="true"${w}><div class="th-content" data-tooltip="Attached files and documents">Files</div><div class="col-resize-handle"></div></th>`;
        case 'timeline': return `<th data-col="timeline" draggable="true"${w}><div class="th-content" data-tooltip="Start and end date range for the task">Timeline</div><div class="col-resize-handle"></div></th>`;
        case 'updated': return `<th data-col="updated" draggable="true"${w}><div class="th-content" data-tooltip="Time since the last modification">Last updated</div><div class="col-resize-handle"></div></th>`;
        default: return '';
    }
}

function getCellHTML(col, task, group, taskIdStr, groupIdStr, isViewer, status, priority, dueDateDisplay, hasTimeline, timelineColor, timelineText, expandBtn, subtaskBadge) {
    switch(col) {
        case 'task': return `<td class="cell-task" ${!isViewer ? `ondblclick="editTaskName('${taskIdStr}', '${groupIdStr}', this)"` : ''}>
                <div class="cell-task-content">
                    ${expandBtn}
                    <span class="task-name" onclick="openTaskDetailsPanel('${taskIdStr}', '${groupIdStr}')">${escapeHtml(task.name)}</span>
                    ${subtaskBadge}
                    <div class="task-icons">
                        <button class="task-icon-btn" onclick="event.stopPropagation(); openTaskModal('${taskIdStr}', '${groupIdStr}')" title="Expand details">
                            <span class="material-icons-outlined">open_in_new</span>
                        </button>
                        <button class="task-icon-btn" onclick="event.stopPropagation(); openChat('${taskIdStr}')" title="Open chat">
                            <span class="material-icons-outlined">chat_bubble_outline</span>
                        </button>
                        <button class="task-icon-btn task-details-btn" onclick="event.stopPropagation(); openTaskDetailsPanel('${taskIdStr}', '${groupIdStr}')" title="Details">
                            <span class="material-icons-outlined">chevron_left</span>
                        </button>
                    </div>
                </div>
            </td>`;
        case 'owner': return `<td class="cell-owner">
                ${task.owner
                    ? `<div class="owner-avatar has-owner" ${!isViewer ? `onclick="toggleOwner(event, '${taskIdStr}', '${groupIdStr}')"` : ''} title="${escapeHtml(task.owner)}">${escapeHtml(getInitials(task.owner))}</div>`
                    : `<div class="owner-avatar no-owner" ${!isViewer ? `onclick="toggleOwner(event, '${taskIdStr}', '${groupIdStr}')"` : ''} title="Assign this task"><span class="owner-plus-icon">+</span></div>`
                }
            </td>`;
        case 'status': return `<td class="cell-status">
                <div class="status-label" style="background:${status.color}"
                     ${!isViewer ? `onclick="showStatusDropdown(event, '${taskIdStr}', '${groupIdStr}')"` : ''}>
                    ${status.label || ''}
                </div>
            </td>`;
        case 'duedate': return `<td class="cell-due-date">
                <div class="date-display" ${!isViewer ? `ondblclick="editDueDate('${taskIdStr}', '${groupIdStr}', this)"` : ''}>${dueDateDisplay}</div>
            </td>`;
        case 'priority': return `<td class="cell-priority">
                <div class="priority-label" style="background:${priority.color}"
                     ${!isViewer ? `onclick="showPriorityDropdown(event, '${taskIdStr}', '${groupIdStr}')"` : ''}>
                    ${priority.label || ''}
                </div>
            </td>`;
        case 'notes': return `<td class="cell-notes" ${task.notes ? `onmouseenter="showNotesTooltip(event, this)" onmouseleave="hideNotesTooltip()"` : ''} ${!isViewer ? `ondblclick="editNotes('${taskIdStr}', '${groupIdStr}', this)"` : ''}>${escapeHtml(task.notes || '')}</td>`;
        case 'budget': return `<td class="cell-budget" ${!isViewer ? `ondblclick="editBudget('${taskIdStr}', '${groupIdStr}', this)"` : ''}>${task.budget ? '$' + task.budget.toLocaleString() : ''}</td>`;
        case 'files': return `<td class="cell-files">
                <div class="file-icon">
                    ${task.files > 0
                        ? `<span class="material-icons-outlined" style="color:#0073ea">description</span>`
                        : `<span class="material-icons-outlined">attach_file</span>`}
                </div>
            </td>`;
        case 'timeline': return `<td class="cell-timeline">
                ${hasTimeline
                    ? `<div class="timeline-bar has-dates" style="background:${timelineColor}" ${!isViewer ? `ondblclick="editTimeline('${taskIdStr}', '${groupIdStr}')"` : ''}>${timelineText}</div>`
                    : `<div class="timeline-bar no-dates" ${!isViewer ? `ondblclick="editTimeline('${taskIdStr}', '${groupIdStr}')"` : ''}>-</div>`}
            </td>`;
        case 'updated': return `<td class="cell-updated">
                <div class="updated-content">
                    ${task.owner ? getUpdatedAvatarHTML(task.owner) : ''}
                    <span>${formatLastUpdated(task.lastUpdated)}</span>
                </div>
            </td>`;
        default: return '<td></td>';
    }
}

function renderGroup(group) {
    const taskCount = group.tasks.length;
    const isCollapsed = group.collapsed;

    const totalBudget = group.tasks.reduce((sum, t) => sum + (t.budget || 0), 0);
    const totalFiles = group.tasks.reduce((sum, t) => sum + (t.files || 0), 0);

    const statusCounts = {};
    group.tasks.forEach(t => {
        const s = getStatusInfo(t.status);
        statusCounts[s.color] = (statusCounts[s.color] || 0) + 1;
    });

    const priorityCounts = {};
    group.tasks.forEach(t => {
        const p = getPriorityInfo(t.priority);
        priorityCounts[p.color] = (priorityCounts[p.color] || 0) + 1;
    });

    let minDate = null, maxDate = null;
    group.tasks.forEach(t => {
        if (t.timelineStart) { const d = new Date(t.timelineStart); if (!isNaN(d) && (!minDate || d < minDate)) minDate = d; }
        if (t.timelineEnd) { const d = new Date(t.timelineEnd); if (!isNaN(d) && (!maxDate || d > maxDate)) maxDate = d; }
    });
    const summaryTimeline = minDate && maxDate
        ? formatTimeline(minDate.toISOString(), maxDate.toISOString()) : '';

    let minDue = null, maxDue = null;
    group.tasks.forEach(t => {
        if (t.dueDate) { const d = new Date(t.dueDate); if (!isNaN(d) && (!minDue || d < minDue)) minDue = d; if (!isNaN(d) && (!maxDue || d > maxDue)) maxDue = d; }
    });
    const summaryDueDate = minDue && maxDue
        ? formatTimeline(minDue.toISOString(), maxDue.toISOString()) : '';

    const numCols = getOrderedColumns().length + 3; // color + checkbox + columns + add

    let html = `
            <tbody class="group-tbody ${isCollapsed ? 'group-collapsed' : ''}" data-group-id="${group.id}">
                <tr class="group-header-row" onclick="toggleGroup('${group.id}')">
                    <td colspan="${numCols}" class="group-header-cell" style="color: ${group.color}">
                        <div class="group-header-inner">
                            <span class="group-drag-handle" draggable="true" title="Drag to reorder group" onclick="event.stopPropagation()">
                                <span class="material-icons-outlined">drag_indicator</span>
                            </span>
                            <input type="checkbox" class="group-select-checkbox" onclick="event.stopPropagation(); toggleGroupCheckbox('${group.id}', this)" title="Select all in section">
                            <span class="material-icons-outlined collapse-arrow ${isCollapsed ? 'collapsed' : ''}" 
                                  style="color:${group.color}">expand_more</span>
                            <span class="group-title" style="color:${group.color}" 
                                  onclick="event.stopPropagation(); editGroupName('${group.id}', this)">${escapeHtml(group.name)}</span>
                            <span class="group-count">${taskCount} Tasks</span>
                            <span class="group-header-actions" onclick="event.stopPropagation()">
                                <button class="group-action-btn group-add-task-btn" onclick="event.stopPropagation(); addTaskInline('${group.id}')" title="Add a task to this group">
                                    <span class="material-icons-outlined">add</span>
                                </button>
                                <button class="group-action-btn group-menu-btn" onclick="event.stopPropagation(); showGroupMenu(event, '${group.id}')" title="More section actions">
                                    <span class="material-icons-outlined">more_horiz</span>
                                </button>
                            </span>
                        </div>
                    </td>
                </tr>`;

    group.tasks.forEach(task => {
        html += renderTaskRow(task, group);
    });

    // TASK 1 FIX: Add task row with unique identifier per group
    if (canEdit()) {
        html += `
                        <tr class="add-task-row" data-add-group="${group.id}">
                            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div></td>
                            <td></td>
                            <td colspan="11">
                                <div class="add-task-trigger" onclick="addTaskInline('${group.id}')">
                                    + Add task
                                </div>
                            </td>
                        </tr>`;
    }

    // Summary row
    if (group.tasks.length > 0) {
        html += `
                        <tr class="summary-row">
                            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}; border-radius: 0 0 4px 0;"></div></td>
                            <td></td><td></td><td></td>
                            <td><div class="summary-colors">${Object.entries(statusCounts).map(([c, n]) => `<span style="background:${c};flex:${n}"></span>`).join('')}</div></td>
                            <td style="font-size:11px;text-align:center">${summaryDueDate}</td>
                            <td><div class="summary-colors">${Object.entries(priorityCounts).map(([c, n]) => `<span style="background:${c};flex:${n}"></span>`).join('')}</div></td>
                            <td></td>
                            <td class="summary-budget"><span class="summary-value">$${totalBudget.toLocaleString()}</span><span class="summary-label">sum</span></td>
                            <td class="summary-files"><span class="summary-value">${totalFiles}</span><span class="summary-label">files</span></td>
                            <td>${summaryTimeline ? `<div class="summary-timeline"><div class="summary-timeline-bar">${summaryTimeline}</div></div>` : ''}</td>
                            <td></td><td></td>
                        </tr>`;
    }

    html += `</tbody>`;
    return html;
}

function renderTaskRow(task, group) {
    const status = getStatusInfo(task.status);
    const priority = getPriorityInfo(task.priority);
    const timelineText = formatTimeline(task.timelineStart, task.timelineEnd);
    const hasTimeline = task.timelineStart && task.timelineEnd;

    let timelineColor = 'linear-gradient(90deg, #00c875, #579bfc)';
    if (task.status === 'done') timelineColor = 'linear-gradient(90deg, #00c875 0%, #00c875 100%)';
    else if (task.status === 'stuck') timelineColor = '#c4c4c4';

    const dueDateDisplay = task.dueDate ? formatDate(task.dueDate) : '';
    const isViewer = currentUser && currentUser.role === 'viewer';
    const taskIdStr = String(task.id);
    const groupIdStr = String(group.id);

    // Subtask state
    if (!task.subtasks) task.subtasks = [];
    const hasSubtasks = task.subtasks.length > 0;
    const isExpanded = task.subtasksExpanded;
    const subtaskCount = task.subtasks.length;

    // Expand/collapse arrow for subtasks — uses same pattern as group header collapse-arrow
    const expandBtn = `<button class="subtask-expand-btn ${isExpanded ? 'expanded' : ''} ${hasSubtasks ? 'has-subtasks' : ''}" 
        onclick="event.stopPropagation(); toggleSubtasks('${taskIdStr}', '${groupIdStr}')" 
        title="${hasSubtasks ? (isExpanded ? 'Collapse subitems' : 'Expand subitems') : 'Add subitem'}">
        <span class="material-icons-outlined subtask-collapse-arrow ${hasSubtasks && !isExpanded ? 'collapsed' : ''}">${hasSubtasks ? 'expand_more' : ''}</span>
    </button>`;

    // Subtask count badge — displayed to the right of the task name
    const subtaskBadge = hasSubtasks ? `<span class="subtask-info-badge">
        <span class="subtask-info-count">${subtaskCount}</span>
    </span>` : '';

    let html = `
        <tr data-task-id="${taskIdStr}" data-group-id="${groupIdStr}" class="${isExpanded ? 'subtasks-open' : ''}${task.status === 'done' ? ' task-done' : ''}">
            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div><span class="row-drag-handle" title="Drag to reorder"><span class="material-icons-outlined">drag_indicator</span></span></td>
            <td class="cell-checkbox"><input type="checkbox" onchange="onTaskCheckboxChange('${groupIdStr}', '${taskIdStr}', this)"></td>
            ${getOrderedColumns().map(col => getCellHTML(col, task, group, taskIdStr, groupIdStr, isViewer, status, priority, dueDateDisplay, hasTimeline, timelineColor, timelineText, expandBtn, subtaskBadge)).join('')}
            <td class="cell-add-col"></td>
        </tr>`;

    // Render subtask section if expanded
    if (isExpanded) {
        html += renderSubtaskSection(task, group);
    }

    return html;
}

// ============================================================
// SUBTASKS / SUBITEMS
// ============================================================

function getSubtaskCellHTML(col, sub, group, subIdStr, taskIdStr, groupIdStr, isViewer) {
    const subStatus = getStatusInfo(sub.status);
    const subPriority = getPriorityInfo(sub.priority);
    const subDateDisplay = sub.dueDate ? formatDate(sub.dueDate) : '';
    const hasTimeline = sub.timelineStart && sub.timelineEnd;
    const timelineText = formatTimeline(sub.timelineStart, sub.timelineEnd);
    let timelineColor = 'linear-gradient(90deg, #00c875, #579bfc)';
    if (sub.status === 'done') timelineColor = 'linear-gradient(90deg, #00c875 0%, #00c875 100%)';
    else if (sub.status === 'stuck') timelineColor = '#c4c4c4';

    switch(col) {
        case 'task': return `<td class="cell-task subtask-task-cell">
                <div class="cell-task-content subtask-task-content">
                    <span class="task-name subtask-name" onclick="openSubtaskDetailsPanel('${subIdStr}', '${taskIdStr}', '${groupIdStr}')" ${!isViewer ? `ondblclick="event.stopPropagation(); editSubtaskName('${subIdStr}', '${taskIdStr}', '${groupIdStr}', this)"` : ''}>${escapeHtml(sub.name)}</span>
                    <div class="subtask-actions">
                        <button class="task-icon-btn task-details-btn" onclick="event.stopPropagation(); openSubtaskDetailsPanel('${subIdStr}', '${taskIdStr}', '${groupIdStr}')" title="Details">
                            <span class="material-icons-outlined">chevron_left</span>
                        </button>
                        ${!isViewer ? `<button class="subtask-delete-btn" onclick="event.stopPropagation(); deleteSubtask('${subIdStr}', '${taskIdStr}', '${groupIdStr}')" title="Delete subitem">
                            <span class="material-icons-outlined">close</span>
                        </button>` : ''}
                    </div>
                </div>
            </td>`;
        case 'owner': return `<td class="cell-owner">
                ${sub.owner
                    ? `<div class="owner-avatar has-owner subtask-avatar" ${!isViewer ? `onclick="toggleSubtaskOwner(event, '${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''} title="${escapeHtml(sub.owner)}">${escapeHtml(getInitials(sub.owner))}</div>`
                    : `<div class="owner-avatar no-owner subtask-avatar" ${!isViewer ? `onclick="toggleSubtaskOwner(event, '${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''} title="Assign this task"><span class="owner-plus-icon">+</span></div>`
                }
            </td>`;
        case 'status': return `<td class="cell-status">
                <div class="status-label subtask-status-label" style="background:${subStatus.color}"
                     ${!isViewer ? `onclick="showSubtaskStatusDropdown(event, '${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''}>
                    ${subStatus.label || ''}
                </div>
            </td>`;
        case 'duedate': return `<td class="cell-due-date">
                <div class="date-display" ${!isViewer ? `ondblclick="editSubtaskDate('${subIdStr}', '${taskIdStr}', '${groupIdStr}', this)"` : ''}>${subDateDisplay}</div>
            </td>`;
        case 'priority': return `<td class="cell-priority">
                <div class="priority-label" style="background:${subPriority.color}"
                     ${!isViewer ? `onclick="showSubtaskPriorityDropdown(event, '${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''}>
                    ${subPriority.label || ''}
                </div>
            </td>`;
        case 'notes': return `<td class="cell-notes" ${sub.notes ? `onmouseenter="showNotesTooltip(event, this)" onmouseleave="hideNotesTooltip()"` : ''} ${!isViewer ? `ondblclick="editSubtaskNotes('${subIdStr}', '${taskIdStr}', '${groupIdStr}', this)"` : ''}>${escapeHtml(sub.notes || '')}</td>`;
        case 'budget': return `<td class="cell-budget" ${!isViewer ? `ondblclick="editSubtaskBudget('${subIdStr}', '${taskIdStr}', '${groupIdStr}', this)"` : ''}>${sub.budget ? '$' + sub.budget.toLocaleString() : ''}</td>`;
        case 'files': return `<td class="cell-files">
                <div class="file-icon">
                    ${(sub.files || 0) > 0
                        ? `<span class="material-icons-outlined" style="color:#0073ea">description</span>`
                        : `<span class="material-icons-outlined">attach_file</span>`}
                </div>
            </td>`;
        case 'timeline': return `<td class="cell-timeline">
                ${hasTimeline
                    ? `<div class="timeline-bar has-dates" style="background:${timelineColor}" ${!isViewer ? `ondblclick="editSubtaskTimeline('${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''}>${timelineText}</div>`
                    : `<div class="timeline-bar no-dates" ${!isViewer ? `ondblclick="editSubtaskTimeline('${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''}>-</div>`}
            </td>`;
        case 'updated': return `<td class="cell-updated">
                <div class="updated-content">
                    ${sub.owner ? getUpdatedAvatarHTML(sub.owner) : ''}
                    <span>${formatLastUpdated(sub.lastUpdated)}</span>
                </div>
            </td>`;
        default: return '<td></td>';
    }
}

function renderSubtaskSection(task, group) {
    const taskIdStr = String(task.id);
    const groupIdStr = String(group.id);
    const isViewer = currentUser && currentUser.role === 'viewer';
    const columns = getOrderedColumns();

    let html = '';

    // Subtask rows — each subtask uses proper table cells aligned with main task columns
    task.subtasks.forEach((sub, idx) => {
        const subIdStr = String(sub.id);
        const isLast = idx === task.subtasks.length - 1;

        html += `<tr class="subtask-row ${isLast ? 'subtask-row-last' : ''}${sub.status === 'done' ? ' subtask-done' : ''}" data-subtask-id="${subIdStr}" data-parent-task="${taskIdStr}" data-group-id="${groupIdStr}">
            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div><span class="row-drag-handle subtask-drag-handle" title="Drag to reorder"><span class="material-icons-outlined">drag_indicator</span></span></td>
            <td class="cell-checkbox"><input type="checkbox" class="subtask-checkbox" onchange="onSubtaskCheckboxChange('${groupIdStr}', '${taskIdStr}', '${subIdStr}', this)"></td>
            ${columns.map(col => getSubtaskCellHTML(col, sub, group, subIdStr, taskIdStr, groupIdStr, isViewer)).join('')}
            <td class="cell-add-col"></td>
        </tr>`;
    });

    // Add subitem row
    if (canEdit()) {
        html += `<tr class="subtask-add-row" data-parent-task="${taskIdStr}" data-group-id="${groupIdStr}">
            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div></td>
            <td class="cell-checkbox"></td>
            <td class="cell-task subtask-task-cell"><div class="subtask-add-trigger" onclick="addSubtaskInline('${taskIdStr}', '${groupIdStr}')">+ Add subitem</div></td>
            ${columns.slice(1).map(() => '<td></td>').join('')}
            <td class="cell-add-col"></td>
        </tr>`;
    }

    return html;
}

// Toggle subtasks expand/collapse
function toggleSubtasks(taskId, groupId) {
    const { task } = findTask(taskId, groupId);
    if (!task) return;
    if (!task.subtasks) task.subtasks = [];
    task.subtasksExpanded = !task.subtasksExpanded;
    renderBoard();
}

// Add subtask inline
let activeSubtaskInputs = new Set();

function addSubtaskInline(taskId, groupId) {
    const inputKey = `${groupId}::${taskId}`;
    if (activeSubtaskInputs.has(inputKey)) return;
    activeSubtaskInputs.add(inputKey);

    const addRow = document.querySelector(`tr.subtask-add-row[data-parent-task="${taskId}"][data-group-id="${groupId}"]`);
    if (!addRow) { activeSubtaskInputs.delete(inputKey); return; }
    const td = addRow.querySelector('td.cell-task') || addRow.querySelector('td[colspan]');
    if (!td) { activeSubtaskInputs.delete(inputKey); return; }

    td.innerHTML = `<input class="inline-edit-input subtask-inline-input" type="text" placeholder="Enter subitem name..." style="margin-right:16px; width:100%;">`;
    const input = td.querySelector('input');
    if (!input) { activeSubtaskInputs.delete(inputKey); return; }

    let committed = false;
    const commit = () => {
        if (committed) return;
        committed = true;
        activeSubtaskInputs.delete(inputKey);

        const name = input.value.trim();
        if (name) {
            const { task } = findTask(taskId, groupId);
            if (task) {
                if (!task.subtasks) task.subtasks = [];
                task.subtasks.push({
                    id: newId(),
                    name: name,
                    owner: '',
                    status: '',
                    priority: '',
                    dueDate: '',
                    notes: '',
                    budget: 0,
                    files: 0,
                    timelineStart: '',
                    timelineEnd: '',
                    lastUpdated: nowISO()
                });
                task.subtasksExpanded = true;
                // Trigger subtask added notification + popup
                triggerTaskAddedNotification(name, task.name);
                task.lastUpdated = nowISO();
            }
        }
        renderBoard();
    };

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { committed = true; activeSubtaskInputs.delete(inputKey); renderBoard(); }
    });
    input.addEventListener('blur', function() { setTimeout(commit, 50); });
    input.focus();
}

// Find subtask
function findSubtask(subtaskId, taskId, groupId) {
    const { group, task } = findTask(taskId, groupId);
    if (!task || !task.subtasks) return { group: null, task: null, subtask: null };
    const subtask = task.subtasks.find(s => String(s.id) === String(subtaskId));
    return { group, task, subtask };
}

// Edit subtask name
function editSubtaskName(subtaskId, taskId, groupId, element) {
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (!subtask) return;
    const currentName = subtask.name;
    element.innerHTML = `<input class="inline-edit-input subtask-inline-input" type="text" value="${escapeHtml(currentName)}">`;
    const input = element.querySelector('input');
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val && val !== currentName) {
            subtask.name = val;
            subtask.lastUpdated = nowISO();
            task.lastUpdated = nowISO();
            saveToStorage();
        }
        renderBoard();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
        if (e.key === 'Escape') { saved = true; renderBoard(); }
    });
    input.focus();
    input.select();
}

// Toggle subtask owner
function toggleSubtaskOwner(event, subtaskId, taskId, groupId) {
    showOwnerPopup(event, taskId, groupId, subtaskId);
}

// Show subtask status dropdown
function showSubtaskStatusDropdown(event, subtaskId, taskId, groupId) {
    event.stopPropagation();
    const dropdown = document.getElementById('dropdownMenu');
    let html = '';
    STATUS_OPTIONS.forEach(s => {
        html += `<div class="dropdown-item" style="background:${s.color}" onclick="setSubtaskStatus('${subtaskId}', '${taskId}', '${groupId}', '${s.id}')">${s.label || '(Empty)'}</div>`;
    });
    dropdown.innerHTML = html;
    const rect = event.target.getBoundingClientRect();
    positionDropdown(dropdown, rect);
}

function setSubtaskStatus(subtaskId, taskId, groupId, statusId) {
    document.getElementById('dropdownMenu').classList.remove('active');
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (subtask) { subtask.status = statusId; subtask.lastUpdated = nowISO(); task.lastUpdated = nowISO(); saveToStorage(); renderBoard(); }
}

// Edit subtask date
function editSubtaskDate(subtaskId, taskId, groupId, cell) {
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (!subtask) return;
    cell.innerHTML = `<input class="inline-edit-input" type="date" value="${subtask.dueDate || ''}" style="width:120px">`;
    const input = cell.querySelector('input');
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        subtask.dueDate = input.value;
        subtask.lastUpdated = nowISO();
        task.lastUpdated = nowISO();
        saveToStorage();
        renderBoard();
    };
    input.addEventListener('change', save);
    input.addEventListener('blur', save);
    input.focus();
}

// Delete subtask
function deleteSubtask(subtaskId, taskId, groupId) {
    const { task } = findTask(taskId, groupId);
    if (!task || !task.subtasks) return;
    task.subtasks = task.subtasks.filter(s => String(s.id) !== String(subtaskId));
    task.lastUpdated = nowISO();
    renderBoard();
}

// Subtask priority dropdown
function showSubtaskPriorityDropdown(event, subtaskId, taskId, groupId) {
    event.stopPropagation();
    const dropdown = document.getElementById('dropdownMenu');
    let html = '';
    PRIORITY_OPTIONS.forEach(p => {
        html += `<div class="dropdown-item" style="background:${p.color}" onclick="setSubtaskPriority('${subtaskId}', '${taskId}', '${groupId}', '${p.id}')">${p.label || '(Empty)'}</div>`;
    });
    dropdown.innerHTML = html;
    const rect = event.target.getBoundingClientRect();
    positionDropdown(dropdown, rect);
}

function setSubtaskPriority(subtaskId, taskId, groupId, priorityId) {
    document.getElementById('dropdownMenu').classList.remove('active');
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (subtask) { subtask.priority = priorityId; subtask.lastUpdated = nowISO(); task.lastUpdated = nowISO(); saveToStorage(); renderBoard(); }
}

// Subtask notes edit
function editSubtaskNotes(subtaskId, taskId, groupId, cell) {
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (!subtask) return;
    const current = subtask.notes || '';
    cell.innerHTML = `<input class="inline-edit-input" type="text" value="${escapeHtml(current)}" style="width:100%">`;
    const input = cell.querySelector('input');
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        subtask.notes = input.value;
        subtask.lastUpdated = nowISO();
        task.lastUpdated = nowISO();
        saveToStorage();
        renderBoard();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { saved = true; renderBoard(); } });
    input.focus();
    input.select();
}

// Subtask budget edit
function editSubtaskBudget(subtaskId, taskId, groupId, cell) {
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (!subtask) return;
    const current = subtask.budget || '';
    cell.innerHTML = `<input class="inline-edit-input" type="number" value="${current}" style="width:80px" min="0">`;
    const input = cell.querySelector('input');
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        subtask.budget = input.value ? Number(input.value) : 0;
        subtask.lastUpdated = nowISO();
        task.lastUpdated = nowISO();
        saveToStorage();
        renderBoard();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { saved = true; renderBoard(); } });
    input.focus();
    input.select();
}

// Subtask timeline edit - opens full subtask modal
function editSubtaskTimeline(subtaskId, taskId, groupId) {
    openSubtaskModal(subtaskId, taskId, groupId);
}

// Full subtask edit modal (similar to task modal)
let currentSubModalSubtask = null;
let currentSubModalTask = null;
let currentSubModalGroup = null;

function openSubtaskModal(subtaskId, taskId, groupId) {
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (!subtask) return;
    const group = boardData.groups.find(g => String(g.id) === String(groupId));
    currentSubModalSubtask = subtask;
    currentSubModalTask = task;
    currentSubModalGroup = group;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'subtaskModalOverlay';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="modal-content" style="max-width:500px">
        <div class="modal-header">
            <h2 class="modal-title">${escapeHtml(subtask.name)}</h2>
            <button class="modal-close-btn" onclick="document.getElementById('subtaskModalOverlay').remove()">×</button>
        </div>
        <div class="modal-body" style="padding:16px 20px">
            <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:4px">Task Name</label>
            <input type="text" id="subModalName" value="${escapeHtml(subtask.name)}" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:14px;margin-bottom:12px">
            
            <div style="display:flex;gap:12px;margin-bottom:12px">
                <div style="flex:1">
                    <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:4px">Status</label>
                    <select id="subModalStatus" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                        ${STATUS_OPTIONS.map(s => `<option value="${s.id}" ${subtask.status === s.id ? 'selected' : ''}>${s.label || '(Empty)'}</option>`).join('')}
                    </select>
                </div>
                <div style="flex:1">
                    <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:4px">Priority</label>
                    <select id="subModalPriority" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                        ${PRIORITY_OPTIONS.map(p => `<option value="${p.id}" ${subtask.priority === p.id ? 'selected' : ''}>${p.label || '(Empty)'}</option>`).join('')}
                    </select>
                </div>
            </div>
            
            <div style="display:flex;gap:12px;margin-bottom:12px">
                <div style="flex:1">
                    <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:4px">Due Date</label>
                    <input type="date" id="subModalDueDate" value="${subtask.dueDate || ''}" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                </div>
                <div style="flex:1">
                    <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:4px">Budget</label>
                    <input type="number" id="subModalBudget" value="${subtask.budget || ''}" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                </div>
            </div>
            
            <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:4px">Notes</label>
            <textarea id="subModalNotes" rows="3" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px;resize:vertical;margin-bottom:12px">${escapeHtml(subtask.notes || '')}</textarea>
            
            <div style="display:flex;gap:12px;margin-bottom:16px">
                <div style="flex:1">
                    <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:4px">Timeline Start</label>
                    <input type="date" id="subModalTimelineStart" value="${subtask.timelineStart || ''}" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                </div>
                <div style="flex:1">
                    <label style="font-size:12px;font-weight:600;color:#333;display:block;margin-bottom:4px">Timeline End</label>
                    <input type="date" id="subModalTimelineEnd" value="${subtask.timelineEnd || ''}" style="width:100%;padding:8px 10px;border:1px solid #ddd;border-radius:6px;font-size:13px">
                </div>
            </div>
            
            <div style="display:flex;gap:8px;justify-content:flex-end">
                <button onclick="saveSubtaskFromModal()" style="padding:8px 20px;border:none;border-radius:6px;cursor:pointer;background:#0073ea;color:#fff;font-weight:600;font-size:13px">Save</button>
                <button onclick="document.getElementById('subtaskModalOverlay').remove()" style="padding:8px 20px;border:1px solid #ddd;border-radius:6px;cursor:pointer;background:#fff;font-size:13px">Cancel</button>
            </div>
        </div>
    </div>`;
    document.body.appendChild(modal);
}

function saveSubtaskFromModal() {
    if (!currentSubModalSubtask) return;
    currentSubModalSubtask.name = document.getElementById('subModalName').value.trim() || currentSubModalSubtask.name;
    currentSubModalSubtask.status = document.getElementById('subModalStatus').value;
    currentSubModalSubtask.priority = document.getElementById('subModalPriority').value;
    currentSubModalSubtask.dueDate = document.getElementById('subModalDueDate').value;
    currentSubModalSubtask.budget = parseFloat(document.getElementById('subModalBudget').value) || 0;
    currentSubModalSubtask.notes = document.getElementById('subModalNotes').value;
    currentSubModalSubtask.timelineStart = document.getElementById('subModalTimelineStart').value;
    currentSubModalSubtask.timelineEnd = document.getElementById('subModalTimelineEnd').value;
    currentSubModalSubtask.lastUpdated = nowISO();
    if (currentSubModalTask) currentSubModalTask.lastUpdated = nowISO();
    document.getElementById('subtaskModalOverlay').remove();
    saveToStorage();
    renderBoard();
    currentSubModalSubtask = null;
    currentSubModalTask = null;
    currentSubModalGroup = null;
}

// ===== Find task by string ID =====
function findTask(taskId, groupId) {
    const group = boardData.groups.find(g => String(g.id) === String(groupId));
    if (!group) return { group: null, task: null };
    const task = group.tasks.find(t => String(t.id) === String(taskId));
    return { group, task };
}

// ===== Toggle group collapse =====
function toggleGroup(groupId) {
    // Don't toggle if click came from an action button
    if (event && event.target && event.target.closest('.group-header-actions')) return;
    const group = boardData.groups.find(g => g.id === groupId);
    if (group) { group.collapsed = !group.collapsed; renderBoard(); }
}

// ===== Status Dropdown =====
function positionDropdown(dropdown, rect) {
    // Calculate dropdown height (render off-screen to measure)
    dropdown.style.visibility = 'hidden';
    dropdown.style.display = 'block';
    dropdown.style.top = '-9999px';
    const dropdownHeight = dropdown.offsetHeight;
    dropdown.style.visibility = '';
    dropdown.style.display = '';
    
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    
    let top;
    if (spaceBelow >= dropdownHeight) {
        // Enough space below - show below
        top = rect.bottom + 4;
    } else if (spaceAbove >= dropdownHeight) {
        // Not enough below, but enough above - show above
        top = rect.top - dropdownHeight - 4;
    } else {
        // Not enough space either way - position to fit in viewport
        top = Math.max(8, viewportHeight - dropdownHeight - 8);
    }
    
    // Horizontal: ensure it doesn't go off-screen right
    let left = rect.left;
    const dropdownWidth = dropdown.offsetWidth || 140;
    if (left + dropdownWidth > window.innerWidth - 8) {
        left = window.innerWidth - dropdownWidth - 8;
    }
    
    dropdown.style.top = top + 'px';
    dropdown.style.left = left + 'px';
    dropdown.classList.add('active');
}

function showStatusDropdown(event, taskId, groupId) {
    event.stopPropagation();
    const dropdown = document.getElementById('dropdownMenu');
    let html = '';
    STATUS_OPTIONS.forEach(s => {
        html += `<div class="dropdown-item" style="background:${s.color}" onclick="setTaskStatus('${taskId}', '${groupId}', '${s.id}')">${s.label || '(Empty)'}</div>`;
    });
    dropdown.innerHTML = html;
    const rect = event.target.getBoundingClientRect();
    positionDropdown(dropdown, rect);
}

function setTaskStatus(taskId, groupId, statusId) {
    document.getElementById('dropdownMenu').classList.remove('active');
    const { group, task } = findTask(taskId, groupId);
    if (task) {
        const oldStatus = task.status;
        task.status = statusId;
        task.lastUpdated = nowISO();
        saveToStorage();
        renderBoard();
        // Trigger status change notification
        if (oldStatus !== statusId && currentUser) {
            const statusInfo = STATUS_OPTIONS.find(s => s.id === statusId) || { label: statusId };
            const user = { name: currentUser.fullName || currentUser.email, picture: currentUser.picture || '' };
            const msg = `<strong>${escapeHtml(user.name)}</strong> changed status of "<strong>${escapeHtml(task.name)}</strong>" to <strong>${escapeHtml(statusInfo.label || statusId)}</strong>`;
            addNotification('status_change', msg, user, task.name);
        }
    }
}

// ===== Priority Dropdown =====
function showPriorityDropdown(event, taskId, groupId) {
    event.stopPropagation();
    const dropdown = document.getElementById('dropdownMenu');
    let html = '';
    PRIORITY_OPTIONS.forEach(p => {
        html += `<div class="dropdown-item" style="background:${p.color}" onclick="setTaskPriority('${taskId}', '${groupId}', '${p.id}')">${p.label || '(Empty)'}</div>`;
    });
    dropdown.innerHTML = html;
    const rect = event.target.getBoundingClientRect();
    positionDropdown(dropdown, rect);
}

function setTaskPriority(taskId, groupId, priorityId) {
    document.getElementById('dropdownMenu').classList.remove('active');
    const { group, task } = findTask(taskId, groupId);
    if (task) { task.priority = priorityId; task.lastUpdated = nowISO(); saveToStorage(); renderBoard(); }
}

// ============================================================
// TASK 1 FIX: Inline Editing - completely isolated from Add Task
// ============================================================
function editTaskName(taskId, groupId, cell) {
    const { task } = findTask(taskId, groupId);
    if (!task) return;
    const currentName = task.name;
    const safeVal = escapeHtml(currentName);
    cell.innerHTML = `<input class="inline-edit-input" type="text" value="${safeVal}" 
                        data-edit-field="name" data-task-id="${taskId}" data-group-id="${groupId}">`;
    const input = cell.querySelector('input');
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        const val = input.value.trim();
        if (val && val !== currentName) {
            task.name = val;
            task.lastUpdated = nowISO();
        }
        renderBoard();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); this.blur(); }
        if (e.key === 'Escape') { saved = true; renderBoard(); }
    });
    input.focus();
    input.select();
}

function editDueDate(taskId, groupId, cell) {
    const { task } = findTask(taskId, groupId);
    if (!task) return;
    cell.innerHTML = `<input class="inline-edit-input" type="date" value="${task.dueDate || ''}">`;
    const input = cell.querySelector('input');
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        task.dueDate = input.value;
        task.lastUpdated = nowISO();
        renderBoard();
    };
    input.addEventListener('change', save);
    input.addEventListener('blur', save);
    input.focus();
}

// ===== Notes Tooltip =====
let notesTooltipEl = null;

function showNotesTooltip(event, cell) {
    // Only show tooltip if text is actually truncated
    if (cell.scrollWidth <= cell.clientWidth) return;
    
    hideNotesTooltip();
    const text = cell.textContent;
    if (!text) return;
    
    notesTooltipEl = document.createElement('div');
    notesTooltipEl.className = 'notes-tooltip';
    notesTooltipEl.textContent = text;
    document.body.appendChild(notesTooltipEl);
    
    // Position below the cell
    const rect = cell.getBoundingClientRect();
    const tooltipRect = notesTooltipEl.getBoundingClientRect();
    
    let top = rect.bottom + 6;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    
    // Keep within viewport
    if (top + tooltipRect.height > window.innerHeight - 8) {
        top = rect.top - tooltipRect.height - 6;
    }
    if (left < 8) left = 8;
    if (left + tooltipRect.width > window.innerWidth - 8) {
        left = window.innerWidth - tooltipRect.width - 8;
    }
    
    notesTooltipEl.style.top = top + 'px';
    notesTooltipEl.style.left = left + 'px';
}

function hideNotesTooltip() {
    if (notesTooltipEl) {
        notesTooltipEl.remove();
        notesTooltipEl = null;
    }
}

function editNotes(taskId, groupId, cell) {
    const { task } = findTask(taskId, groupId);
    if (!task) return;
    const currentNotes = task.notes || '';
    cell.innerHTML = `<input class="inline-edit-input" type="text" value="${escapeHtml(currentNotes)}">`;
    const input = cell.querySelector('input');
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        task.notes = input.value;
        task.lastUpdated = nowISO();
        renderBoard();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') this.blur(); });
    input.focus();
}

function editBudget(taskId, groupId, cell) {
    const { task } = findTask(taskId, groupId);
    if (!task) return;
    cell.innerHTML = `<input class="inline-edit-input" type="number" value="${task.budget || ''}" min="0">`;
    const input = cell.querySelector('input');
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        task.budget = parseFloat(input.value) || 0;
        task.lastUpdated = nowISO();
        renderBoard();
    };
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') this.blur(); });
    input.focus();
}

function editTimeline(taskId, groupId) { openTaskModal(taskId, groupId); }

function toggleOwner(event, taskId, groupId) {
    showOwnerPopup(event, taskId, groupId, null);
}

// ===== Group Editing =====
function editGroupName(groupId, element) {
    const group = boardData.groups.find(g => g.id === groupId);
    if (!group || !canEdit()) return;
    const currentName = group.name;
    const input = document.createElement('input');
    input.className = 'inline-edit-input';
    input.type = 'text';
    input.value = currentName;
    input.style.cssText = `color:${group.color};font-weight:600;font-size:16px;width:200px;`;
    let saved = false;
    const save = () => {
        if (saved) return;
        saved = true;
        if (input.value.trim()) group.name = input.value.trim();
        renderBoard();
    };
    input.onblur = save;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') { saved = true; renderBoard(); }
    };
    element.replaceWith(input);
    input.focus();
    input.select();
}

// ============================================================
// TASK 1 FIX: addTaskInline - Completely rewritten
// The bug was: clicking "+ Add task" created an input. When the user
// typed and pressed Enter, it would create the task. But if they then
// double-clicked another task to edit it, the blur from the add-task
// input could fire again and create a duplicate or overwrite.
// FIX: Use a flag per input instance and cancel if already committed.
// Also, don't call renderBoard from within the blur handler if the
// input is already being torn down by another action.
// ============================================================
function addTaskInline(groupId) {
    // Prevent multiple add-task inputs for the same group
    if (activeAddTaskInputs.has(groupId)) return;
    activeAddTaskInputs.add(groupId);

    const addRow = document.querySelector(`tr[data-add-group="${groupId}"]`);
    if (!addRow) { activeAddTaskInputs.delete(groupId); return; }
    const td = addRow.querySelector('td[colspan]');
    if (!td) { activeAddTaskInputs.delete(groupId); return; }

    // Replace the + Add task trigger with an input
    td.innerHTML = `<input class="inline-edit-input add-task-input" type="text" placeholder="Enter task name..."
                     style="margin-right:16px">`;
    const input = td.querySelector('input');
    if (!input) { activeAddTaskInputs.delete(groupId); return; }

    let committed = false;

    const commit = () => {
        if (committed) return;
        committed = true;
        activeAddTaskInputs.delete(groupId);

        const name = input.value.trim();
        if (name) {
            const group = boardData.groups.find(g => String(g.id) === String(groupId));
            if (group) {
                group.tasks.push({
                    id: newId(),
                    name: name,
                    owner: '',
                    status: '',
                    dueDate: '',
                    priority: '',
                    notes: '',
                    budget: 0,
                    files: 0,
                    timelineStart: '',
                    timelineEnd: '',
                    lastUpdated: nowISO(),
                    subtasks: [],
                    subtasksExpanded: false
                });
                // Trigger task added notification + popup
                triggerTaskAddedNotification(name);
            }
        }
        renderBoard();
    };

    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            commit();
        }
        if (e.key === 'Escape') {
            committed = true;
            activeAddTaskInputs.delete(groupId);
            renderBoard();
        }
    });

    input.addEventListener('blur', function() {
        // Delay slightly to allow click events on other elements to fire first
        setTimeout(commit, 50);
    });

    input.focus();
}

// ===== Add Group =====
function addNewGroup() {
    const colorIndex = boardData.groups.length % GROUP_COLORS.length;
    boardData.groups.push({
        id: 'g' + newId(), name: 'New Group', color: GROUP_COLORS[colorIndex],
        collapsed: false, tasks: []
    });
    renderBoard();
}

// ===== Group Context Menu (3-dot menu) =====
function showGroupMenu(event, groupId) {
    event.stopPropagation();
    // Close any existing group menu
    closeGroupMenu();
    
    const btn = event.currentTarget;
    const rect = btn.getBoundingClientRect();
    
    const menu = document.createElement('div');
    menu.className = 'group-context-menu';
    menu.id = 'groupContextMenu';
    menu.innerHTML = `
        <div class="group-menu-item" onclick="renameGroupFromMenu('${groupId}')">
            <span class="material-icons-outlined">edit</span>
            <span>Rename</span>
        </div>
        <div class="group-menu-item has-submenu" data-group-id="${groupId}">
            <span class="material-icons-outlined">playlist_add</span>
            <span>Add group</span>
            <span class="material-icons-outlined submenu-arrow">chevron_right</span>
        </div>
        <div class="group-menu-item" onclick="duplicateGroup('${groupId}')">
            <span class="material-icons-outlined">content_copy</span>
            <span>Duplicate group</span>
        </div>
        <div class="group-menu-divider"></div>
        <div class="group-menu-item delete-item" onclick="deleteGroup('${groupId}')">
            <span class="material-icons-outlined">delete</span>
            <span>Delete group</span>
        </div>
    `;
    
    document.body.appendChild(menu);
    
    // Position the menu
    const menuRect = menu.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    
    // Adjust if menu goes off screen
    if (top + menuRect.height > window.innerHeight) {
        top = rect.top - menuRect.height - 4;
    }
    if (left + menuRect.width > window.innerWidth) {
        left = window.innerWidth - menuRect.width - 8;
    }
    
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    
    // Submenu hover logic
    const submenuItem = menu.querySelector('.has-submenu');
    let submenuTimeout = null;
    
    submenuItem.addEventListener('mouseenter', () => {
        clearTimeout(submenuTimeout);
        showAddGroupSubmenu(submenuItem, groupId);
    });
    
    submenuItem.addEventListener('mouseleave', (e) => {
        const sub = document.querySelector('.group-submenu');
        if (sub && sub.contains(e.relatedTarget)) return; // moving to submenu
        submenuTimeout = setTimeout(() => {
            const sub = document.querySelector('.group-submenu');
            if (sub) sub.remove();
        }, 150);
    });
    
    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closeGroupMenuOnClick);
    }, 10);
}

function showAddGroupSubmenu(triggerItem, groupId) {
    // Remove existing submenu
    const existingSub = document.querySelector('.group-submenu');
    if (existingSub) existingSub.remove();
    
    const rect = triggerItem.getBoundingClientRect();
    
    const submenu = document.createElement('div');
    submenu.className = 'group-context-menu group-submenu';
    submenu.innerHTML = `
        <div class="group-menu-item" onclick="addGroupAt('${groupId}', 'above')">
            <span class="material-icons-outlined">arrow_upward</span>
            <span>Add group above</span>
        </div>
        <div class="group-menu-item" onclick="addGroupAt('${groupId}', 'below')">
            <span class="material-icons-outlined">arrow_downward</span>
            <span>Add group below</span>
        </div>
    `;
    
    document.body.appendChild(submenu);
    
    // Position to the right of the parent item
    const subRect = submenu.getBoundingClientRect();
    let top = rect.top;
    let left = rect.right + 4;
    if (left + subRect.width > window.innerWidth) left = rect.left - subRect.width - 4;
    if (top + subRect.height > window.innerHeight) top = window.innerHeight - subRect.height - 8;
    
    submenu.style.top = top + 'px';
    submenu.style.left = left + 'px';
    
    // When mouse leaves submenu, check if going back to trigger item
    submenu.addEventListener('mouseleave', (e) => {
        const mainMenu = document.getElementById('groupContextMenu');
        if (mainMenu && mainMenu.contains(e.relatedTarget)) {
            // Moving back to main menu — close submenu only if not on the trigger item
            const triggerEl = mainMenu.querySelector('.has-submenu');
            if (!triggerEl || !triggerEl.contains(e.relatedTarget)) {
                submenu.remove();
            }
        } else {
            // Moving outside both menus
            submenu.remove();
        }
    });
}

function closeGroupMenuOnClick(e) {
    const menu = document.getElementById('groupContextMenu');
    const sub = document.querySelector('.group-submenu');
    if (menu && menu.contains(e.target)) return;
    if (sub && sub.contains(e.target)) return;
    closeGroupMenu();
}

function closeGroupMenu() {
    const menu = document.getElementById('groupContextMenu');
    if (menu) menu.remove();
    const sub = document.querySelector('.group-submenu');
    if (sub) sub.remove();
    document.removeEventListener('click', closeGroupMenuOnClick);
}

function renameGroupFromMenu(groupId) {
    closeGroupMenu();
    const group = boardData.groups.find(g => String(g.id) === String(groupId));
    if (!group) return;
    const titleEl = document.querySelector(`.group-tbody[data-group-id="${groupId}"] .group-title`);
    if (titleEl) editGroupName(groupId, titleEl);
}

function addGroupAt(groupId, position) {
    closeGroupMenu();
    const idx = boardData.groups.findIndex(g => String(g.id) === String(groupId));
    if (idx === -1) return;
    const colorIndex = boardData.groups.length % GROUP_COLORS.length;
    const newGroup = {
        id: 'g' + newId(), name: 'New Group', color: GROUP_COLORS[colorIndex],
        collapsed: false, tasks: []
    };
    if (position === 'above') {
        boardData.groups.splice(idx, 0, newGroup);
    } else {
        boardData.groups.splice(idx + 1, 0, newGroup);
    }
    renderBoard();
}

function duplicateGroup(groupId) {
    closeGroupMenu();
    const idx = boardData.groups.findIndex(g => String(g.id) === String(groupId));
    if (idx === -1) return;
    const original = boardData.groups[idx];
    const clone = JSON.parse(JSON.stringify(original));
    clone.id = 'g' + newId();
    clone.name = original.name + ' (copy)';
    // Assign new IDs to all tasks and subtasks
    clone.tasks.forEach(t => {
        t.id = newId();
        if (t.subtasks) t.subtasks.forEach(st => { st.id = newId(); });
    });
    boardData.groups.splice(idx + 1, 0, clone);
    renderBoard();
}

function deleteGroup(groupId) {
    closeGroupMenu();
    const group = boardData.groups.find(g => String(g.id) === String(groupId));
    if (!group) return;
    const taskCount = group.tasks.length;
    const msg = taskCount > 0 
        ? `Permanently delete group "${group.name}" and its ${taskCount} task(s)?`
        : `Permanently delete group "${group.name}"?`;
    if (!confirm(msg)) return;
    boardData.groups = boardData.groups.filter(g => String(g.id) !== String(groupId));
    renderBoard();
}

// ===== Task Modal =====
let currentModalTask = null;
let currentModalGroup = null;

function openTaskModal(taskId, groupId) {
    const { group, task } = findTask(taskId, groupId);
    if (!task) return;
    currentModalTask = task;
    currentModalGroup = group;
    document.getElementById('modalTitle').textContent = task.name;
    document.getElementById('modalTaskName').value = task.name;
    const statusSelect = document.getElementById('modalStatus');
    statusSelect.innerHTML = STATUS_OPTIONS.map(s => `<option value="${s.id}" ${task.status === s.id ? 'selected' : ''}>${s.label || '(Empty)'}</option>`).join('');
    document.getElementById('modalPriority').value = task.priority || '';
    document.getElementById('modalDueDate').value = task.dueDate || '';
    document.getElementById('modalBudget').value = task.budget || '';
    document.getElementById('modalNotes').value = task.notes || '';
    document.getElementById('modalTimelineStart').value = task.timelineStart || '';
    document.getElementById('modalTimelineEnd').value = task.timelineEnd || '';
    document.getElementById('taskModal').classList.add('active');
}

function closeModal() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    currentModalTask = null;
    currentModalGroup = null;
}

function saveTaskFromModal() {
    if (!currentModalTask) return;
    currentModalTask.name = document.getElementById('modalTaskName').value.trim() || currentModalTask.name;
    currentModalTask.status = document.getElementById('modalStatus').value;
    currentModalTask.priority = document.getElementById('modalPriority').value;
    currentModalTask.dueDate = document.getElementById('modalDueDate').value;
    currentModalTask.budget = parseFloat(document.getElementById('modalBudget').value) || 0;
    currentModalTask.notes = document.getElementById('modalNotes').value;
    currentModalTask.timelineStart = document.getElementById('modalTimelineStart').value;
    currentModalTask.timelineEnd = document.getElementById('modalTimelineEnd').value;
    currentModalTask.lastUpdated = nowISO();
    closeModal();
    renderBoard();
}

function openChat(taskId) {
    showToast('Chat feature coming soon');
}

// ============================================================
// TASK 4: Authentication System (Server-Side)
// ============================================================
function showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appMain').style.display = 'none';
    // Close any open modals
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    document.querySelectorAll('.modal-overlay[style*="display: flex"], .modal-overlay[style*="display:flex"]').forEach(m => m.style.display = 'none');
    showLoginForm();
}

function showAppScreen() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appMain').style.display = 'flex';
    if (currentUser) {
        const initials = getInitials(currentUser.fullName || currentUser.email);

        const headerAvatar = document.querySelector('.header-avatar');
        if (headerAvatar) {
            if (currentUser.picture) {
                headerAvatar.outerHTML = `<img src="${currentUser.picture}" alt="${initials}" class="user-avatar user-avatar-img header-avatar" style="width:32px;height:32px;cursor:pointer;" referrerpolicy="no-referrer" title="Click to see options" onclick="showUserMenu(event)" onerror="this.outerHTML='<div class=\\'user-avatar user-avatar-initials header-avatar\\' style=\\'width:32px;height:32px;cursor:pointer;\\' title=\\'Click to see options\\' onclick=\\'showUserMenu(event)\\'>${initials}</div>'">`;
            } else {
                headerAvatar.textContent = initials;
            }
        }

        const boardAvatar = document.querySelector('.board-avatar');
        if (boardAvatar) {
            // Legacy single avatar - no longer used, replaced by boardOwnersStack
        }

        // Render board owners stack
        renderBoardOwnersStack();

        const sidebarAvatar = document.querySelector('.sidebar-user-info .user-avatar');
        if (sidebarAvatar) {
            if (currentUser.picture) {
                sidebarAvatar.outerHTML = `<img src="${currentUser.picture}" alt="${initials}" class="user-avatar user-avatar-img" style="width:28px;height:28px;border-radius:50%;" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'user-avatar user-avatar-initials\\' style=\\'width:28px;height:28px;font-size:10px;\\'>${initials}</div>'">`;
            } else {
                sidebarAvatar.textContent = initials;
            }
        }

        const menuAvatar = document.querySelector('.user-menu-header .user-avatar');
        if (menuAvatar) {
            if (currentUser.picture) {
                menuAvatar.outerHTML = `<img src="${currentUser.picture}" alt="${initials}" class="user-avatar user-avatar-img" style="width:36px;height:36px;border-radius:50%;" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'user-avatar user-avatar-initials\\' style=\\'width:36px;height:36px;\\'>${initials}</div>'">`;
            } else {
                menuAvatar.textContent = initials;
            }
        }

        document.querySelectorAll('.user-avatar-initials').forEach(el => {
            if (!el.closest('.owner-avatar') && !el.closest('.updated-avatar')) {
                el.textContent = initials;
            }
        });

        const nameEl = document.getElementById('userDisplayName');
        if (nameEl) nameEl.textContent = currentUser.fullName || currentUser.email;
        const roleBadge = document.getElementById('userRoleBadge');
        if (roleBadge) roleBadge.textContent = ROLE_LABELS[currentUser.role] || '';
    }
    renderBoardSidebar();
    renderBoard();
    showAdminLink();
    // Initialize workspace system first (sets activeWorkspaceId from localStorage)
    initWorkspaces();
    // Load data from server (async - will re-render if server has newer data)
    loadFromServer();
    loadColumnStateFromServer();
    loadTdpDataFromServer();
    processPendingInvite();
}

function showLoginForm() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    clearAuthErrors();
}

function showRegisterForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'block';
    document.getElementById('forgotPasswordForm').style.display = 'none';
    clearAuthErrors();
}

function showForgotPasswordForm() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('registerForm').style.display = 'none';
    document.getElementById('forgotPasswordForm').style.display = 'block';
    clearAuthErrors();
}

function clearAuthErrors() {
    ['loginError', 'regError', 'forgotError', 'forgotSuccess'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
}

// Password visibility toggle
function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('.material-icons-outlined');
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
}

// Login - all verification happens server-side
function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showAuthError('loginError', 'Please fill in all fields'); return; }

    showAuthLoading('loginForm');

    fetch('/api/auth/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({email, password}) })
        .then(res => res.json())
        .then(data => {
            hideAuthLoading('loginForm');
            if (data.success) {
                authToken = data.token;
                currentUser = data.user;
                saveAuthToken();
                showAppScreen();
            } else {
                showAuthError('loginError', data.error || 'Invalid email or password');
            }
        })
        .catch(() => { hideAuthLoading('loginForm'); showAuthError('loginError', 'Connection error. Please try again.'); });
}

// Register - server stores user, no password in browser
function handleRegister(e) {
    e.preventDefault();
    const fullName = document.getElementById('regFullName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (!fullName || !email || !password) { showAuthError('regError', 'Please fill in all fields'); return; }
    if (password !== confirmPassword) { showAuthError('regError', 'Passwords do not match'); return; }
    
    // Validate password strength
    const allPass = PASSWORD_RULES.every(rule => rule.test(password));
    if (!allPass) { showAuthError('regError', 'Password does not meet all requirements'); return; }

    showAuthLoading('registerForm');

    fetch('/api/auth/register', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({fullName, email, password}) })
        .then(res => res.json())
        .then(data => {
            hideAuthLoading('registerForm');
            if (data.success) {
                authToken = data.token;
                currentUser = data.user;
                saveAuthToken();
                // Mark invite as used if registering via invite
                if (window._pendingInviteToken) {
                    fetch(`/api/invites/use/${window._pendingInviteToken}`, {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${authToken}` }
                    }).catch(() => {});
                    delete window._pendingInviteToken;
                    window.history.replaceState({}, '', window.location.pathname);
                }
                showAppScreen();
            } else {
                showAuthError('regError', data.error || 'Registration failed');
            }
        })
        .catch(() => { hideAuthLoading('registerForm'); showAuthError('regError', 'Connection error. Please try again.'); });
}

function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
    if (!email) { showAuthError('forgotError', 'Please enter your email'); return; }
    document.getElementById('forgotError').textContent = '';
    document.getElementById('forgotSuccess').textContent = `If an account exists for ${email}, a password reset link has been sent.`;
}

function handleGoogleLogin() {
    window.location.href = '/auth/google';
}

// Handle Google OAuth callback
async function handleGoogleOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);

    const authError = urlParams.get('auth_error');
    if (authError) {
        showAuthError('loginError', 'Sign-in failed: ' + authError.replace(/_/g, ' '));
        window.history.replaceState({}, document.title, '/');
        return false;
    }

    const googleUserData = urlParams.get('google_user');
    if (googleUserData) {
        try {
            const userData = JSON.parse(decodeURIComponent(googleUserData));
            // Register/login via server
            const res = await fetch('/api/auth/oauth-login', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(userData)
            });
            const data = await res.json();
            if (data.success) {
                authToken = data.token;
                currentUser = data.user;
                saveAuthToken();
                window.history.replaceState({}, document.title, '/');
                showAppScreen();
                return true;
            }
        } catch (e) {
            console.error('Google OAuth error:', e);
            showAuthError('loginError', 'Failed to process Google sign-in');
        }
        window.history.replaceState({}, document.title, '/');
        return false;
    }
    return false;
}

function handleFacebookLogin() {
    window.location.href = '/auth/facebook';
}

// Handle Facebook OAuth callback
async function handleFacebookOAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);

    const fbUserData = urlParams.get('facebook_user');
    if (fbUserData) {
        try {
            const userData = JSON.parse(decodeURIComponent(fbUserData));
            const res = await fetch('/api/auth/oauth-login', {
                method: 'POST',
                headers: {'Content-Type':'application/json'},
                body: JSON.stringify(userData)
            });
            const data = await res.json();
            if (data.success) {
                authToken = data.token;
                currentUser = data.user;
                saveAuthToken();
                window.history.replaceState({}, document.title, '/');
                showAppScreen();
                return true;
            }
        } catch (e) {
            console.error('Facebook OAuth error:', e);
            showAuthError('loginError', 'Failed to process Facebook sign-in');
        }
        window.history.replaceState({}, document.title, '/');
        return false;
    }
    return false;
}

function showAuthError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) { el.textContent = message; el.style.display = 'block'; }
}

function logout() {
    authFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    currentUser = null;
    authToken = null;
    serverDataLoaded = false; // Reset guard on logout
    saveAuthToken();
    const userMenu = document.getElementById('userMenuDropdown');
    if (userMenu) userMenu.classList.remove('active');
    showAuthScreen();
}

function showUserMenu(event) {
    event.stopPropagation();
    const menu = document.getElementById('userMenuDropdown');
    if (!menu) return;
    if (currentUser) {
        const nameEl = document.getElementById('menuUserName');
        const roleEl = document.getElementById('menuUserRole');
        if (nameEl) nameEl.textContent = currentUser.fullName || currentUser.email;
        if (roleEl) roleEl.textContent = ROLE_LABELS[currentUser.role] || currentUser.role;

        const menuAvatar = document.querySelector('.user-menu-header .user-avatar');
        if (menuAvatar && currentUser.picture && !menuAvatar.classList.contains('user-avatar-img')) {
            const initials = getInitials(currentUser.fullName || currentUser.email);
            menuAvatar.outerHTML = `<img src="${currentUser.picture}" alt="${initials}" class="user-avatar user-avatar-img" style="width:36px;height:36px;border-radius:50%;" referrerpolicy="no-referrer">`;
        }
    }
    menu.classList.toggle('active');
}

// Close user menu on outside click
document.addEventListener('click', (e) => {
    const menu = document.getElementById('userMenuDropdown');
    if (menu && menu.classList.contains('active') && !menu.contains(e.target)) {
        menu.classList.remove('active');
    }
});

// ============================================================
// TASK 5: Invite System & User Roles
// ============================================================
function openInviteModal() {
    if (!currentUser || !['super_admin', 'admin'].includes(currentUser.role)) {
        alert('Only Admins can invite users');
        return;
    }
    document.getElementById('inviteModal').classList.add('active');
    document.getElementById('inviteEmail').value = '';
    document.getElementById('inviteRole').value = 'member';
    document.getElementById('inviteMessage').value = '';
    document.getElementById('inviteError').textContent = '';
    document.getElementById('inviteSuccess').textContent = '';
    document.getElementById('mainInviteEmailStatus').className = 'invite-email-status';
    document.getElementById('mainInviteEmailError').textContent = '';
    // Highlight the default role
    updateInviteRoleDescriptions('member');
    // Populate workspace dropdown
    initMainInviteSelectors();
}

function closeInviteModal() {
    document.getElementById('inviteModal').classList.remove('active');
}

function updateInviteRoleDescriptions(role) {
    document.querySelectorAll('.invite-role-desc').forEach(desc => {
        const r = desc.dataset.role;
        if (r === role) {
            desc.classList.add('active');
        } else {
            desc.classList.remove('active');
        }
    });
}

async function handleInvite(e) {
    e.preventDefault();
    const emailsStr = document.getElementById('inviteEmail').value.trim();
    const role = document.getElementById('inviteRole').value;
    const message = document.getElementById('inviteMessage').value.trim();
    const workspaceId = document.getElementById('mainInviteWorkspace').value;
    const boardId = document.getElementById('mainInviteBoard').value;

    if (!emailsStr) { document.getElementById('inviteError').textContent = 'Please enter email(s)'; return; }

    const emails = emailsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e && e.includes('@'));
    if (emails.length === 0) { document.getElementById('inviteError').textContent = 'Please enter valid email(s)'; return; }

    const btn = document.getElementById('mainInviteBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
        const res = await authFetch('/api/auth/invite', {
            method: 'POST',
            body: JSON.stringify({ emails, role, message, workspaceId: workspaceId || undefined, boardId: boardId || undefined })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('inviteError').textContent = '';
            let msg = `${data.invited.length} user(s) invited successfully!`;
            if (data.skipped.length > 0) msg += ` (${data.skipped.length} skipped - already exist)`;
            document.getElementById('inviteSuccess').textContent = msg;
            document.getElementById('inviteEmail').value = '';
            document.getElementById('mainInviteEmailStatus').className = 'invite-email-status';
            document.getElementById('mainInviteEmailError').textContent = '';
            updateInviteCount();
            loadActiveWorkspaceMembers();
        } else {
            document.getElementById('inviteError').textContent = data.error || 'Failed to invite';
        }
    } catch (err) {
        document.getElementById('inviteError').textContent = 'Connection error. Please try again.';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Invite';
    }
}

function generateInviteLink() {
    const role = document.getElementById('inviteRole').value;
    const link = `${window.location.origin}?invite=true&role=${role}&token=${Math.random().toString(36).substring(7)}`;
    navigator.clipboard.writeText(link).then(() => {
        document.getElementById('inviteSuccess').textContent = 'Invite link copied to clipboard!';
    }).catch(() => {
        document.getElementById('inviteSuccess').textContent = `Invite link: ${link}`;
    });
}

// ===== Main Invite Modal — Enhanced Flow =====
let mainInviteEmailTimeout = null;

function initMainInviteSelectors() {
    const wsSelect = document.getElementById('mainInviteWorkspace');
    if (!wsSelect) return;
    
    wsSelect.innerHTML = userWorkspaces.map(ws => 
        `<option value="${ws.id}" ${ws.id === activeWorkspaceId ? 'selected' : ''}>${escapeHtml(ws.name)}</option>`
    ).join('');
    
    onMainInviteWorkspaceChange();
}

function validateMainInviteEmail() {
    const input = document.getElementById('inviteEmail');
    const emailsStr = input.value.trim();
    const statusEl = document.getElementById('mainInviteEmailStatus');
    const errorEl = document.getElementById('mainInviteEmailError');
    
    if (mainInviteEmailTimeout) clearTimeout(mainInviteEmailTimeout);
    
    if (!emailsStr) {
        statusEl.className = 'invite-email-status';
        errorEl.textContent = '';
        return;
    }
    
    // Support multiple emails separated by comma
    const emails = emailsStr.split(',').map(e => e.trim()).filter(e => e);
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emails.filter(e => !emailRegex.test(e));
    
    if (invalidEmails.length > 0 && emails[emails.length - 1] !== '') {
        // Only show error if the last email being typed is clearly invalid (has been completed)
        const lastEmail = emails[emails.length - 1];
        if (lastEmail.includes('@') && lastEmail.includes('.') && !emailRegex.test(lastEmail)) {
            statusEl.className = 'invite-email-status invalid';
            errorEl.textContent = `Invalid: ${invalidEmails[0]}`;
        } else if (emails.length === 1 && !lastEmail.includes('@')) {
            statusEl.className = 'invite-email-status';
            errorEl.textContent = '';
        } else {
            statusEl.className = 'invite-email-status';
            errorEl.textContent = '';
        }
        return;
    }
    
    const validEmails = emails.filter(e => emailRegex.test(e));
    if (validEmails.length === 0) {
        statusEl.className = 'invite-email-status';
        errorEl.textContent = '';
        return;
    }
    
    statusEl.className = 'invite-email-status valid';
    errorEl.textContent = '';
    
    // Check first email for registered user hint (debounced)
    if (validEmails.length === 1) {
        statusEl.className = 'invite-email-status checking';
        mainInviteEmailTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`/api/users/check?email=${encodeURIComponent(validEmails[0])}`, {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                const data = await res.json();
                if (data.exists) {
                    statusEl.className = 'invite-email-status valid';
                    errorEl.innerHTML = `<span class="invite-user-hint"><span class="material-icons-outlined">check_circle</span> ${escapeHtml(data.fullName)} — will be added directly</span>`;
                } else {
                    statusEl.className = 'invite-email-status valid';
                    errorEl.textContent = '';
                }
            } catch (e) {
                statusEl.className = 'invite-email-status valid';
            }
        }, 500);
    }
}

async function onMainInviteWorkspaceChange() {
    const wsId = document.getElementById('mainInviteWorkspace').value;
    const boardSelect = document.getElementById('mainInviteBoard');
    boardSelect.innerHTML = '<option value="">All boards</option>';
    
    if (!wsId || !authToken) return;
    
    try {
        const res = await fetch(`/api/user-data/boards?workspaceId=${wsId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.data && data.data.boards) {
            data.data.boards
                .filter(b => !b.archived)
                .forEach(b => {
                    boardSelect.innerHTML += `<option value="${b.id}">${escapeHtml(b.name)}</option>`;
                });
        }
    } catch (e) {
        // Silent fail
    }
}

async function updateInviteCount() {
    const countEl = document.getElementById('inviteCount');
    if (!countEl) return;
    try {
        const res = await authFetch('/api/auth/users');
        if (res.ok) {
            const data = await res.json();
            countEl.textContent = data.users ? data.users.length : 0;
        }
    } catch (e) { /* ignore */ }
}

// ===== New Task button =====
function setupNewTaskButton() {
    const btn = document.getElementById('newTaskBtn');
    if (btn) {
        btn.addEventListener('click', () => {
            if (!canEdit()) return;
            if (boardData.groups.length > 0) {
                const firstGroup = boardData.groups[0];
                firstGroup.tasks.push({
                    id: newId(), name: 'New Task', owner: '', status: '', dueDate: '',
                    priority: '', notes: '', budget: 0, files: 0,
                    timelineStart: '', timelineEnd: '', lastUpdated: nowISO(),
                    subtasks: [], subtasksExpanded: false
                });
                renderBoard();
            }
        });
    }
}

// ===== Persist to LocalStorage =====
function saveToStorage() {
    // Ensure current board's groups are saved in boardGroups before persisting
    if (boardData.activeBoard && boardData.boardGroups) {
        boardData.boardGroups[boardData.activeBoard] = boardData.groups;
    }
    // Always save to localStorage as immediate cache
    try { localStorage.setItem('numiBoardData', JSON.stringify(boardData)); } catch (e) {}
    // Persist to server (primary storage - survives deploys and browser changes)
    saveToServer();
    // Sync to server for Telegram due-date notifications
    syncBoardToServer();
}

// Debounced save to server to avoid excessive API calls
let serverSaveTimeout = null;
let serverDataLoaded = false; // Guard: don't overwrite server data before loading it
function saveToServer() {
    if (!serverDataLoaded) {
        console.warn('[Save] Blocked: server data not yet loaded, preventing overwrite');
        return;
    }
    if (serverSaveTimeout) clearTimeout(serverSaveTimeout);
    serverSaveTimeout = setTimeout(async () => {
        if (!authToken) return;
        try {
            const wsParam = activeWorkspaceId ? `?workspaceId=${activeWorkspaceId}` : '';
            await authFetch('/api/user-data/boards' + wsParam, {
                method: 'PUT',
                body: JSON.stringify({ data: boardData })
            });
        } catch (e) { /* silent - localStorage is fallback */ }
    }, 1000);
}

// Immediate save - used before switching workspaces to ensure no data loss
async function saveToServerImmediate(dataToSave, workspaceId) {
    if (!authToken) {
        console.error('[Save] Cannot save - no auth token');
        return false;
    }
    if (!dataToSave || (!dataToSave.boards && !dataToSave.boardGroups)) {
        console.warn('[Save] Skipping save - no meaningful data to save');
        return false;
    }
    try {
        const wsParam = workspaceId ? `?workspaceId=${workspaceId}` : '';
        const res = await authFetch('/api/user-data/boards' + wsParam, {
            method: 'PUT',
            body: JSON.stringify({ data: dataToSave })
        });
        const result = await res.json();
        if (result.success) {
            console.log(`[Save] ✓ Saved workspace ${workspaceId || 'default'} (${JSON.stringify(dataToSave).length} bytes)`);
            return true;
        } else {
            console.error(`[Save] ✗ Server rejected save for workspace ${workspaceId}:`, result.error);
            return false;
        }
    } catch (e) {
        console.error('[Save] ✗ Immediate save failed:', e);
        return false;
    }
}

// Save archived tasks to server
let archivedSaveTimeout = null;
function saveArchivedToServer(archived) {
    if (archivedSaveTimeout) clearTimeout(archivedSaveTimeout);
    archivedSaveTimeout = setTimeout(async () => {
        if (!authToken) return;
        try {
            await authFetch('/api/user-data/archived', {
                method: 'PUT',
                body: JSON.stringify({ data: archived })
            });
        } catch (e) { /* silent */ }
    }, 1000);
}

// Save column state to server
let columnSaveTimeout = null;
function saveColumnStateToServer() {
    if (columnSaveTimeout) clearTimeout(columnSaveTimeout);
    columnSaveTimeout = setTimeout(async () => {
        if (!authToken) return;
        try {
            await authFetch('/api/user-data/columns', {
                method: 'PUT',
                body: JSON.stringify({ data: columnState })
            });
        } catch (e) { /* silent */ }
    }, 1000);
}

// Sync board data to server for Telegram bot due-date notifications
let syncTimeout = null;
function syncBoardToServer() {
    if (!serverDataLoaded) return; // Don't sync default/empty data
    // Debounce: only sync after 3 seconds of inactivity
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
        if (!authToken) return;
        try {
            // Build a lightweight payload with all boards' tasks
            const allGroups = [];
            if (boardData.boardGroups) {
                for (const boardId of Object.keys(boardData.boardGroups)) {
                    const groups = boardData.boardGroups[boardId];
                    if (Array.isArray(groups)) allGroups.push(...groups);
                }
            }
            await fetch('/api/board/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
                body: JSON.stringify({ boardData: { groups: allGroups } })
            });
        } catch (e) { /* silent fail - notifications are not critical */ }
    }, 3000);
}

function loadFromStorage() {
    // Load from localStorage as immediate cache (fast, synchronous)
    try {
        let data = localStorage.getItem('numiBoardData');
        // Fallback: try old key in case rename lost the reference
        if (!data) {
            data = localStorage.getItem('mondayBoardData');
            if (data) {
                // Migrate old key to new key
                localStorage.setItem('numiBoardData', data);
                localStorage.removeItem('mondayBoardData');
            }
        }
        if (data) {
            boardData = JSON.parse(data);
            // Migration: old format had groups at top level without boardGroups
            if (!boardData.boardGroups) {
                boardData.boardGroups = {};
                const activeId = boardData.activeBoard || 'board1';
                if (boardData.groups && boardData.groups.length > 0) {
                    boardData.boardGroups[activeId] = boardData.groups;
                }
            }
            initBoardGroups();
            // Run migration after loading from storage
            migrateWolbySetupGroup();
        }
    } catch (e) {}
}

// Load from server (called after auth is confirmed)
async function loadFromServer() {
    if (!authToken) return;
    try {
        const wsParam = activeWorkspaceId ? `?workspaceId=${activeWorkspaceId}` : '';
        const res = await authFetch('/api/user-data/boards' + wsParam);
        const result = await res.json();
        if (result.success && result.data) {
            boardData = result.data;
            // Migration: old format
            if (!boardData.boardGroups) {
                boardData.boardGroups = {};
                const activeId = boardData.activeBoard || 'board1';
                if (boardData.groups && boardData.groups.length > 0) {
                    boardData.boardGroups[activeId] = boardData.groups;
                }
            }
            // One-time migration: restore 'וולבי - הקמה' group if missing
            migrateWolbySetupGroup();
            // Update localStorage cache
            try { localStorage.setItem('numiBoardData', JSON.stringify(boardData)); } catch (e) {}
            initBoardGroups();
            renderBoard();
            renderBoardSidebar();
            serverDataLoaded = true; // Allow saves now that real data is loaded
            return true;
        } else {
            // No data for this workspace — check if legacy (non-workspace) data exists to migrate
            if (activeWorkspaceId) {
                const migrated = await migrateFromLegacyData();
                if (migrated) return true;
            }
            // Server has no data yet - migrate localStorage data to server (first time)
            // One-time migration: restore 'וולבי - הקמה' group if missing
            migrateWolbySetupGroup();
            serverDataLoaded = true; // First-time user, safe to save
            if (boardData && boardData.boardGroups && Object.keys(boardData.boardGroups).length > 0) {
                saveToServer();
            }
            initBoardGroups();
            renderBoard();
            renderBoardSidebar();
            // Also migrate archived tasks if they exist in localStorage
            try {
                const archivedData = localStorage.getItem('numiArchivedTasks');
                if (archivedData) {
                    const archived = JSON.parse(archivedData);
                    if (archived.length > 0) saveArchivedToServer(archived);
                }
            } catch (e) {}
            // Also migrate column state
            try {
                const colData = localStorage.getItem('numiColumnState');
                if (colData) saveColumnStateToServer();
            } catch (e) {}
        }
    } catch (e) { /* fall back to localStorage data */ }
    return false;
}

// One-time migration: copy legacy data (stored without workspace ID) to the first workspace
async function migrateFromLegacyData() {
    try {
        const migrationKey = `numi_ws_migrated_${activeWorkspaceId}`;
        if (localStorage.getItem(migrationKey)) return false;
        
        // Check if legacy data exists (without workspace param)
        const legacyRes = await authFetch('/api/user-data/boards');
        const legacyResult = await legacyRes.json();
        if (legacyResult.success && legacyResult.data) {
            boardData = legacyResult.data;
            if (!boardData.boardGroups) {
                boardData.boardGroups = {};
                const activeId = boardData.activeBoard || 'board1';
                if (boardData.groups && boardData.groups.length > 0) {
                    boardData.boardGroups[activeId] = boardData.groups;
                }
            }
            migrateWolbySetupGroup();
            try { localStorage.setItem('numiBoardData', JSON.stringify(boardData)); } catch (e) {}
            initBoardGroups();
            renderBoard();
            renderBoardSidebar();
            serverDataLoaded = true;
            // Save to workspace-scoped key immediately
            await saveToServerImmediate(boardData, activeWorkspaceId);
            // Mark migration as done
            try { localStorage.setItem(migrationKey, '1'); } catch (e) {}
            console.log(`[Workspace] Migrated legacy data to workspace ${activeWorkspaceId}`);
            return true;
        }
    } catch (e) {
        console.error('[Workspace] Migration failed:', e);
    }
    return false;
}

// One-time migration: ensure 'וולבי - הקמה' group exists with all 26 tasks
function migrateWolbySetupGroup() {
    if (!boardData || !boardData.boardGroups) return;
    // Check migration flag first
    try { if (localStorage.getItem('numi_wolby_migrated_v2') === '1') return; } catch(e) {}
    
    // Check ALL boards - if the group already exists in any board, skip
    let alreadyExists = false;
    for (const bId of Object.keys(boardData.boardGroups)) {
        const bGroups = boardData.boardGroups[bId];
        if (Array.isArray(bGroups) && bGroups.some(g => g.id === 'g_wolby_setup' || g.name === '\u05D5\u05D5\u05DC\u05D1\u05D9 - \u05D4\u05E7\u05DE\u05D4')) {
            alreadyExists = true;
            break;
        }
    }
    if (alreadyExists) {
        try { localStorage.setItem('numi_wolby_migrated_v2', '1'); } catch(e) {}
        return;
    }

    // Insert into the ACTIVE board
    const boardId = boardData.activeBoard || Object.keys(boardData.boardGroups)[0] || 'board1';
    if (!boardData.boardGroups[boardId]) boardData.boardGroups[boardId] = [];
    const groups = boardData.boardGroups[boardId];

    const wolbyGroup = {
        id: 'g_wolby_setup',
        name: '\u05D5\u05D5\u05DC\u05D1\u05D9 - \u05D4\u05E7\u05DE\u05D4',
        color: '#784bd1',
        collapsed: false,
        tasks: [
            { id: 101, name: '\u05E9\u05D9\u05D5\u05DA \u05D2\u05D5\u05D2\u05DC \u05D0\u05E0\u05DC\u05D9\u05D8\u05D9\u05E7\u05E1', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 102, name: '\u05D4\u05E7\u05DE\u05EA \u05D2\u05D5\u05D2\u05DC \u05D8\u05D0\u05D2 \u05DE\u05E0\u05D2\u05F3\u05E8', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 103, name: '\u05E9\u05D9\u05D5\u05DA \u05D2\u05D5\u05D2\u05DC \u05D0\u05D3\u05E1', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 104, name: '\u05D4\u05E7\u05DE\u05EA \u05D2\u05D5\u05D2\u05DC \u05DE\u05E8\u05E6\u05F3\u05E0\u05D8', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 105, name: '\u05D4\u05E7\u05DE\u05EA \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7 \u05D1\u05D9\u05D6\u05E0\u05E1', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 106, name: '\u05D0\u05D9\u05DE\u05D5\u05EA \u05D3\u05D5\u05DE\u05D9\u05D9\u05DF \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 107, name: '\u05D7\u05D9\u05D1\u05D5\u05E8 \u05D2\u05D5\u05D2\u05DC \u05E1\u05E8\u05E6\u05F3 \u05E7\u05D5\u05E0\u05E1\u05D5\u05DC', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 108, name: '\u05D4\u05D8\u05DE\u05E2\u05EA \u05E7\u05DC\u05D0\u05E8\u05D9\u05D8\u05D9', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 109, name: '\u05D7\u05D9\u05D1\u05D5\u05E8 \u05D1\u05D5\u05E1 \u05E7\u05D5 \u05E4\u05D9\u05D9\u05DC\u05D5\u05D8', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 110, name: '\u05D4\u05E7\u05DE\u05EA \u05E2\u05E8\u05D5\u05E5 \u05D9\u05D5\u05D8\u05D9\u05D5\u05D1', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 111, name: '\u05D4\u05E7\u05DE\u05EA \u05E2\u05E8\u05D5\u05E5 \u05D8\u05D9\u05E7\u05D8\u05D5\u05E7', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 112, name: '\u05E9\u05D9\u05D5\u05DA \u05D0\u05D9\u05E0\u05E1\u05D8\u05D2\u05E8\u05DD', owner: '', status: 'done', dueDate: '2025-06-16', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 113, name: '\u05E9\u05D9\u05D5\u05DA \u05E2\u05DE\u05D5\u05D3 \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7 \u05E2\u05E1\u05E7\u05D9', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 114, name: '\u05D4\u05E7\u05DE\u05EA \u05D2\u05D5\u05D2\u05DC \u05E2\u05E1\u05E7\u05D9\u05DD', owner: '', status: 'working', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 115, name: '\u05D4\u05E7\u05DE\u05EA \u05D0\u05E4\u05DC \u05DE\u05E4\u05D5\u05EA', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 116, name: '\u05D4\u05E7\u05DE\u05EA \u05DB\u05DC\u05D9 \u05D5\u05D5\u05D1\u05DE\u05D0\u05E1\u05D8\u05E8 \u05E9\u05DC \u05D1\u05D9\u05E0\u05D2', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 117, name: '\u05D4\u05E7\u05DE\u05EA \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7 \u05DE\u05E8\u05E6\u05F3\u05E0\u05D8', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 118, name: '\u05E9\u05D9\u05DE\u05D5\u05E9 \u05D1\u05DB\u05DC\u05D9 \u05DC\u05EA\u05E7\u05E0\u05D4 13', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 119, name: '\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D3\u05E3 \u05DE\u05D3\u05D9\u05E0\u05D9\u05D5\u05EA \u05E4\u05E8\u05D8\u05D9\u05D5\u05EA', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 120, name: '\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D3\u05E3 \u05EA\u05E7\u05E0\u05D5\u05DF', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 121, name: '\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D3\u05E3 \u05DE\u05D3\u05D9\u05E0\u05D9\u05D5\u05EA \u05D4\u05D7\u05D6\u05E8\u05D9\u05DD', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 122, name: '\u05D1\u05E7\u05E9\u05D4 \u05DC\u05D4\u05E6\u05D4\u05E8\u05EA \u05E0\u05D2\u05D9\u05E9\u05D5\u05EA', owner: '', status: 'done', dueDate: '2025-06-14', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 123, name: '\u05D4\u05EA\u05E7\u05E0\u05EA \u05E4\u05D9\u05D3 \u05D3\u05D9\u05E0\u05D0\u05DE\u05D9 \u05DC\u05D2\u05D5\u05D2\u05DC \u05D5\u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 124, name: '\u05D4\u05E7\u05DE\u05EA \u05D7\u05E9\u05D1\u05D5\u05DF \u05DE\u05D5\u05D3\u05E2\u05D5\u05EA \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 125, name: '\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05DE\u05E8\u05D4 \u05D8\u05DC\u05E4\u05D5\u05DF | \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: 'done', dueDate: '2025-06-15', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false },
            { id: 126, name: '\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05DE\u05E8\u05D4 \u05D5\u05D5\u05D0\u05D8\u05E1\u05D0\u05E4 | \u05E7\u05D0\u05E1\u05D8\u05D5\u05DD \u05E2\u05DD \u05D8\u05D0\u05D2 \u05DE\u05E0\u05D2\u05F3\u05E8 | \u05E4\u05D9\u05D9\u05E1\u05D1\u05D5\u05E7', owner: '', status: '', dueDate: '', priority: '', notes: '', budget: 0, files: 0, timelineStart: '', timelineEnd: '', lastUpdated: nowISO(), subtasks: [], subtasksExpanded: false }
        ]
    };

    // Insert after first group (To-Do) or at position 1
    const insertIdx = groups.findIndex(g => g.name === 'Completed' || g.name === 'Done');
    if (insertIdx > 0) {
        groups.splice(insertIdx, 0, wolbyGroup);
    } else {
        groups.push(wolbyGroup);
    }

    // Set migration flag so it doesn't repeat
    try { localStorage.setItem('numi_wolby_migrated_v2', '1'); } catch(e) {}
    // Save to server immediately
    saveToServer();
}

// Load archived tasks from server
async function loadArchivedFromServer() {
    if (!authToken) return [];
    try {
        const res = await authFetch('/api/user-data/archived');
        const result = await res.json();
        if (result.success && result.data) {
            // Update localStorage cache
            try { localStorage.setItem('numiArchivedTasks', JSON.stringify(result.data)); } catch (e) {}
            return result.data;
        }
    } catch (e) { /* fall back */ }
    // Fallback to localStorage
    try {
        const data = localStorage.getItem('numiArchivedTasks');
        return data ? JSON.parse(data) : [];
    } catch (e) { return []; }
}

// Load column state from server
async function loadColumnStateFromServer() {
    if (!authToken) return;
    try {
        const res = await authFetch('/api/user-data/columns');
        const result = await res.json();
        if (result.success && result.data) {
            columnState = result.data;
            try { localStorage.setItem('numiColumnState', JSON.stringify(columnState)); } catch (e) {}
        }
    } catch (e) { /* fall back to localStorage */ }
}

// ===== Keyboard Shortcuts =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeInviteModal();
        const dropdown = document.getElementById('dropdownMenu');
        if (dropdown) dropdown.classList.remove('active');
    }
});

// ===== Close dropdown on outside click =====
document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('dropdownMenu');
    if (dropdown && dropdown.classList.contains('active') && !dropdown.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

// ===== Initialize =====
async function initApp() {
    loadFromStorage();
    initBoardGroups();
    loadAuthToken();

    // Check for Google OAuth callback (highest priority)
    if (await handleGoogleOAuthCallback()) {
        setupNewTaskButton();
        return;
    }

    // Check for Facebook OAuth callback
    if (await handleFacebookOAuthCallback()) {
        setupNewTaskButton();
        return;
    }

    // Restore session from server using saved token
    if (authToken) {
        try {
            const res = await authFetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                currentUser = data.user;
            } else {
                // Token invalid/expired
                authToken = null;
                currentUser = null;
                saveAuthToken();
            }
        } catch (e) {
            // Server unreachable, clear session
            authToken = null;
            currentUser = null;
            saveAuthToken();
        }
    }

    // Check URL for invite links
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (inviteToken) {
        showAuthScreen();
        showRegisterForm();
        // Verify invite and pre-fill email
        try {
            const res = await fetch(`/api/invites/verify/${inviteToken}`);
            if (res.ok) {
                const invite = await res.json();
                const emailInput = document.getElementById('regEmail');
                if (emailInput && invite.email) {
                    emailInput.value = invite.email;
                    emailInput.readOnly = true;
                    emailInput.style.background = '#f5f6f8';
                }
                // Store invite token for registration
                window._pendingInviteToken = inviteToken;
                // Show invite banner
                const regForm = document.getElementById('registerForm');
                if (regForm) {
                    const banner = document.createElement('div');
                    banner.style.cssText = 'background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;padding:12px;margin-bottom:16px;text-align:center;font-size:13px;color:#2e7d32;';
                    banner.innerHTML = `<strong>${invite.inviterName}</strong> מזמין אותך להצטרף ל-<strong>${invite.orgName}</strong>`;
                    regForm.insertBefore(banner, regForm.firstChild.nextSibling);
                }
            }
        } catch (e) { /* silent */ }
        return;
    }

    if (currentUser) {
        showAppScreen();
    } else {
        showAuthScreen();
    }

    setupNewTaskButton();
    setupPasswordValidation();
    renderBoardSidebar();
    cleanExpiredArchives();

    // Sprint 1.2 Task 8: Auto-refresh "last updated" column every 30 seconds
    // Only update text content, don't re-render the whole board (preserves column state)
    setInterval(() => {
        document.querySelectorAll('tr[data-task-id]').forEach(row => {
            const taskId = row.getAttribute('data-task-id');
            const groupId = row.getAttribute('data-group-id');
            const group = boardData.groups.find(g => String(g.id) === String(groupId));
            if (!group) return;
            const task = group.tasks.find(t => String(t.id) === String(taskId));
            if (!task) return;
            const cell = row.querySelector('.cell-updated span');
            if (cell) {
                cell.textContent = formatLastUpdated(task.lastUpdated);
            }
        });
    }, 30000);

    // Close modals on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // Wire up invite role select change
    const inviteRoleSelect = document.getElementById('inviteRole');
    if (inviteRoleSelect) {
        inviteRoleSelect.addEventListener('change', function() {
            updateInviteRoleDescriptions(this.value);
        });
    }

    // Wire up invite role description clicks
    document.querySelectorAll('.invite-role-desc').forEach(desc => {
        desc.addEventListener('click', function() {
            const role = this.dataset.role;
            if (role) {
                const select = document.getElementById('inviteRole');
                if (select) select.value = role;
                updateInviteRoleDescriptions(role);
            }
        });
    });
}

// ============================================================
// ADMIN DASHBOARD (Super Admin Only)
// ============================================================
let adminState = {
    sort: 'createdAt',
    order: 'desc',
    page: 1,
    searchTimeout: null
};

function toggleAdminDashboard() {
    const dash = document.getElementById('adminDashboard');
    if (dash.style.display === 'none' || !dash.style.display) {
        dash.style.display = 'flex';
        loadAdminUsers(1);
    } else {
        dash.style.display = 'none';
    }
}

function closeAdminDashboard() {
    document.getElementById('adminDashboard').style.display = 'none';
}

function showAdminLink() {
    const link = document.getElementById('adminDashboardLink');
    if (link && currentUser && currentUser.role === 'super_admin') {
        link.style.display = 'block';
    } else if (link) {
        link.style.display = 'none';
    }
}

function adminDebounceSearch() {
    clearTimeout(adminState.searchTimeout);
    adminState.searchTimeout = setTimeout(() => loadAdminUsers(1), 300);
}

function adminSortBy(field) {
    if (adminState.sort === field) {
        adminState.order = adminState.order === 'asc' ? 'desc' : 'asc';
    } else {
        adminState.sort = field;
        adminState.order = 'asc';
    }
    // Update header icons
    document.querySelectorAll('.admin-th.sortable').forEach(th => {
        const icon = th.querySelector('.sort-icon');
        if (th.dataset.sort === field) {
            th.classList.add('sort-active');
            icon.textContent = adminState.order === 'asc' ? 'expand_less' : 'expand_more';
        } else {
            th.classList.remove('sort-active');
            icon.textContent = 'unfold_more';
        }
    });
    loadAdminUsers(adminState.page);
}

async function loadAdminUsers(page) {
    adminState.page = page || 1;
    const search = document.getElementById('adminSearch').value.trim();
    const role = document.getElementById('adminFilterRole').value;
    const provider = document.getElementById('adminFilterProvider').value;
    const limit = document.getElementById('adminPageSize').value;

    const params = new URLSearchParams({
        page: adminState.page,
        limit,
        sort: adminState.sort,
        order: adminState.order,
        search,
        role,
        provider
    });

    const tbody = document.getElementById('adminTableBody');
    tbody.innerHTML = '<tr><td colspan="7" class="admin-loading"><span class="material-icons-outlined" style="animation: spin 1s linear infinite; font-size:20px;">sync</span> Loading...</td></tr>';

    try {
        const res = await authFetch('/api/admin/users?' + params.toString());
        if (!res.ok) {
            const err = await res.json();
            tbody.innerHTML = `<tr><td colspan="7" class="admin-loading" style="color:#e2445c">${escapeHtml(err.error || 'Error loading users')}</td></tr>`;
            return;
        }
        const data = await res.json();
        renderAdminTable(data.users, data.pagination);
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-loading" style="color:#e2445c">Connection error</td></tr>';
    }
}

function renderAdminTable(users, pagination) {
    const tbody = document.getElementById('adminTableBody');

    if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="admin-loading">No users found</td></tr>';
        renderAdminPagination(pagination);
        return;
    }

    const PROVIDER_LABELS = { local: 'Email', google: 'Google', facebook: 'Facebook', invited: 'Invited', oauth: 'OAuth' };
    const PROVIDER_ICONS = {
        google: '<svg width="14" height="14" viewBox="0 0 48 48"><path fill="#4285F4" d="M44.5 20H24v8.5h11.7C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>',
        facebook: '<svg width="14" height="14" viewBox="0 0 48 48"><path fill="#1877F2" d="M48 24C48 10.7 37.3 0 24 0S0 10.7 0 24c0 12 8.8 21.9 20.3 23.7V30.9h-6.1V24h6.1v-5.3c0-6 3.6-9.3 9-9.3 2.6 0 5.4.5 5.4.5v5.9h-3c-3 0-3.9 1.9-3.9 3.8V24h6.6l-1.1 6.9h-5.5v16.8C39.2 45.9 48 36 48 24z"/></svg>',
        local: '<span class="material-icons-outlined" style="font-size:14px">email</span>',
        invited: '<span class="material-icons-outlined" style="font-size:14px">mail_outline</span>'
    };

    let html = '';
    users.forEach(user => {
        const initials = getInitials(user.fullName || user.email);
        const isSuperAdmin = user.role === 'super_admin';
        const avatarHtml = user.picture
            ? `<img src="${user.picture}" alt="${escapeHtml(initials)}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;" referrerpolicy="no-referrer" onerror="this.outerHTML='<span>${escapeHtml(initials)}</span>'">`
            : `<span>${escapeHtml(initials)}</span>`;

        const providerKey = user.provider || 'local';
        const providerLabel = PROVIDER_LABELS[providerKey] || providerKey;
        const providerIcon = PROVIDER_ICONS[providerKey] || '';

        // Role cell: dropdown for non-super-admins, badge for super admin
        let roleHtml;
        if (isSuperAdmin) {
            roleHtml = `<span class="admin-role-badge super_admin">Super Admin</span>`;
        } else {
            roleHtml = `<select class="admin-role-select" data-email="${escapeHtml(user.email)}" data-provider="${escapeHtml(user.provider || 'local')}" onchange="adminChangeRole(this)">
                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="member" ${user.role === 'member' ? 'selected' : ''}>Member</option>
                <option value="viewer" ${user.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            </select>`;
        }

        // Dates
        const lastLoginMethod = user.lastLoginMethod || '';
        const methodLabel = { email: 'Email', google: 'Google', facebook: 'Facebook', register: 'Register', oauth: 'OAuth' }[lastLoginMethod] || '';
        const lastLogin = user.lastLoginAt
            ? formatAdminDate(user.lastLoginAt) + (methodLabel ? `<div class="admin-date-time" style="color:#0073ea">${methodLabel}</div>` : '')
            : '<span class="admin-no-data">Never</span>';
        const createdAt = user.createdAt ? formatAdminDate(user.createdAt) : '<span class="admin-no-data">—</span>';
        const ip = user.lastLoginIP ? `<span class="admin-ip">${escapeHtml(user.lastLoginIP)}</span>` : '<span class="admin-no-data">—</span>';

        html += `<tr>
            <td>
                <div class="admin-user-name">
                    <div class="admin-user-avatar">${avatarHtml}</div>
                    <span class="admin-name-text">${escapeHtml(user.fullName || user.email)}</span>
                </div>
            </td>
            <td style="font-size:12.5px;color:#676879">${escapeHtml(user.email)}</td>
            <td>${roleHtml}</td>
            <td>${ip}</td>
            <td>${lastLogin}</td>
            <td>${createdAt}</td>
            <td><span class="admin-provider-badge ${providerKey}">${providerIcon} ${providerLabel}</span></td>
        </tr>`;
    });

    tbody.innerHTML = html;
    renderAdminPagination(pagination);
}

function formatAdminDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `<div class="admin-date">${day}/${month}/${year}</div><div class="admin-date-time">${hours}:${mins}</div>`;
}

function renderAdminPagination(pagination) {
    const container = document.getElementById('adminPagination');
    if (!pagination || pagination.totalPages <= 1) {
        container.innerHTML = pagination ? `<span class="admin-page-info">Showing ${pagination.total} user(s)</span>` : '';
        return;
    }

    const { page, totalPages, total } = pagination;
    let html = '';

    // Previous button
    html += `<button class="admin-page-btn" onclick="loadAdminUsers(${page - 1})" ${page <= 1 ? 'disabled' : ''}>
        <span class="material-icons-outlined" style="font-size:18px">chevron_right</span>
    </button>`;

    // Page numbers
    const range = [];
    const delta = 2;
    for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
        range.push(i);
    }
    if (range[0] > 1) {
        html += `<button class="admin-page-btn" onclick="loadAdminUsers(1)">1</button>`;
        if (range[0] > 2) html += `<span class="admin-page-info">...</span>`;
    }
    range.forEach(p => {
        html += `<button class="admin-page-btn ${p === page ? 'active' : ''}" onclick="loadAdminUsers(${p})">${p}</button>`;
    });
    if (range[range.length - 1] < totalPages) {
        if (range[range.length - 1] < totalPages - 1) html += `<span class="admin-page-info">...</span>`;
        html += `<button class="admin-page-btn" onclick="loadAdminUsers(${totalPages})">${totalPages}</button>`;
    }

    // Next button
    html += `<button class="admin-page-btn" onclick="loadAdminUsers(${page + 1})" ${page >= totalPages ? 'disabled' : ''}>
        <span class="material-icons-outlined" style="font-size:18px">chevron_left</span>
    </button>`;

    html += `<span class="admin-page-info">${total} users total</span>`;
    container.innerHTML = html;
}

async function adminChangeRole(selectEl) {
    const email = selectEl.dataset.email;
    const role = selectEl.value;

    // Store original value for rollback
    const originalValue = selectEl.getAttribute('data-original') || selectEl.value;
    selectEl.setAttribute('data-original', originalValue);
    selectEl.disabled = true;

    try {
        const provider = selectEl.dataset.provider || '';
        const res = await authFetch('/api/admin/update-role', {
            method: 'POST',
            body: JSON.stringify({ email, role, provider })
        });
        const data = await res.json();
        if (data.success) {
            showToast(`Role updated to ${role.charAt(0).toUpperCase() + role.slice(1)}`);
            selectEl.removeAttribute('data-original');
        } else {
            showToast(data.error || 'Failed to update role');
            selectEl.value = originalValue;
        }
    } catch (e) {
        showToast('Connection error');
        selectEl.value = originalValue;
    } finally {
        selectEl.disabled = false;
    }
}

// Close admin dashboard on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const dash = document.getElementById('adminDashboard');
        if (dash && dash.style.display !== 'none') {
            closeAdminDashboard();
        }
    }
});

// Add spin animation for loading
if (!document.getElementById('adminSpinStyle')) {
    const style = document.createElement('style');
    style.id = 'adminSpinStyle';
    style.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
}

// ===== Admin Dashboard - Tab Switching =====
function switchAdminTab(tab) {
    document.getElementById('adminUsersTab').style.display = tab === 'users' ? '' : 'none';
    document.getElementById('adminEmailTab').style.display = tab === 'email' ? '' : 'none';
    document.getElementById('adminSnapshotsTab').style.display = tab === 'snapshots' ? '' : 'none';
    document.getElementById('adminTabUsers').classList.toggle('active', tab === 'users');
    document.getElementById('adminTabEmail').classList.toggle('active', tab === 'email');
    document.getElementById('adminTabSnapshots').classList.toggle('active', tab === 'snapshots');
    if (tab === 'email') {
        loadPendingInvites();
        loadEmailPreferences();
        populateInviteWorkspaceSelect();
    }
    if (tab === 'snapshots') {
        loadSnapshotData();
    }
}

// ===== Admin - Invite Wizard Step Navigation =====
async function inviteNextStep(currentStep) {
    const resultDiv = document.getElementById('inviteResult');
    // Validate current step
    if (currentStep === 1) {
        const email = document.getElementById('adminInviteEmail').value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            resultDiv.innerHTML = '<span style="color:#e2445c">Please enter a valid email address</span>';
            return;
        }
        // Check if user already exists in system
        resultDiv.innerHTML = '<span style="color:#676879">Checking...</span>';
        try {
            const res = await authFetch(`/api/admin/check-user?email=${encodeURIComponent(email)}`);
            const data = await res.json();
            if (data.exists) {
                resultDiv.innerHTML = `<span style="color:#fdab3d"><span class="material-icons-outlined" style="font-size:14px;vertical-align:middle">info</span> User already registered (${data.fullName}). Invite will add them to workspace.</span>`;
            } else {
                resultDiv.innerHTML = `<span style="color:#00c875"><span class="material-icons-outlined" style="font-size:14px;vertical-align:middle">check_circle</span> New user — invite will be sent to ${email}</span>`;
            }
        } catch (e) {
            resultDiv.innerHTML = '';
        }
    }
    if (currentStep === 2) {
        const ws = document.getElementById('inviteWorkspaceSelect').value;
        if (!ws) {
            resultDiv.innerHTML = '<span style="color:#e2445c">Please select a workspace</span>';
            return;
        }
        resultDiv.innerHTML = '';
    }
    // Show next step
    document.getElementById(`inviteStep${currentStep}`).classList.remove('active');
    document.getElementById(`inviteStep${currentStep + 1}`).classList.add('active');
    // Load data for next step
    if (currentStep === 1) populateInviteWorkspaceSelect();
}

function inviteBackStep(currentStep) {
    document.getElementById(`inviteStep${currentStep}`).classList.remove('active');
    document.getElementById(`inviteStep${currentStep - 1}`).classList.add('active');
}

function resetInviteWizard() {
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`inviteStep${i}`);
        if (step) step.classList.remove('active');
    }
    document.getElementById('inviteStep1').classList.add('active');
    document.getElementById('adminInviteEmail').value = '';
    document.getElementById('inviteResult').innerHTML = '';
}

// ===== Admin - Populate Workspace Select for Invites =====
async function populateInviteWorkspaceSelect() {
    const select = document.getElementById('inviteWorkspaceSelect');
    if (!select) return;
    try {
        const res = await authFetch('/api/workspaces');
        if (!res.ok) return;
        const data = await res.json();
        const workspaces = data.workspaces || [];
        select.innerHTML = '<option value="">-- Select workspace --</option>';
        workspaces.forEach(ws => {
            select.innerHTML += `<option value="${ws.id}">${escapeHtml(ws.name)}</option>`;
        });
        if (activeWorkspaceId) {
            select.value = activeWorkspaceId;
            onInviteWorkspaceChange();
        }
    } catch (e) {
        console.error('Failed to load workspaces for invite select:', e);
    }
}

// Load boards for the selected workspace into the board dropdown
async function onInviteWorkspaceChange() {
    const wsSelect = document.getElementById('inviteWorkspaceSelect');
    const boardSelect = document.getElementById('inviteBoardSelect');
    if (!boardSelect) return;
    const workspaceId = wsSelect ? wsSelect.value : '';
    boardSelect.innerHTML = '<option value="">All boards (no restriction)</option>';
    if (!workspaceId) return;
    try {
        const res = await authFetch(`/api/user-data/boards?workspaceId=${workspaceId}`);
        if (!res.ok) return;
        const result = await res.json();
        if (result.success && result.data && result.data.boards) {
            result.data.boards.filter(b => !b.archived).forEach(board => {
                boardSelect.innerHTML += `<option value="${board.id}">${escapeHtml(board.name)}</option>`;
            });
        }
    } catch (e) {
        console.error('Failed to load boards for invite:', e);
    }
}

// ===== Admin - Send Invite =====
async function sendInviteEmail() {
    const email = document.getElementById('adminInviteEmail').value.trim();
    const wsSelect = document.getElementById('inviteWorkspaceSelect');
    const boardSelect = document.getElementById('inviteBoardSelect');
    const roleSelect = document.getElementById('inviteRoleSelect');
    const workspaceId = wsSelect ? wsSelect.value : '';
    const boardId = boardSelect ? boardSelect.value : '';
    const role = roleSelect ? roleSelect.value : 'member';
    const orgName = wsSelect && wsSelect.selectedOptions[0] ? wsSelect.selectedOptions[0].textContent.trim() : 'Main workspace';
    const resultDiv = document.getElementById('inviteResult');

    if (!email) { resultDiv.innerHTML = '<span style="color:#e2445c">Please enter an email address</span>'; return; }
    if (!workspaceId) { resultDiv.innerHTML = '<span style="color:#e2445c">Please select a workspace</span>'; return; }
    resultDiv.innerHTML = '<span style="color:#676879">Sending...</span>';

    try {
        const res = await authFetch('/api/invites/send', {
            method: 'POST',
            body: JSON.stringify({ email, orgName, workspaceId, boardId: boardId || null, role })
        });
        const data = await res.json();
        if (data.success) {
            resultDiv.innerHTML = `<span style="color:#00c875">✅ Invite sent to ${email}</span>`;
            loadPendingInvites();
            setTimeout(() => resetInviteWizard(), 2000);
        } else {
            resultDiv.innerHTML = `<span style="color:#e2445c">❌ ${data.error}</span>`;
        }
    } catch (e) {
        resultDiv.innerHTML = '<span style="color:#e2445c">Connection error</span>';
    }
}

// ===== Admin - Load Pending Invites =====
async function loadPendingInvites() {
    const container = document.getElementById('pendingInvitesList');
    try {
        const res = await authFetch('/api/invites');
        const invites = await res.json();
        if (!invites.length) {
            container.innerHTML = '<p style="color:#999;font-size:13px">No pending invites</p>';
            return;
        }
        let html = '<table class="admin-email-table"><thead><tr><th>Email</th><th>Organization</th><th>Status</th><th>Sent</th></tr></thead><tbody>';
        invites.forEach(inv => {
            const status = inv.used ? '<span style="color:#00c875">Accepted</span>' :
                           new Date(inv.expiresAt) < new Date() ? '<span style="color:#e2445c">Expired</span>' :
                           '<span style="color:#fdab3d">Pending</span>';
            const date = new Date(inv.createdAt).toLocaleDateString('he-IL');
            html += `<tr><td>${inv.email}</td><td>${inv.orgName}</td><td>${status}</td><td>${date}</td></tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="color:#e2445c">Failed to load invites</p>';
    }
}

// ===== Admin - Email Preferences =====
async function loadEmailPreferences() {
    const container = document.getElementById('emailPreferencesTable');
    try {
        const res = await authFetch('/api/admin/email-preferences');
        const users = await res.json();
        if (!users.length) {
            container.innerHTML = '<p style="color:#999">No users</p>';
            return;
        }
        let html = '<table class="admin-email-table"><thead><tr><th>User</th><th>Email</th><th>Invites</th><th>Notifications</th><th>Updates</th></tr></thead><tbody>';
        users.forEach(u => {
            const p = u.emailPrefs;
            html += `<tr>
                <td>${u.fullName}</td>
                <td>${u.email}</td>
                <td><input type="checkbox" ${p.invites !== false ? 'checked' : ''} onchange="updateUserEmailPref('${u.email}', 'invites', this.checked)"></td>
                <td><input type="checkbox" ${p.notifications !== false ? 'checked' : ''} onchange="updateUserEmailPref('${u.email}', 'notifications', this.checked)"></td>
                <td><input type="checkbox" ${p.updates !== false ? 'checked' : ''} onchange="updateUserEmailPref('${u.email}', 'updates', this.checked)"></td>
            </tr>`;
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch (e) {
        container.innerHTML = '<p style="color:#e2445c">Failed to load preferences</p>';
    }
}

async function updateUserEmailPref(email, field, value) {
    try {
        await authFetch(`/api/admin/email-preferences/${encodeURIComponent(email)}`, {
            method: 'PUT',
            body: JSON.stringify({ [field]: value })
        });
    } catch (e) { /* silent */ }
}

// ===== Admin - Send Bulk Notification =====
async function sendBulkNotificationEmail() {
    const subject = document.getElementById('notifSubject').value.trim();
    const bodyText = document.getElementById('notifBody').value.trim();
    const resultDiv = document.getElementById('notifResult');

    if (!subject || !bodyText) { resultDiv.innerHTML = '<span style="color:#e2445c">Subject and message are required</span>'; return; }
    resultDiv.innerHTML = '<span style="color:#676879">Sending...</span>';

    try {
        // Get all users first
        const usersRes = await authFetch('/api/admin/users');
        const usersData = await usersRes.json();
        const recipients = (usersData.users || []).map(u => ({ email: u.email, fullName: u.fullName, provider: u.provider }));

        const res = await authFetch('/api/email/send-notification', {
            method: 'POST',
            body: JSON.stringify({ recipients, subject, bodyText, orgName: 'Main workspace' })
        });
        const data = await res.json();
        if (data.success) {
            const sent = data.results.filter(r => r.success).length;
            const skipped = data.results.filter(r => r.skipped).length;
            resultDiv.innerHTML = `<span style="color:#00c875">✅ Sent: ${sent} | Skipped (opted out): ${skipped}</span>`;
            document.getElementById('notifSubject').value = '';
            document.getElementById('notifBody').value = '';
        } else {
            resultDiv.innerHTML = `<span style="color:#e2445c">❌ ${data.error}</span>`;
        }
    } catch (e) {
        resultDiv.innerHTML = '<span style="color:#e2445c">Connection error</span>';
    }
}

// ============================================================
// BOARD SIDEBAR + CONTEXT MENU (Sprint 1.2 Tasks 12-13)
// ============================================================
// Update the board title in the header to match the active board
function updateBoardTitle() {
    const titleEl = document.querySelector('.board-title');
    if (!titleEl) return;
    const board = boardData.boards ? boardData.boards.find(b => b.id === boardData.activeBoard) : null;
    const name = board ? board.name : (boardData.name || 'ניסיון');
    titleEl.textContent = name;
}

// Inline edit board title on click
function startBoardTitleEdit() {
    const titleEl = document.querySelector('.board-title');
    if (!titleEl) return;
    const board = boardData.boards ? boardData.boards.find(b => b.id === boardData.activeBoard) : null;
    if (!board) return;
    if (!canEdit()) return;

    const currentName = board.name;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'board-title-input';
    input.dir = 'rtl';
    input.style.cssText = 'font-size:24px;font-weight:700;color:#323338;border:none;border-bottom:2px solid #6161ff;outline:none;background:transparent;padding:0;margin:0;width:100%;font-family:inherit;';

    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();

    function finishEdit() {
        const newName = input.value.trim();
        if (newName && newName !== currentName) {
            board.name = newName;
            renderBoardSidebar();
            saveToStorage();
        }
        titleEl.textContent = board.name;
    }

    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = currentName; input.blur(); }
    });
}

function renderBoardSidebar() {
    if (!boardData.boards) {
        boardData.boards = [{ id: 'board1', name: boardData.name || 'ניסיון', color: '#0073ea', archived: false, createdAt: nowISO() }];
        boardData.activeBoard = 'board1';
    }
    const list = document.querySelector('.sidebar-project-list');
    if (!list) return;
    let html = '';
    boardData.boards.filter(b => !b.archived).forEach(board => {
        const isActive = board.id === boardData.activeBoard;
        html += `<a href="#" class="sidebar-item project-item ${isActive ? 'active' : ''}" data-board="${board.id}" onclick="event.preventDefault(); switchBoard('${board.id}')" oncontextmenu="event.preventDefault(); showBoardContextMenu(event, '${board.id}')">
            <span class="material-icons-outlined">table_chart</span>
            <span class="sidebar-label" dir="rtl">${escapeHtml(board.name)}</span>
            <span class="board-menu-trigger material-icons-outlined" onclick="event.preventDefault(); event.stopPropagation(); showBoardContextMenu(event, '${board.id}')">more_horiz</span>
        </a>`;
    });

    list.innerHTML = html;
    // Show the ellipsis on hover
    list.querySelectorAll('.project-item').forEach(item => {
        item.addEventListener('mouseenter', () => { const t = item.querySelector('.board-menu-trigger'); if (t) t.style.opacity = '1'; });
        item.addEventListener('mouseleave', () => { const t = item.querySelector('.board-menu-trigger'); if (t) t.style.opacity = '0'; });
    });
}

function switchBoard(boardId) {
    // Save current board's groups before switching
    if (boardData.activeBoard && boardData.boardGroups) {
        boardData.boardGroups[boardData.activeBoard] = boardData.groups;
    }
    boardData.activeBoard = boardId;
    // Load target board's groups
    if (!boardData.boardGroups) boardData.boardGroups = {};
    if (!boardData.boardGroups[boardId]) boardData.boardGroups[boardId] = [];
    boardData.groups = boardData.boardGroups[boardId];
    const board = boardData.boards.find(b => b.id === boardId);
    if (board) {
        const titleEl = document.querySelector('.board-title');
        if (titleEl) titleEl.textContent = board.name;
    }
    renderBoardSidebar();
    renderBoard();
}

function showBoardContextMenu(event, boardId) {
    event.stopPropagation();
    const board = boardData.boards.find(b => b.id === boardId);
    if (!board) return;
    let existing = document.getElementById('boardContextMenu');
    if (existing) existing.remove();
    const menu = document.createElement('div');
    menu.id = 'boardContextMenu';
    menu.className = 'board-context-menu';
    menu.innerHTML = `
        <div class="board-ctx-item" onclick="boardCtxAction('newtab', '${boardId}')"><span class="material-icons-outlined">open_in_new</span>Open in new tab</div>
        <div class="board-ctx-item" onclick="boardCtxAction('rename', '${boardId}')"><span class="material-icons-outlined">edit</span>Rename</div>
        <div class="board-ctx-item" onclick="boardCtxAction('duplicate', '${boardId}')"><span class="material-icons-outlined">content_copy</span>Duplicate</div>
        <div class="board-ctx-item" onclick="boardCtxAction('template', '${boardId}')"><span class="material-icons-outlined">save</span>Save as template</div>
        <div class="board-ctx-divider"></div>
        <div class="board-ctx-item" onclick="boardCtxAction('archive', '${boardId}')"><span class="material-icons-outlined">archive</span>Archive</div>
        <div class="board-ctx-item board-ctx-danger" onclick="boardCtxAction('delete', '${boardId}')"><span class="material-icons-outlined">delete</span>Delete</div>
    `;
    document.body.appendChild(menu);
    menu.style.top = event.clientY + 'px';
    menu.style.left = event.clientX + 'px';
    // Adjust if overflowing
    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
        if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
    });
    const close = (e) => {
        if (!menu.contains(e.target)) { menu.remove(); document.removeEventListener('click', close); }
    };
    setTimeout(() => document.addEventListener('click', close), 10);
}

function boardCtxAction(action, boardId) {
    const board = boardData.boards.find(b => b.id === boardId);
    if (!board) return;
    const menu = document.getElementById('boardContextMenu');
    if (menu) menu.remove();
    switch (action) {
        case 'newtab':
            showToast('Open in new tab: coming soon');
            break;
        case 'rename':
            const newName = prompt('Board name:', board.name);
            if (newName && newName.trim()) { board.name = newName.trim(); updateBoardTitle(); renderBoardSidebar(); saveToStorage(); }
            break;
        case 'duplicate':
            const dupId = 'board' + newId();
            const dup = { ...board, id: dupId, name: board.name + ' (copy)', createdAt: nowISO() };
            boardData.boards.push(dup);
            // Deep-clone the source board's groups so the duplicate is fully independent
            const sourceGroups = boardData.boardGroups[boardId] || boardData.groups;
            boardData.boardGroups[dupId] = JSON.parse(JSON.stringify(sourceGroups));
            // Assign new IDs to all groups and tasks in the clone to avoid ID collisions
            boardData.boardGroups[dupId].forEach(g => {
                g.id = 'g' + newId();
                g.tasks.forEach(t => {
                    t.id = newId();
                    if (t.subtasks) t.subtasks.forEach(s => { s.id = newId(); });
                });
            });
            renderBoardSidebar();
            saveToStorage();
            showToast('Board duplicated');
            break;
        case 'template':
            showToast('Saved as template');
            break;
        case 'archive':
            if (boardData.boards.filter(b => !b.archived).length <= 1) { showToast('Cannot archive the last board'); return; }
            board.archived = true;
            board.archivedAt = nowISO();
            if (boardData.activeBoard === boardId) {
                const next = boardData.boards.find(b => !b.archived);
                if (next) switchBoard(next.id);
            }
            renderBoardSidebar();
            saveToStorage();
            showToast('Board archived (30-day restore)');
            break;
        case 'delete':
            if (boardData.boards.filter(b => !b.archived).length <= 1) { showToast('Cannot delete the last board'); return; }
            if (!confirm('Permanently delete this board?')) return;
            // Remove board's groups data
            if (boardData.boardGroups) delete boardData.boardGroups[boardId];
            boardData.boards = boardData.boards.filter(b => b.id !== boardId);
            if (boardData.activeBoard === boardId) {
                const next = boardData.boards.find(b => !b.archived);
                if (next) switchBoard(next.id);
            }
            renderBoardSidebar();
            saveToStorage();
            showToast('Board deleted permanently');
            break;
    }
}

// ============================================================
// ARCHIVE (30-DAY) + PERMANENT DELETE (Sprint 1.2 Task 11)
// ============================================================
function floatingBarArchive30() {
    const items = getSelectedTaskObjects();
    const subItems = getSelectedSubtaskObjects();
    if (items.length === 0 && subItems.length === 0) return;
    const totalCount = items.length + subItems.length;
    if (!confirm(`Archive ${totalCount} item(s)? They can be restored within 30 days.`)) return;

    let archived = [];
    try {
        const data = localStorage.getItem('numiArchivedTasks');
        if (data) archived = JSON.parse(data);
    } catch (e) { /* ignore */ }

    items.forEach(({ group, task }) => {
        group.tasks = group.tasks.filter(t => t.id !== task.id);
        archived.push({
            ...task,
            archivedAt: nowISO(),
            fromGroup: group.name,
            fromGroupId: group.id
        });
    });
    subItems.forEach(({ task, subtask }) => {
        task.subtasks = task.subtasks.filter(s => s.id !== subtask.id);
        task.lastUpdated = nowISO();
        archived.push({
            ...subtask,
            _isSubtask: true,
            archivedAt: nowISO(),
            fromParentTask: task.name,
            fromParentTaskId: task.id
        });
    });

    try {
        localStorage.setItem('numiArchivedTasks', JSON.stringify(archived));
    } catch (e) { /* ignore */ }
    saveArchivedToServer(archived);

    clearSelection();
    renderBoard();
    showToast(`${totalCount} item(s) archived (30-day restore)`);
}

function floatingBarPermanentDelete() {
    const taskCount = selectedTasks.size;
    const subItems = getSelectedSubtaskObjects();
    const totalCount = taskCount + subItems.length;
    if (!confirm(`PERMANENTLY delete ${totalCount} selected item(s)? This cannot be undone.`)) return;
    const items = getSelectedTaskObjects();
    items.forEach(({ group, task }) => {
        group.tasks = group.tasks.filter(t => t.id !== task.id);
    });
    subItems.forEach(({ task, subtask }) => {
        task.subtasks = task.subtasks.filter(s => s.id !== subtask.id);
        task.lastUpdated = nowISO();
    });
    clearSelection();
    renderBoard();
    showToast(`${totalCount} item(s) permanently deleted`);
}

// Clean up expired archives (> 30 days)
function cleanExpiredArchives() {
    try {
        const data = localStorage.getItem('numiArchivedTasks');
        if (!data) return;
        const archived = JSON.parse(data);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const valid = archived.filter(a => new Date(a.archivedAt) > cutoff);
        if (valid.length !== archived.length) {
            localStorage.setItem('numiArchivedTasks', JSON.stringify(valid));
            saveArchivedToServer(valid);
        }
    } catch (e) { /* ignore */ }
}

// ============================================================
// LOGIN LOADING SPINNER (Sprint 1.2 Task 14)
// ============================================================
function showAuthLoading(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const btn = form.querySelector('button[type="submit"], .auth-btn-primary');
    if (btn) {
        btn.dataset.originalText = btn.textContent;
        btn.innerHTML = '<span class="auth-spinner"></span> Loading...';
        btn.disabled = true;
    }
}

function hideAuthLoading(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const btn = form.querySelector('button[type="submit"], .auth-btn-primary');
    if (btn) {
        btn.textContent = btn.dataset.originalText || 'Submit';
        btn.disabled = false;
    }
}

// ============================================================
// PASSWORD VALIDATION (Sprint 1.2 Task 15)
// ============================================================
const PASSWORD_RULES = [
    { id: 'length', label: 'At least 8 characters', test: p => p.length >= 8 },
    { id: 'upper', label: 'Uppercase letter (A-Z)', test: p => /[A-Z]/.test(p) },
    { id: 'lower', label: 'Lowercase letter (a-z)', test: p => /[a-z]/.test(p) },
    { id: 'number', label: 'Number (0-9)', test: p => /[0-9]/.test(p) },
    { id: 'special', label: 'Special character (!@#$%^&*)', test: p => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) }
];

function renderPasswordValidation(containerId, password) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let allPass = true;
    let html = '<div class="password-rules">';
    PASSWORD_RULES.forEach(rule => {
        const pass = rule.test(password);
        if (!pass) allPass = false;
        html += `<div class="pw-rule ${pass ? 'pass' : 'fail'}">
            <span class="material-icons-outlined" style="font-size:14px">${pass ? 'check_circle' : 'cancel'}</span>
            ${rule.label}
        </div>`;
    });
    html += '</div>';
    container.innerHTML = html;
    return allPass;
}

function setupPasswordValidation() {
    const regPassword = document.getElementById('regPassword');
    if (!regPassword) return;
    
    // Add validation container after password field
    let validContainer = document.getElementById('passwordValidation');
    if (!validContainer) {
        validContainer = document.createElement('div');
        validContainer.id = 'passwordValidation';
        regPassword.parentElement.appendChild(validContainer);
    }
    
    regPassword.addEventListener('input', function() {
        renderPasswordValidation('passwordValidation', this.value);
    });
}

document.addEventListener('DOMContentLoaded', initApp);
if (document.readyState !== 'loading') initApp();

// ============================================================
// SPRINT 1.2 TASK 16: Column Resize, Column Drag & Drop, Row Drag & Drop
// ============================================================

// --- Column state persistence ---
// Stores column order and widths so they survive re-renders
let columnState = {
    order: null, // array of data-col values, e.g. ['color','checkbox','task','owner',...]
    widths: {}   // { 'owner': 120, 'status': 100, ... }
};

function loadColumnState() {
    try {
        const saved = localStorage.getItem('numiColumnState');
        if (saved) columnState = JSON.parse(saved);
    } catch(e) {}
}

function saveColumnState() {
    try {
        localStorage.setItem('numiColumnState', JSON.stringify(columnState));
    } catch(e) {}
    saveColumnStateToServer();
}

// Load column state on startup
loadColumnState();

// --- Post-render hook: apply widths and init row drag ---
const _originalRenderBoard = renderBoard;
renderBoard = function() {
    _originalRenderBoard.apply(this, arguments);
    // Apply saved column widths (order is already handled by getOrderedColumns in rendering)
    if (Object.keys(columnState.widths).length > 0) {
        document.querySelectorAll('.board-table thead th').forEach(th => {
            const col = th.getAttribute('data-col');
            if (col && columnState.widths[col]) {
                const w = columnState.widths[col];
                th.style.width = w + 'px';
                th.style.minWidth = w + 'px';
            }
        });
    }
    initRowDragAndDrop();
    initGroupDragAndDrop();
};

// --- Column Resizing (updates colgroup across all tables) ---
(function() {
    let resizing = false;
    let resizeTh = null;
    let startX = 0;
    let startWidth = 0;
    let nextTh = null;
    let nextStartWidth = 0;

    const COL_MIN = { task: 180, owner: 60, status: 80, duedate: 80, priority: 80, notes: 80, budget: 70, files: 50, timeline: 100, updated: 100 };
    const COL_MAX = { task: 750, owner: 200, status: 200, duedate: 180, priority: 180, notes: 300, budget: 180, files: 120, timeline: 250, updated: 250 };

    function updateAllColWidths(colName, width) {
        // Update colgroup cols in all board-tables
        const tables = document.querySelectorAll('.board-table');
        const columns = getOrderedColumns();
        const colIndex = columns.indexOf(colName);
        if (colIndex === -1) return;
        // col index in colgroup: 0=color, 1=checkbox, then ordered columns..., last=add
        const colGroupIndex = colIndex + 2;
        tables.forEach(table => {
            const col = table.querySelector(`colgroup`)?.children[colGroupIndex];
            if (col) col.style.width = width + 'px';
        });
    }

    document.addEventListener('mousedown', function(e) {
        if (!e.target.classList.contains('col-resize-handle')) return;
        e.preventDefault();
        e.stopPropagation();
        resizing = true;
        resizeTh = e.target.parentElement;
        nextTh = resizeTh.nextElementSibling;
        startX = e.clientX;
        startWidth = resizeTh.offsetWidth;
        nextStartWidth = nextTh ? nextTh.offsetWidth : 0;
        e.target.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', function(e) {
        if (!resizing || !resizeTh) return;
        const diff = e.clientX - startX;
        const colName = resizeTh.getAttribute('data-col');
        const minW = COL_MIN[colName] || 50;
        const maxW = COL_MAX[colName] || 400;
        const newWidth = Math.min(maxW, Math.max(minW, startWidth + diff));

        if (newWidth <= minW && diff < 0) return;
        if (newWidth >= maxW && diff > 0) return;

        resizeTh.style.width = newWidth + 'px';
        resizeTh.style.minWidth = newWidth + 'px';
        updateAllColWidths(colName, newWidth);
    });

    document.addEventListener('mouseup', function(e) {
        if (!resizing) return;
        resizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        if (resizeTh) {
            const handle = resizeTh.querySelector('.col-resize-handle');
            if (handle) handle.classList.remove('active');
            // Save width
            const col = resizeTh.getAttribute('data-col');
            if (col) columnState.widths[col] = resizeTh.offsetWidth;
            saveColumnState();
        }
        resizeTh = null;
        nextTh = null;
    });
})();

// --- Column Drag & Drop ---
(function() {
    let dragColIndex = null;
    let dragColName = null;
    let ghost = null;

    document.addEventListener('dragstart', function(e) {
        const th = e.target.closest('th[draggable="true"]');
        if (!th) return;
        if (e.target.classList.contains('col-resize-handle')) { e.preventDefault(); return; }
        // Don't interfere with row drag
        if (e.target.closest('tr[data-task-id]')) return;
        dragColName = th.getAttribute('data-col');
        dragColIndex = getOrderedColumns().indexOf(dragColName);
        th.classList.add('col-dragging');
        ghost = document.createElement('div');
        ghost.className = 'col-drag-ghost';
        ghost.textContent = th.textContent.trim();
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 40, 15);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/col-drag', dragColName);
    });

    document.addEventListener('dragover', function(e) {
        if (dragColName === null) return;
        const th = e.target.closest('th[draggable="true"]');
        if (!th) return;
        const targetCol = th.getAttribute('data-col');
        if (!targetCol || !DEFAULT_COL_ORDER.includes(targetCol)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        document.querySelectorAll('th.col-drag-over').forEach(el => el.classList.remove('col-drag-over'));
        th.classList.add('col-drag-over');
    });

    document.addEventListener('dragleave', function(e) {
        if (dragColName === null) return;
        const th = e.target.closest('th');
        if (th) th.classList.remove('col-drag-over');
    });

    document.addEventListener('drop', function(e) {
        if (dragColName === null) return;
        e.preventDefault();
        const th = e.target.closest('th[draggable="true"]');
        if (!th) { cleanupColDrag(); return; }
        const targetCol = th.getAttribute('data-col');
        if (!targetCol || targetCol === dragColName || !DEFAULT_COL_ORDER.includes(targetCol)) { cleanupColDrag(); return; }

        // Reorder in columnState
        const cols = getOrderedColumns();
        const fromIdx = cols.indexOf(dragColName);
        const toIdx = cols.indexOf(targetCol);
        if (fromIdx === -1 || toIdx === -1) { cleanupColDrag(); return; }
        cols.splice(fromIdx, 1);
        cols.splice(toIdx, 0, dragColName);
        columnState.order = cols;
        saveColumnState();

        cleanupColDrag();
        renderBoard();
    });

    document.addEventListener('dragend', function(e) {
        if (dragColName !== null) cleanupColDrag();
    });

    function cleanupColDrag() {
        document.querySelectorAll('.col-dragging').forEach(el => el.classList.remove('col-dragging'));
        document.querySelectorAll('.col-drag-over').forEach(el => el.classList.remove('col-drag-over'));
        if (ghost && ghost.parentElement) ghost.remove();
        ghost = null;
        dragColIndex = null;
        dragColName = null;
    }
})();

// --- Row Drag & Drop (within and between groups) ---
// Uses document-level event delegation so it works across different tables/groups
let _rowDragData = null; // { taskId, groupId }
let _subtaskDragData = null; // { subtaskId, taskId, groupId }

function initRowDragAndDrop() {
    // Mark task rows as draggable if not already done
    document.querySelectorAll('tr[data-task-id]').forEach(row => {
        if (row.getAttribute('data-row-drag-init')) return;
        row.setAttribute('data-row-drag-init', '1');
        row.setAttribute('draggable', 'true');
    });
    // Mark subtask rows as draggable
    document.querySelectorAll('tr.subtask-row[data-subtask-id]').forEach(row => {
        if (row.getAttribute('data-row-drag-init')) return;
        row.setAttribute('data-row-drag-init', '1');
        row.setAttribute('draggable', 'true');
    });
}

function initGroupDragAndDrop() {
    // Group drag handles are already set up with draggable="true" in the HTML template.
    // Document-level dragstart/dragover/drop listeners handle the actual reordering.
    // This function ensures any dynamically added groups get their handles marked.
    document.querySelectorAll('.group-drag-handle').forEach(handle => {
        handle.setAttribute('draggable', 'true');
    });
}

// Document-level drag handlers for rows (work across all groups/tables)
document.addEventListener('dragstart', function(e) {
    // Check for group drag (via drag handle)
    const groupHandle = e.target.closest('.group-drag-handle');
    if (groupHandle) {
        const groupEl = groupHandle.closest('.group-tbody[data-group-id]');
        if (groupEl) {
            const groupId = groupEl.getAttribute('data-group-id');
            _groupDragData = { groupId };
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/group-drag', groupId);
            groupEl.classList.add('row-dragging');
            
            const ghost = document.createElement('div');
            ghost.className = 'row-drag-ghost';
            const title = groupEl.querySelector('.group-title');
            ghost.textContent = title ? title.textContent.trim() : 'Group';
            ghost.style.position = 'fixed';
            ghost.style.top = '-100px';
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, 40, 15);
            setTimeout(() => { if (ghost.parentElement) ghost.remove(); }, 0);
            return;
        }
    }

    // Check for subtask row drag first
    const subtaskRow = e.target.closest('tr.subtask-row[data-subtask-id]');
    if (subtaskRow) {
        // Don't start drag from interactive elements
        if (e.target.closest('input, button, .status-label, .owner-avatar')) return;
        _subtaskDragData = {
            subtaskId: subtaskRow.getAttribute('data-subtask-id'),
            taskId: subtaskRow.getAttribute('data-parent-task'),
            groupId: subtaskRow.getAttribute('data-group-id')
        };
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/subtask-drag', JSON.stringify(_subtaskDragData));
        subtaskRow.classList.add('row-dragging');

        const ghost = document.createElement('div');
        ghost.className = 'row-drag-ghost';
        const subName = subtaskRow.querySelector('.subtask-name');
        ghost.textContent = subName ? subName.textContent.trim() : 'Subitem';
        ghost.style.position = 'fixed';
        ghost.style.top = '-100px';
        document.body.appendChild(ghost);
        e.dataTransfer.setDragImage(ghost, 40, 15);
        setTimeout(() => { if (ghost.parentElement) ghost.remove(); }, 0);
        return;
    }

    const row = e.target.closest('tr[data-task-id]');
    if (!row) return;
    // Don't start drag from interactive elements
    if (e.target.closest('input, button, .status-label, .priority-label, .timeline-bar, .owner-avatar, .col-resize-handle, th[draggable]')) {
        return;
    }
    // Don't conflict with column drag
    if (e.target.closest('th[draggable="true"]')) return;

    _rowDragData = {
        taskId: row.getAttribute('data-task-id'),
        groupId: row.getAttribute('data-group-id')
    };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/row-drag', JSON.stringify(_rowDragData));
    row.classList.add('row-dragging');

    // Create visible ghost
    const ghost = document.createElement('div');
    ghost.className = 'row-drag-ghost';
    const taskName = row.querySelector('.task-name');
    ghost.textContent = taskName ? taskName.textContent.trim() : 'Task';
    ghost.style.position = 'fixed';
    ghost.style.top = '-100px';
    document.body.appendChild(ghost);
    e.dataTransfer.setDragImage(ghost, 40, 15);
    setTimeout(() => { if (ghost.parentElement) ghost.remove(); }, 0);
});

document.addEventListener('dragover', function(e) {
    // Handle group drag
    if (_groupDragData) {
        const groupEl = e.target.closest('.group-tbody[data-group-id]');
        if (!groupEl) return;
        if (groupEl.getAttribute('data-group-id') === _groupDragData.groupId) return;
        
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        
        document.querySelectorAll('.group-drag-over-top, .group-drag-over-bottom').forEach(el => {
            el.classList.remove('group-drag-over-top', 'group-drag-over-bottom');
        });
        
        const rect = groupEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            groupEl.classList.add('group-drag-over-top');
        } else {
            groupEl.classList.add('group-drag-over-bottom');
        }
        return;
    }

    // Handle subtask drag — allow dropping on any task row (to move between parents) or reorder within same parent
    if (_subtaskDragData) {
        // Allow dropping on a task row (to move subtask to a different parent)
        const taskRow = e.target.closest('tr[data-task-id]');
        if (taskRow) {
            const targetTaskId = taskRow.getAttribute('data-task-id');
            // Don't drop on itself's parent if it's the same
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom, .row-drag-over-nest').forEach(el => {
                el.classList.remove('row-drag-over-top', 'row-drag-over-bottom', 'row-drag-over-nest');
            });
            taskRow.classList.add('row-drag-over-nest');
            return;
        }

        const subtaskRow = e.target.closest('tr.subtask-row[data-subtask-id]');
        if (!subtaskRow) {
            // Allow drop on subtask-add-row area (end of list)
            const addRow = e.target.closest('tr.subtask-add-row');
            if (addRow) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom, .row-drag-over-nest').forEach(el => {
                    el.classList.remove('row-drag-over-top', 'row-drag-over-bottom', 'row-drag-over-nest');
                });
                addRow.classList.add('row-drag-over-top');
            }
            return;
        }
        // Allow reorder within same parent task
        if (subtaskRow.getAttribute('data-parent-task') !== _subtaskDragData.taskId) {
            // Dropping on a subtask of a different parent — treat as moving to that parent
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom, .row-drag-over-nest').forEach(el => {
                el.classList.remove('row-drag-over-top', 'row-drag-over-bottom', 'row-drag-over-nest');
            });
            subtaskRow.classList.add('row-drag-over-nest');
            return;
        }
        if (subtaskRow.getAttribute('data-subtask-id') === _subtaskDragData.subtaskId) return;

        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom, .row-drag-over-nest').forEach(el => {
            el.classList.remove('row-drag-over-top', 'row-drag-over-bottom', 'row-drag-over-nest');
        });

        const rect = subtaskRow.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            subtaskRow.classList.add('row-drag-over-top');
        } else {
            subtaskRow.classList.add('row-drag-over-bottom');
        }
        return;
    }

    if (!_rowDragData) return;
    const row = e.target.closest('tr[data-task-id]');
    if (!row) {
        // Check if hovering over an empty group (add-task-row area)
        const addRow = e.target.closest('tr.add-task-row');
        if (addRow) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom, .row-drag-over-nest').forEach(el => {
                el.classList.remove('row-drag-over-top', 'row-drag-over-bottom', 'row-drag-over-nest');
            });
            addRow.classList.add('row-drag-over-top');
        }
        return;
    }
    // Skip if same row
    if (row.getAttribute('data-task-id') === _rowDragData.taskId && 
        row.getAttribute('data-group-id') === _rowDragData.groupId) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // Clear all indicators
    document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom, .row-drag-over-nest').forEach(el => {
        el.classList.remove('row-drag-over-top', 'row-drag-over-bottom', 'row-drag-over-nest');
    });

    // Three zones: top 25% = above, bottom 25% = below, middle 50% = nest as subtask
    const rect = row.getBoundingClientRect();
    const relY = e.clientY - rect.top;
    const height = rect.height;
    if (relY < height * 0.25) {
        row.classList.add('row-drag-over-top');
    } else if (relY > height * 0.75) {
        row.classList.add('row-drag-over-bottom');
    } else {
        row.classList.add('row-drag-over-nest');
    }
});

document.addEventListener('dragleave', function(e) {
    if (!_rowDragData && !_subtaskDragData && !_groupDragData) return;
    const row = e.target.closest('tr[data-task-id], tr.add-task-row, tr.subtask-row, tr.subtask-add-row');
    if (row) {
        row.classList.remove('row-drag-over-top', 'row-drag-over-bottom', 'row-drag-over-nest');
    }
    const groupEl = e.target.closest('.group-tbody[data-group-id]');
    if (groupEl) {
        groupEl.classList.remove('group-drag-over-top', 'group-drag-over-bottom');
    }
});

document.addEventListener('drop', function(e) {
    // Handle group drop
    if (_groupDragData) {
        const groupEl = e.target.closest('.group-tbody[data-group-id]');
        if (!groupEl || groupEl.getAttribute('data-group-id') === _groupDragData.groupId) {
            cleanupRowDrag(); return;
        }
        
        e.preventDefault();
        const targetGroupId = groupEl.getAttribute('data-group-id');
        const rect = groupEl.getBoundingClientRect();
        const insertAfter = e.clientY >= (rect.top + rect.height / 2);
        
        moveGroup(_groupDragData.groupId, targetGroupId, insertAfter);
        cleanupRowDrag();
        renderBoard();
        saveToStorage();
        return;
    }

    // Handle subtask drop
    if (_subtaskDragData) {
        // Check if dropped on a task row (move subtask to different parent)
        const taskRow = e.target.closest('tr[data-task-id]');
        if (taskRow) {
            const targetTaskId = taskRow.getAttribute('data-task-id');
            const targetGroupId = taskRow.getAttribute('data-group-id');
            // Move subtask to this task as a subtask
            e.preventDefault();
            moveSubtaskToTask(_subtaskDragData.subtaskId, _subtaskDragData.taskId, _subtaskDragData.groupId, targetTaskId, targetGroupId);
            cleanupRowDrag();
            renderBoard();
            saveToStorage();
            return;
        }

        // Check if dropped on a subtask row of a different parent
        let targetSubtaskRow = e.target.closest('tr.subtask-row[data-subtask-id]');
        let insertAfter = false;

        if (targetSubtaskRow) {
            const targetParentTask = targetSubtaskRow.getAttribute('data-parent-task');
            if (targetParentTask !== _subtaskDragData.taskId) {
                // Move to the different parent task
                const targetGroupId = targetSubtaskRow.getAttribute('data-group-id');
                e.preventDefault();
                moveSubtaskToTask(_subtaskDragData.subtaskId, _subtaskDragData.taskId, _subtaskDragData.groupId, targetParentTask, targetGroupId);
                cleanupRowDrag();
                renderBoard();
                saveToStorage();
                return;
            }
            if (targetSubtaskRow.getAttribute('data-subtask-id') === _subtaskDragData.subtaskId) {
                cleanupRowDrag(); return;
            }
            const rect = targetSubtaskRow.getBoundingClientRect();
            insertAfter = e.clientY >= (rect.top + rect.height / 2);

            e.preventDefault();
            moveSubtaskWithinParent(
                _subtaskDragData.subtaskId,
                _subtaskDragData.taskId,
                _subtaskDragData.groupId,
                targetSubtaskRow.getAttribute('data-subtask-id'),
                insertAfter
            );
        } else {
            // Dropped on subtask-add-row — move to end
            const addRow = e.target.closest('tr.subtask-add-row');
            if (addRow && addRow.getAttribute('data-parent-task') === _subtaskDragData.taskId) {
                e.preventDefault();
                moveSubtaskToEnd(
                    _subtaskDragData.subtaskId,
                    _subtaskDragData.taskId,
                    _subtaskDragData.groupId
                );
            } else if (addRow) {
                // Move to a different parent via add row
                const targetTaskId = addRow.getAttribute('data-parent-task');
                const targetGroupId = addRow.getAttribute('data-group-id');
                e.preventDefault();
                moveSubtaskToTask(_subtaskDragData.subtaskId, _subtaskDragData.taskId, _subtaskDragData.groupId, targetTaskId, targetGroupId);
            }
        }

        cleanupRowDrag();
        renderBoard();
        saveToStorage();
        return;
    }

    if (!_rowDragData) return;

    // Check drop on a task row (any group)
    let targetRow = e.target.closest('tr[data-task-id]');
    let targetGroupId, targetTaskId, insertAfter;

    if (targetRow) {
        targetTaskId = targetRow.getAttribute('data-task-id');
        targetGroupId = targetRow.getAttribute('data-group-id');
        if (targetTaskId === _rowDragData.taskId && targetGroupId === _rowDragData.groupId) {
            cleanupRowDrag(); return;
        }

        // Check if dropping in the MIDDLE zone (nest as subtask)
        const rect = targetRow.getBoundingClientRect();
        const relY = e.clientY - rect.top;
        const height = rect.height;
        if (relY >= height * 0.25 && relY <= height * 0.75) {
            // NEST: Convert dragged task to a subtask of the target task
            e.preventDefault();
            convertTaskToSubtask(_rowDragData.taskId, _rowDragData.groupId, targetTaskId, targetGroupId);
            cleanupRowDrag();
            renderBoard();
            saveToStorage();
            return;
        }

        insertAfter = relY > height * 0.75;
    } else {
        // Check if dropped on add-task-row (empty group drop zone)
        const addRow = e.target.closest('tr.add-task-row');
        if (addRow) {
            targetGroupId = addRow.getAttribute('data-add-group');
            // Insert at end of group
            const group = boardData.groups.find(g => String(g.id) === String(targetGroupId));
            if (group && group.tasks.length > 0) {
                targetTaskId = String(group.tasks[group.tasks.length - 1].id);
                insertAfter = true;
            } else {
                // Empty group - just add
                targetTaskId = null;
                insertAfter = true;
            }
        } else {
            cleanupRowDrag(); return;
        }
    }

    e.preventDefault();

    if (targetTaskId) {
        moveTaskBetweenGroups(_rowDragData.taskId, _rowDragData.groupId, targetTaskId, targetGroupId, insertAfter);
    } else if (targetGroupId) {
        // Move to empty group
        moveTaskToEmptyGroup(_rowDragData.taskId, _rowDragData.groupId, targetGroupId);
    }

    cleanupRowDrag();
    renderBoard();
    saveToStorage();
});

document.addEventListener('dragend', function(e) {
    if (_rowDragData || _subtaskDragData || _groupDragData) cleanupRowDrag();
});

function cleanupRowDrag() {
    document.querySelectorAll('.row-dragging').forEach(el => el.classList.remove('row-dragging'));
    document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom, .row-drag-over-nest').forEach(el => {
        el.classList.remove('row-drag-over-top', 'row-drag-over-bottom', 'row-drag-over-nest');
    });
    document.querySelectorAll('.group-drag-over-top, .group-drag-over-bottom').forEach(el => {
        el.classList.remove('group-drag-over-top', 'group-drag-over-bottom');
    });
    _rowDragData = null;
    _subtaskDragData = null;
    _groupDragData = null;
}

// Move group to a new position
function moveGroup(sourceGroupId, targetGroupId, insertAfter) {
    const fromIdx = boardData.groups.findIndex(g => String(g.id) === String(sourceGroupId));
    if (fromIdx === -1) return;
    const group = boardData.groups[fromIdx];
    
    boardData.groups.splice(fromIdx, 1);
    
    let toIdx = boardData.groups.findIndex(g => String(g.id) === String(targetGroupId));
    if (toIdx === -1) toIdx = boardData.groups.length;
    else if (insertAfter) toIdx += 1;
    
    boardData.groups.splice(toIdx, 0, group);
}

// Move task to an empty group (no target task to reference)
function moveTaskToEmptyGroup(taskId, sourceGroupId, targetGroupId) {
    let sourceGroup = null;
    let taskIndex = -1;
    let task = null;

    for (const g of boardData.groups) {
        if (String(g.id) === String(sourceGroupId)) {
            sourceGroup = g;
            taskIndex = g.tasks.findIndex(t => String(t.id) === String(taskId));
            if (taskIndex !== -1) task = g.tasks[taskIndex];
            break;
        }
    }
    if (!sourceGroup || !task) return;

    let targetGroup = null;
    for (const g of boardData.groups) {
        if (String(g.id) === String(targetGroupId)) {
            targetGroup = g;
            break;
        }
    }
    if (!targetGroup) return;

    sourceGroup.tasks.splice(taskIndex, 1);
    targetGroup.tasks.push(task);
    task.lastUpdated = nowISO();
}

// Move task between groups or within the same group
function moveTaskBetweenGroups(taskId, sourceGroupId, targetTaskId, targetGroupId, insertAfter) {
    let sourceGroup = null;
    let taskIndex = -1;
    let task = null;

    for (const g of boardData.groups) {
        if (String(g.id) === String(sourceGroupId)) {
            sourceGroup = g;
            taskIndex = g.tasks.findIndex(t => String(t.id) === String(taskId));
            if (taskIndex !== -1) task = g.tasks[taskIndex];
            break;
        }
    }
    if (!sourceGroup || !task) return;

    let targetGroup = null;
    for (const g of boardData.groups) {
        if (String(g.id) === String(targetGroupId)) {
            targetGroup = g;
            break;
        }
    }
    if (!targetGroup) return;

    sourceGroup.tasks.splice(taskIndex, 1);

    let insertIndex = targetGroup.tasks.findIndex(t => String(t.id) === String(targetTaskId));
    if (insertIndex === -1) insertIndex = targetGroup.tasks.length;
    else if (insertAfter) insertIndex += 1;

    targetGroup.tasks.splice(insertIndex, 0, task);
    task.lastUpdated = nowISO();
}

// Move subtask within the same parent task (reorder)
function moveSubtaskWithinParent(subtaskId, taskId, groupId, targetSubtaskId, insertAfter) {
    const { task } = findTask(taskId, groupId);
    if (!task || !task.subtasks) return;

    const fromIdx = task.subtasks.findIndex(s => String(s.id) === String(subtaskId));
    if (fromIdx === -1) return;
    const subtask = task.subtasks[fromIdx];

    // Remove from current position
    task.subtasks.splice(fromIdx, 1);

    // Find target position
    let toIdx = task.subtasks.findIndex(s => String(s.id) === String(targetSubtaskId));
    if (toIdx === -1) toIdx = task.subtasks.length;
    else if (insertAfter) toIdx += 1;

    task.subtasks.splice(toIdx, 0, subtask);
    task.lastUpdated = nowISO();
}

// Move subtask to end of parent's subtask list
function moveSubtaskToEnd(subtaskId, taskId, groupId) {
    const { task } = findTask(taskId, groupId);
    if (!task || !task.subtasks) return;

    const fromIdx = task.subtasks.findIndex(s => String(s.id) === String(subtaskId));
    if (fromIdx === -1) return;
    const subtask = task.subtasks[fromIdx];

    task.subtasks.splice(fromIdx, 1);
    task.subtasks.push(subtask);
    task.lastUpdated = nowISO();
}

// Convert a task to a subtask of another task (drag task onto another task's middle zone)
function convertTaskToSubtask(taskId, sourceGroupId, targetTaskId, targetGroupId) {
    // Find and remove source task
    const sourceGroup = boardData.groups.find(g => String(g.id) === String(sourceGroupId));
    if (!sourceGroup) return;
    const taskIdx = sourceGroup.tasks.findIndex(t => String(t.id) === String(taskId));
    if (taskIdx === -1) return;
    const task = sourceGroup.tasks[taskIdx];
    
    // Find target task
    const targetGroup = boardData.groups.find(g => String(g.id) === String(targetGroupId));
    if (!targetGroup) return;
    const targetTask = targetGroup.tasks.find(t => String(t.id) === String(targetTaskId));
    if (!targetTask) return;
    
    // Don't allow nesting into itself
    if (String(task.id) === String(targetTask.id)) return;
    
    // Remove from source
    sourceGroup.tasks.splice(taskIdx, 1);
    
    // Convert task to subtask format
    if (!targetTask.subtasks) targetTask.subtasks = [];
    targetTask.subtasks.push({
        id: task.id,
        name: task.name,
        owner: task.owner || '',
        status: task.status || '',
        priority: task.priority || '',
        dueDate: task.dueDate || '',
        notes: task.notes || '',
        budget: task.budget || 0,
        files: task.files || 0,
        timelineStart: task.timelineStart || '',
        timelineEnd: task.timelineEnd || '',
        lastUpdated: nowISO()
    });
    targetTask.subtasksExpanded = true;
    targetTask.lastUpdated = nowISO();
    
    showToast(`"${task.name}" moved as subitem of "${targetTask.name}"`);
}

// Move a subtask from one parent task to another
function moveSubtaskToTask(subtaskId, sourceTaskId, sourceGroupId, targetTaskId, targetGroupId) {
    // Find source task and subtask
    const { task: sourceTask } = findTask(sourceTaskId, sourceGroupId);
    if (!sourceTask || !sourceTask.subtasks) return;
    const subIdx = sourceTask.subtasks.findIndex(s => String(s.id) === String(subtaskId));
    if (subIdx === -1) return;
    const subtask = sourceTask.subtasks[subIdx];
    
    // Don't move to same parent
    if (String(sourceTaskId) === String(targetTaskId)) return;
    
    // Find target task
    const targetGroup = boardData.groups.find(g => String(g.id) === String(targetGroupId));
    if (!targetGroup) return;
    const targetTask = targetGroup.tasks.find(t => String(t.id) === String(targetTaskId));
    if (!targetTask) return;
    
    // Remove from source
    sourceTask.subtasks.splice(subIdx, 1);
    sourceTask.lastUpdated = nowISO();
    
    // Add to target
    if (!targetTask.subtasks) targetTask.subtasks = [];
    subtask.lastUpdated = nowISO();
    targetTask.subtasks.push(subtask);
    targetTask.subtasksExpanded = true;
    targetTask.lastUpdated = nowISO();
    
    showToast(`Subitem moved to "${targetTask.name}"`);
}

// ============================================================
// "Move to..." Context Menu for tasks and subtasks
// ============================================================
function showMoveToMenu(event, taskId, groupId) {
    event.stopPropagation();
    closeMoveToMenu();
    
    const { group: sourceGroup, task: sourceTask } = findTask(taskId, groupId);
    if (!sourceTask) return;
    
    const menu = document.createElement('div');
    menu.className = 'move-to-menu';
    menu.id = 'moveToMenu';
    
    let html = '<div class="move-to-header">Move as subitem to:</div>';
    html += '<div class="move-to-search"><input type="text" placeholder="Search task..." id="moveToSearch"></div>';
    html += '<div class="move-to-list" id="moveToList">';
    
    boardData.groups.forEach(group => {
        group.tasks.forEach(t => {
            if (String(t.id) === String(taskId) && String(group.id) === String(groupId)) return; // skip self
            html += `<div class="move-to-item" data-task-id="${t.id}" data-group-id="${group.id}" onclick="executeMoveToTask('${taskId}', '${groupId}', '${t.id}', '${group.id}')">
                <span class="move-to-group-dot" style="background:${group.color}"></span>
                <span class="move-to-task-name">${escapeHtml(t.name)}</span>
                <span class="move-to-group-name">${escapeHtml(group.name)}</span>
            </div>`;
        });
    });
    
    html += '</div>';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    
    // Position near the event
    const rect = event.target.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + 300 > window.innerHeight) top = rect.top - 300;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 288;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    
    // Focus search
    setTimeout(() => {
        const searchInput = document.getElementById('moveToSearch');
        if (searchInput) {
            searchInput.focus();
            searchInput.addEventListener('input', function() {
                filterMoveToList(this.value);
            });
        }
    }, 50);
    
    // Close on outside click
    setTimeout(() => document.addEventListener('click', closeMoveToMenuOnClick), 10);
}

function showMoveSubtaskToMenu(event, subtaskId, taskId, groupId) {
    event.stopPropagation();
    closeMoveToMenu();
    
    const { subtask } = findSubtask(subtaskId, taskId, groupId);
    if (!subtask) return;
    
    const menu = document.createElement('div');
    menu.className = 'move-to-menu';
    menu.id = 'moveToMenu';
    
    let html = '<div class="move-to-header">Move subitem to:</div>';
    html += '<div class="move-to-search"><input type="text" placeholder="Search task..." id="moveToSearch"></div>';
    html += '<div class="move-to-list" id="moveToList">';
    
    boardData.groups.forEach(group => {
        group.tasks.forEach(t => {
            if (String(t.id) === String(taskId) && String(group.id) === String(groupId)) {
                // Same parent — show but mark
                html += `<div class="move-to-item move-to-current" data-task-id="${t.id}" data-group-id="${group.id}">
                    <span class="move-to-group-dot" style="background:${group.color}"></span>
                    <span class="move-to-task-name">${escapeHtml(t.name)} (current)</span>
                </div>`;
            } else {
                html += `<div class="move-to-item" data-task-id="${t.id}" data-group-id="${group.id}" onclick="executeMoveSubtaskToTask('${subtaskId}', '${taskId}', '${groupId}', '${t.id}', '${group.id}')">
                    <span class="move-to-group-dot" style="background:${group.color}"></span>
                    <span class="move-to-task-name">${escapeHtml(t.name)}</span>
                    <span class="move-to-group-name">${escapeHtml(group.name)}</span>
                </div>`;
            }
        });
    });
    
    html += '</div>';
    menu.innerHTML = html;
    document.body.appendChild(menu);
    
    const rect = event.target.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;
    if (top + 300 > window.innerHeight) top = rect.top - 300;
    if (left + 280 > window.innerWidth) left = window.innerWidth - 288;
    menu.style.top = top + 'px';
    menu.style.left = left + 'px';
    
    setTimeout(() => {
        const searchInput = document.getElementById('moveToSearch');
        if (searchInput) {
            searchInput.focus();
            searchInput.addEventListener('input', function() {
                filterMoveToList(this.value);
            });
        }
    }, 50);
    
    setTimeout(() => document.addEventListener('click', closeMoveToMenuOnClick), 10);
}

function filterMoveToList(query) {
    const items = document.querySelectorAll('#moveToList .move-to-item');
    const q = query.toLowerCase();
    items.forEach(item => {
        const name = item.querySelector('.move-to-task-name').textContent.toLowerCase();
        item.style.display = name.includes(q) ? '' : 'none';
    });
}

function executeMoveToTask(taskId, sourceGroupId, targetTaskId, targetGroupId) {
    closeMoveToMenu();
    convertTaskToSubtask(taskId, sourceGroupId, targetTaskId, targetGroupId);
    renderBoard();
    saveToStorage();
}

function executeMoveSubtaskToTask(subtaskId, sourceTaskId, sourceGroupId, targetTaskId, targetGroupId) {
    closeMoveToMenu();
    moveSubtaskToTask(subtaskId, sourceTaskId, sourceGroupId, targetTaskId, targetGroupId);
    renderBoard();
    saveToStorage();
}

function closeMoveToMenuOnClick(e) {
    const menu = document.getElementById('moveToMenu');
    if (menu && !menu.contains(e.target)) closeMoveToMenu();
}

function closeMoveToMenu() {
    const menu = document.getElementById('moveToMenu');
    if (menu) menu.remove();
    document.removeEventListener('click', closeMoveToMenuOnClick);
}

// ============================================================
// Column Header Tooltip (JS-based, appended to body)
// ============================================================
(function() {
    let tooltipEl = null;
    let tooltipTimer = null;

    function createTooltip() {
        if (tooltipEl) return;
        tooltipEl = document.createElement('div');
        tooltipEl.className = 'col-header-tooltip';
        document.body.appendChild(tooltipEl);
    }

    function showTooltip(target) {
        const text = target.getAttribute('data-tooltip');
        if (!text) return;
        createTooltip();
        tooltipEl.textContent = text;
        tooltipEl.classList.add('visible');

        const rect = target.getBoundingClientRect();
        const tooltipRect = tooltipEl.getBoundingClientRect();
        const left = rect.left + rect.width / 2 - tooltipRect.width / 2;
        const top = rect.top - tooltipRect.height - 10;

        tooltipEl.style.left = Math.max(4, left) + 'px';
        tooltipEl.style.top = Math.max(4, top) + 'px';
    }

    function hideTooltip() {
        if (tooltipTimer) { clearTimeout(tooltipTimer); tooltipTimer = null; }
        if (tooltipEl) tooltipEl.classList.remove('visible');
    }

    document.addEventListener('mouseenter', function(e) {
        const thContent = e.target.closest('.th-content[data-tooltip]');
        if (!thContent) return;
        hideTooltip();
        tooltipTimer = setTimeout(function() { showTooltip(thContent); }, 1000);
    }, true);

    document.addEventListener('mouseleave', function(e) {
        const thContent = e.target.closest('.th-content[data-tooltip]');
        if (!thContent) return;
        hideTooltip();
    }, true);
})();

// ===== SNAPSHOT MANAGEMENT (Super Admin Only) =====

async function loadSnapshotData() {
    await loadSnapshotList();
    await loadLatestSnapshot();
}

async function loadLatestSnapshot() {
    const container = document.getElementById('latestSnapshotInfo');
    if (!container) return;
    try {
        const res = await authFetch('/api/snapshots/latest');
        const data = await res.json();
        if (data.success && data.snapshot) {
            const s = data.snapshot;
            const date = new Date(s.created_at);
            const sizeKB = (s.data_size_bytes / 1024).toFixed(1);
            const trigger = s.metadata?.trigger || 'unknown';
            container.innerHTML = `
                <div class="snapshot-info-grid">
                    <div class="snapshot-info-item">
                        <span class="snapshot-info-label">Last Backup</span>
                        <span class="snapshot-info-value">${date.toLocaleString('he-IL')}</span>
                    </div>
                    <div class="snapshot-info-item">
                        <span class="snapshot-info-label">Users</span>
                        <span class="snapshot-info-value">${s.user_count}</span>
                    </div>
                    <div class="snapshot-info-item">
                        <span class="snapshot-info-label">Size</span>
                        <span class="snapshot-info-value">${sizeKB} KB</span>
                    </div>
                    <div class="snapshot-info-item">
                        <span class="snapshot-info-label">Trigger</span>
                        <span class="snapshot-info-value snapshot-trigger-${trigger}">${trigger}</span>
                    </div>
                    <div class="snapshot-info-item">
                        <span class="snapshot-info-label">Status</span>
                        <span class="snapshot-info-value snapshot-status-valid">✓ Valid</span>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = '<p class="snapshot-empty">No snapshots yet. The first automatic snapshot will be created within 5 minutes of server start.</p>';
        }
    } catch (e) {
        container.innerHTML = '<p class="snapshot-error">Failed to load snapshot info</p>';
    }
}

async function loadSnapshotList() {
    const tbody = document.getElementById('snapshotTableBody');
    if (!tbody) return;
    try {
        const res = await authFetch('/api/snapshots');
        const data = await res.json();
        if (data.success && data.snapshots && data.snapshots.length > 0) {
            tbody.innerHTML = data.snapshots.map(s => {
                const date = new Date(s.created_at);
                const sizeKB = (s.data_size_bytes / 1024).toFixed(1);
                const trigger = s.metadata?.trigger || '-';
                return `
                    <tr>
                        <td class="admin-td">#${s.id}</td>
                        <td class="admin-td">${date.toLocaleString('he-IL')}</td>
                        <td class="admin-td">${s.user_count}</td>
                        <td class="admin-td">${sizeKB} KB</td>
                        <td class="admin-td"><span class="snapshot-trigger-badge snapshot-trigger-${trigger}">${trigger}</span></td>
                        <td class="admin-td">
                            <button class="snapshot-action-btn snapshot-view-btn" onclick="viewSnapshotDetails(${s.id})">
                                <span class="material-icons-outlined">visibility</span>
                            </button>
                            <button class="snapshot-action-btn snapshot-restore-btn" onclick="restoreSnapshot(${s.id})">
                                <span class="material-icons-outlined">restore</span>
                            </button>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">No snapshots found</td></tr>';
        }
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="6" class="admin-loading">Failed to load snapshots</td></tr>';
    }
}

async function createManualSnapshot() {
    const btn = document.getElementById('createSnapshotBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="material-icons-outlined">hourglass_top</span> Creating...';
    }
    try {
        const res = await authFetch('/api/snapshots/create', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert('Snapshot created successfully!');
            loadSnapshotData();
        } else {
            alert('Failed to create snapshot: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error creating snapshot: ' + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-icons-outlined">add_circle</span> Create Snapshot Now';
        }
    }
}

async function viewSnapshotDetails(snapshotId) {
    const section = document.getElementById('snapshotDetailSection');
    const content = document.getElementById('snapshotDetailContent');
    if (!section || !content) return;

    section.style.display = '';
    content.innerHTML = '<p class="snapshot-loading">Loading details...</p>';

    try {
        const res = await authFetch(`/api/snapshots/${snapshotId}`);
        const data = await res.json();
        if (data.success && data.snapshot) {
            const s = data.snapshot;
            const date = new Date(s.createdAt);
            let usersHtml = '';
            if (s.userSummaries) {
                usersHtml = '<div class="snapshot-users-grid">';
                for (const [userKey, info] of Object.entries(s.userSummaries)) {
                    const taskCount = info.taskCount !== undefined ? info.taskCount : '-';
                    const sizeKB = (info.totalSize / 1024).toFixed(1);
                    usersHtml += `
                        <div class="snapshot-user-card">
                            <div class="snapshot-user-email">${userKey}</div>
                            <div class="snapshot-user-meta">
                                <span>Tasks: <strong>${taskCount}</strong></span>
                                <span>Data: ${sizeKB} KB</span>
                                <span>Types: ${info.dataTypes.join(', ')}</span>
                            </div>
                        </div>
                    `;
                }
                usersHtml += '</div>';
            }

            content.innerHTML = `
                <div class="snapshot-detail-header">
                    <h4>Snapshot #${s.id} — ${date.toLocaleString('he-IL')}</h4>
                    <button class="admin-btn-primary" onclick="restoreSnapshot(${s.id})">
                        <span class="material-icons-outlined">restore</span> Restore This Snapshot
                    </button>
                </div>
                <div class="snapshot-info-grid" style="margin-bottom:16px">
                    <div class="snapshot-info-item">
                        <span class="snapshot-info-label">Users</span>
                        <span class="snapshot-info-value">${s.userCount}</span>
                    </div>
                    <div class="snapshot-info-item">
                        <span class="snapshot-info-label">Size</span>
                        <span class="snapshot-info-value">${(s.dataSizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                    <div class="snapshot-info-item">
                        <span class="snapshot-info-label">Status</span>
                        <span class="snapshot-info-value snapshot-status-valid">✓ ${s.status}</span>
                    </div>
                </div>
                <h4 style="margin-bottom:8px">User Data Summary:</h4>
                ${usersHtml}
            `;
        } else {
            content.innerHTML = '<p class="snapshot-error">Failed to load snapshot details</p>';
        }
    } catch (e) {
        content.innerHTML = '<p class="snapshot-error">Error: ' + e.message + '</p>';
    }
}

async function restoreSnapshot(snapshotId) {
    if (!confirm('Are you sure you want to restore from this snapshot?\n\nThis will REPLACE all current user data with the snapshot data.\nA backup of current data will be created first.')) {
        return;
    }
    if (!confirm('FINAL CONFIRMATION: This action cannot be undone easily.\nAll current data will be replaced.\n\nProceed with restore?')) {
        return;
    }

    try {
        const res = await authFetch(`/api/snapshots/${snapshotId}/restore`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert(`Restore successful!\n\nRestored ${data.restoredRows} records for ${data.userCount} users.\n\nPlease refresh the page to see updated data.`);
            loadSnapshotData();
        } else {
            alert('Restore failed: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error restoring snapshot: ' + e.message);
    }
}

// ===== WORKSPACE MANAGEMENT =====
let userWorkspaces = [];
let activeWorkspaceId = null;
let cachedWorkspaceMembers = []; // Cached members for owner assignment

async function loadWorkspaces() {
    if (!authToken) return;
    try {
        const res = await fetch('/api/workspaces', {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) return;
        const data = await res.json();
        userWorkspaces = data.workspaces || [];
        
        // Set active workspace — validate that saved workspace still exists
        if (activeWorkspaceId) {
            const exists = userWorkspaces.find(ws => ws.id === activeWorkspaceId);
            if (!exists && userWorkspaces.length > 0) {
                activeWorkspaceId = userWorkspaces[0].id;
                localStorage.setItem('activeWorkspaceId', activeWorkspaceId);
            }
        } else if (userWorkspaces.length > 0) {
            activeWorkspaceId = userWorkspaces[0].id;
            localStorage.setItem('activeWorkspaceId', activeWorkspaceId);
        }
        
        renderWorkspaceList();
        // Load members for owner assignment
        await loadActiveWorkspaceMembers();
    } catch (e) {
        console.error('Failed to load workspaces:', e);
    }
}

// Load workspace members for owner assignment
async function loadActiveWorkspaceMembers() {
    if (!activeWorkspaceId || !authToken) { cachedWorkspaceMembers = []; return; }
    try {
        const res = await fetch(`/api/workspaces/${activeWorkspaceId}/members`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            cachedWorkspaceMembers = data.members || [];
            renderBoardOwnersStack();
        }
    } catch (e) {
        cachedWorkspaceMembers = [];
    }
}

// ===== OWNER ASSIGNMENT POPUP =====
let ownerPopupTarget = null; // { taskId, groupId, subtaskId? }

function showOwnerPopup(event, taskId, groupId, subtaskId) {
    event.stopPropagation();
    ownerPopupTarget = { taskId, groupId, subtaskId: subtaskId || null };
    
    // Remove existing popup
    const existingPopup = document.getElementById('ownerAssignPopup');
    if (existingPopup) existingPopup.remove();
    
    const popup = document.createElement('div');
    popup.id = 'ownerAssignPopup';
    popup.className = 'owner-assign-popup';
    popup.innerHTML = `
        <div class="owner-popup-search">
            <input type="text" id="ownerSearchInput" placeholder="Name or email" autocomplete="off">
        </div>
        <div class="owner-popup-list" id="ownerPopupList"></div>
        <div class="owner-popup-invite" onclick="ownerInviteTeammate()">
            <span class="material-icons-outlined" style="font-size:16px;color:#0073ea">person_add</span>
            <span style="color:#0073ea">Invite teammates via email</span>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Position popup near the clicked element (smart: flip up if near bottom)
    const rect = event.target.closest('.cell-owner').getBoundingClientRect();
    const popupHeight = popup.offsetHeight || 220;
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    
    let top;
    if (spaceBelow >= popupHeight) {
        top = rect.bottom + 4;
    } else if (spaceAbove >= popupHeight) {
        top = rect.top - popupHeight - 4;
    } else {
        top = Math.max(8, viewportHeight - popupHeight - 8);
    }
    popup.style.top = top + 'px';
    popup.style.left = Math.max(10, rect.left - 80) + 'px';
    
    // Render members list
    renderOwnerPopupList('');
    
    // Focus search
    const searchInput = document.getElementById('ownerSearchInput');
    setTimeout(() => searchInput.focus(), 50);
    searchInput.addEventListener('input', (e) => {
        renderOwnerPopupList(e.target.value.toLowerCase().trim());
    });
    
    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', closeOwnerPopupOutside);
    }, 10);
}

function renderOwnerPopupList(filter) {
    const container = document.getElementById('ownerPopupList');
    if (!container) return;
    
    let members = cachedWorkspaceMembers;
    if (filter) {
        members = members.filter(m => 
            (m.userName || '').toLowerCase().includes(filter) ||
            (m.userEmail || '').toLowerCase().includes(filter)
        );
    }
    
    if (members.length === 0) {
        container.innerHTML = '<div style="padding:8px 12px;color:#999;font-size:12px">No members found</div>';
        return;
    }
    
    // Add "Unassign" option at top if task already has owner
    let html = '';
    const currentOwner = getCurrentOwnerForTarget();
    if (currentOwner) {
        html += `<div class="owner-popup-item unassign-item" onclick="assignOwner(null)">
            <div class="owner-popup-avatar unassign-avatar"><span class="material-icons-outlined" style="font-size:14px">close</span></div>
            <div class="owner-popup-info"><span class="owner-popup-name">Unassign</span></div>
        </div>`;
    }
    
    members.forEach(m => {
        const initials = getInitials(m.userName || m.userEmail || '?');
        const avatarHtml = m.picture 
            ? `<img src="${m.picture}" class="owner-popup-avatar" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'owner-popup-avatar\\'>${initials}</div>'">`
            : `<div class="owner-popup-avatar">${initials}</div>`;
        html += `<div class="owner-popup-item" onclick="assignOwner('${escapeHtml(m.userId)}')">
            ${avatarHtml}
            <div class="owner-popup-info">
                <span class="owner-popup-name">${escapeHtml(m.userName || 'Unknown')}</span>
                <span class="owner-popup-email">${escapeHtml(m.userEmail || '')}</span>
            </div>
        </div>`;
    });
    
    container.innerHTML = html;
}

function getCurrentOwnerForTarget() {
    if (!ownerPopupTarget) return null;
    const { taskId, groupId, subtaskId } = ownerPopupTarget;
    if (subtaskId) {
        const { subtask } = findSubtask(subtaskId, taskId, groupId);
        return subtask ? subtask.owner : null;
    }
    const { task } = findTask(taskId, groupId);
    return task ? task.owner : null;
}

function assignOwner(userId) {
    if (!ownerPopupTarget) return;
    const { taskId, groupId, subtaskId } = ownerPopupTarget;
    
    let ownerValue = '';
    if (userId) {
        const member = cachedWorkspaceMembers.find(m => m.userId === userId);
        if (member) {
            ownerValue = member.userName || getInitials(member.userEmail || '?');
        }
    }
    
    if (subtaskId) {
        const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
        if (subtask) {
            subtask.owner = ownerValue;
            subtask.lastUpdated = nowISO();
            task.lastUpdated = nowISO();
        }
    } else {
        const { task } = findTask(taskId, groupId);
        if (task) {
            task.owner = ownerValue;
            task.lastUpdated = nowISO();
        }
    }
    
    closeOwnerPopup();
    saveToStorage();
    renderBoard();
}

function ownerInviteTeammate() {
    closeOwnerPopup();
    // Open workspace settings to invite new members
    if (typeof openWorkspaceSettings === 'function') {
        openWorkspaceSettings();
    }
}

function closeOwnerPopup() {
    const popup = document.getElementById('ownerAssignPopup');
    if (popup) popup.remove();
    ownerPopupTarget = null;
    document.removeEventListener('click', closeOwnerPopupOutside);
}

function closeOwnerPopupOutside(e) {
    const popup = document.getElementById('ownerAssignPopup');
    if (popup && !popup.contains(e.target)) {
        closeOwnerPopup();
    }
}

function renderWorkspaceList() {
    const container = document.getElementById('workspaceList');
    if (!container) return;
    
    if (userWorkspaces.length === 0) {
        container.innerHTML = '<div style="padding:6px 10px;color:#9699a6;font-size:12px">No workspaces yet</div>';
        return;
    }
    
    // Separate inactive workspaces (shown as small items) from active one
    const inactiveWs = userWorkspaces.filter(ws => ws.id !== activeWorkspaceId);
    const activeWs = userWorkspaces.find(ws => ws.id === activeWorkspaceId);
    
    let html = '';
    
    // Show inactive workspaces as small clickable items
    inactiveWs.forEach(ws => {
        html += `<div class="workspace-item" onclick="switchWorkspace('${ws.id}')" title="${escapeHtml(ws.name)} (${ws.role})">
            <div class="workspace-item-icon" style="background:${ws.color || '#0073ea'}">${ws.initial || ws.name.charAt(0).toUpperCase()}</div>
            <span class="workspace-item-name">${escapeHtml(ws.name)}</span>
            <span class="workspace-item-role">${ws.role}</span>
        </div>`;
    });
    
    container.innerHTML = html;
    
    // Update the active workspace display in the project section
    renderActiveWorkspaceHeader(activeWs);
}

function renderActiveWorkspaceHeader(activeWs) {
    // Update the active workspace name shown above the board list
    const activeWsEl = document.getElementById('activeWorkspaceName');
    if (activeWsEl && activeWs) {
        activeWsEl.textContent = activeWs.name;
        activeWsEl.title = `${activeWs.name} (${activeWs.role})`;
    }
    const activeWsIcon = document.getElementById('activeWorkspaceIcon');
    if (activeWsIcon && activeWs) {
        activeWsIcon.style.background = activeWs.color || '#0073ea';
        activeWsIcon.textContent = activeWs.initial || activeWs.name.charAt(0).toUpperCase();
    }
}

async function switchWorkspace(workspaceId) {
    if (workspaceId === activeWorkspaceId) return;
    console.log(`[Workspace] Switching from ${activeWorkspaceId} to ${workspaceId}`);
    
    // CRITICAL: Save current workspace data IMMEDIATELY before switching
    // Must capture current state BEFORE changing anything
    const previousWsId = activeWorkspaceId;
    if (previousWsId && serverDataLoaded && boardData) {
        // Cancel any pending debounced save
        if (serverSaveTimeout) { clearTimeout(serverSaveTimeout); serverSaveTimeout = null; }
        // Ensure current board's groups are saved in boardGroups
        if (boardData.activeBoard && boardData.boardGroups) {
            boardData.boardGroups[boardData.activeBoard] = boardData.groups;
        }
        // Save immediately with the CURRENT workspace ID and CURRENT data
        const dataSnapshot = JSON.parse(JSON.stringify(boardData));
        console.log(`[Workspace] Saving ${previousWsId}: ${dataSnapshot.boards?.length || 0} boards, ${Object.keys(dataSnapshot.boardGroups || {}).length} boardGroups`);
        await saveToServerImmediate(dataSnapshot, previousWsId);
    } else {
        console.log(`[Workspace] Skip save: previousWsId=${previousWsId}, serverDataLoaded=${serverDataLoaded}, boardData=${!!boardData}`);
    }
    
    // Now switch to new workspace
    activeWorkspaceId = workspaceId;
    localStorage.setItem('activeWorkspaceId', workspaceId);
    serverDataLoaded = false;
    
    // Load persistent notifications for this workspace
    loadNotificationsFromStorage();
    
    // Load new workspace data from server
    const wsParam = `?workspaceId=${workspaceId}`;
    try {
        const res = await authFetch('/api/user-data/boards' + wsParam);
        const result = await res.json();
        if (result.success && result.data) {
            // Workspace has saved data - use it
            console.log(`[Workspace] Loaded ${workspaceId}: ${result.data.boards?.length || 0} boards`);
            boardData = result.data;
            if (!boardData.boardGroups) {
                boardData.boardGroups = {};
                const activeId = boardData.activeBoard || 'board1';
                if (boardData.groups && boardData.groups.length > 0) {
                    boardData.boardGroups[activeId] = boardData.groups;
                }
            }
            initBoardGroups();
            renderBoard();
            renderBoardSidebar();
            serverDataLoaded = true;
            // Sync board data to server for Telegram notifications
            syncBoardToServer();
        } else {
            // No data for this workspace - try legacy migration
            let migrated = false;
            if (activeWorkspaceId) {
                migrated = await migrateFromLegacyData();
            }
            if (!migrated) {
                // Truly empty workspace - create default board
                boardData = { boards: null, boardGroups: {}, groups: [], activeBoard: null };
                initBoardGroups();
                renderBoardSidebar();
                renderBoard();
                serverDataLoaded = true;
            }
        }
    } catch (e) {
        console.error('[Workspace] Failed to load workspace data:', e);
        // Don't overwrite - keep previous state indicator
        boardData = { boards: null, boardGroups: {}, groups: [], activeBoard: null };
        initBoardGroups();
        renderBoardSidebar();
        renderBoard();
        serverDataLoaded = true;
    }
    
    // Refresh workspace list UI
    await loadWorkspaces();
}

// Create workspace
function showCreateWorkspaceModal() {
    document.getElementById('createWorkspaceModal').style.display = 'flex';
    document.getElementById('newWorkspaceName').value = '';
    document.getElementById('newWorkspaceDesc').value = '';
    setTimeout(() => document.getElementById('newWorkspaceName').focus(), 100);
}

function closeCreateWorkspaceModal() {
    document.getElementById('createWorkspaceModal').style.display = 'none';
}

async function createWorkspace() {
    const name = document.getElementById('newWorkspaceName').value.trim();
    const description = document.getElementById('newWorkspaceDesc').value.trim();
    if (!name) return alert('Please enter a workspace name');
    
    if (!authToken) return alert('Not authenticated. Please log in again.');
    try {
        const res = await fetch('/api/workspaces', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            return alert(errData.error || `Server error (${res.status})`);
        }
        const data = await res.json();
        if (data.success) {
            closeCreateWorkspaceModal();
            // Must await switchWorkspace so it fully completes (loads data + re-renders)
            await switchWorkspace(data.workspace.id);
            // Safety: ensure workspace list UI is up-to-date after creation
            await loadWorkspaces();
        } else {
            alert(data.error || 'Failed to create workspace');
        }
    } catch (e) {
        console.error('Error creating workspace:', e);
        alert('Error creating workspace: ' + (e.message || e));
    }
}

// Workspace settings
let settingsWorkspaceId = null;
let settingsWorkspaceRole = null;

async function openWorkspaceSettings() {
    if (!activeWorkspaceId) return;
    // Ensure workspaces are loaded
    if (userWorkspaces.length === 0) {
        await loadWorkspaces();
    }
    settingsWorkspaceId = activeWorkspaceId;
    const ws = userWorkspaces.find(w => w.id === activeWorkspaceId);
    if (!ws) return;
    
    settingsWorkspaceRole = ws.role;
    document.getElementById('wsSettingsName').value = ws.name;
    document.getElementById('wsSettingsDesc').value = ws.description || '';
    document.getElementById('wsCurrentRole').textContent = ws.role;
    
    // Show/hide delete button based on role
    const deleteBtn = document.getElementById('wsDeleteBtn');
    if (deleteBtn) deleteBtn.style.display = ws.role === 'owner' ? '' : 'none';
    
    // Show/hide invite tab based on permissions
    const inviteTab = document.querySelector('.ws-tab[data-tab="ws-invite"]');
    if (inviteTab) inviteTab.style.display = (ws.role === 'owner' || ws.role === 'admin') ? '' : 'none';
    
    // Load members
    loadWorkspaceMembers();
    loadWsPendingInvites();
    
    // Reset to general tab
    switchWsTab('ws-general');
    document.getElementById('workspaceSettingsModal').style.display = 'flex';
}

function closeWorkspaceSettingsModal() {
    document.getElementById('workspaceSettingsModal').style.display = 'none';
    settingsWorkspaceId = null;
}

function switchWsTab(tabId) {
    document.querySelectorAll('.ws-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.ws-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector(`.ws-tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
    
    // Initialize invite tab when switching to it
    if (tabId === 'ws-invite') {
        initInviteTab();
    }
}

async function saveWorkspaceSettings() {
    const name = document.getElementById('wsSettingsName').value.trim();
    const description = document.getElementById('wsSettingsDesc').value.trim();
    if (!name) return alert('Name is required');
    
    if (!authToken) return alert('Not authenticated. Please log in again.');
    try {
        const res = await fetch(`/api/workspaces/${settingsWorkspaceId}`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });
        const data = await res.json();
        if (data.success) {
            await loadWorkspaces();
            alert('Workspace updated');
        } else {
            alert(data.error || 'Failed to update');
        }
    } catch (e) {
        alert('Error saving workspace');
    }
}

async function deleteWorkspaceConfirm() {
    const ws = userWorkspaces.find(w => w.id === settingsWorkspaceId);
    if (!confirm(`Are you sure you want to delete "${ws?.name}"? This cannot be undone.`)) return;
    
    if (!authToken) return alert('Not authenticated. Please log in again.');
    try {
        const res = await fetch(`/api/workspaces/${settingsWorkspaceId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            closeWorkspaceSettingsModal();
            activeWorkspaceId = null;
            localStorage.removeItem('activeWorkspaceId');
            await loadWorkspaces();
        } else {
            alert(data.error || 'Failed to delete');
        }
    } catch (e) {
        alert('Error deleting workspace');
    }
}

// Members management
async function loadWorkspaceMembers() {
    if (!settingsWorkspaceId) return;
    if (!authToken) return;
    try {
        const res = await fetch(`/api/workspaces/${settingsWorkspaceId}/members`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            renderMembers(data.members);
        }
    } catch (e) {
        console.error('Failed to load members:', e);
    }
}

function renderMembers(members) {
    const container = document.getElementById('wsMembersList');
    if (!container) return;
    
    const canManage = settingsWorkspaceRole === 'owner' || settingsWorkspaceRole === 'admin';
    
    container.innerHTML = members.map(m => {
        const initials = getInitials(m.userName || m.userEmail || '?');
        const avatarHtml = m.picture
            ? `<img src="${m.picture}" class="ws-member-avatar" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'ws-member-avatar\\'>${initials}</div>'">`
            : `<div class="ws-member-avatar">${initials}</div>`;
        const actionsHtml = canManage && m.role !== 'owner' ? `
            <div class="ws-member-actions">
                <select onchange="changeMemberRole('${m.userId}', this.value)">
                    <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
                    <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
                </select>
                <button onclick="removeMember('${m.userId}', '${escapeHtml(m.userName || m.userEmail)}')">Remove</button>
            </div>
        ` : '';
        
        return `
            <div class="ws-member-row">
                ${avatarHtml}
                <div class="ws-member-info">
                    <div class="ws-member-name">${escapeHtml(m.userName || 'Unknown')}</div>
                    <div class="ws-member-email">${escapeHtml(m.userEmail || '')}</div>
                </div>
                <span class="ws-member-role ${m.role}">${m.role}</span>
                ${actionsHtml}
            </div>
        `;
    }).join('');
}

async function changeMemberRole(userId, newRole) {
    if (!authToken) return alert('Not authenticated. Please log in again.');
    try {
        const res = await fetch(`/api/workspaces/${settingsWorkspaceId}/members/${userId}/role`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        const data = await res.json();
        if (!data.success) alert(data.error || 'Failed to change role');
        await loadWorkspaceMembers();
    } catch (e) {
        alert('Error changing role');
    }
}

async function removeMember(userId, name) {
    if (!confirm(`Remove ${name} from this workspace?`)) return;
    if (!authToken) return alert('Not authenticated. Please log in again.');
    try {
        const res = await fetch(`/api/workspaces/${settingsWorkspaceId}/members/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            await loadWorkspaceMembers();
        } else {
            alert(data.error || 'Failed to remove member');
        }
    } catch (e) {
        alert('Error removing member');
    }
}

// ===== Enhanced Invite Flow =====
let inviteEmailValid = false;
let inviteEmailTimeout = null;

function initInviteTab() {
    // Populate workspace dropdown
    const wsSelect = document.getElementById('wsInviteWorkspace');
    if (!wsSelect) return;
    
    wsSelect.innerHTML = userWorkspaces.map(ws => 
        `<option value="${ws.id}" ${ws.id === settingsWorkspaceId ? 'selected' : ''}>${escapeHtml(ws.name)}</option>`
    ).join('');
    
    // Load boards for the selected workspace
    onInviteWorkspaceChange();
    
    // Reset form state
    document.getElementById('wsInviteEmail').value = '';
    document.getElementById('wsInviteEmailError').textContent = '';
    document.getElementById('wsInviteEmailStatus').className = 'invite-email-status';
    updateInviteSendBtn();
}

function validateInviteEmail() {
    const input = document.getElementById('wsInviteEmail');
    const email = input.value.trim();
    const errorEl = document.getElementById('wsInviteEmailError');
    const statusEl = document.getElementById('wsInviteEmailStatus');
    
    // Clear previous timeout
    if (inviteEmailTimeout) clearTimeout(inviteEmailTimeout);
    
    if (!email) {
        statusEl.className = 'invite-email-status';
        errorEl.textContent = '';
        inviteEmailValid = false;
        updateInviteSendBtn();
        return;
    }
    
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        statusEl.className = 'invite-email-status invalid';
        errorEl.textContent = 'Please enter a valid email address';
        inviteEmailValid = false;
        updateInviteSendBtn();
        return;
    }
    
    // Email format is valid
    statusEl.className = 'invite-email-status checking';
    errorEl.textContent = '';
    inviteEmailValid = true;
    updateInviteSendBtn();
    
    // Debounced check if user exists (for UX hint)
    inviteEmailTimeout = setTimeout(async () => {
        try {
            const res = await fetch(`/api/users/check?email=${encodeURIComponent(email)}`, {
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            if (data.exists) {
                statusEl.className = 'invite-email-status valid';
                errorEl.innerHTML = `<span class="invite-user-hint"><span class="material-icons-outlined">check_circle</span> ${escapeHtml(data.fullName)} is registered — will be added directly</span>`;
            } else {
                statusEl.className = 'invite-email-status valid';
                errorEl.textContent = '';
            }
        } catch (e) {
            statusEl.className = 'invite-email-status valid';
            errorEl.textContent = '';
        }
    }, 500);
}

async function onInviteWorkspaceChange() {
    const wsId = document.getElementById('wsInviteWorkspace').value;
    const boardSelect = document.getElementById('wsInviteBoard');
    boardSelect.innerHTML = '<option value="">All boards</option>';
    
    if (!wsId || !authToken) return;
    
    try {
        const res = await fetch(`/api/user-data/boards?workspaceId=${wsId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success && data.data && data.data.boards) {
            data.data.boards
                .filter(b => !b.archived)
                .forEach(b => {
                    boardSelect.innerHTML += `<option value="${b.id}">${escapeHtml(b.name)}</option>`;
                });
        }
    } catch (e) {
        // Silent fail — boards dropdown stays with "All boards"
    }
}

function updateInviteSendBtn() {
    const btn = document.getElementById('wsInviteSendBtn');
    if (btn) btn.disabled = !inviteEmailValid;
}

async function sendWorkspaceInvite() {
    const email = document.getElementById('wsInviteEmail').value.trim();
    const role = document.getElementById('wsInviteRole').value;
    const wsId = document.getElementById('wsInviteWorkspace').value;
    const boardId = document.getElementById('wsInviteBoard').value;
    
    if (!email) return alert('Please enter an email address');
    if (!wsId) return alert('Please select a workspace');
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return alert('Please enter a valid email address');
    
    if (!authToken) return alert('Not authenticated. Please log in again.');
    
    const btn = document.getElementById('wsInviteSendBtn');
    btn.disabled = true;
    btn.textContent = 'Sending...';
    
    try {
        const res = await fetch(`/api/workspaces/${wsId}/invite`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, role, boardId: boardId || undefined })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('wsInviteEmail').value = '';
            document.getElementById('wsInviteEmailStatus').className = 'invite-email-status';
            document.getElementById('wsInviteEmailError').textContent = '';
            inviteEmailValid = false;
            updateInviteSendBtn();
            
            if (data.autoAdded) {
                alert(`✓ ${data.member.userName || email} is already registered and was added directly as ${data.member.role}!`);
                loadWorkspaceMembers();
                loadActiveWorkspaceMembers();
            } else {
                alert(`✓ Invite sent to ${email}!\n\nInvite link: ${window.location.origin}/?invite=${data.invite.token}`);
                loadWsPendingInvites();
            }
        } else {
            alert(data.error || 'Failed to send invite');
        }
    } catch (e) {
        alert('Error sending invite');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Send Invite';
        updateInviteSendBtn();
    }
}

async function loadWsPendingInvites() {
    if (!settingsWorkspaceId) return;
    if (!authToken) return;
    try {
        const res = await fetch(`/api/workspaces/${settingsWorkspaceId}/invites`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        const data = await res.json();
        if (data.success) {
            renderPendingInvites(data.invites);
        }
    } catch (e) {
        // Silent fail if no permission
    }
}

function renderPendingInvites(invites) {
    const container = document.getElementById('wsPendingInvites');
    if (!container) return;
    
    if (!invites || invites.length === 0) {
        container.innerHTML = '<div style="color:#676879;font-size:12px">No pending invites</div>';
        return;
    }
    
    container.innerHTML = invites.map(inv => `
        <div class="ws-invite-row">
            <span>
                <span class="invite-email">${escapeHtml(inv.targetEmail)}</span>
                <span class="invite-role">(${inv.role})</span>
            </span>
            <button class="revoke-btn" onclick="revokeInvite('${inv.token}')">Revoke</button>
        </div>
    `).join('');
}

async function revokeInvite(inviteToken) {
    if (!authToken) return;
    try {
        await fetch(`/api/workspaces/${settingsWorkspaceId}/invites/${inviteToken}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        loadWsPendingInvites();
    } catch (e) {
        // Silent
    }
}

// Handle invite links (check URL for ?invite=TOKEN)
async function checkInviteLink() {
    const params = new URLSearchParams(window.location.search);
    const inviteToken = params.get('invite');
    if (!inviteToken) return;
    
    if (!authToken) {
        // Save invite token for after login
        localStorage.setItem('pendingInviteToken', inviteToken);
        return;
    }
    
    try {
        // Verify invite first
        const verifyRes = await fetch(`/api/workspaces/invite/${inviteToken}`);
        const verifyData = await verifyRes.json();
        
        if (!verifyData.valid) {
            alert(verifyData.error || 'Invalid invite');
            window.history.replaceState({}, '', window.location.pathname);
            return;
        }
        
        if (confirm(`You've been invited to join "${verifyData.workspaceName}" by ${verifyData.inviterName} as ${verifyData.role}.\n\nJoin this workspace?`)) {
            const res = await fetch(`/api/workspaces/join/${inviteToken}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                alert(`Welcome! You've joined "${data.workspace.name}"`);
                activeWorkspaceId = data.workspace.id;
                localStorage.setItem('activeWorkspaceId', data.workspace.id);
                await loadWorkspaces();
            } else {
                alert(data.error || 'Failed to join workspace');
            }
        }
    } catch (e) {
        console.error('Invite link error:', e);
    }
    
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
}

// Process pending invite after login
async function processPendingInvite() {
    const inviteToken = localStorage.getItem('pendingInviteToken');
    if (!inviteToken) return;
    localStorage.removeItem('pendingInviteToken');
    
    if (!authToken) return;
    
    try {
        const verifyRes = await fetch(`/api/workspaces/invite/${inviteToken}`);
        const verifyData = await verifyRes.json();
        if (!verifyData.valid) return;
        
        if (confirm(`You've been invited to join "${verifyData.workspaceName}" as ${verifyData.role}.\n\nJoin this workspace?`)) {
            const res = await fetch(`/api/workspaces/join/${inviteToken}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${authToken}` }
            });
            const data = await res.json();
            if (data.success) {
                alert(`Welcome! You've joined "${data.workspace.name}"`);
                activeWorkspaceId = data.workspace.id;
                localStorage.setItem('activeWorkspaceId', data.workspace.id);
                await loadWorkspaces();
            }
        }
    } catch (e) {
        console.error('Pending invite error:', e);
    }
}

// Initialize workspaces on page load (after auth)
function initWorkspaces() {
    activeWorkspaceId = localStorage.getItem('activeWorkspaceId') || null;
    loadNotificationsFromStorage();
    loadWorkspaces();
    checkInviteLink();
}

// ===== SHARE BOARD MODAL =====
let boardAccessSetting = 'workspace'; // 'workspace' or 'private'
let notificationPrefs = {}; // { memberId: { statusUpdates: bool, messages: bool, tasksAdded: bool } }

function renderBoardOwnersStack() {
    const container = document.getElementById('boardOwnersStack');
    if (!container) return;
    
    // Show all workspace members as board participants
    const members = cachedWorkspaceMembers || [];
    const ownerData = members.map(m => ({
        name: m.userName || m.userEmail || '?',
        picture: m.picture || '',
        email: m.userEmail || ''
    }));
    
    // If no members found, show current user
    if (ownerData.length === 0 && currentUser) {
        ownerData.push({ name: currentUser.fullName || currentUser.email, picture: currentUser.picture || '', email: currentUser.email });
    }
    
    // Update invite count
    const inviteCountEl = document.getElementById('inviteCount');
    const memberCount = ownerData.length || 1;
    if (inviteCountEl) inviteCountEl.textContent = memberCount;
    
    let html = '';
    
    if (ownerData.length <= 2) {
        // Show individual avatars (reversed for overlap direction)
        ownerData.forEach(owner => {
            const initials = getInitials(owner.name || '?');
            if (owner.picture) {
                html += `<img src="${owner.picture}" class="board-owner-avatar" referrerpolicy="no-referrer" title="${escapeHtml(owner.name)}" onerror="this.outerHTML='<div class=\\'board-owner-avatar\\' title=\\'${escapeHtml(owner.name)}\\'>${initials}</div>'">`;
            } else {
                html += `<div class="board-owner-avatar" title="${escapeHtml(owner.name)}">${initials}</div>`;
            }
        });
    } else {
        // Show first 2 + "..." circle
        for (let i = 0; i < 2; i++) {
            const owner = ownerData[i];
            const initials = getInitials(owner.name || '?');
            if (owner.picture) {
                html += `<img src="${owner.picture}" class="board-owner-avatar" referrerpolicy="no-referrer" title="${escapeHtml(owner.name)}" onerror="this.outerHTML='<div class=\\'board-owner-avatar\\' title=\\'${escapeHtml(owner.name)}\\'>${initials}</div>'">`;
            } else {
                html += `<div class="board-owner-avatar" title="${escapeHtml(owner.name)}">${initials}</div>`;
            }
        }
        html += `<div class="board-owner-more" title="${ownerData.length} owners">···</div>`;
    }
    
    container.innerHTML = html;
}

function openShareBoardModal() {
    const modal = document.getElementById('shareBoardModal');
    if (!modal) return;
    
    // Set board name in title
    const titleEl = document.getElementById('shareBoardTitle');
    const board = boardData.boards ? boardData.boards.find(b => b.id === boardData.activeBoard) : null;
    const boardName = board ? board.name : 'Board';
    if (titleEl) titleEl.textContent = `Share ${boardName}`;
    
    // Set workspace name in access settings
    const ws = userWorkspaces.find(w => w.id === activeWorkspaceId);
    const wsName = ws ? ws.name : 'My Workspace';
    const accessLabel = document.getElementById('accessSettingsLabel');
    const accessWsName = document.getElementById('accessWsName');
    if (accessLabel) accessLabel.textContent = boardAccessSetting === 'workspace' ? wsName : 'Private';
    if (accessWsName) accessWsName.textContent = wsName;
    
    // Check if user can change to private (owner or admin only)
    const privateOption = document.getElementById('accessPrivateOption');
    if (privateOption) {
        const canSetPrivate = currentUser && ['super_admin', 'admin'].includes(currentUser.role);
        privateOption.style.display = canSetPrivate ? 'flex' : 'none';
    }
    
    // Render members
    renderShareBoardMembers();
    
    modal.style.display = 'flex';
}

function closeShareBoardModal() {
    const modal = document.getElementById('shareBoardModal');
    if (modal) modal.style.display = 'none';
    // Close access dropdown
    const dd = document.getElementById('accessDropdown');
    if (dd) dd.style.display = 'none';
}

function toggleAccessDropdown() {
    const dd = document.getElementById('accessDropdown');
    if (!dd) return;
    dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

function setAccessSetting(setting) {
    boardAccessSetting = setting;
    const ws = userWorkspaces.find(w => w.id === activeWorkspaceId);
    const wsName = ws ? ws.name : 'My Workspace';
    const accessLabel = document.getElementById('accessSettingsLabel');
    if (accessLabel) accessLabel.textContent = setting === 'workspace' ? wsName : 'Private';
    
    // Close dropdown
    const dd = document.getElementById('accessDropdown');
    if (dd) dd.style.display = 'none';
    
    showToast(setting === 'private' ? 'Board set to private' : `Board accessible to ${wsName}`);
}

function renderShareBoardMembers() {
    const container = document.getElementById('shareBoardMembers');
    if (!container) return;
    
    const members = cachedWorkspaceMembers || [];
    const canManage = currentUser && ['super_admin', 'admin'].includes(currentUser.role);
    
    if (members.length === 0) {
        container.innerHTML = '<div style="padding:12px;color:var(--text-secondary);font-size:13px;">No members found</div>';
        return;
    }
    
    // Add workspace group header
    const ws = userWorkspaces.find(w => w.id === activeWorkspaceId);
    const wsName = ws ? ws.name : 'My Workspace';
    
    let html = `
        <div class="share-member-row" style="border-bottom:none;padding-bottom:4px;">
            <div class="share-member-avatar" style="background:#6c6f7c;font-size:14px;"><span class="material-icons-outlined" style="font-size:16px;color:white;">group</span></div>
            <div class="share-member-info">
                <div class="share-member-name">${escapeHtml(wsName)}</div>
                <div class="share-member-email">${members.length} people</div>
            </div>
            <span class="share-member-role">Member</span>
        </div>
    `;
    
    members.forEach(m => {
        const initials = getInitials(m.userName || m.userEmail || '?');
        const avatarHtml = m.picture
            ? `<img src="${m.picture}" class="share-member-avatar" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'share-member-avatar\\'>${initials}</div>'">`
            : `<div class="share-member-avatar">${initials}</div>`;
        
        const roleLabel = m.role === 'owner' ? 'Admin' : (m.role === 'admin' ? 'Admin' : (m.role === 'viewer' ? 'Viewer' : 'Member'));
        
        const roleHtml = canManage && m.role !== 'owner' ? `
            <select class="share-member-role" onchange="changeShareMemberRole('${m.userId}', this.value)" style="border:1px solid var(--border-color);border-radius:4px;padding:3px 6px;font-size:12px;cursor:pointer;">
                <option value="admin" ${m.role === 'admin' ? 'selected' : ''}>Admin</option>
                <option value="member" ${m.role === 'member' ? 'selected' : ''}>Member</option>
                <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>Viewer</option>
            </select>
        ` : `<span class="share-member-role">${roleLabel}</span>`;
        
        html += `
            <div class="share-member-row">
                ${avatarHtml}
                <div class="share-member-info">
                    <div class="share-member-name">${escapeHtml(m.userName || 'Unknown')}</div>
                    <div class="share-member-email">${escapeHtml(m.userEmail || '')}</div>
                </div>
                ${roleHtml}
            </div>
        `;
    });
    
    container.innerHTML = html;
}

async function changeShareMemberRole(userId, newRole) {
    if (!authToken) return;
    try {
        await fetch(`/api/workspaces/${activeWorkspaceId}/members/${userId}/role`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        await loadActiveWorkspaceMembers();
        renderShareBoardMembers();
    } catch (e) {
        showToast('Error changing role');
    }
}

// ===== NOTIFICATION SETTINGS MODAL =====
function openNotifSettingsModal() {
    const modal = document.getElementById('notifSettingsModal');
    if (!modal) return;
    renderNotifSettings();
    modal.style.display = 'flex';
}

function closeNotifSettingsModal() {
    const modal = document.getElementById('notifSettingsModal');
    if (modal) modal.style.display = 'none';
}

function renderNotifSettings() {
    const container = document.getElementById('notifSettingsList');
    if (!container) return;
    
    const members = cachedWorkspaceMembers || [];
    const canManage = currentUser && ['super_admin', 'admin'].includes(currentUser.role);
    
    // Load saved prefs from localStorage
    const savedPrefs = JSON.parse(localStorage.getItem('notifPrefs_' + activeWorkspaceId) || '{}');
    notificationPrefs = savedPrefs;
    
    let html = '';
    
    // Your notifications section
    if (currentUser) {
        const myPrefs = savedPrefs[currentUser.id] || { statusUpdates: true, messages: true, tasksAdded: true };
        const initials = getInitials(currentUser.fullName || currentUser.email);
        const avatarHtml = currentUser.picture
            ? `<img src="${currentUser.picture}" class="notif-settings-avatar" referrerpolicy="no-referrer">`
            : `<div class="notif-settings-avatar">${initials}</div>`;
        
        html += `<div class="notif-settings-section-title">Your notifications</div>`;
        html += `
            <div class="notif-settings-row">
                <div class="notif-settings-user">
                    ${avatarHtml}
                    <div>
                        <div class="notif-settings-name">${escapeHtml(currentUser.fullName || currentUser.email)}</div>
                        <div class="notif-settings-email">${escapeHtml(currentUser.email)}</div>
                    </div>
                </div>
                <input type="checkbox" ${myPrefs.statusUpdates ? 'checked' : ''} onchange="updateNotifPref('${currentUser.id}', 'statusUpdates', this.checked)">
                <input type="checkbox" ${myPrefs.messages ? 'checked' : ''} onchange="updateNotifPref('${currentUser.id}', 'messages', this.checked)">
                <input type="checkbox" ${myPrefs.tasksAdded ? 'checked' : ''} onchange="updateNotifPref('${currentUser.id}', 'tasksAdded', this.checked)">
            </div>
        `;
    }
    
    // Teams section
    const ws = userWorkspaces.find(w => w.id === activeWorkspaceId);
    const wsName = ws ? ws.name : 'My Workspace';
    const wsPrefs = savedPrefs['team_' + activeWorkspaceId] || { statusUpdates: false, messages: false, tasksAdded: false };
    
    html += `<div class="notif-settings-section-title">Teams</div>`;
    html += `
        <div class="notif-settings-row">
            <div class="notif-settings-user">
                <div class="notif-settings-avatar" style="background:#6c6f7c;"><span class="material-icons-outlined" style="font-size:14px;color:white;">group</span></div>
                <div>
                    <div class="notif-settings-name">${escapeHtml(wsName)}</div>
                    <div class="notif-settings-email">${members.length} people</div>
                </div>
            </div>
            <input type="checkbox" ${wsPrefs.statusUpdates ? 'checked' : ''} onchange="updateNotifPref('team_${activeWorkspaceId}', 'statusUpdates', this.checked)">
            <input type="checkbox" ${wsPrefs.messages ? 'checked' : ''} onchange="updateNotifPref('team_${activeWorkspaceId}', 'messages', this.checked)">
            <input type="checkbox" ${wsPrefs.tasksAdded ? 'checked' : ''} onchange="updateNotifPref('team_${activeWorkspaceId}', 'tasksAdded', this.checked)">
        </div>
    `;
    
    // People section (other members)
    const otherMembers = members.filter(m => !currentUser || m.userEmail !== currentUser.email);
    if (otherMembers.length > 0) {
        html += `<div class="notif-settings-section-title">People</div>`;
        otherMembers.forEach(m => {
            const mPrefs = savedPrefs[m.userId] || { statusUpdates: true, messages: true, tasksAdded: true };
            const initials = getInitials(m.userName || m.userEmail || '?');
            const avatarHtml = m.picture
                ? `<img src="${m.picture}" class="notif-settings-avatar" referrerpolicy="no-referrer">`
                : `<div class="notif-settings-avatar">${initials}</div>`;
            
            const disabled = !canManage && currentUser && m.userId !== currentUser.id ? 'disabled' : '';
            
            html += `
                <div class="notif-settings-row">
                    <div class="notif-settings-user">
                        ${avatarHtml}
                        <div>
                            <div class="notif-settings-name">${escapeHtml(m.userName || 'Unknown')}</div>
                            <div class="notif-settings-email">${escapeHtml(m.userEmail || '')}</div>
                        </div>
                    </div>
                    <input type="checkbox" ${mPrefs.statusUpdates ? 'checked' : ''} ${disabled} onchange="updateNotifPref('${m.userId}', 'statusUpdates', this.checked)">
                    <input type="checkbox" ${mPrefs.messages ? 'checked' : ''} ${disabled} onchange="updateNotifPref('${m.userId}', 'messages', this.checked)">
                    <input type="checkbox" ${mPrefs.tasksAdded ? 'checked' : ''} ${disabled} onchange="updateNotifPref('${m.userId}', 'tasksAdded', this.checked)">
                </div>
            `;
        });
    }
    
    container.innerHTML = html;
}

function updateNotifPref(entityId, type, value) {
    const savedPrefs = JSON.parse(localStorage.getItem('notifPrefs_' + activeWorkspaceId) || '{}');
    if (!savedPrefs[entityId]) savedPrefs[entityId] = { statusUpdates: true, messages: true, tasksAdded: true };
    savedPrefs[entityId][type] = value;
    localStorage.setItem('notifPrefs_' + activeWorkspaceId, JSON.stringify(savedPrefs));
    notificationPrefs = savedPrefs;
}

// ===== NOTIFICATIONS PANEL (Bell Icon) =====
let notifications = [];

function saveNotificationsToStorage() {
    if (!activeWorkspaceId) return;
    try {
        const data = notifications.map(n => ({
            ...n,
            time: n.time instanceof Date ? n.time.toISOString() : n.time
        }));
        localStorage.setItem('notifications_' + activeWorkspaceId, JSON.stringify(data));
        // Also persist to server (fire and forget)
        saveNotificationsToServer(data);
    } catch (e) { /* quota exceeded or private mode */ }
}

async function saveNotificationsToServer(data) {
    try {
        await authFetch('/api/user-data/notifications', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data, workspaceId: activeWorkspaceId })
        });
    } catch (e) { /* silent - localStorage is primary */ }
}

function loadNotificationsFromStorage() {
    if (!activeWorkspaceId) return;
    try {
        const raw = localStorage.getItem('notifications_' + activeWorkspaceId);
        if (raw) {
            notifications = JSON.parse(raw).map(n => ({
                ...n,
                time: new Date(n.time)
            }));
            // Keep only last 50 and discard notifications older than 7 days
            const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
            notifications = notifications.filter(n => new Date(n.time).getTime() > sevenDaysAgo).slice(0, 50);
        } else {
            notifications = [];
        }
    } catch (e) {
        notifications = [];
    }
    renderNotifications();
    updateNotifBadge();
    // Also try to load from server (in case localStorage was cleared)
    loadNotificationsFromServer();
}

async function loadNotificationsFromServer() {
    if (!activeWorkspaceId) return;
    try {
        const res = await authFetch('/api/user-data/notifications?workspaceId=' + activeWorkspaceId);
        const result = await res.json();
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
            // Merge server data with local data (server is backup)
            const serverNotifs = result.data.map(n => ({ ...n, time: new Date(n.time) }));
            // If local is empty but server has data, use server data
            if (notifications.length === 0 && serverNotifs.length > 0) {
                notifications = serverNotifs;
                const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                notifications = notifications.filter(n => new Date(n.time).getTime() > sevenDaysAgo).slice(0, 50);
                renderNotifications();
                updateNotifBadge();
            }
        }
    } catch (e) { /* silent */ }
}

function toggleNotificationsPanel() {
    const panel = document.getElementById('notificationsPanel');
    if (!panel) return;
    if (panel.style.display === 'none') {
        panel.style.display = 'block';
        // Mark all as read when panel opens
        markNotificationsAsRead();
        // Close on outside click
        setTimeout(() => {
            document.addEventListener('click', closeNotifPanelOutside);
        }, 10);
    } else {
        panel.style.display = 'none';
        document.removeEventListener('click', closeNotifPanelOutside);
    }
}

function closeNotifPanelOutside(e) {
    const panel = document.getElementById('notificationsPanel');
    const wrapper = document.querySelector('.notification-bell-wrapper');
    if (panel && wrapper && !wrapper.contains(e.target)) {
        panel.style.display = 'none';
        document.removeEventListener('click', closeNotifPanelOutside);
    }
}

function addNotification(type, message, user, detail) {
    const notif = {
        id: Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        type, // 'task_added', 'status_change', 'message'
        message,
        user, // { name, picture, email }
        detail,
        time: new Date(),
        read: false
    };
    notifications.unshift(notif);
    if (notifications.length > 50) notifications = notifications.slice(0, 50);
    saveNotificationsToStorage();
    renderNotifications();
    updateNotifBadge();
}

function markNotificationsAsRead() {
    notifications.forEach(n => { n.read = true; });
    saveNotificationsToStorage();
    updateNotifBadge();
}

function renderNotifications() {
    const container = document.getElementById('notifList');
    if (!container) return;
    
    if (notifications.length === 0) {
        container.innerHTML = '<div class="notif-empty">No notifications</div>';
        return;
    }
    
    container.innerHTML = notifications.map(n => {
        const initials = getInitials(n.user ? n.user.name : '?');
        const avatarHtml = n.user && n.user.picture
            ? `<img src="${n.user.picture}" class="notif-item-avatar" referrerpolicy="no-referrer">`
            : `<div class="notif-item-avatar">${initials}</div>`;
        
        const timeAgo = getTimeAgo(n.time);
        const unreadClass = n.read ? '' : ' notif-item-unread';
        
        return `
            <div class="notif-item${unreadClass}">
                ${avatarHtml}
                <div class="notif-item-content">
                    <div class="notif-item-text">${n.message}</div>
                    <div class="notif-item-time">${timeAgo}</div>
                </div>
            </div>
        `;
    }).join('');
}

function updateNotifBadge() {
    const badge = document.getElementById('notifBadge');
    if (!badge) return;
    const unreadCount = notifications.filter(n => !n.read).length;
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'block';
    } else {
        badge.style.display = 'none';
    }
}

function clearAllNotifications() {
    notifications = [];
    saveNotificationsToStorage();
    renderNotifications();
    updateNotifBadge();
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${Math.floor(diffHours / 24)}d ago`;
}

// ===== TASK ADDED POPUP (bottom-right, stacking) =====
let activePopups = []; // [{id, element, timeout}]

function showTaskAddedPopup(taskName, addedBy, note) {
    // Create a new popup element
    const popupId = 'popup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
    
    const initials = getInitials(addedBy ? addedBy.name : '?');
    const avatarHtml = addedBy && addedBy.picture
        ? `<img src="${addedBy.picture}" class="task-added-user-avatar" referrerpolicy="no-referrer">`
        : `<div class="task-added-user-avatar">${initials}</div>`;
    
    const popup = document.createElement('div');
    popup.id = popupId;
    popup.className = 'task-added-popup';
    popup.innerHTML = `
        <div class="task-added-content">
            <div class="task-added-header">
                <span class="material-icons-outlined">assignment</span>
                <span class="task-added-title">${escapeHtml(taskName || 'New task added')}</span>
                <button class="task-added-close" onclick="dismissSinglePopup('${popupId}')">&times;</button>
            </div>
            <div class="task-added-detail">
                ${avatarHtml}
                <span><strong>${escapeHtml(addedBy ? addedBy.name : 'Someone')}</strong> added this task${note ? ': ' + escapeHtml(note.substring(0, 60)) : ''}</span>
            </div>
        </div>
    `;
    
    document.body.appendChild(popup);
    
    // Position: stack above existing popups
    repositionPopups();
    
    // Auto-dismiss after 10 seconds
    const timeout = setTimeout(() => {
        dismissSinglePopup(popupId);
    }, 10000);
    
    activePopups.push({ id: popupId, element: popup, timeout });
    repositionPopups();
}

function dismissSinglePopup(popupId) {
    const idx = activePopups.findIndex(p => p.id === popupId);
    if (idx === -1) return;
    
    const popupData = activePopups[idx];
    clearTimeout(popupData.timeout);
    
    // Animate out
    popupData.element.style.opacity = '0';
    popupData.element.style.transform = 'translateX(100%)';
    setTimeout(() => {
        popupData.element.remove();
    }, 300);
    
    activePopups.splice(idx, 1);
    
    // Reposition remaining
    setTimeout(() => repositionPopups(), 310);
}

function repositionPopups() {
    let bottomOffset = 20;
    // Stack from bottom up (newest at bottom)
    for (let i = activePopups.length - 1; i >= 0; i--) {
        const p = activePopups[i];
        p.element.style.bottom = bottomOffset + 'px';
        p.element.style.right = '20px';
        bottomOffset += (p.element.offsetHeight || 70) + 10;
    }
}

function dismissTaskAddedPopup() {
    // Legacy - individual popups are now managed by dismissSinglePopup
    activePopups.forEach(p => {
        clearTimeout(p.timeout);
        p.element.remove();
    });
    activePopups = [];
}

// Hook into task creation to trigger notifications
const originalAddTask = typeof addTask === 'function' ? addTask : null;

function triggerTaskAddedNotification(taskName, parentTaskName) {
    if (!currentUser) return;
    
    const user = { name: currentUser.fullName || currentUser.email, picture: currentUser.picture || '' };
    const label = parentTaskName ? `Subtask in "${parentTaskName}"` : 'New task';
    
    // Show bottom-right popup
    showTaskAddedPopup(taskName, user, '');
    
    // Add to notifications panel
    const msgHtml = parentTaskName
        ? `<strong>${escapeHtml(user.name)}</strong> added subtask "<strong>${escapeHtml(taskName)}</strong>" to "${escapeHtml(parentTaskName)}"`
        : `<strong>${escapeHtml(user.name)}</strong> added task "<strong>${escapeHtml(taskName)}</strong>"`;
    addNotification('task_added', msgHtml, user, taskName);
}

// ===== TASK DETAILS PANEL (Asana-style sliding panel) =====
let tdpCurrentTask = null;
let tdpCurrentGroup = null;
let tdpCurrentSubtask = null; // for subtask detail view
let tdpIsFullscreen = false;
let tdpIsLiked = false;
let tdpIsPrivate = false;
let tdpMessages = {}; // taskId -> messages array
let tdpLikedMap = {}; // taskId -> boolean
let tdpPrivateMap = {}; // taskId -> boolean
let tdpPendingImage = null;
let tdpDataLoaded = false;

// Load all task details data from server
async function loadTdpDataFromServer() {
    if (!authToken || !activeWorkspaceId) return;
    try {
        const res = await fetch(`/api/user-data/task-details?workspaceId=${activeWorkspaceId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (!res.ok) return;
        const result = await res.json();
        if (result.success && result.data) {
            tdpMessages = result.data.messages || {};
            tdpLikedMap = result.data.liked || {};
            tdpPrivateMap = result.data.privacy || {};
            tdpDataLoaded = true;
        }
    } catch (e) {
        console.error('[TDP] Failed to load task details from server:', e);
    }
}

// Save all task details data to server
async function saveTdpDataToServer() {
    if (!authToken || !activeWorkspaceId) return;
    try {
        await fetch('/api/user-data/task-details', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({
                workspaceId: activeWorkspaceId,
                data: {
                    messages: tdpMessages,
                    liked: tdpLikedMap,
                    privacy: tdpPrivateMap
                }
            })
        });
    } catch (e) {
        console.error('[TDP] Failed to save task details to server:', e);
    }
}

// Single-click on task cell opens details panel
function handleTaskCellClick(event, taskId, groupId) {
    // Don't open if user clicked on a button, checkbox, or expand icon
    if (event.target.closest('.task-icon-btn, .subtask-expand-btn, .subtask-info-badge, button, input')) return;
    openTaskDetailsPanel(taskId, groupId);
}

// Single-click on subtask cell opens details panel
function handleSubtaskCellClick(event, subId, taskId, groupId) {
    if (event.target.closest('.task-icon-btn, .subtask-delete-btn, button, input')) return;
    openSubtaskDetailsPanel(subId, taskId, groupId);
}

// Open details panel for a subtask
function openSubtaskDetailsPanel(subId, taskId, groupId) {
    const { group, task } = findTask(taskId, groupId);
    if (!task) return;
    const subtask = (task.subtasks || []).find(s => String(s.id) === String(subId));
    if (!subtask) return;
    
    // Use a "virtual task" representation for the subtask
    tdpCurrentTask = subtask;
    tdpCurrentGroup = group;
    tdpCurrentSubtask = { subId, taskId, groupId, parentTask: task };
    
    const msgKey = `sub_${subId}`;
    if (!tdpMessages[msgKey]) tdpMessages[msgKey] = [];
    
    tdpIsLiked = !!tdpLikedMap[msgKey];
    tdpIsPrivate = !!tdpPrivateMap[msgKey]; // default public (false)
    
    renderTaskDetailsPanel();
    
    const panel = document.getElementById('taskDetailsPanel');
    panel.classList.add('open');
    
    let overlay = document.querySelector('.tdp-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'tdp-overlay';
        overlay.onclick = closeTaskDetailsPanel;
        document.body.appendChild(overlay);
    }
    setTimeout(() => overlay.classList.add('active'), 10);
}

function openTaskDetailsPanel(taskId, groupId) {
    const { group, task } = findTask(taskId, groupId);
    if (!task) return;
    tdpCurrentTask = task;
    tdpCurrentGroup = group;
    tdpCurrentSubtask = null; // Not a subtask
    
    // Use server-persisted data maps
    if (!tdpMessages[taskId]) tdpMessages[taskId] = [];
    
    tdpIsLiked = !!tdpLikedMap[taskId];
    tdpIsPrivate = !!tdpPrivateMap[taskId]; // default public (false)
    
    renderTaskDetailsPanel();
    
    // Show panel
    const panel = document.getElementById('taskDetailsPanel');
    panel.classList.add('open');
    
    // Add overlay
    let overlay = document.querySelector('.tdp-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'tdp-overlay';
        overlay.onclick = closeTaskDetailsPanel;
        document.body.appendChild(overlay);
    }
    setTimeout(() => overlay.classList.add('active'), 10);
}

function closeTaskDetailsPanel() {
    // Save any edits
    saveTdpChanges();
    
    const panel = document.getElementById('taskDetailsPanel');
    panel.classList.remove('open', 'fullscreen');
    tdpIsFullscreen = false;
    
    const overlay = document.querySelector('.tdp-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 300);
    }
    
    // Remove any open pickers
    document.querySelectorAll('.tdp-owner-picker, .tdp-status-picker').forEach(el => el.remove());
    
    tdpCurrentTask = null;
    tdpCurrentGroup = null;
}

function renderTaskDetailsPanel() {
    if (!tdpCurrentTask) return;
    const task = tdpCurrentTask;
    
    // Status badge
    const status = getStatusInfo(task.status);
    const statusBadge = document.getElementById('tdpStatusBadge');
    statusBadge.style.background = status.color;
    statusBadge.textContent = status.label || 'No status';
    
    // Task title
    document.getElementById('tdpTaskTitle').textContent = task.name;
    
    // Like button
    const likeBtn = document.getElementById('tdpLikeBtn');
    likeBtn.classList.toggle('liked', tdpIsLiked);
    likeBtn.querySelector('.material-icons-outlined').textContent = tdpIsLiked ? 'favorite' : 'favorite_border';
    
    // Privacy
    const privacyEl = document.getElementById('tdpPrivacy');
    if (tdpIsPrivate) {
        privacyEl.innerHTML = `<span class="material-icons-outlined">lock</span><span class="tdp-privacy-text">Private</span><button class="tdp-make-public-btn" onclick="toggleTdpPrivacy()">Make public</button>`;
    } else {
        privacyEl.innerHTML = `<span class="material-icons-outlined">public</span><span class="tdp-privacy-text">Public</span><button class="tdp-make-public-btn" onclick="toggleTdpPrivacy()">Make private</button>`;
    }
    
    // Owner field
    const ownerField = document.getElementById('tdpOwnerField');
    if (task.owner) {
        const member = cachedWorkspaceMembers.find(m => m.name === task.owner || m.email === task.owner);
        const pic = member && member.picture ? `<img src="${member.picture}" style="width:22px;height:22px;border-radius:50%;margin-left:6px;">` : '';
        ownerField.innerHTML = `${pic}<span>${escapeHtml(task.owner)}</span>`;
    } else {
        ownerField.innerHTML = '<span class="tdp-placeholder">No owner</span>';
    }
    
    // Due date
    document.getElementById('tdpDueDateInput').value = task.dueDate || '';
    
    // Workspace
    const activeWs = userWorkspaces.find(ws => ws.id === activeWorkspaceId);
    document.querySelector('#tdpWorkspaceField .tdp-workspace-name').textContent = activeWs ? activeWs.name : 'No workspace';
    
    // Status field
    const statusField = document.getElementById('tdpStatusField');
    const statusChip = statusField.querySelector('.tdp-status-chip');
    statusChip.style.background = status.color;
    statusChip.textContent = status.label || 'No status';
    
    // Owner avatars in header
    renderTdpOwnerAvatars();
    
    // Subitems
    renderTdpSubitems();
    
    // Messages
    renderTdpMessages();
    
    // Description
    const descEl = document.getElementById('tdpDescription');
    descEl.textContent = task.notes || '';
}

function renderTdpOwnerAvatars() {
    const container = document.getElementById('tdpOwnerAvatars');
    if (!cachedWorkspaceMembers || cachedWorkspaceMembers.length === 0) {
        // Show at least current user
        if (currentUser) {
            const initials = getInitials(currentUser.fullName || currentUser.email);
            if (currentUser.picture) {
                container.innerHTML = `<div class="tdp-avatar" title="${escapeHtml(currentUser.fullName || currentUser.email)}"><img src="${currentUser.picture}" referrerpolicy="no-referrer" alt=""></div>`;
            } else {
                container.innerHTML = `<div class="tdp-avatar" title="${escapeHtml(currentUser.fullName || currentUser.email)}">${initials}</div>`;
            }
        } else {
            container.innerHTML = '';
        }
        return;
    }
    container.innerHTML = cachedWorkspaceMembers.slice(0, 5).map(m => {
        const name = m.userName || m.userEmail || '?';
        const initials = getInitials(name);
        if (m.picture) {
            return `<div class="tdp-avatar" title="${escapeHtml(name)}"><img src="${m.picture}" referrerpolicy="no-referrer" alt="" onerror="this.parentElement.innerHTML='${initials}'"></div>`;
        }
        return `<div class="tdp-avatar" title="${escapeHtml(name)}">${initials}</div>`;
    }).join('');
}

function renderTdpSubitems() {
    const list = document.getElementById('tdpSubitemsList');
    // Subtasks don't have their own sub-items
    if (tdpCurrentSubtask) {
        list.innerHTML = '<div class="tdp-no-messages" style="padding:12px">Subitems not available for sub-items</div>';
        return;
    }
    const subtasks = tdpCurrentTask.subtasks || [];
    if (subtasks.length === 0) {
        list.innerHTML = '<div class="tdp-no-messages" style="padding:12px">No subitems yet</div>';
        return;
    }
    list.innerHTML = subtasks.map((st, idx) => {
        const stStatus = getStatusInfo(st.status);
        const isDone = st.status === 'done';
        return `<div class="tdp-subitem ${isDone ? 'completed' : ''}" data-idx="${idx}">
            <div class="tdp-subitem-check ${isDone ? 'done' : ''}" onclick="toggleTdpSubitemDone(${idx})"></div>
            <span class="tdp-subitem-name">${escapeHtml(st.name)}</span>
            <span class="tdp-subitem-status" style="background:${stStatus.color}">${stStatus.label || ''}</span>
            <button class="tdp-subitem-delete" onclick="deleteTdpSubitem(${idx})"><span class="material-icons-outlined">close</span></button>
        </div>`;
    }).join('');
}

function renderTdpMessages() {
    const list = document.getElementById('tdpMessagesList');
    const taskId = tdpCurrentSubtask ? `sub_${tdpCurrentSubtask.subId}` : String(tdpCurrentTask.id);
    const messages = tdpMessages[taskId] || [];
    if (messages.length === 0) {
        list.innerHTML = '<div class="tdp-no-messages">No messages yet</div>';
        return;
    }
    list.innerHTML = messages.map((msg, idx) => {
        const avatar = msg.picture 
            ? `<img src="${msg.picture}" referrerpolicy="no-referrer" alt="">` 
            : escapeHtml(getInitials(msg.author));
        const timeStr = formatTimeAgo(msg.timestamp);
        const imgHtml = msg.image ? `<div class="tdp-message-image-wrap">
            <img src="${msg.image}" alt="attached image" onclick="openTdpImageLightbox(this.src)">
            <button class="tdp-image-delete-btn" onclick="deleteTdpMessageImage(${idx})" title="Remove image">
                <span class="material-icons-outlined">close</span>
            </button>
            <a class="tdp-image-download-btn" href="${msg.image}" download="image_${msg.id || idx}.png" title="Download">
                <span class="material-icons-outlined">download</span>
            </a>
        </div>` : '';
        return `<div class="tdp-message" data-msg-idx="${idx}">
            <div class="tdp-message-avatar">${avatar}</div>
            <div class="tdp-message-content">
                <div class="tdp-message-header">
                    <span class="tdp-message-author">${escapeHtml(msg.author)}</span>
                    <span class="tdp-message-time">${timeStr}</span>
                    <div class="tdp-message-actions-menu">
                        <button class="tdp-msg-action-btn" onclick="editTdpMessage(${idx})" title="Edit">
                            <span class="material-icons-outlined">edit</span>
                        </button>
                        <button class="tdp-msg-action-btn tdp-msg-delete-btn" onclick="deleteTdpMessage(${idx})" title="Delete">
                            <span class="material-icons-outlined">delete</span>
                        </button>
                    </div>
                </div>
                <div class="tdp-message-text">${escapeHtml(msg.text)}${imgHtml}</div>
            </div>
        </div>`;
    }).join('');
    list.scrollTop = list.scrollHeight;
}

function formatTimeAgo(timestamp) {
    const diff = Date.now() - new Date(timestamp).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

function saveTdpChanges() {
    if (!tdpCurrentTask) return;
    
    // Save title
    const titleEl = document.getElementById('tdpTaskTitle');
    if (titleEl && titleEl.textContent.trim()) {
        tdpCurrentTask.name = titleEl.textContent.trim();
    }
    
    // Save description to notes
    const descEl = document.getElementById('tdpDescription');
    if (descEl) {
        tdpCurrentTask.notes = descEl.textContent.trim();
    }
    
    tdpCurrentTask.lastUpdated = nowISO();
    renderBoard();
    saveToStorage();
}

// Status toggle
function toggleTdpStatus(event) {
    if (!tdpCurrentTask) return;
    // Show status picker dropdown instead of cycling
    const badge = document.getElementById('tdpStatusBadge');
    const rect = badge.getBoundingClientRect();
    
    document.querySelectorAll('.tdp-status-picker').forEach(el => el.remove());
    
    const picker = document.createElement('div');
    picker.className = 'tdp-status-picker';
    
    picker.innerHTML = STATUS_OPTIONS.map(s => {
        return `<div class="tdp-status-picker-item" onclick="selectTdpStatus('${s.id}')">
            <div class="status-dot" style="background:${s.color}"></div>
            <span>${s.label || '(Empty)'}</span>
        </div>`;
    }).join('');
    
    picker.style.top = (rect.bottom + 4) + 'px';
    picker.style.left = rect.left + 'px';
    document.body.appendChild(picker);
    
    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target) && e.target !== badge) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    }, 10);
}

// Like toggle
function toggleTdpLike() {
    if (!tdpCurrentTask) return;
    tdpIsLiked = !tdpIsLiked;
    const key = tdpCurrentSubtask ? `sub_${tdpCurrentSubtask.subId}` : String(tdpCurrentTask.id);
    tdpLikedMap[key] = tdpIsLiked;
    saveTdpDataToServer();
    const likeBtn = document.getElementById('tdpLikeBtn');
    likeBtn.classList.toggle('liked', tdpIsLiked);
    likeBtn.querySelector('.material-icons-outlined').textContent = tdpIsLiked ? 'favorite' : 'favorite_border';
}

// Privacy toggle
function toggleTdpPrivacy() {
    if (!tdpCurrentTask) return;
    tdpIsPrivate = !tdpIsPrivate;
    const key = tdpCurrentSubtask ? `sub_${tdpCurrentSubtask.subId}` : String(tdpCurrentTask.id);
    tdpPrivateMap[key] = tdpIsPrivate;
    saveTdpDataToServer();
    renderTaskDetailsPanel();
}

// Fullscreen toggle
function toggleTdpFullscreen() {
    const panel = document.getElementById('taskDetailsPanel');
    tdpIsFullscreen = !tdpIsFullscreen;
    panel.classList.toggle('fullscreen', tdpIsFullscreen);
}

// Owner picker
function openTdpOwnerPicker(event) {
    event.stopPropagation();
    // Remove existing
    document.querySelectorAll('.tdp-owner-picker').forEach(el => el.remove());
    
    const picker = document.createElement('div');
    picker.className = 'tdp-owner-picker';
    
    const members = cachedWorkspaceMembers || [];
    let html = members.map(m => {
        const pic = m.picture ? `<img src="${m.picture}" alt="">` : escapeHtml(getInitials(m.name || m.email));
        return `<div class="tdp-owner-picker-item" onclick="selectTdpOwner('${escapeHtml(m.name || m.email)}')">
            <div class="owner-pic">${pic}</div>
            <span>${escapeHtml(m.name || m.email)}</span>
        </div>`;
    }).join('');
    
    // Add "Remove owner" option
    html += `<div class="tdp-owner-picker-item" onclick="selectTdpOwner('')" style="color:var(--text-muted)">
        <div class="owner-pic" style="background:#ccc"><span class="material-icons-outlined" style="font-size:14px;color:#fff">close</span></div>
        <span>No owner</span>
    </div>`;
    
    picker.innerHTML = html;
    
    // Position near the field
    const rect = event.currentTarget.getBoundingClientRect();
    picker.style.top = (rect.bottom + 4) + 'px';
    picker.style.left = rect.left + 'px';
    document.body.appendChild(picker);
    
    // Close on outside click
    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    }, 10);
}

function selectTdpOwner(ownerName) {
    if (!tdpCurrentTask) return;
    tdpCurrentTask.owner = ownerName;
    tdpCurrentTask.lastUpdated = nowISO();
    document.querySelectorAll('.tdp-owner-picker').forEach(el => el.remove());
    renderTaskDetailsPanel();
    renderBoard();
    saveToStorage();
}

// Status picker
function openTdpStatusPicker(event) {
    event.stopPropagation();
    document.querySelectorAll('.tdp-status-picker').forEach(el => el.remove());
    
    const picker = document.createElement('div');
    picker.className = 'tdp-status-picker';
    
    picker.innerHTML = STATUS_OPTIONS.map(s => {
        return `<div class="tdp-status-picker-item" onclick="selectTdpStatus('${s.id}')">
            <div class="status-dot" style="background:${s.color}"></div>
            <span>${s.label || '(Empty)'}</span>
        </div>`;
    }).join('');
    
    const rect = event.currentTarget.getBoundingClientRect();
    picker.style.top = (rect.bottom + 4) + 'px';
    picker.style.left = rect.left + 'px';
    document.body.appendChild(picker);
    
    setTimeout(() => {
        document.addEventListener('click', function closePicker(e) {
            if (!picker.contains(e.target)) {
                picker.remove();
                document.removeEventListener('click', closePicker);
            }
        });
    }, 10);
}

function selectTdpStatus(statusId) {
    if (!tdpCurrentTask) return;
    tdpCurrentTask.status = statusId;
    tdpCurrentTask.lastUpdated = nowISO();
    document.querySelectorAll('.tdp-status-picker').forEach(el => el.remove());
    renderTaskDetailsPanel();
    renderBoard();
    saveToStorage();
}

// Due date
function updateTdpDueDate(value) {
    if (!tdpCurrentTask) return;
    tdpCurrentTask.dueDate = value;
    tdpCurrentTask.lastUpdated = nowISO();
    renderBoard();
    saveToStorage();
}

// Subitems
function addTdpSubitem() {
    if (!tdpCurrentTask) return;
    const name = prompt('Subitem name:');
    if (!name || !name.trim()) return;
    if (!tdpCurrentTask.subtasks) tdpCurrentTask.subtasks = [];
    tdpCurrentTask.subtasks.push({
        id: Date.now(),
        name: name.trim(),
        status: '',
        priority: '',
        dueDate: '',
        timelineStart: '',
        timelineEnd: '',
        lastUpdated: nowISO()
    });
    tdpCurrentTask.lastUpdated = nowISO();
    renderTdpSubitems();
    renderBoard();
    saveToStorage();
}

function toggleTdpSubitemDone(idx) {
    if (!tdpCurrentTask || !tdpCurrentTask.subtasks) return;
    const st = tdpCurrentTask.subtasks[idx];
    if (!st) return;
    st.status = st.status === 'done' ? '' : 'done';
    st.lastUpdated = nowISO();
    tdpCurrentTask.lastUpdated = nowISO();
    renderTdpSubitems();
    renderBoard();
    saveToStorage();
}

function deleteTdpSubitem(idx) {
    if (!tdpCurrentTask || !tdpCurrentTask.subtasks) return;
    tdpCurrentTask.subtasks.splice(idx, 1);
    tdpCurrentTask.lastUpdated = nowISO();
    renderTdpSubitems();
    renderBoard();
    saveToStorage();
}

// Messages
function sendTdpMessage() {
    if (!tdpCurrentTask || !currentUser) return;
    const inputEl = document.getElementById('tdpMessageInput');
    const text = inputEl.textContent.trim();
    const image = tdpPendingImage;
    
    if (!text && !image) return;
    
    const taskId = tdpCurrentSubtask ? `sub_${tdpCurrentSubtask.subId}` : String(tdpCurrentTask.id);
    if (!tdpMessages[taskId]) tdpMessages[taskId] = [];
    
    const msg = {
        id: Date.now(),
        author: currentUser.fullName || currentUser.email,
        picture: currentUser.picture || '',
        text: text,
        image: image || '',
        timestamp: new Date().toISOString()
    };
    
    tdpMessages[taskId].push(msg);
    
    // Save to server
    saveTdpDataToServer();
    
    // Clear input
    inputEl.textContent = '';
    tdpPendingImage = null;
    document.getElementById('tdpImagePreview').style.display = 'none';
    document.getElementById('tdpImagePreview').innerHTML = '';
    
    // Send notification to task owner if different from current user
    if (tdpCurrentTask.owner && tdpCurrentTask.owner !== currentUser.fullName && tdpCurrentTask.owner !== currentUser.email) {
        const msgHtml = `<strong>${escapeHtml(msg.author)}</strong> commented on "<strong>${escapeHtml(tdpCurrentTask.name)}</strong>"`;
        addNotification('message', msgHtml, { name: msg.author, picture: msg.picture }, tdpCurrentTask.name);
    }
    
    renderTdpMessages();
}

// Delete a message
function deleteTdpMessage(idx) {
    if (!tdpCurrentTask) return;
    const taskId = tdpCurrentSubtask ? `sub_${tdpCurrentSubtask.subId}` : String(tdpCurrentTask.id);
    const messages = tdpMessages[taskId];
    if (!messages || !messages[idx]) return;
    if (!confirm('Delete this message?')) return;
    messages.splice(idx, 1);
    saveTdpDataToServer();
    renderTdpMessages();
}

// Edit a message
function editTdpMessage(idx) {
    if (!tdpCurrentTask) return;
    const taskId = tdpCurrentSubtask ? `sub_${tdpCurrentSubtask.subId}` : String(tdpCurrentTask.id);
    const messages = tdpMessages[taskId];
    if (!messages || !messages[idx]) return;
    
    const msg = messages[idx];
    const newText = prompt('Edit message:', msg.text);
    if (newText === null) return; // cancelled
    msg.text = newText;
    msg.edited = true;
    saveTdpDataToServer();
    renderTdpMessages();
}

// Delete image from a message
function deleteTdpMessageImage(idx) {
    if (!tdpCurrentTask) return;
    const taskId = tdpCurrentSubtask ? `sub_${tdpCurrentSubtask.subId}` : String(tdpCurrentTask.id);
    const messages = tdpMessages[taskId];
    if (!messages || !messages[idx]) return;
    messages[idx].image = '';
    saveTdpDataToServer();
    renderTdpMessages();
}

// Image paste support
function setupTdpImagePaste() {
    const inputEl = document.getElementById('tdpMessageInput');
    if (!inputEl) return;
    
    inputEl.addEventListener('paste', function(e) {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                e.preventDefault();
                const blob = items[i].getAsFile();
                const reader = new FileReader();
                reader.onload = function(ev) {
                    tdpPendingImage = ev.target.result;
                    const preview = document.getElementById('tdpImagePreview');
                    preview.style.display = 'block';
                    preview.innerHTML = `<div style="position:relative;display:inline-block"><img src="${ev.target.result}" alt="preview"><button class="tdp-remove-image" onclick="removeTdpPendingImage()">&times;</button></div>`;
                };
                reader.readAsDataURL(blob);
                break;
            }
        }
    });
}

function handleTdpImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(ev) {
        tdpPendingImage = ev.target.result;
        const preview = document.getElementById('tdpImagePreview');
        preview.style.display = 'block';
        preview.innerHTML = `<div style="position:relative;display:inline-block"><img src="${ev.target.result}" alt="preview"><button class="tdp-remove-image" onclick="removeTdpPendingImage()">&times;</button></div>`;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
}

function removeTdpPendingImage() {
    tdpPendingImage = null;
    document.getElementById('tdpImagePreview').style.display = 'none';
    document.getElementById('tdpImagePreview').innerHTML = '';
}

// Image lightbox - click to enlarge
function openTdpImageLightbox(imageSrc) {
    // Remove existing lightbox if any
    closeTdpImageLightbox();
    
    const lightbox = document.createElement('div');
    lightbox.className = 'tdp-image-lightbox';
    lightbox.onclick = function(e) { if (e.target === lightbox) closeTdpImageLightbox(); };
    lightbox.innerHTML = `
        <div class="tdp-lightbox-content">
            <img src="${imageSrc}" alt="Full size image">
            <div class="tdp-lightbox-actions">
                <a class="tdp-lightbox-btn" href="${imageSrc}" download="image.png" title="Download">
                    <span class="material-icons-outlined">download</span>
                    Download
                </a>
                <button class="tdp-lightbox-btn" onclick="closeTdpImageLightbox()" title="Close">
                    <span class="material-icons-outlined">close</span>
                    Close
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(lightbox);
    setTimeout(() => lightbox.classList.add('active'), 10);
}

function closeTdpImageLightbox() {
    const lightbox = document.querySelector('.tdp-image-lightbox');
    if (lightbox) {
        lightbox.classList.remove('active');
        setTimeout(() => lightbox.remove(), 200);
    }
}

// Initialize paste listener when DOM ready
document.addEventListener('DOMContentLoaded', function() {
    setupTdpImagePaste();
});

// ===== VERSION UPDATE CHECKER =====
const CURRENT_APP_VERSION = '44';
const VERSION_CHECK_INTERVAL = 60000; // Check every 1 minute
const VERSION_DISMISS_KEY = 'numiVersionDismissedAt';

function checkForUpdates() {
    fetch('/api/version')
        .then(res => res.json())
        .then(data => {
            if (data.version && data.version !== CURRENT_APP_VERSION) {
                // Check if user dismissed within last 24 hours
                const dismissedAt = localStorage.getItem(VERSION_DISMISS_KEY);
                if (dismissedAt) {
                    const dismissTime = parseInt(dismissedAt, 10);
                    const now = Date.now();
                    const twentyFourHours = 24 * 60 * 60 * 1000;
                    if (now - dismissTime < twentyFourHours) {
                        return; // Still within dismiss window
                    }
                }
                showVersionUpdatePopup();
            }
        })
        .catch(() => {}); // Silent fail - no network errors shown
}

function showVersionUpdatePopup() {
    const popup = document.getElementById('versionUpdatePopup');
    if (popup) {
        popup.style.display = 'block';
    }
}

function dismissVersionUpdate() {
    const popup = document.getElementById('versionUpdatePopup');
    if (popup) {
        popup.style.display = 'none';
    }
    localStorage.setItem(VERSION_DISMISS_KEY, Date.now().toString());
}

function applyVersionUpdate() {
    window.location.reload(true);
}

// Start version checking after page loads
setTimeout(() => {
    checkForUpdates();
    setInterval(checkForUpdates, VERSION_CHECK_INTERVAL);
}, 5000); // Wait 5 seconds after page load before first check
