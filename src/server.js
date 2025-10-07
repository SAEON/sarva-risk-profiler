const app = require('./app');
const { PORT, HOST } = require('./config/env');
const { pool } = require('./db/pool');

const server = app.listen(PORT, () => {
  console.log(`API listening on http://${HOST}:${PORT}`);
});

pool.query('SELECT 1').catch(err => {
  console.error('DB connection check failed:', err.message);
});

function shutdown() {
  console.log('Shutting down...');
  server.close(async () => {
    try { await pool.end(); } catch {}
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
