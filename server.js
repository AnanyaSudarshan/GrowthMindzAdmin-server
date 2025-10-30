const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const PORT = 5001;

// JWT Secret - use environment variable or default
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());

// Ensure single admins table supports roles (Admin/Staff)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'Admin',
        phone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Ensure required columns exist on older databases
    await pool.query("ALTER TABLE admins ADD COLUMN IF NOT EXISTS name VARCHAR(255)");
    await pool.query("ALTER TABLE admins ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'Admin'");
    await pool.query("ALTER TABLE admins ADD COLUMN IF NOT EXISTS phone VARCHAR(20)");
    // Ensure phone column is VARCHAR for large phone numbers (migrate from integer if needed)
    try {
      await pool.query("ALTER TABLE admins ALTER COLUMN phone TYPE VARCHAR(20) USING phone::varchar(20)");
    } catch (e) {
      // ignore if already correct type
    }
  } catch (e) {
    // Ignore startup migration errors
  }
})();

// Ensure courses_vedio table exists (course_title-based video storage)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courses_vedio (
        id SERIAL PRIMARY KEY,
        course_vedio_title VARCHAR(255) NOT NULL,
        vedio_url TEXT NOT NULL,
        description TEXT,
        course_title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Backfill missing columns on legacy tables
    await pool.query("ALTER TABLE courses_vedio ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  } catch (e) {
    // ignore optional table creation
  }
})();

// Ensure courses table exists and has course_title column
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id SERIAL PRIMARY KEY,
        course_title VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Backward compatibility: ensure course_title exists for insertion path
    await pool.query("ALTER TABLE courses ADD COLUMN IF NOT EXISTS course_title VARCHAR(255)");
    // Ensure description column exists
    await pool.query("ALTER TABLE courses ADD COLUMN IF NOT EXISTS description TEXT");
  } catch (e) {
    // ignore if migrations fail; routes will surface proper errors
  }
})();

// Ensure videos and quizzes tables exist for content listing
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS videos (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255),
        description TEXT,
        video_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    // ignore optional table creation
  }
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id SERIAL PRIMARY KEY,
        course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255),
        question TEXT,
        option_a TEXT,
        option_b TEXT,
        option_c TEXT,
        option_d TEXT,
        correct_answer TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } catch (e) {
    // ignore optional table creation
  }
})();

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ error: 'Invalid token.' });
  }
};

// ==================== AUTHENTICATION ROUTES ====================

// Admin/Staff Login
app.post('/api/admin/login', async (req, res) => {
  const { email, password, role, name } = req.body;

  try {
    // Validate input
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

  // Normalize
    const isAdmin = role === 'Admin';
    const normalizedEmail = email.trim();

    // Check if user exists (single admins table with role)
    const selectQuery = 'SELECT * FROM admins WHERE LOWER(email) = LOWER($1) AND role = $2';
    const result = await pool.query(selectQuery, [normalizedEmail, isAdmin ? 'Admin' : 'Staff']);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password using plaintext comparison (per requirement)
    const stored = user.password || '';
    const validPassword = stored === password;
    if (!validPassword) return res.status(401).json({ error: 'Invalid email or password' });

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== PROFILE ROUTES ====================

// Get current admin profile (sanitized)
app.get('/api/admin/profile', authenticateToken, async (req, res) => {
  try {
    const { id } = req.user || {};
    if (!id) return res.status(401).json({ error: 'Unauthorized' });

    const result = await pool.query(
      'SELECT id, name, email, phone, role FROM admins WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const user = result.rows[0];
    // Do not return password. Provide empty strings for password fields for UI convenience
    res.json({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
      role: user.role || 'Admin',
      password: '',
      confirm_password: ''
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update current admin profile (with optional password change)
app.put('/api/admin/profile', authenticateToken, async (req, res) => {
  try {
    const { id, role: tokenRole } = req.user || {};
    if (!id) return res.status(401).json({ error: 'Unauthorized' });

    const { name, email, phone, role, password, confirm_password } = req.body || {};

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    // Enforce role safety: allow changing role explicitly only if caller is Admin
    const canChangeRole = (tokenRole === 'Admin');

    // Validate password if present
    let values;
    let query;
    if (password || confirm_password) {
      if (!password || !confirm_password) {
        return res.status(400).json({ error: 'Both password and confirm_password are required' });
      }
      if (password !== confirm_password) {
        return res.status(400).json({ error: 'Passwords do not match' });
      }
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      // Store password as provided (no hashing per request)
      if (canChangeRole && role) {
        query = 'UPDATE admins SET name = $1, email = $2, phone = $3, role = $4, password = $5 WHERE id = $6 RETURNING id, name, email, phone, role';
        values = [name, email, phone, role, password, id];
      } else {
        query = 'UPDATE admins SET name = $1, email = $2, phone = $3, password = $4 WHERE id = $5 RETURNING id, name, email, phone, role';
        values = [name, email, phone, password, id];
      }
    } else {
      if (canChangeRole && role) {
        query = 'UPDATE admins SET name = $1, email = $2, phone = $3, role = $4 WHERE id = $5 RETURNING id, name, email, phone, role';
        values = [name, email, phone, role, id];
      } else {
        query = 'UPDATE admins SET name = $1, email = $2, phone = $3 WHERE id = $4 RETURNING id, name, email, phone, role';
        values = [name, email, phone, id];
      }
    }

    // Ensure uniqueness on email
    const existing = await pool.query('SELECT id FROM admins WHERE LOWER(email) = LOWER($1) AND id <> $2', [email, id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const result = await pool.query(query, values);
    const updated = result.rows[0];
    res.json({
      message: 'Profile updated successfully',
      profile: {
        name: updated.name,
        email: updated.email,
        phone: updated.phone,
        role: updated.role
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update profile by email param (PUT /api/admin/profile/:email)
// Allows updating name, email, phone, role (if admin), and password (if provided)
app.put('/api/admin/profile/:email', authenticateToken, async (req, res) => {
  try {
    const requester = req.user || {};
    const emailParam = req.params.email;
    const { name, email, phone, role, password, confirm_password } = req.body || {};

    if (!emailParam) return res.status(400).json({ error: 'Email parameter required' });

    // Find target user
    const target = await pool.query('SELECT * FROM admins WHERE LOWER(email) = LOWER($1)', [emailParam]);
    if (target.rows.length === 0) return res.status(404).json({ error: 'Profile not found' });
    const user = target.rows[0];

    if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

    // Email uniqueness
    const dup = await pool.query('SELECT id FROM admins WHERE LOWER(email) = LOWER($1) AND id <> $2', [email, user.id]);
    if (dup.rows.length > 0) return res.status(400).json({ error: 'Email already in use' });

    const canChangeRole = requester.role === 'Admin';

    let query;
    let values;

    if (password || confirm_password) {
      if (!password || !confirm_password) return res.status(400).json({ error: 'Both password and confirm_password are required' });
      if (password !== confirm_password) return res.status(400).json({ error: 'Passwords do not match' });
      if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
      // Store password as provided (no hashing per request)
      if (canChangeRole && role) {
        query = 'UPDATE admins SET name = $1, email = $2, phone = $3, role = $4, password = $5 WHERE id = $6 RETURNING id, name, email, phone, role';
        values = [name, email, phone, role, password, user.id];
      } else {
        query = 'UPDATE admins SET name = $1, email = $2, phone = $3, password = $4 WHERE id = $5 RETURNING id, name, email, phone, role';
        values = [name, email, phone, password, user.id];
      }
    } else {
      if (canChangeRole && role) {
        query = 'UPDATE admins SET name = $1, email = $2, phone = $3, role = $4 WHERE id = $5 RETURNING id, name, email, phone, role';
        values = [name, email, phone, role, user.id];
      } else {
        query = 'UPDATE admins SET name = $1, email = $2, phone = $3 WHERE id = $4 RETURNING id, name, email, phone, role';
        values = [name, email, phone, user.id];
      }
    }

    const updated = await pool.query(query, values);
    res.json({
      message: 'Profile updated successfully',
      profile: updated.rows[0]
    });
  } catch (error) {
    console.error('Update profile by email error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== DASHBOARD ROUTES ====================

// Get dashboard statistics
app.get('/api/admin/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const coursesCount = await pool.query('SELECT COUNT(*) FROM courses');
    const staffCount = await pool.query("SELECT COUNT(*) FROM admins WHERE role = 'Staff'");

    res.json({
      users: parseInt(usersCount.rows[0].count),
      courses: parseInt(coursesCount.rows[0].count),
      staff: parseInt(staffCount.rows[0].count)
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== USER ROUTES ====================

// Get all users
app.get('/api/admin/users', authenticateToken, async (req, res) => {
  try {
    let result;
    try {
      // Try with users.course_opted
      result = await pool.query(`
        SELECT 
          u.id,
          COALESCE(u.first_name, '') AS first_name,
          COALESCE(u.last_name, '') AS last_name,
          u.email,
          COALESCE(u.course_opted::text, c.course_title, 'No Course') AS course_opted,
          COALESCE(
            CASE WHEN (u.progress::text) ~ '^[0-9]+$' THEN u.progress::int ELSE NULL END,
            (
              SELECT ROUND(AVG(up.progress))
              FROM user_progress up
              WHERE up.user_id = u.id AND (up.course_id = c.id OR c.id IS NULL)
            )::int,
            0
          ) AS progress
        FROM users u
        LEFT JOIN user_enrollments ue ON u.id = ue.user_id
        LEFT JOIN courses c ON ue.course_id = c.id
        ORDER BY u.id
      `);
      return res.json(result.rows);
    } catch (err1) {
      if (err1 && err1.code === '42703') {
        // Retry with users.courses_opted
        try {
          const alt = await pool.query(`
            SELECT 
              u.id,
              COALESCE(u.first_name, '') AS first_name,
              COALESCE(u.last_name, '') AS last_name,
              u.email,
              COALESCE(u.courses_opted::text, c.course_title, 'No Course') AS course_opted,
              COALESCE(
                CASE WHEN (u.progress::text) ~ '^[0-9]+$' THEN u.progress::int ELSE NULL END,
                (
                  SELECT ROUND(AVG(up.progress))
                  FROM user_progress up
                  WHERE up.user_id = u.id AND (up.course_id = c.id OR c.id IS NULL)
                )::int,
                0
              ) AS progress
            FROM users u
            LEFT JOIN user_enrollments ue ON u.id = ue.user_id
            LEFT JOIN courses c ON ue.course_id = c.id
            ORDER BY u.id
          `);
          return res.json(alt.rows);
        } catch (err2) {
          if (err2 && err2.code === '42P01') {
            // Fall through to simple users-only queries
          } else {
            throw err2;
          }
        }
      } else if (err1 && err1.code !== '42P01') {
        throw err1;
      }

      // If related tables don't exist, or we fell through due to 42P01, return simple users-only query
      try {
        const simple = await pool.query(`
          SELECT 
            id,
            COALESCE(first_name, '') AS first_name,
            COALESCE(last_name, '') AS last_name,
            email,
            COALESCE(course_opted::text, 'No Course') AS course_opted,
            COALESCE(
              CASE WHEN (progress::text) ~ '^[0-9]+$' THEN progress::int ELSE NULL END,
              0
            ) AS progress
          FROM users
          ORDER BY id
        `);
        return res.json(simple.rows);
      } catch (err3) {
        if (err3 && err3.code === '42703') {
          const simpleAlt = await pool.query(`
            SELECT 
              id,
              COALESCE(first_name, '') AS first_name,
              COALESCE(last_name, '') AS last_name,
              email,
              COALESCE(courses_opted::text, 'No Course') AS course_opted,
              COALESCE(
                CASE WHEN (progress::text) ~ '^[0-9]+$' THEN progress::int ELSE NULL END,
                0
              ) AS progress
            FROM users
            ORDER BY id
          `);
          return res.json(simpleAlt.rows);
        }
        throw err3;
      }
    }
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

// ==================== COURSE ROUTES ====================

// Get all courses
app.get('/api/admin/courses', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM courses ORDER BY id');
    
    // Get videos and quizzes for each course
    const coursesWithContent = await Promise.all(
      result.rows.map(async (course) => {
        let videosRows = [];
        let quizzesRows = [];
        try {
          const videos = await pool.query('SELECT * FROM videos WHERE course_id = $1', [course.id]);
          videosRows = videos.rows || [];
        } catch (e) {
          videosRows = [];
        }
        try {
          const quizzes = await pool.query('SELECT * FROM quizzes WHERE course_id = $1', [course.id]);
          quizzesRows = quizzes.rows || [];
        } catch (e) {
          quizzesRows = [];
        }
        
        // Normalize course object to always include a 'name' property for frontend
        const normalized = {
          id: course.id,
          name: course.course_title || course.name || '',
          description: course.description || '',
          videos: videosRows,
          quizzes: quizzesRows
        };
        return normalized;
      })
    );

    res.json(coursesWithContent);
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== COURSE VIDEO (courses_vedio) ROUTES ====================

// Fetch videos by course_title
app.get('/api/admin/course-videos', authenticateToken, async (req, res) => {
  try {
    const { course_title } = req.query || {};
    const title = (course_title || '').trim();
    if (!title) return res.status(400).json({ error: 'course_title is required' });

    try {
      const result = await pool.query(
        'SELECT id, course_vedio_title, vedio_url, description, course_title, created_at FROM courses_vedio WHERE course_title = $1 ORDER BY id',
        [title]
      );
      res.json(result.rows || []);
    } catch (err) {
      if (err && err.code === '42703') {
        const result = await pool.query(
          'SELECT id, course_vedio_title, vedio_url, description, course_title FROM courses_vedio WHERE course_title = $1 ORDER BY id',
          [title]
        );
        const rows = (result.rows || []).map(r => ({ ...r, created_at: null }));
        return res.json(rows);
      }
      throw err;
    }
  } catch (error) {
    console.error('Get course videos error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add a video to courses_vedio
app.post('/api/admin/course-videos', authenticateToken, async (req, res) => {
  try {
    const { course_vedio_title, vedio_url, description, course_title } = req.body || {};
    const title = (course_vedio_title || '').trim();
    const url = (vedio_url || '').trim();
    const courseTitle = (course_title || '').trim();
    if (!title || !url || !courseTitle) {
      return res.status(400).json({ error: 'course_vedio_title, vedio_url and course_title are required' });
    }

    try {
      const result = await pool.query(
        'INSERT INTO courses_vedio (course_vedio_title, vedio_url, description, course_title) VALUES ($1, $2, $3, $4) RETURNING id, course_vedio_title, vedio_url, description, course_title, created_at',
        [title, url, description || '', courseTitle]
      );
      return res.json({ message: 'Video added successfully', video: result.rows[0] });
    } catch (err) {
      if (err && err.code === '42703') {
        const result = await pool.query(
          'INSERT INTO courses_vedio (course_vedio_title, vedio_url, description, course_title) VALUES ($1, $2, $3, $4) RETURNING id, course_vedio_title, vedio_url, description, course_title',
          [title, url, description || '', courseTitle]
        );
        const row = result.rows[0];
        return res.json({ message: 'Video added successfully', video: { ...row, created_at: null } });
      }
      throw err;
    }
  } catch (error) {
    console.error('Add course video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update a video in courses_vedio by id
app.put('/api/admin/course-videos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { course_vedio_title, vedio_url, description } = req.body || {};
    const title = (course_vedio_title || '').trim();
    const url = (vedio_url || '').trim();
    if (!title || !url) {
      return res.status(400).json({ error: 'course_vedio_title and vedio_url are required' });
    }
    let result;
    try {
      result = await pool.query(
        'UPDATE courses_vedio SET course_vedio_title = $1, vedio_url = $2, description = $3 WHERE id = $4 RETURNING id, course_vedio_title, vedio_url, description, course_title, created_at',
        [title, url, description || '', id]
      );
    } catch (err) {
      if (err && err.code === '42703') {
        result = await pool.query(
          'UPDATE courses_vedio SET course_vedio_title = $1, vedio_url = $2, description = $3 WHERE id = $4 RETURNING id, course_vedio_title, vedio_url, description, course_title',
          [title, url, description || '', id]
        );
        const row = result.rows[0];
        return res.json({ message: 'Video updated successfully', video: { ...row, created_at: null } });
      }
      throw err;
    }
    if (result.rows.length === 0) return res.status(404).json({ error: 'Video not found' });
    return res.json({ message: 'Video updated successfully', video: result.rows[0] });
  } catch (error) {
    console.error('Update course video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete a video from courses_vedio by id
app.delete('/api/admin/course-videos/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM courses_vedio WHERE id = $1', [id]);
    return res.json({ message: 'Video deleted successfully' });
  } catch (error) {
    console.error('Delete course video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add course
app.post('/api/admin/courses', authenticateToken, async (req, res) => {
  const { name, course_title, description } = req.body;

  try {
    const title = (course_title ?? name ?? '').trim();
    if (!title) {
      return res.status(400).json({ error: 'Course title is required' });
    }
    let saved;
    try {
      const result = await pool.query(
        'INSERT INTO courses (course_title, description) VALUES ($1, $2) RETURNING id, course_title, description',
        [title, description || '']
      );
      saved = result.rows[0];
    } catch (err) {
      // If description column doesn't exist on legacy DB, fallback to inserting only course_title
      if (err && err.code === '42703') {
        const result = await pool.query(
          'INSERT INTO courses (course_title) VALUES ($1) RETURNING id, course_title',
          [title]
        );
        saved = { id: result.rows[0].id, course_title: result.rows[0].course_title, description: '' };
      } else {
        throw err;
      }
    }

    const course = {
      id: saved.id,
      name: saved.course_title,
      description: saved.description || '',
      videos: [],
      quizzes: []
    };

    res.json({ message: 'Course added successfully', course });
  } catch (error) {
    console.error('Add course error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete course
app.delete('/api/admin/courses/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    await pool.query('DELETE FROM courses WHERE id = $1', [id]);
    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add video to course
app.post('/api/admin/courses/:id/videos', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, description, video_url } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO videos (course_id, title, description, video_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [id, title, description, video_url || '']
    );

    res.json({ message: 'Video added successfully', video: result.rows[0] });
  } catch (error) {
    console.error('Add video error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add quiz to course
app.post('/api/admin/courses/:id/quizzes', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { title, question, optionA, optionB, optionC, optionD, correctAnswer } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO quizzes (course_id, title, question, option_a, option_b, option_c, option_d, correct_answer) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [id, title, question, optionA, optionB, optionC, optionD, correctAnswer]
    );

    res.json({ message: 'Quiz added successfully', quiz: result.rows[0] });
  } catch (error) {
    console.error('Add quiz error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== STAFF ROUTES ====================

// Get all staff (from admins with role='Staff')
app.get('/api/admin/staff', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query("SELECT id, name, email, phone FROM admins WHERE role = 'Staff' ORDER BY id");
    res.json(result.rows);
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add staff (insert into admins with role='Staff')
app.post('/api/admin/staff', authenticateToken, async (req, res) => {
  const { name, email, password, phone } = req.body;

  try {
    const result = await pool.query(
      "INSERT INTO admins (name, email, password, phone, role) VALUES ($1, $2, $3, $4, 'Staff') RETURNING id, name, email, phone",
      [name, email, password, phone]
    );

    res.json({ message: 'Staff added successfully', staff: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Add staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update staff (in admins where role='Staff')
app.put('/api/admin/staff/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, email, password, phone } = req.body;

  try {
    let query;
    let values;

    if (password) {
      // Store password as provided (no hashing per request)
      query = "UPDATE admins SET name = $1, email = $2, password = $3, phone = $4 WHERE id = $5 AND role = 'Staff' RETURNING id, name, email, phone";
      values = [name, email, password, phone, id];
    } else {
      query = "UPDATE admins SET name = $1, email = $2, phone = $3 WHERE id = $4 AND role = 'Staff' RETURNING id, name, email, phone";
      values = [name, email, phone, id];
    }

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Staff not found' });
    }

    res.json({ message: 'Staff updated successfully', staff: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Email already exists' });
    }
    console.error('Update staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete staff (from admins where role='Staff')
app.delete('/api/admin/staff', authenticateToken, async (req, res) => {
  const { ids } = req.body; // Array of staff IDs to delete

  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No staff IDs provided' });
    }

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const query = `DELETE FROM admins WHERE role = 'Staff' AND id IN (${placeholders})`;
    
    await pool.query(query, ids);
    res.json({ message: 'Staff deleted successfully' });
  } catch (error) {
    console.error('Delete staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== START SERVER ====================

app.listen(PORT, () => {
  console.log(`Admin Server running on http://localhost:${PORT}`);
});
