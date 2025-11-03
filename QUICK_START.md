# Quick Start Guide

## Steps to Run and Test the Admin Server

### 1. Install Dependencies (if not already done)
```bash
cd GrowthMindzAdmin-server
npm install
```

### 2. Setup Database Tables and Admin Account
Run the complete setup script:
```bash
node complete-setup.js
```

This will:
- Create all necessary database tables
- Create the admin account with credentials

### 3. Start the Server
```bash
npm start
```

You should see:
```
Connected to PostgreSQL database
Admin Server running on http://localhost:5001
```

### 4. Test the API

#### Option A: Using cURL (Command Line)

**Test Login:**
```bash
curl -X POST http://localhost:5001/api/admin/login \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@growthmindz.com\",\"password\":\"admin@1234\",\"role\":\"Admin\"}"
```

**Expected Response:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Admin User",
    "email": "admin@growthmindz.com",
    "role": "Admin"
  }
}
```

#### Option B: Using Postman

1. Open Postman
2. Create a new POST request to: `http://localhost:5001/api/admin/login`
3. In the Headers tab, add: `Content-Type: application/json`
4. In the Body tab, select "raw" and "JSON"
5. Enter:
```json
{
  "email": "admin@growthmindz.com",
  "password": "admin@1234",
  "role": "Admin"
}
```
6. Click Send

#### Option C: Using Browser or any HTTP client

Since this is a POST request, you'll need to use a tool like Postman, Thunder Client (VS Code extension), or the browser's developer console.

**Browser Console Test:**
Open browser console and run:
```javascript
fetch('http://localhost:5001/api/admin/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'admin@growthmindz.com',
    password: 'admin@1234',
    role: 'Admin'
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

### 5. Test Other Endpoints

After getting the token from login, you can test other endpoints:

**Get Dashboard Stats:**
```bash
curl -X GET http://localhost:5001/api/admin/dashboard/stats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Get All Users:**
```bash
curl -X GET http://localhost:5001/api/admin/users \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

**Get All Staff:**
```bash
curl -X GET http://localhost:5001/api/admin/staff \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

### Default Admin Credentials
- **Email:** admin@growthmindz.com
- **Password:** admin@1234
- **Role:** Admin

### Troubleshooting

**If database connection fails:**
- Make sure PostgreSQL is running
- Check database credentials in `db.js`
- Make sure the database `grw_db` exists

**If port 5001 is already in use:**
- Change the PORT in `server.js`
- Or stop the process using port 5001

**Common Issues:**
- "Error connecting to database" - PostgreSQL not running
- "Invalid email or password" - Run `node complete-setup.js` again
- "JWT secret is required" - Already fixed in the code
