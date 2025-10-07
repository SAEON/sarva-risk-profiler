const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

let dbReady = false;
const IND = process.env.CHORO_TEST_INDICATOR;
const PER = process.env.CHORO_TEST_PERIOD;
const BBOX = process.env.CHORO_TEST_BBOX || '-180,-90,180,90';

describe('Choropleth data presence (optional)', () => {
  beforeAll(async () => {
    try { await pool.query('SELECT 1'); dbReady = true; } catch {}
  });

  const maybe = (dbReady && IND && PER) ? test : test.skip;

  maybe('returns non-empty items and numeric stats for known indicator/period', async () => {
    const res = await request(app)
      .get(`/choropleth/indicator/${encodeURIComponent(IND)}`)
      .query({ period: PER, bbox: BBOX });
    expect(res.status).toBe(200);
    expect((res.headers['cache-control'] || '').toLowerCase()).toContain('no-store');

    const b = res.body;
    expect(Array.isArray(b.items)).toBe(true);
    expect(b.items.length).toBeGreaterThan(0);

    // Stats should be numeric when data exists
    ['vmin','vmax','gvmin','gvmax'].forEach(k => {
      expect(typeof b[k]).toBe('number');
      expect(Number.isFinite(b[k])).toBe(true);
    });
    // gposmin may be null if no positive values
    if (b.gposmin != null) {
      expect(typeof b.gposmin).toBe('number');
      expect(Number.isFinite(b.gposmin)).toBe(true);
    }

    // Basic shape of an item
    const item = b.items[0];
    expect(item).toHaveProperty('code');
    expect(typeof item.code).toBe('string');
    // value can be number or null; ensure at least one non-null exists across items
    const hasValue = b.items.some(it => it.value != null);
    expect(hasValue).toBe(true);
  });
});

