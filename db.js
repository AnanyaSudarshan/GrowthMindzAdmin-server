const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'grw_db',
  password: 'grw26@',
  port: 5432,
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error connecting to database:', err.message);
  } else {
    console.log('✅ Admin Server connected to PostgreSQL database');
    release();
  }
});

module.exports = pool;
