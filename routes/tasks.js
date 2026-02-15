const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../database/db');
const { authenticateToken, checkProjectPermission } = require('../middleware/auth');

const router = express.Router();

// Create task
router.post('/:projectId/tasks', authenticateToken, checkProjectPermission('member'), [
  body('title').trim().notEmpty(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('color').optional().matches(/^#[0-9A-Fa-f]{6}$/)
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { projectId } = req.params;
  const { 
    title, description, status_id, priority, color, 
    start_date, due_date, assigned_to, estimated_hours 
  } = req.body;
  const userId = req.user.userId;

  try {
    // Get max position
    const posResult = await db.query(
      'SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM tasks WHERE project_id = $1',
      [projectId]
    );
    const position = posResult.rows[0].next_pos;

    const result = await db.query(
      `INSERT INTO tasks 
       (project_id, title, description, status_id, priority, color, 
        start_date, due_date, assigned_to, created_by, position, estimated_hours) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) 
       RETURNING *`,
      [projectId, title, description, status_id, priority, color || '#E9ECEF', 
       start_date, due_date, assigned_to, userId, position, estimated_hours]
    );

    const task = result.rows[0];

    // Log activity
    await db.query(
      `INSERT INTO activity_log (project_id, user_id, action, entity_type, entity_id, details) 
       VALUES ($1, $2, 'created', 'task', $3, $4)`,
      [projectId, userId, task.id, JSON.stringify({ title: task.title })]
    );

    res.status(201).json({ task });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all tasks for project
router.get('/:projectId/tasks', authenticateToken, checkProjectPermission('viewer'), async (req, res) => {
  const { projectId } = req.params;
  const { status_id, assigned_to, priority } = req.query;

  try {
    let query = `
      SELECT t.*, 
             u1.full_name as assigned_to_name,
             u2.full_name as created_by_name,
             ts.name as status_name, ts.color as status_color,
             (SELECT json_agg(json_build_object('id', td.depends_on_task_id, 'type', td.dependency_type))
              FROM task_dependencies td WHERE td.task_id = t.id) as dependencies
      FROM tasks t
      LEFT JOIN users u1 ON t.assigned_to = u1.id
      LEFT JOIN users u2 ON t.created_by = u2.id
      LEFT JOIN task_statuses ts ON t.status_id = ts.id
      WHERE t.project_id = $1
    `;
    
    const params = [projectId];
    let paramCount = 1;

    if (status_id) {
      paramCount++;
      query += ` AND t.status_id = $${paramCount}`;
      params.push(status_id);
    }

    if (assigned_to) {
      paramCount++;
      query += ` AND t.assigned_to = $${paramCount}`;
      params.push(assigned_to);
    }

    if (priority) {
      paramCount++;
      query += ` AND t.priority = $${paramCount}`;
      params.push(priority);
    }

    query += ' ORDER BY t.position, t.created_at';

    const result = await db.query(query, params);

    res.json({ tasks: result.rows });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single task
router.get('/:projectId/tasks/:taskId', authenticateToken, checkProjectPermission('viewer'), async (req, res) => {
  const { taskId } = req.params;

  try {
    const result = await db.query(
      `SELECT t.*, 
              u1.full_name as assigned_to_name, u1.email as assigned_to_email,
              u2.full_name as created_by_name,
              ts.name as status_name, ts.color as status_color
       FROM tasks t
       LEFT JOIN users u1 ON t.assigned_to = u1.id
       LEFT JOIN users u2 ON t.created_by = u2.id
       LEFT JOIN task_statuses ts ON t.status_id = ts.id
       WHERE t.id = $1`,
      [taskId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const task = result.rows[0];

    // Get dependencies
    const depsResult = await db.query(
      `SELECT td.*, t.title as task_title 
       FROM task_dependencies td
       INNER JOIN tasks t ON td.depends_on_task_id = t.id
       WHERE td.task_id = $1`,
      [taskId]
    );
    task.dependencies = depsResult.rows;

    // Get comments
    const commentsResult = await db.query(
      `SELECT tc.*, u.full_name as user_name, u.avatar_url
       FROM task_comments tc
       INNER JOIN users u ON tc.user_id = u.id
       WHERE tc.task_id = $1
       ORDER BY tc.created_at DESC`,
      [taskId]
    );
    task.comments = commentsResult.rows;

    res.json({ task });
  } catch (error) {
    console.error('Get task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update task
router.put('/:projectId/tasks/:taskId', authenticateToken, checkProjectPermission('member'), async (req, res) => {
  const { taskId } = req.params;
  const updates = req.body;

  try {
    const fields = [];
    const values = [];
    let paramCount = 0;

    const allowedFields = [
      'title', 'description', 'status_id', 'priority', 'color',
      'start_date', 'due_date', 'assigned_to', 'estimated_hours', 
      'actual_hours', 'position'
    ];

    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        paramCount++;
        fields.push(`${field} = $${paramCount}`);
        values.push(updates[field]);
      }
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    paramCount++;
    values.push(taskId);

    const query = `UPDATE tasks SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;
    const result = await db.query(query, values);

    res.json({ task: result.rows[0] });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete task
router.delete('/:projectId/tasks/:taskId', authenticateToken, checkProjectPermission('member'), async (req, res) => {
  const { taskId } = req.params;

  try {
    await db.query('DELETE FROM tasks WHERE id = $1', [taskId]);
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add task dependency
router.post('/:projectId/tasks/:taskId/dependencies', authenticateToken, checkProjectPermission('member'), [
  body('depends_on_task_id').isInt(),
  body('dependency_type').optional().isIn(['finish-to-start', 'start-to-start', 'finish-to-finish', 'start-to-finish'])
], async (req, res) => {
  const { taskId } = req.params;
  const { depends_on_task_id, dependency_type } = req.body;

  try {
    await db.query(
      `INSERT INTO task_dependencies (task_id, depends_on_task_id, dependency_type) 
       VALUES ($1, $2, $3)`,
      [taskId, depends_on_task_id, dependency_type || 'finish-to-start']
    );

    res.status(201).json({ message: 'Dependency added successfully' });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Dependency already exists' });
    }
    console.error('Add dependency error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add comment
router.post('/:projectId/tasks/:taskId/comments', authenticateToken, checkProjectPermission('member'), [
  body('comment').trim().notEmpty()
], async (req, res) => {
  const { taskId } = req.params;
  const { comment } = req.body;
  const userId = req.user.userId;

  try {
    const result = await db.query(
      `INSERT INTO task_comments (task_id, user_id, comment) 
       VALUES ($1, $2, $3) RETURNING *`,
      [taskId, userId, comment]
    );

    res.status(201).json({ comment: result.rows[0] });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Gantt chart data
router.get('/:projectId/gantt', authenticateToken, checkProjectPermission('viewer'), async (req, res) => {
  const { projectId } = req.params;

  try {
    const result = await db.query(
      `SELECT t.id, t.title, t.start_date, t.due_date, t.color, t.priority,
              u.full_name as assigned_to_name,
              ts.name as status_name,
              (SELECT json_agg(td.depends_on_task_id) 
               FROM task_dependencies td 
               WHERE td.task_id = t.id) as dependencies
       FROM tasks t
       LEFT JOIN users u ON t.assigned_to = u.id
       LEFT JOIN task_statuses ts ON t.status_id = ts.id
       WHERE t.project_id = $1 
       AND t.start_date IS NOT NULL 
       AND t.due_date IS NOT NULL
       ORDER BY t.start_date`,
      [projectId]
    );

    res.json({ gantt_data: result.rows });
  } catch (error) {
    console.error('Get Gantt data error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
