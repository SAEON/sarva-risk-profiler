const request = require('supertest');

// Use the real app and DB connection from .env.test
const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

const enforceIntegration = /^(1|true|yes)$/i.test(process.env.RUN_INTEGRATION || '');
let dbReady = false;

describe('Catalog endpoints (integration)', () => {
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch (e) {
      // Skip tests if DB is not reachable; integration depends on test DB
      console.warn('Skipping catalog integration tests: DB not reachable ->', e.message);
    }
  });

  // Do not end the shared pool here; other suites reuse it.

  const maybe = dbReady ? test : (enforceIntegration ? test : test.skip);

  maybe('GET /catalog/periods returns list of periods', async () => {
    const res = await request(app).get('/catalog/periods');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length) {
      const item = res.body[0];
      expect(item).toHaveProperty('period');
      expect(item).toHaveProperty('label');
      // period should be a string per controller
      expect(typeof item.period).toBe('string');
      // sanity: if multiple items, ensure non-increasing (desc) order
      if (res.body.length >= 2) {
        const p0 = Number(res.body[0].period);
        const p1 = Number(res.body[1].period);
        if (Number.isFinite(p0) && Number.isFinite(p1)) {
          expect(p0).toBeGreaterThanOrEqual(p1);
        }
      }
    }
  });

  maybe('GET /catalog/themes returns array of strings', async () => {
    const res = await request(app).get('/catalog/themes');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length) {
      expect(typeof res.body[0]).toBe('string');
    }
  });

  maybe('GET /catalog/themes with filters still 200', async () => {
    const res = await request(app).get('/catalog/themes').query({ kind: 'indicator', period: '2020' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  maybe('GET /catalog/indicators returns indicator objects', async () => {
    const res = await request(app).get('/catalog/indicators');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    if (res.body.length) {
      const item = res.body[0];
      // Expected fields from SELECT clause
      ['key','label','category','unit','polarity','description','theme','measure_type'].forEach(f => {
        expect(item).toHaveProperty(f);
      });
    }
  });

  maybe('GET /catalog/indicators filtered returns 200', async () => {
    const res = await request(app).get('/catalog/indicators').query({ kind: 'indicator', theme: 'Safety', period: '2020' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  maybe('GET /catalog/municipalities returns objects with bbox', async () => {
    const res = await request(app).get('/catalog/municipalities');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // Cache header is set in controller
    expect(res.headers['cache-control']).toBeDefined();
    if (res.body.length) {
      const m = res.body[0];
      expect(m).toHaveProperty('code');
      expect(m).toHaveProperty('name');
      expect(Array.isArray(m.bbox)).toBe(true);
      expect(m.bbox.length).toBe(4);
      m.bbox.forEach(v => expect(typeof v).toBe('number'));
    }
  });
});
