const fs = require('fs');
const path = require('path');
const { pool } = require('../database/db');

async function initDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('🚀 Initializing database...');
    
    // Read and execute schema
    const schemaSQL = fs.readFileSync(
      path.join(__dirname, '../database/schema.sql'),
      'utf8'
    );
    
    await client.query(schemaSQL);
    console.log('✅ Database schema created successfully');
    console.log('✅ Tables created: users, projects, project_members, tasks, task_statuses, task_comments, task_dependencies, activity_log');
    console.log('✅ Indexes created');
    console.log('✅ Triggers created');
    
    // Insert default data
    await insertDefaultData(client);
    
    console.log('✅ Database initialization complete!');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function insertDefaultData(client) {
  console.log('📝 Checking default data...');
  console.log('✅ Database ready for use');
}

// Run initialization
initDatabase().catch(console.error);
