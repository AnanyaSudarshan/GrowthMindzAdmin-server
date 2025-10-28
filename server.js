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
  const { email, password, role } = req.body;

  try {
    // Validate input
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if admin/staff exists
    let result;
    if (role === 'Admin') {
      result = await pool.query('SELECT * FROM "Admin" WHERE email = $1', [email]);
    } else {
      result = await pool.query('SELECT * FROM staff WHERE email = $1', [email]);
    }

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

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

// ==================== DASHBOARD ROUTES ====================

// Get dashboard statistics
app.get('/api/admin/dashboard/stats', authenticateToken, async (req, res) => {
  try {
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');
    const coursesCount = await pool.query('SELECT COUNT(*) FROM courses');
    const staffCount = await pool.query('SELECT COUNT(*) FROM staff');

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
        u.firstname || ' ' || u.lastname as name,
        u.email,
        c.name as course,
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
    res.status(500).json({ error: 'Server error' });
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

// Get all staff
app.get('/api/admin/staff', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, name, email, phone FROM staff ORDER BY id');
    res.json(result.rows);
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add staff
app.post('/api/admin/staff', authenticateToken, async (req, res) => {
  const { name, email, password, phone } = req.body;

  try {
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO staff (name, email, password, phone) VALUES ($1, $2, $3, $4) RETURNING id, name, email, phone',
      [name, email, hashedPassword, phone]
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

// Update staff
app.put('/api/admin/staff/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, email, password, phone } = req.body;

  try {
    let query;
    let values;

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      query = 'UPDATE staff SET name = $1, email = $2, password = $3, phone = $4 WHERE id = $5 RETURNING id, name, email, phone';
      values = [name, email, hashedPassword, phone, id];
    } else {
      query = 'UPDATE staff SET name = $1, email = $2, phone = $3 WHERE id = $4 RETURNING id, name, email, phone';
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

// Delete staff
app.delete('/api/admin/staff', authenticateToken, async (req, res) => {
  const { ids } = req.body; // Array of staff IDs to delete

  try {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No staff IDs provided' });
    }

    const placeholders = ids.map((_, index) => `$${index + 1}`).join(',');
    const query = `DELETE FROM staff WHERE id IN (${placeholders})`;
    
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
