require('dotenv').config();

const PORT = Number(process.env.PORT || 4001);
const HOST = process.env.HOST || 'localhost';
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:3000')
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
