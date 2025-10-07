const { Pool } = require('pg');

const sslEnabled = (
  String(process.env.DB_SSL || '').toLowerCase() === 'true' ||
  String(process.env.PGSSLMODE || '').toLowerCase() === 'require' ||
  String(process.env.PGSSL || '').toLowerCase() === '1'
);
const ssl = sslEnabled ? { rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false' } : undefined;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl,
  max: 10,
  idleTimeoutMillis: 30000,
});

module.exports = { pool };
