-- Admin Portal Database Schema
-- This schema extends the existing GrowthMindz database
-- Admins table
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'Admin',
    phone VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Staff table (extends existing staff table if it exists)
-- Deprecated: staff table no longer required; use admins with role='Staff'
-- Videos table (extends existing videos table if it exists)
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    video_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Quizzes table (extends existing quizzes table if it exists)
CREATE TABLE IF NOT EXISTS quizzes (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    question TEXT NOT NULL,
    option_a VARCHAR(255) NOT NULL,
    option_b VARCHAR(255) NOT NULL,
    option_c VARCHAR(255) NOT NULL,
    option_d VARCHAR(255) NOT NULL,
    correct_answer VARCHAR(1) NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- User progress table (extends existing user_progress table if it exists)
CREATE TABLE IF NOT EXISTS user_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    progress INTEGER DEFAULT 0 CHECK (
        progress >= 0
        AND progress <= 100
    ),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Insert default admin account (password: admin@1234)
-- Password is hashed using bcrypt
INSERT INTO admins (name, email, password, phone)
VALUES (
        'Admin User',
        'admin@growthmindz.com',
        '$2a$10$YourHashedPasswordHere',
        '+1 234-567-8900'
    ) ON CONFLICT (email) DO NOTHING;
-- Note: Replace '$2a$10$YourHashedPasswordHere' with actual bcrypt hash
-- You can generate it using bcrypt.hash('admin@1234', 10)