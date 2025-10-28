const { Pool } = require('pg');

// Connect to default 'postgres' database first
const adminPool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'postgres', // Connect to default database
  password: 'grw26@',
  port: 5432,
});

async function createDatabase() {
  try {
    console.log('Checking if database exists...');
    
    // Check if database exists
    const dbCheck = await adminPool.query(`
      SELECT 1 FROM pg_database WHERE datname = 'grw_db'
    `);
    
    if (dbCheck.rows.length > 0) {
      console.log('✅ Database "grw_db" already exists');
    } else {
      console.log('Creating database "grw_db"...');
      await adminPool.query('CREATE DATABASE grw_db');
      console.log('✅ Database "grw_db" created successfully');
    }
    
    await adminPool.end();
    console.log('\n✅ Setup complete! Now run: node complete-setup.js');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\nPossible issues:');
    console.log('1. PostgreSQL is not running');
    console.log('2. Wrong password');
    console.log('3. User "postgres" doesn\'t have permission to create databases');
  }
}

createDatabase();
