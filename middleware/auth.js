const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const checkProjectPermission = (requiredRole = 'viewer') => {
  const roleHierarchy = { owner: 4, admin: 3, member: 2, viewer: 1 };
  
  return async (req, res, next) => {
    const { projectId } = req.params;
    const userId = req.user.userId;
    
    try {
      const db = require('../database/db');
      const result = await db.query(
        `SELECT role FROM project_members 
         WHERE project_id = $1 AND user_id = $2`,
        [projectId, userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(403).json({ error: 'Access denied to this project' });
      }
      
      const userRole = result.rows[0].role;
      
      if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
        return res.status(403).json({ 
          error: `Requires ${requiredRole} role or higher` 
        });
      }
      
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

module.exports = { authenticateToken, checkProjectPermission };
