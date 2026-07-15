const { Pool } = require('pg');

// Use DATABASE_URL when it is a full postgresql:// connection string.
// Otherwise fall back to the individual PGHOST / PGUSER / PGPASSWORD /
// PGDATABASE / PGPORT env vars that Replit's managed-database runtime injects.
// This lets the server start correctly in both Replit dev (where DATABASE_URL
// may be a short internal reference) and external deployments (where a full
// connection string is provided).
const dbUrl = process.env.DATABASE_URL;
const useConnectionString = dbUrl && dbUrl.startsWith('postgresql');

const pool = new Pool(
  useConnectionString
    ? {
        connectionString: dbUrl,
        ssl:
          process.env.DATABASE_SSL === 'false' || dbUrl.includes('localhost')
            ? false
            : { rejectUnauthorized: false },
        query_timeout: 30_000,
        statement_timeout: 30_000,
      }
    : {
        host:     process.env.PGHOST     || 'localhost',
        port:     parseInt(process.env.PGPORT || '5432', 10),
        user:     process.env.PGUSER     || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'postgres',
        ssl: false,
        query_timeout: 30_000,
        statement_timeout: 30_000,
      }
);

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

module.exports = pool;
