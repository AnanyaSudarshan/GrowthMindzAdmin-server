const { Pool } = require('pg');

// Common passwords to try
const passwords = ['grw26@', 'grw2626', 'postgres', 'admin', 'password', ''];

async function tryConnection(password) {
  try {
    const pool = new Pool({
      user: 'postgres',
      host: 'localhost',
      database: 'grw_db',
      password: password,
      port: 5432,
    });

    const result = await pool.query('SELECT NOW()');
    await pool.end();
    return { success: true, password };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function findPassword() {
  console.log('Trying to find the correct database password...\n');
  
  for (const password of passwords) {
    console.log(`Trying password: "${password || '(empty)'}"`);
    const result = await tryConnection(password);
    
    if (result.success) {
      console.log(`\n✅ SUCCESS! The correct password is: "${password}"`);
      console.log('\nUpdate the password in GrowthMindzAdmin-server/db.js and run node complete-setup.js again.');
      return password;
    }
  }
  
  console.log('\n❌ Could not find the correct password automatically.');
  console.log('\nPlease check:');
  console.log('1. Is PostgreSQL running?');
  console.log('2. What is your PostgreSQL password for user "postgres"?');
  console.log('3. Does the database "grw_db" exist?');
}

findPassword();
