const request = require('supertest');
const app = require('../../src/app');
const { pool } = require('../../src/db/pool');

let dbReady = false;
const TZ = process.env.TILES_TEST_Z;
const TX = process.env.TILES_TEST_X;
const TY = process.env.TILES_TEST_Y;

describe('Tiles non-empty (optional)', () => {
  beforeAll(async () => {
    try { await pool.query('SELECT 1'); dbReady = true; } catch {}
  });

  const maybe = (dbReady && TZ != null && TX != null && TY != null) ? test : test.skip;

  function asBuffer(req) {
    return req
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', c => chunks.push(Buffer.from(c)));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
  }

  maybe('returns a non-empty vector tile for configured z/x/y', async () => {
    const z = Number(TZ), x = Number(TX), y = Number(TY);
    const res = await asBuffer(request(app).get(`/tiles/${z}/${x}/${y}.mvt`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.mapbox-vector-tile');
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

