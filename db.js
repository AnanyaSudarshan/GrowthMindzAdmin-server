const { Pool } = require('pg');

const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'grw_db',
  password: 'root',
  port: 5432,
});

// Test connection
pool.connect((err, client, release) => {
  if (err) {
    return console.error('Error connecting to database:', err.message);
  } else {
    console.log('Connected to PostgreSQL database');
    release();
  }
});

module.exports = pool;
