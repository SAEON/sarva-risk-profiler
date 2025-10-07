const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

const enforceIntegration = /^(1|true|yes)$/i.test(process.env.RUN_INTEGRATION || '');
let dbReady = false;

describe('Search endpoints (integration)', () => {
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch (e) {
      console.warn('Skipping search integration tests: DB not reachable ->', e.message);
    }
  });

  // Do not end the shared pool here; other suites reuse it.

  const maybe = dbReady ? test : (enforceIntegration ? test : test.skip);

  maybe('GET /search/municipalities with empty q returns []', async () => {
    const res = await request(app).get('/search/municipalities');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(0);
    // no-store header
    expect((res.headers['cache-control'] || '').toLowerCase()).toContain('no-store');
  });

  maybe('GET /search/municipalities with q returns objects and bbox when present', async () => {
    const res = await request(app).get('/search/municipalities').query({ q: 'a' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // If there are results, validate structure
    if (res.body.length) {
      const m = res.body[0];
      expect(typeof m.code).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(Array.isArray(m.bbox)).toBe(true);
      expect(m.bbox.length).toBe(4);
      m.bbox.forEach(v => expect(typeof v).toBe('number'));
      // Header should be no-store
      expect((res.headers['cache-control'] || '').toLowerCase()).toContain('no-store');
    }
  });
});
