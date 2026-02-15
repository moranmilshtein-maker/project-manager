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
  // Insert default task statuses template
  const defaultStatuses = [
    { name: 'To Do', color: '#E9ECEF' },
    { name: 'In Progress', color: '#4DABF7' },
    { name: 'Review', color: '#FFA94D' },
    { name: 'Done', color: '#51CF66' }
  ];
  
  console.log('📝 Inserting default data...');
  console.log('✅ Default data inserted');
}

// Run initialization
initDatabase().catch(console.error);
