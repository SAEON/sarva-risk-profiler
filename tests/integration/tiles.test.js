const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

const enforceIntegration = /^(1|true|yes)$/i.test(process.env.RUN_INTEGRATION || '');
let dbReady = false;

describe('Tiles endpoints (integration)', () => {
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch (e) {
      console.warn('Skipping tiles integration tests: DB not reachable ->', e.message);
    }
  });

  const maybe = dbReady ? test : (enforceIntegration ? test : test.skip);

  function asBuffer(req) {
    return req
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
  }

  maybe('GET /tiles/0/0/0.mvt returns MVT with proper headers', async () => {
    const req = request(app).get('/tiles/0/0/0.mvt');
    const res = await asBuffer(req);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.mapbox-vector-tile');
    const cc = String(res.headers['cache-control'] || '').toLowerCase();
    expect(cc).toContain('public');
    expect(cc).toContain('max-age=3600');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    // Body may be empty if no data; just assert it is a Buffer
  });
});

