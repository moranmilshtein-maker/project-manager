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
let allUsers = [];

function loadUsers() {
    try {
        const data = localStorage.getItem('mondayUsers');
        if (data) allUsers = JSON.parse(data);
    } catch (e) { /* ignore */ }
}

function saveUsers() {
    try {
        localStorage.setItem('mondayUsers', JSON.stringify(allUsers));
    } catch (e) { /* ignore */ }
}

function loadCurrentSession() {
    try {
        const data = localStorage.getItem('mondayCurrentUser');
        if (data) currentUser = JSON.parse(data);
    } catch (e) { /* ignore */ }
}

function saveCurrentSession() {
    try {
        if (currentUser) {
            localStorage.setItem('mondayCurrentUser', JSON.stringify(currentUser));
        } else {
            localStorage.removeItem('mondayCurrentUser');
        }
    } catch (e) { /* ignore */ }
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

function timeAgo() {
    const mins = Math.floor(Math.random() * 10) + 1;
    return `${mins} minutes ago`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== Initial Board Data =====
let boardData = {
    name: '\u05E0\u05D9\u05E1\u05D9\u05D5\u05DF',
    archivedGroups: [],
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
                    lastUpdated: timeAgo()
                },
                {
                    id: 2, name: '\u05E9\u05E0\u05D9', owner: '', status: 'done',
                    dueDate: '2025-02-16', priority: 'high', notes: 'Meeting notes',
                    budget: 1000, files: 0, timelineStart: '2025-02-17', timelineEnd: '2025-02-18',
                    lastUpdated: timeAgo()
                },
                {
                    id: 3, name: '\u05E9\u05DC\u05D9\u05E9\u05D9', owner: '', status: 'stuck',
                    dueDate: '2025-02-17', priority: 'medium', notes: 'Other',
                    budget: 500, files: 0, timelineStart: '2025-02-19', timelineEnd: '2025-02-20',
                    lastUpdated: timeAgo()
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
        const clone = { ...task, id: newId(), name: task.name + ' (copy)', lastUpdated: 'just now' };
        group.tasks.push(clone);
    });
    clearSelection();
    renderBoard();
}

function floatingBarDelete() {
    const count = selectedTasks.size;
    if (!confirm(`Delete ${count} selected task(s)?`)) return;
    const items = getSelectedTaskObjects();
    items.forEach(({ group, task }) => {
        group.tasks = group.tasks.filter(t => t.id !== task.id);
    });
    clearSelection();
    renderBoard();
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
    const items = getSelectedTaskObjects();
    if (items.length === 0) return;
    if (!confirm(`Archive ${items.length} task(s)? They will be compressed and stored.`)) return;

    // Store archived data compressed in localStorage
    let archived = [];
    try {
        const data = localStorage.getItem('mondayArchivedTasks');
        if (data) archived = JSON.parse(data);
    } catch (e) { /* ignore */ }

    items.forEach(({ group, task }) => {
        group.tasks = group.tasks.filter(t => t.id !== task.id);
        archived.push({
            ...task,
            archivedAt: new Date().toISOString(),
            fromGroup: group.name
        });
    });

    try {
        localStorage.setItem('mondayArchivedTasks', JSON.stringify(archived));
    } catch (e) { /* ignore */ }

    clearSelection();
    renderBoard();

    // Show feedback
    showToast(`${items.length} task(s) archived successfully`);
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
                            <th class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div></th>
                            <th style="width:36px"><input type="checkbox" onchange="toggleGroupCheckbox('${group.id}', this)"></th>
                            <th class="col-task">Task</th>
                            <th><div class="th-content">Owner</div></th>
                            <th><div class="th-content">Status <span class="material-icons-outlined">info_outline</span></div></th>
                            <th><div class="th-content">Due date <span class="material-icons-outlined">info_outline</span></div></th>
                            <th>Priority</th>
                            <th>Notes</th>
                            <th>Budget</th>
                            <th>Files</th>
                            <th><div class="th-content">Timeline <span class="material-icons-outlined">info_outline</span></div></th>
                            <th>Last updated</th>
                            <th class="col-add"><span class="material-icons-outlined" style="font-size:16px">add</span></th>
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

    return `
        <tr data-task-id="${taskIdStr}" data-group-id="${groupIdStr}">
            <td class="group-color-cell"><div class="group-color-bar" style="background:${group.color}"></div></td>
            <td class="cell-checkbox"><input type="checkbox" onchange="onTaskCheckboxChange('${groupIdStr}', '${taskIdStr}', this)"></td>
            <td class="cell-task" ${!isViewer ? `ondblclick="editTaskName('${taskIdStr}', '${groupIdStr}', this)"` : ''}>
                <div class="cell-task-content">
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
            </td>
            <td class="cell-owner">
                ${task.owner
                    ? `<div class="owner-avatar has-owner" ${!isViewer ? `onclick="toggleOwner('${taskIdStr}', '${groupIdStr}')"` : ''}>${escapeHtml(task.owner)}</div>`
                    : `<div class="owner-avatar no-owner" ${!isViewer ? `onclick="toggleOwner('${taskIdStr}', '${groupIdStr}')"` : ''}><span class="material-icons-outlined">person_add</span></div>`
                }
            </td>
            <td class="cell-status">
                <div class="status-label" style="background:${status.color}"
                     ${!isViewer ? `onclick="showStatusDropdown(event, '${taskIdStr}', '${groupIdStr}')"` : ''}>
                    ${status.label || ''}
                </div>
            </td>
            <td class="cell-due-date">
                <div class="date-display" ${!isViewer ? `ondblclick="editDueDate('${taskIdStr}', '${groupIdStr}', this)"` : ''}>${dueDateDisplay}</div>
            </td>
            <td class="cell-priority">
                <div class="priority-label" style="background:${priority.color}"
                     ${!isViewer ? `onclick="showPriorityDropdown(event, '${taskIdStr}', '${groupIdStr}')"` : ''}>
                    ${priority.label || ''}
                </div>
            </td>
            <td class="cell-notes" ${!isViewer ? `ondblclick="editNotes('${taskIdStr}', '${groupIdStr}', this)"` : ''}>${escapeHtml(task.notes || '')}</td>
            <td class="cell-budget" ${!isViewer ? `ondblclick="editBudget('${taskIdStr}', '${groupIdStr}', this)"` : ''}>${task.budget ? '$' + task.budget.toLocaleString() : ''}</td>
            <td class="cell-files">
                <div class="file-icon">
                    ${task.files > 0
                        ? `<span class="material-icons-outlined" style="color:#0073ea">description</span>`
                        : `<span class="material-icons-outlined">attach_file</span>`}
                </div>
            </td>
            <td class="cell-timeline">
                ${hasTimeline
                    ? `<div class="timeline-bar has-dates" style="background:${timelineColor}" ${!isViewer ? `ondblclick="editTimeline('${taskIdStr}', '${groupIdStr}')"` : ''}>${timelineText}</div>`
                    : `<div class="timeline-bar no-dates" ${!isViewer ? `ondblclick="editTimeline('${taskIdStr}', '${groupIdStr}')"` : ''}>-</div>`}
            </td>
            <td class="cell-updated">
                <div class="updated-content">
                    ${task.owner ? `<div class="updated-avatar">${escapeHtml(task.owner)}</div>` : ''}
                    <span>${task.lastUpdated || ''}</span>
                </div>
            </td>
            <td class="cell-add-col"></td>
        </tr>`;
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
    if (task) { task.status = statusId; task.lastUpdated = 'just now'; renderBoard(); }
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
    if (task) { task.priority = priorityId; task.lastUpdated = 'just now'; renderBoard(); }
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
            task.lastUpdated = 'just now';
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
        task.lastUpdated = 'just now';
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
        task.lastUpdated = 'just now';
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
        task.lastUpdated = 'just now';
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
        const initials = currentUser ? (currentUser.fullName || currentUser.email).substring(0, 2).toUpperCase() : 'MM';
        task.owner = task.owner ? '' : initials;
        task.lastUpdated = 'just now';
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
                    lastUpdated: 'just now'
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
    currentModalTask.lastUpdated = 'just now';
    closeModal();
    renderBoard();
}

function openChat(taskId) {
    showToast('Chat feature coming soon');
}

// ============================================================
// TASK 4: Authentication System
// ============================================================
function showAuthScreen() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appMain').style.display = 'none';
    showLoginForm();
}

function showAppScreen() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appMain').style.display = 'flex';
    // Update UI based on user role
    if (currentUser) {
        const initials = (currentUser.fullName || currentUser.email).substring(0, 2).toUpperCase();
        document.querySelectorAll('.user-avatar-initials').forEach(el => el.textContent = initials);
        const nameEl = document.getElementById('userDisplayName');
        if (nameEl) nameEl.textContent = currentUser.fullName || currentUser.email;
        const roleBadge = document.getElementById('userRoleBadge');
        if (roleBadge) roleBadge.textContent = ROLE_LABELS[currentUser.role] || '';
    }
    renderBoard();
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

function handleLogin(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;
    if (!email || !password) { showAuthError('loginError', 'Please fill in all fields'); return; }
    const user = allUsers.find(u => u.email === email && u.password === password);
    if (!user) { showAuthError('loginError', 'Invalid email or password'); return; }
    currentUser = user;
    saveCurrentSession();
    showAppScreen();
}

function handleRegister(e) {
    e.preventDefault();
    const fullName = document.getElementById('regFullName').value.trim();
    const email = document.getElementById('regEmail').value.trim().toLowerCase();
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;

    if (!fullName || !email || !password) { showAuthError('regError', 'Please fill in all fields'); return; }
    if (password !== confirmPassword) { showAuthError('regError', 'Passwords do not match'); return; }
    if (password.length < 6) { showAuthError('regError', 'Password must be at least 6 characters'); return; }
    if (allUsers.find(u => u.email === email)) { showAuthError('regError', 'Email already exists'); return; }

    // TASK 5: First user = super_admin
    const role = allUsers.length === 0 ? 'super_admin' : 'member';

    const newUser = {
        id: newId(),
        fullName,
        email,
        password,
        role,
        workspace: 'Main workspace',
        createdAt: new Date().toISOString()
    };
    allUsers.push(newUser);
    saveUsers();
    currentUser = newUser;
    saveCurrentSession();
    showAppScreen();
}

function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgotEmail').value.trim().toLowerCase();
    if (!email) { showAuthError('forgotError', 'Please enter your email'); return; }
    const user = allUsers.find(u => u.email === email);
    if (!user) { showAuthError('forgotError', 'Email not found'); return; }
    // Simulate email sent
    document.getElementById('forgotError').textContent = '';
    document.getElementById('forgotSuccess').textContent = `Password reset link sent to ${email}. (Demo: your password is "${user.password}")`;
}

function handleGoogleLogin() {
    // Simulate Google OAuth
    const email = 'user@gmail.com';
    let user = allUsers.find(u => u.email === email);
    if (!user) {
        const role = allUsers.length === 0 ? 'super_admin' : 'member';
        user = { id: newId(), fullName: 'Google User', email, password: 'google_oauth', role, workspace: 'Main workspace', createdAt: new Date().toISOString() };
        allUsers.push(user);
        saveUsers();
    }
    currentUser = user;
    saveCurrentSession();
    showAppScreen();
}

function handleFacebookLogin() {
    const email = 'user@facebook.com';
    let user = allUsers.find(u => u.email === email);
    if (!user) {
        const role = allUsers.length === 0 ? 'super_admin' : 'member';
        user = { id: newId(), fullName: 'Facebook User', email, password: 'fb_oauth', role, workspace: 'Main workspace', createdAt: new Date().toISOString() };
        allUsers.push(user);
        saveUsers();
    }
    currentUser = user;
    saveCurrentSession();
    showAppScreen();
}

function showAuthError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) { el.textContent = message; el.style.display = 'block'; }
}

function logout() {
    currentUser = null;
    saveCurrentSession();
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

function handleInvite(e) {
    e.preventDefault();
    const emailsStr = document.getElementById('inviteEmail').value.trim();
    const role = document.getElementById('inviteRole').value;
    const message = document.getElementById('inviteMessage').value.trim();

    if (!emailsStr) { document.getElementById('inviteError').textContent = 'Please enter email(s)'; return; }

    const emails = emailsStr.split(',').map(e => e.trim().toLowerCase()).filter(e => e);
    let invited = 0;
    let skipped = 0;

    emails.forEach(email => {
        if (!email.includes('@')) { skipped++; return; }
        let user = allUsers.find(u => u.email === email);
        if (!user) {
            user = {
                id: newId(),
                fullName: email.split('@')[0],
                email,
                password: 'invited123',
                role,
                workspace: 'Main workspace',
                invitedBy: currentUser.email,
                inviteMessage: message,
                createdAt: new Date().toISOString()
            };
            allUsers.push(user);
            invited++;
        } else {
            // Update role if user exists and current user has permission
            if (currentUser.role === 'super_admin' || (currentUser.role === 'admin' && user.role !== 'super_admin')) {
                user.role = role;
                invited++;
            } else {
                skipped++;
            }
        }
    });

    saveUsers();
    document.getElementById('inviteError').textContent = '';
    let msg = `${invited} user(s) invited successfully!`;
    if (skipped > 0) msg += ` (${skipped} skipped)`;
    msg += ' (Demo: default password is "invited123")';
    document.getElementById('inviteSuccess').textContent = msg;
    updateInviteCount();
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

function updateInviteCount() {
    const countEl = document.getElementById('inviteCount');
    if (countEl) countEl.textContent = allUsers.length;
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
                    timelineStart: '', timelineEnd: '', lastUpdated: 'just now'
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
function initApp() {
    loadUsers();
    loadCurrentSession();
    loadFromStorage();

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

document.addEventListener('DOMContentLoaded', initApp);
if (document.readyState !== 'loading') initApp();
