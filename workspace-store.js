/**
 * Workspace Store - Multi-tenant workspace management
 * 
 * HIERARCHY:
 *   Organization (account/company level)
 *     └── Workspace (team/project environment)
 *           └── Board (task board)
 *                 └── Group → Tasks → Subtasks
 *
 * ROLES (per workspace):
 *   - owner:   Full control. Can delete workspace, manage all members, manage billing.
 *   - admin:   Can manage members (invite/remove/change roles except owner), manage boards, full task access.
 *   - member:  Can view/edit tasks, create boards, but cannot manage members or workspace settings.
 *   - viewer:  Read-only access. Can view boards and tasks but cannot modify anything.
 *
 * PERMISSIONS MAP:
 *   Permission                  | owner | admin | member | viewer
 *   ----------------------------|-------|-------|--------|-------
 *   workspace.delete            |  ✓    |       |        |
 *   workspace.settings          |  ✓    |  ✓    |        |
 *   workspace.invite            |  ✓    |  ✓    |        |
 *   workspace.remove_member     |  ✓    |  ✓    |        |
 *   workspace.change_role       |  ✓    |  ✓*   |        |       * cannot change owner
 *   board.create                |  ✓    |  ✓    |  ✓     |
 *   board.delete                |  ✓    |  ✓    |        |
 *   board.edit                  |  ✓    |  ✓    |  ✓     |
 *   board.view                  |  ✓    |  ✓    |  ✓     |  ✓
 *   task.create                 |  ✓    |  ✓    |  ✓     |
 *   task.edit                   |  ✓    |  ✓    |  ✓     |
 *   task.delete                 |  ✓    |  ✓    |  ✓     |
 *   task.view                   |  ✓    |  ✓    |  ✓     |  ✓
 */

const crypto = require('crypto');
const dataStore = require('./data-store');

// ===== In-Memory Stores =====
// In production these would be in PostgreSQL; using Maps for consistency with existing server.js pattern

// Workspaces: workspaceId -> workspace object
const workspaces = new Map();

// Memberships: `${userId}:${workspaceId}` -> membership object
const memberships = new Map();

// Workspace invites: inviteToken -> invite object
const workspaceInvites = new Map();

// ===== Helper Functions =====

function generateId() {
  return crypto.randomUUID();
}

function generateInviteToken() {
  return crypto.randomBytes(24).toString('hex');
}

// ===== Role Hierarchy =====
const ROLE_HIERARCHY = { owner: 4, admin: 3, member: 2, viewer: 1 };
const VALID_ROLES = ['owner', 'admin', 'member', 'viewer'];

function isValidRole(role) {
  return VALID_ROLES.includes(role);
}

function hasHigherOrEqualRole(userRole, requiredRole) {
  return (ROLE_HIERARCHY[userRole] || 0) >= (ROLE_HIERARCHY[requiredRole] || 0);
}

// ===== Permission Checking =====

const PERMISSIONS = {
  'workspace.delete':        ['owner'],
  'workspace.settings':      ['owner', 'admin'],
  'workspace.invite':        ['owner', 'admin'],
  'workspace.remove_member': ['owner', 'admin'],
  'workspace.change_role':   ['owner', 'admin'],
  'board.create':            ['owner', 'admin', 'member'],
  'board.delete':            ['owner', 'admin'],
  'board.edit':              ['owner', 'admin', 'member'],
  'board.view':              ['owner', 'admin', 'member', 'viewer'],
  'task.create':             ['owner', 'admin', 'member'],
  'task.edit':               ['owner', 'admin', 'member'],
  'task.delete':             ['owner', 'admin', 'member'],
  'task.view':               ['owner', 'admin', 'member', 'viewer'],
};

/**
 * Check if a user has a specific permission in a workspace
 */
function hasPermission(userId, workspaceId, permission) {
  const membership = getMembership(userId, workspaceId);
  if (!membership) return false;
  const allowedRoles = PERMISSIONS[permission];
  if (!allowedRoles) return false;
  return allowedRoles.includes(membership.role);
}

/**
 * Get user's role in a workspace
 */
function getUserRole(userId, workspaceId) {
  const membership = getMembership(userId, workspaceId);
  return membership ? membership.role : null;
}

// ===== Workspace CRUD =====

/**
 * Create a new workspace
 */
function createWorkspace(ownerId, ownerName, ownerEmail, name, description = '') {
  const workspace = {
    id: generateId(),
    name: name.trim(),
    description: description.trim(),
    ownerId,
    color: generateWorkspaceColor(),
    initial: name.trim().charAt(0).toUpperCase(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  workspaces.set(workspace.id, workspace);

  // Auto-add creator as owner
  addMembership(ownerId, ownerName, ownerEmail, workspace.id, 'owner');

  return workspace;
}

/**
 * Get workspace by ID
 */
function getWorkspace(workspaceId) {
  return workspaces.get(workspaceId) || null;
}

/**
 * Update workspace details (name, description)
 */
function updateWorkspace(workspaceId, updates) {
  const workspace = workspaces.get(workspaceId);
  if (!workspace) return null;

  if (updates.name !== undefined) workspace.name = updates.name.trim();
  if (updates.description !== undefined) workspace.description = updates.description.trim();
  if (updates.color !== undefined) workspace.color = updates.color;
  workspace.updatedAt = new Date().toISOString();
  workspace.initial = workspace.name.charAt(0).toUpperCase();

  return workspace;
}

/**
 * Delete a workspace and all its memberships
 */
function deleteWorkspace(workspaceId) {
  workspaces.delete(workspaceId);
  
  // Remove all memberships for this workspace
  for (const [key, membership] of memberships) {
    if (membership.workspaceId === workspaceId) {
      memberships.delete(key);
    }
  }

  // Remove all pending invites for this workspace
  for (const [token, invite] of workspaceInvites) {
    if (invite.workspaceId === workspaceId) {
      workspaceInvites.delete(token);
    }
  }

  return true;
}

/**
 * Get all workspaces a user belongs to
 */
function getUserWorkspaces(userId) {
  const result = [];
  for (const [key, membership] of memberships) {
    if (membership.userId === userId) {
      const workspace = workspaces.get(membership.workspaceId);
      if (workspace) {
        result.push({
          ...workspace,
          role: membership.role,
          joinedAt: membership.joinedAt
        });
      }
    }
  }
  return result.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

// ===== Membership Management =====

function membershipKey(userId, workspaceId) {
  return `${userId}:${workspaceId}`;
}

function getMembership(userId, workspaceId) {
  return memberships.get(membershipKey(userId, workspaceId)) || null;
}

function addMembership(userId, userName, userEmail, workspaceId, role, boardId = null) {
  const key = membershipKey(userId, workspaceId);
  const membership = {
    userId,
    userName,
    userEmail,
    workspaceId,
    role,
    boardId: boardId || null, // null = access to all boards, specific ID = only that board
    joinedAt: new Date().toISOString()
  };
  memberships.set(key, membership);
  return membership;
}

function updateMembershipRole(userId, workspaceId, newRole) {
  const key = membershipKey(userId, workspaceId);
  const membership = memberships.get(key);
  if (!membership) return null;
  membership.role = newRole;
  return membership;
}

function removeMembership(userId, workspaceId) {
  const key = membershipKey(userId, workspaceId);
  return memberships.delete(key);
}

/**
 * Get all members of a workspace
 */
function getWorkspaceMembers(workspaceId) {
  const result = [];
  for (const [key, membership] of memberships) {
    if (membership.workspaceId === workspaceId) {
      result.push(membership);
    }
  }
  return result.sort((a, b) => ROLE_HIERARCHY[b.role] - ROLE_HIERARCHY[a.role]);
}

/**
 * Count members in a workspace
 */
function getWorkspaceMemberCount(workspaceId) {
  let count = 0;
  for (const [key, membership] of memberships) {
    if (membership.workspaceId === workspaceId) count++;
  }
  return count;
}

// ===== Workspace Invitations =====

/**
 * Create a workspace invitation
 */
function createWorkspaceInvite(workspaceId, inviterUserId, inviterName, targetEmail, role = 'member') {
  const token = generateInviteToken();
  const invite = {
    token,
    workspaceId,
    inviterUserId,
    inviterName,
    targetEmail: targetEmail.toLowerCase().trim(),
    role,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    used: false
  };
  workspaceInvites.set(token, invite);
  return invite;
}

/**
 * Get invite by token
 */
function getWorkspaceInvite(token) {
  return workspaceInvites.get(token) || null;
}

/**
 * Mark invite as used
 */
function useWorkspaceInvite(token) {
  const invite = workspaceInvites.get(token);
  if (!invite) return null;
  invite.used = true;
  invite.usedAt = new Date().toISOString();
  return invite;
}

/**
 * Get all pending invites for a workspace
 */
function getWorkspacePendingInvites(workspaceId) {
  const result = [];
  for (const [token, invite] of workspaceInvites) {
    if (invite.workspaceId === workspaceId && !invite.used) {
      if (new Date(invite.expiresAt) > new Date()) {
        result.push(invite);
      }
    }
  }
  return result;
}

/**
 * Get ALL invites for a workspace (including used/expired) - for reconciliation
 */
function getAllWorkspaceInvites(workspaceId) {
  const result = [];
  for (const [token, invite] of workspaceInvites) {
    if (invite.workspaceId === workspaceId) {
      result.push(invite);
    }
  }
  return result;
}

/**
 * Revoke (delete) a pending invite
 */
function revokeWorkspaceInvite(token) {
  return workspaceInvites.delete(token);
}

// ===== Data Persistence =====
// Save/load workspace data to PostgreSQL via data-store

const WORKSPACE_DATA_KEY = '__system__workspaces';

async function persistWorkspaces() {
  const data = {
    workspaces: Object.fromEntries(workspaces),
    memberships: Object.fromEntries(memberships),
    invites: Object.fromEntries(workspaceInvites)
  };
  await dataStore.writeUserData(WORKSPACE_DATA_KEY, 'workspaces', data);
}

async function loadWorkspaces() {
  const data = await dataStore.readUserData(WORKSPACE_DATA_KEY, 'workspaces');
  if (data) {
    if (data.workspaces) {
      for (const [key, value] of Object.entries(data.workspaces)) {
        workspaces.set(key, value);
      }
    }
    if (data.memberships) {
      for (const [key, value] of Object.entries(data.memberships)) {
        memberships.set(key, value);
      }
    }
    if (data.invites) {
      for (const [key, value] of Object.entries(data.invites)) {
        // Load all invites (including used/expired) for reconciliation purposes
        workspaceInvites.set(key, value);
      }
    }
    console.log(`[WorkspaceStore] Loaded ${workspaces.size} workspaces, ${memberships.size} memberships`);
  }
}

// ===== Utility =====

function generateWorkspaceColor() {
  const colors = ['#037f4c', '#0073ea', '#e2445c', '#fdab3d', '#a25ddc', '#579bfc', '#ff642e', '#cab641', '#00c875', '#9cd326'];
  return colors[Math.floor(Math.random() * colors.length)];
}

module.exports = {
  // Workspace CRUD
  createWorkspace,
  getWorkspace,
  updateWorkspace,
  deleteWorkspace,
  getUserWorkspaces,
  
  // Memberships
  getMembership,
  addMembership,
  updateMembershipRole,
  removeMembership,
  getWorkspaceMembers,
  getWorkspaceMemberCount,
  getUserRole,
  
  // Permissions
  hasPermission,
  hasHigherOrEqualRole,
  isValidRole,
  VALID_ROLES,
  PERMISSIONS,
  
  // Invitations
  createWorkspaceInvite,
  getWorkspaceInvite,
  useWorkspaceInvite,
  getWorkspacePendingInvites,
  getAllWorkspaceInvites,
  revokeWorkspaceInvite,
  
  // Persistence
  persistWorkspaces,
  loadWorkspaces
};
