const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

const enforceIntegration = /^(1|true|yes)$/i.test(process.env.RUN_INTEGRATION || '');
let dbReady = false;

describe('Choropleth endpoints (integration)', () => {
  beforeAll(async () => {
    try {
      await pool.query('SELECT 1');
      dbReady = true;
    } catch (e) {
      console.warn('Skipping choropleth DB-backed tests: DB not reachable ->', e.message);
    }
  });

  // Validation tests (do not require DB)
  test('GET /choropleth/indicator/:key without period returns 400', async () => {
    const res = await request(app)
      .get('/choropleth/indicator/test')
      .query({ bbox: '-180,-90,180,90' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /choropleth/indicator/:key without bbox returns 400', async () => {
    const res = await request(app)
      .get('/choropleth/indicator/test')
      .query({ period: '2020' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  test('GET /choropleth/indicator/:key with invalid bbox returns 400', async () => {
    const res = await request(app)
      .get('/choropleth/indicator/test')
      .query({ period: '2020', bbox: '1,2,3,foo' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  // DB-backed tests (shape assertions)
  const maybe = dbReady ? test : (enforceIntegration ? test : test.skip);

  maybe('GET /choropleth/indicator/:key returns shape with defaults', async () => {
    // Use an existing period from catalog if available
    const periods = await request(app).get('/catalog/periods');
    expect(periods.status).toBe(200);
    const period = periods.body[0]?.period || '2000';

    const res = await request(app)
      .get('/choropleth/indicator/nonexistent_key')
      .query({ period, bbox: '-180,-90,180,90' });

    expect(res.status).toBe(200);
    expect((res.headers['cache-control'] || '').toLowerCase()).toContain('no-store');
    const body = res.body;
    expect(body).toHaveProperty('indicator', 'nonexistent_key');
    expect(body).toHaveProperty('period');
    expect(body).toHaveProperty('scenario');
    expect(body).toHaveProperty('label');
    expect(body).toHaveProperty('unit');
    expect(body).toHaveProperty('polarity');
    expect(body).toHaveProperty('description');
    expect(body).toHaveProperty('source_name');
    expect(body).toHaveProperty('source_url');
    expect(Array.isArray(body.items)).toBe(true);
    // Stats may be null depending on data; just ensure keys exist
    ;['vmin','vmax','gvmin','gvmax','gposmin'].forEach(k => expect(k in body).toBe(true));
  });

  maybe('GET /choropleth/indicator/:key supports extent and scenario params', async () => {
    const periods = await request(app).get('/catalog/periods');
    expect(periods.status).toBe(200);
    const period = periods.body[0]?.period || '2000';

    const res = await request(app)
      .get('/choropleth/indicator/nonexistent_key')
      .query({ period, bbox: '-180,-90,180,90', extent: 'all_periods', scenario: 'unknown' });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});

