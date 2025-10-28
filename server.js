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
    const result = await pool.query(`
      SELECT 
        u.id,
        COALESCE(u.first_name || ' ' || u.last_name, u.firstname || ' ' || u.lastname, 'Unknown') as name,
        u.email,
        COALESCE(c.name, 'No Course') as course,
        COALESCE(
          (SELECT ROUND(AVG(progress)) 
           FROM user_progress 
           WHERE user_id = u.id AND course_id = c.id), 0
        ) as progress
      FROM users u
      LEFT JOIN user_enrollments ue ON u.id = ue.user_id
      LEFT JOIN courses c ON ue.course_id = c.id
      ORDER BY u.id
    `);

    res.json(result.rows);
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
        const videos = await pool.query('SELECT * FROM videos WHERE course_id = $1', [course.id]);
        const quizzes = await pool.query('SELECT * FROM quizzes WHERE course_id = $1', [course.id]);
        
        return {
          ...course,
          videos: videos.rows,
          quizzes: quizzes.rows
        };
      })
    );

    res.json(coursesWithContent);
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add course
app.post('/api/admin/courses', authenticateToken, async (req, res) => {
  const { name, description } = req.body;

  try {
    const result = await pool.query(
      'INSERT INTO courses (name, description) VALUES ($1, $2) RETURNING *',
      [name, description || '']
    );

    res.json({ message: 'Course added successfully', course: result.rows[0] });
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
