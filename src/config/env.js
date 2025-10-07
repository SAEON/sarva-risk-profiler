const path = require('path');

// Load environment variables with support for a dedicated test env file.
// Priority:
// 1) DOTENV_CONFIG_PATH if provided
// 2) .env.test when NODE_ENV === 'test'
// 3) default .env
const dotenv = require('dotenv');
const dotenvPath = process.env.DOTENV_CONFIG_PATH
  || (process.env.NODE_ENV === 'test' ? path.resolve(process.cwd(), '.env.test') : undefined);

if (dotenvPath) {
  dotenv.config({ path: dotenvPath });
} else {
  dotenv.config();
}

const PORT = Number(process.env.PORT || 4001);
const HOST = process.env.HOST || 'localhost';
// Treat empty string as intentional empty allowlist (=> wildcard in app layer),
// but use dev default when variable is truly undefined.
const rawCors = Object.prototype.hasOwnProperty.call(process.env, 'CORS_ORIGIN')
  ? process.env.CORS_ORIGIN
  : 'http://localhost:3000';
const CORS_ORIGIN = String(rawCors)
  .split(',').map(s => s.trim()).filter(Boolean);

module.exports = {
  PORT,
  HOST,
  CORS_ORIGIN,
  pg: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 10,
    idleTimeoutMillis: 30000,
  }
};
