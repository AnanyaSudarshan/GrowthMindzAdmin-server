const bcrypt = require('bcryptjs');

// Generate password hash for admin
const password = 'admin@1234';
bcrypt.hash(password, 10, (err, hash) => {
  if (err) {
    console.error('Error generating hash:', err);
  } else {
    console.log('\n=== Admin Account Setup ===');
    console.log('Email: admin@growthmindz.com');
    console.log('Password: admin@1234');
    console.log('Hashed Password:', hash);
    console.log('\nUse this hash in the schema.sql file or insert directly into database.\n');
  }
});
