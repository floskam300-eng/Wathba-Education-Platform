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
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
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
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
        query_timeout: 30_000,
        statement_timeout: 30_000,
      }
);

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err);
});

// Suppress PostgreSQL NOTICE messages (e.g. "index already exists, skipping")
// that pg v8 logs to stderr by default during schema/migration runs.
pool.on('connect', (client) => {
  client.on('notice', () => {});
});

module.exports = pool;
