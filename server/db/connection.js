const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' || process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

module.exports = pool;
