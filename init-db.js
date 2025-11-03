const pool = require('./db');

const initDatabase = async () => {
  try {
    console.log('Initializing database tables...');

    // Create admins table
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
    console.log('✓ Admins table created');
    // Create staff table
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
    console.log('✓ Staff table created');

    // Create videos table (if courses table exists)
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
      console.log('✓ Videos table created');
    } catch (err) {
      console.log('⚠ Videos table skipped (courses table may not exist)');
    }

    // Create quizzes table
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
      console.log('✓ Quizzes table created');
    } catch (err) {
      console.log('⚠ Quizzes table skipped');
    }

    // Create user_progress table
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_progress (
          id SERIAL PRIMARY KEY,
          user_id INTEGER,
          course_id INTEGER,
          progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log('✓ User progress table created');
    } catch (err) {
      console.log('⚠ User progress table skipped');
    }

    console.log('\n✅ Database initialization complete!');
    console.log('\nNext steps:');
    console.log('1. Run: node setup-admin.js  (to generate admin password hash)');
    console.log('2. Insert the admin account with the generated hash');

  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    pool.end();
  }
};

initDatabase();
