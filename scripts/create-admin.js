require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../server/db/connection');

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node scripts/create-admin.js <username> <password> [name]');
    process.exit(1);
  }
  const username = args[0].trim().toLowerCase();
  const password = args[1];
  const name = args[2] || 'Platform Admin';

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO platform_admins (username, password_hash, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO UPDATE SET password_hash = $2, name = $3',
      [username, hash, name, 'super_admin']
    );
    console.log(`✅ Admin account '${username}' created/updated successfully!`);
    process.exit(0);
  } catch (err) {
    console.error('Error creating admin account:', err.message);
    process.exit(1);
  }
}
main();
