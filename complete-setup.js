const pool = require('./db');
const bcrypt = require('bcryptjs');

const completeSetup = async () => {
  try {
    console.log('🚀 Starting complete setup...\n');

    // Step 1: Create tables
    console.log('📋 Creating database tables...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ Admins table created');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('  ✓ Staff table created');

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS videos (
          id SERIAL PRIMARY KEY,
          course_id INTEGER,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          video_url TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ Videos table created');
    } catch (err) {
      console.log('  ⚠ Videos table skipped');
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS quizzes (
          id SERIAL PRIMARY KEY,
          course_id INTEGER,
          title VARCHAR(255) NOT NULL,
          question TEXT NOT NULL,
          option_a VARCHAR(255) NOT NULL,
          option_b VARCHAR(255) NOT NULL,
          option_c VARCHAR(255) NOT NULL,
          option_d VARCHAR(255) NOT NULL,
          correct_answer VARCHAR(1) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ Quizzes table created');
    } catch (err) {
      console.log('  ⚠ Quizzes table skipped');
    }

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_progress (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          course_id INTEGER,
          progress INTEGER DEFAULT 0,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('  ✓ User progress table created');
    } catch (err) {
      console.log('  ⚠ User progress table skipped');
    }

    // Step 2: Check if admin exists
    console.log('\n👤 Setting up admin account...');
    const existingAdmin = await pool.query('SELECT * FROM admins WHERE email = $1', ['admin@growthmindz.com']);
    
    if (existingAdmin.rows.length > 0) {
      console.log('  ℹ Admin account already exists');
    } else {
      // Create admin account
      const hashedPassword = await bcrypt.hash('admin@1234', 10);
      
      await pool.query(
        'INSERT INTO admins (name, email, password, phone) VALUES ($1, $2, $3, $4)',
        ['Admin User', 'admin@growthmindz.com', hashedPassword, '+1 234-567-8900']
      );
      console.log('  ✓ Admin account created');
      console.log('     Email: admin@growthmindz.com');
      console.log('     Password: admin@1234');
    }

    console.log('\n✅ Setup complete!');
    console.log('\n📝 To start the server, run: npm start');
    console.log('🚀 Server will run on http://localhost:5001');
    
  } catch (error) {
    console.error('\n❌ Error during setup:', error.message);
  } finally {
    pool.end();
  }
};

completeSetup();
