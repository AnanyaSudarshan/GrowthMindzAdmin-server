# GrowthMindz Admin Server

Backend server for the GrowthMindz Admin Portal.

## Features

- Admin and Staff authentication
- JWT-based authentication
- Course management
- Video and quiz management
- User management
- Staff management
- Dashboard statistics

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment Variables**
   Create a `.env` file based on `.env.example`:
   ```bash
   cp .env.example .env
   ```
   
   Update the values in `.env` to match your PostgreSQL setup.

3. **Setup Database**
   ```bash
   psql -U postgres -d growthmindz -f schema.sql
   ```

4. **Start the Server**
   ```bash
   # Development mode (with auto-reload)
   npm run dev

   # Production mode
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/admin/login` - Admin/Staff login

### Dashboard
- `GET /api/admin/dashboard/stats` - Get dashboard statistics

### Users
- `GET /api/admin/users` - Get all users with progress

### Courses
- `GET /api/admin/courses` - Get all courses with videos and quizzes
- `POST /api/admin/courses` - Add a new course
- `DELETE /api/admin/courses/:id` - Delete a course
- `POST /api/admin/courses/:id/videos` - Add video to course
- `POST /api/admin/courses/:id/quizzes` - Add quiz to course

### Staff
- `GET /api/admin/staff` - Get all staff
- `POST /api/admin/staff` - Add new staff member
- `PUT /api/admin/staff/:id` - Update staff member
- `DELETE /api/admin/staff` - Delete staff members (bulk)

## Environment Variables

- `PORT` - Server port (default: 5001)
- `DB_HOST` - Database host
- `DB_PORT` - Database port
- `DB_NAME` - Database name
- `DB_USER` - Database user
- `DB_PASSWORD` - Database password
- `JWT_SECRET` - JWT secret key

## Technologies

- Node.js
- Express.js
- PostgreSQL
- JWT (JSON Web Tokens)
- bcrypt.js
