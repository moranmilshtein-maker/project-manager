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

// Auth token management - only token stored in localStorage, no passwords
function saveAuthToken() {
    try {
        if (authToken) {
            localStorage.setItem('mondayAuthToken', authToken);
        } else {
            localStorage.removeItem('mondayAuthToken');
        }
    } catch (e) { /* ignore */ }
}

function loadAuthToken() {
    try {
        authToken = localStorage.getItem('mondayAuthToken') || null;
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
    return `${formatDate(start)} - ${formatDate(end).split(' ')[1]}`;
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
let boardData = {
    name: '\u05E0\u05D9\u05E1\u05D9\u05D5\u05DF',
    archivedGroups: [],
    boards: [
        { id: 'board1', name: '\u05E0\u05D9\u05E1\u05D9\u05D5\u05DF', color: '#0073ea', archived: false, createdAt: null }
    ],
    activeBoard: 'board1',
    groups: [
        {
            id: 'g1',
            name: 'To-Do',
            color: '#784bd1',
            collapsed: false,
            tasks: [
                {
                    id: 1, name: '\u05E8\u05D0\u05E9\u05D5\u05DF', owner: 'MM', status: 'working',
                    dueDate: '2025-02-15', priority: 'low', notes: 'Action items',
                    budget: 100, files: 1, timelineStart: '2025-02-15', timelineEnd: '2025-02-16',
                    lastUpdated: nowISO(),
                    subtasks: [],
                    subtasksExpanded: false
                },
                {
                    id: 2, name: '\u05E9\u05E0\u05D9', owner: '', status: 'done',
                    dueDate: '2025-02-16', priority: 'high', notes: 'Meeting notes',
                    budget: 1000, files: 0, timelineStart: '2025-02-17', timelineEnd: '2025-02-18',
                    lastUpdated: nowISO(),
                    subtasks: [],
                    subtasksExpanded: false
                },
                {
                    id: 3, name: '\u05E9\u05DC\u05D9\u05E9\u05D9', owner: '', status: 'stuck',
                    dueDate: '2025-02-17', priority: 'medium', notes: 'Other',
                    budget: 500, files: 0, timelineStart: '2025-02-19', timelineEnd: '2025-02-20',
                    lastUpdated: nowISO(),
                    subtasks: [],
                    subtasksExpanded: false
                }
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
};

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

function updateFloatingBar() {
    const bar = document.getElementById('floatingBar');
    if (!bar) return;
    const count = selectedTasks.size;
    if (count === 0) {
        bar.classList.remove('active');
        return;
    }
    bar.classList.add('active');
    const countEl = document.getElementById('floatingBarCount');
    if (countEl) {
        countEl.textContent = `${count} Task${count > 1 ? 's' : ''} selected`;
    }
}

// TASK 3: Single checkbox selects a specific single task
function onTaskCheckboxChange(groupId, taskId, checkbox) {
    const key = getSelectedKey(groupId, taskId);
    if (checkbox.checked) {
        selectedTasks.add(key);
    } else {
        selectedTasks.delete(key);
    }
    updateFloatingBar();
    updateGroupHeaderCheckbox(groupId);
    updateCheckboxStyles();
}

function updateGroupHeaderCheckbox(groupId) {
    const group = boardData.groups.find(g => g.id === groupId);
    if (!group) return;
    const groupEl = document.querySelector(`.group[data-group-id="${groupId}"]`);
    if (!groupEl) return;
    const headerCb = groupEl.querySelector('thead input[type="checkbox"]');
    if (!headerCb) return;
    const allChecked = group.tasks.length > 0 && group.tasks.every(t => isTaskSelected(groupId, t.id));
    const someChecked = group.tasks.some(t => isTaskSelected(groupId, t.id));
    headerCb.checked = allChecked;
    headerCb.indeterminate = someChecked && !allChecked;
}

// TASK 2: Master checkbox toggles all tasks in the group
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
    });
    // Update individual checkboxes in DOM
    const groupEl = document.querySelector(`.group[data-group-id="${groupId}"]`);
    if (groupEl) {
        groupEl.querySelectorAll('tbody tr[data-task-id] input[type="checkbox"]').forEach(cb => {
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
}

// ============================================================
// TASK 2: Floating Bar Actions
// ============================================================
function floatingBarDuplicate() {
    const items = getSelectedTaskObjects();
    if (items.length === 0) return;
    items.forEach(({ group, task }) => {
        const clone = { ...task, id: newId(), name: task.name + ' (copy)', lastUpdated: nowISO(),
            subtasks: (task.subtasks || []).map(s => ({ ...s, id: newId() })),
            subtasksExpanded: false };
        group.tasks.push(clone);
    });
    clearSelection();
    renderBoard();
}

function floatingBarDelete() {
    floatingBarPermanentDelete();
}

function floatingBarExportCSV() {
    const items = getSelectedTaskObjects();
    if (items.length === 0) return;
    const headers = ['Task', 'Owner', 'Status', 'Due Date', 'Priority', 'Notes', 'Budget', 'Timeline Start', 'Timeline End'];
    let csv = headers.join(',') + '\n';
    items.forEach(({ task }) => {
        const status = getStatusInfo(task.status);
        const priority = getPriorityInfo(task.priority);
        csv += [
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
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, 'tasks_export.csv');
}

function floatingBarExportExcel() {
    const items = getSelectedTaskObjects();
    if (items.length === 0) return;
    let table = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="UTF-8"></head><body><table>';
    table += '<tr><th>Task</th><th>Owner</th><th>Status</th><th>Due Date</th><th>Priority</th><th>Notes</th><th>Budget</th><th>Timeline Start</th><th>Timeline End</th></tr>';
    items.forEach(({ task }) => {
        const status = getStatusInfo(task.status);
        const priority = getPriorityInfo(task.priority);
        table += `<tr><td>${escapeHtml(task.name)}</td><td>${task.owner || ''}</td><td>${status.label || ''}</td><td>${task.dueDate || ''}</td><td>${priority.label || ''}</td><td>${escapeHtml(task.notes || '')}</td><td>${task.budget || 0}</td><td>${task.timelineStart || ''}</td><td>${task.timelineEnd || ''}</td></tr>`;
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

function clearSelection() {
    selectedTasks.clear();
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
    let html = '';

    boardData.groups.forEach(group => {
        html += renderGroup(group);
    });

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

function getHeaderHTML(col) {
    const w = columnState.widths[col] ? ` style="width:${columnState.widths[col]}px;min-width:${columnState.widths[col]}px"` : '';
    switch(col) {
        case 'task': return `<th class="col-task" data-col="task" draggable="true"${w}><div class="th-content" data-tooltip="The task name and main identifier">Task</div><div class="col-resize-handle"></div></th>`;
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

function getCellHTML(col, task, group, taskIdStr, groupIdStr, isViewer, status, priority, dueDateDisplay, hasTimeline, timelineColor, timelineText, expandBtn) {
    switch(col) {
        case 'task': return `<td class="cell-task" ${!isViewer ? `ondblclick="editTaskName('${taskIdStr}', '${groupIdStr}', this)"` : ''}>
                <div class="cell-task-content">
                    ${expandBtn}
                    <span class="task-name">${escapeHtml(task.name)}</span>
                    <div class="task-icons">
                        <button class="task-icon-btn" onclick="event.stopPropagation(); openTaskModal('${taskIdStr}', '${groupIdStr}')">
                            <span class="material-icons-outlined">open_in_new</span>
                        </button>
                        <button class="task-icon-btn" onclick="event.stopPropagation(); openChat('${taskIdStr}')">
                            <span class="material-icons-outlined">chat_bubble_outline</span>
                        </button>
                    </div>
                </div>
            </td>`;
        case 'owner': return `<td class="cell-owner">
                ${task.owner
                    ? `<div class="owner-avatar has-owner" ${!isViewer ? `onclick="toggleOwner('${taskIdStr}', '${groupIdStr}')"` : ''}>${escapeHtml(task.owner)}</div>`
                    : `<div class="owner-avatar no-owner" ${!isViewer ? `onclick="toggleOwner('${taskIdStr}', '${groupIdStr}')"` : ''}><span class="material-icons-outlined">person_add</span></div>`
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
        case 'notes': return `<td class="cell-notes" ${!isViewer ? `ondblclick="editNotes('${taskIdStr}', '${groupIdStr}', this)"` : ''}>${escapeHtml(task.notes || '')}</td>`;
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
                    ${task.owner ? `<div class="updated-avatar">${escapeHtml(task.owner)}</div>` : ''}
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
        ? `${formatDate(minDate.toISOString())} - ${formatDate(maxDate.toISOString()).split(' ')[1]}` : '';

    let minDue = null, maxDue = null;
    group.tasks.forEach(t => {
        if (t.dueDate) { const d = new Date(t.dueDate); if (!isNaN(d) && (!minDue || d < minDue)) minDue = d; if (!isNaN(d) && (!maxDue || d > maxDue)) maxDue = d; }
    });
    const summaryDueDate = minDue && maxDue
        ? `${formatDate(minDue.toISOString())} - ${formatDate(maxDue.toISOString()).split(' ')[1]}` : '';

    let html = `
    <div class="group" data-group-id="${group.id}">
        <div class="group-header" style="color: ${group.color}" onclick="toggleGroup('${group.id}')">
            <span class="material-icons-outlined collapse-arrow ${isCollapsed ? 'collapsed' : ''}" 
                  style="color:${group.color}">expand_more</span>
            <span class="group-title" style="color:${group.color}" 
                  onclick="event.stopPropagation(); editGroupName('${group.id}', this)">${escapeHtml(group.name)}</span>
            <span class="group-count">${taskCount} Tasks</span>
        </div>
        <div class="group-body ${isCollapsed ? 'collapsed' : ''}" style="${isCollapsed ? 'max-height:0' : 'max-height:none'}">
            <div class="table-scroll-wrapper">
                <table class="board-table">
                    <thead>
                        <tr>
                            <th class="group-color-cell" data-col="color"><div class="group-color-bar" style="background:${group.color}"></div></th>
                            <th style="width:36px" data-col="checkbox"><input type="checkbox" onchange="toggleGroupCheckbox('${group.id}', this)"></th>
                            ${getOrderedColumns().map(col => getHeaderHTML(col)).join('')}
                            <th class="col-add" data-col="add"><span class="material-icons-outlined" style="font-size:16px">add</span></th>
                        </tr>
                    </thead>
                    <tbody>`;

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
                            <td style="font-size:11px">${summaryDueDate}</td>
                            <td><div class="summary-colors">${Object.entries(priorityCounts).map(([c, n]) => `<span style="background:${c};flex:${n}"></span>`).join('')}</div></td>
                            <td></td>
                            <td style="font-size:12px">$${totalBudget.toLocaleString()}<br><span style="font-size:10px;color:#aaa">sum</span></td>
                            <td class="summary-files">${totalFiles}<br><span style="font-size:10px;color:#aaa">files</span></td>
                            <td>${summaryTimeline ? `<div class="summary-timeline"><div class="summary-timeline-bar">${summaryTimeline}</div></div>` : ''}</td>
                            <td></td><td></td>
                        </tr>`;
    }

    html += `</tbody></table></div></div></div>`;
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

    // Expand/collapse arrow for subtasks
    const expandBtn = `<button class="subtask-expand-btn ${isExpanded ? 'expanded' : ''} ${hasSubtasks ? 'has-subtasks' : ''}" 
        onclick="event.stopPropagation(); toggleSubtasks('${taskIdStr}', '${groupIdStr}')" 
        title="${hasSubtasks ? (isExpanded ? 'Collapse subitems' : 'Expand subitems') : 'Add subitem'}">
        <span class="material-icons-outlined">${hasSubtasks ? 'expand_more' : ''}</span>
        ${hasSubtasks ? `<span class="subtask-count-badge">${subtaskCount}</span>` : ''}
    </button>`;

    let html = `
        <tr data-task-id="${taskIdStr}" data-group-id="${groupIdStr}" class="${isExpanded ? 'subtasks-open' : ''}">
            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div></td>
            <td class="cell-checkbox"><input type="checkbox" onchange="onTaskCheckboxChange('${groupIdStr}', '${taskIdStr}', this)"></td>
            ${getOrderedColumns().map(col => getCellHTML(col, task, group, taskIdStr, groupIdStr, isViewer, status, priority, dueDateDisplay, hasTimeline, timelineColor, timelineText, expandBtn)).join('')}
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

function renderSubtaskSection(task, group) {
    const taskIdStr = String(task.id);
    const groupIdStr = String(group.id);
    const isViewer = currentUser && currentUser.role === 'viewer';

    let html = '';

    // Subtask header row
    html += `<tr class="subtask-header-row" data-parent-task="${taskIdStr}" data-group-id="${groupIdStr}">
        <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div></td>
        <td class="cell-checkbox"></td>
        <td colspan="11">
            <div class="subtask-header-content">
                <div class="subtask-header-columns">
                    <span class="subtask-col-name">Subitem</span>
                    <span class="subtask-col-owner">Owner</span>
                    <span class="subtask-col-status">Status</span>
                    <span class="subtask-col-date">Date</span>
                    <span class="subtask-col-add"><span class="material-icons-outlined" style="font-size:14px;color:#ccc">add</span></span>
                </div>
            </div>
        </td>
    </tr>`;

    // Subtask rows with hierarchy tree lines
    task.subtasks.forEach((sub, idx) => {
        const subIdStr = String(sub.id);
        const subStatus = getStatusInfo(sub.status);
        const subDateDisplay = sub.dueDate ? formatDate(sub.dueDate) : '';
        const isLast = idx === task.subtasks.length - 1;

        html += `<tr class="subtask-row ${isLast ? 'subtask-row-last' : ''}" data-subtask-id="${subIdStr}" data-parent-task="${taskIdStr}" data-group-id="${groupIdStr}">
            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div></td>
            <td class="cell-checkbox"><input type="checkbox" class="subtask-checkbox"></td>
            <td colspan="11">
                <div class="subtask-row-content">
                    <div class="subtask-tree-line ${isLast ? 'last' : ''}"></div>
                    <span class="subtask-name" ${!isViewer ? `ondblclick="editSubtaskName('${subIdStr}', '${taskIdStr}', '${groupIdStr}', this)"` : ''}>${escapeHtml(sub.name)}</span>
                    <div class="subtask-owner">
                        ${sub.owner
                            ? `<div class="owner-avatar has-owner subtask-avatar" ${!isViewer ? `onclick="toggleSubtaskOwner('${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''}>${escapeHtml(sub.owner)}</div>`
                            : `<div class="owner-avatar no-owner subtask-avatar" ${!isViewer ? `onclick="toggleSubtaskOwner('${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''}><span class="material-icons-outlined" style="font-size:16px">person_add</span></div>`
                        }
                    </div>
                    <div class="subtask-status">
                        <div class="status-label subtask-status-label" style="background:${subStatus.color}"
                            ${!isViewer ? `onclick="showSubtaskStatusDropdown(event, '${subIdStr}', '${taskIdStr}', '${groupIdStr}')"` : ''}>
                            ${subStatus.label || ''}
                        </div>
                    </div>
                    <div class="subtask-date">
                        <div class="date-display" ${!isViewer ? `ondblclick="editSubtaskDate('${subIdStr}', '${taskIdStr}', '${groupIdStr}', this)"` : ''}>${subDateDisplay}</div>
                    </div>
                    <div class="subtask-actions">
                        ${!isViewer ? `<button class="subtask-delete-btn" onclick="deleteSubtask('${subIdStr}', '${taskIdStr}', '${groupIdStr}')" title="Delete subitem">
                            <span class="material-icons-outlined">close</span>
                        </button>` : ''}
                    </div>
                </div>
            </td>
        </tr>`;
    });

    // Add subitem row
    if (canEdit()) {
        html += `<tr class="subtask-add-row" data-parent-task="${taskIdStr}" data-group-id="${groupIdStr}">
            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div></td>
            <td class="cell-checkbox"></td>
            <td colspan="11">
                <div class="subtask-add-trigger" onclick="addSubtaskInline('${taskIdStr}', '${groupIdStr}')">
                    + Add subitem
                </div>
            </td>
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
    const td = addRow.querySelector('td[colspan]');
    if (!td) { activeSubtaskInputs.delete(inputKey); return; }

    td.innerHTML = `<input class="inline-edit-input subtask-inline-input" type="text" placeholder="Enter subitem name..." style="margin-right:16px">`;
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
                    dueDate: '',
                    lastUpdated: nowISO()
                });
                task.subtasksExpanded = true;
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

// Toggle subtask owner
function toggleSubtaskOwner(subtaskId, taskId, groupId) {
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (subtask) {
        const initials = currentUser ? getInitials(currentUser.fullName || currentUser.email) : 'MM';
        subtask.owner = subtask.owner ? '' : initials;
        task.lastUpdated = nowISO();
        renderBoard();
    }
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
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.classList.add('active');
}

function setSubtaskStatus(subtaskId, taskId, groupId, statusId) {
    const { subtask, task } = findSubtask(subtaskId, taskId, groupId);
    if (subtask) { subtask.status = statusId; task.lastUpdated = nowISO(); renderBoard(); }
    document.getElementById('dropdownMenu').classList.remove('active');
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
        task.lastUpdated = nowISO();
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

// ===== Find task by string ID =====
function findTask(taskId, groupId) {
    const group = boardData.groups.find(g => String(g.id) === String(groupId));
    if (!group) return { group: null, task: null };
    const task = group.tasks.find(t => String(t.id) === String(taskId));
    return { group, task };
}

// ===== Toggle group collapse =====
function toggleGroup(groupId) {
    const group = boardData.groups.find(g => g.id === groupId);
    if (group) { group.collapsed = !group.collapsed; renderBoard(); }
}

// ===== Status Dropdown =====
function showStatusDropdown(event, taskId, groupId) {
    event.stopPropagation();
    const dropdown = document.getElementById('dropdownMenu');
    let html = '';
    STATUS_OPTIONS.forEach(s => {
        html += `<div class="dropdown-item" style="background:${s.color}" onclick="setTaskStatus('${taskId}', '${groupId}', '${s.id}')">${s.label || '(Empty)'}</div>`;
    });
    dropdown.innerHTML = html;
    const rect = event.target.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.classList.add('active');
}

function setTaskStatus(taskId, groupId, statusId) {
    const { group, task } = findTask(taskId, groupId);
    if (task) { task.status = statusId; task.lastUpdated = nowISO(); renderBoard(); }
    document.getElementById('dropdownMenu').classList.remove('active');
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
    dropdown.style.top = (rect.bottom + 4) + 'px';
    dropdown.style.left = rect.left + 'px';
    dropdown.classList.add('active');
}

function setTaskPriority(taskId, groupId, priorityId) {
    const { group, task } = findTask(taskId, groupId);
    if (task) { task.priority = priorityId; task.lastUpdated = nowISO(); renderBoard(); }
    document.getElementById('dropdownMenu').classList.remove('active');
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

function toggleOwner(taskId, groupId) {
    const { task } = findTask(taskId, groupId);
    if (task) {
        const initials = currentUser ? getInitials(currentUser.fullName || currentUser.email) : 'MM';
        task.owner = task.owner ? '' : initials;
        task.lastUpdated = nowISO();
        renderBoard();
    }
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
            const group = boardData.groups.find(g => g.id === groupId);
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
            if (currentUser.picture) {
                boardAvatar.outerHTML = `<img src="${currentUser.picture}" alt="${initials}" class="user-avatar user-avatar-img board-avatar" style="width:28px;height:28px;" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=\\'user-avatar user-avatar-initials board-avatar\\' style=\\'width:28px;height:28px;font-size:10px;\\'>${initials}</div>'">`;
            } else {
                boardAvatar.textContent = initials;
            }
        }

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
    renderBoard();
    showAdminLink();
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
    // Highlight the default role
    updateInviteRoleDescriptions('member');
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

    if (!emailsStr) { document.getElementById('inviteError').textContent = 'Please enter email(s)'; return; }

    const emails = emailsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e && e.includes('@'));
    if (emails.length === 0) { document.getElementById('inviteError').textContent = 'Please enter valid email(s)'; return; }

    try {
        const res = await authFetch('/api/auth/invite', {
            method: 'POST',
            body: JSON.stringify({ emails, role, message })
        });
        const data = await res.json();
        if (data.success) {
            document.getElementById('inviteError').textContent = '';
            let msg = `${data.invited.length} user(s) invited successfully!`;
            if (data.skipped.length > 0) msg += ` (${data.skipped.length} skipped - already exist)`;
            document.getElementById('inviteSuccess').textContent = msg;
            updateInviteCount();
        } else {
            document.getElementById('inviteError').textContent = data.error || 'Failed to invite';
        }
    } catch (err) {
        document.getElementById('inviteError').textContent = 'Connection error. Please try again.';
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
    try { localStorage.setItem('mondayBoardData', JSON.stringify(boardData)); } catch (e) {}
}

function loadFromStorage() {
    try {
        const data = localStorage.getItem('mondayBoardData');
        if (data) boardData = JSON.parse(data);
    } catch (e) {}
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
    if (params.get('invite')) {
        showAuthScreen();
        showRegisterForm();
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

// ============================================================
// BOARD SIDEBAR + CONTEXT MENU (Sprint 1.2 Tasks 12-13)
// ============================================================
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
            <span class="board-menu-trigger material-icons-outlined" onclick="event.preventDefault(); event.stopPropagation(); showBoardContextMenu(event, '${board.id}')" style="font-size:16px;margin-right:auto;opacity:0;transition:opacity 0.15s">more_horiz</span>
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
    boardData.activeBoard = boardId;
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
            if (newName && newName.trim()) { board.name = newName.trim(); renderBoardSidebar(); saveToStorage(); }
            break;
        case 'duplicate':
            const dup = { ...board, id: 'board' + newId(), name: board.name + ' (copy)', createdAt: nowISO() };
            boardData.boards.push(dup);
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
    if (items.length === 0) return;
    if (!confirm(`Archive ${items.length} task(s)? They can be restored within 30 days.`)) return;

    let archived = [];
    try {
        const data = localStorage.getItem('mondayArchivedTasks');
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

    try {
        localStorage.setItem('mondayArchivedTasks', JSON.stringify(archived));
    } catch (e) { /* ignore */ }

    clearSelection();
    renderBoard();
    showToast(`${items.length} task(s) archived (30-day restore)`);
}

function floatingBarPermanentDelete() {
    const count = selectedTasks.size;
    if (!confirm(`PERMANENTLY delete ${count} selected task(s)? This cannot be undone.`)) return;
    const items = getSelectedTaskObjects();
    items.forEach(({ group, task }) => {
        group.tasks = group.tasks.filter(t => t.id !== task.id);
    });
    clearSelection();
    renderBoard();
    showToast(`${count} task(s) permanently deleted`);
}

// Clean up expired archives (> 30 days)
function cleanExpiredArchives() {
    try {
        const data = localStorage.getItem('mondayArchivedTasks');
        if (!data) return;
        const archived = JSON.parse(data);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 30);
        const valid = archived.filter(a => new Date(a.archivedAt) > cutoff);
        if (valid.length !== archived.length) {
            localStorage.setItem('mondayArchivedTasks', JSON.stringify(valid));
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
        const saved = localStorage.getItem('mondayColumnState');
        if (saved) columnState = JSON.parse(saved);
    } catch(e) {}
}

function saveColumnState() {
    try {
        localStorage.setItem('mondayColumnState', JSON.stringify(columnState));
    } catch(e) {}
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
};

// --- Column Resizing (proportional - uses table-layout:fixed) ---
(function() {
    let resizing = false;
    let resizeTh = null;
    let startX = 0;
    let startWidth = 0;
    let nextTh = null;
    let nextStartWidth = 0;

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
        const newWidth = Math.max(50, startWidth + diff);
        const newNextWidth = nextTh ? Math.max(50, nextStartWidth - diff) : 0;

        resizeTh.style.width = newWidth + 'px';
        resizeTh.style.minWidth = newWidth + 'px';
        if (nextTh && nextTh.getAttribute('data-col') !== 'add') {
            nextTh.style.width = newNextWidth + 'px';
            nextTh.style.minWidth = newNextWidth + 'px';
        }
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
            if (nextTh) {
                const nextCol = nextTh.getAttribute('data-col');
                if (nextCol) columnState.widths[nextCol] = nextTh.offsetWidth;
            }
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

function initRowDragAndDrop() {
    // Mark rows as draggable if not already done
    document.querySelectorAll('tr[data-task-id]').forEach(row => {
        if (row.getAttribute('data-row-drag-init')) return;
        row.setAttribute('data-row-drag-init', '1');
        row.setAttribute('draggable', 'true');
    });
}

// Document-level drag handlers for rows (work across all groups/tables)
document.addEventListener('dragstart', function(e) {
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
    if (!_rowDragData) return;
    const row = e.target.closest('tr[data-task-id]');
    if (!row) {
        // Check if hovering over an empty group (add-task-row area)
        const addRow = e.target.closest('tr.add-task-row');
        if (addRow) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom').forEach(el => {
                el.classList.remove('row-drag-over-top', 'row-drag-over-bottom');
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
    document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom').forEach(el => {
        el.classList.remove('row-drag-over-top', 'row-drag-over-bottom');
    });

    // Show indicator above or below
    const rect = row.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    if (e.clientY < midY) {
        row.classList.add('row-drag-over-top');
    } else {
        row.classList.add('row-drag-over-bottom');
    }
});

document.addEventListener('dragleave', function(e) {
    if (!_rowDragData) return;
    const row = e.target.closest('tr[data-task-id], tr.add-task-row');
    if (row) {
        row.classList.remove('row-drag-over-top', 'row-drag-over-bottom');
    }
});

document.addEventListener('drop', function(e) {
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
        const rect = targetRow.getBoundingClientRect();
        insertAfter = e.clientY >= (rect.top + rect.height / 2);
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
    if (!_rowDragData) return;
    cleanupRowDrag();
});

function cleanupRowDrag() {
    document.querySelectorAll('.row-dragging').forEach(el => el.classList.remove('row-dragging'));
    document.querySelectorAll('.row-drag-over-top, .row-drag-over-bottom').forEach(el => {
        el.classList.remove('row-drag-over-top', 'row-drag-over-bottom');
    });
    _rowDragData = null;
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
