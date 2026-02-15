const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken, checkProjectPermission } = require('../middleware/auth');

const router = express.Router();

// Create project
router.post('/', authenticateToken, [
  body('name').trim().notEmpty(),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description, color } = req.body;
  const userId = req.user.userId;

  const client = await db.pool.connect();
  
  try {
    await client.query('BEGIN');

    // Create project
    const projectResult = await client.query(
      `INSERT INTO projects (name, description, color, owner_id) 
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, description || null, color || '#5C7CFA', userId]
    );

    const project = projectResult.rows[0];

    // Add creator as owner
    await client.query(
      `INSERT INTO project_members (project_id, user_id, role) 
       VALUES ($1, $2, 'owner')`,
      [project.id, userId]
    );

    // Create default task statuses
    const defaultStatuses = [
      { name: 'To Do', color: '#E9ECEF', position: 0 },
      { name: 'In Progress', color: '#4DABF7', position: 1 },
      { name: 'Review', color: '#FFA94D', position: 2 },
      { name: 'Done', color: '#51CF66', position: 3 }
    ];

    for (const status of defaultStatuses) {
      await client.query(
        `INSERT INTO task_statuses (project_id, name, color, position) 
         VALUES ($1, $2, $3, $4)`,
        [project.id, status.name, status.color, status.position]
      );
    }

    // Log activity
    await client.query(
      `INSERT INTO activity_log (project_id, user_id, action, entity_type, entity_id) 
       VALUES ($1, $2, 'created', 'project', $3)`,
      [project.id, userId, project.id]
    );

    await client.query('COMMIT');

    res.status(201).json({ project });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

// Get all projects for user
router.get('/', authenticateToken, async (req, res) => {
  const userId = req.user.userId;

  try {
    const result = await db.query(
      `SELECT p.*, pm.role, u.full_name as owner_name,
              (SELECT COUNT(*) FROM tasks WHERE project_id = p.id) as task_count,
              (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count
       FROM projects p
       INNER JOIN project_members pm ON p.id = pm.project_id
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE pm.user_id = $1
       ORDER BY p.updated_at DESC`,
      [userId]
    );

    res.json({ projects: result.rows });
  } catch (error) {
    console.error('Get projects error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single project
router.get('/:projectId', authenticateToken, checkProjectPermission('viewer'), async (req, res) => {
  const { projectId } = req.params;

  try {
    const projectResult = await db.query(
      `SELECT p.*, u.full_name as owner_name, u.email as owner_email
       FROM projects p
       LEFT JOIN users u ON p.owner_id = u.id
       WHERE p.id = $1`,
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];

    // Get members
    const membersResult = await db.query(
      `SELECT pm.role, u.id, u.email, u.full_name, u.avatar_url
       FROM project_members pm
       INNER JOIN users u ON pm.user_id = u.id
       WHERE pm.project_id = $1
       ORDER BY pm.created_at`,
      [projectId]
    );

    project.members = membersResult.rows;

    // Get statuses
    const statusesResult = await db.query(
      `SELECT * FROM task_statuses WHERE project_id = $1 ORDER BY position`,
      [projectId]
    );

    project.statuses = statusesResult.rows;

    res.json({ project });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update project
router.put('/:projectId', authenticateToken, checkProjectPermission('admin'), [
  body('name').optional().trim().notEmpty(),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { projectId } = req.params;
  const { name, description, color } = req.body;

  try {
    const result = await db.query(
      `UPDATE projects 
       SET name = COALESCE($1, name),
           description = COALESCE($2, description),
           color = COALESCE($3, color)
       WHERE id = $4 RETURNING *`,
      [name, description, color, projectId]
    );

    res.json({ project: result.rows[0] });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add member to project
router.post('/:projectId/members', authenticateToken, checkProjectPermission('admin'), [
  body('email').isEmail().normalizeEmail(),
  body('role').isIn(['admin', 'member', 'viewer'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { projectId } = req.params;
  const { email, role } = req.body;

  try {
    // Find user by email
    const userResult = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const newUserId = userResult.rows[0].id;

    // Add member
    await db.query(
      `INSERT INTO project_members (project_id, user_id, role) 
       VALUES ($1, $2, $3) 
       ON CONFLICT (project_id, user_id) 
       DO UPDATE SET role = $3`,
      [projectId, newUserId, role]
    );

    res.status(201).json({ message: 'Member added successfully' });
  } catch (error) {
    console.error('Add member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove member
router.delete('/:projectId/members/:userId', authenticateToken, checkProjectPermission('admin'), async (req, res) => {
  const { projectId, userId } = req.params;

  try {
    // Cannot remove owner
    const projectResult = await db.query(
      'SELECT owner_id FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows[0].owner_id === parseInt(userId)) {
      return res.status(400).json({ error: 'Cannot remove project owner' });
    }

    await db.query(
      'DELETE FROM project_members WHERE project_id = $1 AND user_id = $2',
      [projectId, userId]
    );

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Remove member error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete project
router.delete('/:projectId', authenticateToken, checkProjectPermission('owner'), async (req, res) => {
  const { projectId } = req.params;

  try {
    await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    res.json({ message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
