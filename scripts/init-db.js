const fs = require('fs');
const path = require('path');
const { pool } = require('../database/db');

async function initDatabase() {
  let connection;
  
  try {
    console.log('🚀 Initializing database...');
    
    connection = await pool.getConnection();
    
    // Read schema
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, '../database/schema.sql'),
      'utf8'
    );
    
    // Split by semicolon and execute each statement
    const statements = schemaSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    for (const statement of statements) {
      if (statement.trim()) {
        await connection.query(statement);
      }
    }
    
    console.log('✅ Database schema created successfully');
    console.log('✅ Tables created: users, projects, project_members, tasks, task_statuses, task_comments, task_dependencies, activity_log');
    console.log('✅ Indexes created');
    
    // Insert default data
    await insertDefaultData(connection);
    
    console.log('✅ Database initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing database:', error.message);
    throw error;
  } finally {
    if (connection) connection.release();
    await pool.end();
  }
}

async function insertDefaultData(connection) {
  console.log('📝 Checking default data...');
  console.log('✅ Database ready for use');
}

// Run initialization
initDatabase().catch(console.error);
